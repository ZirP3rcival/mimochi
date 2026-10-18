import React, { useState, useEffect, useRef } from 'react';
import { useForm } from '@inertiajs/react';

const EMPTY_FORM = {
    product_name: '',
    product_description: '',
    price: '',
};

// Reads the XSRF-TOKEN cookie Laravel's "web" middleware group sets, so
// plain fetch() calls (outside Inertia's own request cycle) still pass
// CSRF verification, the same way axios does it automatically.
function getXsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

export default function ProductsTab({ initialProducts = [] }) {
    // Structural layout management state variables
    const [searchQuery, setSearchQuery] = useState('');
    const [currentAction, setCurrentAction] = useState('empty');
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [hoveredButtonId, setHoveredButtonId] = useState(null);

    // Catalog list is server-driven: paginated at 10 records per page, and
    // re-fetched whenever the search box or the current page changes.
    const [productList, setProductList] = useState(initialProducts);
    const [listLoading, setListLoading] = useState(false);
    const [listError, setListError] = useState(null);
    const fetchTokenRef = useRef(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageMeta, setPageMeta] = useState({ current_page: 1, last_page: 1, per_page: 10, total: initialProducts.length });

    // Outcome banner shared by the create/update form and the delete dialog
    const [formStatus, setFormStatus] = useState(null); // { type: 'success' | 'error', message: string }
    const [fieldErrors, setFieldErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // List rows only ever offer Update and Delete.
    const actionsConfig = {
        update: { label: 'Update', color: '#eab308', icon: '✏️' },
        delete: { label: 'Delete', color: '#ef4444', icon: '🗑️' },
    };

    const { data, setData, reset } = useForm(EMPTY_FORM);

    const isUpdateMode = currentAction === 'update' && !!selectedProduct;

    // Helper function to capitalize the first letter of each word
    const toCapitalCase = (str) => {
        return str.replace(/\b\w/g, (char) => char.toUpperCase());
    };

    // A new search term always starts back at page 1.
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    const buildListParams = (page) => {
        const parts = [];
        if (searchQuery.trim()) parts.push(`search=${encodeURIComponent(searchQuery.trim())}`);
        parts.push(`page=${page}`);
        return `?${parts.join('&')}`;
    };

    // Fetches the product list from the server: 10 records for the current
    // page, filtered by the search box when it isn't empty. Debounced so we
    // don't fire a request on every keystroke, and guarded against
    // out-of-order responses.
    useEffect(() => {
        const requestId = ++fetchTokenRef.current;
        const handle = setTimeout(async () => {
            setListLoading(true);
            setListError(null);

            try {
                const response = await fetch(`/products${buildListParams(currentPage)}`, {
                    headers: { Accept: 'application/json' },
                    credentials: 'same-origin',
                });

                if (!response.ok) {
                    throw new Error('Unable to load products right now.');
                }

                const body = await response.json();

                // Ignore this result if a newer search has since been fired
                if (requestId === fetchTokenRef.current) {
                    setProductList(body.products || []);
                    if (body.meta) setPageMeta(body.meta);
                }
            } catch (err) {
                if (requestId === fetchTokenRef.current) {
                    setListError(err.message || 'Unable to load products right now.');
                }
            } finally {
                if (requestId === fetchTokenRef.current) {
                    setListLoading(false);
                }
            }
        }, searchQuery.trim() ? 300 : 0);

        return () => clearTimeout(handle);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery, currentPage]);

    const refreshProductList = (page = currentPage) => {
        fetchTokenRef.current += 1;
        const requestId = fetchTokenRef.current;

        fetch(`/products${buildListParams(page)}`, {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
        })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Refresh failed'))))
            .then((body) => {
                if (requestId === fetchTokenRef.current) {
                    const products = body.products || [];
                    // If a delete emptied out the last page, step back a
                    // page instead of leaving the panel blank.
                    if (products.length === 0 && page > 1) {
                        setCurrentPage(page - 1);
                        return;
                    }
                    setProductList(products);
                    if (body.meta) setPageMeta(body.meta);
                }
            })
            .catch(() => {
                /* silent: the list keeps showing its last known-good state */
            });
    };

    // Restricts the price field to plain decimal input: digits, a single
    // decimal point and at most two decimal places.
    const handlePriceChange = (e) => {
        const raw = e.target.value.replace(/[^0-9.]/g, '');
        const [whole, ...rest] = raw.split('.');
        setData('price', rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole);
    };

    // Toggles action macro states across workspace canvas panels
    const triggerAction = (actionType, product) => {
        setSelectedProduct(product);
        setCurrentAction(actionType);
        setFormStatus(null);
        setFieldErrors({});

        if (actionType === 'update' && product) {
            // Load the selected product straight into the same form the
            // "New Product" button uses, so Save turns into Update.
            setData({
                product_name: product.product_name || '',
                product_description: product.product_description || '',
                price: product.price ?? '',
            });
        } else if (actionType === 'create') {
            reset();
        }
    };

    // Submits the create/edit form. POSTs to /products for a new product, or
    // POSTs to /products/{id} with a `_method=PUT` spoof field for an update.
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

        const url = isUpdateMode ? `/products/${selectedProduct.id}` : '/products';
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
                    message: body.message || (isUpdateMode ? 'Product updated successfully.' : 'Product saved successfully.'),
                });

                if (isUpdateMode) {
                    // Keep the form populated with the saved values and
                    // reflect them in the selected state.
                    if (body.product) {
                        setSelectedProduct(body.product);
                    }
                } else {
                    reset();
                }

                refreshProductList();
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

    // Permanently removes the selected product after the user confirms in
    // the destructive-action dialog below.
    const handleConfirmDelete = async () => {
        if (!selectedProduct) return;
        setDeleting(true);
        setFormStatus(null);

        try {
            const response = await fetch(`/products/${selectedProduct.id}`, {
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
                    message: body.message || 'Product removed successfully.',
                });
                refreshProductList();
                // Briefly show the confirmation, then return to the empty state
                setTimeout(() => {
                    setCurrentAction('empty');
                    setSelectedProduct(null);
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

    const formatMoney = (value) => {
        if (value === null || value === undefined || value === '') return '—';
        const num = Number(value);
        return Number.isNaN(num) ? '—' : `₱${num.toFixed(2)}`;
    };

    return (
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-visible">

            {/* ── LEFT PANEL: Catalog Lookup Layout List ── */}
            <div className="lg:col-span-5 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-[70vh] min-h-[500px] overflow-visible">
                <div className="p-4 border-b border-gray-100 flex items-center gap-3 shrink-0">
                    <div className="relative flex-grow">
                        <input
                            type="text"
                            placeholder="Search by product name..."
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
                        <span>➕</span> New Product
                    </button>
                </div>

                {!listLoading && !listError && (
                    <div className="px-4 pt-2 text-[11px] text-gray-400">
                        {pageMeta.total > 0
                            ? `Showing ${(pageMeta.per_page * (pageMeta.current_page - 1)) + 1}–${Math.min(pageMeta.per_page * pageMeta.current_page, pageMeta.total)} of ${pageMeta.total}${searchQuery.trim() ? ` matching "${searchQuery.trim()}"` : ' products'}`
                            : searchQuery.trim()
                                ? `No matches for "${searchQuery.trim()}"`
                                : 'No products yet'}
                    </div>
                )}

                <div className="flex-1 overflow-y-auto divide-y divide-gray-50 p-2 custom-scrollbar">
                    {listLoading ? (
                        <div className="text-center py-12 text-gray-400 text-sm">Loading products…</div>
                    ) : listError ? (
                        <div className="text-center py-12 text-red-400 text-sm px-6">{listError}</div>
                    ) : productList.length > 0 ? (
                        productList.map((product) => (
                            <div
                                key={product.id}
                                className={`flex items-center justify-between p-3 rounded-xl transition-colors ${selectedProduct?.id === product.id && currentAction !== 'create' ? 'bg-pink-50/40 border-l-4 border-[rgb(240,136,176)]' : 'hover:bg-gray-50/80'}`}
                            >
                                <div className="flex items-center gap-3 min-w-0 pr-3">
                                    <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center text-xs text-gray-400 shadow-sm">
                                        <span>🧴</span>
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="text-sm font-bold text-gray-800 truncate">{product.product_name}</h4>
                                        <p className="text-xs text-gray-500 truncate mt-0.5">
                                            {formatMoney(product.price)}
                                        </p>
                                        {product.product_description && (
                                            <p className="text-[11px] text-gray-400 truncate italic mt-0.5">{product.product_description}</p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 shrink-0 overflow-visible">
                                    {Object.entries(actionsConfig).map(([actionKey, config]) => {
                                        const uniqueHoverId = `${actionKey}-${product.id}`;
                                        const isHovered = hoveredButtonId === uniqueHoverId;

                                        return (
                                            <div key={actionKey} className="relative overflow-visible">
                                                <button
                                                    type="button"
                                                    onClick={() => triggerAction(actionKey, product)}
                                                    onMouseEnter={() => setHoveredButtonId(uniqueHoverId)}
                                                    onMouseLeave={() => setHoveredButtonId(null)}
                                                    aria-label={`${config.label} ${product.product_name}`}
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
                            <span>No product data matched filters.</span>
                        </div>
                    )}
                </div>

                {/* Pagination footer: 10 products per page */}
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
                        <div className="text-5xl mb-3">🧴</div>
                        <h3 className="text-base font-bold text-gray-700">Operational Content Window</h3>
                        <p className="text-xs max-w-sm mt-1.5 leading-relaxed text-gray-400">
                            Select a product from the left panel, or register a new one, to begin processing active record parameters.
                        </p>
                    </div>
                )}

                {/* ACTION BLOCK: PRODUCT FORM CANVAS (shared by Create and Update) */}
                {(currentAction === 'create' || isUpdateMode) && (
                    <div className="space-y-4">
                        <h3 className="text-base font-bold text-gray-800 pb-2 border-b border-gray-100 flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2">
                                <span>{isUpdateMode ? '✏️' : '✨'}</span>
                                {isUpdateMode
                                    ? `Edit Product — ${selectedProduct.product_name}`
                                    : 'Register New Product'}
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Product Name</label>
                                    <input
                                        type="text"
                                        value={data.product_name}
                                        onChange={(e) => setData('product_name', toCapitalCase(e.target.value))}
                                        className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[rgb(240,136,176)]"
                                        required
                                    />
                                    {fieldErrors.product_name && <span className="text-xs text-red-500">{fieldErrors.product_name}</span>}
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Price</label>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={data.price}
                                        onChange={handlePriceChange}
                                        placeholder="0.00"
                                        className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[rgb(240,136,176)]"
                                        required
                                    />
                                    {fieldErrors.price && <span className="text-xs text-red-500">{fieldErrors.price}</span>}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Product Description</label>
                                <textarea
                                    rows={4}
                                    value={data.product_description}
                                    onChange={(e) => setData('product_description', e.target.value)}
                                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[rgb(240,136,176)] resize-none"
                                    placeholder="Short description shown alongside the product"
                                />
                                {fieldErrors.product_description && <span className="text-xs text-red-500">{fieldErrors.product_description}</span>}
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
                                        : (isUpdateMode ? 'Update Product' : 'Save Product')}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* ACTION BLOCK: HARD DESTRUCTIVE PURGE DELETION DIALOG */}
                {currentAction === 'delete' && selectedProduct && (
                    <div className="border border-red-100 bg-red-50/40 p-6 rounded-xl space-y-4">
                        <div className="flex items-center gap-2.5 text-red-700 font-bold text-base">
                            <span>⚠️</span> <span>Destructive Lifecycle Confirmation</span>
                        </div>
                        <p className="text-xs text-gray-600 leading-relaxed">
                            Are you absolutely certain you wish to purge the catalog record for <span className="font-bold text-gray-800">{selectedProduct.product_name}</span>? This action is immutable and cannot be undone.
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
                                onClick={() => { setCurrentAction('empty'); setSelectedProduct(null); setFormStatus(null); }}
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
