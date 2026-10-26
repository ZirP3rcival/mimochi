<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One item / bundle / package / product settled by a ClientPayment (name and amount are snapshots). */
class ClientPaymentItem extends Model
{
    protected $fillable = ['client_payment_id', 'record_type', 'record_id', 'record_name', 'amount'];

    protected $casts = ['amount' => 'decimal:2'];

    public function payment(): BelongsTo
    {
        return $this->belongsTo(ClientPayment::class, 'client_payment_id');
    }
}
