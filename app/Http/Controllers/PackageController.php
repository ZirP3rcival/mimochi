<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\Package;
use Illuminate\Http\Request;

class PackageController extends Controller
{
    /**
     * Number of package records shown per page of the catalog list.
     */
    private const PER_PAGE = 10;

    /**
     * Columns safe to expose for each sale item nested inside a package.
     */
    private const ITEM_COLUMNS = 'id,category,itemname,price1,price2';

    /**
     * List packages for the catalog panel, paginated.
     *
     * GET /packages
     * GET /packages?search=term
     * GET /packages?page=2
     * GET /packages?active_only=1   (scheduling flow: hide inactive
     *                                 packages — not paginated, callers
     *                                 want the full active set to pick
     *                                 from)
     *
     * Returns PER_PAGE (10) records per page, each with its selected sale
     * items eager-loaded. With no `search` query string it paginates the
     * full catalog; with one, it paginates the matches for that term.
     */
    public function index(Request $request)
    {
        $search = trim((string) $request->query('search', ''));
        $activeOnly = $request->boolean('active_only');

        $query = Package::query()->with('items:' . self::ITEM_COLUMNS);

        if ($activeOnly) {
            $query->active();
        }

        if ($search !== '') {
            $query->where('package_name', 'like', "%{$search}%");
        }

        $query->orderBy('package_name');

        if ($activeOnly) {
            return response()->json([
                'packages' => $query->get(),
            ]);
        }

        $paginator = $query->paginate(self::PER_PAGE)->withQueryString();

        return response()->json([
            'packages' => $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'per_page'     => $paginator->perPage(),
                'total'        => $paginator->total(),
            ],
        ]);
    }

    /**
     * Store a newly created package, together with the sale items it holds.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'package_name'        => 'required|string|max:255',
            'package_price'       => 'required|numeric|min:0',
            'package_description' => 'nullable|string',
            'session_count'       => 'nullable|integer|min:1|max:50',
            'item_ids'            => 'nullable|array',
            'item_ids.*'          => 'integer|distinct|exists:sale_items,id',
            'status'              => 'nullable|in:active,inactive',
        ]);

        $package = Package::create([
            'package_name'        => $validated['package_name'],
            'package_price'       => $validated['package_price'],
            'package_description' => $validated['package_description'] ?? null,
            'session_count'       => $validated['session_count'] ?? 1,
            'status'               => $validated['status'] ?? 'active',
        ]);

        $package->items()->sync($validated['item_ids'] ?? []);
        $package->load('items:' . self::ITEM_COLUMNS);

        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Package saved successfully.',
                'package' => $package,
            ], 201);
        }

        return redirect()->back()->with('success', 'Package saved successfully.');
    }

    /**
     * Update an existing package and replace its selected sale items.
     */
    public function update(Request $request, Package $package)
    {
        $validated = $request->validate([
            'package_name'        => 'required|string|max:255',
            'package_price'       => 'required|numeric|min:0',
            'package_description' => 'nullable|string',
            'session_count'       => 'nullable|integer|min:1|max:50',
            'item_ids'            => 'nullable|array',
            'item_ids.*'          => 'integer|distinct|exists:sale_items,id',
            'status'              => 'nullable|in:active,inactive',
        ]);

        $package->update([
            'package_name'        => $validated['package_name'],
            'package_price'       => $validated['package_price'],
            'package_description' => $validated['package_description'] ?? $package->package_description,
            'session_count'       => $validated['session_count'] ?? $package->session_count,
            'status'               => $validated['status'] ?? $package->status,
        ]);

        $package->items()->sync($validated['item_ids'] ?? []);
        $package->load('items:' . self::ITEM_COLUMNS);

        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Package updated successfully.',
                'package' => $package->fresh('items:' . self::ITEM_COLUMNS),
            ]);
        }

        return redirect()->back()->with('success', 'Package updated successfully.');
    }

    /**
     * Flip a package between active and inactive. Inactive packages are
     * hidden from the scheduling catalog (?active_only=1) but stay fully
     * visible and editable in the regular catalog management list.
     */
    public function toggleStatus(Request $request, Package $package)
    {
        $package->update([
            'status' => $package->status === 'active' ? 'inactive' : 'active',
        ]);

        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Package status updated successfully.',
                'package' => $package->fresh(),
            ]);
        }

        return redirect()->back()->with('success', 'Package status updated successfully.');
    }

    /**
     * Remove a package. The package_items pivot rows cascade-delete with it.
     */
    public function destroy(Request $request, Package $package)
    {
        $package->delete();

        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Package deleted successfully.',
            ]);
        }

        return redirect()->back()->with('success', 'Package deleted successfully.');
    }
}
