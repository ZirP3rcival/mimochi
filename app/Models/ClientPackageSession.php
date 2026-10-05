<?php

namespace App\Models;

use App\Models\Concerns\TracksScheduleProgress;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClientPackageSession extends Model
{
    use TracksScheduleProgress;

    protected $fillable = [
        'client_package_record_id', 'is_free', 'sequence', 'free_label',
        'scheduled_date', 'scheduled_time', 'staff_id', 'status', 'done_at', 'signed_at', 'remarks',
    ];

    protected $casts = [
        'is_free'        => 'boolean',
        'scheduled_date' => 'date:Y-m-d',
        'done_at'        => 'datetime',
        'signed_at'      => 'datetime',
    ];

    public function record(): BelongsTo
    {
        return $this->belongsTo(ClientPackageRecord::class, 'client_package_record_id');
    }
}
