<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * photo_path: relative path of the staff profile picture on the public disk
 * (e.g. "staff/dela_cruz.65f1c2a9.jpg"), shown in the Users list and
 * overview. Null = no picture (the UI falls back to the name's initial).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('staff', 'photo_path')) {
            Schema::table('staff', function (Blueprint $table) {
                $table->string('photo_path')->nullable()->after('emergency_contact');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('staff', 'photo_path')) {
            Schema::table('staff', function (Blueprint $table) {
                $table->dropColumn('photo_path');
            });
        }
    }
};
