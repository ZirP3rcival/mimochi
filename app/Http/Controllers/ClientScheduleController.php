<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\Bundle;
use App\Models\Client;
use App\Models\ClientBundleSchedule;
use App\Models\ClientBundleScheduleItem;
use App\Models\ClientItemSchedule;
use App\Models\ClientPackageRecord;
use App\Models\ClientPackageSession;
use App\Models\Package;
use App\Models\SaleItem;
use App\Models\Staff;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Client scheduling module.
 *
 * Two phases:
 *  1. BOOK   - POST /clients/{client}/schedules picks items / bundles /
 *              packages. Nothing is dated yet: every row starts "pending".
 *  2. ASSIGN - PATCH a single item, bundle line or package session to give
 *              it a date, time and staff, then mark it done. Status follows:
 *              pending -> ongoing (date+time+staff set) -> done -> paid.
 *  3. PAY    - a Done item, bundle or package card can be paid. That sets
 *              status = 'paid' and stamps done_at with the payment time.
 *              Paid records are locked.
 */
class ClientScheduleController extends Controller
{
    /**
     * Every package card shows this many session columns (1st .. 5th).
     */
    private const PACKAGE_SESSION_COLUMNS = 5;

    /**
     * Everything booked for a client.
     *
     * GET /clients/{client}/schedules
     * -> { items: [...], bundles: [{..., lines: [...]}], packages: [{..., sessions: [...]}] }
     */
    public function index(Client $client)
    {
        return response()->json($this->bookings($client));
    }

    /**
     * Staff to pick from when assigning (id + name only).
     *
     * GET /schedule-staff
     */
    public function staffOptions()
    {
        $staff = new Staff;
        $query = Staff::query()->orderBy('staff_name');

        if (Schema::hasColumn($staff->getTable(), 'status')) {
            $query->where('status', 'active');
        }

        return response()->json([
            'staff' => $query->get()->map(fn ($s) => [
                'id'         => $s->getKey(),
                'staff_name' => $s->staff_name,
            ])->values(),
        ]);
    }

    /**
     * Book items, bundles and/or packages for a client. No date/time/staff.
     *
     * POST /clients/{client}/schedules
     * body: { items: [{ type: 'item'|'bundle'|'package', id: number }, ...] }
     */
    public function store(Request $request, Client $client)
    {
        $validated = $request->validate([
            'items'        => 'required|array|min:1',
            'items.*.type' => 'required|string|in:item,bundle,package',
            'items.*.id'   => 'required|integer',
        ]);

        // Resolve every selection first so a stale or deactivated record
        // 422s before anything is written.
        $resolved = [];

        foreach ($validated['items'] as $index => $entry) {
            $record = match ($entry['type']) {
                'item'    => SaleItem::find($entry['id']),
                'bundle'  => Bundle::with('items')->find($entry['id']),
                'package' => Package::find($entry['id']),
            };

            if (! $record) {
                throw ValidationException::withMessages([
                    "items.{$index}.id" => "The selected {$entry['type']} no longer exists.",
                ]);
            }

            if ($record->status !== 'active') {
                throw ValidationException::withMessages([
                    "items.{$index}.id" => "\"{$this->recordLabel($entry['type'], $record)}\" is no longer active and can't be scheduled.",
                ]);
            }

            $resolved[] = [$entry['type'], $record];
        }

        DB::transaction(function () use ($client, $resolved) {
            foreach ($resolved as [$type, $record]) {
                match ($type) {
                    'item'    => $this->bookItem($client, $record),
                    'bundle'  => $this->bookBundle($client, $record),
                    'package' => $this->bookPackage($client, $record),
                };
            }
        });

        if ($request->wantsJson()) {
            return response()->json([
                'message'  => 'Services saved. Date, time and staff can be assigned from the service record.',
                'bookings' => $this->bookings($client),
            ], 201);
        }

        return redirect()->back()->with('success', 'Services saved successfully.');
    }

    /**
     * Assign / edit / complete one individually booked item.
     *
     * PATCH /clients/{client}/schedule-items/{itemSchedule}
     */
    public function updateItem(Request $request, Client $client, ClientItemSchedule $itemSchedule)
    {
        abort_unless($itemSchedule->client_id === $client->id, 404);

        $validated = $request->validate($this->assignmentRules() + ['paid' => 'sometimes|boolean']);

        if (! empty($validated['paid'])) {
            $this->markPaid($itemSchedule);

            return $this->updated($client);
        }

        $this->applyAssignment($itemSchedule, $validated);

        return $this->updated($client);
    }

