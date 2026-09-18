<?php
declare(strict_types=1);

namespace App\Service;

use App\Repository\{ReservationRepository, FieldRepository, SettingsRepository};
use App\Domain\{SlotCalculator, RecurrenceExpander, CollisionChecker, ReservationStyle, Season};

class ReservationService
{
    public function __construct(
        private ReservationRepository $reservations,
        private FieldRepository       $fields,
        private SettingsRepository    $settings,
    ) {}

    /**
     * Validate and create reservations.
     * Returns ['ok'=>true, 'reservations'=>[...]]
     *      or ['ok'=>false, 'error'=>'...']
     *      or ['ok'=>false, 'collisions'=>[...], 'collision_dates'=>[...], 'proposed'=>[...]]
     *
     * When $skipCollisions=true, colliding dates are skipped and the rest are saved.
     */
    public function create(array $input, bool $skipCollisions = false): array
    {
        $fieldId    = $input['fieldId']    ?? '';
        $part       = $input['part']       ?? 'full';
        $date       = $input['date']       ?? '';
        $start      = substr(trim((string)($input['start'] ?? '')), 0, 5);
        $end        = substr(trim((string)($input['end'] ?? '')), 0, 5);
        $note       = mb_substr(trim((string)($input['note'] ?? '')), 0, 80);
        $color      = ReservationStyle::sanitize($input['color'] ?? null);
        $recurrence = $input['recurrence'] ?? null;
        $userId     = $input['userId']     ?? '';

        // Validate field
        $field = $this->fields->findById($fieldId);
        if (!$field || !($field['active'] ?? true)) {
            return ['ok' => false, 'error' => 'Hřiště nenalezeno.'];
        }

        // Validate part
        if (!in_array($part, ['full', 'A', 'B'], true)) {
            return ['ok' => false, 'error' => 'Neplatná část hřiště.'];
        }
        if ($part !== 'full' && !($field['halvesEnabled'] ?? false)) {
            return ['ok' => false, 'error' => 'Toto hřiště nepodporuje rezervaci poloviny.'];
        }

        $cfg = $this->settings->get();
        $slotMin = (int)($cfg['slotMinutes'] ?? 30);
        $override = $field['openingHoursOverride'] ?? null;

        // Validate times
        if (!preg_match('/^\d{2}:\d{2}$/', $start) || !preg_match('/^\d{2}:\d{2}$/', $end)) {
            return ['ok' => false, 'error' => 'Neplatný formát času.'];
        }
        if (!SlotCalculator::isOnGrid($start, $slotMin) || !SlotCalculator::isOnGrid($end, $slotMin)) {
            return ['ok' => false, 'error' => "Čas musí být na {$slotMin}minutové mřížce."];
        }
        $startMin = SlotCalculator::timeToMinutes($start);
        $endMin   = SlotCalculator::timeToMinutes($end);
        if ($endMin <= $startMin) {
            return ['ok' => false, 'error' => 'Konec musí být po začátku.'];
        }
        $durationSlots = ($endMin - $startMin) / $slotMin;
        $minSlots = (int)($cfg['minSlots'] ?? 1);
        $maxSlots = (int)($cfg['maxSlots'] ?? 8);
        if ($durationSlots < $minSlots) {
            $minMin = $minSlots * $slotMin;
            return ['ok' => false, 'error' => "Rezervace je příliš krátká. Minimální délka je {$minMin} minut."];
        }
        if ($durationSlots > $maxSlots) {
            $maxMin = $maxSlots * $slotMin;
            return ['ok' => false, 'error' => "Rezervace je příliš dlouhá. Maximální délka jednoho termínu je {$maxMin} minut."];
        }

        // Validate date
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            return ['ok' => false, 'error' => 'Neplatné datum.'];
        }
        $today = date('Y-m-d');
        if ($date < $today) {
            return ['ok' => false, 'error' => 'Nelze rezervovat v minulosti.'];
        }

