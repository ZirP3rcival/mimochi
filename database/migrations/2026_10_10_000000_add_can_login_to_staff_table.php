<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * can_login: whether a staff record may sign in to the system at all.
 * Separate from `active` (account enabled/disabled) and `available`
 * (can be scheduled for services).
 *
 * Staff without system access (e.g. therapists who only need a record for
 * scheduling) don't need credentials, so username and password become
 * nullable. The unique index on username stays (MySQL allows many NULLs).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('staff', 'can_login')) {
            Schema::table('staff', function (Blueprint $table) {
                // Existing accounts keep working: they default to "can log in"
                $table->boolean('can_login')->default(true)->after('available');
            });
        }

        Schema::table('staff', function (Blueprint $table) {
            $table->string('username')->nullable()->change();
            $table->string('password')->nullable()->change();
        });
    }

    public function down(): void
    {
        // Columns go back to NOT NULL, so give blank rows a value first
        DB::table('staff')->whereNull('username')->update(['username' => DB::raw("CONCAT('user', id)")]);
        DB::table('staff')->whereNull('password')->update(['password' => '']);

        Schema::table('staff', function (Blueprint $table) {
            $table->string('username')->nullable(false)->change();
            $table->string('password')->nullable(false)->change();
        });

        if (Schema::hasColumn('staff', 'can_login')) {
            Schema::table('staff', function (Blueprint $table) {
                $table->dropColumn('can_login');
            });
        }
    }
};
