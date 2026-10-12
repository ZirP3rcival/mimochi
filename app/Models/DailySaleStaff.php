<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DailySaleStaff extends Model
{
    protected $table = 'daily_sale_staff';

    protected $fillable = ['daily_sale_id', 'staff_id', 'staff_name', 'commission'];

    protected $casts = ['commission' => 'decimal:2'];

    public function sale(): BelongsTo
    {
        return $this->belongsTo(DailySale::class, 'daily_sale_id');
    }
}
