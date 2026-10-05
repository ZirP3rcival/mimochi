<?php

namespace App\Models;

use App\Models\Concerns\RollsUpScheduleStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Collection;

/**
 * A client's package card (see the paper card): package name on top, then
 * numbered sessions plus the "Free" row, each with date / time / staff /
 * signature / remarks.
 */
class ClientPackageRecord extends Model
{
    use RollsUpScheduleStatus;

    protected $fillable = [
        'client_id', 'package_id', 'package_name', 'package_price',
        'session_count', 'free_session_count', 'status',
    ];

    protected $casts = ['package_price' => 'decimal:2'];

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function package(): BelongsTo
    {
        return $this->belongsTo(Package::class, 'package_id', 'package_id');
    }

    /** Paid sessions first (1st, 2nd ...), then the free row. */
    public function sessions(): HasMany
    {
        return $this->hasMany(ClientPackageSession::class, 'client_package_record_id')
            ->orderBy('is_free')
            ->orderBy('sequence');
    }

    /**
     * Only paid sessions decide completion: an unredeemed free session
     * shouldn't keep the whole card open forever.
     */
    protected function rollupRows(): Collection
    {
        return $this->sessions()->where('is_free', false)->get();
    }
}
