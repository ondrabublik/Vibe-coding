<?php
declare(strict_types=1);

namespace App\Repository;

use App\Storage\StoreInterface;

class SettingsRepository
{
    private StoreInterface $store;
    private const COLLECTION = 'settings';

    public function __construct(StoreInterface $store)
    {
        $this->store = $store;
    }

    public function get(): array
    {
        $rows = $this->store->all(self::COLLECTION);
        return $rows[0] ?? $this->defaults();
    }

    public function save(array $settings): void
    {
        $merged = array_merge($this->defaults(), $settings);
        $this->store->put(self::COLLECTION, [$merged]);
    }

    public function defaults(): array
    {
        return [
            'slotMinutes'       => 30,
            'openingHours'      => [
                'mon' => ['from' => '08:00', 'to' => '22:00', 'closed' => false],
                'tue' => ['from' => '08:00', 'to' => '22:00', 'closed' => false],
                'wed' => ['from' => '08:00', 'to' => '22:00', 'closed' => false],
                'thu' => ['from' => '08:00', 'to' => '22:00', 'closed' => false],
                'fri' => ['from' => '08:00', 'to' => '22:00', 'closed' => false],
                'sat' => ['from' => '09:00', 'to' => '21:00', 'closed' => false],
                'sun' => ['from' => '09:00', 'to' => '20:00', 'closed' => false],
            ],
            'maxAdvanceDays'    => 60,
            'minSlots'          => 1,
            'maxSlots'          => 8,
            'maxRecurrenceWeeks'=> 26,
            'timezone'          => 'Europe/Prague',
        ];
    }
}
