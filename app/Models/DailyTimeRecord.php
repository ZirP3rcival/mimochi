<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DailyTimeRecord extends Model
{
    protected $fillable = [
        'staff_id', 'staff_name', 'record_date', 'time_in', 'time_out', 'late', 'overtime', 'undertime',
        'time_in_image', 'time_out_image', 'ip_address',
    ];

    protected $casts = [
        'record_date' => 'date:Y-m-d',
    ];

    public function staff()
    {
        return $this->belongsTo(Staff::class);
    }
}
