# LBM Paralelní výpočet pomocí Web Workerů

Tento projekt obsahuje paralelizovanou implementaci LBM (Lattice Boltzmann Method) simulace pomocí Web Workerů a SharedArrayBuffer.

## Funkce

- **Paralelní výpočet**: LBM výpočet je rozdělen mezi více Web Workerů
- **Nastavitelný počet workerů**: Uživatel může nastavit počet workerů (1-16) pomocí slideru
- **SharedArrayBuffer**: Používá SharedArrayBuffer pro efektivní sdílení dat mezi hlavním vláknem a workery
- **Automatický fallback**: Pokud SharedArrayBuffer není podporován, automaticky přepne na single-threaded režim

## Požadavky

### HTTP hlavičky pro SharedArrayBuffer

SharedArrayBuffer vyžaduje specifické HTTP hlavičky. Pro lokální vývoj můžete použít:

**1. Node.js server (doporučeno):**
```bash
node server.js
```
Server běží na `http://localhost:8000` s automaticky nastavenými hlavičkami.

**2. Python HTTP server:**
```bash
python -m http.server 8000
```
⚠️ **Poznámka:** Python server nepodporuje SharedArrayBuffer bez další konfigurace. Použijte Node.js server.

**3. serve (npm package):**
```bash
npx serve . --cors
```
⚠️ **Poznámka:** `serve` nemusí automaticky nastavit požadované hlavičky. Použijte `server.js`.

### Proč jsou hlavičky potřeba?

SharedArrayBuffer je bezpečnostní funkce, která vyžaduje:
- `Cross-Origin-Embedder-Policy: require-corp` - izoluje kontext
- `Cross-Origin-Opener-Policy: same-origin` - zabraňuje cross-origin útokům

Bez těchto hlaviček prohlížeč SharedArrayBuffer zablokuje a aplikace přepne na single-threaded režim.

### Prohlížeč

- Chrome/Edge: Podporuje SharedArrayBuffer s požadovanými hlavičkami
- Firefox: Podporuje SharedArrayBuffer s požadovanými hlavičkami
- Safari: Podporuje SharedArrayBuffer s požadovanými hlavičkami

## Použití

1. **Spusťte web server:**
   ```bash
   node server.js
   ```

2. **Otevřete prohlížeč:**
   ```
   http://localhost:8000/LBM.html
   ```

3. **Zkontrolujte stav SharedArrayBuffer:**
   - V UI uvidíte zelenou zprávu "✓ SharedArrayBuffer supported" pokud je vše v pořádku
   - Pokud vidíte žlutou zprávu, zkontrolujte, že server běží správně

4. **Nastavte počet workerů:**
   - Použijte slider "Number of workers" (1-16)
   - **1 worker**: Single-threaded režim (fallback)
   - **2-4 workery**: Dobrý kompromis mezi výkonem a overhead
   - **8-16 workerů**: Maximální výkon pro větší mřížky

5. **Počet workerů můžete měnit za běhu** - aplikace automaticky re-inicializuje workery

## Jak to funguje

1. **Rozdělení práce**: Mřížka je rozdělena na horizontální pásy, každý worker zpracovává svůj pás řádků

2. **SharedArrayBuffer**: Všechna data (f, fNext, rho, ux, uy, isWall) jsou uložena v SharedArrayBuffer, který je sdílen mezi všemi workery a hlavním vláknem

3. **Synchronizace**: Hlavní vlákno čeká na dokončení všech workerů před pokračováním v renderování

4. **Boundary conditions**: Inlet a outlet jsou zpracovány pouze workery, které obsahují příslušné řádky

## Výkon

Paralelizace poskytuje výrazné zlepšení výkonu, zejména pro:
- Větší mřížky (např. 400x200 a více)
- Více kroků na snímek
- Více workerů (až do určitého limitu, pak overhead převáží)

Typické zlepšení:
- 2 workery: ~1.5-1.8x rychleji
- 4 workery: ~2.5-3x rychleji
- 8 workerů: ~4-5x rychleji (pro velké mřížky)

## Poznámky

- Pokud SharedArrayBuffer není podporován, aplikace automaticky přepne na single-threaded režim
- Příliš mnoho workerů může způsobit overhead kvůli synchronizaci
- Optimální počet workerů závisí na velikosti mřížky a výkonu CPU
