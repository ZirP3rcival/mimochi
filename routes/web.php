<?php

use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\AuthenticatedSessionController;
use App\Http\Controllers\ClientController;
use App\Http\Controllers\DtrController;
use App\Http\Controllers\ClientScheduleController;
use App\Http\Controllers\StaffController;
use App\Http\Controllers\SaleItemController;
use App\Http\Controllers\BundleController;
use App\Http\Controllers\PackageController;
use App\Http\Controllers\PositionController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\UserRoleController;
use App\Models\Client;
use App\Models\UserRole;
use App\Models\DashboardStats;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;


// Root -> login
Route::get('/', function () {
    return redirect()->route('login');
});

// --- Login (guests only) ---
Route::middleware('guest:staff')->group(function () {
    Route::get('/login', [LoginController::class, 'create'])->name('login');
    Route::post('/login', [LoginController::class, 'store']);
});


// --- Daily Time Record kiosk (public: staff punch in/out without logging in) ---
// Timestamps are always taken from the server clock. Throttled to limit abuse.
Route::prefix('dtr')->middleware('throttle:60,1')->group(function () {
    Route::get('/time', [DtrController::class, 'time'])->name('dtr.time');
    Route::get('/staff', [DtrController::class, 'staff'])->name('dtr.staff');
    Route::get('/status', [DtrController::class, 'status'])->name('dtr.status');
    // Opening /dtr/time-in directly (e.g. after a redirect) shows the login + DTR page.
    Route::get('/time-in', function () { return Inertia::render('Auth/Login'); });
    Route::post('/time-in', [DtrController::class, 'timeIn'])->name('dtr.time_in');
    Route::post('/time-out', [DtrController::class, 'timeOut'])->name('dtr.time_out');
});

// --- Logout ---
Route::post('/logout', [AuthenticatedSessionController::class, 'destroy'])
    ->middleware('auth:staff')
    ->name('logout');

// --- Dashboards (auth required, split by role) ---
Route::middleware(['auth:staff', 'user_type:admin'])->group(function () {
    Route::get('/dashboard-main', function () {
        return Inertia::render('Dashboard/dashboard-admin', [
            'staff' => Auth::guard('staff')->user(),
            'allowedModules' => UserRole::modulesFor(Auth::guard('staff')->user()),
            'dashboard' => DashboardStats::overview(),
        ]);
    })->name('dashboard_main');
});

Route::middleware(['auth:staff', 'user_type:staff'])->group(function () {
    Route::get('/dashboard-staff', function () {
        return Inertia::render('Dashboard/dashboard-admin2', [
            'staff' => Auth::guard('staff')->user(),
            'allowedModules' => UserRole::modulesFor(Auth::guard('staff')->user()),
            'dashboard' => DashboardStats::overview(),
        ]);
    })->name('dashboard_staff');
});

// --- Live dashboard counts (polled by the Overview cards; any logged-in staff) ---
Route::middleware('auth:staff')->get('/dashboard/stats', function () {
    return response()->json(DashboardStats::stats())
        ->header('Cache-Control', 'no-store');
})->name('dashboard.stats');

// Current client schedule / appointments (pending + ongoing), paginated.
Route::middleware('auth:staff')->get('/dashboard/schedules', function (\Illuminate\Http\Request $request) {
    return response()->json(DashboardStats::schedules(max(1, (int) $request->query('page', 1))))
        ->header('Cache-Control', 'no-store');
})->name('dashboard.schedules');

// Month view for the trend chart: daily payment totals + daily done schedules.
Route::middleware('auth:staff')->get('/dashboard/trend', function () {
    return response()->json(DashboardStats::trend())
        ->header('Cache-Control', 'no-store');
})->name('dashboard.trend');

// Done client schedule / appointments (done, awaiting payment), paginated.
Route::middleware('auth:staff')->get('/dashboard/done', function (\Illuminate\Http\Request $request) {
    return response()->json(DashboardStats::doneSchedules(max(1, (int) $request->query('page', 1))))
        ->header('Cache-Control', 'no-store');
})->name('dashboard.done');

