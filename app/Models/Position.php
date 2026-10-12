<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Position extends Model
{
    protected $fillable = [
        'position_name',
        'description',
        'status',
    ];

    // Staff accounts that currently hold this position
    public function staff(): HasMany
    {
        return $this->hasMany(Staff::class, 'position_id');
    }
}
