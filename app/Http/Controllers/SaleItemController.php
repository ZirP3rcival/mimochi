<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\SaleItem;
use Illuminate\Http\Request;

class SaleItemController extends Controller
{
    /**
     * Number of sale item records shown per page of the catalog list.
     */
    private const PER_PAGE = 10;

    /**
     * Columns safe to expose to the sale item catalog list / search results.
     */
    private const LIST_COLUMNS = [
        'id', 'category', 'itemname', 'info',
        'price1', 'price2', 'commission', 'status',
    ];

    /**
     * List sale items for the catalog panel, paginated.
     *
     * GET /sale-items
     * GET /sale-items?search=term
     * GET /sale-items?page=2
     * GET /sale-items?active_only=1   (scheduling flow: hide inactive items —
     *                                   not paginated, callers want the
     *                                   full active set to pick from)
     *
     * Returns PER_PAGE (10) records per page. With no `search` query string
     * it paginates the full catalog; with one, it paginates the matches for
     * that term. The ?active_only=1 scheduling flow is left unpaginated,
     * since the item picker needs the complete active list to search
     * against, not a single page of it.
     */
    public function index(Request $request)
    {
        $search = trim((string) $request->query('search', ''));
        $activeOnly = $request->boolean('active_only');

        $query = SaleItem::query();

        if ($activeOnly) {
            $query->active();
        }

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('category', 'like', "%{$search}%")
                  ->orWhere('itemname', 'like', "%{$search}%");
            });
        }

        $query->orderBy('category')->orderBy('itemname');

        if ($activeOnly) {
            return response()->json([
                'saleItems' => $query->get(self::LIST_COLUMNS),
            ]);
        }

        $paginator = $query->paginate(self::PER_PAGE, self::LIST_COLUMNS)->withQueryString();

        return response()->json([
            'saleItems' => $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'per_page'     => $paginator->perPage(),
                'total'        => $paginator->total(),
            ],
        ]);
    }

    /**
     * Store a newly created sale item in storage.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'category'    => 'required|string|max:255',
            'itemname'    => 'required|string|max:255',
            'info'        => 'nullable|string',
            'price1'      => 'required|numeric|min:0',
            'price2'      => 'nullable|numeric|min:0',
            'commission'  => 'nullable|numeric|min:0',
            'status'      => 'nullable|in:active,inactive',
        ]);

        $validated['status'] = $validated['status'] ?? 'active';

        $saleItem = SaleItem::create($validated);

        // AJAX / fetch callers (Accept: application/json) get a JSON body
        // so the front-end can show a success banner and clear the form
        // without a full page reload. Validation failures above already
        // return a 422 JSON body automatically via Laravel's default
        // exception handling when the request wants JSON.
        if ($request->wantsJson()) {
            return response()->json([
                'message'   => 'Sale item saved successfully.',
                'saleItem'  => $saleItem,
            ], 201);
        }

        return redirect()->back()->with('success', 'Sale item saved successfully.');
    }

    /**
     * Update an existing sale item.
     */
    public function update(Request $request, SaleItem $saleItem)
    {
        $validated = $request->validate([
            'category'    => 'required|string|max:255',
            'itemname'    => 'required|string|max:255',
            'info'        => 'nullable|string',
            'price1'      => 'required|numeric|min:0',
            'price2'      => 'nullable|numeric|min:0',
            'commission'  => 'nullable|numeric|min:0',
            'status'      => 'nullable|in:active,inactive',
        ]);

        $saleItem->update($validated);

        if ($request->wantsJson()) {
            return response()->json([
                'message'   => 'Sale item updated successfully.',
                'saleItem'  => $saleItem->fresh(),
            ]);
        }

        return redirect()->back()->with('success', 'Sale item updated successfully.');
    }

    /**
     * Flip a sale item between active and inactive. Inactive items are
     * hidden from the scheduling catalog (?active_only=1) but stay fully
     * visible and editable in the regular catalog management list.
     */
    public function toggleStatus(Request $request, SaleItem $saleItem)
    {
        $saleItem->update([
            'status' => $saleItem->status === 'active' ? 'inactive' : 'active',
        ]);

        if ($request->wantsJson()) {
            return response()->json([
                'message'  => 'Sale item status updated successfully.',
                'saleItem' => $saleItem->fresh(),
            ]);
        }

        return redirect()->back()->with('success', 'Sale item status updated successfully.');
    }

    /**
     * Remove a sale item.
     */
    public function destroy(Request $request, SaleItem $saleItem)
    {
        $saleItem->delete();

        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Sale item deleted successfully.',
            ]);
        }

        return redirect()->back()->with('success', 'Sale item deleted successfully.');
    }
}
