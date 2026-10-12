<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A user role is the access level stored on staff.user_type (matched by
 * role_key). It decides whether an account may log in and which dashboard
 * modules it can open. Job titles live separately in Position.
 */
class UserRole extends Model
{
    // Must match MODULES in dashboard-admin.jsx / moduleAccess.js
    public const ALL_MODULES = [
        'dashboard', 'clients', 'scheduling', 'sales', 'inventory',
        'vouchers', 'expenses', 'reports', 'payroll', 'users', 'settings',
    ];

    protected $fillable = [
        'role_key',
        'role_name',
        'description',
        'status',
        'modules',
        'is_system',
    ];

    protected $casts = [
        'modules'   => 'array',
        'is_system' => 'boolean',
    ];

    private static function isAdmin($staff): bool
    {
        return $staff && strtolower((string) $staff->user_type) === 'admin';
    }

    /**
     * Staff records flagged "cannot log in" never get access, even admins.
     * A missing / null value (column not migrated yet) counts as allowed.
     */
    private static function loginEnabled($staff): bool
    {
        return $staff && ($staff->can_login ?? true);
    }

    public static function forStaff($staff): ?self
    {
        if (!$staff) {
            return null;
        }

        return static::whereRaw('LOWER(role_key) = ?', [strtolower((string) $staff->user_type)])->first();
    }

    /**
     * Login verification: the account's role must exist and be Active.
     * Admins are always allowed so a bad edit can never lock everyone out.
     */
    public static function allowsLogin($staff): bool
    {
        if (!self::loginEnabled($staff)) {
            return false;
        }

        if (self::isAdmin($staff)) {
            return true;
        }

        $role = self::forStaff($staff);

        return $role !== null && $role->status === 'Active';
    }

    /**
     * Module ids this account may open. Admins always get every module.
     */
    public static function modulesFor($staff): array
    {
        if (!self::loginEnabled($staff)) {
            return [];
        }

        if (self::isAdmin($staff)) {
            return self::ALL_MODULES;
        }

        $role = self::forStaff($staff);

        if (!$role || $role->status !== 'Active') {
            return [];
        }

        return array_values(array_intersect(self::ALL_MODULES, $role->modules ?? []));
    }
}
