# Dvouplošníky – shrnutí aplikace

Letecký simulátor dvouplošníků z 1. světové války (Sopwith Camel proti německým stíhačkám a bombardérům) v prohlížeči
se třemi typy misí: letecký souboj, útok na bombardéry s doprovodem, útok na pozemní cíl chráněný kulomety.
Babylon.js 7 z CDN (`babylonjs@7` + `babylonjs-materials@7` kvůli SkyMaterial), žádný backend, žádný build krok,
klasické `<script>` soubory (funguje i z `file://`). Veškerý kód je v globálním jmenném prostoru `window.BW`.
Hra je zaregistrovaná v kořenovém `index.html` repozitáře (položka „Biplane dogfight“).

Spuštění: otevřít `index.html`, nebo `python -m http.server 8765` v této složce
(konfigurace `.claude/launch.json` → server `biplanes`).

## Průběh mise

Typ mise (`options.mode`: `dogfight` / `bombers` / `ground`, popisy v `BW.MODES` v `js/util.js`) se volí v menu.
Logika specifická pro typ mise je v objektech `BW.MissionModes` (`js/missions.js`): `setup` (při stavbě mise),
`start` (po vzletu), `update`, `objective`, `status` (řádky panelu), `killNote`, `endRows`, `stars`, `successText`.
Společné fáze pro všechny typy: `runway` → `combat` → `rtb` → `done` / `failed`. Níže průběh souboje:

1. Start na travnatém letišti (dráha podél osy +z, střed v počátku). Spolubojovníci stojí vedle hráče a startují, jakmile se rozjede.
2. Po vzletu (výška nad terénem > 40 m) se ve vzdálenosti ~3 km objeví nepřátelská letka. Na obtížnosti Veterán a Eso přiletí druhá skupina
   (po 70 s nebo když z první zbude ≤ 1 letadlo).
3. Po sestřelení všech nepřátel (fáze `rtb`) ukazatel navede na letiště. Mise je splněna po přistání na letišti a zastavení (rychlost < 1 m/s).
4. Během boje lze přistát na letišti a po zastavení se letoun opravuje.
5. Neúspěch: sestřelení, havárie (tvrdé přistání, náraz, voda, přistání v terénu nad 38 m/s), srážka s jiným letadlem.
   Při sestřelení nad 45 m pilot vyskočí s padákem (bez volného pádu, vrchlík se hned rozvine), kamera sleduje padák, souhrn po ~7 s.
6. Závěrečná obrazovka: čas, sestřely, ztráty, přesnost, stav letounu, osud pilota, 1–3 hvězdy.

Munice je nekonečná (2 kulomety Vickers, 15 ran/s střídavě, stopovky).

### Útok na bombardéry (`bombers`)

- Po vzletu se ~6 km od letiště (náhodný směr) objeví bombardéry Gotha ve formaci (výška ~520–580 m, ~48 m/s)
  a stíhači doprovodu nad nimi. Bombardér: `BW.Plane` s `build: BW.buildBomber`, `perf { thrust 0.78, rate 0.5 }`,
  vlastní hitboxy `BW.BOMBER_HITBOXES` (`hitR` 13 pro hrubou fázi zásahu, `collideR` 10 pro srážku).
- `BW.BomberPilot` (dědí `AIPilot`): letí rovně na svůj bod nad letištěm, max. ~35° od nosu (plochá zatáčka),
  drží výšku nad terénem; ~540 m před bodem shodí 8 pum (dopadají ~10 s) a obrací se domů.
- Dva střelci (`BW.Gun`): přední (osa dopředu, kužel ~95°) a hřbetní (osa dozadu nahoru, kužel 63°) → mrtvý úhel zespodu zezadu.
  Střelec otáčí kulometem omezenou rychlostí, střílí dávky s předstihem, rozptyl `gunnerSpread`, 7 ran/s.
- Doprovod: `AIPilot` s `cfg.escort` (vrací vedoucí bombardér) drží pozici ve formaci, útočí jen na letadla do 1600 m od bombardérů.
  Spojenci doprovod upřednostňují (bombardéry jsou hlavně úkol hráče).
- `stats.through` = počet bombardérů, které shodily pumy; při překročení `allowedThrough` mise selže (13 s po shozu).
  Když už žádný bombardér neletí k letišti, fáze `rtb` a doprovod se stahuje (`state = 'retreat'`), letadla za okrajem oblasti mizí (`Game.removePlane`).
- Bombardéry mají na obrazovce oranžový dvojitý ovál jen se vzdáleností, na radaru oranžovou tečku.
- Pumy (`BW.Bombs`): pád s gravitací, výbuch, kráter, letadlo na zemi do 22 m je zničeno.

### Útok na pozemní cíl (`ground`)

