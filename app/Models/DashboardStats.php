<?php

namespace App\Models;

use App\Models\Client;
use App\Models\ClientBundleSchedule;
use App\Models\ClientItemSchedule;
use App\Models\ClientPackageRecord;
use App\Models\ClientProductSchedule;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Database\Eloquent\Builder;

/**
 * Numbers for the dashboard stat cards.
 *
 * "Schedules" = rows of the three scheduling tables:
 *   client_item_schedules, client_bundle_schedules, client_package_records
 * (products have no schedule status, so they are not counted).
 */
class DashboardStats
{
    /** The same business timezone the DTR uses. */
    private const TIMEZONE = 'Asia/Manila';

    /** Model classes of the three schedule tables. */
    private const SCHEDULE_MODELS = [
        ClientItemSchedule::class,
        ClientBundleSchedule::class,
        ClientPackageRecord::class,
    ];

    /** Rows per page of the "Current client schedule / appointments" panel. */
    public const SCHEDULE_PER_PAGE = 5;

    /** Rows per page of the "Done client schedule / appointments" panel. */
    public const DONE_PER_PAGE = 5;

    /** Rows per page of the Paid report popup. */
    public const PAID_PER_PAGE = 50;

    /** Everything the Overview dashboard needs on first load. */
    public static function overview(): array
    {
        $schedule = self::schedules(1);
        $done = self::doneSchedules(1);

        return [
            'stats' => self::stats(),
            'schedule' => $schedule['data'],
            'schedule_meta' => $schedule['meta'],
            'done' => $done['data'],
            'done_meta' => $done['meta'],
            'trend' => self::trend(),
        ];
    }

    /**
     * Month view for the trend chart: for every day of the current month
     * (Manila time) the total amount paid and the number of schedules done.
     *
     *  - payments: price of every item / bundle / package (and product x qty)
     *    paid that day; done_at holds the payment time once paid.
     *  - done:     item / bundle / package records that reached done (or paid)
     *    that day, by done_at (updated_at when done_at is empty). Paying
     *    re-stamps done_at on items, so a paid item counts on its payment day.
     */
    public static function trend(): array
    {
        $now = Carbon::now(self::TIMEZONE);
        $first = $now->copy()->startOfMonth();
        $days = $first->daysInMonth;
        $from = $first->copy()->setTimezone(config('app.timezone'));
        $to = $now->copy()->endOfMonth()->setTimezone(config('app.timezone'));

        $payments = array_fill(1, $days, 0.0);
        $done = array_fill(1, $days, 0);

        $dayOf = function ($moment) use ($first) {
            if (! $moment) {
                return null;
            }
            $m = Carbon::parse($moment)->setTimezone(self::TIMEZONE);

            return $m->isSameMonth($first) ? (int) $m->day : null;
        };

        $inMonth = fn (Builder $q) => $q->where(function (Builder $w) use ($from, $to) {
            $w->whereBetween('done_at', [$from, $to])
              ->orWhere(fn (Builder $n) => $n->whereNull('done_at')->whereBetween('updated_at', [$from, $to]));
        });

        $sources = [
            [ClientItemSchedule::class, 'price'],
            [ClientBundleSchedule::class, 'bundle_price'],
            [ClientPackageRecord::class, 'package_price'],
        ];

        foreach ($sources as [$model, $priceColumn]) {
            foreach ($inMonth($model::query()->whereIn('status', ['done', 'paid']))->get() as $row) {
                $day = $dayOf($row->done_at ?? $row->updated_at);
                if ($day) {
                    $done[$day]++;
                    if ($row->status === 'paid') {
                        $payments[$day] += (float) $row->{$priceColumn};
                    }
                }
            }
        }

        // products are sold, not scheduled: they only add to the payments line
        foreach ($inMonth(ClientProductSchedule::query()->where('status', 'paid'))->get() as $row) {
            $day = $dayOf($row->done_at ?? $row->updated_at);
            if ($day) {
                $payments[$day] += (float) $row->total;
            }
        }

        return [
            'month'    => $now->format('F Y'),
            'today'    => (int) $now->day,
            'days'     => range(1, $days),
            'payments' => array_map(fn ($v) => round($v, 2), array_values($payments)),
            'done'     => array_values($done),
        ];
    }

