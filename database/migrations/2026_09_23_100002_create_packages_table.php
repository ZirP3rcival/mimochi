<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Holds the package-level attributes only (name + price + description
     * + status). Which sale_items belong to a package lives in
     * package_items — see the next migration — mirroring the bundles /
     * bundle_items split.
     */
    public function up(): void
    {
        Schema::create('packages', function (Blueprint $table) {
            $table->id('package_id');

            $table->string('package_name');
            $table->decimal('package_price', 10, 2);
            $table->text('package_description')->nullable();

            // Active/inactive, same convention PackageController already
            // reads/writes (toggleStatus, scopeActive) and the same shape
            // used by bundles and sale_items.
            $table->string('status', 20)->default('active');

            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('packages');
    }
};
