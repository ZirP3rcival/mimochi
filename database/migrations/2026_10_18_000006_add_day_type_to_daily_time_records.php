<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Only needed if daily_time_records was already migrated without `day_type`
 * (fresh installs get it from the create migration, so it is guarded).
 * Existing rows become 'full'.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('daily_time_records', 'day_type')) {
            Schema::table('daily_time_records', function (Blueprint $table) {
                $table->string('day_type', 10)->default('full')->after('record_date');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('daily_time_records', 'day_type')) {
            Schema::table('daily_time_records', function (Blueprint $table) {
                $table->dropColumn('day_type');
            });
        }
    }
};
