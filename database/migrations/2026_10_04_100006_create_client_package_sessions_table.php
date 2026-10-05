<?php

use App\Models\Staff;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * One row per column of the paper card.
     *
     *  - is_free = false -> the numbered sessions (1st, 2nd, 3rd ...).
     *  - is_free = true  -> the blue "Free" row (e.g. "Free Session",
     *    "facial"); free_label holds what was given.
     *
     * Each session has its own Date / Time / Staff (assigned later), the
     * client's Signature (signed_at) and Remarks.
     */
    public function up(): void
    {
        $staff = new Staff;

        Schema::create('client_package_sessions', function (Blueprint $table) use ($staff) {
            $table->id();

            $table->foreignId('client_package_record_id')
                ->constrained('client_package_records')->cascadeOnDelete();

            $table->boolean('is_free')->default(false);
            $table->unsignedSmallInteger('sequence');           // 1st, 2nd ... within paid / within free
            $table->string('free_label')->nullable();

            $table->date('scheduled_date')->nullable();
            $table->time('scheduled_time')->nullable();
            $table->foreignId('staff_id')->nullable()
                ->constrained($staff->getTable(), $staff->getKeyName())->nullOnDelete();

            $table->string('status', 20)->default('pending');
            $table->timestamp('done_at')->nullable();
            $table->timestamp('signed_at')->nullable();         // client signature on the card
            $table->text('remarks')->nullable();

            $table->timestamps();

            $table->unique(['client_package_record_id', 'is_free', 'sequence'], 'cps_record_free_seq_unique');
            $table->index(['staff_id', 'scheduled_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('client_package_sessions');
    }
};
