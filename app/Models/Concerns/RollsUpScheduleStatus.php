<?php

namespace App\Models\Concerns;

use Illuminate\Support\Collection;

/**
 * For parents (bundle schedule, package record) whose status is a roll-up
 * of their child rows: all done -> done, any started -> ongoing, else pending.
 */
trait RollsUpScheduleStatus
{
    /** The child rows that decide this parent's status. */
    abstract protected function rollupRows(): Collection;

    public function refreshStatus(): void
    {
        $rows = $this->rollupRows();
        $status = 'pending';

        if ($rows->isNotEmpty() && $rows->every(fn ($row) => $row->status === 'done')) {
            $status = 'done';
        } elseif ($rows->contains(fn ($row) => $row->status !== 'pending')) {
            $status = 'ongoing';
        }

        if ($this->status !== $status) {
            $this->status = $status;
            $this->save();
        }
    }
}
