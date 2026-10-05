<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class SaleItem extends Model
{
    protected $fillable = [
        'category',
        'itemname',
        'info',
        'price1',
        'price2',
        'commission',
        'status',
    ];

    /**
     * Only sale items currently offered for scheduling. Inactive items stay
     * in the catalog (and on past schedules) but drop out of this scope.
     */
    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    /**
     * Bundles this item has been added to.
     */
    public function bundles(): BelongsToMany
    {
        return $this->belongsToMany(
            Bundle::class,
            'bundle_items',
            'item_id',
            'bundle_id'
        )->withTimestamps();
    }

    /**
     * Packages this item has been added to.
     */
    public function packages(): BelongsToMany
    {
        return $this->belongsToMany(
            Package::class,
            'package_items',
            'item_id',
            'package_id'
        )->withTimestamps();
    }
}
