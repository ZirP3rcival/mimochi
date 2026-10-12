<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_roles', function (Blueprint $table) {
            $table->id();
            // Value stored in staff.user_type. Set once, never changes.
            $table->string('role_key')->unique();
            $table->string('role_name');
            $table->string('description')->nullable();
            $table->string('status', 50)->default('Active');
            // Dashboard module ids this role may open
            $table->json('modules')->nullable();
            // admin / staff: the app's route middleware depends on them
            $table->boolean('is_system')->default(false);
            $table->timestamps();
        });

        $now = now();
        DB::table('user_roles')->insert([
            [
                'role_key' => 'admin', 'role_name' => 'Admin',
                'description' => 'Full system access', 'status' => 'Active',
                'modules' => json_encode([
                    'dashboard', 'clients', 'scheduling', 'sales', 'inventory',
                    'vouchers', 'expenses', 'reports', 'payroll', 'users', 'settings',
                ]),
                'is_system' => true, 'created_at' => $now, 'updated_at' => $now,
            ],
            [
                'role_key' => 'staff', 'role_name' => 'Staff',
                'description' => 'Standard staff access', 'status' => 'Active',
                'modules' => json_encode(['dashboard', 'clients', 'scheduling', 'sales']),
                'is_system' => true, 'created_at' => $now, 'updated_at' => $now,
            ],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('user_roles');
    }
};
