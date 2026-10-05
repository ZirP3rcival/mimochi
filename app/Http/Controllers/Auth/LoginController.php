<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\Staff;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class LoginController extends Controller
{
    /**
     * Show the login page (React component: resources/js/Pages/Auth/Login.jsx)
     */
    public function create(): Response
    {
        return Inertia::render('Auth/Login');
    }

    /**
     * Validate credentials, verify the account, and forward the user
     * to the correct dashboard based on user_type.
     */
    public function store(Request $request)
    {
        // 1. Validation — required fields, basic shape checks
        $validator = Validator::make($request->all(), [
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
        ], [
            'username.required' => 'Please enter your email/username.',
            'password.required' => 'Please enter your password.',
        ]);

        if ($validator->fails()) {
            throw new ValidationException($validator);
        }

        $credentials = $validator->validated();

        // 2. Verification — look the account up ourselves first so we can
        //    give clear, specific feedback (unknown user vs disabled vs bad password)
        $staff = Staff::where('username', $credentials['username'])->first();

        if (! $staff || ! Hash::check($credentials['password'], $staff->password)) {
            throw ValidationException::withMessages([
                'username' => 'These credentials do not match our records.',
            ]);
        }

        if (! $staff->active) {
            throw ValidationException::withMessages([
                'username' => 'This account has been disabled. Contact an administrator.',
            ]);
        }

        // 3. Log the verified account in via the "staff" guard (session-based)
        Auth::guard('staff')->login($staff, false); // false = no "remember me", per spec
        $request->session()->regenerate();

        // 4. Forward based on role
        return $staff->isAdmin()
            ? redirect()->intended(route('dashboard_main'))
            : redirect()->intended(route('dashboard_staff'));
    }

    /**
     * Log the current staff account out.
     */
    public function destroy(Request $request)
    {
        Auth::guard('staff')->logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('login');
    }
}