    /**
     * Assign / edit / complete one item inside a booked bundle.
     *
     * PATCH /clients/{client}/bundle-schedule-lines/{bundleLine}
     */
    public function updateBundleLine(Request $request, Client $client, ClientBundleScheduleItem $bundleLine)
    {
        $bundle = $bundleLine->bundleSchedule;
        abort_unless($bundle && $bundle->client_id === $client->id, 404);

        $this->applyAssignment($bundleLine, $request->validate($this->assignmentRules()));
        $this->rollUpStatus($bundle, $bundle->lines()->get());

        return $this->updated($client);
    }

    /**
     * Assign / edit / sign / complete one session of a package card,
     * including sessions in the "Free" row.
     *
     * PATCH /clients/{client}/package-sessions/{packageSession}
     */
    public function updatePackageSession(Request $request, Client $client, ClientPackageSession $packageSession)
    {
        $record = $packageSession->record;
        abort_unless($record && $record->client_id === $client->id, 404);

        $validated = $request->validate($this->assignmentRules() + [
            'signed'     => 'sometimes|boolean',
            'free_label' => 'nullable|string|max:255',
        ]);

        if (array_key_exists('signed', $validated)) {
            $packageSession->signed_at = $validated['signed'] ? ($packageSession->signed_at ?? now()) : null;
        }

        if ($packageSession->is_free && array_key_exists('free_label', $validated)) {
            $packageSession->free_label = $validated['free_label'];
        }

        $this->applyAssignment($packageSession, $validated);
        $this->rollUpStatus($record, $record->sessions()->where('is_free', false)->get());

        return $this->updated($client);
    }

    /**
     * Add the next session column (and its optional free slot) to a package card.
     *
     * POST /clients/{client}/package-records/{packageRecord}/sessions
     */
    public function addPackageSession(Request $request, Client $client, ClientPackageRecord $packageRecord)
    {
        abort_unless($packageRecord->client_id === $client->id, 404);

        if ($packageRecord->status === 'paid') {
            throw ValidationException::withMessages(['sessions' => 'This package has been paid and can no longer be changed.']);
        }

        $next = (int) $packageRecord->sessions()->where('is_free', false)->max('sequence') + 1;

        if ($next > 50) {
            throw ValidationException::withMessages(['sessions' => 'A package card can have at most 50 sessions.']);
        }

        DB::transaction(function () use ($packageRecord, $next) {
            $this->createSessionSlot($packageRecord, $next);
            $packageRecord->session_count = $next;
            $packageRecord->save();
            $this->rollUpStatus($packageRecord, $packageRecord->sessions()->where('is_free', false)->get());
        });

        return $this->updated($client);
    }

    /**
     * Pay a completed bundle: the bundle and all of its lines become 'paid'.
     * The payment time is stored in the bundle's done_at; each line keeps
     * its own completion time.
     *
     * PATCH /clients/{client}/bundle-schedules/{bundleSchedule}/pay
     */
    public function payBundle(Client $client, ClientBundleSchedule $bundleSchedule)
    {
        abort_unless($bundleSchedule->client_id === $client->id, 404);

        $this->assertPayable($bundleSchedule, 'bundle');

        DB::transaction(function () use ($bundleSchedule) {
            foreach ($bundleSchedule->lines()->get() as $line) {
                $line->forceFill(['status' => 'paid'])->saveQuietly();
            }

            $bundleSchedule->forceFill(['status' => 'paid', 'done_at' => now()])->saveQuietly();
        });

        return $this->updated($client);
    }

    /**
     * Pay a completed package card: the card and its paid sessions become
     * 'paid'. The payment time is stored in the card's done_at. Free
     * sessions are complimentary and are left as they are.
     *
     * PATCH /clients/{client}/package-records/{packageRecord}/pay
     */
    public function payPackage(Client $client, ClientPackageRecord $packageRecord)
    {
        abort_unless($packageRecord->client_id === $client->id, 404);

        $this->assertPayable($packageRecord, 'package');

        DB::transaction(function () use ($packageRecord) {
            foreach ($packageRecord->sessions()->where('is_free', false)->get() as $session) {
                $session->forceFill(['status' => 'paid'])->saveQuietly();
            }

            $packageRecord->forceFill(['status' => 'paid', 'done_at' => now()])->saveQuietly();
        });

        return $this->updated($client);
    }

