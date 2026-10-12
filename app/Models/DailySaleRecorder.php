<?php

namespace App\Services;

use App\Models\Client;
use App\Models\ClientBundleSchedule;
use App\Models\ClientItemSchedule;
use App\Models\ClientPackageRecord;
use App\Models\DailySale;
use App\Models\Staff;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;

/**
 * Writes the DAILY SALES report row when a Done item, bundle or package is
 * paid. Everything is snapshotted, so the report never changes if the
 * client, staff or catalog records are edited later.
 */
class DailySaleRecorder
{
    public function recordItem(Client $client, ClientItemSchedule $item, string $method, ?string $finishTime = null): DailySale
    {
        $staff = $item->staff_id ? Staff::find($item->staff_id) : null;

        return $this->create(
            $client, 'item', $item->id, $item->item_name, (float) $item->price, $method,
            [[
                'staff_id'   => $item->staff_id,
                'staff_name' => $staff?->staff_name,
                'commission' => (float) ($item->commission ?? 0),
            ]],
            $item->scheduled_time,
            $finishTime,
        );
    }

    /**
     * @param Collection $lines the bundle's ClientBundleScheduleItem rows
     */
    public function recordBundle(Client $client, ClientBundleSchedule $bundle, Collection $lines, string $method): DailySale
    {
        $names = Staff::whereIn('id', $lines->pluck('staff_id')->filter()->unique())->pluck('staff_name', 'id');

        $staffLines = $lines->map(fn ($line) => [
            'staff_id'   => $line->staff_id,
            'staff_name' => $line->staff_id ? ($names[$line->staff_id] ?? null) : null,
            'commission' => (float) ($line->commission ?? 0),
        ])->all();

        $services = $bundle->bundle_name . ($lines->isNotEmpty() ? ': ' . $lines->pluck('item_name')->implode(', ') : '');

        $start  = $lines->pluck('scheduled_time')->filter()->min();
        $finish = $lines->pluck('done_at')->filter()->max()?->format('H:i:s');

        return $this->create($client, 'bundle', $bundle->id, $services, (float) $bundle->bundle_price, $method, $staffLines, $start, $finish);
    }

    /**
     * @param Collection $sessions the card's paid (non-free) ClientPackageSession rows
     */
    public function recordPackage(Client $client, ClientPackageRecord $record, Collection $sessions, string $method): DailySale
    {
        $names = Staff::whereIn('id', $sessions->pluck('staff_id')->filter()->unique())->pluck('staff_name', 'id');

        // Packages carry no commission, and their sessions happen on other
        // days, so staff are shown by name only (track = false).
        $staffLines = $sessions->pluck('staff_id')->filter()->unique()->map(fn ($id) => [
            'staff_id'   => $id,
            'staff_name' => $names[$id] ?? null,
            'commission' => 0.0,
            'track'      => false,
        ])->values()->all();

        return $this->create($client, 'package', $record->id, $record->package_name, (float) $record->package_price, $method, $staffLines, null, null);
    }

    private function create(
        Client $client, string $type, int $sourceId, string $services, float $amount,
        string $method, array $staffLines, ?string $start, ?string $finish
    ): DailySale {
        $now = now();

        $sale = DailySale::create([
            'sale_date'      => $now->toDateString(),
            'paid_at'        => $now,
            'client_id'      => $client->id,
            'client_name'    => $this->clientName($client),
            'source_type'    => $type,
            'source_id'      => $sourceId,
            'services'       => $services,
            'payment_method' => $method,
            'amount'         => $amount,
            'staff_names'    => collect($staffLines)->pluck('staff_name')->filter()->unique()->implode(', ') ?: null,
            'commission'     => collect($staffLines)->sum('commission'),
            'start_time'     => $start,
            'finish_time'    => $finish,
            'recorded_by'    => Auth::guard('staff')->id(),
        ]);

        foreach ($staffLines as $line) {
            if (empty($line['staff_id']) || ($line['track'] ?? true) === false) {
                continue;
            }

            $sale->staffLines()->create([
                'staff_id'   => $line['staff_id'],
                'staff_name' => $line['staff_name'] ?? 'Staff',
                'commission' => $line['commission'],
            ]);
        }

        return $sale;
    }

    private function clientName(Client $client): string
    {
        $middle = $client->middle_initial ? rtrim($client->middle_initial, '.') . '.' : null;

        return collect([$client->first_name, $middle, $client->last_name])->filter()->implode(' ') ?: 'Client';
    }
}
