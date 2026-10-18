<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Only needed if `packages` was ALREADY migrated without this column
 * (fresh installs get it from the create migration, so it is guarded).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('packages', 'free_session_count')) {
            Schema::table('packages', function (Blueprint $table) {
                $table->unsignedInteger('free_session_count')->default(0)->after('package_description');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('packages', 'free_session_count')) {
            Schema::table('packages', function (Blueprint $table) {
                $table->dropColumn('free_session_count');
            });
        }
    }
};
