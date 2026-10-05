<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The digital version of the paper package card: one row per package
     * bought by a client (name + package on top). The Session / Date /
     * Signature columns, the blue "Free" row and the Remarks row live in
     * client_package_sessions. session_count / free_session_count are
     * snapshots of the package's setup at booking time.
     */
    public function up(): void
    {
        Schema::create('client_package_records', function (Blueprint $table) {
            $table->id();

            $table->foreignId('client_id')->constrained('clients')->cascadeOnDelete();
            $table->foreignId('package_id')->nullable()->constrained('packages', 'package_id')->nullOnDelete();

            $table->string('package_name');
            $table->decimal('package_price', 10, 2);
            $table->unsignedSmallInteger('session_count');
            $table->unsignedSmallInteger('free_session_count')->default(0);

            $table->string('status', 20)->default('pending'); // roll-up of the paid sessions
            $table->timestamps();

            $table->index(['client_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('client_package_records');
    }
};
