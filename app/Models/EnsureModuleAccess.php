<?php

namespace App\Http\Middleware;

use App\Models\UserRole;
use Closure;
use Illuminate\Http\Request;

/**
 * Usage: ->middleware('module:clients')
 * Blocks the request unless the logged-in staff member's user role has been
 * granted that dashboard module (admins always pass).
 */
class EnsureModuleAccess
{
    public function handle(Request $request, Closure $next, string $module)
    {
        $staff = $request->user('staff');

        if (!$staff || !in_array($module, UserRole::modulesFor($staff), true)) {
            if ($request->expectsJson()) {
                return response()->json(['message' => 'Your role does not have access to this module.'], 403);
            }
            abort(403, 'Your role does not have access to this module.');
        }

        return $next($request);
    }
}
