<?php
declare(strict_types=1);

namespace App\Repository;

use App\Storage\StoreInterface;

abstract class BaseRepository
{
    protected StoreInterface $store;
    protected string $collection;
    protected string $prefix;   // e.g. 'u', 'f', 'r'

    public function __construct(StoreInterface $store)
    {
        $this->store = $store;
    }

    protected function nextId(): string
    {
        $counters = $this->store->all('counters');
        $map = [];
        foreach ($counters as $row) {
            $map[$row['key']] = (int)$row['value'];
        }
        $next = ($map[$this->prefix] ?? 0) + 1;
        $map[$this->prefix] = $next;
        $rows = [];
        foreach ($map as $k => $v) {
            $rows[] = ['key' => $k, 'value' => $v];
        }
        $this->store->put('counters', $rows);
        return $this->prefix . $next;
    }

    public function all(): array
    {
        return $this->store->all($this->collection);
    }

    public function findById(string $id): ?array
    {
        foreach ($this->all() as $row) {
            if (($row['id'] ?? '') === $id) return $row;
        }
        return null;
    }

    protected function save(array $record): array
    {
        $all = $this->all();
        $found = false;
        foreach ($all as &$row) {
            if ($row['id'] === $record['id']) {
                $row  = $record;
                $found = true;
                break;
            }
        }
        unset($row);
        if (!$found) {
            $all[] = $record;
        }
        $this->store->put($this->collection, $all);
        return $record;
    }

    protected function deleteById(string $id): void
    {
        $all = array_filter($this->all(), fn($r) => $r['id'] !== $id);
        $this->store->put($this->collection, array_values($all));
    }

    protected function saveMany(array $records): void
    {
        $all = $this->all();
        $indexed = [];
        foreach ($all as $r) {
            $indexed[$r['id']] = $r;
        }
        foreach ($records as $r) {
            $indexed[$r['id']] = $r;
        }
        $this->store->put($this->collection, array_values($indexed));
    }
}
