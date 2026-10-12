<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DailyExpense extends Model
{
    protected $fillable = ['expense_date', 'particular', 'amount', 'recorded_by'];

    protected $casts = [
        'expense_date' => 'date:Y-m-d',
        'amount'       => 'decimal:2',
    ];
}