    /**
     * Remove a booking made by mistake. Blocked once any part of it is done.
     *
     * DELETE /clients/{client}/schedules/{type}/{id}
     */
    public function destroy(Request $request, Client $client, string $type, int $id)
    {
        [$model, $doneCheck] = match ($type) {
            'item'    => [ClientItemSchedule::class, fn ($m) => in_array($m->status, ['done', 'paid'], true)],
            'bundle'  => [ClientBundleSchedule::class, fn ($m) => $m->status === 'paid' || $m->lines()->whereIn('status', ['done', 'paid'])->exists()],
            'package' => [ClientPackageRecord::class, fn ($m) => $m->status === 'paid' || $m->sessions()->whereIn('status', ['done', 'paid'])->exists()],
        };

        $record = $model::where('client_id', $client->id)->findOrFail($id);

        if ($doneCheck($record)) {
            throw ValidationException::withMessages([
                'schedule' => 'This booking already has completed work and can no longer be deleted.',
            ]);
        }

        $record->delete();

        return response()->json([
            'message'  => 'Booking removed.',
            'bookings' => $this->bookings($client),
        ]);
    }

    // ---------------------------------------------------------------
    // Booking helpers
    // ---------------------------------------------------------------

    private function bookItem(Client $client, SaleItem $item): void
    {
        ClientItemSchedule::create([
            'client_id'    => $client->id,
            'sale_item_id' => $item->id,
            'item_name'    => $item->itemname,
            'price'        => $item->price1,
            'commission'   => $item->commission,
        ]);
    }

    private function bookBundle(Client $client, Bundle $bundle): void
    {
        $schedule = ClientBundleSchedule::create([
            'client_id'    => $client->id,
            'bundle_id'    => $bundle->bundle_id,
            'bundle_name'  => $bundle->bundle_name,
            'bundle_price' => $bundle->bundle_price,
            'status'       => 'pending',
        ]);

        // Each sale item in the bundle becomes its own line so it can be
        // dated and staffed individually.
        foreach ($bundle->items as $item) {
            $schedule->lines()->create([
                'sale_item_id' => $item->id,
                'item_name'    => $item->itemname,
                'list_price'   => $item->price1,
                'commission'   => $item->commission,
            ]);
        }
    }

    private function bookPackage(Client $client, Package $package): void
    {
        $paid = self::PACKAGE_SESSION_COLUMNS;

        $record = ClientPackageRecord::create([
            'client_id'     => $client->id,
            'package_id'    => $package->package_id,
            'package_name'  => $package->package_name,
            'package_price' => $package->package_price,
            'session_count' => $paid,
            'status'        => 'pending',
        ]);

        for ($n = 1; $n <= $paid; $n++) {
            $this->createSessionSlot($record, $n);
        }
    }

    /**
     * One column of the paper card: the numbered session plus the optional
     * "Free" slot under it. The free slot stays empty unless it's used.
     */
    private function createSessionSlot(ClientPackageRecord $record, int $sequence): void
    {
        $record->sessions()->create(['sequence' => $sequence, 'is_free' => false]);
        $record->sessions()->create(['sequence' => $sequence, 'is_free' => true]);
    }

    // ---------------------------------------------------------------
    // Assignment helpers
    // ---------------------------------------------------------------

    private function assignmentRules(): array
    {
        $staff = new Staff;

        return [
            'scheduled_date' => 'nullable|date',
            'scheduled_time' => 'nullable|date_format:H:i,H:i:s',
            'staff_id'       => ['nullable', 'integer', Rule::exists($staff->getTable(), $staff->getKeyName())],
            'remarks'        => 'nullable|string|max:1000',
            'done'           => 'sometimes|boolean',
        ];
    }

    /**
     * Only fields present in the request are touched, so "mark done" can
     * send just { done: true }. Past dates are allowed on purpose, so
     * sessions already recorded on a paper card can be entered later.
     * The model's saving hook then derives pending / ongoing / done.
     */
    private function applyAssignment(Model $row, array $validated): void
    {
        // Paid records are final: no reassigning, reopening or editing.
        if ($row->status === 'paid') {
            throw ValidationException::withMessages([
                'paid' => 'This service has already been paid and can no longer be changed.',
            ]);
        }

        foreach (['scheduled_date', 'scheduled_time', 'staff_id', 'remarks'] as $field) {
            if (array_key_exists($field, $validated)) {
                $row->{$field} = $validated[$field];
            }
        }

        if (array_key_exists('done', $validated)) {
            if ($validated['done'] && ! $row->isAssigned()) {
                throw ValidationException::withMessages([
                    'done' => 'Assign a date, time and staff member before marking this as done.',
                ]);
            }

            $row->status = $validated['done'] ? 'done' : 'ongoing';
        }

        $row->save();
    }

