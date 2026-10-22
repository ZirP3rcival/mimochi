<?php

namespace App\Http\Controllers;

use App\Models\DailyTimeRecord;
use App\Models\Staff;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;

/**
 * Public kiosk endpoints for the Daily Time Record (time in / out).
 * Every timestamp comes from the SERVER clock; the browser's clock is never trusted.
 */
class DtrController extends Controller
{
    // DTR always runs on this timezone, whatever APP_TIMEZONE is set to
    // (a server left on UTC would otherwise record 3:09 PM as 07:09 AM
    // and compute late / overtime against the wrong clock).
    private const TIMEZONE = 'Asia/Manila';

    // Schedule rules (minutes are counted from these clock times)
    private const LATE_AFTER = '10:00:00';      // 10:00 AM
    private const OVERTIME_AFTER = '20:00:00';  // 8:00 PM (end of the 10:00 AM - 8:00 PM schedule)
    private const TIME_IN_CUTOFF = '20:00:00'; // no new time in at or after this

    /** Authoritative server time. The page ticks from this, not from the PC clock. */
    public function time(): JsonResponse
    {
        $now = $this->now();

        return response()->json([
            'epoch_ms' => (int) $now->valueOf(),
            'timezone' => self::TIMEZONE,
        ])->header('Cache-Control', 'no-store');
    }

    /** Staff names for the dropdown. */
    public function staff(): JsonResponse
    {
        // Display name = staff_name (never the username).
        $list = Staff::query()
            ->where('active', true)
            ->where('user_type', '!=', 'admin') // admin accounts don't use the DTR
            ->orderBy('staff_name')
            ->get(['id', 'staff_name'])
            ->map(fn ($s) => ['id' => $s->id, 'name' => $s->staff_name])
            ->values();

        return response()->json($list);
    }

    /**
     * Today's latest punch for a staff member so the UI can enable the right
     * button. TIME IN needs the latest punch to be closed (or none yet);
     * TIME OUT needs it to still be open.
     */
    public function status(Request $request): JsonResponse
    {
        $request->validate(['staff_id' => ['required', 'integer']]);

        $q = DailyTimeRecord::where('staff_id', $request->staff_id)
            ->whereDate('record_date', $this->now()->toDateString());

        $latest = (clone $q)->latest('id')->first();

        return response()->json([
            'time_in'  => $latest?->time_in,
            'time_out' => $latest?->time_out,
            'punches'  => $q->count(),
        ]);
    }

    public function timeIn(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $now = $this->now();
        $today = $now->toDateString();

        // No new time in from 8:00 PM onwards.
        if ($now->greaterThanOrEqualTo($now->copy()->setTimeFromTimeString(self::TIME_IN_CUTOFF))) {
            return response()->json(['message' => 'Time in is not allowed after 8:00 PM.'], 422);
        }

        // A new time in is only allowed once the current one has been timed out.
        $open = DailyTimeRecord::where('staff_id', $data['staff_id'])
            ->whereDate('record_date', $today)
            ->whereNull('time_out')
            ->latest('id')->first();

        if ($open) {
            return response()->json(['message' => 'Already timed in at ' . $this->fmt($open->time_in) . '. Time out first.'], 422);
        }

        // Late is measured against 10:00 AM on the first time in of the day only.
        $isFirstToday = ! DailyTimeRecord::where('staff_id', $data['staff_id'])
            ->whereDate('record_date', $today)->exists();

        $path = $this->storeImage($request, $data['staff_id'], 'in', $now);

        $rec = DailyTimeRecord::create([
            'staff_id'      => $data['staff_id'],
            'staff_name'    => $data['staff']->staff_name,
            'record_date'   => $today,
            'time_in'       => $now->format('H:i:s'),
            'late'          => $isFirstToday ? $this->minutesAfter($now, self::LATE_AFTER) : 0,
            'time_in_image' => $path,
            'ip_address'    => $request->ip(),
        ]);

        // They came back, so earlier early time-outs today are not undertime:
        // undertime only stands on the day's last time out.
        DailyTimeRecord::where('staff_id', $data['staff_id'])
            ->whereDate('record_date', $today)
            ->where('undertime', '>', 0)
            ->update(['undertime' => 0]);

        return response()->json([
            'message' => 'Time in recorded at ' . $this->fmt($rec->time_in) . '.'
                . ($rec->late > 0 ? " Late by {$rec->late} min." : ''),
            'time_in' => $rec->time_in,
        ]);
    }

