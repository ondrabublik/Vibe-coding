<?php
declare(strict_types=1);

namespace App\Service;

use App\Repository\UserRepository;
use App\Core\Session;

class AuthService
{
    public function __construct(private UserRepository $users) {}

    /** Returns error string or null on success. */
    public function register(string $email, string $name, string $phone, string $password): ?string
    {
        $email = strtolower(trim($email));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) return 'Neplatný e-mail.';
        if (mb_strlen($name) < 2) return 'Jméno musí mít alespoň 2 znaky.';
        if (mb_strlen($password) < 6) return 'Heslo musí mít alespoň 6 znaků.';
        if ($this->users->emailExists($email)) return 'Tento e-mail je již registrován.';

        $this->users->create([
            'email'        => $email,
            'name'         => trim($name),
            'phone'        => trim($phone),
            'passwordHash' => password_hash($password, PASSWORD_BCRYPT),
            'role'         => 'user',
            'active'       => true,
        ]);
        return null;
    }

    /** Returns error string or null on success (and sets session). */
    public function login(string $email, string $password): ?string
    {
        $email = strtolower(trim($email));
        $user  = $this->users->findByEmail($email);
        if (!$user) return 'Nesprávný e-mail nebo heslo.';
        if (!($user['active'] ?? true)) return 'Účet je deaktivován.';
        if (!password_verify($password, $user['passwordHash'])) return 'Nesprávný e-mail nebo heslo.';

        session_regenerate_id(true);
        Session::set('user_id',   $user['id']);
        Session::set('user_role', $user['role']);
        Session::set('user_name', $user['name']);
        return null;
    }

    public function logout(): void
    {
        Session::destroy();
    }
}
