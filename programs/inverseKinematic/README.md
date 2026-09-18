# Syntéza mechanismu

Aplikace běží čistě v prohlížeči (bez backendu, bez build kroku). Stačí otevřít `index.html`.

1. **Editor** – uzavřená (periodická) NURBS křivka s uniformním uzlovým vektorem, volitelný stupeň 2–5 a váhy bodů.
2. **Solve** – navrhne rovinný kloubový mechanismus jen z tuhých členů a rotačních kloubů. Mechanismus má 1 stupeň volnosti a pohání ho klika A–B s konstantní úhlovou rychlostí.
3. **Animace** – členy se vykreslují jako tyče nebo desky, k tomu rám, motor, slábnoucí stopa pera, volitelně dráhy a popisky kloubů.

## Jak se mechanismus hledá

Syntéza je kaskádová:

| úroveň | struktura | klouby |
|---|---|---|
| čtyřčlen | rám – klika – ojnice – vahadlo, pero na ojnici | 4 |
| šestičlen | čtyřčlen + dvojčlen (RRR) mezi dvěma libovolnými členy → Wattův nebo Stephensonův řetězec | 7 |
| osmičlen | šestičlen + další dvojčlen | 10 |

- Každá vyšší úroveň startuje z nejlepšího řešení té nižší. Nový dvojčlen se připojí přesně v bodě pera, takže mechanismus zpočátku kreslí stejnou křivku, a optimalizace ji pak zlepšuje.
- To, ke kterým členům se dvojčleny připojí (topologie), volí optimalizace sama spolu s rozměry.
- Optimalizace: diferenciální evoluce (current-to-pbest/1/bin s restarty) běží paralelně ve Web Workerech, jedno vlákno na „ostrov“. Nakonec proběhne doladění metodou Nelder–Mead.
- Poloha a měřítko se neoptimalizují. Křivka pera se se zadanou křivkou zarovná analyticky (těžiště a RMS poloměr vážené délkou), takže se hledá jen tvar a natočení.
- Účelová funkce: symetrická Chamferova vzdálenost křivek.
- Penalizace: nesestavitelné polohy, přenosový úhel pod ~17° a zbytečně velký zastavěný prostor.
- Výsledkem jsou všechny úrovně. Vybere se nejjednodušší mechanismus, jehož odchylka je do 15 % od nejlepšího. Ostatní varianty lze zobrazit kliknutím.

Omezení: kloubový mechanismus s jednou klikou nakreslí věrně oválné a „ledvinovité“ tvary, rovné úseky a jednu výraznou špičku. Tvary, u nichž by pero muselo za jednu otáčku kliky mnohokrát kmitat (např. pěticípá hvězda), se aproximují jen hrubě.

## Soubory

- `js/geom.js` – geometrické pomocné funkce (převzorkování podle délky oblouku, odchylka tvarů)
- `js/nurbs.js` – vyhodnocení uzavřené NURBS křivky (de Boorův algoritmus v homogenních souřadnicích)
- `js/linkage.js` – kinematika, účelová funkce a optimalizátor (`LinkageCore`, sdílený s Workery) a řízení kaskády
- `js/render.js` – vykreslování na canvas
- `js/main.js` – editor, uživatelské rozhraní a animační smyčka

Křivka se ukládá do `localStorage` a lze ji exportovat nebo importovat jako JSON.
