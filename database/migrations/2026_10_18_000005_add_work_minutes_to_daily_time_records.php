<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Only needed if daily_time_records was already migrated without `work_minutes`
 * (fresh installs get it from the create migration, so it is guarded).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('daily_time_records', 'work_minutes')) {
            Schema::table('daily_time_records', function (Blueprint $table) {
                $table->unsignedInteger('work_minutes')->default(0)->after('undertime');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('daily_time_records', 'work_minutes')) {
            Schema::table('daily_time_records', function (Blueprint $table) {
                $table->dropColumn('work_minutes');
            });
        }
    }
};
