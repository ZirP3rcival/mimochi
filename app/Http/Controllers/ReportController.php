<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\DailyExpense;
use App\Models\DailySale;
use App\Models\DailySalaryRate;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * DAILY SALES report: one day, a week, a month or any date range.
 */
class ReportController extends Controller
{
    /** DR used for a staff member on a day with no saved rate. */
    private const DEFAULT_DAILY_RATE = 300;

    private const MAX_DAYS = 366;

    /** Timezone the report days are read in (DB timestamps are stored in the app timezone). */
    private const REPORT_TZ = 'Asia/Manila';

    /**
     * Payments carried by the schedule tables carry no cash/online flag, so
     * anything not yet in daily_sales is shown under this method.
     */
    private const FALLBACK_METHOD = 'cash';

    /**
     * GET /reports/daily-sales?from=YYYY-MM-DD&to=YYYY-MM-DD
     *
     * Sheet formulas:
     *   TOTAL SALES      = CASH + ONLINE
     *   LESS DAILY RATE  = sum of staff DR
     *   LESS DAILY BILLS = sum of DAILY EXPENSES / PAYABLES
     *   LESS DAILY SALARY= sum of staff COMMI
     *   PROFIT           = TOTAL SALES - rate - bills - salary
     *   CASH ON HAND     = CASH - rate - bills - salary
     */
    public function dailySales(Request $request)
    {
        $validated = $request->validate([
            'from' => 'nullable|date_format:Y-m-d',
            'to'   => 'nullable|date_format:Y-m-d',
        ]);

        $from = $validated['from'] ?? now()->toDateString();
        $to   = $validated['to'] ?? $from;

        if ($to < $from) {
            [$from, $to] = [$to, $from];
        }

        $days = (int) Carbon::parse($from)->diffInDays(Carbon::parse($to)) + 1;

        if ($days > self::MAX_DAYS) {
            throw ValidationException::withMessages(['to' => 'Choose a date range of one year or less.']);
        }

        // ── main table ──
        // daily_sales is the ledger; paid schedules that never reached it are merged in.
        $sales = DailySale::whereBetween('sale_date', [$from, $to])
            ->orderBy('paid_at')
            ->get()
            ->map(fn ($s) => [
                'id'             => $s->id,
                'sale_date'      => $s->sale_date->toDateString(),
                'paid_at'        => (string) $s->paid_at,
                'client_name'    => $s->client_name,
                'services'       => $s->services,
                'payment_method' => $s->payment_method,
                'cash'           => $s->payment_method === 'cash' ? (float) $s->amount : 0.0,
                'online'         => $s->payment_method === 'online' ? (float) $s->amount : 0.0,
                'amount'         => (float) $s->amount,
                'staff_names'    => $s->staff_names,
                'commission'     => (float) $s->commission,
                'start_time'     => $s->start_time,
                'finish_time'    => $s->finish_time,
            ]);

        $unrecorded = $this->unrecordedPayments($from, $to);

        $sales = $sales
            ->concat($unrecorded->map(fn ($u) => collect($u)->except('staff')->all()))
            ->sortBy('paid_at')
            ->values();

        $totals = [
            'cash'       => round($sales->sum('cash'), 2),
            'online'     => round($sales->sum('online'), 2),
            'amount'     => round($sales->sum('amount'), 2),
            'commission' => round($sales->sum('commission'), 2),
        ];

        // ── daily expenses / payables ──
        $expenses = DailyExpense::whereBetween('expense_date', [$from, $to])
            ->orderBy('expense_date')->orderBy('id')
            ->get()
            ->map(fn ($e) => [
                'id'           => $e->id,
                'expense_date' => $e->expense_date->toDateString(),
                'particular'   => $e->particular,
                'amount'       => (float) $e->amount,
            ])->values();

        $expensesTotal = round($expenses->sum('amount'), 2);

        // ── daily salary: staff who worked on a sale that day ──
        $staffDays = DB::table('daily_sale_staff as dss')
            ->join('daily_sales as ds', 'ds.id', '=', 'dss.daily_sale_id')
            ->whereBetween('ds.sale_date', [$from, $to])
            ->whereNotNull('dss.staff_id')
            ->groupBy('dss.staff_id', 'ds.sale_date')
            ->select(
                'dss.staff_id',
                'ds.sale_date',
                DB::raw('MAX(dss.staff_name) as staff_name'),
                DB::raw('SUM(dss.commission) as commission')
            )
            ->get();

        $staffDays = $staffDays
            ->concat($unrecorded->flatMap(fn ($u) => collect($u['staff'])->map(fn ($st) => (object) [
                'staff_id'   => $st['staff_id'],
                'sale_date'  => $u['sale_date'],
                'staff_name' => $st['staff_name'],
                'commission' => $st['commission'],
            ])))
            ->groupBy(fn ($r) => $r->staff_id . '|' . $r->sale_date)
            ->map(fn ($g) => (object) [
                'staff_id'   => $g->first()->staff_id,
                'sale_date'  => $g->first()->sale_date,
                'staff_name' => $g->last()->staff_name,
                'commission' => $g->sum(fn ($r) => (float) $r->commission),
            ])
            ->values();

        $rates = DB::table('daily_salary_rates')
            ->whereBetween('report_date', [$from, $to])
            ->get()
            ->mapWithKeys(fn ($r) => [$r->report_date . '|' . $r->staff_id => (float) $r->daily_rate]);

        $salary = $staffDays->groupBy('staff_id')->map(function ($rows, $staffId) use ($rates) {
            $rate       = $rows->sum(fn ($r) => $rates[$r->sale_date . '|' . $staffId] ?? self::DEFAULT_DAILY_RATE);
            $commission = $rows->sum(fn ($r) => (float) $r->commission);

            return [
                'staff_id'   => (int) $staffId,
                'name'       => $rows->last()->staff_name,
                'days'       => $rows->count(),
                'daily_rate' => round($rate, 2),
                'commission' => round($commission, 2),
                'total'      => round($rate + $commission, 2),
            ];
        })->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)->values();

