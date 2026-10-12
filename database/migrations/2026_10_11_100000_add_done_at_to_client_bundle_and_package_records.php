<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Bundles and package cards are paid as a whole, so they get a done_at
 * timestamp too: it records WHEN the payment was made (status = 'paid').
 * Items already have done_at. Status columns are plain strings, so the new
 * 'paid' value needs no change there.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['client_bundle_schedules', 'client_package_records'] as $tableName) {
            if (!Schema::hasColumn($tableName, 'done_at')) {
                Schema::table($tableName, function (Blueprint $table) {
                    $table->timestamp('done_at')->nullable()->after('status');
                });
            }
        }
    }

    public function down(): void
    {
        foreach (['client_bundle_schedules', 'client_package_records'] as $tableName) {
            if (Schema::hasColumn($tableName, 'done_at')) {
                Schema::table($tableName, function (Blueprint $table) {
                    $table->dropColumn('done_at');
                });
            }
        }
    }
};
