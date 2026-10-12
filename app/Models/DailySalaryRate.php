<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DailySalaryRate extends Model
{
    protected $fillable = ['report_date', 'staff_id', 'daily_rate'];

    protected $casts = [
        'report_date' => 'date:Y-m-d',
        'daily_rate'  => 'decimal:2',
    ];
}
