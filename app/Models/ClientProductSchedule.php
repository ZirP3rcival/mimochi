<?php

namespace App\Models;

use App\Models\Concerns\TracksScheduleProgress;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClientProductSchedule extends Model
{
    use TracksScheduleProgress;

    protected $fillable = [
        'client_id', 'product_id', 'product_name', 'price', 'quantity',
        'scheduled_date', 'scheduled_time', 'staff_id', 'status', 'done_at', 'remarks',
    ];

    protected $casts = [
        'price'          => 'decimal:2',
        'quantity'       => 'integer',
        'scheduled_date' => 'date:Y-m-d',
        'done_at'        => 'datetime',
    ];

    /**
     * `total` (quantity x unit price) is included whenever the model is
     * serialised, so the service record can show it without recomputing.
     */
    protected $appends = ['total'];

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function getTotalAttribute(): float
    {
        return round((float) $this->price * max(1, (int) $this->quantity), 2);
    }
}
