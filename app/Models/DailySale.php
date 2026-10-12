<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DailySale extends Model
{
    protected $fillable = [
        'sale_date', 'paid_at', 'client_id', 'client_name', 'source_type', 'source_id',
        'services', 'payment_method', 'amount', 'staff_names', 'commission',
        'start_time', 'finish_time', 'recorded_by',
    ];

    protected $casts = [
        'sale_date'  => 'date:Y-m-d',
        'paid_at'    => 'datetime',
        'amount'     => 'decimal:2',
        'commission' => 'decimal:2',
    ];

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function staffLines(): HasMany
    {
        return $this->hasMany(DailySaleStaff::class);
    }
}
