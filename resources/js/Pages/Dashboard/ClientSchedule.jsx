import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Search, Tag, Package as PackageIcon, Gift } from 'lucide-react';
import ClientProfileHeader from './ClientProfileHeader';

function getXsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Catalog tabs: which endpoint backs each, and how to read a record.
const TABS = {
    items: {
        label: 'Items',
        icon: Tag,
        endpoint: '/sale-items',
        responseKey: 'saleItems',
        getId: (r) => r.id,
        getName: (r) => r.itemname,
        getSubtitle: (r) => r.category,
        getPrice: (r) => r.price1,
    },
    bundles: {
        label: 'Bundles',
        icon: Gift,
        endpoint: '/bundles',
        responseKey: 'bundles',
        getId: (r) => r.bundle_id,
        getName: (r) => r.bundle_name,
        getSubtitle: (r) => plural((r.items || []).length, 'item'),
        getPrice: (r) => r.bundle_price,
    },
    packages: {
        label: 'Packages',
        icon: PackageIcon,
        endpoint: '/packages',
        responseKey: 'packages',
        getId: (r) => r.package_id,
        getName: (r) => r.package_name,
        getSubtitle: (r) => plural(Number(r.session_count || 1), 'session'),
        getPrice: (r) => r.package_price,
    },
};

const peso = (value) => `₱${Number(value || 0).toFixed(2)}`;

// The tab key ('items') differs from what the API validates ('item').
const API_TYPE = { items: 'item', bundles: 'bundle', packages: 'package' };

/**
 * Booking step of the scheduling module: pick items, bundles and/or
 * packages for a client. Date, time and staff are NOT chosen here — every
 * booked item / bundle item / package session is assigned individually
 * later, from the client's service record (ClientScheduleBoard).
 */
