<?php

namespace App\Models;

use App\Models\Concerns\TracksScheduleProgress;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClientItemSchedule extends Model
{
    use TracksScheduleProgress;

    protected $fillable = [
        'client_id', 'sale_item_id', 'item_name', 'price', 'commission',
        'scheduled_date', 'scheduled_time', 'staff_id', 'status', 'done_at', 'remarks',
    ];

    protected $casts = [
        'price'          => 'decimal:2',
        'commission'     => 'decimal:2',
        'scheduled_date' => 'date:Y-m-d',
        'done_at'        => 'datetime',
    ];

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function saleItem(): BelongsTo
    {
        return $this->belongsTo(SaleItem::class);
    }
}
