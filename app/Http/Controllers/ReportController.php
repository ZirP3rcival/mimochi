<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\DailyExpense;
use App\Models\DailySale;
use App\Models\DailySalaryRate;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
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
        $sales = DailySale::whereBetween('sale_date', [$from, $to])
            ->orderBy('paid_at')
            ->get()
            ->map(fn ($s) => [
                'id'             => $s->id,
                'sale_date'      => $s->sale_date->toDateString(),
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
            ])->values();

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
