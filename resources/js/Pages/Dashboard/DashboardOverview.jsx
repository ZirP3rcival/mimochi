import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ClientRecord from './ClientRecord';
import { printReceipt } from './receipt';
import ReceiptPreview from './ReceiptPreview';
import { Users, CalendarCheck2, UserCheck, PackageCheck, CalendarClock, CalendarDaysIcon, Banknote, Eye, CreditCard, FileText, Printer, Receipt, Smartphone, Ticket, Trash2, X } from 'lucide-react';

// ---------------------------------------------------------------------------
// Mock data. Swap these for real values by passing a `data` prop shaped the
// same way, e.g. <DashboardOverview data={usePage().props.dashboard} />
// ---------------------------------------------------------------------------
// Stat card definitions. The server sends plain numbers in `data.stats`
// (keys below); icons and colors live here because they are React components.
const STAT_DEFS = [
  { id: 'clients', key: 'total_clients', label: 'Total Clients', icon: Users, color: '#f606aa', mock: 1485 },
  { id: 'schedules', key: 'current_schedules', label: 'Current Schedules', icon: CalendarDaysIcon, color: '#3B82C4', mock: 512 },
  { id: 'ongoing', key: 'ongoing_schedules', label: 'Ongoing Schedules', icon: CalendarClock, color: '#8A5CC7', mock: 210 },
  { id: 'done', key: 'done_schedules', label: 'Done Schedules (Today)', icon: CalendarCheck2, color: '#0a8812', mock: 89 },
];

function buildStats(serverStats) {
  // Older shape: a ready-made array of cards.
  if (Array.isArray(serverStats)) return serverStats;
  return STAT_DEFS.map((def) => {
    const n = serverStats?.[def.key];
    return { ...def, value: Number(n ?? def.mock).toLocaleString() };
  });
}

// Live counts: starts from the numbers the page loaded with, then quietly
// re-fetches them every few seconds, so the cards change without a reload.
const LIVE_STATS_URL = '/dashboard/stats';
const LIVE_REFRESH_MS = 5000;

function useLiveStats(initial) {
  const [stats, setStats] = useState(initial);
  const [live, setLive] = useState(false);

  // a fresh server prop (e.g. after navigating back to the page) wins
  useEffect(() => {
    setStats(initial);
  }, [initial]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (document.visibilityState !== 'visible') return; // don't poll hidden tabs
      try {
        const res = await fetch(LIVE_STATS_URL, {
          headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (!res.ok) throw new Error('bad response');
        const next = await res.json();
        if (!cancelled) {
          setStats(next);
          setLive(true);
        }
      } catch (_) {
        if (!cancelled) setLive(false); // offline / session expired: keep last numbers
      }
    }

    const timer = setInterval(load, LIVE_REFRESH_MS);
    const onWake = () => load(); // refresh instantly when the tab/window is shown again
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);
    load();

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
    };
  }, []);

  return { stats, live };
}

// Pending + ongoing schedules, one page at a time. Re-fetches the current page
// every few seconds so rows appear / disappear / change status on their own.
const SCHEDULES_URL = '/dashboard/schedules';
const DONE_URL = '/dashboard/done';
const PAID_URL = '/dashboard/paid';

const EMPTY_META = { current_page: 1, last_page: 1, per_page: 5, total: 0 };

function useLivePage(url, initialRows, initialMeta) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(initialRows ?? []);
  const [meta, setMeta] = useState(initialMeta ?? EMPTY_META);
  const [nonce, setNonce] = useState(0); // bump to re-fetch right away

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch(`${url}?page=${page}`, {
          headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (!res.ok) throw new Error('bad response');
        const next = await res.json();
        if (cancelled) return;
        setRows(next.data);
        setMeta(next.meta);
        // rows were removed and this page no longer exists -> step back
        if (next.meta.current_page !== page) setPage(next.meta.current_page);
      } catch (_) {
        /* offline / session expired: keep what is on screen */
      }
    }

    load();
    const timer = setInterval(load, LIVE_REFRESH_MS);
    const onWake = () => load();
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
    };
  }, [url, page, nonce]);

  return { rows, meta, setPage, reload: () => setNonce((n) => n + 1) };
}

// 1 … 4 5 6 … 12  style page list
function pageWindow(current, last) {
  const set = new Set([1, last, current - 1, current, current + 1]);
  const nums = [...set].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push('…' + n);
    out.push(n);
  });
  return out;
}

