# Sokol – lov z výšin

3D hra v prohlížeči (Babylon.js, bez backendu): hráč ovládá sokola stěhovavého a loví letící i pozemní zvířata.

Spuštění: otevřete `index.html` přes libovolný statický server (např. `python -m http.server`). Babylon.js se načítá z CDN.

## Soubory

| soubor | obsah |
| --- | --- |
| `js/util.js` | šum (Perlin, fBm, ridged), seedovaný RNG, generátor geometrie (loft, trubice, elipsoid, oboustranná plocha) |
| `js/world.js` | výšková mapa 4×4 km (hory, pole s mezemi, jezero), terén s barvami vrcholů, stromy a skály (thin instances), mraky, termiky, hnízdo, minimapa |
| `js/falcon.js` | procedurální model sokola: tělo a hlava s kresbou (kápě, vous), zobák se zobcem, oči, kostra křídla rameno–loket–zápěstí, 10 ručních a 11 loketních letek, krovky, 12 per ocasu, nohy s prsty a drápy; pózy rozepjatá / napůl složená / střemhlav / brzdění / sezení / plášťování |
| `js/prey.js` | holub, špaček, kachna, koroptev, králík, zajíc, hraboš – modely, hejna (boids), vyplašení, kličkování, nory, respawn |
| `js/game.js` | letový model (vztlak, odpor, pád, přetížení, termiky), ovládání, kamery, lov, energie, výzvy, HUD |
| `js/audio.js` | syntetizované zvuky (vítr, mávání, křik, úder) |

## Ovládání myší

Dva režimy (přepínání klávesou `J` nebo v nastavení), oba řídí *polohu*, ne rychlost otáčení:

- **Míření** – myš posouvá zaměřovač (směr ve světě), kamera se dívá tam. Regulátor spočítá zrychlení potřebné
  k otočení dráhy k zaměřovači (+ kompenzace tíže) a natočí vztlak: náklon = směr zrychlení, úhel náběhu = velikost (g).
- **Joystick** – výchylka do strany = úhel náklonu (střed = vodorovná křídla), nahoru/dolů = přitažení/potlačení
  (násobek g). Páka se sama nevrací, `R` ji vycentruje. Ve středu se sokol ustálí na klouzavé rychlosti.

Klávesy WASD mají vždy přednost (řízení rychlostí náklonu/klopení).

## Letový model

Síly: vztlak `½ρV²S·CL(α)` s pádem nad kritickým úhlem, indukovaný a tvarový odpor, boční síla, tah při mávání, gravitace.
Plocha křídel klesá se složením (`tuck`), takže při přitisknutých křídlech sokol zrychlí na ~330 km/h.
Aerodynamická stabilita natáčí nos do proudu s vyvážením na klouzavý let; vztlak je omezen na 12 g.

Ladicí rozhraní: `FS.debug.step(n, dt)` krokuje simulaci ručně (užitečné pro automatické testy).
