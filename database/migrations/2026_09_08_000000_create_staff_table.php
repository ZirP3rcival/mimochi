<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('staff', function (Blueprint $table) {
            $table->id(); // Purpose: unique auto-incrementing ID for each staff record
            $table->string('staff_name'); // Purpose: the person's display name, e.g. "Front Desk Staff"
            $table->string('username')->unique(); // Purpose: login name; unique() prevents two accounts sharing one
            $table->string('password'); // Purpose: stores a HASHED password (never plain text — see seeder below)
            $table->enum('user_type', ['admin', 'staff'])->default('staff'); // Purpose: the role used to decide which dashboard to load
            $table->boolean('available')->default(true); // Purpose: lets you disable an account if scheduled for services
            $table->boolean('active')->default(true); // Purpose: lets you disable an account without deleting it
            $table->timestamps(); // Purpose: adds created_at / updated_at automatically
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('staff');
    }
};
