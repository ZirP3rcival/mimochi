import React, { useState, useEffect, useRef } from 'react';
import { ALL_MODULES } from './moduleAccess';

const EMPTY_FORM = { role_name: '', description: '', status: 'Active', modules: ['dashboard'] };

// Reads Laravel's XSRF-TOKEN cookie so plain fetch() calls pass CSRF checks.
function getXsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

const jsonHeaders = (extra = {}) => ({
    Accept: 'application/json',
    'X-XSRF-TOKEN': getXsrfToken() || '',
    ...extra,
});

export default function UserRoleManager() {
    const [searchQuery, setSearchQuery] = useState('');
    const [currentAction, setCurrentAction] = useState('empty'); // empty | create | update | delete
    const [selectedRole, setSelectedRole] = useState(null);
    const [hoveredButtonId, setHoveredButtonId] = useState(null);

    const [roleList, setRoleList] = useState([]);
    const [listLoading, setListLoading] = useState(false);
    const [listError, setListError] = useState(null);
    const fetchTokenRef = useRef(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageMeta, setPageMeta] = useState({ current_page: 1, last_page: 1, per_page: 10, total: 0 });

    const [form, setForm] = useState(EMPTY_FORM);
    const [formStatus, setFormStatus] = useState(null);
    const [fieldErrors, setFieldErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const actionsConfig = {
        update: { label: 'Update', color: '#eab308', icon: '✏️' },
        delete: { label: 'Delete', color: '#ef4444', icon: '🗑️' },
    };

    const isUpdateMode = currentAction === 'update' && !!selectedRole;
    const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));
    const isAdminRole = isUpdateMode && selectedRole.role_key === 'admin';
    const toggleModule = (id) =>
        setForm((f) => ({
            ...f,
            modules: f.modules.includes(id) ? f.modules.filter((m) => m !== id) : [...f.modules, id],
        }));
    const toCapitalCase = (str) => str.replace(/\b\w/g, (c) => c.toUpperCase());

    useEffect(() => { setCurrentPage(1); }, [searchQuery]);

    const buildListParams = (page) => {
        const parts = [];
        if (searchQuery.trim()) parts.push(`search=${encodeURIComponent(searchQuery.trim())}`);
        parts.push(`page=${page}`);
        return `?${parts.join('&')}`;
    };

    // Debounced, out-of-order-safe directory fetch (same pattern as Clients).
    useEffect(() => {
        const requestId = ++fetchTokenRef.current;
        const handle = setTimeout(async () => {
            setListLoading(true);
            setListError(null);
            try {
                const response = await fetch(`/user-roles${buildListParams(currentPage)}`, {
                    headers: { Accept: 'application/json' },
                    credentials: 'same-origin',
                });
                if (!response.ok) throw new Error('Unable to load roles right now.');
                const body = await response.json();
                if (requestId === fetchTokenRef.current) {
                    setRoleList(body.roles || []);
                    if (body.meta) setPageMeta(body.meta);
                }
            } catch (err) {
                if (requestId === fetchTokenRef.current) {
                    setListError(err.message || 'Unable to load roles right now.');
                }
            } finally {
                if (requestId === fetchTokenRef.current) setListLoading(false);
            }
        }, searchQuery.trim() ? 300 : 0);

        return () => clearTimeout(handle);
    }, [searchQuery, currentPage]);

    const refreshRoleList = (page = currentPage) => {
        fetchTokenRef.current += 1;
        const requestId = fetchTokenRef.current;

        fetch(`/user-roles${buildListParams(page)}`, {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
        })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Refresh failed'))))
            .then((body) => {
                if (requestId !== fetchTokenRef.current) return;
                const roles = body.roles || [];
                if (roles.length === 0 && page > 1) {
                    setCurrentPage(page - 1);
                    return;
                }
                setRoleList(roles);
                if (body.meta) setPageMeta(body.meta);
            })
            .catch(() => { /* keep last known-good list */ });
    };

    const triggerAction = (actionType, role) => {
        setSelectedRole(role);
        setCurrentAction(actionType);
        setFormStatus(null);
        setFieldErrors({});

        if (actionType === 'update' && role) {
            setForm({
                role_name: role.role_name || '',
                description: role.description || '',
                status: role.status || 'Active',
                modules: Array.isArray(role.modules) ? role.modules : [],
            });
        } else if (actionType === 'create') {
            setForm(EMPTY_FORM);
        }
    };

    const closePanel = () => {
        setCurrentAction('empty');
        setSelectedRole(null);
        setFormStatus(null);
        setFieldErrors({});
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setFormStatus(null);
        setFieldErrors({});

        const url = isUpdateMode ? `/user-roles/${selectedRole.id}` : '/user-roles';

        try {
            const response = await fetch(url, {
                method: isUpdateMode ? 'PUT' : 'POST',
                headers: jsonHeaders({ 'Content-Type': 'application/json' }),
                credentials: 'same-origin',
                body: JSON.stringify(form),
            });
            const body = await response.json().catch(() => ({}));

            if (response.ok) {
                setFormStatus({
                    type: 'success',
                    message: body.message || (isUpdateMode ? 'Role updated successfully.' : 'Role saved successfully.'),
                });
                if (isUpdateMode) {
                    if (body.role) setSelectedRole(body.role);
                } else {
                    setForm(EMPTY_FORM);
                }
                refreshRoleList();
            } else if (response.status === 422) {
                const errors = body.errors || {};
                setFieldErrors(
                    Object.fromEntries(Object.entries(errors).map(([f, m]) => [f, m[0]]))
                );
                const flat = Object.values(errors).flat();
                setFormStatus({
                    type: 'error',
                    message: flat.length ? flat.join(' ') : (body.message || 'Some fields need your attention.'),
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
        if (!selectedRole) return;
        setDeleting(true);
        setFormStatus(null);

        try {
            const response = await fetch(`/user-roles/${selectedRole.id}`, {
                method: 'DELETE',
                headers: jsonHeaders(),
                credentials: 'same-origin',
            });
            const body = await response.json().catch(() => ({}));

            if (response.ok) {
                setFormStatus({ type: 'success', message: body.message || 'Role deleted successfully.' });
                refreshRoleList();
                setTimeout(closePanel, 1200);
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

    const cancelBtn = (
        <button
            type="button"
            onClick={closePanel}
            className="px-4 py-2 bg-red-500 text-white rounded-lg text-xs font-semibold hover:bg-red-600 transition"
        >
            Cancel
        </button>
    );

    const banner = formStatus && (
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
    );

    return (
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-visible">

            {/* ── LIST PANEL ── */}
            <div className="lg:col-span-5 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-[70vh] min-h-[500px] overflow-visible">
                <div className="p-4 border-b border-gray-100 flex items-center gap-3 shrink-0">
                    <div className="relative flex-grow">
                        <input
                            type="text"
                            placeholder="Search roles..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm outline-none transition focus:ring-2 focus:ring-[rgb(240,136,176)] focus:border-[rgb(240,136,176)]"
                        />
                        <span className="absolute left-3 top-2.5 text-gray-400 text-xs">🔍</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => triggerAction('create', null)}
                        className="bg-[rgb(240,136,176)] hover:bg-[rgb(225,120,160)] text-white font-semibold text-sm px-3 py-2 rounded-lg flex items-center gap-2 transition shadow-sm whitespace-nowrap"
                    >
                        <span>➕</span> New Role
                    </button>
                </div>

                {!listLoading && !listError && (
                    <div className="px-4 pt-2 text-[11px] text-gray-400">
                        {pageMeta.total > 0
                            ? `Showing ${(pageMeta.per_page * (pageMeta.current_page - 1)) + 1}–${Math.min(pageMeta.per_page * pageMeta.current_page, pageMeta.total)} of ${pageMeta.total}${searchQuery.trim() ? ` matching "${searchQuery.trim()}"` : ' roles'}`
                            : searchQuery.trim() ? `No matches for "${searchQuery.trim()}"` : 'No roles yet'}
                    </div>
                )}

                <div className="flex-1 overflow-y-auto divide-y divide-gray-50 p-2 custom-scrollbar">
                    {listLoading ? (
                        <div className="text-center py-12 text-gray-400 text-sm">Loading roles…</div>
                    ) : listError ? (
                        <div className="text-center py-12 text-red-400 text-sm px-6">{listError}</div>
                    ) : roleList.length > 0 ? (
                        roleList.map((role) => (
                            <div
                                key={role.id}
                                className={`flex items-center justify-between p-3 rounded-xl transition-colors ${selectedRole?.id === role.id && currentAction !== 'create' ? 'bg-pink-50/40 border-l-4 border-[rgb(240,136,176)]' : 'hover:bg-gray-50/80'}`}
                            >
                                <div className="flex items-center gap-3 min-w-0 pr-3">
                                    <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 shrink-0 flex items-center justify-center text-base shadow-sm">
                                        🛡️
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="text-sm font-bold text-gray-800 truncate">
                                            {role.role_name}
                                            {role.is_system && (
                                                <span className="ml-2 text-[10px] font-semibold text-gray-400 border border-gray-200 rounded px-1.5 py-0.5 align-middle">SYSTEM</span>
                                            )}
                                        </h4>
                                        <p className="text-xs text-gray-500 truncate mt-0.5">
                                            <span className={role.status === 'Active' ? 'text-green-600 font-semibold' : 'text-gray-400 font-semibold'}>
                                                {role.status || 'Active'}
                                            </span>
                                            {role.description ? ` · ${role.description}` : ''}
                                            {` · ${(role.modules || []).length} modules · ${role.users_count || 0} user${role.users_count === 1 ? '' : 's'}`}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 shrink-0 overflow-visible">
                                    {Object.entries(actionsConfig).map(([actionKey, config]) => {
                                        if (actionKey === 'delete' && role.is_system) return null;
                                        // Roles held by users can't be deleted
                                        const inUse = actionKey === 'delete' && (role.users_count || 0) > 0;
                                        const hoverId = `${actionKey}-${role.id}`;
                                        return (
                                            <div key={actionKey} className="relative overflow-visible">
                                                <button
                                                    type="button"
                                                    onClick={() => triggerAction(actionKey, role)}
                                                    onMouseEnter={() => setHoveredButtonId(hoverId)}
                                                    onMouseLeave={() => setHoveredButtonId(null)}
                                                    disabled={inUse}
                                                    aria-label={`${config.label} ${role.role_name}`}
                                                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors text-base hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                                >
                                                    {config.icon}
                                                </button>
                                                {hoveredButtonId === hoverId && (
                                                    <div
                                                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap text-white text-[11px] font-bold px-2.5 py-1 rounded-md shadow-md z-50 pointer-events-none"
                                                        style={{ backgroundColor: inUse ? '#6b7280' : config.color }}
                                                    >
                                                        {inUse ? 'In use: reassign users first' : config.label}
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
                            <span>No roles matched filters.</span>
                        </div>
                    )}
                </div>

                {!listLoading && !listError && pageMeta.last_page > 1 && (
                    <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 shrink-0">
                        <button
                            type="button"
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={pageMeta.current_page <= 1}
                            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
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
                            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Next →
                        </button>
                    </div>
                )}
            </div>

            {/* ── WORKSPACE PANEL ── */}
            <div className="lg:col-span-7 bg-white rounded-xl shadow-sm border border-gray-100 p-6 min-h-[500px] h-[70vh] overflow-y-auto custom-scrollbar">
                {currentAction === 'empty' && (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 text-gray-400">
                        <div className="text-5xl mb-3">🛡️</div>
                        <h3 className="text-base font-bold text-gray-700">User Role Maintenance</h3>
                        <p className="text-xs max-w-sm mt-1.5 leading-relaxed">
                            Select a role action from the list, or press New Role to add one.
                        </p>
                    </div>
                )}

                {(currentAction === 'create' || isUpdateMode) && (
                    <div className="space-y-4">
                        <h3 className="text-base font-bold text-gray-800 pb-2 border-b border-gray-100 flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2">
                                <span>{isUpdateMode ? '✏️' : '✨'}</span>
                                {isUpdateMode ? `Edit Role — ${selectedRole.role_name}` : 'Register New Role'}
                            </span>
                            {cancelBtn}
                        </h3>

                        {banner}

                        <form className="space-y-4" onSubmit={handleFormSubmit}>
                            <div className="space-y-1">
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Role Name *</label>
                                <input
                                    type="text"
                                    required
                                    value={form.role_name}
                                    onChange={(e) => setField('role_name', toCapitalCase(e.target.value))}
                                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[rgb(240,136,176)]"
                                />
                                {isUpdateMode && (
                                    <span className="text-xs text-gray-400">
                                        Login key: {selectedRole.role_key} (never changes). Assigned to {selectedRole.users_count || 0} user{selectedRole.users_count === 1 ? '' : 's'}.</span>
                                )}
                                {fieldErrors.role_name && <span className="text-xs text-red-500">{fieldErrors.role_name}</span>}
                            </div>

                            <div className="space-y-1">
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Description</label>
                                <textarea
                                    rows={3}
                                    value={form.description}
                                    onChange={(e) => setField('description', e.target.value)}
                                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[rgb(240,136,176)] resize-none"
                                />
                                {fieldErrors.description && <span className="text-xs text-red-500">{fieldErrors.description}</span>}
                            </div>

                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Module Access</label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {ALL_MODULES.map((mod) => {
                                        const checked = isAdminRole || form.modules.includes(mod.id);
                                        return (
                                            <label
                                                key={mod.id}
                                                className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-xs font-medium cursor-pointer transition ${checked ? 'border-[rgb(240,136,176)] bg-pink-50/50 text-gray-800' : 'border-gray-200 text-gray-500 hover:bg-gray-50'} ${isAdminRole ? 'opacity-60 cursor-not-allowed' : ''}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    disabled={isAdminRole}
                                                    onChange={() => toggleModule(mod.id)}
                                                    className="accent-[rgb(240,136,176)]"
                                                />
                                                {mod.label}
                                            </label>
                                        );
                                    })}
                                </div>
                                <span className="text-xs text-gray-400">
                                    {isAdminRole
                                        ? 'Admin always has every module.'
                                        : 'Staff with this role can only open the checked modules.'}
                                </span>
                                {fieldErrors.modules && <span className="text-xs text-red-500">{fieldErrors.modules}</span>}
                            </div>

                            <div className="space-y-1">
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Status</label>
                                <select
                                    value={form.status}
                                    disabled={isAdminRole}
                                    onChange={(e) => setField('status', e.target.value)}
                                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[rgb(240,136,176)] bg-white"
                                >
                                    <option value="Active">Active</option>
                                    <option value="Inactive">Inactive</option>
                                </select>
                                <span className="text-xs text-gray-400">
                                    {isAdminRole
                                        ? 'Admin must stay Active.'
                                        : 'Inactive roles cannot log in or open any module.'}
                                </span>
                                {fieldErrors.status && <span className="text-xs text-red-500">{fieldErrors.status}</span>}
                            </div>

                            <div className="flex justify-end gap-2 pt-4 border-t border-gray-50">
                                {cancelBtn}
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
                                        : (isUpdateMode ? 'Update Role' : 'Save Role')}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {currentAction === 'delete' && selectedRole && (
                    <div className="space-y-4">
                        <h3 className="text-base font-bold text-gray-800 pb-2 border-b border-gray-100 flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2"><span>🗑️</span> Delete Role</span>
                            {cancelBtn}
                        </h3>

                        {banner}

                        {(selectedRole.users_count || 0) > 0 && (
                            <div className="rounded-lg px-4 py-3 text-sm font-medium border bg-yellow-50 text-yellow-700 border-yellow-100">
                                ⚠️ This role is assigned to {selectedRole.users_count} user{selectedRole.users_count === 1 ? '' : 's'} and can't be deleted. Reassign those users first.
                            </div>
                        )}

                        <div className="bg-red-50/60 border border-red-100 rounded-xl p-5 space-y-3">
                            <p className="text-sm text-gray-700">
                                Permanently delete the role <span className="font-bold">{selectedRole.role_name}</span>? This can't be undone.
                            </p>
                            <div className="flex justify-end gap-2">
                                {cancelBtn}
                                <button
                                    type="button"
                                    onClick={handleConfirmDelete}
                                    disabled={deleting || (selectedRole.users_count || 0) > 0}
                                    className="px-4 py-2 bg-gray-800 hover:bg-gray-900 disabled:bg-gray-300 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                                >
                                    {deleting ? 'Deleting...' : 'Confirm Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
