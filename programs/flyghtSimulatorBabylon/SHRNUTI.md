# Dvouplošníky – shrnutí aplikace

Letecký simulátor souboje dvouplošníků z 1. světové války (Sopwith Camel proti německým stíhačkám) v prohlížeči.
Babylon.js 7 z CDN (`babylonjs@7` + `babylonjs-materials@7` kvůli SkyMaterial), žádný backend, žádný build krok,
klasické `<script>` soubory (funguje i z `file://`). Veškerý kód je v globálním jmenném prostoru `window.BW`.
Hra je zaregistrovaná v kořenovém `index.html` repozitáře (položka „Biplane dogfight“).

Spuštění: otevřít `index.html`, nebo `python -m http.server 8765` v této složce
(konfigurace `.claude/launch.json` → server `biplanes`).

## Průběh mise

1. Start na travnatém letišti (dráha podél osy +z, střed v počátku). Spolubojovníci stojí vedle hráče a startují, jakmile se rozjede.
2. Po vzletu (výška nad terénem > 40 m) se ve vzdálenosti ~3 km objeví nepřátelská letka. Na obtížnosti Veterán a Eso přiletí druhá skupina
   (po 70 s nebo když z první zbude ≤ 1 letadlo).
3. Po sestřelení všech nepřátel (fáze `rtb`) ukazatel navede na letiště. Mise je splněna po přistání na letišti a zastavení (rychlost < 1 m/s).
4. Během boje lze přistát na letišti a po zastavení se letoun opravuje.
5. Neúspěch: sestřelení, havárie (tvrdé přistání, náraz, voda, přistání v terénu nad 38 m/s), srážka s jiným letadlem.
   Při sestřelení nad 45 m pilot vyskočí s padákem (bez volného pádu, vrchlík se hned rozvine), kamera sleduje padák, souhrn po ~7 s.
6. Závěrečná obrazovka: čas, sestřely, ztráty, přesnost, stav letounu, osud pilota, 1–3 hvězdy.

Munice je nekonečná (2 kulomety Vickers, 15 ran/s střídavě, stopovky).

## Obtížnosti (`BW.DIFFICULTIES` v `js/util.js`)

| | Nepřátelé | Spojenci | HP nepřítele | HP hráče | Poškození hráči | AI skill | Max. útočníků na hráče | Ukazatel předstihu |
|---|---|---|---|---|---|---|---|---|
| Nováček | 3 | 3 | 60 | 160 | ×0,4 | 0,5 | 1 | ano |
| Pilot | 5 | 3 | 85 | 130 | ×0,65 | 0,7 | 2 | ano |
| Veterán | 7 (2 skupiny) | 2 | 105 | 110 | ×0,85 | 0,8 | 2 | ne |
| Eso | 9 (2 skupiny) | 2 | 125 | 100 | ×1,1 | 0,95 | 4 | ne |

Spojenci: `BW.ALLY_AI` (skill 0,8). Výhoda hráčova letadla: `perf: { thrust: 1.1, rate: 1.12, stall: 1.08 }`,
+15 % poškození kulometů, menší rozptyl zbraní, stabilizační asistent.

Vyvážení bylo testované „náhradním pilotem“ (AI řídí hráčovo letadlo): Nováček a Pilot se většinou vyhrají,
Veterán a Eso jsou pro AI náhradníka velmi těžké (nebylo ověřeno s živým hráčem).

## Ovládání

| Vstup | Akce |
|---|---|
| W/S, šipky ↑↓ | výškovka (W/↑ = nos dolů; volba „Obrátit výškovku“) |
| A/D, šipky ←→ | křidélka |
| Q/E | směrovka (na zemi zatáčení) |
| R nebo Shift / F, kolečko myši | plyn (kolečko nahoru = víc, 5 %/krok) |
| Mezerník, levé tlačítko myši | střelba (ve všech režimech myši) |
| B | brzdy |
| C | pohled za letadlem / kokpit |
| X (držet), pravé tlačítko myši | ohlédnutí / rozhlížení (po puštění se pohled vrací cca za 0,4 s) |
| P / Esc, M | pauza, zvuk |
| Gamepad | levá páčka knipl, pravá směrovka + plyn, RT/A střelba, B brzdy, Y pohled, Start pauza |

Režimy myši (menu, ukládá se do `localStorage` klíč `bw-biplanes-options`):
- **míření** (výchozí) – myš posouvá kroužek míření, letadlo k němu letí vlastním autopilotem (`Game.flyToAim`).
  Pointer lock po kliknutí; Esc uvolní myš a zapauzuje hru.
- **knipl** – poloha kurzoru od středu = výchylka kniplu.
- **vypnuto**.

Klávesy mají vždy přednost před myší. Klávesy se rozpoznávají přes `e.code` se zálohou na `e.key`/`keyCode` (funkce `keyId`).

## Struktura souborů

