<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
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
        'id_no',
        'staff_name',
        'contact_no',
        'address',
        'birthdate',
        'tin',
        'sss_no',
        'philhealth_no',
        'emergency_contact',
        'photo_path',    // profile picture (public disk, e.g. staff/xxx.jpg)
        'username',
        'password',
        'user_type',     // role_key of a user_roles row (login + module access)
        'position_id',   // positions.id (job title only, not access)
        'available',
        'can_login',     // may this record sign in to the system
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
        'birthdate' => 'date:Y-m-d',
        'available' => 'boolean',
        'can_login' => 'boolean',
        'active'    => 'boolean',
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
     * Job position (positions table).
     */
    public function position(): BelongsTo
    {
        return $this->belongsTo(Position::class, 'position_id');
    }

    /**
     * User role (user_roles table), linked through user_type = role_key.
     */
    public function userRole(): BelongsTo
    {
        return $this->belongsTo(UserRole::class, 'user_type', 'role_key');
    }

    /**
     * Convenience helper: is this account an admin account?
     */
    public function isAdmin(): bool
    {
        return strtolower((string) $this->user_type) === 'admin';
    }

    /**
     * Convenience helper: is this account currently enabled?
     */
    public function isActive(): bool
    {
        return (bool) $this->active;
    }
}
