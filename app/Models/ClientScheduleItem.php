<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClientScheduleItem extends Model
{
    protected $fillable = [
        'client_schedule_id',
        'scheduleable_type',
        'scheduleable_id',
        'name',
        'price',
        'commission',
        'staff_id',
        'status',
    ];

    protected $casts = [
        'price'      => 'decimal:2',
        'commission' => 'decimal:2',
    ];

    /**
     * Maps scheduleable_type ('item' | 'bundle' | 'package') to the model
     * class it references. Kept here as plain array lookups rather than
     * Eloquent's morphTo/morph map, so nothing else in the app needs to
     * register anything for this to work.
     */
    public const TYPE_MODELS = [
        'item'    => SaleItem::class,
        'bundle'  => Bundle::class,
        'package' => Package::class,
    ];

    public function clientSchedule(): BelongsTo
    {
        return $this->belongsTo(ClientSchedule::class);
    }

    /**
     * The staff member assigned to perform (and earn commission on) this
     * line. Set later from the staff-scheduling module — null until then.
     */
    public function staff(): BelongsTo
    {
        return $this->belongsTo(Staff::class);
    }

    public function isDone(): bool
    {
        return $this->status === 'done';
    }

    /**
     * Resolves the live catalog record this line refers to (or null if it
     * has since been deleted). Prefer the snapshotted name/price/commission
     * columns for display — this is for cases that need the current record.
     */
    public function scheduleable(): ?Model
    {
        $modelClass = self::TYPE_MODELS[$this->scheduleable_type] ?? null;

        return $modelClass ? $modelClass::find($this->scheduleable_id) : null;
    }
}
