<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Holds the bundle-level attributes only (name + price). Which
     * sale_items belong to a bundle lives in bundle_items — see the next
     * migration — since a single bundle can contain many items and a flat
     * bundle_id/bundle_name/item_id/bundle_price table would repeat the
     * name and price on every row.
     */
    public function up(): void
    {
        Schema::create('bundles', function (Blueprint $table) {
            $table->id('bundle_id');

            $table->string('bundle_name');
            $table->decimal('bundle_price', 10, 2);

            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('bundles');
    }
};
