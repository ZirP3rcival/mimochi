import React, { useState, useEffect, useCallback } from 'react';
import { Tag, Gift, Package as PackageIcon, Pencil, CheckCircle2, RotateCcw, Trash2 } from 'lucide-react';

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
};

function StatusChip({ status }) {
    const meta = STATUS_META[status] || STATUS_META.pending;
    return (
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${meta.className}`}>
            {meta.label}
        </span>
    );
}

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
function LineRow({ title, subtitle, line, url, staff, editingKey, editing, setEditing, busy, save, onDelete }) {
    const isEditing = editing === editingKey;
    const done = line.status === 'done';

    return (
        <div className="p-3">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <h5 className="text-sm font-semibold text-gray-800 truncate">{title}</h5>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{subtitle}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{whenText(line)}</p>
                    {line.remarks && <p className="text-[11px] text-gray-400 italic truncate mt-0.5">{line.remarks}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <StatusChip status={line.status} />
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
                    {onDelete && (
                        <button type="button" title="Delete booking" aria-label="Delete booking" onClick={onDelete} className={`${iconBtn} text-red-500 hover:bg-red-50`}>
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
            {isEditing && (
                <AssignmentEditor key={line.id} line={line} staff={staff} busy={busy} onCancel={() => setEditing(null)} onSave={(payload) => save(url, payload)} />
            )}
        </div>
    );
}

// ── package card (mirrors the paper card) ─────────────────────────────
// One table: a column per session (1st, 2nd ...). Under the numbered
// session rows sit the optional Free rows (Free, Date, Time, Staff,
// Signature) for the same columns, then Status and Remarks.
const cell = 'border border-gray-300 px-2 py-2 text-center align-middle';

function PackageCard({ record, client, staff, editing, setEditing, busy, save, onDelete, onAddSession }) {
    const paid = record.sessions.filter((s) => !s.is_free);
    const freeBySeq = Object.fromEntries(record.sessions.filter((s) => s.is_free).map((s) => [s.sequence, s]));
    const active = record.sessions.find((s) => editing === `session-${s.id}`);
    const doneCount = paid.filter((s) => s.status === 'done').length;
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
                ? <span className="font-semibold">{s.free_label}{s.status === 'done' ? ' ✓' : ''}</span>
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
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
            <div className="grid grid-cols-[6rem_1fr] text-sm">
                <div className="bg-pink-100 px-3 py-2 font-bold text-pink-900 border-b border-white">Name</div>
                <div className="px-3 py-2 border-b border-gray-100">{clientName}</div>
                <div className="bg-pink-100 px-3 py-2 font-bold text-pink-900">Package</div>
                <div className="px-3 py-2 flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-800">
                        {record.package_name} <span className="text-xs font-normal text-gray-400">· {peso(record.package_price)} · {doneCount}/{paid.length} done</span>
                    </span>
                    <span className="flex items-center gap-1">
                        <StatusChip status={record.status} />
                        <button type="button" title="Delete package record" aria-label="Delete package record" onClick={onDelete} className={`${iconBtn} text-red-500 hover:bg-red-50`}>
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </span>
                </div>
            </div>

            <div className="p-3 space-y-3">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs" style={{ minWidth: 110 + paid.length * 120 }}>
                        <thead>
                            <tr>
                                <th className={`${cell} w-28 font-bold bg-pink-100 text-pink-900`}>Session</th>
                                {paid.map((s) => (
                                    <th
                                        key={s.id}
                                        onClick={() => toggle(s)}
                                        className={`${cell} font-bold cursor-pointer hover:bg-pink-50 ${editing === `session-${s.id}` ? 'bg-pink-50 ring-2 ring-inset ring-[rgb(240,136,176)]' : 'bg-white'}`}
                                    >
                                        {ordinal(s.sequence)}
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

                <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] text-gray-400">
                        Click any cell to assign its date, time and staff, record the signature, or add remarks. The Free rows are optional.
                    </p>
                    <button
                        type="button"
                        onClick={onAddSession}
                        disabled={busy || paid.length >= 50}
                        className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition whitespace-nowrap disabled:opacity-40"
                    >
                        + Add session
                    </button>
                </div>

                {active && (
                    <div>
                        <div className="flex items-center justify-between">
                            <h5 className="text-xs font-bold text-gray-700">
                                {active.is_free ? `Free · ${ordinal(active.sequence)} session column` : `${ordinal(active.sequence)} session`}
                            </h5>
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
                        </div>
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
                    </div>
                )}
            </div>
        </div>
    );
}

// ── main board ─────────────────────────────────────────────────────────
const SECTIONS = {
    items: { label: 'Items', icon: Tag },
    bundles: { label: 'Bundles', icon: Gift },
    packages: { label: 'Packages', icon: PackageIcon },
};

export default function ClientScheduleBoard({ client }) {
    const [data, setData] = useState({ items: [], bundles: [], packages: [] });
    const [staff, setStaff] = useState([]);
    const [tab, setTab] = useState('items');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [editing, setEditing] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setData(await api(`/clients/${client.id}/schedules`, 'GET'));
        } catch (err) {
            setError(err.message || 'Unable to load the service record right now.');
        } finally {
            setLoading(false);
        }
    }, [client.id]);

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
            if (body.bookings) setData(body.bookings);
            setEditing(null);
        } catch (err) {
            setNotice(err.message);
        } finally {
            setBusy(false);
        }
    };

    const save = (url, payload) => run(() => api(url, 'PATCH', payload));

    const remove = (type, id, label) => {
        if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
        run(() => api(`/clients/${client.id}/schedules/${type}/${id}`, 'DELETE'));
    };

    const counts = { items: data.items.length, bundles: data.bundles.length, packages: data.packages.length };
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
                        <div className="border border-gray-100 rounded-xl divide-y divide-gray-50">
                            {data.items.map((row) => (
                                <LineRow
                                    key={row.id}
                                    title={row.item_name}
                                    subtitle={`Item · ${peso(row.price)}${row.commission != null ? ` · Commission ${peso(row.commission)}` : ''}`}
                                    line={row}
                                    url={`/clients/${client.id}/schedule-items/${row.id}`}
                                    staff={staff}
                                    editingKey={`item-${row.id}`}
                                    editing={editing}
                                    setEditing={setEditing}
                                    busy={busy}
                                    save={save}
                                    onDelete={() => remove('item', row.id, row.item_name)}
                                />
                            ))}
                        </div>
                    ))}

                    {tab === 'bundles' && (data.bundles.length === 0 ? empty : data.bundles.map((bundle) => {
                        const doneLines = bundle.lines.filter((l) => l.status === 'done').length;
                        return (
                            <div key={bundle.id} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                                <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-50/70 border-b border-gray-100">
                                    <div className="min-w-0">
                                        <h4 className="text-sm font-bold text-gray-800 truncate">{bundle.bundle_name}</h4>
                                        <p className="text-xs text-gray-500">Bundle · {peso(bundle.bundle_price)} · {doneLines}/{bundle.lines.length} done</p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <StatusChip status={bundle.status} />
                                        <button type="button" title="Delete bundle booking" aria-label="Delete bundle booking" onClick={() => remove('bundle', bundle.id, bundle.bundle_name)} className={`${iconBtn} text-red-500 hover:bg-red-50`}>
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                <div className="divide-y divide-gray-50">
                                    {bundle.lines.map((line) => (
                                        <LineRow
                                            key={line.id}
                                            title={line.item_name}
                                            subtitle={`Bundle item${line.commission != null ? ` · Commission ${peso(line.commission)}` : ''}`}
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
                            </div>
                        );
                    }))}

                    {tab === 'packages' && (data.packages.length === 0 ? empty : (
                        <div className="space-y-4">
                            {data.packages.map((record) => (
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
                                    onAddSession={() => run(() => api(`/clients/${client.id}/package-records/${record.id}/sessions`, 'POST'))}
                                />
                            ))}
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}
