<?php

namespace App\Http\Controllers;

use App\Models\Voucher;
use App\Models\VoucherBatch;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class VoucherController extends Controller
{
    private const PER_PAGE = 10;

    /** Most vouchers one filing can hold (a range or a pasted list). */
    private const MAX_VOUCHERS = 1000;

    /** Letters, digits, - _ . only; starts with a letter or digit. */
    private const BARCODE_PATTERN = '/^[A-Za-z0-9][A-Za-z0-9\-_.]{0,59}$/';

    /**
     * GET /vouchers?search=term&page=2
     * Search matches the customer / business name or any barcode.
     */
    public function index(Request $request)
    {
        $search = trim((string) $request->query('search', ''));

        $query = VoucherBatch::query()->withCount([
            'vouchers as used_count' => fn ($q) => $q->where('status', 'used'),
        ]);

        if ($search !== '') {
            $term = '%' . $this->escapeLike($search) . '%'; // bound parameter, wildcards escaped

            $query->where(function ($q) use ($term) {
                $q->where('customer_name', 'like', $term)
                  ->orWhereHas('vouchers', fn ($v) => $v->where('barcode', 'like', $term));
            });
        }

        $paginator = $query->orderByDesc('issued_date')->orderByDesc('id')->paginate(self::PER_PAGE);

        return response()->json([
            'vouchers' => collect($paginator->items())->map(fn ($b) => $this->present($b))->values(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'per_page'     => $paginator->perPage(),
                'total'        => $paginator->total(),
            ],
        ]);
    }

    /** GET /vouchers/{voucherBatch} - the individual vouchers of one filing. */
    public function show(VoucherBatch $voucherBatch)
    {
        return response()->json([
            'voucher' => $this->present($voucherBatch->loadCount([
                'vouchers as used_count' => fn ($q) => $q->where('status', 'used'),
            ])),
            'items' => $voucherBatch->vouchers()->orderBy('id')->get()->map(fn ($v) => [
                'id'      => $v->id,
                'barcode' => $v->barcode,
                'amount'  => (float) $v->amount,
                'status'  => $v->status,
                'used_at' => $v->used_at?->timezone('Asia/Manila')->format('M j, Y g:i A'),
            ])->values(),
        ]);
    }

    /** POST /vouchers - file a range or a list of individual vouchers. */
    public function store(Request $request)
    {
        $data = $request->validate([
            'customer_name'      => 'required|string|max:255',
            'mode'               => 'required|in:range,individual',
            'barcode_from'       => 'required_if:mode,range|nullable|string|max:60',
            'barcode_to'         => 'required_if:mode,range|nullable|string|max:60',
            'barcodes'           => 'required_if:mode,individual|nullable|string|max:60000',
            'issued_date'        => 'required|date_format:Y-m-d',
            'amount_per_voucher' => 'required|numeric|gt:0|max:99999999.99',
            'remarks'            => 'nullable|string|max:1000',
        ]);

        $codes = $data['mode'] === 'range'
            ? $this->expandRange(trim($data['barcode_from']), trim($data['barcode_to']))
            : $this->parseList($data['barcodes']);

        $this->assertNotFiled($codes);

        $cents = (int) round(((float) $data['amount_per_voucher']) * 100);
        $qty   = count($codes);

        try {
            $batch = DB::transaction(function () use ($data, $codes, $cents, $qty) {
                $batch = VoucherBatch::create([
                    'customer_name'      => trim($data['customer_name']),
                    'barcode_mode'       => $data['mode'],
                    'barcode_from'       => $codes[0],
                    'barcode_to'         => $qty > 1 ? $codes[$qty - 1] : null,
                    'quantity'           => $qty,
                    'amount_per_voucher' => $cents / 100,
                    'total_amount'       => ($cents * $qty) / 100,
                    'issued_date'        => $data['issued_date'],
                    'remarks'            => $data['remarks'] ?? null,
                    'staff_id'           => Auth::guard('staff')->id(),
                ]);

                $now = now();
                foreach (array_chunk($codes, 500) as $chunk) {
                    Voucher::insert(array_map(fn ($code) => [
                        'voucher_batch_id' => $batch->id,
                        'barcode'          => $code,
                        'amount'           => $cents / 100,
                        'status'           => 'unused',
                        'created_at'       => $now,
                        'updated_at'       => $now,
                    ], $chunk));
                }

                return $batch;
            });
        } catch (QueryException $e) {
            // Someone filed the same barcode between the check above and the insert.
            if (($e->errorInfo[0] ?? null) === '23000') {
                throw ValidationException::withMessages(['barcodes' => 'One of these barcodes was just filed by someone else. Please check and try again.']);
            }
            throw $e;
        }

        $batch->used_count = 0;

        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Voucher filed successfully.',
                'voucher' => $this->present($batch),
            ], 201);
        }

        return redirect()->back()->with('success', 'Voucher filed successfully.');
    }

    /** PUT /vouchers/{voucherBatch} - name, issued date and remarks only. */
    public function update(Request $request, VoucherBatch $voucherBatch)
    {
        $data = $request->validate([
            'customer_name' => 'required|string|max:255',
            'issued_date'   => 'required|date_format:Y-m-d',
            'remarks'       => 'nullable|string|max:1000',
        ]);

        $voucherBatch->update([
            'customer_name' => trim($data['customer_name']),
            'issued_date'   => $data['issued_date'],
            'remarks'       => $data['remarks'] ?? null,
        ]);

        $voucherBatch->loadCount(['vouchers as used_count' => fn ($q) => $q->where('status', 'used')]);

        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Voucher updated successfully.',
                'voucher' => $this->present($voucherBatch),
            ]);
        }

        return redirect()->back()->with('success', 'Voucher updated successfully.');
    }

    /** DELETE /vouchers/{voucherBatch} - refused once any voucher has been used. */
    public function destroy(Request $request, VoucherBatch $voucherBatch)
    {
        if ($voucherBatch->vouchers()->where('status', 'used')->exists()) {
            $message = 'This filing has vouchers that were already used, so it cannot be deleted.';

            if ($request->wantsJson()) {
                return response()->json(['message' => $message], 422);
            }

            return redirect()->back()->withErrors(['voucher' => $message]);
        }

        $voucherBatch->delete(); // its vouchers go with it (cascade)

        if ($request->wantsJson()) {
            return response()->json(['message' => 'Voucher deleted successfully.']);
        }

        return redirect()->back()->with('success', 'Voucher deleted successfully.');
    }

    // ------------------------------------------------------------------

    private function present(VoucherBatch $b): array
    {
        return [
            'id'                 => $b->id,
            'customer_name'      => $b->customer_name,
            'barcode_mode'       => $b->barcode_mode,
            'barcode_from'       => $b->barcode_from,
            'barcode_to'         => $b->barcode_to,
            'quantity'           => (int) $b->quantity,
            'amount_per_voucher' => (float) $b->amount_per_voucher,
            'total_amount'       => (float) $b->total_amount,
            'issued_date'        => $b->issued_date?->toDateString(),
            'remarks'            => $b->remarks,
            'used_count'         => (int) ($b->used_count ?? 0),
        ];
    }

    /**
     * MV-0001 .. MV-0100  ->  every code in between. Both ends must share the
     * same text before the trailing number; leading zeros are kept.
     */
    private function expandRange(string $from, string $to): array
    {
        foreach (['barcode_from' => $from, 'barcode_to' => $to] as $field => $code) {
            if (! preg_match(self::BARCODE_PATTERN, $code) || ! preg_match('/^(.*?)(\d+)$/', $code)) {
                throw ValidationException::withMessages([$field => 'A barcode must end with a number (letters, digits, - _ . only), e.g. MV-0001.']);
            }
        }

        preg_match('/^(.*?)(\d+)$/', $from, $a);
        preg_match('/^(.*?)(\d+)$/', $to, $b);

        if ($a[1] !== $b[1]) {
            throw ValidationException::withMessages(['barcode_to' => 'Both barcodes must start with the same text, e.g. MV-0001 and MV-0100.']);
        }

        if (strlen($a[2]) > 15 || strlen($b[2]) > 15) {
            throw ValidationException::withMessages(['barcode_to' => 'The number part of a barcode can have at most 15 digits.']);
        }

        $start = (int) $a[2];
        $end   = (int) $b[2];

        if ($end < $start) {
            throw ValidationException::withMessages(['barcode_to' => 'The last barcode must not be lower than the first.']);
        }

        if ($end - $start + 1 > self::MAX_VOUCHERS) {
            throw ValidationException::withMessages(['barcode_to' => 'A range can hold at most ' . self::MAX_VOUCHERS . ' vouchers.']);
        }

        $width = strlen($a[2]);
        $codes = [];

        for ($n = $start; $n <= $end; $n++) {
            $codes[] = $a[1] . str_pad((string) $n, $width, '0', STR_PAD_LEFT);
        }

        return $codes;
    }

    /** Individual barcodes, separated by new lines, commas or spaces. */
    private function parseList(string $text): array
    {
        $codes = array_values(array_unique(array_filter(
            preg_split('/[\s,;]+/', trim($text)),
            fn ($c) => $c !== ''
        )));

        if (! $codes) {
            throw ValidationException::withMessages(['barcodes' => 'Enter at least one barcode.']);
        }

        if (count($codes) > self::MAX_VOUCHERS) {
            throw ValidationException::withMessages(['barcodes' => 'You can file at most ' . self::MAX_VOUCHERS . ' vouchers at a time.']);
        }

        foreach ($codes as $code) {
            if (! preg_match(self::BARCODE_PATTERN, $code)) {
                throw ValidationException::withMessages(['barcodes' => "\"{$code}\" is not a valid barcode (letters, digits, - _ . only, up to 60 characters)."]);
            }
        }

        return $codes;
    }

    /** No barcode may already be filed, in this or any earlier voucher. */
    private function assertNotFiled(array $codes): void
    {
        $taken = [];

        foreach (array_chunk($codes, 500) as $chunk) {
            $taken = array_merge($taken, Voucher::whereIn('barcode', $chunk)->pluck('barcode')->all());
        }

        if ($taken) {
            $shown = implode(', ', array_slice($taken, 0, 5));
            $more  = count($taken) > 5 ? ' and ' . (count($taken) - 5) . ' more' : '';

            throw ValidationException::withMessages([
                'barcodes' => "These barcodes are already filed: {$shown}{$more}.",
            ]);
        }
    }

    private function escapeLike(string $value): string
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $value);
    }
}