// Paid report (everything already paid), paginated, with the total amount.
Route::middleware('auth:staff')->get('/dashboard/paid', function (\Illuminate\Http\Request $request) {
    return response()->json(DashboardStats::paidSchedules(max(1, (int) $request->query('page', 1))))
        ->header('Cache-Control', 'no-store');
})->name('dashboard.paid');

// --- Clients (any authenticated staff member, admin or staff role) ---
// Previously unauthenticated: client PII (name, DOB, phone, address, photo)
// was reachable by anyone. Now gated behind the same session guard as the
// dashboards.
Route::middleware(['auth:staff', 'module:clients'])->group(function () {
    Route::get('/clients', [ClientController::class, 'index'])->name('clients.index');
    Route::post('/clients', [ClientController::class, 'store'])->name('clients.store');
    // One client as JSON (the dashboard opens a client's service record from a schedule row).
    Route::get('/clients/{client}', fn (Client $client) => response()->json($client))
        ->whereNumber('client')->name('clients.show');
    Route::put('/clients/{client}', [ClientController::class, 'update'])->name('clients.update');
    Route::patch('/clients/{client}/toggle-status', [ClientController::class, 'toggleStatus'])->name('clients.toggle_status');
    Route::delete('/clients/{client}', [ClientController::class, 'destroy'])->name('clients.destroy');

    // Service scheduling. Booking picks items / bundles / packages; date,
    // time and staff are assigned later, one row at a time.
    Route::get('/clients/{client}/schedules', [ClientScheduleController::class, 'index'])->name('clients.schedules.index');
    Route::post('/clients/{client}/schedules', [ClientScheduleController::class, 'store'])->name('clients.schedules.store');
    Route::delete('/clients/{client}/schedules/{type}/{id}', [ClientScheduleController::class, 'destroy'])
        ->whereIn('type', ['item', 'bundle', 'package', 'product'])->whereNumber('id')->name('clients.schedules.destroy');

    Route::get('/schedule-staff', [ClientScheduleController::class, 'staffOptions'])->name('schedules.staff');
    Route::patch('/clients/{client}/schedule-items/{itemSchedule}', [ClientScheduleController::class, 'updateItem'])->name('clients.schedule_items.update');
    Route::patch('/clients/{client}/schedule-products/{productSchedule}', [ClientScheduleController::class, 'updateProduct'])->name('clients.schedule_products.update');
    Route::post('/clients/{client}/payments', [ClientScheduleController::class, 'pay'])->name('clients.payments.store');
    Route::patch('/clients/{client}/bundle-schedule-lines/{bundleLine}', [ClientScheduleController::class, 'updateBundleLine'])->name('clients.bundle_lines.update');
    Route::patch('/clients/{client}/bundle-schedules/{bundleSchedule}/pay', [ClientScheduleController::class, 'payBundle'])->name('clients.bundle_schedules.pay');
    Route::patch('/clients/{client}/package-records/{packageRecord}/pay', [ClientScheduleController::class, 'payPackage'])->name('clients.package_records.pay');
    Route::post('/clients/{client}/package-records/{packageRecord}/sessions', [ClientScheduleController::class, 'addPackageSession'])->name('clients.package_sessions.store');
    Route::patch('/clients/{client}/package-sessions/{packageSession}', [ClientScheduleController::class, 'updatePackageSession'])->name('clients.package_sessions.update');
});