        $season = Season::fromField($field);
        if ($season && !$season->contains($date)) {
            return ['ok' => false, 'error' => 'Zvolené datum je mimo sezónu hřiště (' . $season->label() . ').'];
        }
        if (!$season) {
            $maxDate = date('Y-m-d', strtotime("+{$cfg['maxAdvanceDays']} days"));
            if ($date > $maxDate) {
                return ['ok' => false, 'error' => "Rezervace je možná nejvýše {$cfg['maxAdvanceDays']} dní dopředu."];
            }
        }

        // Validate opening hours for base date
        if (!SlotCalculator::isWithinOpeningHours($date, $start, $end, $cfg, $override)) {
            return ['ok' => false, 'error' => 'Zvolený čas je mimo provozní dobu hřiště.'];
        }

        // Resolve recurrence until-date
        $maxWeeks = (int)($cfg['maxRecurrenceWeeks'] ?? 26);
        $seasonScope = null;
        if ($recurrence && ($recurrence['type'] ?? '') === 'weekly') {
            $mode  = Season::normalizeScope((string)($recurrence['mode'] ?? 'until_date'));
            $until = (string)($recurrence['until'] ?? '');

            if (in_array($mode, ['autumn_season', 'spring_season', 'both_seasons'], true)) {
                if (!$season) {
                    return ['ok' => false, 'error' => 'Sezóna hřiště není nastavena. Zvolte datum konce, nebo nastavte sezónu v administraci.'];
                }
                $seasonScope = $mode;
                $until = $season->scopeUntil($mode);
                if (!$until) {
                    $label = match ($mode) {
                        'autumn_season' => 'podzimní sezóna',
                        'spring_season' => 'jarní sezóna',
                        default         => 'sezóna',
                    };
                    return ['ok' => false, 'error' => "Zvolená {$label} není u hřiště nastavena."];
                }
                if (!$season->scopeHasRemaining($mode, $date)) {
                    $msg = match ($mode) {
                        'autumn_season' => 'Podzimní sezóna k tomuto datu už neběží. Zvolte jarní sezónu, nebo konkrétní datum.',
                        'spring_season' => 'Jarní sezóna k tomuto datu už neběží. Zvolte konkrétní datum.',
                        default         => 'Ve zvolených sezónách už k tomuto datu nezbývají termíny.',
                    };
                    return ['ok' => false, 'error' => $msg];
                }
            }

            if (!Season::isDate((string)$until) || $until < $date) {
                return ['ok' => false, 'error' => 'Datum konce opakování je neplatné.'];
            }
            $seasonEnd = $season?->lastDate();
            if ($seasonEnd && $until > $seasonEnd) {
                $until = $seasonEnd;
            }
            if ($mode === 'until_date' && !$season) {
                $maxUntil = date('Y-m-d', strtotime("+{$maxWeeks} weeks", strtotime($date)));
                if ($until > $maxUntil) {
                    return ['ok' => false, 'error' => "Opakování může být nejvýše {$maxWeeks} týdnů."];
                }
            }

            $recurrence['until'] = $until;
            $recurrence['mode']  = $mode;
            $spanWeeks = (int)ceil((strtotime($until) - strtotime($date)) / 604800) + 2;
            $maxWeeks  = min(104, max($maxWeeks, $spanWeeks));
        }

        // Expand dates
        $dates = RecurrenceExpander::expand($date, $recurrence, $maxWeeks);

        // Build proposed list (filter out dates outside opening hours / chosen season)
        $proposed = [];
        foreach ($dates as $d) {
            if ($season) {
                if ($seasonScope) {
                    if (!$season->scopeContains($d, $seasonScope)) continue;
                } elseif (!$season->contains($d)) {
                    continue;
                }
            }
            if (!SlotCalculator::isWithinOpeningHours($d, $start, $end, $cfg, $override)) continue;
            $proposed[] = ['fieldId' => $fieldId, 'part' => $part, 'date' => $d, 'start' => $start, 'end' => $end];
        }

