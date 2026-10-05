<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Sets up the backend infrastructure for the sale item catalog.
     */
    public function up(): void
    {
        Schema::create('sale_items', function (Blueprint $table) {
            $table->id();

            // Catalog classification / display attributes
            $table->string('category');
            $table->string('itemname');
            $table->text('info')->nullable();

            // Dual price tiers (e.g. regular vs. member/promo pricing)
            $table->decimal('price1', 10, 2);
            $table->decimal('price2', 10, 2)->nullable();

            // Staff commission tied to this item
            $table->decimal('commission', 10, 2)->nullable();

            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('sale_items');
    }
};