export default function ClientSchedule({ client, onCancel, onSaved }) {
    const [activeTab, setActiveTab] = useState('items');
    const [searchQuery, setSearchQuery] = useState('');

    const [catalogList, setCatalogList] = useState([]);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [catalogError, setCatalogError] = useState(null);
    const fetchTokenRef = useRef(0);

    const [selected, setSelected] = useState([]);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);

    useEffect(() => {
        setSearchQuery('');
    }, [activeTab]);

    useEffect(() => {
        const config = TABS[activeTab];
        const requestId = ++fetchTokenRef.current;

        const handle = setTimeout(async () => {
            setCatalogLoading(true);
            setCatalogError(null);

            try {
                const params = new URLSearchParams({ active_only: '1' });
                if (searchQuery.trim()) params.set('search', searchQuery.trim());

                const response = await fetch(`${config.endpoint}?${params.toString()}`, {
                    headers: { Accept: 'application/json' },
                    credentials: 'same-origin',
                });
                if (!response.ok) throw new Error(`Unable to load ${config.label.toLowerCase()} right now.`);

                const body = await response.json();
                if (requestId === fetchTokenRef.current) setCatalogList(body[config.responseKey] || []);
            } catch (err) {
                if (requestId === fetchTokenRef.current) {
                    setCatalogError(err.message || `Unable to load ${config.label.toLowerCase()} right now.`);
                }
            } finally {
                if (requestId === fetchTokenRef.current) setCatalogLoading(false);
            }
        }, searchQuery.trim() ? 300 : 0);

        return () => clearTimeout(handle);
    }, [activeTab, searchQuery]);

    const handleAdd = (record) => {
        const config = TABS[activeTab];
        const refId = config.getId(record);
        const uid = `${activeTab}-${refId}`;

        setSelected((prev) => (
            prev.some((row) => row.uid === uid)
                ? prev
                : [...prev, { uid, type: activeTab, refId, name: config.getName(record), price: config.getPrice(record) }]
        ));
    };

    const handleRemove = (uid) => setSelected((prev) => prev.filter((row) => row.uid !== uid));

    const total = selected.reduce((sum, row) => sum + Number(row.price || 0), 0);

    const handleCancel = () => {
        setSelected([]);
        setSaveError(null);
        onCancel && onCancel();
    };

    // POST /clients/{id}/schedules — saves the selection only.
    const handleSave = async () => {
        if (selected.length === 0 || saving) return;

        setSaving(true);
        setSaveError(null);

        try {
            const response = await fetch(`/clients/${client.id}/schedules`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-XSRF-TOKEN': getXsrfToken() || '',
                },
                credentials: 'same-origin',
                body: JSON.stringify({
                    items: selected.map((row) => ({ type: API_TYPE[row.type], id: row.refId })),
                }),
            });

            const body = await response.json().catch(() => ({}));

            if (response.ok) {
                setSelected([]);
                onSaved && onSaved(body.bookings);
            } else {
                const flat = Object.values(body.errors || {}).flat();
                setSaveError(flat.length ? flat.join(' ') : (body.message || `Save failed (server responded ${response.status}).`));
            }
        } catch (err) {
            setSaveError('Save failed: could not reach the server. Check your connection and try again.');
        } finally {
            setSaving(false);
        }
    };

    const activeConfig = TABS[activeTab];

    return (
        <div className="w-full min-h-[calc(100vh-6rem)] bg-gray-50 flex flex-col gap-4 p-2 sm:p-4">
            <ClientProfileHeader client={client} />

            <p className="px-1 text-xs text-gray-400 shrink-0">
                Choose what this client is booking. Date, time and staff are assigned later, one by one, from the client's service record.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">

                {/* LEFT: Items / Bundles / Packages */}
                <div className="lg:col-span-7 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-[58vh] min-h-[420px] overflow-hidden">
                    <div className="flex border-b border-gray-100 shrink-0">
                        {Object.entries(TABS).map(([key, config]) => {
                            const TabIcon = config.icon;
                            const isActive = activeTab === key;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setActiveTab(key)}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold transition-colors border-b-2 ${
                                        isActive
                                            ? 'border-[rgb(240,136,176)] text-[rgb(225,90,140)]'
                                            : 'border-transparent text-gray-400 hover:text-gray-600'
                                    }`}
                                >
                                    <TabIcon className="w-4 h-4" />
                                    {config.label}
                                </button>
                            );
                        })}
                    </div>

                    <div className="p-4 border-b border-gray-100 shrink-0">
                        <div className="relative">
                            <input
                                type="text"
                                placeholder={`Search by ${activeTab === 'items' ? 'category or item name' : 'name'}...`}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm outline-none transition focus:ring-2 focus:ring-[rgb(240,136,176)] focus:border-[rgb(240,136,176)]"
                            />
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto divide-y divide-gray-50 p-2 custom-scrollbar">
                        {catalogLoading ? (
                            <div className="text-center py-12 text-gray-400 text-sm">Loading {activeConfig.label.toLowerCase()}…</div>
                        ) : catalogError ? (
                            <div className="text-center py-12 text-red-400 text-sm px-6">{catalogError}</div>
                        ) : catalogList.length > 0 ? (
                            catalogList.map((record) => {
                                const uid = `${activeTab}-${activeConfig.getId(record)}`;
                                const alreadySelected = selected.some((row) => row.uid === uid);
                                return (
                                    <div key={uid} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50/80 transition-colors">
                                        <div className="min-w-0 pr-3">
                                            <h4 className="text-sm font-bold text-gray-800 truncate">{activeConfig.getName(record)}</h4>
                                            <p className="text-xs text-gray-500 truncate mt-0.5">
                                                {activeConfig.getSubtitle(record)} · {peso(activeConfig.getPrice(record))}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleAdd(record)}
                                            disabled={alreadySelected}
                                            aria-label={`Add ${activeConfig.getName(record)}`}
                                            title={alreadySelected ? 'Already selected' : `Add ${activeConfig.getName(record)}`}
                                            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                                                alreadySelected
                                                    ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                                                    : 'bg-[rgb(240,136,176)] hover:bg-[rgb(225,120,160)] text-white shadow-sm'
                                            }`}
                                        >
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="text-center py-12 text-gray-400 text-sm flex flex-col items-center justify-center gap-1">
                                <span className="text-2xl">🗂️</span>
                                <span>No {activeConfig.label.toLowerCase()} matched filters.</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT: Selected services */}
                <div className="lg:col-span-5 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-[58vh] min-h-[420px] overflow-hidden">
                    <div className="p-4 border-b border-gray-100 shrink-0 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-gray-800">Selected Services</h3>
                        <span className="text-xs font-semibold text-gray-400">{selected.length} selected</span>
                    </div>

                    <div className="flex-1 overflow-y-auto divide-y divide-gray-50 p-2 custom-scrollbar">
                        {selected.length > 0 ? (
                            selected.map((row) => (
                                <div key={row.uid} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50/80 transition-colors">
                                    <div className="min-w-0 pr-3">
                                        <h4 className="text-sm font-bold text-gray-800 truncate">{row.name}</h4>
                                        <p className="text-xs text-gray-500 truncate mt-0.5">
                                            {TABS[row.type].label.replace(/s$/, '')} · {peso(row.price)}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleRemove(row.uid)}
                                        aria-label={`Remove ${row.name}`}
                                        title={`Remove ${row.name}`}
                                        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-gray-100 hover:bg-red-100 text-gray-500 hover:text-red-600 transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-12 text-gray-400 text-sm flex flex-col items-center justify-center gap-1">
                                <span className="text-2xl">📋</span>
                                <span>No services selected yet.</span>
                                <span className="text-xs">Use the + icon on the left to add items, bundles, or packages.</span>
                            </div>
                        )}
                    </div>

                    {selected.length > 0 && (
                        <div className="px-4 py-3 border-t border-gray-100 shrink-0 flex items-center justify-between">
                            <span className="text-xs font-semibold text-gray-500">Estimated Total</span>
                            <span className="text-sm font-bold text-gray-800">{peso(total)}</span>
                        </div>
                    )}
                </div>
            </div>

            {saveError && (
                <div className="rounded-lg px-4 py-3 text-sm font-medium border bg-red-50 text-red-700 border-red-100 shrink-0">
                    ⚠️ {saveError}
                </div>
            )}

            <div className="flex justify-end gap-2 shrink-0">
                <button
                    type="button"
                    onClick={handleCancel}
                    disabled={saving}
                    className="px-5 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={selected.length === 0 || saving}
                    className="px-5 py-2.5 bg-[rgb(240,136,176)] hover:bg-[rgb(225,120,160)] disabled:bg-gray-300 text-white rounded-lg text-sm font-semibold shadow-sm transition"
                >
                    {saving ? 'Saving...' : 'Save Booking'}
                </button>
            </div>
        </div>
    );
}
