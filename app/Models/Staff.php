<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\Hash;

class Staff extends Authenticatable
{
    use HasFactory, Notifiable;

    /**
     * The table associated with the model.
     */
    protected $table = 'staff';

    /**
     * The attributes that are mass assignable.
     */
    protected $fillable = [
        'staff_name',
        'username',
        'password',
        'user_type',
        'available',
        'active',
    ];

    /**
     * The attributes that should be hidden for arrays / API responses.
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Attribute casting.
     */
    protected $casts = [
        'active' => 'boolean',
    ];

    /**
     * Always store a bcrypt hash, never the plaintext a form submitted.
     *
     * StaffController only ever assigns this attribute from a validated
     * plaintext value (on create, or on update when the admin actually
     * typed a new password — an unchanged/blank password is unset from
     * the payload before it ever reaches the model), so hashing on every
     * assignment here is safe and means no controller can forget to.
     */
    public function setPasswordAttribute($value): void
    {
        $this->attributes['password'] = Hash::make($value);
    }

    /**
     * Convenience helper: is this account an admin account?
     */
    public function isAdmin(): bool
    {
        return $this->user_type === 'admin';
    }

    /**
     * Convenience helper: is this account currently enabled?
     */
    public function isActive(): bool
    {
        return (bool) $this->active;
    }
}