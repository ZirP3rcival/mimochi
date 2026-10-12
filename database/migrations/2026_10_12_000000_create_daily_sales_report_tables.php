<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tables behind the "DAILY SALES" report sheet.
 *
 *  daily_sales        main table: COMPLETE NAME, SERVICES, PAYMENT (Cash / Online),
 *                     STAFF, COMMI, AMT, TIME (Start / Finish). One row is written
 *                     each time the payment button is used on an item, bundle or
 *                     package.
 *  daily_sale_staff   who earned what commission on each sale (feeds DAILY SALARY).
 *  daily_expenses     DAILY EXPENSES / PAYABLES: Date, Name of Item/Particular, Amount.
 *  daily_salary_rates DAILY SALARY "DR" (daily rate) per staff member per day.
 *                     No row means the default rate (300) applies.
 *
 * The summary block (CASH, ONLINE, TOTAL SALES, LESS DAILY RATE / BILLS /
 * SALARY, PROFIT, CASH ON HAND) is calculated from these tables, not stored.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('daily_sales', function (Blueprint $table) {
            $table->id();

            $table->date('sale_date');                       // report date = day the payment was recorded
            $table->dateTime('paid_at');

            $table->foreignId('client_id')->nullable()->constrained('clients')->nullOnDelete();
            $table->string('client_name');                   // COMPLETE NAME (snapshot)

            // What was paid: one item, one bundle booking or one package card
            $table->string('source_type', 20);               // item | bundle | package
            $table->unsignedBigInteger('source_id');
            $table->text('services');                        // SERVICES (snapshot)

            $table->string('payment_method', 10);            // cash | online
            $table->decimal('amount', 10, 2);                // AMT: goes under Cash or Online by method

            $table->string('staff_names')->nullable();       // STAFF (snapshot)
            $table->decimal('commission', 10, 2)->default(0); // COMMI
            $table->time('start_time')->nullable();          // TIME: Start
            $table->time('finish_time')->nullable();         // TIME: Finish

            $table->foreignId('recorded_by')->nullable()->constrained('staff')->nullOnDelete();
            $table->timestamps();

            // A booking can only ever be paid once
            $table->unique(['source_type', 'source_id']);
            $table->index('sale_date');
        });

        Schema::create('daily_sale_staff', function (Blueprint $table) {
            $table->id();
            $table->foreignId('daily_sale_id')->constrained('daily_sales')->cascadeOnDelete();
            $table->foreignId('staff_id')->nullable()->constrained('staff')->nullOnDelete();
            $table->string('staff_name');
            $table->decimal('commission', 10, 2)->default(0);
            $table->timestamps();

            $table->index('staff_id');
        });

        Schema::create('daily_expenses', function (Blueprint $table) {
            $table->id();
            $table->date('expense_date');                    // Date
            $table->string('particular');                    // Name of Item/Particular
            $table->decimal('amount', 10, 2);                // Amount
            $table->foreignId('recorded_by')->nullable()->constrained('staff')->nullOnDelete();
            $table->timestamps();

            $table->index('expense_date');
        });

        Schema::create('daily_salary_rates', function (Blueprint $table) {
            $table->id();
            $table->date('report_date');
            $table->foreignId('staff_id')->constrained('staff')->cascadeOnDelete();
            $table->decimal('daily_rate', 10, 2);            // DR
            $table->timestamps();

            $table->unique(['report_date', 'staff_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_salary_rates');
        Schema::dropIfExists('daily_expenses');
        Schema::dropIfExists('daily_sale_staff');
        Schema::dropIfExists('daily_sales');
    }
};
