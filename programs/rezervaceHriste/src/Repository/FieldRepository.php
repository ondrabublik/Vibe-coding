<?php
declare(strict_types=1);

namespace App\Repository;

class FieldRepository extends BaseRepository
{
    protected string $collection = 'fields';
    protected string $prefix     = 'f';

    public function active(): array
    {
        return array_values(array_filter($this->all(), fn($r) => $r['active'] ?? true));
    }

    public function create(array $data): array
    {
        $all   = $this->active();
        $maxOrder = empty($all) ? 0 : max(array_column($all, 'order'));
        $record = array_merge([
            'id'                  => $this->nextId(),
            'name'                => '',
            'order'               => $maxOrder + 1,
            'halvesEnabled'       => false,
            'halfLabels'          => ['A' => 'Polovina A', 'B' => 'Polovina B'],
            'openingHoursOverride'=> null,
            'autumnFrom'          => null,
            'autumnTo'            => null,
            'springFrom'          => null,
            'springTo'            => null,
            'active'              => true,
        ], $data);
        return $this->save($record);
    }

    public function update(string $id, array $data): ?array
    {
        $record = $this->findById($id);
        if (!$record) return null;
        return $this->save(array_merge($record, $data));
    }

    public function deactivate(string $id): void
    {
        $this->update($id, ['active' => false]);
    }

    public function hardDelete(string $id): void
    {
        $this->deleteById($id);
    }
}
