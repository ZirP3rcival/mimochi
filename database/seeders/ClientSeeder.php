<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ClientSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        DB::table('clients')->insert([
            [
                'first_name' => 'John',
                'last_name' => 'Doe',
                'middle_initial' => 'A',
                'age' => '28', // Must be unique due to your migration constraint
                'phone' => '+639171234567',
                'address' => '123 Rizal Avenue, Manila',
                'date_of_birth' => '1998-04-12',
                'photo_path' => 'clients/john_doe.jpg',
                'status' => 'Active',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'first_name' => 'Jane',
                'last_name' => 'Smith',
                'middle_initial' => 'M',
                'age' => '34',
                'phone' => '+639189876543',
                'address' => '456 Ayala Boulevard, Makati',
                'date_of_birth' => '1992-08-23',
                'photo_path' => null, // Optional photo
                'status' => 'Active',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'first_name' => 'Mark',
                'last_name' => 'Perez',
                'middle_initial' => null,
                'age' => '41',
                'phone' => '+639225551234',
                'address' => '789 Ortigas Center, Pasig',
                'date_of_birth' => '1985-11-03',
                'photo_path' => 'clients/mark_perez.png',
                'status' => 'Archived',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'first_name' => 'Maria',
                'last_name' => 'Santos',
                'middle_initial' => 'C',
                'age' => '22',
                'phone' => null,
                'address' => '101 Katipunan Avenue, Quezon City',
                'date_of_birth' => '2004-01-19',
                'photo_path' => 'clients/maria_santos.jpg',
                'status' => 'Active',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'first_name' => 'David',
                'last_name' => 'Cruz',
                'middle_initial' => 'T',
                'age' => '55',
                'phone' => '+639059998888',
                'address' => '202 Session Road, Baguio',
                'date_of_birth' => '1971-06-30',
                'photo_path' => null,
                'status' => 'Archived',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }
}
