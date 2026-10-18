<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A product booked for a client. Mirrors client_item_schedules: the
     * name and price are snapshotted at booking time, and date / time /
     * staff are assigned later from the client's service record.
     * Status flow: pending -> ongoing -> done -> paid.
     */
    public function up(): void
    {
        Schema::create('client_product_schedules', function (Blueprint $table) {
            $table->id();

            $table->foreignId('client_id')->constrained('clients')->cascadeOnDelete();

            // Kept (as null) if the product is later deleted from the
            // catalog, so the booking and its snapshot survive.
            $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete();

            $table->string('product_name');
            $table->decimal('price', 10, 2);

            $table->date('scheduled_date')->nullable();
            $table->time('scheduled_time')->nullable();
            $table->unsignedBigInteger('staff_id')->nullable()->index();

            $table->string('status', 20)->default('pending');
            $table->timestamp('done_at')->nullable();
            $table->text('remarks')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('client_product_schedules');
    }
};
