<?php
declare(strict_types=1);

namespace App\Repository;

class ReservationRepository extends BaseRepository
{
    protected string $collection = 'reservations';
    protected string $prefix     = 'r';

    public function create(array $data): array
    {
        $record = array_merge([
            'id'         => $this->nextId(),
            'seriesId'   => null,
            'fieldId'    => '',
            'part'       => 'full',
            'userId'     => '',
            'date'       => '',
            'start'      => '',
            'end'        => '',
            'recurrence' => null,
            'note'       => '',
            'color'      => '#1a6b3a',
            'status'     => 'active',
            'createdAt'  => date('c'),
        ], $data);
        return $this->save($record);
    }

    public function createMany(array $list): array
    {
        $created = [];
        foreach ($list as $data) {
            $data['id'] = $this->nextId();
            $created[]  = $data;
        }
        $this->saveMany($created);
        return $created;
    }

    public function cancel(string $id): void
    {
        $r = $this->findById($id);
        if ($r) {
            $this->save(array_merge($r, ['status' => 'cancelled']));
        }
    }

    public function cancelSeries(string $seriesId): void
    {
        $all = $this->all();
        foreach ($all as &$r) {
            if ($r['seriesId'] === $seriesId && $r['status'] === 'active') {
                $r['status'] = 'cancelled';
            }
        }
        unset($r);
        $this->store->put($this->collection, $all);
    }

    public function active(): array
    {
        return array_values(array_filter($this->all(), fn($r) => ($r['status'] ?? '') === 'active'));
    }

    public function forField(string $fieldId): array
    {
        return array_values(array_filter($this->active(), fn($r) => $r['fieldId'] === $fieldId));
    }

    public function forWeek(string $fieldId, string $weekStart, string $weekEnd): array
    {
        return array_values(array_filter(
            $this->forField($fieldId),
            fn($r) => $r['date'] >= $weekStart && $r['date'] <= $weekEnd
        ));
    }

    public function forUser(string $userId): array
    {
        return array_values(array_filter($this->active(), fn($r) => $r['userId'] === $userId));
    }

    public function update(string $id, array $data): ?array
    {
        $record = $this->findById($id);
        if (!$record) return null;
        return $this->save(array_merge($record, $data));
    }

    public function updateSeriesAppearance(string $seriesId, string $note, string $color): void
    {
        $all = $this->all();
        foreach ($all as &$r) {
            if (($r['seriesId'] ?? null) === $seriesId && ($r['status'] ?? '') === 'active') {
                $r['note']  = $note;
                $r['color'] = $color;
            }
        }
        unset($r);
        $this->store->put($this->collection, $all);
    }

    public function hasFutureReservations(string $fieldId): bool
    {
        $today = date('Y-m-d');
        foreach ($this->active() as $r) {
            if ($r['fieldId'] === $fieldId && $r['date'] >= $today) return true;
        }
        return false;
    }
}