| Soubor | Obsah |
|---|---|
| `index.html` | HUD, menu, pauza, závěrečná obrazovka, načtení skriptů (s `?v=N` kvůli cache – při změně JS zvýšit) |
| `style.css` | vzhled menu a HUD |
| `js/util.js` | pomocné funkce, seedovaný RNG, výšková funkce terénu `BW.terrainHeight`, letiště, obtížnosti |
| `js/plane.js` | třída `BW.Plane`: letová fyzika, pojezd po zemi, kontakt se zemí/havárie, zbraně, poškození, animace kormidel a hlavy pilota |
| `js/model.js` | procedurální model dvouplošníku (lofted trup, profilovaná křídla, rotační motor, vzpěry, pohyblivá kormidla), textury a barevná schémata `BW.SCHEMES`, cache materiálů `BW.getMat` |
| `js/pilot.js` | pilot v kokpitu (`buildPilotBust`), celá postava (`buildPilotFigure`), třída `BW.Parachute` |
| `js/world.js` | terén 20×20 km s texturou polí, voda, obloha (SkyMaterial), mraky, lesy a vesnice (thin instances), letiště s hangáry, odstavená letadla |
| `js/weapons.js` | `BW.Weapons` (střely, zásahy segment vs. AABB hitboxy, stopovky jako thin instances), `BW.Effects` (jiskry, prach, kouř, oheň, výbuchy) |
| `js/ai.js` | `BW.AIPilot`: vzlet, výběr cíle, stíhání s předstihem, střelba, úhyby, vyhýbání se zemi a hranici |
| `js/audio.js` | procedurální zvuky přes WebAudio (motor, vítr, kulomety, zásahy, výbuchy) |
| `js/hud.js` | přístroje, radar, značky letadel a šipky na okraji, zaměřovač, ukazatel předstihu, kroužek míření, zprávy |
| `js/game.js` | třída `BW.Game`: scéna, vstupy, kamera, průběh mise, události, padáky, UI obrazovky |

## Klíčové technické detaily

**Letová fyzika** (`Plane.step`, 100 Hz podkroky): vztlak `CL = 4,6·α` do přetažení (0,26 rad), pak pokles;
odpor `cd0 + k·CL²`; tah klesá s rychlostí; ovládání zadává úhlové rychlosti (účinnost roste s rychlostí);
„weathervane“ stabilita natáčí nos ke směru letu. Souřadnice Babylonu (levotočivé): x vpravo, y nahoru, z dopředu.

**Asistent hráčova letadla** (`assist = true` jen pro hráče): při puštěném kniplu se srovnají křídla a letadlo se vyváží
do vodorovného letu (trim úhlu náběhu + zpětná vazba na úhel dráhy); menší kývání při přetažení.
Při řízení myší (`mouseFlying`) se vyrovnávání náklonu vypíná, řídí autopilot.

**Autopilot myši** (`Game.flyToAim`): míří nosem (= linie kulometů) na bod míření; výškovka a směrovka s tlumením,
integrační složkou a dopřednou vazbou z rychlosti pohybu kroužku; zatáčení náklonem max. 75° s tvrdým omezovačem
(nikdy na záda). Bod míření je na „vodítku“ max. 40° od nosu (`leashAim`), sklon max. ±52°, u malé rychlosti
se nedovolí strmé stoupání, u země strmý sestup. Po použití kláves převezme řízení myš až po úmyslném pohybu (> 25 px za ~0,3 s).
Naměřeno: zaměřovač v kroužku za 0,1–1,6 s, při sledování do ~15°/s v kroužku ~77 % času.

**Pojezd po zemi**: ocas leží na spodku trupu (`SKID`), sklon na zemi ~17°; s rychlostí se ocas zvedá na ~10°.
Kontaktní body a hitboxy jsou v `plane.js` (`WHEEL_L/R`, `SKID`, `CRASH_POINTS`, `BW.HITBOXES`, `BW.MUZZLES`).

**AI**: řízení stejnými vstupy a fyzikou jako hráč (`AIPilot.steer` s kompenzací gravitace); střílí, když je nos
v kuželu `aimCone` nebo v toleranci „míjivé vzdálenosti“ na blízko; při čelním průletu jen úzký kužel a poloviční dosah.
Nepřátelé přednostně útočí na hráče, ale max. `maxOnPlayer` najednou. Asi 35 % sestřelených AI pilotů vyskočí s padákem.

**Výkon**: letadlo ~16 tis. vrcholů, sloučené meshe po materiálech; simulace ~0,05 ms/snímek, odeslání renderu ~1,6 ms.

## Testování

Vývoj byl ověřován v panelu prohlížeče skripty v konzoli: simulace se krokuje ručně (`BW.game.update(1/60)`),
protože panel na pozadí nespouští `requestAnimationFrame`. Užitečné triky:
- náhradní pilot: `new BW.AIPilot(game.player, game, BW.ALLY_AI)` + `game.readPlayerInput = () => {}`,
- vypnutí srážek: `game.checkCollisions = () => {}`,
- myš: `canvas.dispatchEvent(new MouseEvent('mousemove', { movementX, movementY }))`,
- po změně JS zvýšit `?v=` v `index.html`, jinak prohlížeč drží starou verzi v cache.

## Stav

Nic z této hry zatím není commitnuté (složka `programs/flyghtSimulatorBabylon/` a řádek v kořenovém `index.html`).
Možná další práce: ověřit vyvážení Veterán/Eso s živým hráčem, případně další mise/vlny, zvuky motorů ostatních letadel.
