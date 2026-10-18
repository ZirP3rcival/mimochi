import React, { useState, useEffect, useCallback } from 'react';
import { Tag, Gift, Package as PackageIcon, ShoppingBag, Pencil, CheckCircle2, RotateCcw, Trash2, Banknote, Minus, Plus, ChevronDown, ChevronRight } from 'lucide-react';

// ── helpers ────────────────────────────────────────────────────────────
function getXsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

async function api(url, method, body) {
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

const peso = (v) => `₱${Number(v || 0).toFixed(2)}`;

// Product quantity is a whole number from 1 to 999.
const normalizeQuantity = (v) => Math.min(999, Math.max(1, parseInt(v, 10) || 1));

const ordinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

const formatDate = (v) => {
    if (!v) return null;
    const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatTime = (v) => {
    if (!v) return null;
    const [h, m] = String(v).split(':');
    const d = new Date();
    d.setHours(Number(h), Number(m), 0, 0);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

const whenText = (line) => {
    const parts = [formatDate(line.scheduled_date), formatTime(line.scheduled_time), line.staff?.staff_name].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'Not scheduled yet';
};

const STATUS_META = {
    pending: { label: 'Pending', className: 'bg-gray-100 text-gray-500 border-gray-200' },
    ongoing: { label: 'On-going', className: 'bg-amber-50 text-amber-700 border-amber-100' },
    done: { label: 'Done', className: 'bg-green-50 text-green-700 border-green-100' },
    paid: { label: 'Paid', className: 'bg-sky-50 text-sky-700 border-sky-100' },
};

function StatusChip({ status }) {
    const meta = STATUS_META[status] || STATUS_META.pending;
    return (
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${meta.className}`}>
            {meta.label}
        </span>
    );
}

// Payment button, shown next to the "Done" chip only. Once paid the status
// becomes "Paid" and this button disappears.
function PayButton({ busy, onPay, title = 'Record payment' }) {
    return (
        <button
            type="button"
            disabled={busy}
            title={title}
            aria-label={title}
            onClick={onPay}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sky-600 hover:bg-sky-50"
        >
            <Banknote className="w-4 h-4" />
        </button>
    );
}

const confirmPay = (label) => window.confirm(`Record payment for "${label}"? It will be marked Paid and can no longer be changed.`);

const inputCls = 'w-full p-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[rgb(240,136,176)]';
const iconBtn = 'w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

// ── inline editor: date, time, staff, remarks (+ signature / free label) ──
function AssignmentEditor({ line, staff, busy, onSave, onCancel, isSession = false, isFree = false }) {
    const [f, setF] = useState({
        scheduled_date: line.scheduled_date || '',
        scheduled_time: line.scheduled_time ? String(line.scheduled_time).slice(0, 5) : '',
        staff_id: line.staff_id || '',
        remarks: line.remarks || '',
        signed: Boolean(line.signed_at),
        free_label: line.free_label || '',
    });
    const set = (key, value) => setF((prev) => ({ ...prev, [key]: value }));

    const submit = (e) => {
        e.preventDefault();
        const payload = {
            scheduled_date: f.scheduled_date || null,
            scheduled_time: f.scheduled_time || null,
            staff_id: f.staff_id ? Number(f.staff_id) : null,
            remarks: f.remarks || null,
        };
        if (isSession) {
            payload.signed = f.signed;
            if (isFree) payload.free_label = f.free_label || null;
        }
        onSave(payload);
    };

    return (
        <form onSubmit={submit} className="mt-2 p-3 border border-gray-100 rounded-xl bg-gray-50/60 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">Date</label>
                    <input type="date" value={f.scheduled_date} onChange={(e) => set('scheduled_date', e.target.value)} className={inputCls} />
                </div>
                <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">Time</label>
                    <input type="time" value={f.scheduled_time} onChange={(e) => set('scheduled_time', e.target.value)} className={inputCls} />
                </div>
                <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">Staff</label>
                    <select value={f.staff_id} onChange={(e) => set('staff_id', e.target.value)} className={inputCls}>
                        <option value="">Unassigned</option>
                        {staff.map((s) => <option key={s.id} value={s.id}>{s.staff_name}</option>)}
                    </select>
                </div>
            </div>

            {isFree && (
                <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">Free service given</label>
                    <input type="text" value={f.free_label} onChange={(e) => set('free_label', e.target.value)} placeholder="e.g. Free Session, Facial" className={inputCls} />
                </div>
            )}

            <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Remarks</label>
                <textarea rows={2} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} className={`${inputCls} resize-none`} />
            </div>

            <div className="flex items-center justify-between gap-3">
                {isSession ? (
                    <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                        <input type="checkbox" checked={f.signed} onChange={(e) => set('signed', e.target.checked)} />
                        Client signed
                    </label>
                ) : <span />}
                <div className="flex gap-2">
                    <button type="button" onClick={onCancel} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-white transition">Cancel</button>
                    <button type="submit" disabled={busy} className="px-3 py-1.5 bg-[rgb(240,136,176)] hover:bg-[rgb(225,120,160)] disabled:bg-gray-300 text-white rounded-lg text-xs font-semibold transition">
                        {busy ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>
        </form>
    );
}

// ── one schedulable row: an item, or one item inside a bundle ──────────
function LineRow({ title, subtitle, line, url, staff, editingKey, editing, setEditing, busy, save, onDelete, selected, onToggleSelect, color }) {
    const isEditing = editing === editingKey;
    const done = line.status === 'done';
    const isPaid = line.status === 'paid';

    return (
        <div className={`p-3 ${color ? `rounded-xl border border-l-4 ${color.border} ${color.accent} ${color.head}` : ''}`}>
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <h5 className="text-sm font-semibold text-gray-800 truncate">{title}</h5>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{subtitle}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{whenText(line)}</p>
                    {line.remarks && <p className="text-[11px] text-gray-400 italic truncate mt-0.5">{line.remarks}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <StatusChip status={line.status} />
                    {!isPaid && (
                        <>
                            <button type="button" title="Assign date, time & staff" aria-label="Assign date, time and staff" onClick={() => setEditing(isEditing ? null : editingKey)} className={`${iconBtn} hover:bg-gray-100 text-gray-500`}>
                                <Pencil className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                disabled={busy || (!done && !line.staff_id) || (!done && !line.scheduled_date) || (!done && !line.scheduled_time)}
                                title={done ? 'Reopen' : 'Mark done (needs date, time & staff)'}
                                aria-label={done ? 'Reopen' : 'Mark done'}
                                onClick={() => save(url, { done: !done })}
                                className={`${iconBtn} ${done ? 'text-amber-600 hover:bg-amber-50' : 'text-green-600 hover:bg-green-50'}`}
                            >
                                {done ? <RotateCcw className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                            </button>
                            {onDelete && !done && (
                                <button type="button" title="Delete booking" aria-label="Delete booking" onClick={onDelete} className={`${iconBtn} text-red-500 hover:bg-red-50`}>
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </>
                    )}
                    {done && onToggleSelect && (
                        <SelectBox checked={Boolean(selected)} onChange={onToggleSelect} label={`Select ${title} for payment`} />
                    )}
                </div>
            </div>
            {isEditing && !isPaid && (
                <AssignmentEditor key={line.id} line={line} staff={staff} busy={busy} onCancel={() => setEditing(null)} onSave={(payload) => save(url, payload)} />
            )}
        </div>
    );
}

// Tick box that adds a record to the Payment list.
function SelectBox({ checked, onChange, label }) {
    return (
        <label className="w-8 h-8 flex items-center justify-center cursor-pointer" title="Select for payment">
            <input type="checkbox" checked={checked} onChange={onChange} aria-label={label} className="w-4 h-4 accent-green-600 cursor-pointer" />
        </label>
    );
}

// ── one booked product ─────────────────────────────────────────────────
// No scheduling, status, pencil or done button: just quantity, delete and
// the payment checkbox (last). Once paid it only shows a Paid chip.
function ProductRow({ row, busy, onQuantity, onDelete, selected, onToggleSelect, color }) {
    const qty = normalizeQuantity(row.quantity);
    const total = row.total ?? Number(row.price || 0) * qty;
    const isPaid = row.status === 'paid';

    return (
        <div className={`p-3 flex items-center justify-between gap-3 ${color ? `rounded-xl border border-l-4 ${color.border} ${color.accent} ${color.head}` : ''}`}>
            <div className="min-w-0">
                <h5 className="text-sm font-semibold text-gray-800 truncate">{row.product_name}</h5>
                <p className="text-xs text-gray-500 truncate mt-0.5">
                    Product · {peso(row.price)} × {qty} = <span className="font-semibold text-gray-700">{peso(total)}</span>
                </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
                {isPaid ? (
                    <StatusChip status="paid" />
                ) : (
                    <>
                        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden mr-1">
                            <button type="button" disabled={busy || qty <= 1} onClick={() => onQuantity(qty - 1)} aria-label={`Decrease quantity of ${row.product_name}`} className="w-7 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                                <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-9 text-center text-sm font-semibold text-gray-700">{qty}</span>
                            <button type="button" disabled={busy || qty >= 999} onClick={() => onQuantity(qty + 1)} aria-label={`Increase quantity of ${row.product_name}`} className="w-7 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                                <Plus className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        {row.status !== 'done' && (
                            <button type="button" title="Delete product" aria-label="Delete product" onClick={onDelete} className={`${iconBtn} text-red-500 hover:bg-red-50`}>
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                        <SelectBox checked={Boolean(selected)} onChange={onToggleSelect} label={`Select ${row.product_name} for payment`} />
                    </>
                )}
            </div>
        </div>
    );
}

// ── package card (mirrors the paper card) ─────────────────────────────
// One table: a column per session (1st, 2nd ...). Under the numbered
// session rows sit the optional Free rows (Free, Date, Time, Staff,
// Signature) for the same columns, then Status and Remarks.
const cell = 'border border-gray-300 px-2 py-2 text-center align-middle';

function PackageCard({ record, client, staff, editing, setEditing, busy, save, onDelete, onPay, open, onToggle, color = CARD_COLORS[0] }) {
    const paid = record.sessions.filter((s) => !s.is_free);
    const freeBySeq = Object.fromEntries(record.sessions.filter((s) => s.is_free).map((s) => [s.sequence, s]));
    const active = record.sessions.find((s) => editing === `session-${s.id}`);
    const doneCount = paid.filter((s) => s.status === 'done' || s.status === 'paid').length;
    const recordPaid = record.status === 'paid';
    const clientName = [client.first_name, client.last_name].filter(Boolean).join(' ') || '—';

    const toggle = (s) => {
        if (s) setEditing(editing === `session-${s.id}` ? null : `session-${s.id}`);
    };

    const dash = <span className="text-gray-400">—</span>;
    const dateOf = (s) => formatDate(s?.scheduled_date) || dash;
    const timeOf = (s) => formatTime(s?.scheduled_time) || dash;
    const staffOf = (s) => s?.staff?.staff_name || dash;
    const signOf = (s) => (s?.signed_at ? '✓ Signed' : dash);

    // free: true -> the cell belongs to the free slot under that column.
    const rows = [
        { label: 'Date', render: dateOf },
        { label: 'Time', render: timeOf },
        { label: 'Staff', render: staffOf },
        { label: 'Signature', render: signOf },
        {
            label: 'Free', free: true, tone: 'bg-indigo-100 text-indigo-900',
            render: (s) => (s?.free_label
                ? <span className="font-semibold">{s.free_label}{s.status === 'done' || s.status === 'paid' ? ' ✓' : ''}</span>
                : dash),
        },
        { label: 'Date', free: true, render: dateOf },
        { label: 'Time', free: true, render: timeOf },
        { label: 'Staff', free: true, render: staffOf },
        { label: 'Signature', free: true, render: signOf },
        { label: 'Status', render: (s) => <StatusChip status={s.status} /> },
        { label: 'Remarks', tone: 'bg-amber-100 text-amber-900', render: (s) => <span className="text-gray-500">{s.remarks || '—'}</span> },
    ];

    return (
        <div className={`border ${color.border} rounded-xl overflow-hidden bg-white`}>
            <div className="grid grid-cols-[6rem_1fr] text-sm">
                <div className={`${color.label} px-3 py-2 font-bold border-b border-white`}>Name</div>
                <div className="px-3 py-2 border-b border-gray-100">{clientName}</div>
                <div className={`${color.label} px-3 py-2 font-bold`}>Package</div>
                <div className="px-3 py-2 flex items-center justify-between gap-2">
                    <button
                        type="button"
                        onClick={onToggle}
                        aria-expanded={open}
                        title={open ? 'Collapse package card' : 'Expand package card'}
                        className="flex items-center gap-1.5 min-w-0 text-left font-semibold text-gray-800"
                    >
                        {open ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                        <span className="truncate">
                            {record.package_name} <span className="text-xs font-normal text-gray-400">· {peso(record.package_price)} · {doneCount}/{paid.length} done</span>
                        </span>
                    </button>
                    <span className="flex items-center gap-1">
                        <StatusChip status={record.status} />
                        {record.status === 'done' && <PayButton busy={busy} onPay={onPay} />}
                        {!recordPaid && record.status !== 'done' && (
                            <button type="button" title="Delete package record" aria-label="Delete package record" onClick={onDelete} className={`${iconBtn} text-red-500 hover:bg-red-50`}>
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </span>
                </div>
            </div>

            {open && (
            <div className="p-3 space-y-3">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs" style={{ minWidth: 110 + paid.length * 120 }}>
                        <thead>
                            <tr>
                                <th className={`${cell} w-28 font-bold ${color.label}`}>Session</th>
                                {paid.map((s) => (
                                    <th
                                        key={s.id}
                                        onClick={() => toggle(s)}
                                        className={`${cell} font-bold cursor-pointer hover:bg-pink-50 ${editing === `session-${s.id}` ? 'bg-pink-50 ring-2 ring-inset ring-[rgb(240,136,176)]' : 'bg-white'}`}
                                    >
                                        <div className="relative flex items-center justify-center">
                                            <span>{ordinal(s.sequence)}</span>
                                            {s.status !== 'paid' && (
                                                <button
                                                    type="button"
                                                    disabled={busy || (s.status !== 'done' && !(s.scheduled_date && s.scheduled_time && s.staff_id))}
                                                    title={s.status === 'done' ? 'Reopen' : 'Mark done (needs date, time & staff)'}
                                                    aria-label={`${s.status === 'done' ? 'Reopen' : 'Mark done'} ${ordinal(s.sequence)} session`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        save(`/clients/${client.id}/package-sessions/${s.id}`, { done: s.status !== 'done' });
                                                    }}
                                                    className={`${iconBtn} absolute right-0 top-1/2 -translate-y-1/2 disabled:opacity-40 disabled:cursor-not-allowed ${s.status === 'done' ? 'text-amber-600 hover:bg-amber-50' : 'text-green-600 hover:bg-green-50'}`}
                                                >
                                                    {s.status === 'done' ? <RotateCcw className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                                                </button>
                                            )}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, i) => (
                                <tr key={`${row.label}-${i}`}>
                                    <th className={`${cell} font-semibold text-left ${row.tone || 'bg-gray-50 text-gray-700'}`}>{row.label}</th>
                                    {paid.map((s) => {
                                        const target = row.free ? freeBySeq[s.sequence] : s;
                                        const selected = target && editing === `session-${target.id}`;
                                        return (
                                            <td
                                                key={s.id}
                                                onClick={() => toggle(target)}
                                                className={`${cell} ${target ? 'cursor-pointer hover:bg-pink-50/50' : ''} ${selected ? 'bg-pink-50/70' : ''}`}
                                            >
                                                {row.render(target || s)}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <p className="text-[11px] text-gray-400">
                    Click any cell to assign its date, time and staff, record the signature, or add remarks. The Free rows are optional.
                </p>

                {active && (
                    <div>
                        <div className="flex items-center justify-between">
                            <h5 className="text-xs font-bold text-gray-700">
                                {active.is_free ? `Free · ${ordinal(active.sequence)} session column` : `${ordinal(active.sequence)} session`}
                            </h5>
                            {active.status !== 'paid' && (
                                <button
                                    type="button"
                                    disabled={busy || (active.status !== 'done' && !(active.scheduled_date && active.scheduled_time && active.staff_id))}
                                    onClick={() => save(`/clients/${client.id}/package-sessions/${active.id}`, { done: active.status !== 'done' })}
                                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition disabled:opacity-40 disabled:cursor-not-allowed ${
                                        active.status === 'done' ? 'text-amber-700 border-amber-200 hover:bg-amber-50' : 'text-green-700 border-green-200 hover:bg-green-50'
                                    }`}
                                >
                                    {active.status === 'done' ? <><RotateCcw className="w-3.5 h-3.5" /> Reopen</> : <><CheckCircle2 className="w-3.5 h-3.5" /> Mark done</>}
                                </button>
                            )}
                        </div>
                        {active.status === 'paid' ? (
                            <p className="text-xs text-sky-700 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2 mt-2">
                                This session has been paid and is locked.
                            </p>
                        ) : (
                            <AssignmentEditor
                                key={active.id}
                                line={active}
                                staff={staff}
                                busy={busy}
                                isSession
                                isFree={active.is_free}
                                onCancel={() => setEditing(null)}
                                onSave={(payload) => save(`/clients/${client.id}/package-sessions/${active.id}`, payload)}
                            />
                        )}
                    </div>
                )}
            </div>
            )}
        </div>
    );
}

