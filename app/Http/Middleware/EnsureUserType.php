<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserType
{
    /**
     * Usage in routes: ->middleware('user_type:admin')  or  ->middleware('user_type:staff')
     */
    public function handle(Request $request, Closure $next, string $type): Response
    {
        $user = Auth::guard('staff')->user();

        if (! $user || $user->user_type !== $type) {
            abort(403, 'You are not authorized to view this page.');
        }

        return $next($request);
    }
}
