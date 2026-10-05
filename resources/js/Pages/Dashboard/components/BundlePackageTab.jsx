import React, { useState, useEffect, useRef } from 'react';

// Field/endpoint differences between the Bundles tab and the Packages tab.
// Everything else about the two tabs is identical, so one component drives
// both — pass kind="bundle" or kind="package".
const KIND_CONFIG = {
    bundle: {
        base: '/bundles',
        listKey: 'bundles',
        recordKey: 'bundle',
        idField: 'bundle_id',
        nameField: 'bundle_name',
        priceField: 'bundle_price',
        // No description field for bundles (not requested) — the form
        // below only renders the Description textarea when a kind
        // defines one.
        descriptionField: null,
        hasSessions: false,
        // Bundles still require at least one catalog item.
        itemsRequired: true,
        singular: 'Bundle',
        plural: 'Bundles',
        icon: '📦',
    },
    package: {
        base: '/packages',
        listKey: 'packages',
        recordKey: 'package',
        idField: 'package_id',
        nameField: 'package_name',
        priceField: 'package_price',
        descriptionField: 'package_description',
        // Packages are booked as a card of numbered sessions plus a free row.
        hasSessions: true,
        // A package can be saved with zero catalog items selected. If
        // items ARE picked, they're still saved via package_items for
        // future editing — see handleFormSubmit below.
        itemsRequired: false,
        singular: 'Package',
        plural: 'Packages',
        icon: '🎁',
    },
};

const EMPTY_FORM = { name: '', price: '', description: '', sessionCount: '1' };

// Catalog item picker shows this many sale items per page.
const ITEMS_PER_PAGE = 4;

    // Helper function to capitalize the first letter of each word
const toCapitalCase = (str) => {
        return str.replace(/\b\w/g, (char) => char.toUpperCase());
};

function getXsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

const formatMoney = (value) => {
    if (value === null || value === undefined || value === '') return '—';
    const num = Number(value);
    return Number.isNaN(num) ? '—' : `₱${num.toFixed(2)}`;
};

