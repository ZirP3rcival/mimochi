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
 *              pending -> ongoing (date+time+staff set) -> done.
 */
class ClientScheduleController extends Controller
{
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

        $this->applyAssignment($itemSchedule, $request->validate($this->assignmentRules()));

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
        $bundle->refreshStatus();

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
        $record->refreshStatus();

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

        $next = (int) $packageRecord->sessions()->where('is_free', false)->max('sequence') + 1;

        if ($next > 50) {
            throw ValidationException::withMessages(['sessions' => 'A package card can have at most 50 sessions.']);
        }

        DB::transaction(function () use ($packageRecord, $next) {
            $this->createSessionSlot($packageRecord, $next);
            $packageRecord->session_count = $next;
            $packageRecord->save();
            $packageRecord->refreshStatus();
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
            'item'    => [ClientItemSchedule::class, fn ($m) => $m->status === 'done'],
            'bundle'  => [ClientBundleSchedule::class, fn ($m) => $m->lines()->where('status', 'done')->exists()],
            'package' => [ClientPackageRecord::class, fn ($m) => $m->sessions()->where('status', 'done')->exists()],
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
        $paid = max(1, (int) $package->session_count);

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
        // Package cards booked before every session had a free slot get the
        // missing ones now, so each 1st..Nth column shows its Free rows.
        ClientPackageRecord::with('sessions')->where('client_id', $client->id)->get()->each(function ($record) {
            $freeSequences = $record->sessions->where('is_free', true)->pluck('sequence');

            foreach ($record->sessions->where('is_free', false)->pluck('sequence') as $sequence) {
                if (! $freeSequences->contains($sequence)) {
                    $record->sessions()->create(['sequence' => $sequence, 'is_free' => true]);
                }
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