function Pagination({ meta, onPage, color, emptyText = 'No pending or ongoing schedules' }) {
  const { current_page: cur, last_page: last, total, per_page: per } = meta;
  const from = total === 0 ? 0 : (cur - 1) * per + 1;
  const to = Math.min(cur * per, total);

  const btn = 'min-w-[2rem] h-8 px-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const idle = { color, border: `1px solid ${hexToRgba(color, 0.3)}`, backgroundColor: 'transparent' };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3" style={{ borderTop: `1px solid ${hexToRgba(color, 0.14)}` }}>
      <p className="text-xs text-neutral-500">
        {total === 0 ? emptyText : `Showing ${from}–${to} of ${total}`}
      </p>
      {last > 1 && (
        <div className="flex items-center gap-1">
          <button type="button" className={btn} style={idle} disabled={cur <= 1} onClick={() => onPage(cur - 1)}>
            Prev
          </button>
          {pageWindow(cur, last).map((p) =>
            typeof p === 'string' ? (
              <span key={p} className="px-1 text-neutral-400">…</span>
            ) : (
              <button
                key={p}
                type="button"
                className={btn}
                style={p === cur ? { backgroundColor: color, color: '#fff', border: `1px solid ${color}` } : idle}
                onClick={() => onPage(p)}
                aria-current={p === cur ? 'page' : undefined}
              >
                {p}
              </button>
            )
          )}
          <button type="button" className={btn} style={idle} disabled={cur >= last} onClick={() => onPage(cur + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}

const MOCK_TREND = [22, 18, 30, 24, 15, 19, 28, 35, 26, 20, 32, 45, 38, 24, 18, 26, 33, 40, 35, 22, 16, 24, 30, 38, 44, 30, 20, 28, 42, 36];

// Each panel gets its own accent so the dashboard doesn't read as one flat
// white surface. Body = a light wash of the color; header = a stronger,
// visibly darker wash of the same color (see PanelHeader below).
const PANEL_COLORS = {
  schedule: '#E2639A',
  done: '#a904eb',
  trend: '#D6416B',
};

const STATUS_STYLES = {
  Confirmed: { bg: '#E7F7EF', fg: '#1F9D6B' },
  Pending: { bg: '#FDF3E3', fg: '#C4762F' },
  'In progress': { bg: '#FDE9EF', fg: '#D6416B' },
  Ongoing: { bg: '#FDE9EF', fg: '#D6416B' },
};

function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function StatCard({ stat }) {
  const Icon = stat.icon;
  return (
    <div
      className="flex items-center gap-3 rounded-xl border p-4"
      style={{ backgroundColor: hexToRgba(stat.color, 0.07), borderColor: hexToRgba(stat.color, 0.18) }}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: hexToRgba(stat.color, 0.22) }}
      >
        <Icon className="h-5 w-5" style={{ color: stat.color }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{stat.label}</p>
        <p className="mt-0.5 text-2xl font-semibold text-neutral-900">{stat.value}</p>
      </div>
    </div>
  );
}

// A panel's header sits at a stronger tint of the panel's own accent color
// than the panel body does, so the header always reads visibly darker.
function PanelHeader({ color, children, right = null }) {
  return (
    <div
      className="flex items-center justify-between px-4 py-3"
      style={{ backgroundColor: hexToRgba(color, 0.22), borderBottom: `1px solid ${hexToRgba(color, 0.16)}` }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color }}>
        {children}
      </p>
      {right}
    </div>
  );
}

const TREND_COLORS = { payments: '#2E9E5B', done: '#3B82C4' };
const TREND_URL = '/dashboard/trend';

// Month view, refreshed every 30s. Starts from the numbers the page loaded with.
function useTrend(initial) {
  const [trend, setTrend] = useState(initial ?? null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch(TREND_URL, {
          headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (!res.ok) throw new Error('bad response');
        const next = await res.json();
        if (!cancelled) setTrend(next);
      } catch (_) {
        /* keep what is on screen */
      }
    }
    load();
    const timer = setInterval(load, 30000);
    const onWake = () => load();
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, []);

  return trend;
}

// 1/2/5 x 10^n ceiling, so the four grid steps land on tidy numbers.
function niceMax(v) {
  if (!(v > 0)) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 4 ? 4 : f <= 8 ? 8 : 10) * p;
}

const compactPeso = (n) =>
  n >= 1000 ? `₱${(n / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k` : `₱${Math.round(n)}`;

// One line over the days of the month. `kind` is 'payments' (green, pesos) or
// 'done' (blue, counts). Days after today are not drawn.
function TrendChart({ trend, kind }) {
  const isPay = kind === 'payments';
  const color = isPay ? TREND_COLORS.payments : TREND_COLORS.done;
  const width = 420;
  const height = 230;
  const pad = { l: 46, r: 14, t: 14, b: 28 };
  const days = trend?.days ?? [];
  const today = trend?.today ?? days.length;
  const n = days.length;

  if (n < 2) return <p className="py-10 text-center text-sm text-neutral-400">No data for this month yet.</p>;

  const vals = ((isPay ? trend.payments : trend.done) ?? []).slice(0, days.filter((d) => d <= today).length);
  const shown = days.slice(0, vals.length);
  const max = isPay ? niceMax(Math.max(0, ...vals)) : Math.max(4, Math.ceil(Math.max(0, ...vals) / 4) * 4);
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const x = (i) => pad.l + (i / (n - 1)) * innerW;
  const y = (v) => pad.t + innerH - (v / max) * innerH;
  const fmt = (v) => (isPay ? compactPeso(v) : String(Math.round(v)));

  const path = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const areaPath = `${path} L${x(vals.length - 1).toFixed(1)},${pad.t + innerH} L${x(0).toFixed(1)},${pad.t + innerH} Z`;
  const gid = `trendFill-${kind}`;
  const monthName = trend.month.split(' ')[0];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img"
      aria-label={isPay ? 'Daily payment total this month' : 'Daily done schedules this month'}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.16" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0, 1, 2, 3, 4].map((t) => {
        const gy = pad.t + (t / 4) * innerH;
        return (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={gy} y2={gy} stroke="#EFEFEF" strokeWidth="1" />
            <text x={pad.l - 6} y={gy + 3} textAnchor="end" fontSize="10" fill="#8a8a8a">{fmt(max - (t / 4) * max)}</text>
          </g>
        );
      })}

      {days.map((d, i) =>
        d === 1 || d % 5 === 0 || d === n ? (
          <text key={d} x={x(i)} y={height - 10} textAnchor="middle" fontSize="10" fill="#8a8a8a">{d}</text>
        ) : null
      )}

      {vals.length > 0 && <path d={areaPath} fill={`url(#${gid})`} />}
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {shown.map((d, i) => (
        <circle key={d} cx={x(i)} cy={y(vals[i])} r="3" fill={color}>
          <title>{`${monthName} ${d}: ${isPay ? peso(vals[i]) + ' paid' : vals[i] + ' done'}`}</title>
        </circle>
      ))}
    </svg>
  );
}

