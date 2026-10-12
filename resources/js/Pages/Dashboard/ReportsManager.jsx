import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Printer, Trash2 } from 'lucide-react';

// ── date helpers (all local time, "YYYY-MM-DD" strings) ──────────────────
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
};
const addDays = (s, n) => {
    const d = parse(s);
    d.setDate(d.getDate() + n);
    return ymd(d);
};
const weekStart = (s) => {
    const d = parse(s);
    const offset = (d.getDay() + 6) % 7; // Monday first
    return addDays(s, -offset);
};
const monthStart = (s) => `${s.slice(0, 7)}-01`;
const monthEnd = (s) => {
    const d = parse(s);
    return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};
const longDate = (s) => parse(s).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
const shortDate = (s) => parse(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const clock = (t) => {
    if (!t) return '';
    const [h, m] = String(t).split(':');
    const d = new Date();
    d.setHours(Number(h), Number(m), 0, 0);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};
const money = (v, blankZero = false) => {
    const n = Number(v || 0);
    if (blankZero && n === 0) return '';
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function getXsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

async function api(url, method = 'GET', body) {
    const res = await fetch(url, {
        method,
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-XSRF-TOKEN': getXsrfToken() || '',
        },
        credentials: 'same-origin',
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const flat = Object.values(data.errors || {}).flat();
        throw new Error(flat.length ? flat.join(' ') : (data.message || `Request failed (${res.status}).`));
    }
    return data;
}

// ── report sheet styling (shared by the screen and the print window) ─────
const SHEET_CSS = `
.rs { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; background: #fff; padding: 14px; }
.rs-title { text-align: center; margin: 0 0 2px; font-size: 16px; font-weight: 700; letter-spacing: 1px; color: #c2185b; }
.rs-sub { text-align: center; margin: 0 0 10px; font-size: 12px; color: #444; }
.rs table { border-collapse: collapse; width: 100%; }
.rs th, .rs td { border: 1.5px solid #222; padding: 4px 6px; vertical-align: middle; }
.rs th { text-align: center; font-weight: 700; text-transform: uppercase; font-size: 11px; background: #f7f7f7; }
.rs td.num { text-align: right; white-space: nowrap; }
.rs td.ctr { text-align: center; white-space: nowrap; }
.rs tr.total td { font-weight: 700; background: #fafafa; }
.rs .empty { text-align: center; color: #888; padding: 16px; }
.rs-grid { display: flex; gap: 24px; margin-top: 16px; align-items: flex-start; }
.rs-grid > div { flex: 1; min-width: 0; }
.rs-cap { text-align: center; font-weight: 700; text-transform: uppercase; font-size: 12px; border: 1.5px solid #222; border-bottom: 0; padding: 6px; }
.rs-summary { margin-top: 14px; width: 340px; max-width: 100%; }
.rs-summary div.row { display: flex; justify-content: space-between; gap: 12px; padding: 3px 4px; border-bottom: 1px dotted #bbb; text-transform: uppercase; font-weight: 700; }
.rs-summary .less { color: #2f4da8; }
.rs-summary .profit { color: #c2185b; }
.rs-note { margin-top: 10px; font-size: 10px; color: #777; }
.rs .print-only { display: none; }
.rs input.mini { width: 72px; text-align: right; border: 1px solid #ccc; border-radius: 4px; padding: 1px 4px; font-size: 12px; }
.rs button.icon { border: 0; background: none; cursor: pointer; color: #d33; padding: 0 0 0 6px; vertical-align: middle; }
`;

const PRINT_CSS = `
@page { size: A4 landscape; margin: 10mm; }
body { margin: 0; }
.rs { padding: 0; }
.rs .no-print { display: none !important; }
.rs .print-only { display: inline !important; }
`;

// ── month calendar with range picking ────────────────────────────────────
function Calendar({ month, onMonth, from, to, onPick }) {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const lead = first.getDay(); // Sunday first
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells = [
        ...Array.from({ length: lead }, () => null),
        ...Array.from({ length: daysInMonth }, (_, i) => ymd(new Date(month.getFullYear(), month.getMonth(), i + 1))),
    ];
    const today = ymd(new Date());
    const title = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <button type="button" aria-label="Previous month" onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 transition">
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-bold text-gray-800">{title}</span>
                <button type="button" aria-label="Next month" onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 transition">
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-gray-400 mb-1">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => <span key={d}>{d}</span>)}
            </div>

            <div className="grid grid-cols-7 gap-y-1">
                {cells.map((date, i) => {
                    if (!date) return <span key={`blank-${i}`} />;
                    const inRange = date >= from && date <= to;
                    const isEdge = date === from || date === to;
                    return (
                        <button
                            key={date}
                            type="button"
                            onClick={() => onPick(date)}
                            className={`h-8 text-xs font-medium transition ${
                                isEdge
                                    ? 'bg-[rgb(240,136,176)] text-white rounded-lg'
                                    : inRange
                                        ? 'bg-pink-100 text-pink-900'
                                        : 'text-gray-700 hover:bg-gray-100 rounded-lg'
                            } ${date === today && !isEdge ? 'ring-1 ring-[rgb(240,136,176)] rounded-lg' : ''}`}
                        >
                            {Number(date.slice(8))}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export default function ReportsManager() {
    const today = ymd(new Date());

    const [range, setRange] = useState({ from: today, to: today });
    const [anchor, setAnchor] = useState(null); // first click of a custom range
    const [mode, setMode] = useState('daily');
    const [month, setMonth] = useState(() => parse(today));

    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [expense, setExpense] = useState({ particular: '', amount: '' });
    const [busy, setBusy] = useState(false);
    const [rateDraft, setRateDraft] = useState({}); // staff_id -> typed DR

    const sheetRef = useRef(null);
    const singleDay = range.from === range.to;

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setReport(await api(`/reports/daily-sales?from=${range.from}&to=${range.to}`));
            setRateDraft({});
        } catch (err) {
            setError(err.message || 'Unable to load the report right now.');
        } finally {
            setLoading(false);
        }
    }, [range.from, range.to]);

    useEffect(() => { load(); }, [load]);

    // ── range selection ──
    const applyMode = (next) => {
        const focus = range.from;
        setAnchor(null);
        setMode(next);
        if (next === 'daily') setRange({ from: focus, to: focus });
        if (next === 'weekly') setRange({ from: weekStart(focus), to: addDays(weekStart(focus), 6) });
        if (next === 'monthly') setRange({ from: monthStart(focus), to: monthEnd(focus) });
        setMonth(parse(focus));
    };

    const pickDate = (date) => {
        if (!anchor) {
            setAnchor(date);
            setRange({ from: date, to: date });
            setMode('daily');
            return;
        }
        const [from, to] = date < anchor ? [date, anchor] : [anchor, date];
        setAnchor(null);
        setRange({ from, to });
        setMode(from === to ? 'daily' : 'custom');
    };

    const goToday = () => {
        setAnchor(null);
        setMode('daily');
        setRange({ from: today, to: today });
        setMonth(parse(today));
    };

    // ── expenses / daily rate ──
    const addExpense = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await api('/reports/expenses', 'POST', {
                expense_date: range.to,
                particular: expense.particular.trim(),
                amount: expense.amount,
            });
            setExpense({ particular: '', amount: '' });
            await load();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const removeExpense = async (id) => {
        if (!window.confirm('Remove this expense?')) return;
        setBusy(true);
        try {
            await api(`/reports/expenses/${id}`, 'DELETE');
            await load();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const saveRate = async (row) => {
        const typed = rateDraft[row.staff_id];
        if (typed === undefined || Number(typed) === Number(row.daily_rate)) return;
        setBusy(true);
        try {
            await api('/reports/salary-rate', 'PATCH', { report_date: range.from, staff_id: row.staff_id, daily_rate: typed === '' ? 0 : typed });
            await load();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    // ── print (opens only the sheet in its own window) ──
    const label = singleDay ? longDate(range.from) : `${shortDate(range.from)} – ${shortDate(range.to)}`;

    const printSheet = () => {
        if (!sheetRef.current) return;
        const win = window.open('', '_blank', 'width=1100,height=800');
        if (!win) {
            setError('Allow pop-ups for this site to print the report.');
            return;
        }
        win.document.write(
            `<!doctype html><html><head><meta charset="utf-8"><title>Daily Sales ${label}</title>` +
            `<style>${SHEET_CSS}${PRINT_CSS}</style></head><body>${sheetRef.current.outerHTML}</body></html>`
        );
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 300);
    };

    const modeBtn = (key, text) => (
        <button
            key={key}
            type="button"
            onClick={() => applyMode(key)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${
                mode === key ? 'bg-[rgb(240,136,176)] text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
        >
            {text}
        </button>
    );

    const sales = report?.sales || [];
    const summary = report?.summary;

    return (
        <div className="w-full min-h-[calc(100vh-6rem)] bg-gray-50 grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-4 p-2 sm:p-4">
            {/* ── LEFT: report calendar ── */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-4 self-start">
                <div>
                    <h3 className="text-sm font-bold text-gray-800">Report Calendar</h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">Click a date for one day, or click a start and an end date for a range.</p>
                </div>

                <Calendar month={month} onMonth={setMonth} from={range.from} to={range.to} onPick={pickDate} />

                <div className="flex gap-1.5">
                    {modeBtn('daily', 'Daily')}
                    {modeBtn('weekly', 'Weekly')}
                    {modeBtn('monthly', 'Monthly')}
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <label className="text-[11px] font-semibold text-gray-500">
                        From
                        <input
                            type="date"
                            value={range.from}
                            max={range.to}
                            onChange={(e) => { if (e.target.value) { setAnchor(null); setMode('custom'); setRange((r) => ({ ...r, from: e.target.value })); setMonth(parse(e.target.value)); } }}
                            className="mt-1 w-full p-1.5 border border-gray-200 rounded-lg text-xs font-normal text-gray-800 outline-none focus:ring-2 focus:ring-[rgb(240,136,176)]"
                        />
                    </label>
                    <label className="text-[11px] font-semibold text-gray-500">
                        To
                        <input
                            type="date"
                            value={range.to}
                            min={range.from}
                            onChange={(e) => { if (e.target.value) { setAnchor(null); setMode('custom'); setRange((r) => ({ ...r, to: e.target.value })); } }}
                            className="mt-1 w-full p-1.5 border border-gray-200 rounded-lg text-xs font-normal text-gray-800 outline-none focus:ring-2 focus:ring-[rgb(240,136,176)]"
                        />
                    </label>
                </div>

                <div className="flex gap-2">
                    <button type="button" onClick={goToday} className="flex-1 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition">Today</button>
                    <button
                        type="button"
                        onClick={printSheet}
                        disabled={loading || !report}
                        className="flex-1 py-2 bg-[rgb(240,136,176)] hover:bg-[rgb(225,120,160)] disabled:bg-gray-300 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-sm"
                    >
                        <Printer className="w-3.5 h-3.5" /> Print
                    </button>
                </div>
            </div>

            {/* ── RIGHT: the daily sales sheet ── */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 min-w-0 overflow-hidden">
                <style>{SHEET_CSS}</style>

                {error && (
                    <div className="m-3 rounded-lg px-4 py-3 text-sm font-medium border bg-red-50 text-red-700 border-red-100">⚠️ {error}</div>
                )}

                {loading && !report ? (
                    <div className="text-center py-16 text-gray-400 text-sm">Loading report…</div>
                ) : report ? (
                    <div className="overflow-x-auto custom-scrollbar" style={{ opacity: loading ? 0.6 : 1 }}>
                        <div className="rs" ref={sheetRef} style={{ minWidth: 900 }}>
                            <h2 className="rs-title">DAILY SALES</h2>
                            <p className="rs-sub">{label}{!singleDay && ` · ${report.range.days} days`}</p>

                            {/* main table */}
                            <table>
                                <thead>
                                    <tr>
                                        {!singleDay && <th rowSpan={2}>Date</th>}
                                        <th rowSpan={2}>Complete Name</th>
                                        <th rowSpan={2}>Services</th>
                                        <th colSpan={2}>Payment (Amount)</th>
                                        <th rowSpan={2}>Staff</th>
                                        <th rowSpan={2}>Commi</th>
                                        <th rowSpan={2}>AMT</th>
                                        <th colSpan={2}>Time</th>
                                    </tr>
                                    <tr>
                                        <th>Cash</th>
                                        <th>Online</th>
                                        <th>Start</th>
                                        <th>Finish</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sales.length === 0 ? (
                                        <tr><td className="empty" colSpan={singleDay ? 9 : 10}>No payments recorded for this period.</td></tr>
                                    ) : sales.map((row) => (
                                        <tr key={row.id}>
                                            {!singleDay && <td className="ctr">{shortDate(row.sale_date)}</td>}
                                            <td>{row.client_name}</td>
                                            <td>{row.services}</td>
                                            <td className="num">{money(row.cash, true)}</td>
                                            <td className="num">{money(row.online, true)}</td>
                                            <td>{row.staff_names || ''}</td>
                                            <td className="num">{money(row.commission, true)}</td>
                                            <td className="num">{money(row.amount)}</td>
                                            <td className="ctr">{clock(row.start_time)}</td>
                                            <td className="ctr">{clock(row.finish_time)}</td>
                                        </tr>
                                    ))}
                                    <tr className="total">
                                        <td colSpan={singleDay ? 2 : 3} style={{ textAlign: 'right' }}>TOTAL</td>
                                        <td className="num">{money(report.totals.cash)}</td>
                                        <td className="num">{money(report.totals.online)}</td>
                                        <td />
                                        <td className="num">{money(report.totals.commission)}</td>
                                        <td className="num">{money(report.totals.amount)}</td>
                                        <td colSpan={2} />
                                    </tr>
                                </tbody>
                            </table>

                            {/* expenses + salary */}
                            <div className="rs-grid">
                                <div>
                                    <div className="rs-cap">Daily Expenses / Payables</div>
                                    <table>
                                        <thead>
                                            <tr><th style={{ width: '25%' }}>Date</th><th>Name of Item / Particular</th><th style={{ width: '25%' }}>Amount</th></tr>
                                        </thead>
                                        <tbody>
                                            {report.expenses.length === 0 ? (
                                                <tr><td className="empty" colSpan={3}>No expenses.</td></tr>
                                            ) : report.expenses.map((e) => (
                                                <tr key={e.id}>
                                                    <td className="ctr">{shortDate(e.expense_date)}</td>
                                                    <td>{e.particular}</td>
                                                    <td className="num">
                                                        {money(e.amount)}
                                                        <button type="button" className="icon no-print" title="Remove expense" aria-label="Remove expense" disabled={busy} onClick={() => removeExpense(e.id)}>
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            <tr className="total">
                                                <td colSpan={2} style={{ textAlign: 'right' }}>TOTAL</td>
                                                <td className="num">{money(report.expenses_total)}</td>
                                            </tr>
                                        </tbody>
                                    </table>

                                    <form className="no-print" onSubmit={addExpense} style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                        <input
                                            type="text"
                                            required
                                            maxLength={255}
                                            placeholder={`Item / particular (dated ${shortDate(range.to)})`}
                                            value={expense.particular}
                                            onChange={(e) => setExpense((x) => ({ ...x, particular: e.target.value }))}
                                            className="flex-1 min-w-0 p-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-[rgb(240,136,176)]"
                                        />
                                        <input
                                            type="number"
                                            required
                                            min="0.01"
                                            step="0.01"
                                            placeholder="Amount"
                                            value={expense.amount}
                                            onChange={(e) => setExpense((x) => ({ ...x, amount: e.target.value }))}
                                            className="w-24 p-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-[rgb(240,136,176)]"
                                        />
                                        <button type="submit" disabled={busy} className="px-3 py-1.5 bg-[rgb(240,136,176)] hover:bg-[rgb(225,120,160)] disabled:bg-gray-300 text-white rounded-lg text-xs font-semibold transition">Add</button>
                                    </form>
                                </div>

                                <div>
                                    <div className="rs-cap">Daily Salary</div>
                                    <table>
                                        <thead>
                                            <tr><th>Name</th><th>DR</th><th>Commi</th><th>Total</th></tr>
                                        </thead>
                                        <tbody>
                                            {report.salary.length === 0 ? (
                                                <tr><td className="empty" colSpan={4}>No staff activity.</td></tr>
                                            ) : report.salary.map((row) => (
                                                <tr key={row.staff_id}>
                                                    <td>{row.name}{!singleDay && row.days > 0 ? ` (${row.days}d)` : ''}</td>
                                                    <td className="num">
                                                        {singleDay ? (
                                                            <>
                                                                <input
                                                                    className="mini no-print"
                                                                    type="number"
                                                                    min="0"
                                                                    step="0.01"
                                                                    disabled={busy}
                                                                    value={rateDraft[row.staff_id] ?? row.daily_rate}
                                                                    onChange={(e) => setRateDraft((d) => ({ ...d, [row.staff_id]: e.target.value }))}
                                                                    onBlur={() => saveRate(row)}
                                                                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                                                    aria-label={`Daily rate for ${row.name}`}
                                                                />
                                                                <span className="print-only">{money(row.daily_rate)}</span>
                                                            </>
                                                        ) : money(row.daily_rate)}
                                                    </td>
                                                    <td className="num">{money(row.commission, true)}</td>
                                                    <td className="num">{money(row.total)}</td>
                                                </tr>
                                            ))}
                                            <tr className="total">
                                                <td style={{ textAlign: 'right' }}>TOTAL</td>
                                                <td className="num">{money(report.salary_totals.daily_rate)}</td>
                                                <td className="num">{money(report.salary_totals.commission)}</td>
                                                <td className="num">{money(report.salary_totals.total)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* summary */}
                            <div className="rs-summary">
                                <div className="row"><span>Cash</span><span>{money(summary.cash)}</span></div>
                                <div className="row"><span>Online</span><span>{money(summary.online)}</span></div>
                                <div className="row"><span>Total Sales</span><span>{money(summary.total_sales)}</span></div>
                                <div className="row less"><span>Less Daily Rate</span><span>{money(summary.less_daily_rate)}</span></div>
                                <div className="row less"><span>Less Daily Bills</span><span>{money(summary.less_daily_bills)}</span></div>
                                <div className="row less"><span>Less Daily Salary</span><span>{money(summary.less_daily_salary)}</span></div>
                                <div className="row profit"><span>Profit</span><span>{money(summary.profit)}</span></div>
                                <div className="row"><span>Cash on Hand</span><span>{money(summary.cash_on_hand)}</span></div>
                            </div>
                            <p className="rs-note">
                                Daily Rate = sum of DR · Daily Bills = expenses / payables · Daily Salary = commissions.
                                Profit = Total Sales less all three. Cash on Hand = Cash less all three.
                            </p>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
