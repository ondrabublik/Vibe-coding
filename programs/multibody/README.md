# Multibody 2D – dynamika mechanismů v prohlížeči

Aplikace pro modelování a dynamickou analýzu **planárních mechanismů** metodou multibody.
Běží výhradně v prohlížeči (HTML + JavaScript), bez serveru, bez instalace a bez
externích knihoven.

## Spuštění

Otevřete `index.html` v prohlížeči (dvojklik stačí – aplikace nepoužívá ES moduly,
takže funguje i z `file://`). Volitelně přes lokální server:

```bash
python -m http.server 8000     # pak http://localhost:8000
```

## Co aplikace umí

| Oblast | Obsah |
|---|---|
| Tělesa | rám (nepohyblivý), binární člen (tyč), objímka |
| Vazby | rotační (2 rovnice), posuvná (2 rovnice) |
| Pohony | předepsaná úhlová rychlost / úhel v rotační vazbě, rychlost / posuv v posuvné vazbě |
| Zatížení | moment na těleso, síla v bodě tělesa (konstantní i jako funkce času), tíže |
| Analýzy | úloha polohy (sestavení), úloha rychlosti, dynamická analýza v čase, rozbor stupňů volnosti |
| Výstupy | animace, trajektorie, vektory rychlostí/zrychlení/reakcí, grafy, export CSV |

Řešeny jsou jak **kinematicky určené** mechanismy (0 stupňů volnosti, pohyb dán pohony
– výsledkem jsou hnací momenty a reakce), tak **volná dynamika** (pohyb se dopočítá
z pohybových rovnic).

## Postup modelování

1. **Nakreslete členy** – nástroj *Tyč* (tažením) a *Objímka* (kliknutím).
   Objímka vložená na tyč se automaticky srovná s jejím směrem.
2. **Přidejte vazby** – nástroj *Rotační* / *Posuvná* a klikněte do místa vazby.
   Aplikace spojí dvě tělesa pod kurzorem; pokud je pod kurzorem jen jedno těleso,
   spojí ho s **rámem**. U posuvné vazby lze tažením určit směr osy (jinak se použije
   osa vodicího tělesa).
3. **Zadejte pohon nebo zatížení** – v panelu *Vlastnosti* u vybrané rotační vazby
   zapněte *Předepsaný pohyb* a zadejte ω; moment vložíte nástrojem *Moment*.
4. **Sestavit** – vyřeší úlohu polohy, tedy „složí“ nakreslený mechanismus přesně
   do vazeb (nakreslené polohy stačí zadat přibližně).
5. **▶ Analýza** – dynamická analýza. Výsledky se objeví v animaci a v grafech;
   vlevo dole se zaškrtávají veličiny k vykreslení.

### Klávesové zkratky

`V` vybrat · `R` tyč · `O` objímka · `1` rotační vazba · `2` posuvná vazba ·
`M` moment · `F` síla · `Delete` smazat · `mezerník` přehrát/pauza ·
`←` `→` po snímcích · `Esc` zrušit výběr

Kolečko = zoom, pravé (nebo prostřední) tlačítko = posun plátna, `Shift` při kreslení
= přichytávání úhlu po 15°.

## Matematická formulace

Použity jsou **absolutní (kartézské) souřadnice** a **Lagrangeovy multiplikátory**.
Každé pohyblivé těleso má souřadnice

$$q_i = [x_i,\; y_i,\; \varphi_i]^T$$

(poloha těžiště a otočení). Rám se do vektoru souřadnic nezařazuje. Matice hmotnosti je
konstantní a diagonální, $M_i = \mathrm{diag}(m_i, m_i, J_i)$, takže v pohybových rovnicích
nevznikají gyroskopické členy.

**Pohybové rovnice** (index-3 DAE) se řeší v rozšířeném tvaru

$$\begin{bmatrix} M & \Phi_q^T \\ \Phi_q & 0\end{bmatrix}\begin{bmatrix} \ddot q \\ \lambda\end{bmatrix} = \begin{bmatrix} Q \\ \gamma\end{bmatrix}$$

kde $\Phi(q,t)=0$ jsou vazbové rovnice, $\gamma$ pravá strana zrychlovací úlohy a $Q$
zobecněné vnější síly. Reakce ve vazbě jsou $R = -\Phi_q^T\lambda$.

**Elementární vazby** (`js/core/constraints.js`), ze kterých se skládá vše ostatní:

| Primitivum | Rovnice | Použití |
|---|---|---|
| `coincident` | $r_A + A_A s'_A - r_B - A_B s'_B = 0$ | rotační vazba |
| `relAngle` | $\varphi_A - \varphi_B - f(t) = 0$ | rovnoběžnost posuvné vazby, pohon rotační vazby |
| `projection` | $u^T d - f(t) = 0$, $u = A_A u'_A$ | kolmá podmínka posuvné vazby, pohon posuvné vazby |

Tedy: *rotační vazba* = `coincident`; *posuvná vazba* = `relAngle`(konst) + `projection`(normála, 0);
*pohon rotační vazby* = `relAngle`($f(t)$); *pohon posuvné vazby* = `projection`(osa, $s(t)$).

**Numerika:**
- úloha polohy: Newtonova metoda, korekce jako řešení s minimální normou
  $\Delta q = \Phi_q^T(\Phi_q\Phi_q^T)^{-1}(-\Phi)$ – funguje i při redundantních vazbách,
