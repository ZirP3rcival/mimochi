<?php

use App\Models\Staff;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The individual sale items inside a booked bundle. Each line is
     * scheduled on its own: date, time and staff are assigned later, and
     * each line is marked done separately.
     */
    public function up(): void
    {
        $staff = new Staff;

        Schema::create('client_bundle_schedule_items', function (Blueprint $table) use ($staff) {
            $table->id();

            $table->foreignId('client_bundle_schedule_id')
                ->constrained('client_bundle_schedules')->cascadeOnDelete();
            $table->foreignId('sale_item_id')->nullable()->constrained('sale_items')->nullOnDelete();

            $table->string('item_name');
            $table->decimal('list_price', 10, 2)->nullable();   // informational: item's own price1
            $table->decimal('commission', 10, 2)->nullable();   // snapshot, earned by the assigned staff

            $table->date('scheduled_date')->nullable();
            $table->time('scheduled_time')->nullable();
            $table->foreignId('staff_id')->nullable()
                ->constrained($staff->getTable(), $staff->getKeyName())->nullOnDelete();

            $table->string('status', 20)->default('pending');
            $table->timestamp('done_at')->nullable();
            $table->text('remarks')->nullable();

            $table->timestamps();

            $table->index(['staff_id', 'scheduled_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('client_bundle_schedule_items');
    }
};
