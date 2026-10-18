<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Sets up the backend infrastructure for the Products catalog.
     */
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->id();

            $table->string('product_name');
            $table->text('product_description')->nullable();
            $table->decimal('price', 10, 2);

            // Same active / inactive flag the other catalog tables use
            $table->string('status', 20)->default('active');

            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
