import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Pencil, Plus, Search, Ticket, Trash2, X } from 'lucide-react';

const BRAND = 'rgb(240,136,176)';
const MAX_VOUCHERS = 1000;
const EMPTY_META = { current_page: 1, last_page: 1, per_page: 10, total: 0 };

const peso = (n) =>
  `₱${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const todayManila = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }); // YYYY-MM-DD

const niceDate = (iso) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

function xsrfToken() {
  const m = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : '';
}

async function api(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'X-XSRF-TOKEN': xsrfToken(),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const first = data?.errors ? Object.values(data.errors).flat()[0] : null;
    throw new Error(first || data?.message || 'Something went wrong.');
  }
  return data;
}

// Same rules as the server: this only drives the live preview and the total.
// The server checks everything again (and that no barcode is already filed).
const BARCODE_RE = /^[A-Za-z0-9][A-Za-z0-9\-_.]{0,59}$/;

function expandRange(from, to) {
  const f = from.trim();
  const t = to.trim();
  if (!f || !t) return { codes: [], error: '' };
  const a = /^(.*?)(\d+)$/.exec(f);
  const b = /^(.*?)(\d+)$/.exec(t);
  if (!BARCODE_RE.test(f) || !BARCODE_RE.test(t) || !a || !b) return { codes: [], error: 'A barcode must end with a number, e.g. MV-0001.' };
  if (a[1] !== b[1]) return { codes: [], error: 'Both barcodes must start with the same text.' };
  if (a[2].length > 15 || b[2].length > 15) return { codes: [], error: 'At most 15 digits in the number part.' };
  const start = Number(a[2]);
  const end = Number(b[2]);
  if (end < start) return { codes: [], error: 'The last barcode must not be lower than the first.' };
  if (end - start + 1 > MAX_VOUCHERS) return { codes: [], error: `A range can hold at most ${MAX_VOUCHERS} vouchers.` };
  const width = a[2].length;
  const codes = [];
  for (let n = start; n <= end; n++) codes.push(a[1] + String(n).padStart(width, '0'));
  return { codes, error: '' };
}

function parseList(text) {
  const codes = [...new Set(text.split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean))];
  if (codes.length === 0) return { codes: [], error: '' };
  if (codes.length > MAX_VOUCHERS) return { codes: [], error: `At most ${MAX_VOUCHERS} vouchers at a time.` };
  const bad = codes.find((c) => !BARCODE_RE.test(c));
  if (bad) return { codes: [], error: `"${bad}" is not a valid barcode (letters, digits, - _ . only).` };
  return { codes, error: '' };
}

const toCents = (v) => Math.round((parseFloat(v) || 0) * 100);
const moneyInput = (v) => v.replace(/[^0-9.]/g, '').replace(/^(\d*\.?\d{0,2}).*$/, '$1');

function barcodeLabel(v) {
  if (v.barcode_mode === 'range' && v.barcode_to) return `${v.barcode_from} – ${v.barcode_to}`;
  if (v.quantity > 1) return `${v.barcode_from}, … (+${v.quantity - 1} more)`;
  return v.barcode_from;
}

const STATUS_STYLE = {
  unused: { bg: '#E7F7EF', fg: '#1F9D6B' },
  used: { bg: '#FDF3E3', fg: '#C4762F' },
  void: { bg: '#F1F1F1', fg: '#6B7280' },
};

function Modal({ title, onClose, children, wide = false }) {
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
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-xl bg-white shadow-xl ${wide ? 'max-w-2xl' : 'max-w-xl'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: 'rgba(240,136,176,0.18)' }}>
          <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: BRAND }}>{title}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-white/60">
            <X className="h-4 w-4" style={{ color: BRAND }} />
          </button>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-200';
const labelCls = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500';

// File a new voucher (range or individual barcodes), or edit name / date / remarks.
function VoucherForm({ row, onClose, onSaved }) {
  const editing = !!row;
  const [customer, setCustomer] = useState(row?.customer_name ?? '');
  const [mode, setMode] = useState('range');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [list, setList] = useState('');
  const [issued, setIssued] = useState(row?.issued_date ?? todayManila());
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState(row?.remarks ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const parsed = useMemo(() => (mode === 'range' ? expandRange(from, to) : parseList(list)), [mode, from, to, list]);
  const qty = editing ? row.quantity : parsed.codes.length;
  const perCents = editing ? Math.round(row.amount_per_voucher * 100) : toCents(amount);
  const totalAmount = (qty * perCents) / 100;

  const valid = editing
    ? customer.trim() !== '' && issued !== ''
    : customer.trim() !== '' && issued !== '' && qty > 0 && !parsed.error && perCents > 0;

  async function submit(e) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      if (editing) {
        await api(`/vouchers/${row.id}`, { method: 'PUT', body: { customer_name: customer.trim(), issued_date: issued, remarks: remarks.trim() || null } });
      } else {
        await api('/vouchers', {
          method: 'POST',
          body: {
            customer_name: customer.trim(),
            mode,
            barcode_from: mode === 'range' ? from.trim() : null,
            barcode_to: mode === 'range' ? to.trim() : null,
            barcodes: mode === 'individual' ? list : null,
            issued_date: issued,
            amount_per_voucher: (perCents / 100).toFixed(2),
            remarks: remarks.trim() || null,
          },
        });
      }
      onSaved(editing ? 'Voucher updated.' : 'Voucher filed.');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title={editing ? 'Edit voucher' : 'New voucher'} onClose={busy ? () => {} : onClose} wide>
      <form onSubmit={submit} className="space-y-4 p-4">
        <div>
          <label className={labelCls} htmlFor="v-customer">Customer name / business name</label>
          <input id="v-customer" className={inputCls} value={customer} onChange={(e) => setCustomer(e.target.value)} maxLength={255} autoFocus />
        </div>

        {/* barcodes */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className={labelCls + ' mb-0'}>Voucher barcode</span>
            {!editing && (
              <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 text-xs font-semibold">
                {[['range', 'Range'], ['individual', 'Individual']].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMode(key)}
                    className="px-3 py-1.5"
                    style={mode === key ? { backgroundColor: BRAND, color: '#fff' } : { color: '#6b7280' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {editing ? (
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{barcodeLabel(row)} <span className="text-gray-400">({row.quantity})</span></p>
          ) : mode === 'range' ? (
            <div className="grid grid-cols-2 gap-3">
              <input className={inputCls} placeholder="From  e.g. MV-0001" aria-label="First barcode" value={from} onChange={(e) => setFrom(e.target.value)} maxLength={60} />
              <input className={inputCls} placeholder="To  e.g. MV-0100" aria-label="Last barcode" value={to} onChange={(e) => setTo(e.target.value)} maxLength={60} />
            </div>
          ) : (
            <textarea
              className={inputCls}
              rows={4}
              placeholder={'One barcode per line (or separated by commas)\nMV-0007\nMV-0015'}
              aria-label="Barcodes"
              value={list}
              onChange={(e) => setList(e.target.value)}
            />
          )}

          {!editing && (
            <p className="mt-1 text-xs" style={{ color: parsed.error ? '#dc2626' : '#6b7280' }}>
              {parsed.error
                ? parsed.error
                : qty > 0
                  ? `${qty.toLocaleString()} voucher${qty === 1 ? '' : 's'}: ${parsed.codes[0]}${qty > 1 ? ` … ${parsed.codes[qty - 1]}` : ''}`
                  : mode === 'range' ? 'Enter the first and last barcode of the range.' : 'Enter one or more barcodes.'}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="v-issued">Issued date</label>
            <input id="v-issued" type="date" className={inputCls} value={issued} onChange={(e) => setIssued(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="v-amount">Amount per voucher</label>
            {editing ? (
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-right text-sm text-gray-700">{peso(row.amount_per_voucher)}</p>
            ) : (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">₱</span>
                <input id="v-amount" inputMode="decimal" className={inputCls + ' pl-7 text-right'} placeholder="0.00" value={amount} onChange={(e) => setAmount(moneyInput(e.target.value))} />
              </div>
            )}
          </div>
        </div>

        {/* total */}
        <div className="flex items-center justify-between rounded-lg px-4 py-3" style={{ backgroundColor: 'rgba(240,136,176,0.12)' }}>
          <span className="text-sm font-medium text-gray-600">
            Total voucher amount <span className="text-xs text-gray-400">({qty.toLocaleString()} × {peso(perCents / 100)})</span>
          </span>
          <span className="text-xl font-bold" style={{ color: BRAND }}>{peso(totalAmount)}</span>
        </div>

        <div>
          <label className={labelCls} htmlFor="v-remarks">Remarks <span className="font-normal normal-case text-gray-400">(optional)</span></label>
          <textarea id="v-remarks" rows={2} className={inputCls} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={1000} />
        </div>

        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={!valid || busy} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" style={{ backgroundColor: BRAND }}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'File voucher'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// The individual barcodes of one filing and their status.
function VoucherView({ row, onClose }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api(`/vouchers/${row.id}`)
      .then((d) => !cancelled && setItems(d.items))
      .catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [row.id]);

  return (
    <Modal title={`Voucher · ${row.customer_name}`} onClose={onClose} wide>
      <div className="space-y-3 p-4 text-sm">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <p><span className="block text-xs text-gray-400">Issued</span>{niceDate(row.issued_date)}</p>
          <p><span className="block text-xs text-gray-400">Per voucher</span>{peso(row.amount_per_voucher)}</p>
          <p><span className="block text-xs text-gray-400">Quantity</span>{row.quantity.toLocaleString()}</p>
          <p><span className="block text-xs text-gray-400">Total amount</span><strong>{peso(row.total_amount)}</strong></p>
        </div>
        {row.remarks && <p className="rounded-lg bg-gray-50 px-3 py-2 text-gray-600">{row.remarks}</p>}

        <div className="max-h-[45vh] overflow-auto rounded-lg border border-gray-200 custom-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="sticky top-0 bg-gray-50 text-left text-xs text-gray-500">
                <th className="px-3 py-2 font-medium">Barcode</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Used</th>
              </tr>
            </thead>
            <tbody>
              {error && <tr><td colSpan={4} className="px-3 py-6 text-center text-red-600">{error}</td></tr>}
              {!error && items === null && <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">Loading…</td></tr>}
              {(items ?? []).map((v, i) => {
                const st = STATUS_STYLE[v.status] ?? STATUS_STYLE.void;
                return (
                  <tr key={v.id} className={i % 2 ? 'bg-white' : 'bg-pink-50/40'}>
                    <td className="px-3 py-2 font-mono text-gray-800">{v.barcode}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{peso(v.amount)}</td>
                    <td className="px-3 py-2"><span className="rounded-full px-2.5 py-0.5 text-xs font-medium capitalize" style={{ backgroundColor: st.bg, color: st.fg }}>{v.status}</span></td>
                    <td className="px-3 py-2 text-gray-500">{v.used_at ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

export default function VoucherManager() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(EMPTY_META);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(null); // null | { row: null | voucher }
  const [viewing, setViewing] = useState(null);

  // debounce the search box
  useEffect(() => {
    const t = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api(`/vouchers?page=${page}&search=${encodeURIComponent(term)}`);
      setRows(d.vouchers);
      setMeta(d.meta);
      setError('');
      if (d.meta.current_page !== page) setPage(d.meta.current_page);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [page, term]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  async function remove(row) {
    if (!window.confirm(`Delete the voucher filing for "${row.customer_name}" (${row.quantity} voucher${row.quantity === 1 ? '' : 's'})?`)) return;
    try {
      await api(`/vouchers/${row.id}`, { method: 'DELETE' });
      setNotice('Voucher deleted.');
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  const from = meta.total === 0 ? 0 : (meta.current_page - 1) * meta.per_page + 1;
  const to = Math.min(meta.current_page * meta.per_page, meta.total);

  return (
    <div className="min-h-[calc(100vh-10rem)] w-full bg-gray-50 p-2 sm:p-4">
      {/* toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Ticket className="h-5 w-5" style={{ color: BRAND }} />
          <h2 className="text-base font-semibold text-gray-800">Vouchers</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer or barcode"
              aria-label="Search vouchers"
              className="w-64 rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-pink-200"
            />
          </div>
          <button
            type="button"
            onClick={() => setForm({ row: null })}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: BRAND }}
          >
            <Plus className="h-4 w-4" />
            New voucher
          </button>
        </div>
      </div>

      {notice && <p className="mb-3 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700" role="status">{notice}</p>}
      {error && <p className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600" role="alert">{error}</p>}

      {/* list */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500" style={{ backgroundColor: 'rgba(240,136,176,0.14)' }}>
                <th className="px-4 py-2.5 font-medium">Customer / business</th>
                <th className="px-4 py-2.5 font-medium">Voucher barcode</th>
                <th className="px-4 py-2.5 font-medium">Issued date</th>
                <th className="px-4 py-2.5 text-right font-medium">Per voucher</th>
                <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                <th className="px-4 py-2.5 text-right font-medium">Total amount</th>
                <th className="px-4 py-2.5 font-medium">Used</th>
                <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
                    {loading ? 'Loading…' : term ? 'No vouchers match your search.' : 'No vouchers filed yet. Use “New voucher” to add one.'}
                  </td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr key={r.id} className={i % 2 ? 'bg-white' : 'bg-pink-50/40'} style={{ borderBottom: '1px solid rgba(240,136,176,0.12)' }}>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{r.customer_name}</td>
                  <td className="px-4 py-2.5 font-mono text-gray-700 whitespace-nowrap">{barcodeLabel(r)}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{niceDate(r.issued_date)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700 whitespace-nowrap">{peso(r.amount_per_voucher)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{r.quantity.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-800 whitespace-nowrap">{peso(r.total_amount)}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{r.used_count} / {r.quantity}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" onClick={() => setViewing(r)} title="View barcodes" aria-label={`View vouchers of ${r.customer_name}`} className="rounded p-1.5 hover:bg-pink-100">
                        <Eye className="h-4 w-4" style={{ color: BRAND }} />
                      </button>
                      <button type="button" onClick={() => setForm({ row: r })} title="Edit" aria-label={`Edit vouchers of ${r.customer_name}`} className="rounded p-1.5 hover:bg-pink-100">
                        <Pencil className="h-4 w-4" style={{ color: BRAND }} />
                      </button>
                      <button type="button" onClick={() => remove(r)} title="Delete" aria-label={`Delete vouchers of ${r.customer_name}`} className="rounded p-1.5 text-red-500 hover:bg-red-50">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-4 py-3">
          <p className="text-xs text-gray-500">{meta.total === 0 ? 'No vouchers' : `Showing ${from}–${to} of ${meta.total}`}</p>
          {meta.last_page > 1 && (
            <div className="flex items-center gap-1">
              <button type="button" disabled={meta.current_page <= 1} onClick={() => setPage(meta.current_page - 1)} className="h-8 rounded-lg border border-pink-200 px-3 text-sm font-medium disabled:opacity-40" style={{ color: BRAND }}>Prev</button>
              <span className="px-2 text-sm text-gray-500">Page {meta.current_page} of {meta.last_page}</span>
              <button type="button" disabled={meta.current_page >= meta.last_page} onClick={() => setPage(meta.current_page + 1)} className="h-8 rounded-lg border border-pink-200 px-3 text-sm font-medium disabled:opacity-40" style={{ color: BRAND }}>Next</button>
            </div>
          )}
        </div>
      </div>

      {form && (
        <VoucherForm
          row={form.row}
          onClose={() => setForm(null)}
          onSaved={(msg) => { setForm(null); setNotice(msg); load(); }}
        />
      )}
      {viewing && <VoucherView row={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
