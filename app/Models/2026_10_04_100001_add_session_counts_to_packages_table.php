<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A package card (see the paper "Carbon (face) installment" card) has a
     * fixed number of paid sessions (1st..Nth) plus an optional "Free" row of
     * bonus sessions. These two columns tell the scheduler how many session
     * slots to create when a package is booked for a client.
     */
    public function up(): void
    {
        Schema::table('packages', function (Blueprint $table) {
            $table->unsignedSmallInteger('session_count')->default(1)->after('package_description');
            $table->unsignedSmallInteger('free_session_count')->default(0)->after('session_count');
        });
    }

    public function down(): void
    {
        Schema::table('packages', function (Blueprint $table) {
            $table->dropColumn(['session_count', 'free_session_count']);
        });
    }
};