- Místo skladu vybírá `BW.pickDepotSite` (plochá oblast 3,2–4,4 km od letiště, daleko od vesnic a vody) ještě před stavbou
  lesů, takže v něm nerostou stromy; v textuře terénu je udusaná plocha a cesta k nejbližší vesnici.
- Cíle `BW.GroundTarget` (AABB hitbox, zasahují je jen spojenecké střely – `Weapons.hitTargets`): 2× sklad munice (110 HP),
  2× nádrž s palivem (70), zásoby (55) a `aaNests` kulometných hnízd (40 HP, `BW.Gun` s dosahem `aaRange`, rozptyl `aaSpread`).
  Zničený cíl zčerná, propadne se a hoří; sklad a nádrž mají sekundární výbuchy a tlakovou vlnu (poškodí nízko letící letadla).
- Hlídka (`patrol` stíhačů) krouží nad skladem (`cfg.guard`) a útočí na letadla do 2300 m od něj.
- Spolubojovníci mají `cfg.groundAttack`: nálet (výška ~380 m, střemhlav od ~1 km, palba do 520 m, vybrání, odlet a nový nájezd),
  přednostně na kulometná hnízda; se stíhačkami bojují jen do 1300 m.
- Mise je splněna po zničení všech 5 hlavních cílů a přistání.

### Voda a lodě

- Blikání vody u břehů byl z-fighting (hloubkový rozsah kamery 0,3 m–50 km). Řeší ho `engine.useReverseDepthBuffer = true`
  a to, že vrcholy terénu pod hladinou se v meshi zahloubí (`WL − 2 − 2,5·(WL − h)`); hra dál používá analytickou výšku.
- Hladina: `StandardMaterial` s procedurální dlaždicovou normálovou mapou (součet sinusovek s celočíselnými frekvencemi, dlaždice 45 m,
  posouvá se v `World.update`) a jemnou barevnou texturou (dlaždice 900 m).
- Lodě (`World.buildShips`): 8 lodí v hlubších místech jezer (2/3 parníky ~34 m s kouřem z komína, 1/3 plachetnice ~11 m).
  Plují pomalu (2,5–5,5 m/s), před mělčinou zatáčejí na volnější stranu, mírně se kolébají. Brázda má vlastní uzel
  (jen poloha a kurz), jinak by ji kolébání trupu ponořilo pod hladinu. Lodě nejsou cíle.

### Úprava v efektech

`Effects.makeSystem` přepisuje `dispose` částicových systémů na `dispose(false)`: automatické zrušení po `disposeOnStop`
jinak zrušilo i sdílenou texturu `puffTex` a všechny další výbuchy, kouř a oheň byly neviditelné.

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

Klávesy mají vždy přednost před myší.

**Dotykové ovládání** (`js/touch.js`, `BW.TouchControls`): zapne se na zařízení s hrubým ukazatelem (`pointer: coarse`),
vynutit/vypnout lze parametrem `?touch=1` / `?touch=0` (testování myší – vše je na Pointer Events). Tělo stránky dostane třídu `touch`
(kompaktní HUD nahoře, radar vpravo nahoře, menu na nízké obrazovce bez popisů misí a s přilepeným tlačítkem startu).
Volba `options.touchMode`: `aim` (výchozí – tah prstem po levých 58 % obrazovky posouvá bod míření přes `Game.moveAim`,
přes kratší stranu displeje ~90°) nebo `stick` (virtuální joystick, na zemi zároveň směrovka). `Game.aimMode()` sjednocuje
režim míření pro myš i dotyk. Tlačítka PAL a B se drží, páka plynu nastavuje plyn přímo. Při startu mise se zkusí celá obrazovka
a zámek orientace na šířku (iPhone nepodporuje – ignoruje se). Na výšku se hra zapauzuje a zobrazí výzvu k otočení; hra se
pauzuje i při přepnutí do jiné aplikace (`visibilitychange`). Výkon: na dotykových zařízeních se renderuje max. v 1,5× rozlišení CSS
(`setHardwareScalingLevel`) a stínová mapa má 1024 px. Tapnutí na plátno negenerují střelbu (kompatibilní myší události se ignorují). Klávesy se rozpoznávají přes `e.code` se zálohou na `e.key`/`keyCode` (funkce `keyId`).

## Struktura souborů

