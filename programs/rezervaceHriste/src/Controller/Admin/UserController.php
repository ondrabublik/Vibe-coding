<?php
declare(strict_types=1);

namespace App\Controller\Admin;

use App\Core\{Request, Response, View, Session, Csrf};
use App\Storage\JsonFileStore;
use App\Repository\UserRepository;

class UserController
{
    private function repo(): UserRepository
    {
        return new UserRepository(new JsonFileStore(DATA_DIR));
    }

    public function index(Request $request): void
    {
        echo View::render('admin/users', [
            'pageTitle' => 'Admin – Uživatelé',
            'users'     => $this->repo()->all(),
        ]);
    }

    public function save(Request $request): void
    {
        Csrf::checkPost();
        $repo   = $this->repo();
        $id     = (string)$request->post('id', '');
        $action = (string)$request->post('action', '');

        $user = $repo->findById($id);
        if (!$user) {
            Session::flash('error', 'Uživatel nenalezen.');
            Response::redirect('/admin/users');
        }

        switch ($action) {
            case 'toggle_role':
                $newRole = ($user['role'] === 'admin') ? 'user' : 'admin';
                if ($newRole === 'user' && $repo->countAdmins() <= 1) {
                    Session::flash('error', 'Nelze odebrat roli poslednímu adminovi.');
                    break;
                }
                $repo->update($id, ['role' => $newRole]);
                Session::flash('success', 'Role byla změněna.');
                break;

            case 'toggle_active':
                $currentUserId = Session::userId();
                if ($id === $currentUserId) {
                    Session::flash('error', 'Nemůžete deaktivovat vlastní účet.');
                    break;
                }
                $repo->update($id, ['active' => !($user['active'] ?? true)]);
                Session::flash('success', 'Stav účtu byl změněn.');
                break;

            case 'reset_password':
                $pwd = (string)$request->post('new_password', '');
                if (mb_strlen($pwd) < 6) {
                    Session::flash('error', 'Heslo musí mít alespoň 6 znaků.');
                    break;
                }
                $repo->update($id, ['passwordHash' => password_hash($pwd, PASSWORD_BCRYPT)]);
                Session::flash('success', 'Heslo bylo změněno.');
                break;

            default:
                Session::flash('error', 'Neznámá akce.');
        }
        Response::redirect('/admin/users');
    }
}