        $salaryTotals = [
            'daily_rate' => round($salary->sum('daily_rate'), 2),
            'commission' => round($salary->sum('commission'), 2),
            'total'      => round($salary->sum('total'), 2),
        ];

        // ── summary block ──
        $lessRate   = $salaryTotals['daily_rate'];
        $lessBills  = $expensesTotal;
        $lessSalary = $salaryTotals['commission'];

        $summary = [
            'cash'             => $totals['cash'],
            'online'           => $totals['online'],
            'total_sales'      => $totals['amount'],
            'less_daily_rate'  => $lessRate,
            'less_daily_bills' => $lessBills,
            'less_daily_salary' => $lessSalary,
            'profit'           => round($totals['amount'] - $lessRate - $lessBills - $lessSalary, 2),
            'cash_on_hand'     => round($totals['cash'] - $lessRate - $lessBills - $lessSalary, 2),
        ];

        return response()->json([
            'range'          => ['from' => $from, 'to' => $to, 'days' => $days],
            'single_day'     => $from === $to,
            'default_rate'   => self::DEFAULT_DAILY_RATE,
            'sales'          => $sales,
            'totals'         => $totals,
            'expenses'       => $expenses,
            'expenses_total' => $expensesTotal,
            'salary'         => $salary,
            'salary_totals'  => $salaryTotals,
            'summary'        => $summary,
        ]);
    }

    /**
     * Paid schedule records (items, bundles, packages, products) that have no
     * row in daily_sales yet, shaped like the report's columns.
     *
     * Paid date/time = done_at (falls back to updated_at), read in REPORT_TZ.
     */
    private function unrecordedPayments(string $from, string $to): Collection
    {
        $dbTz = config('app.timezone');
        $lo   = Carbon::parse($from, self::REPORT_TZ)->startOfDay()->setTimezone($dbTz)->toDateTimeString();
        $hi   = Carbon::parse($to, self::REPORT_TZ)->endOfDay()->setTimezone($dbTz)->toDateTimeString();
        $when = fn ($row) => Carbon::parse($row->done_at ?? $row->updated_at, $dbTz)->setTimezone(self::REPORT_TZ);
        $name = fn ($r) => trim(preg_replace('/\s+/', ' ', "{$r->first_name} {$r->middle_initial} {$r->last_name}"));
        $inRange = 'COALESCE(s.done_at, s.updated_at) BETWEEN ? AND ?';

        $make = function (string $kind, $id, Carbon $paid, string $client, string $services, float $amount, array $staff, $start) {
            $staff = array_values($staff);

            return [
                'id'             => "{$kind}-{$id}",
                'kind'           => $kind,
                'source_id'      => (int) $id,
                'sale_date'      => $paid->toDateString(),
                'paid_at'        => $paid->format('Y-m-d H:i:s'),
                'client_name'    => $client,
                'services'       => $services,
                'payment_method' => self::FALLBACK_METHOD,
                'cash'           => self::FALLBACK_METHOD === 'cash' ? $amount : 0.0,
                'online'         => self::FALLBACK_METHOD === 'online' ? $amount : 0.0,
                'amount'         => $amount,
                'staff_names'    => implode(', ', array_column($staff, 'staff_name')) ?: null,
                'commission'     => round(array_sum(array_column($staff, 'commission')), 2),
                'start_time'     => $start,
                'finish_time'    => $paid->format('H:i:s'),
                'staff'          => $staff,
            ];
        };

        $clientCols = ['c.first_name', 'c.middle_initial', 'c.last_name'];
        $rows = collect();

        // single items
        DB::table('client_item_schedules as s')
            ->join('clients as c', 'c.id', '=', 's.client_id')
            ->leftJoin('staff as st', 'st.id', '=', 's.staff_id')
            ->where('s.status', 'paid')->whereRaw($inRange, [$lo, $hi])
            ->get(array_merge(['s.id', 's.item_name', 's.price', 's.commission', 's.scheduled_time', 's.staff_id', 's.done_at', 's.updated_at', 'st.staff_name'], $clientCols))
            ->each(function ($r) use (&$rows, $make, $when, $name) {
                $rows->push($make('item', $r->id, $when($r), $name($r), $r->item_name, (float) $r->price,
                    $r->staff_id ? [['staff_id' => (int) $r->staff_id, 'staff_name' => $r->staff_name, 'commission' => (float) $r->commission]] : [],
                    $r->scheduled_time));
            });

        // bundles: staff + commission come from the bundle's items
        $bundles = DB::table('client_bundle_schedules as s')
            ->join('clients as c', 'c.id', '=', 's.client_id')
            ->where('s.status', 'paid')->whereRaw($inRange, [$lo, $hi])
            ->get(array_merge(['s.id', 's.bundle_name', 's.bundle_price', 's.done_at', 's.updated_at'], $clientCols));

        if ($bundles->isNotEmpty()) {
            $lines = DB::table('client_bundle_schedule_items as i')
                ->leftJoin('staff as st', 'st.id', '=', 'i.staff_id')
                ->whereIn('i.client_bundle_schedule_id', $bundles->pluck('id'))
                ->get(['i.client_bundle_schedule_id as sid', 'i.staff_id', 'i.commission', 'i.scheduled_time', 'st.staff_name'])
                ->groupBy('sid');

            foreach ($bundles as $r) {
                $own   = $lines->get($r->id, collect());
                $staff = $own->whereNotNull('staff_id')->groupBy('staff_id')->map(fn ($g) => [
                    'staff_id'   => (int) $g->first()->staff_id,
                    'staff_name' => $g->first()->staff_name,
                    'commission' => (float) $g->sum('commission'),
                ])->all();
                $rows->push($make('bundle', $r->id, $when($r), $name($r), $r->bundle_name, (float) $r->bundle_price, $staff, $own->whereNotNull('scheduled_time')->min('scheduled_time')));
            }
        }

        // packages: staff come from the sessions (no commission is stored for packages)
        $packages = DB::table('client_package_records as s')
            ->join('clients as c', 'c.id', '=', 's.client_id')
            ->where('s.status', 'paid')->whereRaw($inRange, [$lo, $hi])
            ->get(array_merge(['s.id', 's.package_name', 's.package_price', 's.done_at', 's.updated_at'], $clientCols));

        if ($packages->isNotEmpty()) {
            $sessions = DB::table('client_package_sessions as x')
                ->leftJoin('staff as st', 'st.id', '=', 'x.staff_id')
                ->whereIn('x.client_package_record_id', $packages->pluck('id'))
                ->get(['x.client_package_record_id as rid', 'x.staff_id', 'x.scheduled_time', 'st.staff_name'])
                ->groupBy('rid');

            foreach ($packages as $r) {
                $own   = $sessions->get($r->id, collect());
                $staff = $own->whereNotNull('staff_id')->groupBy('staff_id')->map(fn ($g) => [
                    'staff_id'   => (int) $g->first()->staff_id,
                    'staff_name' => $g->first()->staff_name,
                    'commission' => 0.0,
                ])->all();
                $rows->push($make('package', $r->id, $when($r), $name($r), $r->package_name, (float) $r->package_price, $staff, $own->whereNotNull('scheduled_time')->min('scheduled_time')));
            }
        }

        // products: price is treated as the unit price
        DB::table('client_product_schedules as s')
            ->join('clients as c', 'c.id', '=', 's.client_id')
            ->leftJoin('staff as st', 'st.id', '=', 's.staff_id')
            ->where('s.status', 'paid')->whereRaw($inRange, [$lo, $hi])
            ->get(array_merge(['s.id', 's.product_name', 's.quantity', 's.price', 's.scheduled_time', 's.staff_id', 's.done_at', 's.updated_at', 'st.staff_name'], $clientCols))
            ->each(function ($r) use (&$rows, $make, $when, $name) {
                $qty = max(1, (int) $r->quantity);
                $rows->push($make('product', $r->id, $when($r), $name($r), $qty > 1 ? "{$r->product_name} x{$qty}" : $r->product_name, round((float) $r->price * $qty, 2),
                    $r->staff_id ? [['staff_id' => (int) $r->staff_id, 'staff_name' => $r->staff_name, 'commission' => 0.0]] : [],
                    $r->scheduled_time));
            });

        if ($rows->isEmpty()) {
            return $rows;
        }

        // Skip anything the ledger already holds (same source id, source_type contains the kind).
        $ledger = DailySale::whereIn('source_id', $rows->pluck('source_id')->unique())->get(['source_type', 'source_id']);

        return $rows->reject(fn ($u) => $ledger->contains(
            fn ($l) => (int) $l->source_id === $u['source_id'] && str_contains(strtolower($l->source_type), $u['kind'])
        ))->map(fn ($u) => collect($u)->except(['kind', 'source_id'])->all())->values();
    }

    /**
     * POST /reports/expenses
     */
    public function storeExpense(Request $request)
    {
        $validated = $request->validate([
            'expense_date' => 'required|date_format:Y-m-d',
            'particular'   => 'required|string|max:255',
            'amount'       => 'required|numeric|min:0.01|max:99999999.99',
        ]);

        $expense = DailyExpense::create($validated + ['recorded_by' => Auth::guard('staff')->id()]);

        return response()->json([
            'message' => 'Expense added.',
            'expense' => $expense,
        ], 201);
    }

    /**
     * DELETE /reports/expenses/{expense}
     */
    public function destroyExpense(DailyExpense $expense)
    {
        $expense->delete();

        return response()->json(['message' => 'Expense removed.']);
    }

    /**
     * PATCH /reports/salary-rate
     * Sets one staff member's DR for one day (the default is 300).
     */
    public function updateSalaryRate(Request $request)
    {
        $validated = $request->validate([
            'report_date' => 'required|date_format:Y-m-d',
            'staff_id'    => 'required|integer|exists:staff,id',
            'daily_rate'  => 'required|numeric|min:0|max:99999999.99',
        ]);

        DailySalaryRate::updateOrCreate(
            ['report_date' => $validated['report_date'], 'staff_id' => $validated['staff_id']],
            ['daily_rate' => $validated['daily_rate']]
        );

        return response()->json(['message' => 'Daily rate saved.']);
    }
}