    /** The four stat-card counts (also polled live by the cards). */
    public static function stats(): array
    {
        return [
            // clients table
            'total_clients' => Client::count(),

            // pending + ongoing rows across the three schedule tables
            'current_schedules' => self::countAcross(
                fn (Builder $q) => $q->whereIn('status', ['pending', 'ongoing'])
            ),

            // ongoing rows only (date + time + staff assigned, not done yet)
            'ongoing_schedules' => self::countAcross(
                fn (Builder $q) => $q->where('status', 'ongoing')
            ),

            // done (or since paid) today, by current date
            'done_schedules' => self::countAcross(fn (Builder $q) => self::doneToday($q)),
        ];
    }

    /**
     * Current client schedule / appointments: every PENDING or ONGOING item
     * schedule, bundle schedule and package card, one row each, merged and
     * paginated. Rows with a date/time come first (soonest first), then the
     * not-yet-scheduled ones (newest first).
     *
     * Bundles and package cards are summarised by their next open line /
     * session (the earliest dated one that is not done yet).
     */
    public static function schedules(int $page = 1, int $perPage = self::SCHEDULE_PER_PAGE): array
    {
        $open = ['pending', 'ongoing'];
        $rows = collect();

        $items = ClientItemSchedule::with('staff')->whereIn('status', $open)->get();
        $bundles = ClientBundleSchedule::with('lines.staff')->whereIn('status', $open)->get();
        $packages = ClientPackageRecord::with('sessions.staff')->whereIn('status', $open)->get();

        $clients = Client::whereIn('id', $items->pluck('client_id')
            ->merge($bundles->pluck('client_id'))
            ->merge($packages->pluck('client_id'))->unique()->all())->get()->keyBy('id');

        foreach ($items as $item) {
            $rows->push(self::row('Item', $clients[$item->client_id] ?? null, $item->item_name,
                $item->status, $item->staff?->staff_name, self::at($item), $item->created_at,
                'item-' . $item->id, $item->price, [[
                    'label' => $item->item_name ?? '—', 'staff' => $item->staff?->staff_name ?: '—',
                    'start' => self::local(self::at($item)), 'done' => self::local($item->done_at),
                    'status' => ucfirst($item->status),
                ]]));
        }

        foreach ($bundles as $bundle) {
            $lines = $bundle->lines->reject(fn ($l) => in_array($l->status, ['done', 'paid'], true));
            $next = $lines->filter(fn ($l) => self::at($l))->sortBy(fn ($l) => self::at($l)->timestamp)->first()
                ?? $lines->first();

            $rows->push(self::row('Bundle', $clients[$bundle->client_id] ?? null, $bundle->bundle_name,
                $bundle->status, $next?->staff?->staff_name, $next ? self::at($next) : null, $bundle->created_at,
                'bundle-' . $bundle->id, $bundle->bundle_price,
                $bundle->lines->map(fn ($l) => [
                    'label' => $l->item_name ?? '—', 'staff' => $l->staff?->staff_name ?: '—',
                    'start' => self::local(self::at($l)), 'done' => self::local($l->done_at),
                    'status' => ucfirst($l->status),
                ])->values()->all()));
        }

        foreach ($packages as $package) {
            $sessions = $package->sessions->reject(fn ($s) => in_array($s->status, ['done', 'paid'], true)
                || ($s->is_free && ! $s->isAssigned()));   // an unused Free slot is not a pending session
            $next = $sessions->filter(fn ($s) => self::at($s))->sortBy(fn ($s) => self::at($s)->timestamp)->first()
                ?? $sessions->first();

            $rows->push(self::row('Package', $clients[$package->client_id] ?? null, $package->package_name,
                $package->status, $next?->staff?->staff_name, $next ? self::at($next) : null, $package->created_at,
                'package-' . $package->id, $package->package_price,
                $package->sessions->filter(fn ($x) => ! $x->is_free || $x->isAssigned())->sortBy('sequence')->map(fn ($x) => [
                    'label' => $x->is_free ? 'Free session' : self::ordinal((int) $x->sequence) . ' session',
                    'staff' => $x->staff?->staff_name ?: '—',
                    'start' => self::local(self::at($x)), 'done' => self::local($x->done_at),
                    'status' => ucfirst($x->status),
                ])->values()->all()));
        }

        $rows = $rows->sortBy(fn ($r) => $r['at']
            ? [0, $r['at']->timestamp]
            : [1, -1 * ($r['created']?->timestamp ?? 0)])->values();

        $total = $rows->count();
        $lastPage = max(1, (int) ceil($total / $perPage));
        $page = min(max(1, $page), $lastPage);

        return [
            'data' => $rows->forPage($page, $perPage)->map(fn ($r) => [
                'type'    => $r['type'],
                'client'  => $r['client'],
                'service' => $r['service'],
                'staff'   => $r['staff'],
                'time'    => $r['at'] ? $r['at']->format('M j, Y · h:i A') : 'Not scheduled',
                'status'  => $r['status'],
                'client_id' => $r['client_id'],
                'key'     => $r['key'],
                'price'   => $r['price'],
                'details' => $r['details'],
            ])->values()->all(),
            'meta' => [
                'current_page' => $page,
                'last_page'    => $lastPage,
                'per_page'     => $perPage,
                'total'        => $total,
            ],
        ];
    }

