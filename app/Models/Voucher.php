<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Voucher extends Model
{
    protected $fillable = ['voucher_batch_id', 'barcode', 'amount', 'status', 'used_at'];

    protected $casts = [
        'amount'  => 'decimal:2',
        'used_at' => 'datetime',
    ];

    public function batch(): BelongsTo
    {
        return $this->belongsTo(VoucherBatch::class, 'voucher_batch_id');
    }
}
