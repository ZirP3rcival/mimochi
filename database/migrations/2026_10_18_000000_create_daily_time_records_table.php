<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('daily_time_records', function (Blueprint $table) {
            $table->id();

            // staff.id (no FK constraint so it works whatever the staff PK type/table name is;
            // swap for ->foreignId('staff_id')->constrained('staff') if you prefer).
            $table->unsignedBigInteger('staff_id')->index();

            // Staff name saved at time in (snapshot, stays correct if the staff is renamed later).
            $table->string('staff_name')->nullable();

            // Date and times are stored separately, always from the SERVER clock.
            $table->date('record_date');
            $table->time('time_in')->nullable();
            $table->time('time_out')->nullable();

            // Minutes. late = minutes after 10:00 AM at time in; overtime = minutes after 8:00 PM at time out; undertime = minutes before 8:00 PM at time out.
            $table->unsignedInteger('late')->default(0);
            $table->unsignedInteger('overtime')->default(0);
            // undertime = minutes BEFORE 8:00 PM when the staff times out early.
            $table->unsignedInteger('undertime')->default(0);

            // Paths relative to /public, e.g. uploads/dtr/2026-10-18/5_in_082501.jpg
            $table->string('time_in_image')->nullable();
            $table->string('time_out_image')->nullable();

            $table->string('ip_address', 45)->nullable();
            $table->timestamps();

            // One DTR row per staff per day.
            $table->unique(['staff_id', 'record_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_time_records');
    }
};