    /**
     * Payment is only possible once the record is Done, and only once.
     */
    private function assertPayable(Model $record, string $label): void
    {
        if ($record->status === 'paid') {
            throw ValidationException::withMessages(['paid' => "This {$label} has already been paid."]);
        }

        if ($record->status !== 'done') {
            throw ValidationException::withMessages(['paid' => "Only a completed (Done) {$label} can be paid."]);
        }
    }

    /**
     * Pay a single item: status becomes 'paid' and done_at is set to the
     * payment date and time. Events are skipped so the model's progress
     * hook can't turn 'paid' back into pending / ongoing / done.
     */
    private function markPaid(Model $row): void
    {
        $this->assertPayable($row, 'service');

        $row->forceFill(['status' => 'paid', 'done_at' => now()])->saveQuietly();
    }

    /**
     * Parent status from its rows. Paid counts as finished work:
     * all paid -> paid, all done/paid -> done, any started -> ongoing.
     * A parent that is already paid stays paid.
     */
    private function rollUpStatus(Model $parent, $rows): void
    {
        if ($parent->status === 'paid') {
            return;
        }

        $statuses = $rows->pluck('status');

        $status = match (true) {
            $statuses->isEmpty()                                              => 'pending',
            $statuses->every(fn ($s) => $s === 'paid')                        => 'paid',
            $statuses->every(fn ($s) => in_array($s, ['done', 'paid'], true)) => 'done',
            $statuses->contains(fn ($s) => $s !== 'pending')                  => 'ongoing',
            default                                                           => 'pending',
        };

        $parent->forceFill(['status' => $status])->saveQuietly();
    }

    private function updated(Client $client)
    {
        return response()->json([
            'message'  => 'Schedule updated.',
            'bookings' => $this->bookings($client),
        ]);
    }

    // ---------------------------------------------------------------
    // Read helpers
    // ---------------------------------------------------------------

    private function bookings(Client $client): array
    {
        // Make sure every open package card has its 1st..5th session columns,
        // each with its optional Free slot. Cards booked earlier (with fewer
        // columns, or without free slots) are completed here. Paid cards are
        // locked and left alone.
        ClientPackageRecord::with('sessions')->where('client_id', $client->id)->get()->each(function ($record) {
            if ($record->status === 'paid') {
                return;
            }

            $paidSequences = $record->sessions->where('is_free', false)->pluck('sequence');
            $grew = false;

            for ($n = 1; $n <= self::PACKAGE_SESSION_COLUMNS; $n++) {
                if (! $paidSequences->contains($n)) {
                    $record->sessions()->create(['sequence' => $n, 'is_free' => false]);
                    $grew = true;
                }
            }

            $record->load('sessions');
            $freeSequences = $record->sessions->where('is_free', true)->pluck('sequence');

            foreach ($record->sessions->where('is_free', false)->pluck('sequence') as $sequence) {
                if (! $freeSequences->contains($sequence)) {
                    $record->sessions()->create(['sequence' => $sequence, 'is_free' => true]);
                }
            }

            if ($grew) {
                $paidRows = $record->sessions()->where('is_free', false)->get();
                $record->forceFill(['session_count' => $paidRows->count()])->saveQuietly();
                $this->rollUpStatus($record, $paidRows);
            }
        });

        // Expose only what the UI needs of a staff member.
        $staffColumns = [(new Staff)->getKeyName(), 'staff_name'];
        $staff = fn ($query) => $query->select($staffColumns);

        return [
            'items' => ClientItemSchedule::with(['staff' => $staff])
                ->where('client_id', $client->id)
                ->orderByDesc('id')
                ->get(),

            'bundles' => ClientBundleSchedule::with(['lines.staff' => $staff])
                ->where('client_id', $client->id)
                ->orderByDesc('id')
                ->get(),

            'packages' => ClientPackageRecord::with(['sessions.staff' => $staff])
                ->where('client_id', $client->id)
                ->orderByDesc('id')
                ->get(),
        ];
    }

    private function recordLabel(string $type, $record): string
    {
        return match ($type) {
            'item'    => $record->itemname,
            'bundle'  => $record->bundle_name,
            'package' => $record->package_name,
        };
    }
}
