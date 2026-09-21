# Dvouplošníky – letecká bitva

Letecký simulátor souboje dvouplošníků z 1. světové války v prohlížeči (Babylon.js, bez backendu a bez build kroku).

## Spuštění

Stačí otevřít `index.html` v prohlížeči (Babylon.js se načítá z CDN, je potřeba internet).
Případně přes libovolný statický server, např. `python -m http.server` v této složce.

## Mise

1. Start na polním letišti spolu se spolubojovníky (startují, jakmile se rozjedeš).
2. Po vzletu se objeví nepřátelská letka (na obtížnosti Veterán/Eso přiletí i druhá skupina).
3. Sestřel všechna nepřátelská letadla kulomety – munice je nekonečná.
4. Přistaň na letišti a zastav – mise je splněna.

Během boje můžeš přistát na letišti a po zastavení mechanici letoun opraví. Když tě sestřelí (a je dost výšky), pilot vyskočí s padákem.

## Obtížnosti

| | Nepřátelé | Spojenci | Poznámka |
|---|---|---|---|
| Nováček | 3 | 3 | nepřesná střelba nepřítele, odolný letoun, ukazatel předstihu |
| Pilot | 5 | 3 | vyrovnaný souboj, ukazatel předstihu |
| Veterán | 7 (2 skupiny) | 2 | lepší piloti, bez ukazatele předstihu |
| Eso | 9 (2 skupiny) | 2 | všichni útočí na tebe |

## Ovládání

| Klávesa | Akce |
|---|---|
| W / S, ↑ ↓ | výškovka (W = nos dolů) |
| A / D, ← → | náklon |
| Q / E | směrovka, na zemi zatáčení |
| R nebo Shift / F, kolečko myši | plyn + / − (kolečko nahoru = více) |
| Mezerník, levé tlačítko myši | kulomety |
| B | brzdy |
| C | pohled za letadlem / kokpit |
| X, pravé tlačítko myši | ohlédnutí / rozhlížení |
| P / Esc, M | pauza, zvuk |

Myš (volba v menu):
- **míření** (výchozí) – pohybem myši určuješ směr, letadlo tam samo zatočí, levé tlačítko střílí. Po kliknutí do hry se myš zachytí, Esc ji uvolní a pozastaví hru. Stisk šipek/WASD má přednost.
- **knipl** – poloha kurzoru od středu obrazovky = výchylka kniplu.

Po puštění ovládání se letadlo samo vyrovná (křídla do vodorovné polohy, let bez klesání). Funguje i gamepad.

## Struktura

- `js/util.js` – konstanty, terén, tabulka obtížností
- `js/plane.js` – letová fyzika (vztlak, odpor, tah, přetažení, pojezd po zemi)
- `js/model.js` – detailní model dvouplošníku (trup, profilovaná křídla, rotační motor, pohyblivá kormidla)
- `js/pilot.js` – pilot v kokpitu, postava pilota a padák
- `js/world.js` – terén, voda, obloha, mraky, lesy, vesnice, letiště
- `js/weapons.js` – střely se stopovkami, zásahy, efekty (jiskry, kouř, výbuchy)
- `js/ai.js` – AI pilotů (start, výběr cíle, stíhání s předstihem, úhyby, vyhýbání se zemi)
- `js/audio.js` – procedurální zvuky přes WebAudio
- `js/hud.js` – přístroje, značky cílů, radar, zprávy
- `js/game.js` – řízení hry, vstupy, kamera, průběh mise
