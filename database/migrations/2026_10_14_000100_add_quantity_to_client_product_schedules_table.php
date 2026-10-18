<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Products are booked with a quantity. `price` stays the unit price
     * (snapshotted at booking); the line total is quantity x price and is
     * computed by the model, so it can never drift out of sync.
     *
     * Existing bookings default to a quantity of 1, so their totals are
     * unchanged. The hasColumn guard makes this safe to re-run.
     */
    public function up(): void
    {
        if (! Schema::hasColumn('client_product_schedules', 'quantity')) {
            Schema::table('client_product_schedules', function (Blueprint $table) {
                $table->unsignedInteger('quantity')->default(1)->after('product_name');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('client_product_schedules', 'quantity')) {
            Schema::table('client_product_schedules', function (Blueprint $table) {
                $table->dropColumn('quantity');
            });
        }
    }
};
