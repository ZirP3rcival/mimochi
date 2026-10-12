<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\UserRole;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class UserRoleController extends Controller
{
    private const PER_PAGE = 10;

    /**
     * GET /user-roles?search=term&page=1  (JSON, 10 per page)
     * GET /user-roles?all=1               (Active roles for the Staff form dropdown)
     */
    public function index(Request $request)
    {
        if ($request->boolean('all')) {
            return response()->json([
                'roles' => UserRole::where('status', 'Active')
                    ->orderByDesc('is_system')
                    ->orderBy('role_name')
                    ->get(['role_key', 'role_name']),
            ]);
        }

        $search = trim((string) $request->query('search', ''));

        $query = UserRole::query();

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('role_name', 'like', "%{$search}%")
                  ->orWhere('role_key', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%");
            });
        }

        $paginator = $query
            ->orderByDesc('is_system')
            ->orderBy('role_name')
            ->paginate(self::PER_PAGE)
            ->withQueryString();

        // Staff accounts per role (staff.user_type == role_key), one query
        $keys = collect($paginator->items())->pluck('role_key')->map('strtolower')->all();
        $counts = empty($keys)
            ? collect()
            : DB::table('staff')
                ->select(DB::raw('LOWER(user_type) as k'), DB::raw('COUNT(*) as total'))
                ->whereIn(DB::raw('LOWER(user_type)'), $keys)
                ->groupBy(DB::raw('LOWER(user_type)'))
                ->pluck('total', 'k');

        $roles = collect($paginator->items())->map(function ($role) use ($counts) {
            $role->users_count = (int) ($counts[strtolower($role->role_key)] ?? 0);
            return $role;
        })->values();

        return response()->json([
            'roles' => $roles,
            'meta'  => [
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'per_page'     => $paginator->perPage(),
                'total'        => $paginator->total(),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'role_name'   => 'required|string|max:255',
            'description' => 'nullable|string|max:255',
            'status'      => 'required|in:Active,Inactive',
            'modules'     => 'nullable|array',
            'modules.*'   => ['string', Rule::in(UserRole::ALL_MODULES)],
        ]);

        // The key is what staff.user_type stores; generate it once from the name
        $key = Str::slug($validated['role_name'], '_');
        if ($key === '' || UserRole::where('role_key', $key)->exists()) {
            return response()->json([
                'message' => 'A role with this name already exists.',
                'errors'  => ['role_name' => ['A role with this name already exists.']],
            ], 422);
        }

        $role = UserRole::create($validated + ['role_key' => $key, 'is_system' => false]);
        $role->users_count = 0;

        return response()->json([
            'message' => 'Role saved successfully.',
            'role'    => $role,
        ], 201);
    }

    public function update(Request $request, UserRole $userRole)
    {
        $validated = $request->validate([
            'role_name'   => 'required|string|max:255',
            'description' => 'nullable|string|max:255',
            'status'      => 'required|in:Active,Inactive',
            'modules'     => 'nullable|array',
            'modules.*'   => ['string', Rule::in(UserRole::ALL_MODULES)],
        ]);

        // Admin can never be switched off or lose a module (lockout guard)
        if ($userRole->role_key === 'admin') {
            $validated['status']  = 'Active';
            $validated['modules'] = UserRole::ALL_MODULES;
        }

        // role_key is intentionally not updatable: staff.user_type points at it
        $userRole->update($validated);

        $userRole = $userRole->fresh();
        $userRole->users_count = $this->usersCount($userRole);

        return response()->json([
            'message' => 'Role updated successfully.',
            'role'    => $userRole,
        ]);
    }

    /**
     * Removable only if it's not a system role and no staff account holds it.
     */
    public function destroy(UserRole $userRole)
    {
        if ($userRole->is_system) {
            return response()->json(['message' => 'System roles cannot be deleted.'], 403);
        }

        $assigned = $this->usersCount($userRole);
        if ($assigned > 0) {
            return response()->json([
                'message' => "This role is assigned to {$assigned} user" . ($assigned === 1 ? '' : 's')
                    . " and can't be deleted. Reassign those users first.",
            ], 409);
        }

        $userRole->delete();

        return response()->json(['message' => 'Role deleted successfully.']);
    }

    private function usersCount(UserRole $role): int
    {
        return DB::table('staff')
            ->whereRaw('LOWER(user_type) = ?', [strtolower($role->role_key)])
            ->count();
    }
}
