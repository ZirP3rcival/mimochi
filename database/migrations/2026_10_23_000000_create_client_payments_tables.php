<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Guarded so it is safe on a database that already has these tables.
        if (! Schema::hasTable('client_payments')) {
            Schema::create('client_payments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('client_id')->constrained()->cascadeOnDelete();
                $table->unsignedBigInteger('staff_id')->nullable();   // who recorded it
                $table->decimal('cash_amount', 10, 2)->default(0);
                $table->decimal('online_amount', 10, 2)->default(0);
                $table->decimal('total_amount', 10, 2)->default(0);   // cash + online
                $table->timestamp('paid_at')->useCurrent()->index();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('client_payment_items')) {
            Schema::create('client_payment_items', function (Blueprint $table) {
                $table->id();
                $table->foreignId('client_payment_id')->constrained('client_payments')->cascadeOnDelete();
                $table->string('record_type', 20);                    // item | bundle | package | product
                $table->unsignedBigInteger('record_id');
                $table->string('record_name')->nullable();
                $table->decimal('amount', 10, 2)->default(0);
                $table->timestamps();

                $table->index(['record_type', 'record_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('client_payment_items');
        Schema::dropIfExists('client_payments');
    }
};
