<?php

namespace Database\Seeders;

use App\Models\Staff;
use Illuminate\Database\Seeder;

class StaffSeeder extends Seeder
{
    public function run(): void
    {
        // Staff::setPasswordAttribute() hashes whatever plain-text value is
        // assigned here — do NOT call Hash::make() in this seeder as well,
        // or the password gets hashed twice and login will always fail.
        Staff::create([
            'staff_name' => 'System Administrator',
            'username'   => 'admin',
            'password'   => 'admin123',
            'user_type'  => 'admin',
            'available'  => true,
            'active'     => true,
        ]);

        Staff::create([
            'staff_name' => 'Front Desk Staff',
            'username'   => 'staff',
            'password'   => 'staff123',
            'user_type'  => 'staff',
            'available'  => true,
            'active'     => true,
        ]);
    }
}