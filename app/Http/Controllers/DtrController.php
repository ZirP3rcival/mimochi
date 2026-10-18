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
    private const OVERTIME_AFTER = '20:00:00';  // 8:00 PM

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

    /** Today's record for a staff member, so the UI can enable the right button. */
    public function status(Request $request): JsonResponse
    {
        $request->validate(['staff_id' => ['required', 'integer']]);

        $rec = DailyTimeRecord::where('staff_id', $request->staff_id)
            ->whereDate('record_date', $this->now()->toDateString())
            ->first();

        return response()->json([
            'time_in'  => $rec?->time_in,
            'time_out' => $rec?->time_out,
        ]);
    }

    public function timeIn(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $now = $this->now();

        $existing = DailyTimeRecord::where('staff_id', $data['staff_id'])
            ->whereDate('record_date', $now->toDateString())->first();

        if ($existing && $existing->time_in) {
            return response()->json(['message' => 'Already timed in today at ' . $this->fmt($existing->time_in) . '.'], 422);
        }

        $path = $this->storeImage($request, $data['staff_id'], 'in', $now);

        $rec = DailyTimeRecord::create([
            'staff_id'      => $data['staff_id'],
            'staff_name'    => $data['staff']->staff_name,
            'record_date'   => $now->toDateString(),
            'time_in'       => $now->format('H:i:s'),
            'late'          => $this->minutesAfter($now, self::LATE_AFTER),
            'time_in_image' => $path,
            'ip_address'    => $request->ip(),
        ]);

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

        $rec = DailyTimeRecord::where('staff_id', $data['staff_id'])
            ->whereDate('record_date', $now->toDateString())->first();

        if (! $rec || ! $rec->time_in) {
            return response()->json(['message' => 'No time in found for today. Time in first.'], 422);
        }
        if ($rec->time_out) {
            return response()->json(['message' => 'Already timed out today at ' . $this->fmt($rec->time_out) . '.'], 422);
        }

        $rec->update([
            'time_out'       => $now->format('H:i:s'),
            'overtime'       => $this->minutesAfter($now, self::OVERTIME_AFTER),
            'undertime'      => $this->minutesBefore($now, self::OVERTIME_AFTER),
            'time_out_image' => $this->storeImage($request, $data['staff_id'], 'out', $now),
        ]);

        return response()->json([
            'message'  => 'Time out recorded at ' . $this->fmt($rec->time_out) . '.'
                . ($rec->overtime > 0 ? " Overtime: {$rec->overtime} min." : '')
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

    /** Saves to public/uploads/dtr/YYYY-MM-DD/ and returns the path relative to /public. */
    private function storeImage(Request $request, int $staffId, string $type, Carbon $now): string
    {
        $dir = 'uploads/dtr/' . $now->format('Y-m-d');
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

    private function now(): Carbon
    {
        return Carbon::now(self::TIMEZONE);
    }

    private function fmt(string $time): string
    {
        return Carbon::createFromFormat('H:i:s', $time)->format('h:i:s A');
    }
}