    /**
     * Done client schedule / appointments: every item schedule, bundle
     * schedule and package card whose status is "done" (finished, not yet
     * paid), listed by client name. Each row carries a `key`, the `client_id`
     * (the dashboard only lets one client's records be ticked at a time) and
     * `details` for the "view record" popup.
     *
     * Bundles / package cards are summarised: Time Start = earliest dated
     * line / session, Time Done = latest done time among them.
     */
    public static function doneSchedules(int $page = 1, int $perPage = self::DONE_PER_PAGE): array
    {
        $rows = self::recordRows('done');

        // by client name, then most recently done first
        $rows = $rows->sort(function ($a, $b) {
            return [strtolower($a['client']), $a['client_id'], -$a['done_ts']] <=> [strtolower($b['client']), $b['client_id'], -$b['done_ts']];
        })->values();

        $total = $rows->count();
        $lastPage = max(1, (int) ceil($total / $perPage));
        $page = min(max(1, $page), $lastPage);

        return [
            'data' => $rows->forPage($page, $perPage)->map(function ($r) {
                unset($r['done_ts']);
                $r['status'] = 'Done';
                return $r;
            })->values()->all(),
            'meta' => [
                'current_page' => $page,
                'last_page'    => $lastPage,
                'per_page'     => $perPage,
                'total'        => $total,
            ],
        ];
    }

