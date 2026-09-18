<?php
declare(strict_types=1);

namespace App\Repository;

class UserRepository extends BaseRepository
{
    protected string $collection = 'users';
    protected string $prefix     = 'u';

    public function create(array $data): array
    {
        $record = array_merge([
            'id'           => $this->nextId(),
            'email'        => '',
            'name'         => '',
            'phone'        => '',
            'passwordHash' => '',
            'role'         => 'user',
            'active'       => true,
            'createdAt'    => date('c'),
        ], $data);
        return $this->save($record);
    }

    public function update(string $id, array $data): ?array
    {
        $record = $this->findById($id);
        if (!$record) return null;
        return $this->save(array_merge($record, $data));
    }

    public function findByEmail(string $email): ?array
    {
        $email = strtolower(trim($email));
        foreach ($this->all() as $row) {
            if (strtolower($row['email'] ?? '') === $email) return $row;
        }
        return null;
    }

    public function emailExists(string $email): bool
    {
        return $this->findByEmail($email) !== null;
    }

    public function countAdmins(): int
    {
        return count(array_filter($this->all(), fn($r) => ($r['role'] ?? '') === 'admin'));
    }
}