    public function timeOut(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $now = $this->now();

        // The open punch (timed in, not yet timed out) for today.
        $rec = DailyTimeRecord::where('staff_id', $data['staff_id'])
            ->whereDate('record_date', $now->toDateString())
            ->whereNotNull('time_in')
            ->whereNull('time_out')
            ->latest('id')->first();

        if (! $rec) {
            return response()->json(['message' => 'No open time in found. Time in first.'], 422);
        }

        $rec->update([
            'time_out'       => $now->format('H:i:s'),
            'overtime'       => $this->minutesAfter($now, self::OVERTIME_AFTER),   // after 8:00 PM
            'undertime'      => $this->minutesBefore($now, self::OVERTIME_AFTER),  // before 8:00 PM
            'work_minutes'   => $this->minutesWorked($rec->time_in, $now),         // time in -> time out
            'time_out_image' => $this->storeImage($request, $data['staff_id'], 'out', $now),
        ]);

        return response()->json([
            'message'  => 'Time out recorded at ' . $this->fmt($rec->time_out) . '.'
                . ($rec->overtime > 0 ? " Overtime: {$rec->overtime} min." : '')
                . " Worked {$rec->work_minutes} min."
                . ($rec->undertime > 0 ? " Undertime: {$rec->undertime} min." : ''),
            'time_out' => $rec->time_out,
        ]);
    }

    // ---------------------------------------------------------------

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'staff_id' => ['required', 'integer'],
            'image'    => ['required', 'file', 'mimes:jpg,jpeg,png', 'max:4096'],
        ]);

        $staff = Staff::whereKey($data['staff_id'])
            ->where('active', true)
            ->where('user_type', '!=', 'admin')
            ->first();
        abort_unless($staff, 422, 'Unknown staff member.');
        $data['staff'] = $staff;

        return $data;
    }

    /** Saves to public/storage/dtr/YYYY-MM-DD/ and returns the path relative to /public. */
    private function storeImage(Request $request, int $staffId, string $type, Carbon $now): string
    {
        $dir = 'storage/dtr/' . $now->format('Y-m-d');
        File::ensureDirectoryExists(public_path($dir), 0755, true);

        $name = "{$staffId}_{$type}_" . $now->format('His') . '.jpg';
        $request->file('image')->move(public_path($dir), $name);

        return "$dir/$name";
    }

    private function displayName($s): string
    {
        return $s->staff_name;
    }

    /** Whole minutes between $cutoff (H:i:s, same day) and $now; 0 if $now is not past it. */
    private function minutesAfter(Carbon $now, string $cutoff): int
    {
        $limit = $now->copy()->setTimeFromTimeString($cutoff);

        return $now->greaterThan($limit) ? (int) floor($limit->diffInMinutes($now, true)) : 0;
    }

    /** Whole minutes between $now and $cutoff (H:i:s, same day) when $now is before it; else 0. */
    private function minutesBefore(Carbon $now, string $cutoff): int
    {
        $limit = $now->copy()->setTimeFromTimeString($cutoff);

        return $now->lessThan($limit) ? (int) floor($now->diffInMinutes($limit, true)) : 0;
    }

    /** Whole minutes from $timeIn (H:i:s, same day) to $now. */
    private function minutesWorked(string $timeIn, Carbon $now): int
    {
        $start = $now->copy()->setTimeFromTimeString($timeIn);

        return max(0, (int) floor($start->diffInMinutes($now, true)));
    }

    private function now(): Carbon
    {
        return Carbon::now(self::TIMEZONE);
    }

    private function fmt(string $time): string
    {
        return Carbon::createFromFormat('H:i:s', $time)->format('h:i:s A');
    }
}
