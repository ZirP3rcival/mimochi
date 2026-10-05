<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * PackageController has always read/written $package->status (toggleStatus,
     * scopeActive, store(), update()), but the original create_packages_table
     * migration never actually defined the column — this is why inserts were
     * failing with "Unknown column 'status'". Matches the same
     * active/inactive convention already used by bundles and sale_items.
     */
    public function up(): void
    {
        Schema::table('packages', function (Blueprint $table) {
            $table->string('status', 20)->default('active')->after('package_description');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('packages', function (Blueprint $table) {
            $table->dropColumn('status');
        });
    }
};
