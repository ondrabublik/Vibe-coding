<?php
declare(strict_types=1);

namespace App\Controller;

use App\Core\{Request, Response, View, Session, Csrf};
use App\Service\AuthService;
use App\Storage\JsonFileStore;
use App\Repository\UserRepository;

class AuthController
{
    private function service(): AuthService
    {
        $store = new JsonFileStore(DATA_DIR);
        return new AuthService(new UserRepository($store));
    }

    public function loginForm(Request $request): void
    {
        if (Session::isLoggedIn()) Response::redirect('/');
        echo View::render('auth/login', ['pageTitle' => 'Přihlášení', 'error' => null]);
    }

    public function login(Request $request): void
    {
        Csrf::checkPost();
        $email    = (string)$request->post('email', '');
        $password = (string)$request->post('password', '');
        $error    = $this->service()->login($email, $password);
        if ($error) {
            echo View::render('auth/login', ['pageTitle' => 'Přihlášení', 'error' => $error]);
            return;
        }
        Response::redirect('/');
    }

    public function registerForm(Request $request): void
    {
        if (Session::isLoggedIn()) Response::redirect('/');
        echo View::render('auth/register', ['pageTitle' => 'Registrace', 'error' => null, 'old' => []]);
    }

    public function register(Request $request): void
    {
        Csrf::checkPost();
        $data  = [
            'email'    => (string)$request->post('email', ''),
            'name'     => (string)$request->post('name', ''),
            'phone'    => (string)$request->post('phone', ''),
            'password' => (string)$request->post('password', ''),
        ];
        $svc   = $this->service();
        $error = $svc->register($data['email'], $data['name'], $data['phone'], $data['password']);
        if ($error) {
            echo View::render('auth/register', ['pageTitle' => 'Registrace', 'error' => $error, 'old' => $data]);
            return;
        }
        // Auto-login after registration
        $svc->login($data['email'], $data['password']);
        Session::flash('success', 'Vítejte! Registrace proběhla úspěšně.');
        Response::redirect('/');
    }

    public function logout(Request $request): void
    {
        Csrf::checkPost();
        $this->service()->logout();
        Response::redirect('/');
    }
}