// ── list helpers: colours, done-last ordering, paging ───────────────────
const PAGE_SIZE = 5;

// Static class names (Tailwind can't see dynamically built ones).
const CARD_COLORS = [
    { border: 'border-pink-300',    accent: 'border-l-pink-400',    head: 'bg-pink-50',    label: 'bg-pink-100 text-pink-900' },
    { border: 'border-orange-300',  accent: 'border-l-orange-400',  head: 'bg-orange-50',  label: 'bg-orange-100 text-orange-900' },
    { border: 'border-emerald-300', accent: 'border-l-emerald-400', head: 'bg-emerald-50', label: 'bg-emerald-100 text-emerald-900' },
    { border: 'border-sky-300',     accent: 'border-l-sky-400',     head: 'bg-sky-50',     label: 'bg-sky-100 text-sky-900' },
    { border: 'border-violet-300',  accent: 'border-l-violet-400',  head: 'bg-violet-50',  label: 'bg-violet-100 text-violet-900' },
    { border: 'border-teal-300',    accent: 'border-l-teal-400',    head: 'bg-teal-50',    label: 'bg-teal-100 text-teal-900' },
    { border: 'border-fuchsia-300', accent: 'border-l-fuchsia-400', head: 'bg-fuchsia-50', label: 'bg-fuchsia-100 text-fuchsia-900' },
    { border: 'border-lime-300',    accent: 'border-l-lime-400',    head: 'bg-lime-50',    label: 'bg-lime-100 text-lime-900' },
];

