<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Package extends Model
{
    protected $primaryKey = 'package_id';

    protected $fillable = [
        'package_name',
        'package_price',
        'package_description',
        'session_count',
        'free_session_count',
        'status',
    ];

    /**
     * Only packages currently offered for scheduling. Inactive packages
     * stay in the catalog (and on past schedules) but drop out of this
     * scope.
     */
    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    /**
     * The sale items included in this package, via the package_items pivot
     * table. A package can hold any number of sale_items rows.
     */
    public function items(): BelongsToMany
    {
        return $this->belongsToMany(
            SaleItem::class,
            'package_items',
            'package_id',
            'item_id'
        )->withTimestamps();
    }
}
