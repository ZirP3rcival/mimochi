<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\Position;
use App\Models\Staff;
use App\Models\UserRole;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class StaffController extends Controller
{
    /**
     * Number of staff records returned when the directory list is
     * unfiltered (or after a search narrows it down).
     */
    private const LIST_LIMIT = 10;

    /**
     * Contact numbers: digits plus the usual + - ( ) and spaces. No letters.
     */
    private const PHONE_PATTERN = '/^[0-9+\-()\s]*$/';

    /**
     * TIN / SSS / PhilHealth numbers: digits plus - and spaces. No letters.
     */
    private const ID_NUMBER_PATTERN = '/^[0-9\-\s]*$/';

    /**
     * Columns safe to expose to the Users directory list / search results.
     * (password and remember_token are never selected.)
     */
    private const LIST_COLUMNS = [
        'staff.id', 'staff.id_no', 'staff.staff_name', 'staff.contact_no',
        'staff.address', 'staff.birthdate', 'staff.tin', 'staff.sss_no',
        'staff.philhealth_no', 'staff.emergency_contact', 'staff.photo_path', 'staff.username',
        'staff.user_type', 'staff.position_id', 'staff.available', 'staff.can_login', 'staff.active',
        'staff.salary_rate',
    ];

    /**
     * Staff query with the position name and user role name joined in, so
     * the UI can show them without extra lookups.
     */
    private function listQuery()
    {
        return Staff::query()
            ->leftJoin('positions', 'positions.id', '=', 'staff.position_id')
            ->leftJoin('user_roles', 'user_roles.role_key', '=', 'staff.user_type')
            ->select(array_merge(self::LIST_COLUMNS, [
                'positions.position_name',
                'user_roles.role_name',
            ]));
    }

    /**
     * One staff record in the same shape as the directory list.
     */
    private function present(Staff $staff)
    {
        return $this->listQuery()->where('staff.id', $staff->id)->first();
    }

    /**
     * List staff accounts for the Users directory panel.
     *
     * GET /staff
     * GET /staff?search=term
     *
     * At most LIST_LIMIT records, alphabetical by name. A search matches
     * name, ID no or username.
     */
    public function index(Request $request)
    {
        $search = trim((string) $request->query('search', ''));

        $query = $this->listQuery();

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('staff.staff_name', 'like', "%{$search}%")
                  ->orWhere('staff.username', 'like', "%{$search}%")
                  ->orWhere('staff.id_no', 'like', "%{$search}%");
            });
        }

        $staff = $query
            ->orderBy('staff.staff_name')
            ->limit(self::LIST_LIMIT)
            ->get();

        return response()->json([
            'staff' => $staff,
        ]);
    }

    /**
     * Validation rules shared by store() and update().
     */
    private function rules(?Staff $staff = null): array
    {
        // Credentials are only required for records that can log in. An
        // existing account that already has a password keeps it when the
        // password box is left blank.
        $canLogin    = request()->boolean('can_login', true);
        $hasPassword = $staff && !empty($staff->getRawOriginal('password'));

        return [
            'id_no'             => ['required', 'string', 'max:50', Rule::unique('staff', 'id_no')->ignore($staff?->id)],
            'staff_name'        => 'required|string|max:255',
            'contact_no'        => ['nullable', 'string', 'max:50', 'regex:' . self::PHONE_PATTERN],
            'address'           => 'nullable|string|max:1000',
            'birthdate'         => 'nullable|date|before_or_equal:today',
            'tin'               => ['nullable', 'string', 'max:50', 'regex:' . self::ID_NUMBER_PATTERN],
            'sss_no'            => ['nullable', 'string', 'max:50', 'regex:' . self::ID_NUMBER_PATTERN],
            'philhealth_no'     => ['nullable', 'string', 'max:50', 'regex:' . self::ID_NUMBER_PATTERN],
            'emergency_contact' => 'nullable|string|max:255',
            'photo_path'        => 'nullable|image|max:2048',
            'remove_photo'      => 'sometimes|boolean',
            'username'          => [$canLogin ? 'required' : 'nullable', 'string', 'max:255', Rule::unique('staff', 'username')->ignore($staff?->id)],
            'password'          => [($canLogin && !$hasPassword) ? 'required' : 'nullable', 'string', 'min:6', 'confirmed'],
            'user_type'         => ['required', 'string', $this->activeRoleRule($staff?->user_type)],
            'position_id'       => ['nullable', 'integer', $this->activePositionRule($staff?->position_id)],
            'available'         => 'sometimes|boolean',
            'can_login'         => 'sometimes|boolean',
            'salary_rate'       => 'nullable|numeric|min:0|max:99999999.99',
        ];
    }

    /**
     * Friendly messages for the number fields.
     */
    private function messages(): array
    {
        return [
            'contact_no.regex'     => 'Contact No may only contain numbers (and + - ( ) or spaces), no letters.',
            'tin.regex'            => 'TIN may only contain numbers (and - or spaces), no letters.',
            'sss_no.regex'         => 'SSS No may only contain numbers (and - or spaces), no letters.',
            'philhealth_no.regex'  => 'PhilHealth No may only contain numbers (and - or spaces), no letters.',
            'salary_rate.numeric'  => 'Salary rate must be a number.',
            'salary_rate.min'      => 'Salary rate cannot be negative.',
        ];
    }

    /**
     * user_type must be an Active role from user_roles. An account that
     * already holds a role keeps it on edit even if that role has since
     * been set Inactive (so saving other fields doesn't fail).
     */
    private function activeRoleRule(?string $current)
    {
        return function (string $attribute, $value, $fail) use ($current) {
            if ($current !== null && strtolower((string) $value) === strtolower($current)) {
                return;
            }

            $ok = UserRole::where('role_key', $value)->where('status', 'Active')->exists();

            if (!$ok) {
                $fail('Select an active user role.');
            }
        };
    }

    /**
     * position_id must be an Active position. Same carve-out as above for
     * the position the account already holds.
     */
    private function activePositionRule($current)
    {
        return function (string $attribute, $value, $fail) use ($current) {
            if ($value === null || $value === '') {
                return;
            }

            if ($current !== null && (int) $value === (int) $current) {
                return;
            }

            if (!Position::where('id', $value)->where('status', 'Active')->exists()) {
                $fail('Select an active position.');
            }
        };
    }

    /**
     * Turn the uploaded picture (or a "remove picture" request) into the
     * photo_path value to save, deleting the old file when it is replaced
     * or removed. When neither happens, photo_path is left out so the
     * current picture is kept.
     */
    private function applyPhoto(Request $request, array $validated, ?Staff $staff = null): array
    {
        unset($validated['remove_photo'], $validated['photo_path']);

        if ($request->hasFile('photo_path')) {
            $file     = $request->file('photo_path');
            $slug     = Str::slug($validated['staff_name'] ?? 'staff', '_') ?: 'staff';
            $filename = $slug . '.' . uniqid() . '.' . $file->extension();

            $file->storeAs('staff', $filename, 'public');

            // Replaced pictures don't pile up on disk
            if ($staff && $staff->photo_path) {
                Storage::disk('public')->delete($staff->photo_path);
            }

            $validated['photo_path'] = 'staff/' . $filename;
        } elseif ($staff && $request->boolean('remove_photo')) {
            if ($staff->photo_path) {
                Storage::disk('public')->delete($staff->photo_path);
            }

            $validated['photo_path'] = null;
        }

        return $validated;
    }

    /**
     * Register a new staff account.
     */
    public function store(Request $request)
    {
        $validated = $request->validate($this->rules(), $this->messages());
        $validated = $this->applyPhoto($request, $validated);

        // salary_rate is written explicitly (not mass-assigned) so it is saved
        // even if the Staff model's $fillable list doesn't include it.
        $salaryRate = (float) ($validated['salary_rate'] ?? 0);
        unset($validated['salary_rate']);

        // 'active' isn't on the registration form on purpose: new accounts
        // start enabled (the migration's default) and are flipped on/off
        // afterwards from the directory list's toggle icon, not this form.
        //
        // The plaintext password never touches the database directly:
        // Staff::setPasswordAttribute() hashes it on assignment below.
        $staffMember = Staff::create($validated);
        $staffMember->forceFill(['salary_rate' => $salaryRate])->save();

        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Staff account saved successfully.',
                'staff'   => $this->present($staffMember),
            ], 201);
        }

        return redirect()->back()->with('success', 'Staff account saved successfully.');
    }

    /**
     * Update an existing staff account.
     *
     * A picture upload needs a multipart body, which a browser can't send
     * with a real PUT, so the form POSTs here with a `_method=PUT` field.
     *
     * Password is optional here — leave it blank on the form to keep the
     * account's current password.
     */
    public function update(Request $request, Staff $staff)
    {
        $validated = $request->validate($this->rules($staff), $this->messages());

        // Don't let an admin switch off sign-in for the account they're
        // currently using (same idea as the disable / delete guards).
        if (array_key_exists('can_login', $validated)
            && !$validated['can_login']
            && $staff->id === Auth::guard('staff')->id()) {
            $message = 'You cannot turn off system login for your own account while logged in.';

            if ($request->wantsJson()) {
                return response()->json([
                    'message' => $message,
                    'errors'  => ['can_login' => [$message]],
                ], 422);
            }

            return redirect()->back()->withErrors(['can_login' => $message]);
        }

        $validated = $this->applyPhoto($request, $validated, $staff);

        // Only touch the salary rate when the form sent it (see store()).
        $salaryRate = null;
        $hasSalary = array_key_exists('salary_rate', $validated);
        if ($hasSalary) {
            $salaryRate = (float) ($validated['salary_rate'] ?? 0);
            unset($validated['salary_rate']);
        }

        // Don't overwrite the stored hash with an empty value just because
        // the admin left the password field blank while editing.
        if (empty($validated['password'])) {
            unset($validated['password']);
        }

        $staff->update($validated);

        if ($hasSalary) {
            $staff->forceFill(['salary_rate' => $salaryRate])->save();
        }

        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Staff account updated successfully.',
                'staff'   => $this->present($staff),
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
                'staff'   => $this->present($staff),
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

        if ($staff->photo_path) {
            Storage::disk('public')->delete($staff->photo_path);
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
