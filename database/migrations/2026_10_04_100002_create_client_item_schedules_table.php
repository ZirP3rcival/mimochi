<?php

use App\Models\Staff;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * One row per individual sale item booked for a client.
     *
     * Booking only picks WHAT the client will receive. Date, time and staff
     * start empty (status = pending) and are assigned later, per row. Once all
     * three are set the row becomes "ongoing"; it becomes "done" when staff
     * mark it so. name/price/commission are snapshots, so later catalog edits
     * or deletions never rewrite history.
     */
    public function up(): void
    {
        $staff = new Staff; // staff table / key name taken from the model

        Schema::create('client_item_schedules', function (Blueprint $table) use ($staff) {
            $table->id();

            $table->foreignId('client_id')->constrained('clients')->cascadeOnDelete();
            $table->foreignId('sale_item_id')->nullable()->constrained('sale_items')->nullOnDelete();

            $table->string('item_name');
            $table->decimal('price', 10, 2);
            $table->decimal('commission', 10, 2)->nullable();

            $table->date('scheduled_date')->nullable();
            $table->time('scheduled_time')->nullable();
            $table->foreignId('staff_id')->nullable()
                ->constrained($staff->getTable(), $staff->getKeyName())->nullOnDelete();

            $table->string('status', 20)->default('pending'); // pending | ongoing | done
            $table->timestamp('done_at')->nullable();
            $table->text('remarks')->nullable();

            $table->timestamps();

            $table->index(['client_id', 'status']);
            $table->index(['staff_id', 'scheduled_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('client_item_schedules');
    }
};
