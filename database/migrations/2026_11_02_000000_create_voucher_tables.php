<?php

use App\Models\Staff;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Vouchers module.
     *
     * voucher_batches: one filing = one customer / business, a set of voucher
     * barcodes (a range such as MV-0001 to MV-0100, or individual codes), an
     * issued date and the amount of each voucher. total_amount = quantity x
     * amount_per_voucher, stored as a snapshot.
     *
     * vouchers: one row per barcode. The unique barcode index is what stops
     * the same voucher being filed twice, in any batch.
     */
    public function up(): void
    {
        $staff = new Staff; // staff table / key name taken from the model

        // Guarded so it is safe on a database that already has these tables.
        if (! Schema::hasTable('voucher_batches')) {
            Schema::create('voucher_batches', function (Blueprint $table) use ($staff) {
                $table->id();

                $table->string('customer_name');                  // customer or business name
                $table->string('barcode_mode', 20)->default('range'); // range | individual
                $table->string('barcode_from', 60);               // first barcode
                $table->string('barcode_to', 60)->nullable();     // last barcode (null for a single voucher)
                $table->unsignedInteger('quantity');

                $table->decimal('amount_per_voucher', 10, 2);
                $table->decimal('total_amount', 14, 2);           // quantity x amount_per_voucher

                $table->date('issued_date');
                $table->text('remarks')->nullable();

                $table->foreignId('staff_id')->nullable()
                    ->constrained($staff->getTable(), $staff->getKeyName())->nullOnDelete(); // who filed it

                $table->timestamps();

                $table->index('customer_name');
                $table->index('issued_date');
            });
        }

        if (! Schema::hasTable('vouchers')) {
            Schema::create('vouchers', function (Blueprint $table) {
                $table->id();

                $table->foreignId('voucher_batch_id')->constrained('voucher_batches')->cascadeOnDelete();
                $table->string('barcode', 60)->unique();
                $table->decimal('amount', 10,2);
                $table->string('status', 20)->default('unused');  // unused | used | void
                $table->timestamp('used_at')->nullable();

                $table->timestamps();

                $table->index(['voucher_batch_id', 'status']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('vouchers');
        Schema::dropIfExists('voucher_batches');
    }
};
