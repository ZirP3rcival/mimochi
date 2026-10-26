<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One payment transaction for a client: the amount received in cash and the
 * amount received online, which together equal the total of the records paid.
 */
class ClientPayment extends Model
{
    protected $fillable = [
        'client_id', 'staff_id', 'cash_amount', 'online_amount', 'total_amount', 'paid_at',
    ];

    protected $casts = [
        'cash_amount'   => 'decimal:2',
        'online_amount' => 'decimal:2',
        'total_amount'  => 'decimal:2',
        'paid_at'       => 'datetime',
    ];

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(ClientPaymentItem::class);
    }
}
