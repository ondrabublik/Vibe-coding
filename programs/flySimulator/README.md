# Stíhací simulátor

3D simulátor vzdušných soubojů stíhaček v prohlížeči (three.js, ES moduly, bez build kroku a bez backendu).
Vzlétni z letiště uprostřed ostrova, sestřeluj vlny nepřátelských stíhaček kanónem a samonaváděcími raketami
a vrať se přistát – po zastavení na letišti se stroj sám dotankuje, vyzbrojí a opraví.

Průběh mise: po vzletu přiletí první vlna. Když ji zničíš, další vlna nepřijde, dokud nepřistaneš
a nezastavíš na letišti (HUD ukazuje azurovou značkou směr a vzdálenost k základně). Po doplnění
paliva, munice a opravě znovu vzlétni – 10 s po vzletu dorazí další vlna.

Spuštění: `startServer.bat` (PHP server na http://localhost:8000). ES moduly nejdou otevřít přes `file://`.
Stačí i jiný statický server, např. `python -m http.server`.

## Ovládání

| Klávesa | Akce |
|---|---|
| W / S | plyn / ubrat (nad 90 % forsáž) |
| ↓ / ↑ | přitáhnout / potlačit (v menu lze obrátit) |
| ← / → | náklon |
| A / D | směrovka, na zemi řízení příďového kola |
| Mezerník | kanón |
| R / Enter | raketa – když je zaměřovací okno červené („ZAMČENO“), navede se na cíl |
| T / Tab | další cíl |
| X | klamné cíle (flares) proti raketám |
| G · B | podvozek · brzdy (na zemi) / aerodynamická brzda (ve vzduchu) |
| V / C | pohled z kokpitu ↔ pohled zezadu; táhnutím myši se rozhlížíš |
| P / Esc · M · H | pauza · zvuk · nápověda |

Funguje i gamepad (levá páčka řízení, pravá směrovka, RT/LT plyn, A kanón, B raketa, X klamné cíle, Y pohled, LB cíl, RB podvozek).

## Jak to funguje

- **Letový model** (`js/aircraft.js`): vztlak, odpor a boční síla z úhlu náběhu a vybočení, tah motoru
  s forsáží a řídnoucím vzduchem, gravitace. Páka řídí úhlové rychlosti (fly-by-wire) s omezením na 9 G
  a úhel náběhu; při malé rychlosti letoun přetáhne a nos spadne. Na zemi kola, brzdy, řízení příďovým
  kolem, přistání se hodnotí podle vertikální rychlosti (nad 5,5 m/s, bez podvozku nebo mimo rovný terén = havárie).
- **Zbraně** (`js/weapons.js`): každá střela kanónu je svítící stopovka s balistikou; rakety s hledačem
  (zámek po ~1 s v kuželu 11°), vedením s předstihem a bezkontaktním zapalovačem; klamné cíle je mohou odlákat.
- **HUD** (`js/hud.js`): žebřík sklonu, vektor dráhy letu, rychlost, výška, kurz, zaměřovací okno cíle
  (zelené → žluté při zaměřování → **červené při zámku**), předsazený zaměřovač kanónu (zčervená, když střely
  zasáhnou), radar, varování (raketa, přetažení, „přitáhni“, podvozek, palivo).
- **Nepřátelé** (`js/ai.js`) létají se stejným letovým modelem: pronásledují s předstihem, střílí dávky,
  odpalují rakety, při ohrožení uhýbají a vypouštějí klamné cíle, hlídají si terén.
- **Svět** (`js/terrain.js`): procedurální ostrov 40 × 40 km s horami, lesy, vesnicemi a mraky, letiště
  s 3 km dráhou, pojezdovými dráhami, hangáry a věží. Příletové koridory v ose dráhy jsou bez hor.
- Zvuky jsou syntetizované přes WebAudio (`js/audio.js`), žádné soubory.

Pro automatizované testy lze stránku otevřít s `?debug` – pak je v konzoli `window.__fly` pro krokování simulace.
