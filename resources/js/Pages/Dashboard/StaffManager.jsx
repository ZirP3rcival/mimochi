import React, { useState, useEffect, useRef } from 'react';
import { useForm } from '@inertiajs/react';

const EMPTY_FORM = {
    staff_name: '',
    username: '',
    password: '',
    password_confirmation: '',
    user_type: 'staff',
};

// Reads the XSRF-TOKEN cookie Laravel's "web" middleware group sets, so
// plain fetch() calls (outside Inertia's own request cycle) still pass
// CSRF verification, the same way axios does it automatically.
function getXsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

export default function StaffManager({ staffList: initialStaff = [], currentStaffId = null }) {
    // Structural layout management state variables
    const [searchQuery, setSearchQuery] = useState('');
    const [currentAction, setCurrentAction] = useState('empty');
    const [selectedStaff, setSelectedStaff] = useState(null);
    const [hoveredButtonId, setHoveredButtonId] = useState(null);

    // Directory list is server-driven: capped at 10 records, and
    // re-fetched whenever the search box changes (or comes up empty).
    const [staffRows, setStaffRows] = useState(initialStaff);
    const [listLoading, setListLoading] = useState(false);
    const [listError, setListError] = useState(null);
    const fetchTokenRef = useRef(0);

    // Transient banner for the enable/disable toggle icon, since that
    // action fires straight from the list row with no confirmation screen.
    const [toggleNotice, setToggleNotice] = useState(null); // { type, message }
    const [togglingId, setTogglingId] = useState(null);

    // Outcome banner shared by the create/update form and the delete dialog
    const [formStatus, setFormStatus] = useState(null); // { type: 'success' | 'error', message: string }
    const [fieldErrors, setFieldErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const actionsConfig = {
        view: { label: 'View', color: '#3b82f6', icon: '👁️' },
        update: { label: 'Update', color: '#eab308', icon: '✏️' },
        delete: { label: 'Delete', color: '#ef4444', icon: '🗑️' },
    };

    // Form parameter definitions integrated with your database migration matrix
    const { data, setData, reset } = useForm(EMPTY_FORM);

    const isUpdateMode = currentAction === 'update' && !!selectedStaff;

    const toCapitalCase = (str) => str.replace(/\b\w/g, (char) => char.toUpperCase());

    // Fetches the staff directory list from the server: first 10 accounts
    // (alphabetical) when the search box is empty, or up to 10 matches
    // when it isn't. Debounced so we don't fire a request on every
    // keystroke, and guarded against out-of-order responses (a slow
    // earlier request overwriting a faster, newer one).
    useEffect(() => {
        const requestId = ++fetchTokenRef.current;
        const handle = setTimeout(async () => {
            setListLoading(true);
            setListError(null);

            try {
                const params = searchQuery.trim()
                    ? `?search=${encodeURIComponent(searchQuery.trim())}`
                    : '';
                const response = await fetch(`/staff${params}`, {
                    headers: { Accept: 'application/json' },
                    credentials: 'same-origin',
                });

                if (!response.ok) {
                    throw new Error('Unable to load staff accounts right now.');
                }

                const body = await response.json();

                // Ignore this result if a newer search has since been fired
                if (requestId === fetchTokenRef.current) {
                    setStaffRows(body.staff || []);
                }
            } catch (err) {
                if (requestId === fetchTokenRef.current) {
                    setListError(err.message || 'Unable to load staff accounts right now.');
                }
            } finally {
                if (requestId === fetchTokenRef.current) {
                    setListLoading(false);
                }
            }
        }, searchQuery.trim() ? 300 : 0);

        return () => clearTimeout(handle);
    }, [searchQuery]);

    const refreshStaffList = () => {
        // Nudge the search effect to re-run against the current query
        // (works even when searchQuery is unchanged, e.g. right after save)
        fetchTokenRef.current += 1;
        const requestId = fetchTokenRef.current;
        const params = searchQuery.trim()
            ? `?search=${encodeURIComponent(searchQuery.trim())}`
            : '';

        fetch(`/staff${params}`, {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
        })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Refresh failed'))))
            .then((body) => {
                if (requestId === fetchTokenRef.current) {
                    setStaffRows(body.staff || []);
                }
            })
            .catch(() => {
                /* silent: the list keeps showing its last known-good state */
            });
    };

    // Toggles action macro states across workspace canvas panels
    const triggerAction = (actionType, staffMember) => {
        setSelectedStaff(staffMember);
        setCurrentAction(actionType);
        setFormStatus(null);
        setFieldErrors({});

        if (actionType === 'update' && staffMember) {
            // Load the selected account straight into the same form the
            // "New Staff" button uses, so Save turns into Update. Password
            // fields stay blank — leaving them blank keeps the current one.
            setData({
                staff_name: staffMember.staff_name || '',
                username: staffMember.username || '',
                password: '',
                password_confirmation: '',
                user_type: staffMember.user_type || 'staff',
            });
        } else if (actionType === 'create') {
            reset();
        }
    };

    // Submits the registration/edit form. POSTs to /staff for a new
    // account, or PUTs to /staff/{id} for an update.
    const handleFormSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setFormStatus(null);
        setFieldErrors({});

        const url = isUpdateMode ? `/staff/${selectedStaff.id}` : '/staff';

        try {
            const response = await fetch(url, {
                method: isUpdateMode ? 'PUT' : 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-XSRF-TOKEN': getXsrfToken() || '',
                },
                credentials: 'same-origin',
                body: JSON.stringify(data),
            });

            const body = await response.json().catch(() => ({}));

            if (response.ok) {
                setFormStatus({
                    type: 'success',
                    message: body.message || (isUpdateMode ? 'Staff account updated successfully.' : 'Staff account saved successfully.'),
                });

                if (isUpdateMode) {
                    // Keep the form populated with the saved values and
                    // reflect them in the selected state.
                    if (body.staff) {
                        setSelectedStaff(body.staff);
                        setData((current) => ({ ...current, password: '', password_confirmation: '' }));
                    }
                } else {
                    // Success on a new registration clears the form.
                    reset();
                }

                refreshStaffList();
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

    // Permanently removes the selected staff account after the user
    // confirms in the destructive-action dialog below.
    const handleConfirmDelete = async () => {
        if (!selectedStaff) return;
        setDeleting(true);
        setFormStatus(null);

        try {
            const response = await fetch(`/staff/${selectedStaff.id}`, {
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
                    message: body.message || 'Staff account removed successfully.',
                });
                refreshStaffList();
                setTimeout(() => {
                    setCurrentAction('empty');
                    setSelectedStaff(null);
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

    // Flips a row's active status straight from the directory list — this
    // is the enable/disable icon that replaces the old Schedule action.
    const handleToggleStatus = async (staffMember) => {
        setTogglingId(staffMember.id);
        setToggleNotice(null);

        try {
            const response = await fetch(`/staff/${staffMember.id}/toggle-status`, {
                method: 'PATCH',
                headers: {
                    Accept: 'application/json',
                    'X-XSRF-TOKEN': getXsrfToken() || '',
                },
                credentials: 'same-origin',
            });

            const body = await response.json().catch(() => ({}));

            if (response.ok) {
                setToggleNotice({ type: 'success', message: body.message || 'Status updated.' });

                if (body.staff) {
                    setStaffRows((rows) =>
                        rows.map((row) => (row.id === body.staff.id ? { ...row, active: body.staff.active } : row))
                    );
                    if (selectedStaff?.id === body.staff.id) {
                        setSelectedStaff(body.staff);
                    }
                }
            } else {
                setToggleNotice({
                    type: 'error',
                    message: body.message || `Status update failed (server responded ${response.status}).`,
                });
            }
        } catch (err) {
            setToggleNotice({
                type: 'error',
                message: 'Status update failed: could not reach the server.',
            });
        } finally {
            setTogglingId(null);
            setTimeout(() => setToggleNotice(null), 3000);
        }
    };

    return (
        <div className="w-full min-h-[calc(100vh-6rem)] bg-gray-50 grid grid-cols-1 lg:grid-cols-12 gap-6 p-2 sm:p-4 overflow-visible">

            {/* ── LEFT PANEL: Directory Lookup Layout List ── */}
            <div className="lg:col-span-5 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-[70vh] min-h-[500px] overflow-visible">
                <div className="p-4 border-b border-gray-100 flex items-center gap-3 shrink-0">
                    <div className="relative flex-grow">
                        <input
                            type="text"
                            placeholder="Search by staff name or username..."
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
                        <span>➕</span> New Staff
                    </button>
                </div>

                {!listLoading && !listError && (
                    <div className="px-4 pt-2 text-[11px] text-gray-400">
                        {searchQuery.trim()
                            ? `Showing up to 10 matches for "${searchQuery.trim()}"`
                            : 'Showing the first 10 staff accounts'}
                    </div>
                )}

                {toggleNotice && (
                    <div
                        className={`mx-4 mt-2 rounded-lg px-3 py-2 text-xs font-medium border ${
                            toggleNotice.type === 'success'
                                ? 'bg-green-50 text-green-700 border-green-100'
                                : 'bg-red-50 text-red-700 border-red-100'
                        }`}
                    >
                        {toggleNotice.type === 'success' ? '✅ ' : '⚠️ '}
                        {toggleNotice.message}
                    </div>
                )}

                <div className="flex-1 overflow-y-auto divide-y divide-gray-50 p-2 custom-scrollbar">
                    {listLoading ? (
                        <div className="text-center py-12 text-gray-400 text-sm">Loading staff accounts…</div>
                    ) : listError ? (
                        <div className="text-center py-12 text-red-400 text-sm px-6">{listError}</div>
                    ) : staffRows.length > 0 ? (
                        staffRows.map((staffMember) => {
                            const isSelf = currentStaffId != null && staffMember.id === currentStaffId;

                            return (
                                <div
                                    key={staffMember.id}
                                    className={`flex items-center justify-between p-3 rounded-xl transition-colors ${selectedStaff?.id === staffMember.id && currentAction !== 'create' ? 'bg-pink-50/40 border-l-4 border-[rgb(240,136,176)]' : 'hover:bg-gray-50/80'}`}
                                >
                                    <div className="flex items-center gap-3 min-w-0 pr-3">
                                        <div className="w-10 h-10 rounded-full bg-gray-800 text-white overflow-hidden shrink-0 flex items-center justify-center text-sm font-semibold shadow-sm">
                                            {staffMember.staff_name ? staffMember.staff_name.charAt(0).toUpperCase() : '?'}
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="text-sm font-bold text-gray-800 truncate flex items-center gap-1.5">
                                                {staffMember.staff_name}
                                                {isSelf && (
                                                    <span className="text-[10px] font-semibold text-gray-400">(You)</span>
                                                )}
                                            </h4>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <span className="text-xs text-gray-500 truncate">
                                                    {staffMember.username} · <span className="capitalize">{staffMember.user_type}</span>
                                                </span>
                                                <span
                                                    className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                                                        staffMember.active
                                                            ? 'bg-green-50 text-green-700 border-green-100'
                                                            : 'bg-gray-100 text-gray-500 border-gray-200'
                                                    }`}
                                                >
                                                    {staffMember.active ? 'Active' : 'Disabled'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0 overflow-visible">
                                        {Object.entries(actionsConfig).map(([actionKey, config]) => {
                                            const uniqueHoverId = `${actionKey}-${staffMember.id}`;
                                            const isHovered = hoveredButtonId === uniqueHoverId;

                                            return (
                                                <div key={actionKey} className="relative overflow-visible">
                                                    <button
                                                        type="button"
                                                        onClick={() => triggerAction(actionKey, staffMember)}
                                                        onMouseEnter={() => setHoveredButtonId(uniqueHoverId)}
                                                        onMouseLeave={() => setHoveredButtonId(null)}
                                                        aria-label={`${config.label} ${staffMember.staff_name}`}
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

                                        {/* Enable/Disable icon — replaces the old Schedule action.
                                            Flips the account's 1/0 `active` column directly, no
                                            confirmation screen. Hidden for your own account since
                                            the backend refuses to disable the session you're on. */}
                                        {!isSelf && (
                                            <div className="relative overflow-visible">
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleStatus(staffMember)}
                                                    disabled={togglingId === staffMember.id}
                                                    onMouseEnter={() => setHoveredButtonId(`toggle-${staffMember.id}`)}
                                                    onMouseLeave={() => setHoveredButtonId(null)}
                                                    aria-label={staffMember.active ? `Disable ${staffMember.staff_name}` : `Enable ${staffMember.staff_name}`}
                                                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors text-base hover:bg-gray-100 disabled:opacity-40"
                                                >
                                                    {togglingId === staffMember.id ? '⏳' : (staffMember.active ? '✅' : '🚫')}
                                                </button>

                                                {hoveredButtonId === `toggle-${staffMember.id}` && (
                                                    <div
                                                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap text-white text-[11px] font-bold px-2.5 py-1 rounded-md shadow-md z-50 pointer-events-none"
                                                        style={{ backgroundColor: staffMember.active ? '#10b981' : '#6b7280' }}
                                                    >
                                                        {staffMember.active ? 'Disable' : 'Enable'}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="text-center py-12 text-gray-400 text-sm flex flex-col items-center justify-center gap-1">
                            <span className="text-2xl">📋</span>
                            <span>No staff account data matched filters.</span>
                        </div>
                    )}
                </div>
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
                                ? `Edit Staff Account — ${selectedStaff.staff_name}`
                                : 'Register New Staff Account'}
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Staff Name</label>
                                    <input
                                        type="text"
                                        value={data.staff_name}
                                        onChange={e => setData('staff_name', toCapitalCase(e.target.value))}
                                        className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[rgb(240,136,176)]"
                                        required
                                    />
                                    {fieldErrors.staff_name && <span className="text-xs text-red-500">{fieldErrors.staff_name}</span>}
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Username</label>
                                    <input
                                        type="text"
                                        value={data.username}
                                        onChange={e => setData('username', e.target.value.trim())}
                                        className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[rgb(240,136,176)]"
                                        autoCapitalize="off"
                                        autoCorrect="off"
                                        required
                                    />
                                    {fieldErrors.username && <span className="text-xs text-red-500">{fieldErrors.username}</span>}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                                        Password {isUpdateMode && <span className="font-normal text-gray-400">(leave blank to keep current)</span>}
                                    </label>
                                    <input
                                        type="password"
                                        value={data.password}
                                        onChange={e => setData('password', e.target.value)}
                                        className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[rgb(240,136,176)]"
                                        autoComplete="new-password"
                                        required={!isUpdateMode}
                                    />
                                    {fieldErrors.password && <span className="text-xs text-red-500">{fieldErrors.password}</span>}
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Confirm Password</label>
                                    <input
                                        type="password"
                                        value={data.password_confirmation}
                                        onChange={e => setData('password_confirmation', e.target.value)}
                                        className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[rgb(240,136,176)]"
                                        autoComplete="new-password"
                                        required={!isUpdateMode && !!data.password}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Role</label>
                                    <select
                                        value={data.user_type}
                                        onChange={e => setData('user_type', e.target.value)}
                                        className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[rgb(240,136,176)] bg-white"
                                    >
                                        <option value="staff">Staff</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                    {fieldErrors.user_type && <span className="text-xs text-red-500">{fieldErrors.user_type}</span>}
                                </div>
                                {isUpdateMode && (
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Status</label>
                                        <input
                                            type="text"
                                            readOnly
                                            value={selectedStaff.active ? 'Active' : 'Disabled'}
                                            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500 cursor-not-allowed outline-none"
                                        />
                                        <p className="text-[10px] text-gray-400 mt-1">Use the enable/disable icon in the list to change this.</p>
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
                                        : (isUpdateMode ? 'Update Staff' : 'Save Staff')}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* ACTION BLOCK: MASTER PROFILE OVERVIEW OVERLAY */}
                {currentAction === 'view' && selectedStaff && (
                    <div className="space-y-4">
                        <h3 className="text-base font-bold text-gray-800 pb-2 border-b border-gray-100 flex items-center gap-2">
                            <span>🔍</span> Staff Account Overview
                        </h3>
                        <div className="bg-gray-50/60 border border-gray-100 rounded-xl p-5 space-y-4">
                            <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
                                <div className="w-16 h-16 rounded-full bg-gray-800 text-white flex items-center justify-center text-xl font-semibold shrink-0 shadow-sm">
                                    {selectedStaff.staff_name ? selectedStaff.staff_name.charAt(0).toUpperCase() : '?'}
                                </div>
                                <div>
                                    <h4 className="text-base font-bold text-gray-800">{selectedStaff.staff_name}</h4>
                                    <span
                                        className={`inline-flex items-center mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                                            selectedStaff.active
                                                ? 'bg-green-50 text-green-700 border-green-100'
                                                : 'bg-gray-100 text-gray-500 border-gray-200'
                                        }`}
                                    >
                                        {selectedStaff.active ? 'Active' : 'Disabled'}
                                    </span>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <span className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Username</span>
                                    <span className="text-sm font-semibold text-gray-800">{selectedStaff.username}</span>
                                </div>
                                <div>
                                    <span className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Role</span>
                                    <span className="text-sm font-semibold text-gray-800 capitalize">{selectedStaff.user_type}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ACTION BLOCK: HARD DESTRUCTIVE PURGE DELETION DIALOG */}
                {currentAction === 'delete' && selectedStaff && (
                    <div className="border border-red-100 bg-red-50/40 p-6 rounded-xl space-y-4">
                        <div className="flex items-center gap-2.5 text-red-700 font-bold text-base">
                            <span>⚠️</span> <span>Destructive Lifecycle Confirmation</span>
                        </div>
                        <p className="text-xs text-gray-600 leading-relaxed">
                            Are you absolutely certain you wish to permanently remove the staff account for <span className="font-bold text-gray-800">{selectedStaff.staff_name}</span> ({selectedStaff.username})? This action is immutable and will immediately revoke their login access.
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
                                onClick={() => { setCurrentAction('empty'); setSelectedStaff(null); setFormStatus(null); }}
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
