<?php

namespace App\Models\Concerns;

use App\Models\Staff;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Shared by every schedulable row (item schedule, bundle line, package
 * session). Status is derived from what has been assigned:
 *
 *   pending  - date, time or staff still missing
 *   ongoing  - date + time + staff all assigned
 *   done     - marked done (only kept while still fully assigned)
 */
trait TracksScheduleProgress
{
    public static function bootTracksScheduleProgress(): void
    {
        static::saving(function ($row) {
            if ($row->status === 'done' && $row->isAssigned()) {
                if (! $row->done_at) {
                    $row->done_at = now();
                }
                return;
            }

            $row->done_at = null;
            $row->status = $row->isAssigned() ? 'ongoing' : 'pending';
        });
    }

    public function isAssigned(): bool
    {
        return (bool) ($this->scheduled_date && $this->scheduled_time && $this->staff_id);
    }

    public function staff(): BelongsTo
    {
        return $this->belongsTo(Staff::class);
    }
}
