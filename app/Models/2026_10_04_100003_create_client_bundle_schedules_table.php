<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * One row per bundle booked for a client. The sale items inside the
     * bundle live in client_bundle_schedule_items (next migration) so each
     * can get its own date, time and staff. `status` here is a roll-up of
     * those lines, kept up to date by the controller.
     */
    public function up(): void
    {
        Schema::create('client_bundle_schedules', function (Blueprint $table) {
            $table->id();

            $table->foreignId('client_id')->constrained('clients')->cascadeOnDelete();
            $table->foreignId('bundle_id')->nullable()->constrained('bundles', 'bundle_id')->nullOnDelete();

            $table->string('bundle_name');
            $table->decimal('bundle_price', 10, 2);

            $table->string('status', 20)->default('pending'); // roll-up of the lines
            $table->timestamps();

            $table->index(['client_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('client_bundle_schedules');
    }
};
