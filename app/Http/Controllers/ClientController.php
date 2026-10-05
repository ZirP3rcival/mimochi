<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\Client;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class ClientController extends Controller
{
    /**
     * Number of client records shown per page of the directory list.
     */
    private const PER_PAGE = 10;

    /**
     * Columns safe to expose to the client directory list / search results.
     */
    private const LIST_COLUMNS = [
        'id', 'first_name', 'last_name', 'middle_initial', 'gender',
        'date_of_birth', 'age', 'phone', 'facebook_account', 'address',
        'photo_path', 'status',
    ];

    /**
     * List clients for the directory panel, paginated.
     *
     * GET /clients
     * GET /clients?search=term
     * GET /clients?page=2
     * GET /clients?search=term&page=2
     *
     * Returns PER_PAGE (10) records per page. With no `search` query
     * string it paginates the full directory; with one, it paginates the
     * matches for that term.
     */
    public function index(Request $request)
    {
        $search = trim((string) $request->query('search', ''));

        $query = Client::query();

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                  ->orWhere('last_name', 'like', "%{$search}%")
                  ->orWhere('middle_initial', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%")
                  ->orWhereRaw("CONCAT(first_name, ' ', last_name) LIKE ?", ["%{$search}%"])
                  ->orWhereRaw("CONCAT(last_name, ' ', first_name) LIKE ?", ["%{$search}%"]);
            });
        }

        $paginator = $query
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->paginate(self::PER_PAGE, self::LIST_COLUMNS)
            ->withQueryString();

        return response()->json([
            'clients' => $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'per_page'     => $paginator->perPage(),
                'total'        => $paginator->total(),
            ],
        ]);
    }

    /**
     * Store a newly created client in storage.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'first_name'       => 'required|string|max:255',
            'last_name'        => 'required|string|max:255',
            'middle_initial'   => 'nullable|string|max:255',
            'gender'           => 'required|in:M,F',
            'date_of_birth'    => 'nullable|date',
            'age'              => 'required|integer',
            'phone'            => 'nullable|string|max:50',
            'facebook_account' => 'nullable|string|max:255',
            'address'          => 'nullable|string',
            'photo_path'       => 'nullable|image|max:2048',
            'status'           => 'required|string|max:50',
        ]);

        if ($request->hasFile('photo_path')) {
            $file = $request->file('photo_path');

            // Get original extension securely
            $extension = $file->getClientOriginalExtension();

            // Clean up last name spacing to create a clean filesystem name string
            $sluggedLastName = strtolower(str_replace(' ', '_', $validated['last_name']));

            // Unique token so two clients that share a last name (and no
            // birthday on file, previously "no-birthday" for both) never
            // collide and silently overwrite each other's photo on disk.
            $uniqueToken = uniqid();

            // Rename structural syntax: lastname.uniquetoken.extension
            $filename = "{$sluggedLastName}.{$uniqueToken}.{$extension}";

            // Store raw file directly without image optimization packages
            $file->storeAs('clients', $filename, 'public');

            // Map the public relative path string into the array to fix the database persistence crash
            $validated['photo_path'] = 'clients/' . $filename;
        }

        // Persists data safely to MySQL
        $client = Client::create($validated);

        // AJAX / fetch callers (Accept: application/json) get a JSON body
        // so the front-end can show a success banner and clear the form
        // without a full page reload. Validation failures above already
        // return a 422 JSON body automatically via Laravel's default
        // exception handling when the request wants JSON.
        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Client saved successfully.',
                'client'  => $client,
            ], 201);
        }

        return redirect()->back()->with('success', 'Client saved successfully.');
    }

    /**
     * Update an existing client.
     *
     * Note: a browser/fetch can't send a real multipart PUT body, so a photo
     * upload on this endpoint requires Laravel's method-spoofing convention:
     * POST the FormData to this URL with a `_method=PUT` field included.
     */
    public function update(Request $request, Client $client)
    {
        $validated = $request->validate([
            'first_name'       => 'required|string|max:255',
            'last_name'        => 'required|string|max:255',
            'middle_initial'   => 'nullable|string|max:255',
            'gender'           => 'required|in:M,F',
            'date_of_birth'    => 'nullable|date',
            'age'              => 'required|integer',
            'phone'            => 'nullable|string|max:50',
            'facebook_account' => 'nullable|string|max:255',
            'address'          => 'nullable|string',
            'photo_path'       => 'nullable|image|max:2048',
            'status'           => 'required|string|max:50',
        ]);

        if ($request->hasFile('photo_path')) {
            $file = $request->file('photo_path');
            $extension = $file->getClientOriginalExtension();
            $sluggedLastName = strtolower(str_replace(' ', '_', $validated['last_name']));
            $uniqueToken = uniqid();
            $filename = "{$sluggedLastName}.{$uniqueToken}.{$extension}";

            $file->storeAs('clients', $filename, 'public');

            // Clean up the old file on disk so replaced photos don't pile up
            if ($client->photo_path) {
                Storage::disk('public')->delete($client->photo_path);
            }

            $validated['photo_path'] = 'clients/' . $filename;
        }

        $client->update($validated);

        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Client updated successfully.',
                'client'  => $client->fresh(),
            ]);
        }

        return redirect()->back()->with('success', 'Client updated successfully.');
    }

    /**
     * Flip a client's status between Active and Archived.
     *
     * PATCH /clients/{client}/toggle-status
     */
    public function toggleStatus(Request $request, Client $client)
    {
        $client->status = $client->status === 'Active' ? 'Archived' : 'Active';
        $client->save();

        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Client status updated successfully.',
                'client'  => $client->fresh(),
            ]);
        }

        return redirect()->back()->with('success', 'Client status updated successfully.');
    }

    /**
     * Remove a client and its stored photo, if any.
     */
    public function destroy(Request $request, Client $client)
    {
        if ($client->photo_path) {
            Storage::disk('public')->delete($client->photo_path);
        }

        $client->delete();

        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Client deleted successfully.',
            ]);
        }

        return redirect()->back()->with('success', 'Client deleted successfully.');
    }
}