- úloha rychlosti: nejbližší přípustná rychlost k zadané počáteční,
- integrace: Runge–Kutta 4. řádu s pevným krokem,
- Baumgarteho stabilizace $\gamma^* = \gamma - 2\alpha(\Phi_q\dot q - \nu) - \beta^2\Phi$
  plus korekce polohy a rychlosti v každém kroku (drift vazeb zůstává pod ~1e-10).

### Znaménkové konvence

- $\varphi$ i momenty jsou kladné **proti směru hodinových ručiček**.
- **Pohon**: kladná hodnota = pohyb tělesa **B vůči tělesu A** (u rotační vazby otáčení
  proti směru hodinových ručiček, u posuvné ve směru osy). Vypočtený *hnací moment*
  (resp. *hnací síla*) je účinek, kterým pohon působí na těleso B; platí
  $P = M_{\text{hnací}}\,\omega_{\text{rel}}$.
- **Reakce**: vykreslované a grafované složky $F_x, F_y, |F|$ jsou síla, kterou působí
  těleso A na těleso B; $M$ je vazbový moment vztažený k **bodu vazby** (u rotační
  vazby je proto nulový, u posuvné jde o skutečný reakční moment).

## Struktura kódu

```
index.html              rozvržení, pořadí skriptů
css/app.css             vzhled
js/core/                výpočetní jádro (nezávislé na DOM, testovatelné v Node)
  linalg.js             hustá lineární algebra, řešení rozšířené soustavy
  model.js              datový model (tělesa, vazby, zatížení) + hmotové vlastnosti
  constraints.js        elementární vazbové rovnice (Phi, Phi_q, nu, gamma)
  system.js             model -> soustava rovnic, zobecněné síly
  dynamics.js           pohybové rovnice, reakce, energie
  analysis.js           úloha polohy/rychlosti, stupně volnosti
  simulation.js         RK4 integrace, záznam snímků a časových řad
  serialize.js          JSON model, CSV výsledky
js/examples/examples.js knihovna ukázkových mechanismů
js/ui/                  uživatelské rozhraní
  dom.js                pomůcky pro DOM a formuláře
  viewport.js           transformace svět <-> obrazovka, zoom, posun
  renderer.js           vykreslení mechanismu, symbolů, vektorů
  editor.js             nástroje, výběr, přichytávání, tvorba prvků myší
  tree.js               strom modelu
  inspector.js          panely vlastností, nastavení, stavu
  plots.js              výběr veličin a grafy
  app.js                propojení všeho, běh analýzy, animace
tests/                  testy (Node) – pro běh aplikace nejsou potřeba
```

Jádro nepoužívá žádné globální stavy kromě jmenného prostoru `MBD`; každý modul je
IIFE, který do něj přidá jednu položku. Načítání je klasickými `<script>` tagy
(záměrně, aby aplikace fungovala i bez serveru) – pořadí je dané v `index.html`.

## Jak aplikaci rozšířit

**Nový typ vazby** (např. vetknutí, ozubený převod):
1. Pokud ji nelze složit z existujících primitiv, přidejte primitivum do
   `constraints.js` (metoda `evaluate` musí vyplnit `c`, `J`, `nu`, `gamma`).
2. V `system.js` doplňte větev v `Sys.build` – přidejte skupinu vazby přes `addGroup`.
3. V `renderer.js` přidejte symbol, v `inspector.js` formulář, v `editor.js` nástroj.

Reakce, grafy, sestavení i integrace pak fungují automaticky, protože pracují jen
s obecným rozhraním vazeb.

**Nový typ tělesa**: přidejte konstruktor do `model.js` (včetně `massOf`/`inertiaOf`),
vykreslení v `renderer.js` (`drawBody`) a test zásahu v `editor.js` (`hitBody`).

**Nové zatížení**: rozšiřte `Sys.generalizedForces` a `Model.loadValue`.

**Nový výstup do grafu**: v `simulation.js` ve funkci `buildSignals` přidejte řádek
`add(group, klíč, popis, jednotka, ctx => hodnota)`.

## Testy

```bash
node tests/core.test.js                       # fyzika: analytická řešení, energie, reakce
cd tests && npm install && node ui.test.js    # headless test UI (jsdom)
cd tests && node preview.js                   # vykreslí scény do PNG (kontrola grafiky)
```

`core.test.js` ověřuje mj.: $\alpha = -3g/2L$ a reakci $mg/4$ u uvolněné tyče,
zachování energie dvojkyvadla, hnací moment $m g (L/2)\cos\varphi$ při konstantní ω,
analytickou polohu pístu klikového mechanismu, výkonovou rovnováhu a úhel kulisy.

## Omezení a poznámky

- Úloha je **planární**; těžiště tyče leží v jejím středu (jinou polohu lze obejít
  ručním zadáním hmotnosti a momentu inercie, případně rozšířením modelu o offset).
- Není zahrnuto tření, pružiny/tlumiče ani kontakty – jsou to přímočará rozšíření
  přes `Sys.generalizedForces`.
- Staticky neurčité (redundantně vázané) soustavy se spočítají, ale rozdělení reakcí
  není jednoznačné; aplikace na to upozorní v panelu *Stav soustavy*.
- Integrace má pevný krok. Pro tuhé nebo rychlé mechanismy krok zmenšete
  (typicky 1e-3 až 1e-4 s).
