<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\Staff;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;

class StaffController extends Controller
{
    /**
     * Number of staff records returned when the directory list is
     * unfiltered (or after a search narrows it down).
     */
    private const LIST_LIMIT = 10;

    /**
     * Columns safe to expose to the Users directory list / search results.
     * (password and remember_token are already hidden on the model, this
     * is just explicit so nobody has to remember that later.)
     */
    private const LIST_COLUMNS = [
        'id', 'staff_name', 'username', 'user_type', 'active',
    ];

    /**
     * List staff accounts for the Users directory panel.
     *
     * GET /staff
     * GET /staff?search=term
     *
     * Always returns at most LIST_LIMIT records. With no `search` query
     * string it returns the first 10 staff (alphabetical by name); with
     * one, it returns up to 10 accounts whose name or username match it.
     */
    public function index(Request $request)
    {
        $search = trim((string) $request->query('search', ''));

        $query = Staff::query();

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('staff_name', 'like', "%{$search}%")
                  ->orWhere('username', 'like', "%{$search}%");
            });
        }

        $staff = $query
            ->orderBy('staff_name')
            ->limit(self::LIST_LIMIT)
            ->get(self::LIST_COLUMNS);

        return response()->json([
            'staff' => $staff,
        ]);
    }

    /**
     * Register a new staff account.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'staff_name' => 'required|string|max:255',
            'username'   => 'required|string|max:255|unique:staff,username',
            'password'   => 'required|string|min:6|confirmed',
            'user_type'  => ['required', Rule::in(['admin', 'staff'])],
        ]);

        // 'active' isn't on the registration form on purpose: new accounts
        // start enabled (the migration's default) and are flipped on/off
        // afterwards from the directory list's toggle icon, not this form.
        //
        // The plaintext password never touches the database directly:
        // Staff::setPasswordAttribute() hashes it on assignment below.
        $staffMember = Staff::create($validated);

        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Staff account saved successfully.',
                'staff'   => $staffMember,
            ], 201);
        }

        return redirect()->back()->with('success', 'Staff account saved successfully.');
    }

    /**
     * Update an existing staff account.
     *
     * Password is optional here — leave it blank on the form to keep the
     * account's current password.
     */
    public function update(Request $request, Staff $staff)
    {
        $validated = $request->validate([
            'staff_name' => 'required|string|max:255',
            'username'   => ['required', 'string', 'max:255', Rule::unique('staff', 'username')->ignore($staff->id)],
            'password'   => 'nullable|string|min:6|confirmed',
            'user_type'  => ['required', Rule::in(['admin', 'staff'])],
        ]);

        // Don't overwrite the stored hash with an empty value just because
        // the admin left the password field blank while editing.
        if (empty($validated['password'])) {
            unset($validated['password']);
        }

        $staff->update($validated);

        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Staff account updated successfully.',
                'staff'   => $staff->fresh(),
            ]);
        }

        return redirect()->back()->with('success', 'Staff account updated successfully.');
    }

    /**
     * Flip a staff account between enabled (active = 1) and disabled
     * (active = 0). This is the "enable/disable" icon in the directory
     * list — it replaces the old per-row Schedule action.
     *
     * PATCH /staff/{staff}/toggle-status
     */
    public function toggleStatus(Request $request, Staff $staff)
    {
        // Guard against an admin locking themselves out of their own
        // active session by disabling the account they're logged in as.
        if ($staff->id === Auth::guard('staff')->id()) {
            $message = 'You cannot disable your own account while logged in.';

            if ($request->wantsJson()) {
                return response()->json(['message' => $message], 422);
            }

            return redirect()->back()->withErrors(['staff' => $message]);
        }

        $staff->active = ! $staff->active;
        $staff->save();

        $message = $staff->active
            ? 'Staff account enabled.'
            : 'Staff account disabled.';

        if ($request->wantsJson()) {
            return response()->json([
                'message' => $message,
                'staff'   => $staff->fresh(),
            ]);
        }

        return redirect()->back()->with('success', $message);
    }

    /**
     * Remove a staff account.
     */
    public function destroy(Request $request, Staff $staff)
    {
        if ($staff->id === Auth::guard('staff')->id()) {
            $message = 'You cannot delete your own account while logged in.';

            if ($request->wantsJson()) {
                return response()->json(['message' => $message], 422);
            }

            return redirect()->back()->withErrors(['staff' => $message]);
        }

        $staff->delete();

        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Staff account deleted successfully.',
            ]);
        }

        return redirect()->back()->with('success', 'Staff account deleted successfully.');
    }
}