// Looks random but is fixed per record, so a card keeps its colour across
// re-renders. Multiplying by 5 (coprime with 8) means any 8 consecutive ids
// get 8 different colours; the salt keeps bundles and packages from lining up.
const cardColor = (id, salt = 0) => CARD_COLORS[(Number(id) * 5 + salt) % CARD_COLORS.length];

// Open work first, then Done, then Paid. Array.sort is stable, so each group
// keeps the server's newest-first order.
const STATUS_RANK = { done: 1, paid: 2 };
const doneLast = (rows) => [...rows].sort((a, b) => (STATUS_RANK[a.status] || 0) - (STATUS_RANK[b.status] || 0));

function Pager({ page, lastPage, total, onPage }) {
    if (total <= PAGE_SIZE) return null;
    const from = (page - 1) * PAGE_SIZE + 1;
    const to = Math.min(page * PAGE_SIZE, total);
    const btn = 'px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-[rgb(240,136,176)] hover:bg-[rgb(225,120,160)] shadow-sm transition disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed';

    return (
        <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} className={btn}>← Prev</button>
            <span className="text-xs text-gray-500 font-medium">{from}–{to} of {total} · Page {page} of {lastPage}</span>
            <button type="button" onClick={() => onPage(page + 1)} disabled={page >= lastPage} className={btn}>Next →</button>
        </div>
    );
}

