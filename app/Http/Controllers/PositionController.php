<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\Position;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PositionController extends Controller
{
    private const PER_PAGE = 10;

    /**
     * GET /positions?search=term&page=1   (JSON, 10 per page)
     * GET /positions?all=1                (every Active position, unpaginated,
     *                                      for dropdowns such as the Staff form)
     */
    public function index(Request $request)
    {
        if ($request->boolean('all')) {
            return response()->json([
                'positions' => Position::where('status', 'Active')
                    ->orderBy('position_name')
                    ->get(['id', 'position_name']),
            ]);
        }

        $search = trim((string) $request->query('search', ''));

        $query = Position::query();

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('position_name', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%");
            });
        }

        $paginator = $query
            ->orderBy('position_name')
            ->paginate(self::PER_PAGE)
            ->withQueryString();

        // How many staff accounts hold each position on this page, so the
        // UI can show it and disable Delete for positions in use.
        $ids = collect($paginator->items())->pluck('id')->all();
        $counts = empty($ids)
            ? collect()
            : DB::table('staff')
                ->whereIn('position_id', $ids)
                ->select('position_id', DB::raw('COUNT(*) as total'))
                ->groupBy('position_id')
                ->pluck('total', 'position_id');

        $positions = collect($paginator->items())->map(function ($position) use ($counts) {
            $position->users_count = (int) ($counts[$position->id] ?? 0);
            return $position;
        })->values();

        return response()->json([
            'positions' => $positions,
            'meta'      => [
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
            'position_name' => 'required|string|max:255|unique:positions,position_name',
            'description'   => 'nullable|string|max:255',
            'status'        => 'required|in:Active,Inactive',
        ]);

        $position = Position::create($validated);
        $position->users_count = 0;

        return response()->json([
            'message'  => 'Position saved successfully.',
            'position' => $position,
        ], 201);
    }

    public function update(Request $request, Position $position)
    {
        $validated = $request->validate([
            'position_name' => ['required', 'string', 'max:255', Rule::unique('positions', 'position_name')->ignore($position->id)],
            'description'   => 'nullable|string|max:255',
            'status'        => 'required|in:Active,Inactive',
        ]);

        $position->update($validated);

        $position = $position->fresh();
        $position->users_count = $this->usersCount($position);

        return response()->json([
            'message'  => 'Position updated successfully.',
            'position' => $position,
        ]);
    }

    /**
     * A position can only be removed from the database when no staff
     * account holds it.
     */
    public function destroy(Position $position)
    {
        $assigned = $this->usersCount($position);

        if ($assigned > 0) {
            return response()->json([
                'message' => "This position is assigned to {$assigned} user" . ($assigned === 1 ? '' : 's')
                    . " and can't be deleted. Reassign those users first.",
            ], 409);
        }

        $position->delete();

        return response()->json(['message' => 'Position deleted successfully.']);
    }

    private function usersCount(Position $position): int
    {
        return DB::table('staff')->where('position_id', $position->id)->count();
    }
}