    /**
     * One summarised row per item schedule, bundle schedule and package card
     * with the given status ('done' = finished, awaiting payment; 'paid').
     * For paid rows `done` holds the payment time (done_at is re-stamped on payment).
     */
    private static function recordRows(string $status): Collection
    {
        $items = ClientItemSchedule::with('staff')->where('status', $status)->get();
        $bundles = ClientBundleSchedule::with('lines.staff')->where('status', $status)->get();
        $packages = ClientPackageRecord::with('sessions.staff')->where('status', $status)->get();

        $clients = Client::whereIn('id', $items->pluck('client_id')
            ->merge($bundles->pluck('client_id'))
            ->merge($packages->pluck('client_id'))->unique()->all())->get()->keyBy('id');

        $rows = collect();

        foreach ($items as $item) {
            $start = self::at($item);
            $done = $item->done_at ?? $item->updated_at;
            $rows->push([
                'key' => 'item-' . $item->id, 'type' => 'Item',
                'client_id' => $item->client_id, 'client' => self::clientName($clients[$item->client_id] ?? null),
                'service' => $item->item_name ?? '—', 'staff' => $item->staff?->staff_name ?: '—',
                'start' => self::local($start), 'done' => self::local($done), 'done_ts' => $done?->timestamp ?? 0,
                'price' => $item->price,
                'details' => [[
                    'label' => $item->item_name ?? '—', 'staff' => $item->staff?->staff_name ?: '—',
                    'start' => self::local($start), 'done' => self::local($done),
                ]],
            ]);
        }

        foreach ($bundles as $bundle) {
            $lines = $bundle->lines;
            $starts = $lines->map(fn ($l) => self::at($l))->filter();
            $dones = $lines->map(fn ($l) => $l->done_at)->filter();
            $done = $bundle->done_at ?? $dones->max() ?? $bundle->updated_at;
            $rows->push([
                'key' => 'bundle-' . $bundle->id, 'type' => 'Bundle',
                'client_id' => $bundle->client_id, 'client' => self::clientName($clients[$bundle->client_id] ?? null),
                'service' => $bundle->bundle_name ?? '—', 'staff' => self::staffList($lines),
                'start' => self::local($starts->sortBy(fn ($c) => $c->timestamp)->first()),
                'done' => self::local($done), 'done_ts' => $done?->timestamp ?? 0,
                'price' => $bundle->bundle_price,
                'details' => $lines->map(fn ($l) => [
                    'label' => $l->item_name ?? '—', 'staff' => $l->staff?->staff_name ?: '—',
                    'start' => self::local(self::at($l)), 'done' => self::local($l->done_at),
                ])->values()->all(),
            ]);
        }

        foreach ($packages as $package) {
            $sessions = $package->sessions->filter(fn ($x) => ! $x->is_free || $x->isAssigned())->sortBy('sequence');
            $starts = $sessions->map(fn ($x) => self::at($x))->filter();
            $dones = $sessions->map(fn ($x) => $x->done_at)->filter();
            $done = $package->done_at ?? $dones->max() ?? $package->updated_at;
            $rows->push([
                'key' => 'package-' . $package->id, 'type' => 'Package',
                'client_id' => $package->client_id, 'client' => self::clientName($clients[$package->client_id] ?? null),
                'service' => $package->package_name ?? '—', 'staff' => self::staffList($sessions),
                'start' => self::local($starts->sortBy(fn ($c) => $c->timestamp)->first()),
                'done' => self::local($done), 'done_ts' => $done?->timestamp ?? 0,
                'price' => $package->package_price,
                'details' => $sessions->map(fn ($x) => [
                    'label' => $x->is_free ? 'Free session' : self::ordinal((int) $x->sequence) . ' session',
                    'staff' => $x->staff?->staff_name ?: '—',
                    'start' => self::local(self::at($x)), 'done' => self::local($x->done_at),
                ])->values()->all(),
            ]);
        }

        return $rows;
    }

    /**
     * Daily payment report: every item schedule, bundle schedule and package
     * card paid TODAY (Manila time), newest payment first, plus the total.
     */
    public static function paidSchedules(int $page = 1, int $perPage = self::PAID_PER_PAGE): array
    {
        $start = Carbon::now(self::TIMEZONE)->startOfDay()->timestamp;
        $end = Carbon::now(self::TIMEZONE)->endOfDay()->timestamp;

        $rows = self::recordRows('paid')
            ->filter(fn ($r) => $r['done_ts'] >= $start && $r['done_ts'] <= $end)   // done_at = payment time
            ->sortByDesc('done_ts')
            ->values();

        $total = $rows->count();
        $lastPage = max(1, (int) ceil($total / $perPage));
        $page = min(max(1, $page), $lastPage);

        return [
            'data' => $rows->forPage($page, $perPage)->map(function ($r) {
                unset($r['done_ts'], $r['details']);
                $r['paid_at'] = $r['done'];
                unset($r['done']);
                return $r;
            })->values()->all(),
            'meta' => [
                'current_page' => $page,
                'last_page'    => $lastPage,
                'per_page'     => $perPage,
                'total'        => $total,
            ],
            'total_amount' => round((float) $rows->sum(fn ($r) => (float) $r['price']), 2),
        ];
    }

