<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Job positions / titles (e.g. Therapist, Receptionist). These have
        // nothing to do with system access: that stays in staff.user_type.
        Schema::create('positions', function (Blueprint $table) {
            $table->id();
            $table->string('position_name')->unique();
            $table->string('description')->nullable();
            $table->string('status', 50)->default('Active');
            $table->timestamps();
        });

        // Which position each staff account holds. restrictOnDelete makes
        // the database itself refuse to remove a position that is in use,
        // as a backstop to the check in PositionController.
        Schema::table('staff', function (Blueprint $table) {
            $table->foreignId('position_id')
                ->nullable()
                ->after('user_type')
                ->constrained('positions')
                ->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('staff', function (Blueprint $table) {
            $table->dropConstrainedForeignId('position_id');
        });

        Schema::dropIfExists('positions');
    }
};
