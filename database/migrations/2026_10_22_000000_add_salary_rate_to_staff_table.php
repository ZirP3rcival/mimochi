<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Guarded so it is safe to run against a database that already has the column.
        if (! Schema::hasColumn('staff', 'salary_rate')) {
            Schema::table('staff', function (Blueprint $table) {
                $table->decimal('salary_rate', 10, 2)->default(0);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('staff', 'salary_rate')) {
            Schema::table('staff', function (Blueprint $table) {
                $table->dropColumn('salary_rate');
            });
        }
    }
};
