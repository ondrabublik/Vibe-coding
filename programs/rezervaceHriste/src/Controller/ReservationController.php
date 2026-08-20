<?php
declare(strict_types=1);

namespace App\Controller;

use App\Core\{Request, Response, Session, Csrf};
use App\Storage\JsonFileStore;
use App\Repository\{ReservationRepository, FieldRepository, SettingsRepository};
use App\Service\ReservationService;

class ReservationController
{
    private function service(): ReservationService
    {
        $store = new JsonFileStore(DATA_DIR);
        return new ReservationService(
            new ReservationRepository($store),
            new FieldRepository($store),
            new SettingsRepository($store),
        );
    }

    public function create(Request $request): void
    {
        // Accept both JSON body and form-encoded
        $raw = file_get_contents('php://input');
        if ($raw && str_contains($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) {
            $input = json_decode($raw, true) ?? [];
        } else {
            $input = $request->body;
        }

        // CSRF: for JSON requests the token is in X-CSRF header or body
        $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($input['_csrf'] ?? '');
        if (!\App\Core\Csrf::verify($token)) {
            Response::json(['ok' => false, 'error' => 'CSRF token mismatch'], 403);
        }

        $input['userId']      = Session::userId();
        $skipRaw              = $input['skipCollisions'] ?? false;
        $skipCollisions       = $skipRaw === true || $skipRaw === 1 || $skipRaw === '1';
        $recurrence = null;
        $mode = (string)($input['recurrence_mode'] ?? '');
        if (in_array($mode, ['until_date', 'half_season', 'full_season', 'autumn_season', 'spring_season', 'both_seasons'], true)) {
            $recurrence = [
                'type'     => 'weekly',
                'interval' => 1,
                'until'    => $input['recurrence_until'] ?? '',
                'mode'     => $mode,
            ];
        }
        $input['recurrence'] = $recurrence;

        $result = $this->service()->create($input, $skipCollisions);
        Response::json($result);
    }

    public function update(Request $request): void
    {
        $input = $this->readJsonOrForm();
        $this->assertCsrf($input);
        $result = $this->service()->updateAppearance(
            $input,
            Session::userId() ?? '',
            Session::isAdmin()
        );
        Response::json($result);
    }

    public function cancel(Request $request): void
    {
        $input = $this->readJsonOrForm();
        $this->assertCsrf($input);

        $scope    = $input['scope']    ?? 'one';
        $id       = $input['id']       ?? '';
        $seriesId = $input['seriesId'] ?? '';
        $userId   = Session::userId() ?? '';
        $isAdmin  = Session::isAdmin();
        $svc      = $this->service();

        if ($scope === 'series' && $seriesId) {
            $result = $svc->cancelSeries($seriesId, $userId, $isAdmin);
        } else {
            $result = $svc->cancel($id, $userId, $isAdmin);
        }
        Response::json($result);
    }

    private function readJsonOrForm(): array
    {
        $raw = file_get_contents('php://input');
        if ($raw && str_contains($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) {
            return json_decode($raw, true) ?? [];
        }
        return $_POST;
    }

    private function assertCsrf(array $input): void
    {
        $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($input['_csrf'] ?? '');
        if (!Csrf::verify($token)) {
            Response::json(['ok' => false, 'error' => 'CSRF token mismatch'], 403);
        }
    }
}
