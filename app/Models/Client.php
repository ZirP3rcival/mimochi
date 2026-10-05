<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Client extends Model
{
    protected $fillable = [
        'first_name',
        'last_name',
        'middle_initial',
        'gender',
        'date_of_birth',
        'age',
        'phone',
        'facebook_account',
        'address',
        'photo_path',
        'status'
    ];

    public function schedules(): HasMany
    {
        return $this->hasMany(ClientSchedule::class);
    }
}
