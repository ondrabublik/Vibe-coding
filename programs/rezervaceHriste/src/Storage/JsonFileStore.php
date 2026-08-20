<?php
declare(strict_types=1);

namespace App\Storage;

/**
 * Stores each collection as JSON in a .txt file.
 * Uses a single flock file for exclusive writes to prevent corruption.
 * Writes are atomic: write to temp file, then rename.
 */
class JsonFileStore implements StoreInterface
{
    private string $dir;
    private string $lockFile;

    public function __construct(string $dataDir)
    {
        $this->dir      = rtrim($dataDir, '/\\');
        $this->lockFile = $this->dir . DIRECTORY_SEPARATOR . '.lock';
        if (!is_dir($this->dir)) {
            mkdir($this->dir, 0750, true);
        }
        if (!file_exists($this->lockFile)) {
            file_put_contents($this->lockFile, '');
        }
    }

    public function all(string $collection): array
    {
        $file = $this->path($collection);
        if (!file_exists($file)) {
            return [];
        }
        $json = file_get_contents($file);
        if ($json === false || trim($json) === '') {
            return [];
        }
        return json_decode($json, true, 512, JSON_THROW_ON_ERROR) ?? [];
    }

    public function put(string $collection, array $records): void
    {
        $lf = fopen($this->lockFile, 'r+');
        if ($lf === false) {
            throw new \RuntimeException('Cannot open lock file');
        }
        flock($lf, LOCK_EX);
        try {
            $file = $this->path($collection);
            $tmp  = $file . '.tmp';
            $json = json_encode(array_values($records), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
            file_put_contents($tmp, $json, LOCK_EX);
            rename($tmp, $file);
        } finally {
            flock($lf, LOCK_UN);
            fclose($lf);
        }
    }

    private function path(string $collection): string
    {
        if (!preg_match('/^[a-z_]+$/', $collection)) {
            throw new \InvalidArgumentException("Invalid collection name: $collection");
        }
        return $this->dir . DIRECTORY_SEPARATOR . $collection . '.txt';
    }
}