| Soubor | Obsah |
|---|---|
| `index.html` | HUD, menu, pauza, závěrečná obrazovka, načtení skriptů (s `?v=N` kvůli cache – při změně JS zvýšit) |
| `style.css` | vzhled menu a HUD |
| `js/util.js` | pomocné funkce, seedovaný RNG, výšková funkce terénu `BW.terrainHeight`, letiště, obtížnosti |
| `js/plane.js` | třída `BW.Plane`: letová fyzika, pojezd po zemi, kontakt se zemí/havárie, zbraně, poškození, animace kormidel a hlavy pilota |
| `js/model.js` | procedurální model dvouplošníku (lofted trup, profilovaná křídla, rotační motor, vzpěry, pohyblivá kormidla), textury a barevná schémata `BW.SCHEMES`, cache materiálů `BW.getMat` |
| `js/pilot.js` | pilot v kokpitu (`buildPilotBust`), celá postava (`buildPilotFigure`), třída `BW.Parachute` |
| `js/world.js` | terén 20×20 km s texturou polí, voda (animovaná normálová mapa vln, barevné skvrny), lodě (parníky s kouřem, plachetnice, brázdy), obloha (SkyMaterial), mraky, lesy a vesnice (thin instances), letiště s hangáry, odstavená letadla; `World.update` hýbe vlnami a loděmi |
| `js/weapons.js` | `BW.Weapons` (střely, zásahy segment vs. AABB hitboxy, stopovky jako thin instances), `BW.Effects` (jiskry, prach, kouř, oheň, výbuchy) |
| `js/ai.js` | `BW.AIPilot`: vzlet, výběr cíle, stíhání s předstihem, střelba, úhyby, vyhýbání se zemi a hranici, doprovod (`formation`), hlídka (`orbitAround`), ústup (`retreat`), nálety na pozemní cíle (`attackGround`) |
| `js/missions.js` | `BW.MissionModes` (logika tří typů misí), `BW.buildBomber`, `BW.Gun` (pohyblivý kulomet), `BW.BomberPilot`, `BW.GroundTarget`, `BW.pickDepotSite`, `BW.Bombs` |
| `js/audio.js` | procedurální zvuky přes WebAudio (motor, vítr, kulomety, zásahy, výbuchy) |
| `js/hud.js` | přístroje, radar, značky letadel a šipky na okraji, zaměřovač, ukazatel předstihu, kroužek míření, zprávy |
| `js/touch.js` | `BW.isTouch`, `BW.TouchControls` (míření tahem, joystick, plyn, tlačítka), celá obrazovka / zámek orientace |
| `js/game.js` | třída `BW.Game`: scéna, vstupy, kamera, společný průběh mise (deleguje na `this.mission`), události (`onTargetHit`, `onTargetDestroyed`, `onBomberRelease`, `removePlane`), padáky, UI obrazovky |

## Klíčové technické detaily

**Letová fyzika** (`Plane.step`, 100 Hz podkroky): vztlak `CL = 4,6·α` do přetažení (0,26 rad), pak pokles;
odpor `cd0 + k·CL²`; tah klesá s rychlostí; ovládání zadává úhlové rychlosti (účinnost roste s rychlostí);
„weathervane“ stabilita natáčí nos ke směru letu. Souřadnice Babylonu (levotočivé): x vpravo, y nahoru, z dopředu.

**Asistent hráčova letadla** (`assist = true` jen pro hráče): při puštěném kniplu se srovnají křídla a letadlo se vyváží
do vodorovného letu (trim úhlu náběhu + zpětná vazba na úhel dráhy); menší kývání při přetažení.
Trim přidává vztlak na zatáčku jen do náklonu ~40° (`max(0.75, u.y)`), jinak by v prudkém náklonu zvedal špičku;
zpětná vazba na úhel dráhy (vybírání klesání) je při řízení myší vypnutá, aby nebránila střemhlavému letu.
Při řízení myší (`mouseFlying`) se vyrovnávání náklonu vypíná, řídí autopilot.

**Autopilot myši** (`Game.flyToAim`): míří nosem (= linie kulometů) na bod míření; výškovka a směrovka s tlumením,
integrační složkou a dopřednou vazbou z rychlosti pohybu kroužku; zatáčení náklonem max. 75° s tvrdým omezovačem
(nikdy na záda). Když je bod míření pod nosem, výškovka smí přitáhnout jen málo (`1 + 6·Δsklon`) – v náklonu by
přitažení zvedalo špičku; letadlo nejdřív spustí nos k bodu míření a pak dotočí. Bod míření je na „vodítku“ max. 40° od nosu
(`leashAim`), sklon max. ±52°, u malé rychlosti se nedovolí strmé stoupání. U země se sklon dolů neomezuje –
vybrání střemhlavého letu je čistě na pilotovi (jen varování „VYBER TO!“). Po použití kláves převezme řízení myš až po úmyslném pohybu (> 25 px za ~0,3 s).
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

Možná další práce: ověřit vyvážení s živým hráčem (hlavně Veterán/Eso a nové mise), zvuky motorů ostatních letadel.

Naměřené vyvážení (hráč 8 s v klidu vůči bombardéru, Pilot): 120 m za ocasem −42 HP, 250 m za ocasem −13 HP, zespodu zezadu 0;
sestřelení bombardéru z 120 m za ~3 s. Kulometná hnízda při rovném přeletu skladu ve 150–250 m: Pilot ~6–10 %, Veterán ~15 %, Eso ~40 % HP.