// ── payment window ─────────────────────────────────────────────────────
// Ticked together for payment: Done items, Done bundles and unpaid products.
// (Package cards keep their own Done -> Pay button.)
const payableKeys = (b) => new Set([
    ...(b.items || []).filter((r) => r.status === 'done').map((r) => `item-${r.id}`),
    ...(b.bundles || []).filter((r) => r.status === 'done').map((r) => `bundle-${r.id}`),
    ...(b.products || []).filter((r) => r.status !== 'paid').map((r) => `product-${r.id}`),
]);

function PaymentWindow({ entries, busy, error, onClose, onConfirm }) {
    const total = entries.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Payment">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                    <h3 className="text-sm font-bold text-gray-800">Record Payment</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Paid records are locked and can no longer be edited.</p>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
                    {entries.map((e) => (
                        <div key={e.key} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                            <div className="min-w-0">
                                <p className="font-semibold text-gray-800 truncate">{e.label}</p>
                                <p className="text-xs text-gray-400">{e.typeLabel}</p>
                            </div>
                            <span className="font-semibold text-gray-700 shrink-0">{peso(e.amount)}</span>
                        </div>
                    ))}
                </div>
                <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500">Total</span>
                    <span className="text-base font-bold text-gray-800">{peso(total)}</span>
                </div>
                {error && <div className="mx-5 mb-3 rounded-lg px-3 py-2 text-xs font-medium border bg-red-50 text-red-700 border-red-100">⚠️ {error}</div>}
                <div className="px-5 pb-4 flex justify-end gap-2">
                    <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition disabled:opacity-50">Cancel</button>
                    <button type="button" onClick={onConfirm} disabled={busy || entries.length === 0} className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded-lg text-sm font-semibold transition">
                        {busy ? 'Recording...' : 'Record payment'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── main board ─────────────────────────────────────────────────────────
const SECTIONS = {
    items: { label: 'Items', icon: Tag },
    bundles: { label: 'Bundles', icon: Gift },
    packages: { label: 'Packages', icon: PackageIcon },
    products: { label: 'Products', icon: ShoppingBag },
};

// selection / setSelection / payOpen / setPayOpen come from ClientRecord so its
// Payment buttons share the ticked list; the board falls back to its own state
// when used on its own.
export default function ClientScheduleBoard({ client, selection: selectionProp, setSelection: setSelectionProp, payOpen: payOpenProp, setPayOpen: setPayOpenProp }) {
    const [localSelection, setLocalSelection] = useState([]);
    const [localPayOpen, setLocalPayOpen] = useState(false);
    const selection = selectionProp ?? localSelection;
    const setSelection = setSelectionProp ?? setLocalSelection;
    const payOpen = payOpenProp ?? localPayOpen;
    const setPayOpen = setPayOpenProp ?? setLocalPayOpen;
    const [payBusy, setPayBusy] = useState(false);
    const [payError, setPayError] = useState(null);

    const [data, setData] = useState({ items: [], bundles: [], packages: [], products: [] });
    const [staff, setStaff] = useState([]);
    const [tab, setTab] = useState('items');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [editing, setEditing] = useState(null);
    // Bundle and package cards start collapsed; this tracks which are open.
    const [openCards, setOpenCards] = useState({});
    // Current page of each tab's list (5 per page).
    const [pages, setPages] = useState({ items: 1, bundles: 1, packages: 1, products: 1 });
    const setPage = (key, page) => setPages((prev) => ({ ...prev, [key]: page }));
    const isOpen = (key) => Boolean(openCards[key]);
    const toggleOpen = (key) => setOpenCards((prev) => ({ ...prev, [key]: !prev[key] }));
    const [busy, setBusy] = useState(false);

    // Store fresh bookings and drop ticks on anything no longer payable
    // (paid, deleted or reopened).
    const applyBookings = useCallback((bookings) => {
        setData(bookings);
        const keys = payableKeys(bookings);
        setSelection((prev) => prev.filter((entry) => keys.has(entry.key)));
    }, [setSelection]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            applyBookings(await api(`/clients/${client.id}/schedules`, 'GET'));
        } catch (err) {
            setError(err.message || 'Unable to load the service record right now.');
        } finally {
            setLoading(false);
        }
    }, [client.id, applyBookings]);

    useEffect(() => {
        load();
        api('/schedule-staff', 'GET').then((b) => setStaff(b.staff || [])).catch(() => setStaff([]));
    }, [load]);

    // Every mutation returns the refreshed bookings, so state stays in sync.
    const run = async (request) => {
        setBusy(true);
        setNotice(null);
        try {
            const body = await request();
            if (body.bookings) applyBookings(body.bookings);
            setEditing(null);
        } catch (err) {
            setNotice(err.message);
        } finally {
            setBusy(false);
        }
    };

    const save = (url, payload) => run(() => api(url, 'PATCH', payload));

    const isSelected = (key) => selection.some((entry) => entry.key === key);
    const toggleSelect = (entry) => setSelection((prev) => (
        prev.some((e) => e.key === entry.key) ? prev.filter((e) => e.key !== entry.key) : [...prev, entry]
    ));

    // Pays the ticked records one by one; stops at the first failure.
    const confirmPayment = async () => {
        setPayBusy(true);
        setPayError(null);
        try {
            for (const entry of selection) {
                const res = entry.type === 'bundle'
                    ? await api(`/clients/${client.id}/bundle-schedules/${entry.id}/pay`, 'PATCH')
                    : await api(`/clients/${client.id}/${entry.type === 'item' ? 'schedule-items' : 'schedule-products'}/${entry.id}`, 'PATCH', { paid: true });
                if (res.bookings) applyBookings(res.bookings);
            }
            setPayOpen(false);
        } catch (err) {
            setPayError(err.message);
        } finally {
            setPayBusy(false);
        }
    };

    const remove = (type, id, label) => {
        if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
        run(() => api(`/clients/${client.id}/schedules/${type}/${id}`, 'DELETE'));
    };

    const products = data.products || [];

    // Done / paid last, then the first 5 of the current page. The page is
    // clamped so deleting or paying the last row of a page never strands you.
    const paginate = (list, key) => {
        const sorted = doneLast(list);
        const lastPage = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
        const page = Math.min(pages[key] || 1, lastPage);
        return { rows: sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), page, lastPage, total: sorted.length, onPage: (p) => setPage(key, p) };
    };
    const view = {
        items: paginate(data.items, 'items'),
        bundles: paginate(data.bundles, 'bundles'),
        packages: paginate(data.packages, 'packages'),
        products: paginate(products, 'products'),
    };
    const counts = { items: data.items.length, bundles: data.bundles.length, packages: data.packages.length, products: products.length };
    const empty = (
        <div className="text-center py-12 text-gray-400 text-sm flex flex-col items-center gap-1">
            <span className="text-2xl">🗓️</span>
            <span>Nothing booked here yet.</span>
        </div>
    );

    return (
        <div className="space-y-3">
            <div className="flex border-b border-gray-100">
                {Object.entries(SECTIONS).map(([key, { label, icon: Icon }]) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => { setTab(key); setEditing(null); }}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                            tab === key ? 'border-[rgb(240,136,176)] text-[rgb(225,90,140)]' : 'border-transparent text-gray-400 hover:text-gray-600'
                        }`}
                    >
                        <Icon className="w-4 h-4" /> {label} <span className="text-xs text-gray-400">({counts[key]})</span>
                    </button>
                ))}
            </div>

            {notice && <div className="rounded-lg px-4 py-3 text-sm font-medium border bg-red-50 text-red-700 border-red-100">⚠️ {notice}</div>}

            {loading ? (
                <div className="text-center py-12 text-gray-400 text-sm">Loading service record…</div>
            ) : error ? (
                <div className="text-center py-12 text-red-400 text-sm px-6">{error}</div>
            ) : (
                <>
                    {tab === 'items' && (data.items.length === 0 ? empty : (
                        <div className="space-y-3">
                        <div className="space-y-2">
                            {view.items.rows.map((row) => {
                                const key = `item-${row.id}`;
                                return (
                                    <LineRow
                                        key={row.id}
                                        color={cardColor(row.id, 1)}
                                        title={row.item_name}
                                        subtitle={`Item · ${peso(row.price)}`}
                                        line={row}
                                        url={`/clients/${client.id}/schedule-items/${row.id}`}
                                        staff={staff}
                                        editingKey={key}
                                        editing={editing}
                                        setEditing={setEditing}
                                        busy={busy}
                                        save={save}
                                        onDelete={() => remove('item', row.id, row.item_name)}
                                        selected={isSelected(key)}
                                        onToggleSelect={() => toggleSelect({ key, type: 'item', id: row.id, typeLabel: 'Item', label: row.item_name, amount: row.price })}
                                    />
                                );
                            })}
                        </div>
                        <Pager {...view.items} />
                        </div>
                    ))}

                    {tab === 'products' && (products.length === 0 ? empty : (
                        <div className="space-y-3">
                        <div className="space-y-2">
                            {view.products.rows.map((row) => {
                                const key = `product-${row.id}`;
                                return (
                                    <ProductRow
                                        key={row.id}
                                        row={row}
                                        color={cardColor(row.id, 2)}
                                        busy={busy}
                                        onQuantity={(quantity) => save(`/clients/${client.id}/schedule-products/${row.id}`, { quantity })}
                                        onDelete={() => remove('product', row.id, row.product_name)}
                                        selected={isSelected(key)}
                                        onToggleSelect={() => toggleSelect({
                                            key, type: 'product', id: row.id, typeLabel: 'Product', label: row.product_name,
                                            amount: row.total ?? Number(row.price || 0) * normalizeQuantity(row.quantity),
                                        })}
                                    />
                                );
                            })}
                        </div>
                        <Pager {...view.products} />
                        </div>
                    ))}

                    {tab === 'bundles' && (data.bundles.length === 0 ? empty : (
                        <div className="space-y-3">
                        {view.bundles.rows.map((bundle) => {
                        const doneLines = bundle.lines.filter((l) => l.status === 'done' || l.status === 'paid').length;
                        const open = isOpen(`bundle-${bundle.id}`);
                        const color = cardColor(bundle.id, 0);
                        return (
                            <div key={bundle.id} className={`border border-l-4 ${color.border} ${color.accent} rounded-xl overflow-hidden bg-white`}>
                                <div className={`flex items-center justify-between gap-3 px-4 py-3 ${color.head} ${open ? `border-b ${color.border}` : ''}`}>
                                    <button
                                        type="button"
                                        onClick={() => toggleOpen(`bundle-${bundle.id}`)}
                                        aria-expanded={open}
                                        title={open ? 'Collapse bundle' : 'Expand bundle'}
                                        className="flex items-center gap-2 min-w-0 flex-1 text-left"
                                    >
                                        {open ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                                        <div className="min-w-0">
                                            <h4 className="text-sm font-bold text-gray-800 truncate">{bundle.bundle_name}</h4>
                                            <p className="text-xs text-gray-500">Bundle · {peso(bundle.bundle_price)} · {doneLines}/{bundle.lines.length} done</p>
                                        </div>
                                    </button>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <StatusChip status={bundle.status} />
                                        {bundle.status !== 'paid' && bundle.status !== 'done' && (
                                            <button type="button" title="Delete bundle booking" aria-label="Delete bundle booking" onClick={() => remove('bundle', bundle.id, bundle.bundle_name)} className={`${iconBtn} text-red-500 hover:bg-red-50`}>
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                        {bundle.status === 'done' && (
                                            <SelectBox
                                                checked={isSelected(`bundle-${bundle.id}`)}
                                                label={`Select ${bundle.bundle_name} for payment`}
                                                onChange={() => toggleSelect({ key: `bundle-${bundle.id}`, type: 'bundle', id: bundle.id, typeLabel: 'Bundle', label: bundle.bundle_name, amount: bundle.bundle_price })}
                                            />
                                        )}
                                    </div>
                                </div>
                                {open && (
                                <div className="divide-y divide-gray-50">
                                    {bundle.lines.map((line) => (
                                        <LineRow
                                            key={line.id}
                                            title={line.item_name}
                                            subtitle="Bundle item"
                                            line={line}
                                            url={`/clients/${client.id}/bundle-schedule-lines/${line.id}`}
                                            staff={staff}
                                            editingKey={`line-${line.id}`}
                                            editing={editing}
                                            setEditing={setEditing}
                                            busy={busy}
                                            save={save}
                                        />
                                    ))}
                                </div>
                                )}
                            </div>
                        );
                        })}
                        <Pager {...view.bundles} />
                        </div>
                    ))}

                    {tab === 'packages' && (data.packages.length === 0 ? empty : (
                        <div className="space-y-4">
                            {view.packages.rows.map((record) => (
                                <PackageCard
                                    key={record.id}
                                    record={record}
                                    client={client}
                                    staff={staff}
                                    editing={editing}
                                    setEditing={setEditing}
                                    busy={busy}
                                    save={save}
                                    onDelete={() => remove('package', record.id, record.package_name)}
                                    color={cardColor(record.id, 3)}
                                    open={isOpen(`package-${record.id}`)}
                                    onToggle={() => toggleOpen(`package-${record.id}`)}
                                    onPay={() => confirmPay(record.package_name) && run(() => api(`/clients/${client.id}/package-records/${record.id}/pay`, 'PATCH'))}
                                />
                            ))}
                            <Pager {...view.packages} />
                        </div>
                    ))}
                </>
            )}

            {payOpen && (
                <PaymentWindow
                    entries={selection}
                    busy={payBusy}
                    error={payError}
                    onClose={() => { setPayOpen(false); setPayError(null); }}
                    onConfirm={confirmPayment}
                />
            )}
        </div>
    );
}
