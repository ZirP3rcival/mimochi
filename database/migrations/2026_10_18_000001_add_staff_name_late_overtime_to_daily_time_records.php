<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Only needed if daily_time_records was ALREADY migrated with the older structure.
 * (Fresh installs get these columns from the create migration, so each column is guarded.)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('daily_time_records', function (Blueprint $table) {
            if (! Schema::hasColumn('daily_time_records', 'staff_name')) {
                $table->string('staff_name')->nullable()->after('staff_id');
            }
            if (! Schema::hasColumn('daily_time_records', 'late')) {
                $table->unsignedInteger('late')->default(0)->after('time_out');
            }
            if (! Schema::hasColumn('daily_time_records', 'overtime')) {
                $table->unsignedInteger('overtime')->default(0)->after('late');
            }
        });
    }

    public function down(): void
    {
        Schema::table('daily_time_records', function (Blueprint $table) {
            $table->dropColumn(['staff_name', 'late', 'overtime']);
        });
    }
};