// --- Staff / Users management (admin only) ---
// Ordinary staff accounts can use the Clients module, but only admins can
// view the Users directory or create/edit/disable/delete staff accounts —
// this is a privileged, staff-table-wide action, unlike managing clients.
Route::middleware(['auth:staff', 'user_type:admin'])->group(function () {
    Route::get('/staff', [StaffController::class, 'index'])->name('staff.index');
    Route::post('/staff', [StaffController::class, 'store'])->name('staff.store');
    Route::put('/staff/{staff}', [StaffController::class, 'update'])->name('staff.update');
    Route::patch('/staff/{staff}/toggle-status', [StaffController::class, 'toggleStatus'])->name('staff.toggle_status');
    Route::delete('/staff/{staff}', [StaffController::class, 'destroy'])->name('staff.destroy');

    // Settings module: user roles = login verification + module access.
    // role_key is what staff.user_type stores.
    Route::get('/user-roles', [UserRoleController::class, 'index'])->name('user_roles.index');
    Route::post('/user-roles', [UserRoleController::class, 'store'])->name('user_roles.store');
    Route::put('/user-roles/{userRole}', [UserRoleController::class, 'update'])->name('user_roles.update');
    Route::delete('/user-roles/{userRole}', [UserRoleController::class, 'destroy'])->name('user_roles.destroy');

    // Settings module: position maintenance (admin only). Positions are job
    // titles and are separate from access levels (staff.user_type).
    Route::get('/positions', [PositionController::class, 'index'])->name('positions.index');
    Route::post('/positions', [PositionController::class, 'store'])->name('positions.store');
    Route::put('/positions/{position}', [PositionController::class, 'update'])->name('positions.update');
    Route::delete('/positions/{position}', [PositionController::class, 'destroy'])->name('positions.destroy');
});

// --- Sales module (sale item catalog, bundles, packages) ---
// Any authenticated staff member can manage the catalog, bundles, and
// packages — unlike Staff/Users, this isn't restricted to admins.
Route::middleware(['auth:staff', 'module:sales'])->group(function () {
    Route::get('/sale-items', [SaleItemController::class, 'index'])->name('sale_items.index');
    Route::post('/sale-items', [SaleItemController::class, 'store'])->name('sale_items.store');
    Route::put('/sale-items/{saleItem}', [SaleItemController::class, 'update'])->name('sale_items.update');
    Route::patch('/sale-items/{saleItem}/toggle-status', [SaleItemController::class, 'toggleStatus'])->name('sale_items.toggle_status');
    Route::delete('/sale-items/{saleItem}', [SaleItemController::class, 'destroy'])->name('sale_items.destroy');

    Route::get('/bundles', [BundleController::class, 'index'])->name('bundles.index');
    Route::post('/bundles', [BundleController::class, 'store'])->name('bundles.store');
    Route::put('/bundles/{bundle}', [BundleController::class, 'update'])->name('bundles.update');
    Route::patch('/bundles/{bundle}/toggle-status', [BundleController::class, 'toggleStatus'])->name('bundles.toggle_status');
    Route::delete('/bundles/{bundle}', [BundleController::class, 'destroy'])->name('bundles.destroy');

    Route::get('/packages', [PackageController::class, 'index'])->name('packages.index');
    Route::post('/packages', [PackageController::class, 'store'])->name('packages.store');
    Route::put('/packages/{package}', [PackageController::class, 'update'])->name('packages.update');
    Route::patch('/packages/{package}/toggle-status', [PackageController::class, 'toggleStatus'])->name('packages.toggle_status');
    Route::delete('/packages/{package}', [PackageController::class, 'destroy'])->name('packages.destroy');

    // Products: same list + form pattern as the sale item catalog.
    Route::get('/products', [ProductController::class, 'index'])->name('products.index');
    Route::post('/products', [ProductController::class, 'store'])->name('products.store');
    Route::put('/products/{product}', [ProductController::class, 'update'])->name('products.update');
    Route::patch('/products/{product}/toggle-status', [ProductController::class, 'toggleStatus'])->name('products.toggle_status');
    Route::delete('/products/{product}', [ProductController::class, 'destroy'])->name('products.destroy');
});

// --- Reports module (DAILY SALES report, expenses, daily salary rates) ---
// Same gate pattern as Clients / Sales: staff session + module access.
Route::middleware(['auth:staff', 'module:reports'])->group(function () {
    Route::get('/reports/daily-sales', [ReportController::class, 'dailySales'])->name('reports.daily_sales');
    Route::post('/reports/expenses', [ReportController::class, 'storeExpense'])->name('reports.expenses.store');
    Route::delete('/reports/expenses/{expense}', [ReportController::class, 'destroyExpense'])->name('reports.expenses.destroy');
    Route::patch('/reports/salary-rate', [ReportController::class, 'updateSalaryRate'])->name('reports.salary_rate.update');
});