        if (empty($proposed)) {
            if ($seasonScope === 'autumn_season') {
                return ['ok' => false, 'error' => 'V podzimní sezóně není žádný volný termín v provozní době.'];
            }
            if ($seasonScope === 'spring_season') {
                return ['ok' => false, 'error' => 'V jarní sezóně není žádný volný termín v provozní době.'];
            }
            if ($seasonScope === 'both_seasons') {
                return ['ok' => false, 'error' => 'V podzimní ani jarní sezóně není žádný volný termín v provozní době.'];
            }
            return ['ok' => false, 'error' => 'Žádný z termínů nespadá do provozní doby.'];
        }

        // Check collisions
        $existing   = $this->reservations->active();
        $collisions = CollisionChecker::findCollisions($proposed, $existing);

        if (!empty($collisions) && !$skipCollisions) {
            $colDates = array_unique(array_map(fn($c) => $c['proposed']['date'], $collisions));
            sort($colDates);
            return [
                'ok'              => false,
                'collisions'      => $collisions,
                'collision_dates' => $colDates,
                'proposed'        => $input,
            ];
        }

        // Remove colliding dates if skip requested
        if ($skipCollisions && !empty($collisions)) {
            $colDates = array_unique(array_map(fn($c) => $c['proposed']['date'], $collisions));
            $proposed = array_values(array_filter($proposed, fn($p) => !in_array($p['date'], $colDates)));
        }

        if (empty($proposed)) {
            return ['ok' => false, 'error' => 'Všechny termíny kolidují. Žádná rezervace nebyla uložena.'];
        }

        // Build records and save
        $seriesId = (count($proposed) > 1) ? 'series_' . uniqid() : null;
        $toCreate = [];
        foreach ($proposed as $p) {
            $toCreate[] = [
                'seriesId'   => $seriesId,
                'fieldId'    => $p['fieldId'],
                'part'       => $p['part'],
                'userId'     => $userId,
                'date'       => $p['date'],
                'start'      => $p['start'],
                'end'        => $p['end'],
                'recurrence' => $recurrence,
                'note'       => $note,
                'color'      => $color,
                'status'     => 'active',
                'createdAt'  => date('c'),
            ];
        }
        $created = $this->reservations->createMany($toCreate);
        return ['ok' => true, 'reservations' => $created];
    }

    public function cancel(string $id, string $userId, bool $isAdmin): array
    {
        $r = $this->reservations->findById($id);
        if (!$r) return ['ok' => false, 'error' => 'Rezervace nenalezena.'];
        if (!$isAdmin && $r['userId'] !== $userId) return ['ok' => false, 'error' => 'Přístup zamítnut.'];
        $this->reservations->cancel($id);
        return ['ok' => true];
    }

    public function cancelSeries(string $seriesId, string $userId, bool $isAdmin): array
    {
        $active = $this->reservations->active();
        $series = array_filter($active, fn($r) => $r['seriesId'] === $seriesId);
        if (empty($series)) return ['ok' => false, 'error' => 'Série nenalezena.'];
        if (!$isAdmin) {
            foreach ($series as $r) {
                if ($r['userId'] !== $userId) return ['ok' => false, 'error' => 'Přístup zamítnut.'];
            }
        }
        $this->reservations->cancelSeries($seriesId);
        return ['ok' => true];
    }

    public function updateAppearance(array $input, string $userId, bool $isAdmin): array
    {
        $id       = (string)($input['id'] ?? '');
        $scope    = (string)($input['scope'] ?? 'one');
        $note     = mb_substr(trim((string)($input['note'] ?? '')), 0, 80);
        $color    = ReservationStyle::sanitize($input['color'] ?? null);

        $r = $this->reservations->findById($id);
        if (!$r || ($r['status'] ?? '') !== 'active') {
            return ['ok' => false, 'error' => 'Rezervace nenalezena.'];
        }
        if (!$isAdmin && $r['userId'] !== $userId) {
            return ['ok' => false, 'error' => 'Přístup zamítnut.'];
        }

        if ($scope === 'series' && !empty($r['seriesId'])) {
            $this->reservations->updateSeriesAppearance($r['seriesId'], $note, $color);
        } else {
            $this->reservations->update($id, ['note' => $note, 'color' => $color]);
        }
        return ['ok' => true];
    }
}