const peso = (n) =>
  `₱${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Popup with the full record of one done schedule (its lines / sessions).
function RecordModal({ row, color, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-2xl rounded-xl bg-white shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: hexToRgba(color, 0.22) }}>
          <p className="text-sm font-semibold" style={{ color }}>
            {row.status ? `${row.status} record` : 'Record'} · {row.service} <span className="ml-1 text-[10px] uppercase text-neutral-500">{row.type}</span>
          </p>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-white/60">
            <X className="h-4 w-4" style={{ color }} />
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          {/* Client = left, Staff = center, Amount = right */}
          <div className="grid grid-cols-3 gap-3">
            <p className="min-w-0 text-left break-words"><span className="text-neutral-400">Client:</span> <span className="font-medium text-neutral-800">{row.client}</span></p>
            <p className="min-w-0 text-center break-words"><span className="text-neutral-400">Staff:</span> <span className="font-medium text-neutral-800">{row.staff}</span></p>
            <p className="min-w-0 text-right break-words"><span className="text-neutral-400">Amount:</span> <span className="font-medium text-neutral-800">{peso(row.price)}</span></p>
          </div>
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: hexToRgba(color, 0.2) }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-500" style={{ backgroundColor: hexToRgba(color, 0.1) }}>
                  <th className="px-3 py-2 font-medium">Service / Session</th>
                  <th className="px-3 py-2 font-medium">Staff</th>
                  <th className="px-3 py-2 font-medium">Time Start</th>
                  <th className="px-3 py-2 font-medium">Time Done</th>
                  {(row.details ?? []).some((d) => d.status) && <th className="px-3 py-2 font-medium">Status</th>}
                </tr>
              </thead>
              <tbody>
                {(row.details ?? []).map((d, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#FFFFFF' : hexToRgba(color, 0.06) }}>
                    <td className="px-3 py-2 text-neutral-800 whitespace-nowrap">{d.label}</td>
                    <td className="px-3 py-2 text-neutral-600 whitespace-nowrap">{d.staff}</td>
                    <td className="px-3 py-2 text-neutral-600 whitespace-nowrap">{d.start ?? '—'}</td>
                    <td className="px-3 py-2 text-neutral-600 whitespace-nowrap">{d.done ?? '—'}</td>
                    {(row.details ?? []).some((x) => x.status) && <td className="px-3 py-2 text-neutral-600 whitespace-nowrap">{d.status ?? '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// Paid report: everything already paid, newest payment first, with the total.
function PaidReportModal({ color, onClose }) {
  const todayLabel = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric' });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 8, total: 0 });
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${PAID_URL}?page=${page}`, {
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then((res) => {
        if (!res.ok) throw new Error('bad response');
        return res.json();
      })
      .then((next) => {
        if (cancelled) return;
        setRows(next.data);
        setMeta(next.meta);
        setTotalAmount(next.total_amount ?? 0);
        setError(false);
        if (next.meta.current_page !== page) setPage(next.meta.current_page);
      })
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [page]);

  return createPortal(
    <div className="paid-print-root fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      {/* print: show only this report, expanded to the full page */}
      <style>{`@media print {
        html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
        body > *:not(.paid-print-root) { display: none !important; }
        .paid-print-root { position: static !important; display: block !important; background: none !important; padding: 0 !important; }
        .paid-print-area { width: 100% !important; max-width: none !important; max-height: none !important; box-shadow: none !important; border-radius: 0 !important; overflow: visible !important; }
        .paid-print-area .overflow-auto { overflow: visible !important; }
        .no-print { display: none !important; }
        .paid-print-area * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }`}</style>
      <div
        role="dialog"
        aria-modal="true"
        className="paid-print-area flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl bg-white shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ backgroundColor: hexToRgba(color, 0.22) }}>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide" style={{ color }}>Daily payment report list</p>
            <p className="text-xs text-neutral-500">{todayLabel}</p>
          </div>
          <div className="no-print flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              title="Print"
              className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm font-semibold hover:bg-neutral-50"
              style={{ color, borderColor: hexToRgba(color, 0.5) }}
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-white/60">
              <X className="h-4 w-4" style={{ color }} />
            </button>
          </div>
        </div>

        <div className="overflow-auto custom-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500" style={{ backgroundColor: hexToRgba(color, 0.09) }}>
                <th className="px-4 py-2 font-medium">Client Name</th>
                <th className="px-4 py-2 font-medium">Service</th>
                <th className="px-4 py-2 font-medium">Staff Member</th>
                <th className="px-4 py-2 font-medium">Time Start</th>
                <th className="px-4 py-2 font-medium">Time Paid</th>
                <th className="px-4 py-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(loading || error || rows.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-neutral-400">
                    {error ? 'Could not load the paid report.' : loading ? 'Loading…' : 'No payments recorded today.'}
                  </td>
                </tr>
              )}
              {!error && rows.map((row, i) => (
                <tr key={row.key} style={{ backgroundColor: i % 2 === 0 ? hexToRgba(color, 0.12) : '#FFFFFF', borderBottom: `1px solid ${hexToRgba(color, 0.08)}` }}>
                  <td className="px-4 py-2.5 font-medium text-neutral-800 whitespace-nowrap">{row.client}</td>
                  <td className="px-4 py-2.5 text-neutral-600 whitespace-nowrap">
                    {row.service}
                    {row.type && <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-neutral-400">{row.type}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-600 whitespace-nowrap">{row.staff}</td>
                  <td className="px-4 py-2.5 text-neutral-600 whitespace-nowrap">{row.start ?? '—'}</td>
                  <td className="px-4 py-2.5 text-neutral-600 whitespace-nowrap">{row.paid_at ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-neutral-800 whitespace-nowrap">{peso(row.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-2.5 text-sm" style={{ borderTop: `1px solid ${hexToRgba(color, 0.14)}`, backgroundColor: hexToRgba(color, 0.08) }}>
          <span className="text-neutral-500">Total paid today</span>
          <span className="font-semibold" style={{ color }}>{peso(totalAmount)}</span>
        </div>
        <div className="no-print"><Pagination meta={meta} onPage={setPage} color={color} emptyText="No payments recorded today" /></div>
      </div>
    </div>,
    document.body
  );
}

function xsrfToken() {
  const m = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : '';
}

// Light tint of a hex colour over white, as a solid colour (for sticky rows).
function solidTint(hex, alpha) {
  const c = hex.replace('#', '');
  const mix = (i) => Math.round(255 + (parseInt(c.substring(i, i + 2), 16) - 255) * alpha);
  return `rgb(${mix(0)}, ${mix(2)}, ${mix(4)})`;
}
const toCents = (v) => Math.round((parseFloat(v) || 0) * 100);
const moneyInput = (v) => v.replace(/[^0-9.]/g, '').replace(/^(\d*\.?\d{0,2}).*$/, '$1');

// Payment window: the ticked done records with their amounts, the total, and
// how it is paid (cash and/or online). Submit payment stays disabled until
// cash + online equals the total; then every record is marked paid and the
// split is stored in client_payments.
function PaymentModal({ client, clientId, rows, color, onRemove, onClose, onPaid }) {
  const [busy, setBusy] = useState(false);
  // after the payment is submitted: Receipt button enabled, window closable only once printed
  const [submitted, setSubmitted] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [error, setError] = useState('');
  const [cash, setCash] = useState('');
  const [online, setOnline] = useState('');
  // rows paid with a voucher (by row key): their amount is not collected as cash / online
  const [voucherKeys, setVoucherKeys] = useState({});

  const rowCents = (r) => Math.round(Number(r.price ?? 0) * 100);
  const totalCents = rows.reduce((sum, r) => sum + rowCents(r), 0);
  const voucherRows = rows.filter((r) => voucherKeys[r.key]);
  const voucherCents = voucherRows.reduce((sum, r) => sum + rowCents(r), 0);
  const dueCents = totalCents - voucherCents; // what cash + online must cover
  const due = dueCents / 100;
  const receivedCents = toCents(cash) + toCents(online);
  const diff = dueCents - receivedCents; // >0 still to collect, <0 too much
  const toggleVoucher = (key) => { setVoucherKeys((prev) => ({ ...prev, [key]: !prev[key] })); setError(''); };
  const balanced = totalCents > 0 && diff === 0;
  const canClose = !busy && !printing && !previewing && (!submitted || printed);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && canClose && onClose(submitted);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, canClose, submitted]);

  async function submit() {
    if (busy || rows.length === 0) return;
    if (!balanced) {
      setError('Cash and online payments must add up to the total amount.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/clients/${clientId}/payments`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-XSRF-TOKEN': xsrfToken(),
        },
        body: JSON.stringify({
          items: rows.map((r) => ({ type: String(r.type).toLowerCase(), id: Number(String(r.key).split('-').pop()) })),
          cash_amount: (toCents(cash) / 100).toFixed(2),
          online_amount: (toCents(online) / 100).toFixed(2),
          ...(voucherCents > 0 ? {
            voucher_amount: (voucherCents / 100).toFixed(2),
            voucher_items: voucherRows.map((r) => ({ type: String(r.type).toLowerCase(), id: Number(String(r.key).split('-').pop()) })),
          } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const first = body?.errors ? Object.values(body.errors).flat()[0] : null;
        throw new Error(first || body?.message || 'Payment could not be recorded.');
      }
      setSubmitted(true);
      setBusy(false);
      onPaid();
    } catch (e) {
      setError(e.message || 'Payment could not be recorded.');
      setBusy(false);
    }
  }

  async function print() {
    if (!submitted || printing) return;
    setPrinting(true);
    await printReceipt({
      items: rows.map((r) => ({ name: r.service, amount: r.price })),
      total: due,
      voucher: voucherCents / 100,
    });
    setPrinting(false);
    setPrinted(true);
    setPreviewing(false);
  }

  const options = [
    { key: 'cash', label: 'Cash', Icon: Banknote, value: cash, set: setCash, other: setOnline },
    { key: 'online', label: 'Online', Icon: Smartphone, value: online, set: setOnline, other: setCash },
  ];

  let statusText = 'Enter the cash and/or online amount received.';
  let statusColor = '#737373';
  if (receivedCents > 0 && diff > 0) { statusText = `Remaining ${peso(diff / 100)}`; statusColor = '#b45309'; }
  else if (diff < 0) { statusText = `Over by ${peso(-diff / 100)}`; statusColor = '#dc2626'; }
  else if (balanced) { statusText = voucherCents > 0 ? 'Voucher + Cash + Online matches the total amount.' : 'Cash + Online matches the total amount.'; statusColor = '#15803d'; }
  if (submitted) { statusText = 'Payment recorded.'; statusColor = '#15803d'; }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={canClose ? () => onClose(submitted) : undefined}>
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[92vh] w-full max-w-xl flex-col rounded-xl bg-white shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: hexToRgba(color, 0.22) }}>
          <p className="text-sm font-semibold uppercase tracking-wide" style={{ color }}>Payment · {client}</p>
          <button type="button" onClick={() => onClose(submitted)} disabled={!canClose} aria-label="Close" title={canClose ? 'Close' : 'Print the receipt first'} className="rounded p-1 hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-30">
            <X className="h-4 w-4" style={{ color }} />
          </button>
        </div>

        {/* one table, so the total sits in the same column as the amounts */}
        <div className="max-h-[40vh] overflow-auto custom-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500" style={{ backgroundColor: hexToRgba(color, 0.09) }}>
                <th className="px-4 py-2 font-medium">Service</th>
                <th className="px-4 py-2 font-medium text-right">Amount</th>
                <th className="w-20 px-2 py-2"><span className="sr-only">Voucher and remove</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.key} style={{ backgroundColor: i % 2 === 0 ? hexToRgba(color, 0.08) : '#FFFFFF' }}>
                  <td className="px-4 py-2.5 text-neutral-800">
                    {r.service}
                    {r.type && <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-neutral-400">{r.type}</span>}
                    {voucherKeys[r.key] && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color }}>Voucher</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-neutral-800 whitespace-nowrap">{peso(r.price)}</td>
                  <td className="px-2 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      {/* voucher payment: this service is covered by a voucher, not cash / online */}
                      <button
                        type="button"
                        onClick={() => toggleVoucher(r.key)}
                        disabled={busy || submitted}
                        aria-pressed={Boolean(voucherKeys[r.key])}
                        title={voucherKeys[r.key] ? 'Remove voucher from this service' : 'Pay this service with a voucher'}
                        aria-label={`${voucherKeys[r.key] ? 'Remove voucher from' : 'Pay with voucher:'} ${r.service}`}
                        className="rounded p-1 hover:bg-white/70 disabled:opacity-40"
                        style={voucherKeys[r.key] ? { backgroundColor: color, color: '#FFFFFF' } : { color }}
                      >
                        <Ticket className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(r)}
                        disabled={busy || submitted}
                        title="Remove from payment"
                        aria-label={`Remove ${r.service} from payment`}
                        className="rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0">
              {voucherCents > 0 && (
                <tr style={{ backgroundColor: solidTint(color, 0.1) }}>
                  <td className="px-4 pt-2 text-xs font-medium text-neutral-500">Voucher</td>
                  <td className="px-4 pt-2 text-right text-sm font-semibold whitespace-nowrap" style={{ color }}>−{peso(voucherCents / 100)}</td>
                  <td />
                </tr>
              )}
              <tr style={{ backgroundColor: solidTint(color, 0.1), borderTop: `1px solid ${hexToRgba(color, 0.25)}` }}>
                <td className="px-4 py-3 text-sm font-medium text-neutral-600">Total amount</td>
                <td className="px-4 py-3 text-right text-xl font-bold whitespace-nowrap" style={{ color }}>{peso(due)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* payment options */}
        <div className="px-4 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Payment options</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {options.map(({ key, label, Icon, value, set, other }) => (
              <div key={key} className="rounded-lg border p-3" style={{ borderColor: hexToRgba(color, 0.25) }}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-700">
                    <Icon className="h-4 w-4" style={{ color }} />
                    {label}
                  </span>
                  <button
                    type="button"
                    onClick={() => { set(due.toFixed(2)); other(''); setError(''); }}
                    disabled={busy || submitted || due <= 0}
                    className="text-[11px] font-semibold hover:underline disabled:opacity-40"
                    style={{ color }}
                  >
                    Full amount
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500">₱</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={value}
                    onChange={(e) => { set(moneyInput(e.target.value)); setError(''); }}
                    disabled={busy || submitted}
                    placeholder="0.00"
                    aria-label={`${label} amount`}
                    className="w-full rounded-lg border border-neutral-200 py-2 pl-7 pr-3 text-right text-sm outline-none focus:ring-2"
                    style={{ '--tw-ring-color': hexToRgba(color, 0.5) }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="font-medium" style={{ color: statusColor }}>{statusText}</span>
            <span className="text-neutral-500">Received <strong className="text-neutral-800">{peso(receivedCents / 100)}</strong></span>
          </div>
        </div>

        {error && <p className="px-4 pt-2 text-sm text-red-600" role="alert">{error}</p>}

        {submitted && !printed && (
          <p role="status" className="px-4 pt-2 text-sm font-medium text-amber-700">
            Payment submitted. Preview and print the receipt to close this window.
          </p>
        )}
        {printed && (
          <p role="status" className="px-4 pt-2 text-sm font-medium text-emerald-700">
            Receipt printed. You can close this window.
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => onClose(submitted)}
            disabled={!canClose}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitted ? 'Close' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !balanced || submitted}
            title={balanced ? 'Record this payment' : 'Cash + Online must equal the total amount'}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CreditCard className="h-4 w-4" />
            {busy ? 'Submitting…' : submitted ? 'Payment submitted ✓' : 'Submit payment'}
          </button>
          {/* Receipt: only enabled once the payment has been submitted */}
          <button
            type="button"
            onClick={() => setPreviewing(true)}
            disabled={!submitted || printing}
            title={submitted ? 'Preview and print receipt (58 mm)' : 'Submit the payment first'}
            aria-label="Preview and print receipt"
            className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-4 py-2 text-sm font-semibold transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color, borderColor: hexToRgba(color, 0.6) }}
          >
            <Receipt className="h-4 w-4" />
            Receipt
          </button>
        </div>
      </div>

      {previewing && (
        <ReceiptPreview
          items={rows.map((r) => ({ name: r.service, amount: r.price }))}
          total={due}
          voucher={voucherCents / 100}
          color={color}
          printing={printing}
          onPrint={print}
          onBack={() => setPreviewing(false)}
        />
      )}
    </div>
  );
}