    /** Distinct staff names of a set of lines / sessions, e.g. "Anne, Joy". */
    private static function staffList($rows): string
    {
        $names = $rows->map(fn ($r) => $r->staff?->staff_name)->filter()->unique()->values();

        return $names->isEmpty() ? '—' : $names->implode(', ');
    }

    /** "Oct 22, 2026 · 04:21 PM" in Manila time, or null. */
    private static function local($moment): ?string
    {
        return $moment ? Carbon::parse($moment)->setTimezone(self::TIMEZONE)->format('M j, Y · h:i A') : null;
    }

    private static function ordinal(int $n): string
    {
        $suffix = ($n % 100 >= 11 && $n % 100 <= 13) ? 'th' : (['th', 'st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th', 'th'][$n % 10]);

        return $n . $suffix;
    }

    private static function row(string $type, $client, ?string $service, string $status, ?string $staff, ?Carbon $at, $created, string $key = '', $price = null, array $details = []): array
    {
        return [
            'client_id' => $client?->id,
            'key'     => $key,
            'price'   => $price,
            'details' => $details,
            'type'    => $type,
            'client'  => self::clientName($client),
            'service' => $service ?? '—',
            'staff'   => $staff ?: '—',
            'at'      => $at,
            'created' => $created,
            'status'  => ucfirst($status),   // Pending / Ongoing
        ];
    }

    /** Scheduled date + time of a schedule row, or null when either is missing. */
    private static function at($row): ?Carbon
    {
        if (! $row->scheduled_date || ! $row->scheduled_time) {
            return null;
        }

        try {
            return Carbon::parse(Carbon::parse($row->scheduled_date)->format('Y-m-d') . ' ' . $row->scheduled_time, self::TIMEZONE);
        } catch (\Throwable $e) {
            return null;
        }
    }

    private static function clientName($client): string
    {
        if (! $client) {
            return 'Unknown client';
        }
        foreach (['full_name', 'client_name', 'name'] as $col) {
            if (! empty($client->{$col})) {
                return $client->{$col};
            }
        }
        $name = trim(($client->first_name ?? '') . ' ' . ($client->middle_name ?? '') . ' ' . ($client->last_name ?? ''));

        return $name !== '' ? preg_replace('/\s+/', ' ', $name) : "Client #{$client->id}";
    }

    /** Sum of $filter applied to each schedule table. */
    private static function countAcross(callable $filter): int
    {
        $total = 0;
        foreach (self::SCHEDULE_MODELS as $model) {
            $total += $filter($model::query())->count();
        }

        return $total;
    }

    /**
     * Done today. done_at is stamped when an item is marked done (and
     * re-stamped on payment); bundle / package cards only get done_at once
     * paid, so when it is empty the row's updated_at (the roll-up to "done")
     * stands in for it.
     */
    private static function doneToday(Builder $q): Builder
    {
        // "Today" in Manila, converted to the app timezone the columns are stored in.
        $start = Carbon::now(self::TIMEZONE)->startOfDay()->setTimezone(config('app.timezone'));
        $end = Carbon::now(self::TIMEZONE)->endOfDay()->setTimezone(config('app.timezone'));

        return $q->whereIn('status', ['done', 'paid'])
            ->where(function (Builder $w) use ($start, $end) {
                $w->whereBetween('done_at', [$start, $end])
                  ->orWhere(function (Builder $n) use ($start, $end) {
                      $n->whereNull('done_at')->whereBetween('updated_at', [$start, $end]);
                  });
            });
    }
}
