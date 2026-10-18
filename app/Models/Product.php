<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Product extends Model
{
    protected $fillable = [
        'product_name',
        'product_description',
        'price',
        'status',
    ];

    protected $casts = [
        'price' => 'decimal:2',
    ];

    /**
     * Only products currently on sale. Inactive products stay in the
     * catalog but drop out of this scope.
     */
    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }
}
