<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Extends the existing `staff` table. Nothing is created for positions or
 * user roles: those tables already exist and staff only references them.
 *
 *   ID NO              -> id_no              (new, unique)
 *   NAME               -> staff_name         (existing)
 *   CONTACT NO         -> contact_no         (new)
 *   ADDRESS            -> address            (new)
 *   BIRTHDATE          -> birthdate          (new)
 *   TIN                -> tin                (new)
 *   SSS NO             -> sss_no             (new)
 *   PHILHEALTH NO      -> philhealth_no      (new)
 *   EMERGENCY CONTACT  -> emergency_contact  (new)
 *   USERNAME/PASSWORD  -> username/password  (existing)
 *   USER ROLE          -> user_type          (existing; enum -> string, now a
 *                                             foreign key to user_roles.role_key)
 *   POSITION           -> position_id        (already added, with its foreign
 *                                             key, by 2026_10_07_000000_create_positions_table;
 *                                             skipped here if present)
 *   AVAILABLE/ACTIVE   -> available/active   (existing)
 *
 * Run order needed: create_staff_table, create_positions_table,
 * create_user_roles_table, then this file.
 */
return new class extends Migration
{
    public function up(): void
    {
        $has = fn (string $column) => Schema::hasColumn('staff', $column);

        // 1) Profile columns (each added only if it is missing)
        Schema::table('staff', function (Blueprint $table) use ($has) {
            if (!$has('id_no')) {
                $table->string('id_no', 50)->nullable()->unique()->after('id');
            }
            if (!$has('contact_no')) {
                $table->string('contact_no', 50)->nullable()->after('staff_name');
            }
            if (!$has('address')) {
                $table->text('address')->nullable()->after('contact_no');
            }
            if (!$has('birthdate')) {
                $table->date('birthdate')->nullable()->after('address');
            }
            if (!$has('tin')) {
                $table->string('tin', 50)->nullable()->after('birthdate');
            }
            if (!$has('sss_no')) {
                $table->string('sss_no', 50)->nullable()->after('tin');
            }
            if (!$has('philhealth_no')) {
                $table->string('philhealth_no', 50)->nullable()->after('sss_no');
            }
            if (!$has('emergency_contact')) {
                $table->string('emergency_contact')->nullable()->after('philhealth_no');
            }
        });

        // 2) USER ROLE: user_type was enum('admin','staff'). Make it a string
        //    the same size as user_roles.role_key so it can reference it.
        Schema::table('staff', function (Blueprint $table) {
            $table->string('user_type')->default('staff')->change();
        });

        // 3) Reference user_roles. Existing 'admin' / 'staff' values match the
        //    roles seeded by the user_roles migration, so this succeeds on
        //    current data. restrictOnDelete: a role in use can't be removed.
        $alreadyLinked = collect(Schema::getForeignKeys('staff'))
            ->contains(fn ($fk) => in_array('user_type', $fk['columns'], true));

        if (!$alreadyLinked) {
            Schema::table('staff', function (Blueprint $table) {
                $table->foreign('user_type')
                    ->references('role_key')
                    ->on('user_roles')
                    ->restrictOnDelete()
                    ->cascadeOnUpdate();
            });
        }
    }

    public function down(): void
    {
        $linked = collect(Schema::getForeignKeys('staff'))
            ->contains(fn ($fk) => in_array('user_type', $fk['columns'], true));

        if ($linked) {
            Schema::table('staff', function (Blueprint $table) {
                $table->dropForeign(['user_type']);
            });
        }

        if (Schema::hasColumn('staff', 'id_no')) {
            Schema::table('staff', function (Blueprint $table) {
                $table->dropUnique(['id_no']);
            });
        }

        $drop = array_values(array_filter(
            ['id_no', 'contact_no', 'address', 'birthdate', 'tin', 'sss_no', 'philhealth_no', 'emergency_contact'],
            fn ($column) => Schema::hasColumn('staff', $column)
        ));

        if ($drop) {
            Schema::table('staff', function (Blueprint $table) use ($drop) {
                $table->dropColumn($drop);
            });
        }

        // Custom role keys can't fit the old enum, so fall back to 'staff'
        DB::table('staff')->whereNotIn('user_type', ['admin', 'staff'])->update(['user_type' => 'staff']);

        Schema::table('staff', function (Blueprint $table) {
            $table->enum('user_type', ['admin', 'staff'])->default('staff')->change();
        });
    }
};
