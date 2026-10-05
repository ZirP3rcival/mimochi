<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * One row per (package_id, item_id) pair, so a package can reference
     * any number of sale_items rows. item_id points at sale_items.id.
     */
    public function up(): void
    {
        Schema::create('package_items', function (Blueprint $table) {
            $table->id();

            $table->foreignId('package_id')
                ->constrained('packages', 'package_id')
                ->cascadeOnDelete();

            $table->foreignId('item_id')
                ->constrained('sale_items', 'id')
                ->cascadeOnDelete();

            $table->timestamps();

            // A given item can only appear once per package.
            $table->unique(['package_id', 'item_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('package_items');
    }
};
