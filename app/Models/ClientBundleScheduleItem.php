<?php

namespace App\Models;

use App\Models\Concerns\TracksScheduleProgress;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClientBundleScheduleItem extends Model
{
    use TracksScheduleProgress;

    protected $fillable = [
        'client_bundle_schedule_id', 'sale_item_id', 'item_name', 'list_price', 'commission',
        'scheduled_date', 'scheduled_time', 'staff_id', 'status', 'done_at', 'remarks',
    ];

    protected $casts = [
        'list_price'     => 'decimal:2',
        'commission'     => 'decimal:2',
        'scheduled_date' => 'date:Y-m-d',
        'done_at'        => 'datetime',
    ];

    public function bundleSchedule(): BelongsTo
    {
        return $this->belongsTo(ClientBundleSchedule::class, 'client_bundle_schedule_id');
    }

    public function saleItem(): BelongsTo
    {
        return $this->belongsTo(SaleItem::class);
    }
}
