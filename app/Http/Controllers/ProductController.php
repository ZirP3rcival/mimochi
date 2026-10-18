<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    /**
     * Number of product records shown per page of the catalog list.
     */
    private const PER_PAGE = 10;

    /**
     * Columns safe to expose to the product catalog list / search results.
     */
    private const LIST_COLUMNS = [
        'id', 'product_name', 'product_description', 'price', 'status',
    ];

    /**
     * List products for the catalog panel, paginated.
     *
     * GET /products
     * GET /products?search=term
     * GET /products?page=2
     * GET /products?active_only=1   (pickers: hide inactive products — not
     *                                 paginated, callers want the full
     *                                 active set to pick from)
     */
    public function index(Request $request)
    {
        $search = trim((string) $request->query('search', ''));
        $activeOnly = $request->boolean('active_only');

        $query = Product::query();

        if ($activeOnly) {
            $query->active();
        }

        if ($search !== '') {
            $query->where('product_name', 'like', "%{$search}%");
        }

        $query->orderBy('product_name');

        if ($activeOnly) {
            return response()->json([
                'products' => $query->get(self::LIST_COLUMNS),
            ]);
        }

        $paginator = $query->paginate(self::PER_PAGE, self::LIST_COLUMNS)->withQueryString();

        return response()->json([
            'products' => $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'per_page'     => $paginator->perPage(),
                'total'        => $paginator->total(),
            ],
        ]);
    }

    /**
     * Store a newly created product.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'product_name'        => 'required|string|max:255',
            'product_description' => 'nullable|string',
            'price'               => 'required|numeric|min:0|max:99999999.99',
            'status'              => 'nullable|in:active,inactive',
        ]);

        $validated['status'] = $validated['status'] ?? 'active';

        $product = Product::create($validated);

        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Product saved successfully.',
                'product' => $product,
            ], 201);
        }

        return redirect()->back()->with('success', 'Product saved successfully.');
    }

    /**
     * Update an existing product.
     */
    public function update(Request $request, Product $product)
    {
        $validated = $request->validate([
            'product_name'        => 'required|string|max:255',
            'product_description' => 'nullable|string',
            'price'               => 'required|numeric|min:0|max:99999999.99',
            'status'              => 'nullable|in:active,inactive',
        ]);

        $product->update($validated);

        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Product updated successfully.',
                'product' => $product->fresh(),
            ]);
        }

        return redirect()->back()->with('success', 'Product updated successfully.');
    }

    /**
     * Flip a product between active and inactive.
     */
    public function toggleStatus(Request $request, Product $product)
    {
        $product->update([
            'status' => $product->status === 'active' ? 'inactive' : 'active',
        ]);

        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Product status updated successfully.',
                'product' => $product->fresh(),
            ]);
        }

        return redirect()->back()->with('success', 'Product status updated successfully.');
    }

    /**
     * Remove a product.
     */
    public function destroy(Request $request, Product $product)
    {
        $product->delete();

        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Product deleted successfully.',
            ]);
        }

        return redirect()->back()->with('success', 'Product deleted successfully.');
    }
}
