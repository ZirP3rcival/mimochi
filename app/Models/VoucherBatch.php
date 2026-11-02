<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class VoucherBatch extends Model
{
    protected $fillable = [
        'customer_name', 'barcode_mode', 'barcode_from', 'barcode_to', 'quantity',
        'amount_per_voucher', 'total_amount', 'issued_date', 'remarks', 'staff_id',
    ];

    protected $casts = [
        'issued_date'        => 'date',
        'quantity'           => 'integer',
        'amount_per_voucher' => 'decimal:2',
        'total_amount'       => 'decimal:2',
    ];

    public function vouchers(): HasMany
    {
        return $this->hasMany(Voucher::class);
    }

    public function staff(): BelongsTo
    {
        return $this->belongsTo(Staff::class);
    }
}
