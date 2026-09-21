# Dvouplošníky – letecká bitva

Letecký simulátor souboje dvouplošníků z 1. světové války v prohlížeči (Babylon.js, bez backendu a bez build kroku).

## Spuštění

Stačí otevřít `index.html` v prohlížeči (Babylon.js se načítá z CDN, je potřeba internet).
Případně přes libovolný statický server, např. `python -m http.server` v této složce.

## Mise

V menu se volí jeden ze tří typů mise. Vždy se startuje z polního letiště spolu se spolubojovníky
(startují, jakmile se rozjedeš), úkol začíná po vzletu a mise je splněna po přistání a zastavení na letišti.
Munice je nekonečná.

1. **Letecký souboj** – sestřel nepřátelskou letku (na obtížnosti Veterán/Eso přiletí i druhá skupina).
2. **Útok na bombardéry** – dvoumotorové bombardéry Gotha s doprovodem stíhaček letí z náhodného směru
   (~6 km) na naše letiště. Sestřel je dřív, než shodí pumy. Každý bombardér má střelce vpředu a na hřbetě;
   pod ocasem je mrtvý úhel. Spolubojovníci se přednostně vážou na doprovod. Když k letišti pronikne víc
   bombardérů, než obtížnost dovolí, mise selže. Po skončení náletu se doprovod stahuje.
3. **Útok na pozemní cíl** – sklad munice a paliva 3–4,5 km od letiště (2 sklady, 2 nádrže, zásoby)
   chrání kulometná hnízda protiletecké obrany (a na vyšších obtížnostech hlídka stíhaček).
   Znič všech 5 cílů kulomety; hnízda lze umlčet. Výbuch skladu nebo nádrže poškodí letoun, který nad ním letí příliš nízko.
   Spolubojovníci provádějí nálety střemhlav na cíle.

Během boje můžeš přistát na letišti a po zastavení mechanici letoun opraví. Když tě sestřelí (a je dost výšky), pilot vyskočí s padákem.

## Obtížnosti

| | Souboj: nepřátelé | Bombardéry + doprovod (smí proniknout) | Kulometná hnízda + hlídka | Spojenci | Poznámka |
|---|---|---|---|---|---|
| Nováček | 3 | 2 + 2 (1) | 2 + 0 | 3 | nepřesná střelba nepřítele, odolný letoun, ukazatel předstihu |
| Pilot | 5 | 3 + 3 (1) | 3 + 2 | 3 | vyrovnaný boj, ukazatel předstihu |
| Veterán | 7 (2 skupiny) | 4 + 4 (1) | 5 + 3 | 2 | lepší piloti, bez ukazatele předstihu |
| Eso | 9 (2 skupiny) | 4 + 6 (0) | 6 + 4 | 2 | všichni útočí na tebe, přesní střelci |

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

**Mobil / tablet** (ideálně na šířku, hra se na dotykovém zařízení přepne do celé obrazovky):
- **míření** (výchozí) – táhni prstem po levé části obrazovky, letadlo letí za kroužkem,
- **joystick** – virtuální knipl vlevo dole (dolů = přitáhnout),
- vpravo tlačítko **PAL**, páka **PLYN**, **B** brzdy, 👁 pohled, ❚❚ pauza, ⛶ celá obrazovka.

Na počítači lze dotykové ovládání vyzkoušet přidáním `?touch=1` k adrese (`?touch=0` ho vypne).

Po puštění ovládání se letadlo samo vyrovná (křídla do vodorovné polohy, let bez klesání). Funguje i gamepad.

## Struktura

- `js/util.js` – konstanty, terén, tabulka obtížností
- `js/plane.js` – letová fyzika (vztlak, odpor, tah, přetažení, pojezd po zemi)
- `js/model.js` – detailní model dvouplošníku (trup, profilovaná křídla, rotační motor, pohyblivá kormidla)
- `js/pilot.js` – pilot v kokpitu, postava pilota a padák
- `js/world.js` – terén, voda, obloha, mraky, lesy, vesnice, letiště
- `js/weapons.js` – střely se stopovkami, zásahy, efekty (jiskry, kouř, výbuchy)
- `js/ai.js` – AI pilotů (start, výběr cíle, stíhání s předstihem, úhyby, vyhýbání se zemi, doprovod, hlídka, ústup, nálety na pozemní cíle)
- `js/missions.js` – typy misí, model bombardéru Gotha, pohyblivé kulomety (střelci, kulometná hnízda), pozemní cíle, pumy
- `js/audio.js` – procedurální zvuky přes WebAudio
- `js/hud.js` – přístroje, značky cílů, radar, zprávy
- `js/touch.js` – dotykové ovládání (míření tahem, joystick, plyn, tlačítka), celá obrazovka
- `js/game.js` – řízení hry, vstupy, kamera, společný průběh mise (start, přistání, konec)
