<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\Bundle;
use Illuminate\Http\Request;

class BundleController extends Controller
{
    /**
     * Number of bundle records shown per page of the catalog list.
     */
    private const PER_PAGE = 10;

    /**
     * Columns safe to expose for each sale item nested inside a bundle.
     */
    private const ITEM_COLUMNS = 'id,category,itemname,price1,price2';

    /**
     * List bundles for the catalog panel, paginated.
     *
     * GET /bundles
     * GET /bundles?search=term
     * GET /bundles?page=2
     * GET /bundles?active_only=1   (scheduling flow: hide inactive bundles —
     *                                not paginated, callers want the full
     *                                active set to pick from)
     *
     * Returns PER_PAGE (10) records per page, each with its selected sale
     * items eager-loaded. With no `search` query string it paginates the
     * full catalog; with one, it paginates the matches for that term.
     */
    public function index(Request $request)
    {
        $search = trim((string) $request->query('search', ''));
        $activeOnly = $request->boolean('active_only');

        $query = Bundle::query()->with('items:' . self::ITEM_COLUMNS);

        if ($activeOnly) {
            $query->active();
        }

        if ($search !== '') {
            $query->where('bundle_name', 'like', "%{$search}%");
        }

        $query->orderBy('bundle_name');

        if ($activeOnly) {
            return response()->json([
                'bundles' => $query->get(),
            ]);
        }

        $paginator = $query->paginate(self::PER_PAGE)->withQueryString();

        return response()->json([
            'bundles' => $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'per_page'     => $paginator->perPage(),
                'total'        => $paginator->total(),
            ],
        ]);
    }

    /**
     * Store a newly created bundle, together with the sale items it holds.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'bundle_name'  => 'required|string|max:255',
            'bundle_price' => 'required|numeric|min:0',
            'item_ids'     => 'required|array|min:1',
            'item_ids.*'   => 'integer|distinct|exists:sale_items,id',
            'status'       => 'nullable|in:active,inactive',
        ]);

        $bundle = Bundle::create([
            'bundle_name'  => $validated['bundle_name'],
            'bundle_price' => $validated['bundle_price'],
            'status'       => $validated['status'] ?? 'active',
        ]);

        $bundle->items()->sync($validated['item_ids']);
        $bundle->load('items:' . self::ITEM_COLUMNS);

        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Bundle saved successfully.',
                'bundle'  => $bundle,
            ], 201);
        }

        return redirect()->back()->with('success', 'Bundle saved successfully.');
    }

    /**
     * Update an existing bundle and replace its selected sale items.
     */
    public function update(Request $request, Bundle $bundle)
    {
        $validated = $request->validate([
            'bundle_name'  => 'required|string|max:255',
            'bundle_price' => 'required|numeric|min:0',
            'item_ids'     => 'required|array|min:1',
            'item_ids.*'   => 'integer|distinct|exists:sale_items,id',
            'status'       => 'nullable|in:active,inactive',
        ]);

        $bundle->update([
            'bundle_name'  => $validated['bundle_name'],
            'bundle_price' => $validated['bundle_price'],
            'status'       => $validated['status'] ?? $bundle->status,
        ]);

        $bundle->items()->sync($validated['item_ids']);
        $bundle->load('items:' . self::ITEM_COLUMNS);

        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Bundle updated successfully.',
                'bundle'  => $bundle->fresh('items:' . self::ITEM_COLUMNS),
            ]);
        }

        return redirect()->back()->with('success', 'Bundle updated successfully.');
    }

    /**
     * Flip a bundle between active and inactive. Inactive bundles are
     * hidden from the scheduling catalog (?active_only=1) but stay fully
     * visible and editable in the regular catalog management list.
     */
    public function toggleStatus(Request $request, Bundle $bundle)
    {
        $bundle->update([
            'status' => $bundle->status === 'active' ? 'inactive' : 'active',
        ]);

        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Bundle status updated successfully.',
                'bundle'  => $bundle->fresh(),
            ]);
        }

        return redirect()->back()->with('success', 'Bundle status updated successfully.');
    }

    /**
     * Remove a bundle. The bundle_items pivot rows cascade-delete with it.
     */
    public function destroy(Request $request, Bundle $bundle)
    {
        $bundle->delete();

        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Bundle deleted successfully.',
            ]);
        }

        return redirect()->back()->with('success', 'Bundle deleted successfully.');
    }
}