// Done schedules, listed by client name. Ticking a record locks the list to
// that client: other clients' checkboxes are disabled until every tick is
// cleared. At least one tick enables the Payment button.
function DonePanel({ rows, meta, onPage, onPaid }) {
  const color = PANEL_COLORS.done;
  const [selected, setSelected] = useState({}); // row.key -> row
  const [viewing, setViewing] = useState(null);
  const [showPaid, setShowPaid] = useState(false);
  const [paying, setPaying] = useState(false);

  const selectedRows = Object.values(selected);
  const lockedClientId = selectedRows.length ? selectedRows[0].client_id : null;
  const lockedClientName = selectedRows.length ? selectedRows[0].client : '';

  function toggle(row) {
    setSelected((prev) => {
      if (prev[row.key]) {
        const next = { ...prev };
        delete next[row.key];
        return next;
      }
      const first = Object.values(prev)[0];
      if (first && first.client_id !== row.client_id) return prev; // different client: not allowed
      return { ...prev, [row.key]: row };
    });
  }

  const paymentButton = (
    <button
      type="button"
      disabled={selectedRows.length === 0}
      onClick={() => setPaying(true)}
      title={selectedRows.length ? `Pay ${selectedRows.length} record(s) for ${lockedClientName}` : 'Tick a client\'s done record to enable payment'}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      style={{ backgroundColor: color }}
    >
      <CreditCard className="h-4 w-4" />
      Payment{selectedRows.length > 0 ? ` (${selectedRows.length})` : ''}
    </button>
  );

  const paidReportButton = (
    <button
      type="button"
      onClick={() => setShowPaid(true)}
      title="View daily payment report"
      className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-neutral-50"
      style={{ color, borderColor: hexToRgba(color, 0.5) }}
    >
      <FileText className="h-4 w-4" />
      Paid Report
    </button>
  );

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: hexToRgba(color, 0.05), borderColor: hexToRgba(color, 0.18) }}
    >
      <PanelHeader
        color={color}
        right={<div className="flex items-center gap-2">{paymentButton}{paidReportButton}</div>}
      >Done client schedule / appointments</PanelHeader>
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-left text-xs text-neutral-500"
              style={{ backgroundColor: hexToRgba(color, 0.09), borderBottom: `1px solid ${hexToRgba(color, 0.14)}` }}
            >
              <th className="px-4 py-2 font-medium">Client Name</th>
              <th className="px-4 py-2 font-medium">Service</th>
              <th className="px-4 py-2 font-medium">Staff Member</th>
              <th className="px-4 py-2 font-medium">Time Start</th>
              <th className="px-4 py-2 font-medium">Time Done</th>
              <th className="px-4 py-2 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-neutral-400">No done schedules waiting for payment.</td>
              </tr>
            )}
            {rows.map((row, i) => {
              const checked = !!selected[row.key];
              const blocked = lockedClientId !== null && lockedClientId !== row.client_id;
              const base = checked ? hexToRgba(color, 0.22) : i % 2 === 0 ? hexToRgba(color, 0.12) : '#FFFFFF';
              return (
                <tr
                  key={row.key}
                  className="transition-colors"
                  style={{ backgroundColor: base, borderBottom: `1px solid ${hexToRgba(color, 0.08)}`, opacity: blocked ? 0.6 : 1 }}
                >
                  <td className="px-4 py-2.5 font-medium text-neutral-800 whitespace-nowrap">{row.client}</td>
                  <td className="px-4 py-2.5 text-neutral-600 whitespace-nowrap">
                    {row.service}
                    {row.type && <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-neutral-400">{row.type}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-600 whitespace-nowrap">{row.staff}</td>
                  <td className="px-4 py-2.5 text-neutral-600 whitespace-nowrap">{row.start ?? '—'}</td>
                  <td className="px-4 py-2.5 text-neutral-600 whitespace-nowrap">{row.done ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setViewing(row)}
                        title="View record"
                        aria-label={`View record of ${row.client}: ${row.service}`}
                        className="rounded p-1 transition-colors hover:bg-white/70"
                      >
                        <Eye className="h-4 w-4" style={{ color }} />
                      </button>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={blocked}
                        onChange={() => toggle(row)}
                        title={blocked ? `Finish with ${lockedClientName} first` : 'Select for payment'}
                        aria-label={`Select ${row.client}: ${row.service} for payment`}
                        className="h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
                        style={{ accentColor: color }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination meta={meta} onPage={onPage} color={color} emptyText="No done schedules waiting for payment" />
      {viewing && <RecordModal row={viewing} color={color} onClose={() => setViewing(null)} />}
      {paying && selectedRows.length > 0 && (
        <PaymentModal
          client={lockedClientName}
          clientId={lockedClientId}
          rows={selectedRows}
          color={color}
          onRemove={(r) => {
            setSelected((prev) => {
              const next = { ...prev };
              delete next[r.key];
              if (Object.keys(next).length === 0) setPaying(false);
              return next;
            });
          }}
          onClose={(paid) => {
            setPaying(false);
            if (paid) setSelected({}); // paid records leave the list; keep ticks if the window was only cancelled
          }}
          onPaid={() => onPaid?.()}
        />
      )}
      {showPaid && <PaidReportModal color={color} onClose={() => setShowPaid(false)} />}
    </div>
  );
}

export default function DashboardOverview({ data }) {
  const { stats: liveStats, live } = useLiveStats(data?.stats);
  const stats = buildStats(liveStats);
  const { rows: liveRows, meta: liveMeta, setPage } = useLivePage(SCHEDULES_URL, data?.schedule, data?.schedule_meta);
  const { rows: doneRows, meta: doneMeta, setPage: setDonePage, reload: reloadDone } = useLivePage(DONE_URL, data?.done, data?.done_meta);
  const [recordClient, setRecordClient] = useState(null); // client whose service record is open
  const [openingKey, setOpeningKey] = useState(null);
  const [openError, setOpenError] = useState('');
  const schedule = liveRows;

  // Eye icon on a current-schedule row: load the client and show their service record.
  async function openClient(row) {
    if (!row.client_id || openingKey) return;
    setOpeningKey(row.key);
    setOpenError('');
    try {
      const res = await fetch(`/clients/${row.client_id}`, {
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(res.status === 403 ? 'You do not have access to client records.' : 'Could not open the client record.');
      setRecordClient(await res.json());
    } catch (e) {
      setOpenError(e.message || 'Could not open the client record.');
    } finally {
      setOpeningKey(null);
    }
  }
  const scheduleMeta = liveMeta;
  const trend = useTrend(data?.trend);
  const paymentsTotal = (trend?.payments ?? []).reduce((a, b) => a + b, 0);
  const doneTotal = (trend?.done ?? []).reduce((a, b) => a + b, 0);

  if (recordClient) {
    return <ClientRecord client={recordClient} onClose={() => setRecordClient(null)} />;
  }

  const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="p-4 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">Overview dashboard</h2>
        <p className="text-sm text-neutral-400 flex items-center gap-2">
          {today}
          {live && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600" title="Counts update automatically">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          )}
        </p>
      </div>

      {openError && <p className="text-sm text-red-600" role="alert">{openError}</p>}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <StatCard key={stat.id} stat={stat} />
        ))}
      </div>

      {/* Current schedules + done schedules */}
      <div className="grid grid-cols-1 gap-4">
        <div
          className="rounded-xl border overflow-hidden"
          style={{ backgroundColor: hexToRgba(PANEL_COLORS.schedule, 0.05), borderColor: hexToRgba(PANEL_COLORS.schedule, 0.18) }}
        >
          <PanelHeader color={PANEL_COLORS.schedule}>Current client schedule / appointments</PanelHeader>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-left text-xs text-neutral-500"
                  style={{ backgroundColor: hexToRgba(PANEL_COLORS.schedule, 0.09), borderBottom: `1px solid ${hexToRgba(PANEL_COLORS.schedule, 0.14)}` }}
                >
                  <th className="px-4 py-2 font-medium">Client name</th>
                  <th className="px-4 py-2 font-medium">Service</th>
                  <th className="px-4 py-2 font-medium">Staff member</th>
                  <th className="px-4 py-2 font-medium">Time</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {schedule.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-neutral-400">
                      No pending or ongoing schedules.
                    </td>
                  </tr>
                )}
                {schedule.map((row, i) => {
                  const badge = STATUS_STYLES[row.status] ?? { bg: '#F1F1F1', fg: '#6B7280' };
                  // alternate rows: the panel's own blue tint, then white
                  const rowBg = i % 2 === 0 ? hexToRgba(PANEL_COLORS.schedule, 0.12) : '#FFFFFF';
                  return (
                    <tr
                      key={i}
                      className="last:border-0 transition-colors"
                      style={{ backgroundColor: rowBg, borderBottom: `1px solid ${hexToRgba(PANEL_COLORS.schedule, 0.08)}` }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = hexToRgba(PANEL_COLORS.schedule, 0.2))}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = rowBg)}
                    >
                      <td className="px-4 py-2.5 font-medium text-neutral-800 whitespace-nowrap">{row.client}</td>
                      <td className="px-4 py-2.5 text-neutral-600 whitespace-nowrap">
                        {row.service}
                        {row.type && <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-neutral-400">{row.type}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-neutral-600 whitespace-nowrap">{row.staff}</td>
                      <td className="px-4 py-2.5 text-neutral-600 whitespace-nowrap">{row.time}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium"
                          style={{ backgroundColor: badge.bg, color: badge.fg }}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => openClient(row)}
                            disabled={openingKey === row.key}
                            title="Open client record"
                            aria-label={`Open client record of ${row.client}: ${row.service}`}
                            className="rounded p-1 transition-colors hover:bg-white/70 disabled:opacity-50"
                          >
                            <Eye className="h-4 w-4" style={{ color: PANEL_COLORS.schedule }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination meta={scheduleMeta} onPage={setPage} color={PANEL_COLORS.schedule} />
        </div>

        <DonePanel rows={doneRows} meta={doneMeta} onPage={setDonePage} onPaid={reloadDone} />
      </div>

      {/* Month view: payments and done schedules, side by side */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[
          { kind: 'payments', title: 'Daily payment total', color: TREND_COLORS.payments, total: peso(paymentsTotal) },
          { kind: 'done', title: 'Daily done schedules', color: TREND_COLORS.done, total: String(doneTotal) },
        ].map((c) => (
          <div
            key={c.kind}
            className="rounded-xl border overflow-hidden"
            style={{ backgroundColor: hexToRgba(c.color, 0.05), borderColor: hexToRgba(c.color, 0.18) }}
          >
            <PanelHeader color={c.color} right={<span className="text-xs font-semibold" style={{ color: c.color }}>{trend?.month ?? ''}</span>}>
              {c.title} (month view)
            </PanelHeader>
            <div className="p-4">
              <p className="mb-2 text-xs text-neutral-500">
                Month total · <strong className="text-sm font-semibold text-neutral-800">{c.total}</strong>
              </p>
              <TrendChart trend={trend} kind={c.kind} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
