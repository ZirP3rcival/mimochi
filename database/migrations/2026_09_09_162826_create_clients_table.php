<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clients', function (Blueprint $table) {
            $table->id();

            $table->string('first_name');
            $table->string('last_name');
            $table->string('middle_initial', 10)->nullable();

            $table->char('gender', 1)->nullable(); // M or F
            $table->date('date_of_birth')->nullable();
            $table->unsignedTinyInteger('age')->nullable();

            $table->string('phone', 50)->nullable();
            $table->string('facebook_account')->nullable();
            $table->text('address')->nullable();

            $table->string('photo_path', 2048)->nullable();
            $table->string('status', 50)->default('Active');

            $table->timestamps();

            $table->index('last_name');
            $table->index('phone');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clients');
    }
};