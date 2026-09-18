# TopoOpt 2D

Prohlížečová aplikace pro **2D topologickou optimalizaci** (metoda SIMP). Běží bez serveru — stačí otevřít `index.html`.

## Spuštění

Otevřete soubor `index.html` v prohlížeči (Chrome, Edge, Firefox…).

> Pokud prohlížeč blokuje lokální skripty, spusťte jednoduchý statický server, např.:
> `npx --yes serve .`

## Použití

1. **Uchycení** — klikněte na hranu čtverce (modré body = pevné uložení).
2. **Síla** — nastavte velikost a směr (°), pak klikněte na hranu.
3. **Optimalizovat** — SIMP redistribuuje materiál při daném objemu.
4. Volitelně **Příklad: konzola** — klasická konzola (vlevo uchycení, vpravo svislá síla).

## Parametry

| Parametr | Význam |
|----------|--------|
| Podíl materiálu | Maximální podíl zachovaného materiálu (objemová vazba) |
| Rozlišení mřížky | Počet prvků na stranu (vyšší = přesnější, pomalejší) |
| Max. iterací | Horní limit iterační smyčky |
| Filtr r_min | Vyhlazení citlivostí (potlačuje šachovnicový vzor) |

## Algoritmus

- FEM: 4uzlové pravoúhlé prvky, rovinná napjatost
- SIMP: \(E(\rho) = E_{\min} + \rho^p (E_0 - E_{\min})\), \(p = 3\)
- Cíl: minimalizace poddajnosti (compliance) při omezení objemu
- Aktualizace hustot: Optimality Criteria (OC)
- Řešič: conjugované gradienty se Jacobiho předpodmíněním
