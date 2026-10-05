<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Bundle extends Model
{
    protected $primaryKey = 'bundle_id';

    protected $fillable = [
        'bundle_name',
        'bundle_price',
        'status',
    ];

    /**
     * Only bundles currently offered for scheduling. Inactive bundles stay
     * in the catalog (and on past schedules) but drop out of this scope.
     */
    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    /**
     * The sale items included in this bundle, via the bundle_items pivot
     * table. A bundle can hold any number of sale_items rows.
     */
    public function items(): BelongsToMany
    {
        return $this->belongsToMany(
            SaleItem::class,
            'bundle_items',
            'bundle_id',
            'item_id'
        )->withTimestamps();
    }
}
