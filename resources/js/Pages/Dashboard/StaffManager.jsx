import React, { useState, useEffect, useRef } from 'react';
import { useForm, router } from '@inertiajs/react';

const EMPTY_FORM = {
    id_no: '',
    staff_name: '',
    contact_no: '',
    address: '',
    birthdate: '',
    tin: '',
    sss_no: '',
    philhealth_no: '',
    emergency_contact: '',
    username: '',
    password: '',
    password_confirmation: '',
    user_type: 'staff',
    position_id: '',
    available: true,
    can_login: true,
};

const inputCls = 'w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[rgb(240,136,176)]';

// Label + control + inline validation message
function Field({ label, error, hint, children }) {
    return (
        <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
            {children}
            {hint && <p className="text-[10px] text-gray-400 mt-1">{hint}</p>}
            {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
    );
}

function SectionTitle({ children }) {
    return (
        <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider pt-2 border-t border-gray-50">
            {children}
        </h4>
    );
}

// Number fields never accept letters: anything else is stripped as the user
// types or pastes. Phone keeps + - ( ) and spaces; ID numbers keep - and spaces.
const digitsOnlyPhone = (v) => v.replace(/[^0-9+\-()\s]/g, '');
const digitsOnlyId = (v) => v.replace(/[^0-9\-\s]/g, '');

const formatDate = (value) => {
    if (!value) return null;
    const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(d.getTime())
        ? value
        : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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

    // Profile picture: kept outside the form data because it's a File.
    // photoPreview is what the form shows (existing picture or a fresh pick);
    // removePhoto asks the server to delete the saved picture.
    const [photoFile, setPhotoFile] = useState(null);
    const [photoPreview, setPhotoPreview] = useState(null);
    const [removePhoto, setRemovePhoto] = useState(false);
    const [photoError, setPhotoError] = useState(null);

    const photoUrl = (path) => (path ? `/storage/${path}` : null);

    const clearPhotoState = (existingPath = null) => {
        setPhotoFile(null);
        setRemovePhoto(false);
        setPhotoError(null);
        setPhotoPreview(photoUrl(existingPath));
    };

    const handlePhotoChange = (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setPhotoError('Please choose an image file (JPG, PNG, WEBP...).');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            setPhotoError('Image is too large. Maximum size is 2 MB.');
            return;
        }

        setPhotoError(null);
        setPhotoFile(file);
        setRemovePhoto(false);
        setPhotoPreview(URL.createObjectURL(file));
    };

    const handlePhotoRemove = () => {
        setPhotoFile(null);
        setPhotoPreview(null);
        setPhotoError(null);
        // Only an already-saved picture needs the server told to delete it
        setRemovePhoto(true);
    };

    const isUpdateMode = currentAction === 'update' && !!selectedStaff;

    // Active positions (Settings > Position) for the Position dropdown.
    // Positions are job titles only; access still comes from `user_type`.
    const [positions, setPositions] = useState([]);
    useEffect(() => {
        fetch('/positions?all=1', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
            .then((res) => (res.ok ? res.json() : Promise.reject()))
            .then((body) => setPositions(body.positions || []))
            .catch(() => { /* dropdown just stays empty */ });
    }, []);
    // Active user roles (Settings > User Role). Value stored is the role_key,
    // which is what staff.user_type holds.
    const [roles, setRoles] = useState([]);
    useEffect(() => {
        fetch('/user-roles?all=1', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
            .then((res) => (res.ok ? res.json() : Promise.reject()))
            .then((body) => setRoles(body.roles || []))
            .catch(() => { /* falls back to Staff / Admin below */ });
    }, []);
    const positionName = (id) => positions.find((p) => String(p.id) === String(id))?.position_name || null;

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
                id_no: staffMember.id_no || '',
                staff_name: staffMember.staff_name || '',
                contact_no: staffMember.contact_no || '',
                address: staffMember.address || '',
                birthdate: staffMember.birthdate ? String(staffMember.birthdate).slice(0, 10) : '',
                tin: staffMember.tin || '',
                sss_no: staffMember.sss_no || '',
                philhealth_no: staffMember.philhealth_no || '',
                emergency_contact: staffMember.emergency_contact || '',
                username: staffMember.username || '',
                password: '',
                password_confirmation: '',
                user_type: staffMember.user_type || 'staff',
                position_id: staffMember.position_id ? String(staffMember.position_id) : '',
                available: staffMember.available !== false && staffMember.available !== 0,
                can_login: staffMember.can_login !== false && staffMember.can_login !== 0,
            });
            clearPhotoState(staffMember.photo_path);
        } else if (actionType === 'create') {
            reset();
            clearPhotoState(null);
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
            // Multipart body so the picture can travel with the fields. An
            // update is POSTed with `_method=PUT` (browsers can't send a real
            // multipart PUT). Booleans go as 1/0 for Laravel's boolean rule.
            const payload = new FormData();
            Object.entries({ ...data, position_id: data.position_id || '' }).forEach(([key, value]) => {
                if (value === null || value === undefined) return;
                payload.append(key, typeof value === 'boolean' ? (value ? '1' : '0') : value);
            });
            if (photoFile) payload.append('photo_path', photoFile);
            if (removePhoto && !photoFile) payload.append('remove_photo', '1');
            if (isUpdateMode) payload.append('_method', 'PUT');

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
                    message: body.message || (isUpdateMode ? 'Staff account updated successfully.' : 'Staff account saved successfully.'),
                });

                if (isUpdateMode) {
                    // Keep the form populated with the saved values and
                    // reflect them in the selected state.
                    if (body.staff) {
                        setSelectedStaff(body.staff);
                        setData((current) => ({ ...current, password: '', password_confirmation: '' }));
                        clearPhotoState(body.staff.photo_path);

                        // Editing the account you're logged in as: refresh the
                        // dashboard's `staff` prop so the top-right picture
                        // and name update without a full page reload.
                        if (currentStaffId != null && body.staff.id === currentStaffId) {
                            router.reload({ only: ['staff'] });
                        }
                    }
                } else {
                    // Success on a new registration clears the form.
                    reset();
                    clearPhotoState(null);
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

    // Dropdown options: only Active roles / positions can be picked. If the
    // account being edited already holds one that has since been made
    // Inactive, keep it listed (marked) so the select doesn't go blank.
    const baseRoles = roles.length
        ? roles
        : [
            { role_key: 'staff', role_name: 'Staff' },
            { role_key: 'admin', role_name: 'Admin' },
        ];
    const roleOptions = [...baseRoles];
    if (data.user_type && !roleOptions.some((r) => r.role_key === data.user_type)) {
        roleOptions.push({
            role_key: data.user_type,
            role_name: `${selectedStaff?.role_name || data.user_type} (inactive)`,
        });
    }

    const positionOptions = [...positions];
    if (data.position_id && !positionOptions.some((p) => String(p.id) === String(data.position_id))) {
        positionOptions.push({
            id: data.position_id,
            position_name: `${selectedStaff?.position_name || 'Current position'} (inactive)`,
        });
    }

    const roleLabel = (m) => m.role_name || m.user_type;
    const positionLabel = (m) => m.position_name || positionName(m.position_id) || null;

    const viewFields = selectedStaff
        ? [
            ['ID No', selectedStaff.id_no],
            ['Birthdate', formatDate(selectedStaff.birthdate)],
            ['Contact No', selectedStaff.contact_no],
            ['Emergency Contact', selectedStaff.emergency_contact],
            ['TIN', selectedStaff.tin],
            ['SSS No', selectedStaff.sss_no],
            ['PhilHealth No', selectedStaff.philhealth_no],
            ['Username', selectedStaff.username],
            ['User Role', roleLabel(selectedStaff)],
            ['Position', positionLabel(selectedStaff)],
            ['Available', selectedStaff.available ? 'Yes' : 'No'],
            ['System Login', selectedStaff.can_login === false ? 'No' : 'Yes'],
        ]
        : [];

    return (
        <div className="w-full min-h-[calc(100vh-6rem)] bg-gray-50 grid grid-cols-1 lg:grid-cols-12 gap-6 p-2 sm:p-4 overflow-visible">

            {/* ── LEFT PANEL: Directory Lookup Layout List ── */}
            <div className="lg:col-span-5 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-[70vh] min-h-[500px] overflow-visible">
                <div className="p-4 border-b border-gray-100 flex items-center gap-3 shrink-0">
                    <div className="relative flex-grow">
                        <input
                            type="text"
                            placeholder="Search by name, ID no or username..."
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
                                            {staffMember.photo_path
                                                ? <img src={photoUrl(staffMember.photo_path)} alt="" className="w-full h-full object-cover" />
                                                : (staffMember.staff_name ? staffMember.staff_name.charAt(0).toUpperCase() : '?')}
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
                                                    {staffMember.id_no ? `${staffMember.id_no} · ` : ''}{staffMember.username ? `${staffMember.username} · ` : ''}{roleLabel(staffMember)}
                                                    {positionLabel(staffMember) ? ` · ${positionLabel(staffMember)}` : ''}
                                                </span>
                                                {staffMember.can_login === false && (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border bg-amber-50 text-amber-700 border-amber-100">
                                                        No login
                                                    </span>
                                                )}
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
                        <h3 className="text-base font-bold text-gray-800 pb-2 border-b border-gray-100 flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2">
                                <span>{isUpdateMode ? '✏️' : '✨'}</span>
                                {isUpdateMode
                                    ? `Edit Staff Account — ${selectedStaff.staff_name}`
                                    : 'Register New Staff Account'}
                            </span>
                            <button type="button" onClick={() => setCurrentAction('empty')} className="px-4 py-2 bg-red-500 text-white rounded-lg text-xs font-semibold hover:bg-red-600 transition">Cancel</button>
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
                            <SectionTitle>Personal Information</SectionTitle>
                            <div className="flex items-center gap-4">
                                <div className="w-24 h-24 rounded-full bg-gray-100 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center text-3xl text-gray-400 shadow-sm">
                                    {photoPreview
                                        ? <img src={photoPreview} alt="Profile preview" className="w-full h-full object-cover" />
                                        : (data.staff_name ? <span className="text-gray-500 font-semibold">{data.staff_name.charAt(0).toUpperCase()}</span> : <span>📷</span>)}
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex flex-wrap gap-2">
                                        <label className="text-xs font-bold text-gray-700 cursor-pointer bg-white px-3 py-1.5 border border-gray-200 rounded-md shadow-sm hover:bg-gray-50 transition w-max">
                                            {photoPreview ? 'Replace Picture' : 'Browse Picture'}
                                            <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                                        </label>
                                        {photoPreview && (
                                            <button type="button" onClick={handlePhotoRemove} className="text-xs font-bold text-red-600 bg-white px-3 py-1.5 border border-red-100 rounded-md hover:bg-red-50 transition">
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-gray-400">Profile picture (JPG, PNG, WEBP up to 2 MB).</p>
                                    {(photoError || fieldErrors.photo_path) && (
                                        <span className="text-xs text-red-500 font-medium">{photoError || fieldErrors.photo_path}</span>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Field label="ID No *" error={fieldErrors.id_no}>
                                    <input type="text" value={data.id_no} onChange={e => setData('id_no', e.target.value.trim())} className={inputCls} required />
                                </Field>
                                <Field label="Name *" error={fieldErrors.staff_name}>
                                    <input type="text" value={data.staff_name} onChange={e => setData('staff_name', toCapitalCase(e.target.value))} className={inputCls} required />
                                </Field>
                                <Field label="Birthdate" error={fieldErrors.birthdate}>
                                    <input type="date" value={data.birthdate} max={new Date().toISOString().slice(0, 10)} onChange={e => setData('birthdate', e.target.value)} className={inputCls} />
                                </Field>
                                <Field label="Contact No" error={fieldErrors.contact_no}>
                                    <input type="tel" inputMode="tel" value={data.contact_no} onChange={e => setData('contact_no', digitsOnlyPhone(e.target.value))} className={inputCls} />
                                </Field>
                            </div>
                            <Field label="Address" error={fieldErrors.address}>
                                <textarea rows={2} value={data.address} onChange={e => setData('address', e.target.value)} className={`${inputCls} resize-none`} />
                            </Field>
                            <Field label="Emergency Contact" error={fieldErrors.emergency_contact} hint="Contact person and number in case of emergency.">
                                <input type="text" value={data.emergency_contact} onChange={e => setData('emergency_contact', e.target.value)} className={inputCls} />
                            </Field>

                            <SectionTitle>Government Numbers</SectionTitle>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <Field label="TIN" error={fieldErrors.tin}>
                                    <input type="text" inputMode="numeric" value={data.tin} onChange={e => setData('tin', digitsOnlyId(e.target.value))} className={inputCls} />
                                </Field>
                                <Field label="SSS No" error={fieldErrors.sss_no}>
                                    <input type="text" inputMode="numeric" value={data.sss_no} onChange={e => setData('sss_no', digitsOnlyId(e.target.value))} className={inputCls} />
                                </Field>
                                <Field label="PhilHealth No" error={fieldErrors.philhealth_no}>
                                    <input type="text" inputMode="numeric" value={data.philhealth_no} onChange={e => setData('philhealth_no', digitsOnlyId(e.target.value))} className={inputCls} />
                                </Field>
                            </div>

                            <SectionTitle>Account</SectionTitle>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Field label={data.can_login ? 'Username *' : 'Username'} error={fieldErrors.username}>
                                    <input type="text" value={data.username} onChange={e => setData('username', e.target.value.trim())} className={`${inputCls} disabled:bg-gray-50 disabled:text-gray-400`} autoCapitalize="off" autoCorrect="off" disabled={!data.can_login} required={!!data.can_login} />
                                </Field>
                                <Field label="System Login" error={fieldErrors.can_login} hint="Turn off for staff who only need a record (e.g. for scheduling) and shouldn't sign in.">
                                    <label className="flex items-center gap-2 p-2.5 border border-gray-200 rounded-lg text-sm cursor-pointer">
                                        <input type="checkbox" checked={!!data.can_login} onChange={e => setData('can_login', e.target.checked)} className="accent-[rgb(240,136,176)]" />
                                        {data.can_login ? 'Can log in' : 'Cannot log in'}
                                    </label>
                                </Field>
                                <Field
                                    label={<>Password {isUpdateMode && selectedStaff.can_login ? <span className="font-normal text-gray-400">(leave blank to keep current)</span> : (data.can_login ? '*' : '')}</>}
                                    error={fieldErrors.password}
                                >
                                    <input type="password" value={data.password} onChange={e => setData('password', e.target.value)} className={`${inputCls} disabled:bg-gray-50 disabled:text-gray-400`} autoComplete="new-password" disabled={!data.can_login} required={!!data.can_login && (!isUpdateMode || !selectedStaff.can_login)} />
                                </Field>
                                <Field label="Confirm Password">
                                    <input type="password" value={data.password_confirmation} onChange={e => setData('password_confirmation', e.target.value)} className={`${inputCls} disabled:bg-gray-50 disabled:text-gray-400`} autoComplete="new-password" disabled={!data.can_login} required={!!data.can_login && !!data.password} />
                                </Field>
                                <Field label="User Role *" error={fieldErrors.user_type} hint="Controls login and which modules this account can open.">
                                    <select value={data.user_type} onChange={e => setData('user_type', e.target.value)} className={`${inputCls} bg-white`} required>
                                        {roleOptions.map((r) => (
                                            <option key={r.role_key} value={r.role_key}>{r.role_name}</option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="Position" error={fieldErrors.position_id} hint="Job title (from Settings > Position).">
                                    <select value={data.position_id} onChange={e => setData('position_id', e.target.value)} className={`${inputCls} bg-white`}>
                                        <option value="">— Select position —</option>
                                        {positionOptions.map((p) => (
                                            <option key={p.id} value={p.id}>{p.position_name}</option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="Available" hint="Can be assigned to scheduled services.">
                                    <label className="flex items-center gap-2 p-2.5 border border-gray-200 rounded-lg text-sm cursor-pointer">
                                        <input type="checkbox" checked={!!data.available} onChange={e => setData('available', e.target.checked)} className="accent-[rgb(240,136,176)]" />
                                        {data.available ? 'Available' : 'Not available'}
                                    </label>
                                </Field>
                                {isUpdateMode && (
                                    <Field label="Status" hint="Use the enable/disable icon in the list to change this.">
                                        <input type="text" readOnly value={selectedStaff.active ? 'Active' : 'Disabled'} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500 cursor-not-allowed outline-none" />
                                    </Field>
                                )}
                            </div>

                            <div className="flex justify-end gap-2 pt-4 border-t border-gray-50">
                                <button type="button" onClick={() => setCurrentAction('empty')} className="px-4 py-2 bg-red-500 text-white rounded-lg text-xs font-semibold hover:bg-red-600 transition">Cancel</button>
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
                        <h3 className="text-base font-bold text-gray-800 pb-2 border-b border-gray-100 flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2"><span>🔍</span> Staff Account Overview</span>
                            <button type="button" onClick={() => setCurrentAction('empty')} className="px-4 py-2 bg-red-500 text-white rounded-lg text-xs font-semibold hover:bg-red-600 transition">Cancel</button>
                        </h3>
                        <div className="bg-gray-50/60 border border-gray-100 rounded-xl p-5 space-y-4">
                            <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
                                <div className="w-16 h-16 rounded-full bg-gray-800 text-white overflow-hidden flex items-center justify-center text-xl font-semibold shrink-0 shadow-sm">
                                    {selectedStaff.photo_path
                                        ? <img src={photoUrl(selectedStaff.photo_path)} alt="" className="w-full h-full object-cover" />
                                        : (selectedStaff.staff_name ? selectedStaff.staff_name.charAt(0).toUpperCase() : '?')}
                                </div>
                                <div>
                                    <h4 className="text-base font-bold text-gray-800">{selectedStaff.staff_name}</h4>
                                    {selectedStaff.id_no && <p className="text-xs text-gray-400">ID No {selectedStaff.id_no}</p>}
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
                                {viewFields.map(([label, value]) => (
                                    <div key={label}>
                                        <span className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">{label}</span>
                                        <span className="text-sm font-semibold text-gray-800">{value || '—'}</span>
                                    </div>
                                ))}
                                <div className="sm:col-span-2">
                                    <span className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Address</span>
                                    <span className="text-sm font-semibold text-gray-800 whitespace-pre-line">{selectedStaff.address || '—'}</span>
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
