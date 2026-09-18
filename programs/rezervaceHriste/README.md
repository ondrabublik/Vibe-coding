# Rezervace fotbalových hřišť

PHP 8 rezervační systém bez frameworku a bez databáze. Data jsou uložena jako JSON v `.txt` souborech.

## Požadavky

- PHP 8.0+

## Spuštění (vývojový server)

```bash
php -S localhost:8000 -t public
```

Poté otevřete <http://localhost:8000>.

## Výchozí admin účet

| E-mail | Heslo |
|--------|-------|
| `admin@hriste.cz` | `admin123` |

**Heslo po prvním přihlášení okamžitě změňte v Admin → Uživatelé.**

## Datové soubory

Všechna data jsou v adresáři `data/`:

| Soubor | Obsah |
|--------|-------|
| `users.txt` | Uživatelé (JSON pole) |
| `fields.txt` | Hřiště (JSON pole) |
| `reservations.txt` | Rezervace (JSON pole) |
| `settings.txt` | Globální nastavení (JSON objekt) |
| `counters.txt` | Čítače ID |
| `.lock` | Soubor pro flock (nemazat) |

## Architektura

```
public/index.php       ← front controller, router
src/
  bootstrap.php        ← autoload PSR-4, session, seed
  Core/                ← Router, Request, Response, View, Session, Csrf, Config
  Storage/             ← StoreInterface, JsonFileStore (flock + atomický zápis)
  Repository/          ← UserRepository, FieldRepository, ReservationRepository, SettingsRepository
  Domain/              ← SlotCalculator, RecurrenceExpander, CollisionChecker
  Service/             ← AuthService, ReservationService, SeedService
  Controller/          ← AuthController, CalendarController, ReservationController
  Controller/Admin/    ← DashboardController, FieldController, SettingsController, UserController, ReservationController
views/                 ← PHP šablony
data/                  ← datové soubory (JSON v .txt)
```

Přechod na databázi = stačí nahradit `JsonFileStore` za implementaci `StoreInterface` komunikující s DB. Zbývající kód zůstane beze změny.

## Nasazení na Apache

- `data/` přesuňte **mimo web root** a aktualizujte konstantu `DATA_DIR` v `src/bootstrap.php`.
- Apache mod_rewrite je nastaven pomocí `public/.htaccess`.

## Funkce

- Týdenní mřížka rezervací s přepínačem hřišť a navigací týdnů
- Rezervace celého hřiště nebo poloviny (A/B) táhnutím myší
- Týdenní opakování rezervace do zadaného data
- Detekce kolizí, možnost přeskočit kolidující termíny
- Zrušení jednoho termínu nebo celé série
- Správa hřišť, nastavení provozní doby a délky slotu
- Správa uživatelů a přehled rezervací v admin sekci
- CSRF ochrana všech POST formulářů
- Responzivní design (mobile-first)
