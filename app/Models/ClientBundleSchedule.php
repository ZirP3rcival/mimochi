<?php

namespace App\Models;

use App\Models\Concerns\RollsUpScheduleStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Collection;

class ClientBundleSchedule extends Model
{
    use RollsUpScheduleStatus;

    protected $fillable = ['client_id', 'bundle_id', 'bundle_name', 'bundle_price', 'status'];

    protected $casts = ['bundle_price' => 'decimal:2'];

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function bundle(): BelongsTo
    {
        return $this->belongsTo(Bundle::class, 'bundle_id', 'bundle_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(ClientBundleScheduleItem::class, 'client_bundle_schedule_id')->orderBy('id');
    }

    protected function rollupRows(): Collection
    {
        return $this->lines()->get();
    }
}
