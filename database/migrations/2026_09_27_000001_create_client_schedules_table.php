<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * client_schedules: one row per "Save Schedule" action — a booking for
     * a single client that can bundle together any mix of sale items,
     * bundles, and packages (the actual selections live in
     * client_schedule_items below).
     *
     * scheduled_at is captured by the booking flow's date/time step.
     * status here is the schedule as a whole (pending | confirmed |
     * completed | cancelled) — separate from each line's own done/pending
     * status below.
     */
    public function up(): void
    {
        Schema::create('client_schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_id')->constrained()->cascadeOnDelete();
            $table->dateTime('scheduled_at')->nullable();
            $table->string('status')->default('pending'); // pending | confirmed | completed | cancelled
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        // client_schedule_items: the selected services for a schedule.
        // Deliberately polymorphic-by-hand (scheduleable_type is a plain
        // 'item' | 'bundle' | 'package' string, not an Eloquent morph map)
        // so it needs no extra service-provider registration to work.
        //
        // name/price/commission are snapshotted at save time so a
        // schedule keeps showing what was actually booked — and what
        // commission was in effect — even if the catalog record is later
        // edited, deactivated, or deleted. commission is only meaningful
        // for individual sale items today (bundles/packages have no
        // commission field of their own), so it's nullable.
        //
        // staff_id is deliberately left unset by the booking flow itself:
        // it's assigned afterwards from the separate staff-scheduling
        // module, which is also what flips `status` from pending to done
        // once that staff member completes the service — that's how the
        // system knows which staff member earned the commission on a
        // given line.
        Schema::create('client_schedule_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('client_schedule_id')->constrained()->cascadeOnDelete();
            $table->enum('scheduleable_type', ['item', 'bundle', 'package']);
            $table->unsignedBigInteger('scheduleable_id');
            $table->string('name');
            $table->decimal('price', 10, 2)->default(0);
            $table->decimal('commission', 10, 2)->nullable();
            $table->foreignId('staff_id')->nullable()->constrained('staff')->nullOnDelete();
            $table->enum('status', ['pending', 'done'])->default('pending');
            $table->timestamps();

            $table->index(['scheduleable_type', 'scheduleable_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('client_schedule_items');
        Schema::dropIfExists('client_schedules');
    }
};
