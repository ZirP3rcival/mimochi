import React, { useState, useEffect, useRef } from 'react';
import { useForm } from '@inertiajs/react';
import ClientSchedule from './ClientSchedule';
import ClientRecord from './ClientRecord';

const EMPTY_FORM = {
    first_name: '',
    last_name: '',
    middle_initial: '',
    gender: '',
    date_of_birth: '',
    age: '',
    phone: '',
    facebook_account: '',
    address: '',
    photo_path: null,
    status: 'Active',
};

// Reads the XSRF-TOKEN cookie Laravel's "web" middleware group sets, so
// plain fetch() calls (outside Inertia's own request cycle) still pass
// CSRF verification, the same way axios does it automatically.
function getXsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

export default function ClientManager({ clients: initialClients = [] }) {
    // Structural layout management state variables
    const [searchQuery, setSearchQuery] = useState('');
    const [currentAction, setCurrentAction] = useState('empty');
    const [selectedClient, setSelectedClient] = useState(null);
    const [hoveredButtonId, setHoveredButtonId] = useState(null);

    // Directory list is server-driven: paginated at 10 records per page,
    // and re-fetched whenever the search box or the current page changes.
    const [clientList, setClientList] = useState(initialClients);
    const [listLoading, setListLoading] = useState(false);
    const [listError, setListError] = useState(null);
    const fetchTokenRef = useRef(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageMeta, setPageMeta] = useState({ current_page: 1, last_page: 1, per_page: 10, total: initialClients.length });

    // File binary localized rendering sandbox stream container
    const [imagePreview, setImagePreview] = useState(null);

    // Outcome banner shared by the create/update form and the delete dialog
    const [formStatus, setFormStatus] = useState(null); // { type: 'success' | 'error', message: string }
    const [fieldErrors, setFieldErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [statusTogglingId, setStatusTogglingId] = useState(null);

    const actionsConfig = {
        view: { label: 'View', color: '#3b82f6', icon: '👁️' },
        update: { label: 'Update', color: '#eab308', icon: '✏️' },
        delete: { label: 'Delete', color: '#ef4444', icon: '🗑️' },
        record: { label: 'Record', color: '#8b5cf6', icon: '📝' },
        schedule: { label: 'Schedule', color: '#10b981', icon: '📅' }
    };

    // Form parameter definitions integrated with your database migration matrix
    const { data, setData, reset } = useForm(EMPTY_FORM);

    const isUpdateMode = currentAction === 'update' && !!selectedClient;

    // Helper function to capitalize the first letter of each word
    const toCapitalCase = (str) => {
        return str.replace(/\b\w/g, (char) => char.toUpperCase());
    };

    // Automatically compute age when date of birth changes
    useEffect(() => {
        if (data.date_of_birth) {
            const birthDate = new Date(data.date_of_birth);
            const today = new Date();

            if (!isNaN(birthDate.getTime())) {
                let computedAge = today.getFullYear() - birthDate.getFullYear();
                const monthDifference = today.getMonth() - birthDate.getMonth();

                if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
                    computedAge--;
                }

                setData('age', computedAge >= 0 ? computedAge.toString() : '0');
            }
        } else {
            setData('age', '');
        }
    }, [data.date_of_birth]);

    // A new search term always starts back at page 1 — staying on, say,
    // page 3 of an old query would otherwise show an empty/mismatched page
    // against the new result set.
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    // Builds the query string for the current search term + page.
    const buildListParams = (page) => {
        const parts = [];
        if (searchQuery.trim()) parts.push(`search=${encodeURIComponent(searchQuery.trim())}`);
        parts.push(`page=${page}`);
        return `?${parts.join('&')}`;
    };

    // Fetches the client directory list from the server: 10 records for
    // the current page, filtered by the search box when it isn't empty.
    // Debounced so we don't fire a request on every keystroke, and guarded
    // against out-of-order responses (a slow earlier request overwriting
    // a faster, newer one).
    useEffect(() => {
        const requestId = ++fetchTokenRef.current;
        const handle = setTimeout(async () => {
            setListLoading(true);
            setListError(null);

            try {
                const response = await fetch(`/clients${buildListParams(currentPage)}`, {
                    headers: { Accept: 'application/json' },
                    credentials: 'same-origin',
                });

                if (!response.ok) {
                    throw new Error('Unable to load clients right now.');
                }

                const body = await response.json();

                // Ignore this result if a newer search has since been fired
                if (requestId === fetchTokenRef.current) {
                    setClientList(body.clients || []);
                    if (body.meta) setPageMeta(body.meta);
                }
            } catch (err) {
                if (requestId === fetchTokenRef.current) {
                    setListError(err.message || 'Unable to load clients right now.');
                }
            } finally {
                if (requestId === fetchTokenRef.current) {
                    setListLoading(false);
                }
            }
        }, searchQuery.trim() ? 300 : 0);

        return () => clearTimeout(handle);
    }, [searchQuery, currentPage]);

    const refreshClientList = (page = currentPage) => {
        // Nudge the search effect to re-run against the current query/page
        // (works even when neither changed, e.g. right after save)
        fetchTokenRef.current += 1;
        const requestId = fetchTokenRef.current;

        fetch(`/clients${buildListParams(page)}`, {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
        })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Refresh failed'))))
            .then((body) => {
                if (requestId === fetchTokenRef.current) {
                    const clients = body.clients || [];
                    // If a delete emptied out the last page, step back a
                    // page instead of leaving the panel blank.
                    if (clients.length === 0 && page > 1) {
                        setCurrentPage(page - 1);
                        return;
                    }
                    setClientList(clients);
                    if (body.meta) setPageMeta(body.meta);
                }
            })
            .catch(() => {
                /* silent: the list keeps showing its last known-good state */
            });
    };

    // Triggers local file browse selection parameters
    const handlePhotoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setData('photo_path', file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    // Limits phone field input strictly to mobile structures (Digits, +, -, spaces)
    const handlePhoneChange = (e) => {
        const value = e.target.value;
        const cleanValue = value.replace(/[^0-9+\-\s]/g, '');
        setData('phone', cleanValue);
    };

    // Toggles action macro states across workspace canvas panels
    const triggerAction = (actionType, client) => {
        setSelectedClient(client);
        setCurrentAction(actionType);
        setFormStatus(null);
        setFieldErrors({});
        setImagePreview(client?.photo_path ? `/storage/${client.photo_path}` : null);

        if (actionType === 'update' && client) {
            // Load the selected client's record straight into the same
            // form the "New Client" button uses, so Save turns into Update.
            setData({
                first_name: client.first_name || '',
                last_name: client.last_name || '',
                middle_initial: client.middle_initial || '',
                gender: client.gender || '',
                date_of_birth: client.date_of_birth || '',
                age: client.age || '',
                phone: client.phone || '',
                facebook_account: client.facebook_account || '',
                address: client.address || '',
                photo_path: null,
                status: client.status || 'Active'
            });
        } else if (actionType === 'create') {
            reset();
            setImagePreview(null);
        }
    };

    // Submits the registration/edit form. POSTs to /clients for a new
    // client, or POSTs to /clients/{id} with a `_method=PUT` spoof field
    // for an update (a browser can't send a real multipart PUT body, so
    // Laravel's method-override convention handles the file upload case).
    const handleFormSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setFormStatus(null);
        setFieldErrors({});

        const payload = new FormData();
        Object.entries(data).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                payload.append(key, value);
            }
        });

        const url = isUpdateMode ? `/clients/${selectedClient.id}` : '/clients';
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
                    message: body.message || (isUpdateMode ? 'Client updated successfully.' : 'Client saved successfully.'),
                });

                if (isUpdateMode) {
                    // Keep the form populated with the saved values and
                    // reflect them in the selected/preview state.
                    if (body.client) {
                        setSelectedClient(body.client);
                        setImagePreview(body.client.photo_path ? `/storage/${body.client.photo_path}` : imagePreview);
                    }
                } else {
                    reset();
                    setImagePreview(null);
                }

                refreshClientList();
            } else if (response.status === 422) {
                // Validation failure: surface why, both as a banner and
                // per-field messages, and keep the entered data intact.
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

    // Permanently removes the selected client after the user confirms in
    // the destructive-action dialog below.
    const handleConfirmDelete = async () => {
        if (!selectedClient) return;
        setDeleting(true);
        setFormStatus(null);

        try {
            const response = await fetch(`/clients/${selectedClient.id}`, {
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
                    message: body.message || 'Client removed successfully.',
                });
                refreshClientList();
                // Briefly show the confirmation, then return to the empty state
                setTimeout(() => {
                    setCurrentAction('empty');
                    setSelectedClient(null);
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

    // Flips a client's status between Active and Archived directly from the
    // directory list — no form, no confirmation dialog, just an instant
    // PATCH + list refresh.
    const handleToggleStatus = async (client) => {
        setStatusTogglingId(client.id);

        try {
            const response = await fetch(`/clients/${client.id}/toggle-status`, {
                method: 'PATCH',
                headers: {
                    Accept: 'application/json',
                    'X-XSRF-TOKEN': getXsrfToken() || '',
                },
                credentials: 'same-origin',
            });

            if (response.ok) {
                refreshClientList();
                if (selectedClient?.id === client.id) {
                    const body = await response.json().catch(() => ({}));
                    if (body.client) setSelectedClient(body.client);
                }
            }
        } catch (err) {
            /* silent: the list keeps showing its last known-good status */
        } finally {
            setStatusTogglingId(null);
        }
    };

    // The Schedule and Record actions each take over the entire Clients
    // module display (rather than rendering inside the right-hand
    // workspace panel like View/Update/Delete do), per the requested UX.
    // Returning here early swaps out the whole directory/workspace grid
    // below.
    if (currentAction === 'schedule' && selectedClient) {
        return (
            <ClientSchedule
                client={selectedClient}
                onCancel={() => {
                    setCurrentAction('empty');
                    setSelectedClient(null);
                }}
                onSaved={() => {
                    setCurrentAction('empty');
                    setSelectedClient(null);
                }}
            />
        );
    }

    if (currentAction === 'record' && selectedClient) {
        return (
            <ClientRecord
                client={selectedClient}
                onClose={() => {
                    setCurrentAction('empty');
                    setSelectedClient(null);
                }}
            />
        );
    }

    return (
        <div className="w-full min-h-[calc(100vh-6rem)] bg-gray-50 grid grid-cols-1 lg:grid-cols-12 gap-6 p-2 sm:p-4 overflow-visible">

            {/* ── LEFT PANEL: Directory Lookup Layout List ── */}
            <div className="lg:col-span-5 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-[70vh] min-h-[500px] overflow-visible">
                <div className="p-4 border-b border-gray-100 flex items-center gap-3 shrink-0">
                    <div className="relative flex-grow">
                        <input
                            type="text"
                            placeholder="Search by name or phone..."
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
                        <span>➕</span> New Client
                    </button>
                </div>

                {!listLoading && !listError && (
                    <div className="px-4 pt-2 text-[11px] text-gray-400">
                        {pageMeta.total > 0
                            ? `Showing ${(pageMeta.per_page * (pageMeta.current_page - 1)) + 1}–${Math.min(pageMeta.per_page * pageMeta.current_page, pageMeta.total)} of ${pageMeta.total}${searchQuery.trim() ? ` matching "${searchQuery.trim()}"` : ' clients'}`
                            : searchQuery.trim()
                                ? `No matches for "${searchQuery.trim()}"`
                                : 'No clients yet'}
                    </div>
                )}

                <div className="flex-1 overflow-y-auto divide-y divide-gray-50 p-2 custom-scrollbar">
                    {listLoading ? (
                        <div className="text-center py-12 text-gray-400 text-sm">Loading clients…</div>
                    ) : listError ? (
                        <div className="text-center py-12 text-red-400 text-sm px-6">{listError}</div>
                    ) : clientList.length > 0 ? (
                        clientList.map((client) => (
                            <div
                                key={client.id}
                                className={`flex items-center justify-between p-3 rounded-xl transition-colors ${selectedClient?.id === client.id && currentAction !== 'create' ? 'bg-pink-50/40 border-l-4 border-[rgb(240,136,176)]' : 'hover:bg-gray-50/80'}`}
                            >
                                <div className="flex items-center gap-3 min-w-0 pr-3">
                                    <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center text-xs text-gray-400 shadow-sm">
                                        {client.photo_path ? (
                                            <img src={`/storage/${client.photo_path}`} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <span>👤</span>
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="text-sm font-bold text-gray-800 truncate">
                                            {client.last_name}, {client.first_name} {client.middle_initial ? `${client.middle_initial}.` : ''}
                                        </h4>
                                        <p className="text-xs text-gray-500 truncate mt-0.5">
                                            <span className={client.status === 'Active' ? 'text-green-600 font-semibold' : 'text-gray-400 font-semibold'}>
                                                {client.status || 'Active'}
                                            </span>
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 shrink-0 overflow-visible">
                                    {Object.entries(actionsConfig).map(([actionKey, config]) => {
                                        const uniqueHoverId = `${actionKey}-${client.id}`;
                                        const isHovered = hoveredButtonId === uniqueHoverId;

                                        return (
                                            <div key={actionKey} className="relative overflow-visible">
                                                <button
                                                    type="button"
                                                    onClick={() => triggerAction(actionKey, client)}
                                                    onMouseEnter={() => setHoveredButtonId(uniqueHoverId)}
                                                    onMouseLeave={() => setHoveredButtonId(null)}
                                                    aria-label={`${config.label} ${client.last_name}`}
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

                                    {/* Additional icon button: instant Active/Archived status
                                        toggle, separate from the actionsConfig set above since
                                        its icon/label/behavior depends on the client's current
                                        status rather than being fixed. */}
                                    {(() => {
                                        const isActive = (client.status || 'Active') === 'Active';
                                        const toggleHoverId = `status-${client.id}`;
                                        const isHovered = hoveredButtonId === toggleHoverId;
                                        const isBusy = statusTogglingId === client.id;

                                        return (
                                            <div className="relative overflow-visible">
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleStatus(client)}
                                                    onMouseEnter={() => setHoveredButtonId(toggleHoverId)}
                                                    onMouseLeave={() => setHoveredButtonId(null)}
                                                    disabled={isBusy}
                                                    aria-label={`${isActive ? 'Archive' : 'Activate'} ${client.last_name}`}
                                                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors text-base hover:bg-gray-100 disabled:opacity-50"
                                                >
                                                    {isBusy ? '⏳' : isActive ? '📦' : '♻️'}
                                                </button>

                                                {isHovered && !isBusy && (
                                                    <div
                                                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap text-white text-[11px] font-bold px-2.5 py-1 rounded-md shadow-md z-50 pointer-events-none"
                                                        style={{ backgroundColor: isActive ? '#6b7280' : '#10b981' }}
                                                    >
                                                        {isActive ? 'Archive' : 'Activate'}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-12 text-gray-400 text-sm flex flex-col items-center justify-center gap-1">
                            <span className="text-2xl">📋</span>
                            <span>No client profile data matched filters.</span>
                        </div>
                    )}
                </div>

                {/* Pagination footer: 10 clients per page */}
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

            {/* ── RIGHT PANEL: Workspace Canvas Viewport Display Panels ── */}
            <div className="lg:col-span-7 bg-white rounded-xl shadow-sm border border-gray-100 p-6 min-h-[500px] h-[70vh] overflow-y-auto custom-scrollbar">
                {currentAction === 'empty' && (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 text-gray-400">
                        <div className="text-5xl mb-3">🗂️</div>
                        <h3 className="text-base font-bold text-gray-700">Operational Content Window</h3>
                        <p className="text-xs max-w-sm mt-1.5 leading-relaxed text-gray-400">
                            Select an action macro row or trigger registration from the left panel directory list to begin processing active record parameters.
                        </p>
                    </div>
                )}

                {/* ACTION BLOCK: REGISTRATION / EDIT FORM CANVAS (shared by Create and Update) */}
                {(currentAction === 'create' || isUpdateMode) && (
                    <div className="space-y-4">
                        <h3 className="text-base font-bold text-gray-800 pb-2 border-b border-gray-100 flex items-center gap-2">
                            <span>{isUpdateMode ? '✏️' : '✨'}</span>
                            {isUpdateMode
                                ? `Edit Client Record — ${selectedClient.first_name} ${selectedClient.last_name}`
                                : 'Register New Client Account'}
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

                        <form className="space-y-4" onSubmit={handleFormSubmit}>

                            {/* Photo stream browsing container dropzone panel - ENLARGED TWICE ITS SIZE */}
                            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                <div className="w-32 h-32 rounded-full bg-gray-200 border border-gray-300 overflow-hidden shrink-0 flex items-center justify-center text-3xl text-gray-500 shadow-inner">
                                    {imagePreview ? <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" /> : <span>📷</span>}
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-bold text-gray-700 cursor-pointer bg-white px-3 py-1.5 border border-gray-200 rounded-md shadow-sm hover:bg-gray-50 transition w-max">
                                        {isUpdateMode ? 'Replace Image File' : 'Browse Image File'}
                                        <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                                    </label>
                                    <p className="text-[10px] text-gray-400">Supports JPEG, PNG up to 2MB string path map definitions.</p>
                                    {fieldErrors.photo_path && <span className="text-xs text-red-500 font-medium">{fieldErrors.photo_path}</span>}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Last Name</label>
                                    <input
                                        type="text"
                                        value={data.last_name}
                                        onChange={e => setData('last_name', toCapitalCase(e.target.value))}
                                        className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[rgb(240,136,176)]"
                                        required
                                    />
                                    {fieldErrors.last_name && <span className="text-xs text-red-500">{fieldErrors.last_name}</span>}
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">First Name</label>
                                    <input
                                        type="text"
                                        value={data.first_name}
                                        onChange={e => setData('first_name', toCapitalCase(e.target.value))}
                                        className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[rgb(240,136,176)]"
                                        required
                                    />
                                    {fieldErrors.first_name && <span className="text-xs text-red-500">{fieldErrors.first_name}</span>}
                                </div>
                                <div className="sm:col-span-1">
                                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">M.I.</label>
                                    <input
                                        type="text"
                                        maxLength={3}
                                        value={data.middle_initial}
                                        onChange={e => setData('middle_initial', e.target.value.toUpperCase())}
                                        className="w-full p-2.5 border border-gray-200 rounded-lg text-sm text-center outline-none focus:ring-2 focus:ring-[rgb(240,136,176)]"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Gender</label>
                                    <select
                                        value={data.gender}
                                        onChange={e => setData('gender', e.target.value)}
                                        className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[rgb(240,136,176)] bg-white"
                                        required
                                    >
                                        <option value="" disabled>Select...</option>
                                        <option value="M">Male</option>
                                        <option value="F">Female</option>
                                    </select>
                                    {fieldErrors.gender && <span className="text-xs text-red-500">{fieldErrors.gender}</span>}
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Date of Birth</label>
                                    <input type="date" value={data.date_of_birth} onChange={e => setData('date_of_birth', e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[rgb(240,136,176)]" />
                                    {fieldErrors.date_of_birth && <span className="text-xs text-red-500">{fieldErrors.date_of_birth}</span>}
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Age</label>
                                    <input type="text" readOnly value={data.age} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500 cursor-not-allowed outline-none" placeholder="Auto-calculated" />
                                    {fieldErrors.age && <span className="text-xs text-red-500">{fieldErrors.age}</span>}
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Phone Number</label>
                                    <input type="text" value={data.phone} onChange={handlePhoneChange} placeholder="e.g. +63 917 123 4567" className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[rgb(240,136,176)]" />
                                    {fieldErrors.phone && <span className="text-xs text-red-500">{fieldErrors.phone}</span>}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Facebook Account</label>
                                <input
                                    type="text"
                                    value={data.facebook_account}
                                    onChange={e => setData('facebook_account', e.target.value)}
                                    placeholder="e.g. facebook.com/username"
                                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[rgb(240,136,176)]"
                                />
                                {fieldErrors.facebook_account && <span className="text-xs text-red-500">{fieldErrors.facebook_account}</span>}
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Physical Address Info</label>
                                <textarea
                                    rows={3}
                                    value={data.address}
                                    onChange={e => setData('address', toCapitalCase(e.target.value))}
                                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[rgb(240,136,176)] resize-none"
                                />
                                {fieldErrors.address && <span className="text-xs text-red-500">{fieldErrors.address}</span>}
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
                                        : (isUpdateMode ? 'Update Client' : 'Save Client')}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* ACTION BLOCK: MASTER PROFILE OVERVIEW OVERLAY */}
                {currentAction === 'view' && selectedClient && (
                    <div className="space-y-4">
                        <h3 className="text-base font-bold text-gray-800 pb-2 border-b border-gray-100 flex items-center gap-2">
                            <span>🔍</span> Client Master Overview
                        </h3>
                        <div className="bg-gray-50/60 border border-gray-100 rounded-xl p-5 space-y-4">
                            <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
                                <div className="w-20 h-20 rounded-full border border-gray-200 overflow-hidden bg-white shadow-sm flex items-center justify-center text-2xl text-gray-300">
                                    {selectedClient.photo_path ? <img src={`/storage/${selectedClient.photo_path}`} alt="" className="w-full h-full object-cover" /> : <span>👤</span>}
                                </div>
                                <div>
                                    <h4 className="text-base font-bold text-gray-800">{selectedClient.first_name} {selectedClient.last_name}</h4>
                                    <span className="inline-flex items-center mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-100">{selectedClient.status}</span>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <span className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Gender</span>
                                    <span className="text-sm font-semibold text-gray-800">{selectedClient.gender === 'F' ? 'Female' : selectedClient.gender === 'M' ? 'Male' : 'Not Recorded'}</span>
                                </div>
                                <div>
                                    <span className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Date of Birth</span>
                                    <span className="text-sm font-semibold text-gray-800">{selectedClient.date_of_birth || 'Not Recorded'}</span>
                                </div>
                                <div>
                                    <span className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Age Parameters</span>
                                    <span className="text-sm font-semibold text-gray-800">{selectedClient.age} Years Old</span>
                                </div>
                                <div>
                                    <span className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Telephone Context</span>
                                    <span className="text-sm font-semibold text-gray-800">{selectedClient.phone || 'No phone recorded'}</span>
                                </div>
                            </div>
                            <div className="pt-2 border-t border-gray-100">
                                <span className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Facebook Account</span>
                                <p className="text-sm text-gray-700 leading-relaxed">{selectedClient.facebook_account || 'No social account recorded.'}</p>
                            </div>
                            <div className="pt-2 border-t border-gray-100">
                                <span className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Registered Residence Location</span>
                                <p className="text-sm text-gray-700 leading-relaxed">{selectedClient.address || 'No location parameters mapped into system profile records.'}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* ACTION BLOCK: HARD DESTRUCTIVE PURGE DELETION DIALOG */}
                {currentAction === 'delete' && selectedClient && (
                    <div className="border border-red-100 bg-red-50/40 p-6 rounded-xl space-y-4">
                        <div className="flex items-center gap-2.5 text-red-700 font-bold text-base">
                            <span>⚠️</span> <span>Destructive Lifecycle Confirmation</span>
                        </div>
                        <p className="text-xs text-gray-600 leading-relaxed">
                            Are you absolutely certain you wish to purge the directory files corresponding with <span className="font-bold text-gray-800">{selectedClient.first_name} {selectedClient.last_name}</span>? This action is immutable and will immediately disrupt cascade indices.
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
                                onClick={() => { setCurrentAction('empty'); setSelectedClient(null); setFormStatus(null); }}
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
