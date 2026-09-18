<?php
declare(strict_types=1);

namespace App\Storage;

interface StoreInterface
{
    /** Read all records from the store (returns array of assoc arrays). */
    public function all(string $collection): array;

    /** Overwrite all records in the collection atomically. */
    public function put(string $collection, array $records): void;
}