export default function BundlePackageTab({ kind }) {
    const cfg = KIND_CONFIG[kind];

    // Structural layout state
    const [searchQuery, setSearchQuery] = useState('');
    const [currentAction, setCurrentAction] = useState('empty'); // empty | create | update | delete
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [hoveredButtonId, setHoveredButtonId] = useState(null);

    // Catalog list: paginated at 10 records per page server-side, re-fetched
    // on search or page change.
    const [list, setList] = useState([]);
    const [listLoading, setListLoading] = useState(true);
    const [listError, setListError] = useState(null);
    const fetchTokenRef = useRef(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageMeta, setPageMeta] = useState({ current_page: 1, last_page: 1, per_page: 10, total: 0 });

    // Create/update form
    const [form, setForm] = useState(EMPTY_FORM);
    const [selectedItems, setSelectedItems] = useState([]); // sale_items chosen for this bundle/package

    // Item picker (search sale_items to add to the bundle/package)
    const [itemQuery, setItemQuery] = useState('');
    const [itemResults, setItemResults] = useState([]);
    const [itemSearchLoading, setItemSearchLoading] = useState(false);
    const [itemPage, setItemPage] = useState(1);
    const itemFetchTokenRef = useRef(0);

    // Outcome banner + submission state
    const [formStatus, setFormStatus] = useState(null);
    const [fieldErrors, setFieldErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const actionsConfig = {
        update: { label: 'Update', color: '#eab308', icon: '✏️' },
        delete: { label: 'Delete', color: '#ef4444', icon: '🗑️' },
    };

    const isUpdateMode = currentAction === 'update' && !!selectedRecord;

    // Reset all local state whenever the tab is switched between Bundles
    // and Packages, so stale data from one never bleeds into the other.
    useEffect(() => {
        setSearchQuery('');
        setCurrentPage(1);
        setPageMeta({ current_page: 1, last_page: 1, per_page: 10, total: 0 });
        setCurrentAction('empty');
        setSelectedRecord(null);
        setForm(EMPTY_FORM);
        setSelectedItems([]);
        setItemQuery('');
        setItemResults([]);
        setItemPage(1);
        setFormStatus(null);
        setFieldErrors({});
    }, [kind]);

    // A new search term always starts back at page 1.
    useEffect(() => {
        setCurrentPage(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery]);

    const buildListParams = (page) => {
        const parts = [];
        if (searchQuery.trim()) parts.push(`search=${encodeURIComponent(searchQuery.trim())}`);
        parts.push(`page=${page}`);
        return `?${parts.join('&')}`;
    };

    // Fetch the bundle/package list: 10 records for the current page,
    // filtered by the search box when it isn't empty.
    useEffect(() => {
        const requestId = ++fetchTokenRef.current;
        const handle = setTimeout(async () => {
            setListLoading(true);
            setListError(null);

            try {
                const response = await fetch(`${cfg.base}${buildListParams(currentPage)}`, {
                    headers: { Accept: 'application/json' },
                    credentials: 'same-origin',
                });

                if (!response.ok) {
                    throw new Error(`Unable to load ${cfg.plural.toLowerCase()} right now.`);
                }

                const body = await response.json();

                if (requestId === fetchTokenRef.current) {
                    setList(body[cfg.listKey] || []);
                    if (body.meta) setPageMeta(body.meta);
                }
            } catch (err) {
                if (requestId === fetchTokenRef.current) {
                    setListError(err.message || `Unable to load ${cfg.plural.toLowerCase()} right now.`);
                }
            } finally {
                if (requestId === fetchTokenRef.current) {
                    setListLoading(false);
                }
            }
        }, searchQuery.trim() ? 300 : 0);

        return () => clearTimeout(handle);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery, kind, currentPage]);

    const refreshList = (page = currentPage) => {
        fetchTokenRef.current += 1;
        const requestId = fetchTokenRef.current;

        fetch(`${cfg.base}${buildListParams(page)}`, {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
        })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Refresh failed'))))
            .then((body) => {
                if (requestId === fetchTokenRef.current) {
                    const records = body[cfg.listKey] || [];
                    // If a delete emptied out the last page, step back a
                    // page instead of leaving the panel blank.
                    if (records.length === 0 && page > 1) {
                        setCurrentPage(page - 1);
                        return;
                    }
                    setList(records);
                    if (body.meta) setPageMeta(body.meta);
                }
            })
            .catch(() => {
                /* silent: the list keeps showing its last known-good state */
            });
    };

    // Item picker: search sale_items via the existing catalog search
    // endpoint, debounced the same way the list search is.
    useEffect(() => {
        if (currentAction !== 'create' && !isUpdateMode) return;

        const requestId = ++itemFetchTokenRef.current;
        const handle = setTimeout(async () => {
            setItemSearchLoading(true);
            try {
                const params = itemQuery.trim()
                    ? `?search=${encodeURIComponent(itemQuery.trim())}`
                    : '';
                const response = await fetch(`/sale-items${params}`, {
                    headers: { Accept: 'application/json' },
                    credentials: 'same-origin',
                });
                const body = response.ok ? await response.json() : { saleItems: [] };
                if (requestId === itemFetchTokenRef.current) {
                    setItemResults(body.saleItems || []);
                }
            } catch (err) {
                if (requestId === itemFetchTokenRef.current) {
                    setItemResults([]);
                }
            } finally {
                if (requestId === itemFetchTokenRef.current) {
                    setItemSearchLoading(false);
                }
            }
        }, itemQuery.trim() ? 300 : 0);

        return () => clearTimeout(handle);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [itemQuery, currentAction, isUpdateMode]);

    // A new item search term always starts back at page 1.
    useEffect(() => {
        setItemPage(1);
    }, [itemQuery]);

    const handleMoneyChange = (e) => {
        const cleanValue = e.target.value.replace(/[^0-9.]/g, '');
        setForm((prev) => ({ ...prev, price: cleanValue }));
    };

    const addItem = (item) => {
        setSelectedItems((prev) => (
            prev.some((i) => i.id === item.id) ? prev : [...prev, item]
        ));
    };

    const removeItem = (itemId) => {
        setSelectedItems((prev) => prev.filter((i) => i.id !== itemId));
    };

    const triggerAction = (actionType, record) => {
        setSelectedRecord(record);
        setCurrentAction(actionType);
        setFormStatus(null);
        setFieldErrors({});
        setItemQuery('');
        setItemResults([]);
        setItemPage(1);

        if (actionType === 'update' && record) {
            setForm({
                name: record[cfg.nameField] || '',
                price: record[cfg.priceField] ?? '',
                description: cfg.descriptionField ? (record[cfg.descriptionField] || '') : '',
                sessionCount: String(record.session_count ?? 1),
            });
            setSelectedItems(record.items || []);
        } else if (actionType === 'create') {
            setForm(EMPTY_FORM);
            setSelectedItems([]);
        }
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setFormStatus(null);
        setFieldErrors({});

        if (cfg.itemsRequired && selectedItems.length === 0) {
            setSubmitting(false);
            setFormStatus({ type: 'error', message: `Add at least one item to this ${cfg.singular.toLowerCase()}.` });
            return;
        }

        const payload = new FormData();
        payload.append(cfg.nameField, form.name);
        payload.append(cfg.priceField, form.price);
        if (cfg.descriptionField) {
            payload.append(cfg.descriptionField, form.description || '');
        }
        if (cfg.hasSessions) {
            payload.append('session_count', form.sessionCount || '1');
        }
        selectedItems.forEach((item) => payload.append('item_ids[]', item.id));

        const url = isUpdateMode ? `${cfg.base}/${selectedRecord[cfg.idField]}` : cfg.base;
        if (isUpdateMode) {
            payload.append('_method', 'PUT');
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'X-XSRF-TOKEN': getXsrfToken() || '',
                },
                credentials: 'same-origin',
                body: payload,
            });

            const body = await response.json().catch(() => ({}));

            if (response.ok) {
                setFormStatus({
                    type: 'success',
                    message: body.message || `${cfg.singular} saved successfully.`,
                });

                if (isUpdateMode) {
                    if (body[cfg.recordKey]) {
                        setSelectedRecord(body[cfg.recordKey]);
                        setSelectedItems(body[cfg.recordKey].items || []);
                    }
                } else {
                    setForm(EMPTY_FORM);
                    setSelectedItems([]);
                }

                refreshList();
            } else if (response.status === 422) {
                const errors = body.errors || {};
                const flatMessages = Object.values(errors).flat();
                setFieldErrors(
                    Object.fromEntries(
                        Object.entries(errors).map(([field, messages]) => [field, messages[0]])
                    )
                );
                setFormStatus({
                    type: 'error',
                    message: flatMessages.length
                        ? flatMessages.join(' ')
                        : (body.message || 'Some fields need your attention.'),
                });
            } else {
                setFormStatus({
                    type: 'error',
                    message: body.message || `Save failed (server responded ${response.status}).`,
                });
            }
        } catch (err) {
            setFormStatus({
                type: 'error',
                message: 'Save failed: could not reach the server. Check your connection and try again.',
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!selectedRecord) return;
        setDeleting(true);
        setFormStatus(null);

        try {
            const response = await fetch(`${cfg.base}/${selectedRecord[cfg.idField]}`, {
                method: 'DELETE',
                headers: {
                    Accept: 'application/json',
                    'X-XSRF-TOKEN': getXsrfToken() || '',
                },
                credentials: 'same-origin',
            });

            const body = await response.json().catch(() => ({}));

            if (response.ok) {
                setFormStatus({
                    type: 'success',
                    message: body.message || `${cfg.singular} removed successfully.`,
                });
                refreshList();
                setTimeout(() => {
                    setCurrentAction('empty');
                    setSelectedRecord(null);
                    setFormStatus(null);
                }, 1200);
            } else {
                setFormStatus({
                    type: 'error',
                    message: body.message || `Delete failed (server responded ${response.status}).`,
                });
            }
        } catch (err) {
            setFormStatus({
                type: 'error',
                message: 'Delete failed: could not reach the server. Check your connection and try again.',
            });
        } finally {
            setDeleting(false);
        }
    };

    // Item picker results, with anything already selected filtered out
    const pickableResults = itemResults.filter(
        (result) => !selectedItems.some((i) => i.id === result.id)
    );

    // Item picker pagination (4 per page). Adding an item removes it from
    // pickableResults, so clamp the page if that empties the current one.
    const itemLastPage = Math.max(1, Math.ceil(pickableResults.length / ITEMS_PER_PAGE));
    const safeItemPage = Math.min(itemPage, itemLastPage);
    const itemStart = (safeItemPage - 1) * ITEMS_PER_PAGE;
    const pagedResults = pickableResults.slice(itemStart, itemStart + ITEMS_PER_PAGE);

    return (
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-visible">

            {/* ── LEFT PANEL: Catalog list ── */}
            <div className="lg:col-span-5 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-[70vh] min-h-[500px] overflow-visible">
                <div className="p-4 border-b border-gray-100 flex items-center gap-3 shrink-0">
                    <div className="relative flex-grow">
                        <input
                            type="text"
                            placeholder={`Search by ${cfg.singular.toLowerCase()} name...`}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm outline-none transition focus:ring-2 focus:ring-[rgb(240,136,176)] focus:border-[rgb(240,136,176)]"
                        />
                        <span className="absolute left-3 top-2.5 text-gray-400 text-xs">🔍</span>
                    </div>
                    <button
                        onClick={() => triggerAction('create', null)}
                        className="bg-[rgb(240,136,176)] hover:bg-[rgb(225,120,160)] text-white font-semibold text-sm px-3 py-2 rounded-lg flex items-center gap-2 transition shadow-sm whitespace-nowrap"
                    >
                        <span>➕</span> New {cfg.singular}
                    </button>
                </div>

                {!listLoading && !listError && (
                    <div className="px-4 pt-2 text-[11px] text-gray-400">
                        {pageMeta.total > 0
                            ? `Showing ${(pageMeta.per_page * (pageMeta.current_page - 1)) + 1}–${Math.min(pageMeta.per_page * pageMeta.current_page, pageMeta.total)} of ${pageMeta.total}${searchQuery.trim() ? ` matching "${searchQuery.trim()}"` : ` ${cfg.plural.toLowerCase()}`}`
                            : searchQuery.trim()
                                ? `No matches for "${searchQuery.trim()}"`
                                : `No ${cfg.plural.toLowerCase()} yet`}
                    </div>
                )}

                <div className="flex-1 overflow-y-auto divide-y divide-gray-50 p-2 custom-scrollbar">
                    {listLoading ? (
                        <div className="text-center py-12 text-gray-400 text-sm">Loading {cfg.plural.toLowerCase()}…</div>
                    ) : listError ? (
                        <div className="text-center py-12 text-red-400 text-sm px-6">{listError}</div>
                    ) : list.length > 0 ? (
                        list.map((record) => (
                            <div
                                key={record[cfg.idField]}
                                className={`flex items-center justify-between p-3 rounded-xl transition-colors ${selectedRecord?.[cfg.idField] === record[cfg.idField] && currentAction !== 'create' ? 'bg-pink-50/40 border-l-4 border-[rgb(240,136,176)]' : 'hover:bg-gray-50/80'}`}
                            >
                                <div className="flex items-center gap-3 min-w-0 pr-3">
                                    <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center text-xs text-gray-400 shadow-sm">
                                        <span>{cfg.icon}</span>
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="text-sm font-bold text-gray-800 truncate">{record[cfg.nameField]}</h4>
                                        <p className="text-xs text-gray-500 truncate mt-0.5">
                                            {cfg.hasSessions && `${record.session_count ?? 1} session${(record.session_count ?? 1) === 1 ? '' : 's'} · `}{(record.items || []).length} item{(record.items || []).length === 1 ? '' : 's'} · {formatMoney(record[cfg.priceField])}
                                        </p>
                                        {cfg.descriptionField && record[cfg.descriptionField] && (
                                            <p className="text-[11px] text-gray-400 truncate italic mt-0.5">{record[cfg.descriptionField]}</p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 shrink-0 overflow-visible">
                                    {Object.entries(actionsConfig).map(([actionKey, config]) => {
                                        const uniqueHoverId = `${actionKey}-${record[cfg.idField]}`;
                                        const isHovered = hoveredButtonId === uniqueHoverId;

                                        return (
                                            <div key={actionKey} className="relative overflow-visible">
                                                <button
                                                    type="button"
                                                    onClick={() => triggerAction(actionKey, record)}
                                                    onMouseEnter={() => setHoveredButtonId(uniqueHoverId)}
                                                    onMouseLeave={() => setHoveredButtonId(null)}
                                                    aria-label={`${config.label} ${record[cfg.nameField]}`}
                                                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors text-base hover:bg-gray-100"
                                                >
                                                    {config.icon}
                                                </button>

                                                {isHovered && (
                                                    <div
                                                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap text-white text-[11px] font-bold px-2.5 py-1 rounded-md shadow-md z-50 pointer-events-none"
                                                        style={{ backgroundColor: config.color }}
                                                    >
                                                        {config.label}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-12 text-gray-400 text-sm flex flex-col items-center justify-center gap-1">
                            <span className="text-2xl">📋</span>
                            <span>No {cfg.plural.toLowerCase()} matched filters.</span>
                        </div>
                    )}
                </div>

                {/* Pagination footer: 10 records per page */}
                {!listLoading && !listError && pageMeta.last_page > 1 && (
                    <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 shrink-0">
                        <button
                            type="button"
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={pageMeta.current_page <= 1}
                            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                        >
                            ← Prev
                        </button>

                        <span className="text-xs text-gray-500 font-medium">
                            Page {pageMeta.current_page} of {pageMeta.last_page}
                        </span>

                        <button
                            type="button"
                            onClick={() => setCurrentPage((p) => Math.min(pageMeta.last_page, p + 1))}
                            disabled={pageMeta.current_page >= pageMeta.last_page}
                            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                        >
                            Next →
                        </button>
                    </div>
                )}
            </div>

            {/* ── RIGHT PANEL: Workspace canvas ── */}
            <div className="lg:col-span-7 bg-white rounded-xl shadow-sm border border-gray-100 p-6 min-h-[500px] h-[70vh] overflow-y-auto custom-scrollbar">
                {currentAction === 'empty' && (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 text-gray-400">
                        <div className="text-5xl mb-3">{cfg.icon}</div>
                        <h3 className="text-base font-bold text-gray-700">Operational Content Window</h3>
                        <p className="text-xs max-w-sm mt-1.5 leading-relaxed text-gray-400">
                            Select a {cfg.singular.toLowerCase()} from the left panel, or start a new one, to begin editing.
                        </p>
                    </div>
                )}

                {/* ACTION BLOCK: FORM CANVAS (shared by Create and Update) */}
                {(currentAction === 'create' || isUpdateMode) && (
                    <div className="space-y-4">
                        <h3 className="text-base font-bold text-gray-800 pb-2 border-b border-gray-100 flex items-center gap-2">
                            <span>{isUpdateMode ? '✏️' : '✨'}</span>
                            {isUpdateMode
                                ? `Edit ${cfg.singular} — ${selectedRecord[cfg.nameField]}`
                                : `Register New ${cfg.singular}`}
                        </h3>

                        {formStatus && (
                            <div
                                className={`rounded-lg px-4 py-3 text-sm font-medium border ${
                                    formStatus.type === 'success'
                                        ? 'bg-green-50 text-green-700 border-green-100'
                                        : 'bg-red-50 text-red-700 border-red-100'
                                }`}
                            >
                                {formStatus.type === 'success' ? '✅ ' : '⚠️ '}
                                {formStatus.message}
                            </div>
                        )}

                        <form className="space-y-5" onSubmit={handleFormSubmit}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">{cfg.singular} Name</label>
                                    <input
                                        type="text"
                                        value={form.name}
                                        onChange={(e) => setForm((prev) => ({ ...prev, name: toCapitalCase(e.target.value) }))}
                                        className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[rgb(240,136,176)]"
                                        required
                                    />
                                    {fieldErrors[cfg.nameField] && <span className="text-xs text-red-500">{fieldErrors[cfg.nameField]}</span>}
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">{cfg.singular} Price</label>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={form.price}
                                        onChange={handleMoneyChange}
                                        placeholder="0.00"
                                        className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[rgb(240,136,176)]"
                                        required
                                    />
                                    {fieldErrors[cfg.priceField] && <span className="text-xs text-red-500">{fieldErrors[cfg.priceField]}</span>}
                                </div>
                            </div>

                            {cfg.descriptionField && (
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">{cfg.singular} Description</label>
                                    <textarea
                                        rows={3}
                                        value={form.description}
                                        onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                                        className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[rgb(240,136,176)] resize-none"
                                        placeholder={`Short description shown alongside the ${cfg.singular.toLowerCase()}`}
                                    />
                                    {fieldErrors[cfg.descriptionField] && <span className="text-xs text-red-500">{fieldErrors[cfg.descriptionField]}</span>}
                                </div>
                            )}

                            {cfg.hasSessions && (
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Number of Sessions</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="50"
                                        value={form.sessionCount}
                                        onChange={(e) => setForm((prev) => ({ ...prev, sessionCount: e.target.value }))}
                                        className="w-full sm:w-1/2 p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[rgb(240,136,176)]"
                                        required
                                    />
                                    <p className="text-[11px] text-gray-400 mt-1">Each session also gets an optional Free slot on the client's package card.</p>
                                    {fieldErrors.session_count && <span className="text-xs text-red-500">{fieldErrors.session_count}</span>}
                                </div>
                            )}

                            {/* Item picker: search the catalog and add items. Shows 4 items
                                per page with Prev/Next pagination. */}
                            <div className="border border-gray-100 rounded-xl p-4 space-y-3 bg-gray-50/50">
                                <label className="block text-xs font-semibold text-gray-600">
                                    Add Items from Catalog{!cfg.itemsRequired && <span className="font-normal text-gray-400"> (optional)</span>}
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Search sale items by category or name..."
                                        value={itemQuery}
                                        onChange={(e) => setItemQuery(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm outline-none bg-white focus:ring-2 focus:ring-[rgb(240,136,176)]"
                                    />
                                    <span className="absolute left-3 top-2.5 text-gray-400 text-xs">🔍</span>
                                </div>

                                <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg bg-white">
                                    {itemSearchLoading ? (
                                        <div className="text-center py-4 text-gray-400 text-xs">Searching…</div>
                                    ) : pickableResults.length > 0 ? (
                                        pagedResults.map((item) => {
                                            const hoverId = `add-${item.id}`;
                                            const isHovered = hoveredButtonId === hoverId;
                                            return (
                                                <div key={item.id} className="flex items-center justify-between px-3 py-2.5">
                                                    <div className="min-w-0 pr-2">
                                                        <p className="text-xs font-semibold text-gray-800 truncate">{item.itemname}</p>
                                                        <p className="text-[11px] text-gray-500 truncate">{item.category} · {formatMoney(item.price1)}</p>
                                                    </div>
                                                    <div className="relative shrink-0 overflow-visible">
                                                        <button
                                                            type="button"
                                                            onClick={() => addItem(item)}
                                                            onMouseEnter={() => setHoveredButtonId(hoverId)}
                                                            onMouseLeave={() => setHoveredButtonId(null)}
                                                            aria-label={`Add ${item.itemname}`}
                                                            className="w-8 h-8 rounded-lg flex items-center justify-center text-base text-[rgb(240,136,176)] hover:bg-pink-50 transition"
                                                        >
                                                            ➕
                                                        </button>
                                                        {isHovered && (
                                                            <div
                                                                className="absolute bottom-full right-0 mb-2 whitespace-nowrap text-white text-[11px] font-bold px-2.5 py-1 rounded-md shadow-md z-50 pointer-events-none"
                                                                style={{ backgroundColor: 'rgb(240,136,176)' }}
                                                            >
                                                                Add
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="text-center py-4 text-gray-400 text-xs">
                                            {itemQuery.trim() ? 'No matching sale items.' : 'Start typing to find sale items.'}
                                        </div>
                                    )}
                                </div>

                                {/* Picker pagination: 4 items per page */}
                                {!itemSearchLoading && pickableResults.length > ITEMS_PER_PAGE && (
                                    <div className="flex items-center justify-between gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setItemPage(Math.max(1, safeItemPage - 1))}
                                            disabled={safeItemPage <= 1}
                                            className="px-3 py-1.5 border border-gray-200 bg-white rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                                        >
                                            ← Prev
                                        </button>
                                        <span className="text-xs text-gray-500 font-medium">
                                            {itemStart + 1}–{Math.min(itemStart + ITEMS_PER_PAGE, pickableResults.length)} of {pickableResults.length}
                                            {' · '}Page {safeItemPage} of {itemLastPage}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setItemPage(Math.min(itemLastPage, safeItemPage + 1))}
                                            disabled={safeItemPage >= itemLastPage}
                                            className="px-3 py-1.5 border border-gray-200 bg-white rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                                        >
                                            Next →
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Selected items — a separate container from the catalog
                                picker above, also capped to 6 visible rows with scroll. */}
                            <div className="border border-gray-100 rounded-xl p-4 space-y-3 bg-white">
                                <label className="block text-xs font-semibold text-gray-600">
                                    Selected Items {selectedItems.length > 0 && `(${selectedItems.length})`}
                                </label>
                                {selectedItems.length > 0 ? (
                                    <div className="max-h-[300px] overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg custom-scrollbar">
                                        {selectedItems.map((item) => {
                                            const hoverId = `remove-${item.id}`;
                                            const isHovered = hoveredButtonId === hoverId;
                                            return (
                                                <div key={item.id} className="flex items-center justify-between px-3 py-2.5">
                                                    <div className="min-w-0 pr-2">
                                                        <p className="text-xs font-semibold text-gray-800 truncate">{item.itemname}</p>
                                                        <p className="text-[11px] text-gray-500 truncate">{item.category} · {formatMoney(item.price1)}</p>
                                                    </div>
                                                    <div className="relative shrink-0 overflow-visible">
                                                        <button
                                                            type="button"
                                                            onClick={() => removeItem(item.id)}
                                                            onMouseEnter={() => setHoveredButtonId(hoverId)}
                                                            onMouseLeave={() => setHoveredButtonId(null)}
                                                            aria-label={`Remove ${item.itemname}`}
                                                            className="w-8 h-8 rounded-lg flex items-center justify-center text-base text-red-500 hover:bg-red-50 transition"
                                                        >
                                                            ✕
                                                        </button>
                                                        {isHovered && (
                                                            <div
                                                                className="absolute bottom-full right-0 mb-2 whitespace-nowrap text-white text-[11px] font-bold px-2.5 py-1 rounded-md shadow-md z-50 pointer-events-none"
                                                                style={{ backgroundColor: '#ef4444' }}
                                                            >
                                                                Remove
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-center py-4 text-gray-400 text-xs border border-dashed border-gray-200 rounded-lg">
                                        No items selected yet.
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end gap-2 pt-4 border-t border-gray-50">
                                <button type="button" onClick={() => setCurrentAction('empty')} className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition">Cancel</button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className={`px-4 py-2 disabled:bg-gray-300 text-white rounded-lg text-xs font-semibold shadow-sm transition ${
                                        isUpdateMode
                                            ? 'bg-yellow-500 hover:bg-yellow-600'
                                            : 'bg-[rgb(240,136,176)] hover:bg-[rgb(225,120,160)]'
                                    }`}
                                >
                                    {submitting
                                        ? (isUpdateMode ? 'Updating...' : 'Saving...')
                                        : (isUpdateMode ? `Update ${cfg.singular}` : `Save ${cfg.singular}`)}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* ACTION BLOCK: DELETE CONFIRMATION */}
                {currentAction === 'delete' && selectedRecord && (
                    <div className="border border-red-100 bg-red-50/40 p-6 rounded-xl space-y-4">
                        <div className="flex items-center gap-2.5 text-red-700 font-bold text-base">
                            <span>⚠️</span> <span>Destructive Lifecycle Confirmation</span>
                        </div>
                        <p className="text-xs text-gray-600 leading-relaxed">
                            Are you absolutely certain you wish to purge the {cfg.singular.toLowerCase()} record for <span className="font-bold text-gray-800">{selectedRecord[cfg.nameField]}</span>? This action is immutable and will immediately disrupt cascade indices.
                        </p>

                        {formStatus && (
                            <div
                                className={`rounded-lg px-4 py-3 text-sm font-medium border ${
                                    formStatus.type === 'success'
                                        ? 'bg-green-50 text-green-700 border-green-100'
                                        : 'bg-red-100 text-red-700 border-red-200'
                                }`}
                            >
                                {formStatus.type === 'success' ? '✅ ' : '⚠️ '}
                                {formStatus.message}
                            </div>
                        )}

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => { setCurrentAction('empty'); setSelectedRecord(null); setFormStatus(null); }}
                                disabled={deleting}
                                className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
                            >
                                Abort Operation
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmDelete}
                                disabled={deleting}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                            >
                                {deleting ? 'Removing...' : 'Confirm Total Erasure'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
