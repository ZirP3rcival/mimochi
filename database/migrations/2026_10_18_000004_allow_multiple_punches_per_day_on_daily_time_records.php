<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lets a staff member time in / out several times a day: drops the
 * one-row-per-staff-per-day unique index and keeps a plain lookup index.
 * (Fresh installs already get the plain index from the create migration.)
 */
return new class extends Migration
{
    public function up(): void
    {
        try {
            Schema::table('daily_time_records', function (Blueprint $table) {
                $table->dropUnique(['staff_id', 'record_date']);
            });
        } catch (\Throwable $e) {
            // already dropped / never created
        }

        try {
            Schema::table('daily_time_records', function (Blueprint $table) {
                $table->index(['staff_id', 'record_date']);
            });
        } catch (\Throwable $e) {
            // index already exists
        }
    }

    public function down(): void
    {
        // Not restored: the table may now hold several rows per staff per day.
    }
};
