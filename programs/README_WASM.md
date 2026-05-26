# LBM WASM Implementation

Tento projekt obsahuje implementaci LBM (Lattice Boltzmann Method) simulace s paralelním výpočtem pomocí WebAssembly a Web Workerů.

## Struktura projektu

- `LBM.html` - Hlavní HTML soubor s UI a integrací workeru
- `lbm-worker.js` - Web Worker pro paralelní výpočet
- `lbm-wasm/` - Rust projekt pro WASM modul
  - `Cargo.toml` - Konfigurace Rust projektu
  - `src/lib.rs` - Rust implementace LBM výpočtu

## Požadavky

1. **Rust** - pro kompilaci WASM modulu
   - Instalace: https://www.rust-lang.org/tools/install
   
2. **wasm-pack** - nástroj pro kompilaci Rust do WASM
   ```bash
   cargo install wasm-pack
   ```

3. **Web server s podporou SharedArrayBuffer**
   - SharedArrayBuffer vyžaduje specifické HTTP hlavičky:
     - `Cross-Origin-Embedder-Policy: require-corp`
     - `Cross-Origin-Opener-Policy: same-origin`
   - Můžete použít například:
     ```bash
     python -m http.server 8000 --header "Cross-Origin-Embedder-Policy: require-corp" --header "Cross-Origin-Opener-Policy: same-origin"
     ```
   - Nebo použít `serve` s konfigurací:
     ```bash
     npx serve . --cors
     ```

## Kompilace WASM modulu

1. Přejděte do adresáře `lbm-wasm`:
   ```bash
   cd lbm-wasm
   ```

2. Zkompilujte WASM modul:
   ```bash
   wasm-pack build --target web --out-dir pkg
   ```

3. Výstup bude v `lbm-wasm/pkg/` adresáři

## Použití

1. Zkompilujte WASM modul (viz výše)

2. Spusťte web server s požadovanými hlavičkami

3. Otevřete `LBM.html` v prohlížeči

4. Pokud je SharedArrayBuffer podporován, výpočet poběží paralelně ve workeru pomocí WASM

## Fallback

Pokud SharedArrayBuffer není podporován nebo worker selže, aplikace automaticky přepne na původní JavaScript implementaci.

## Poznámky

- SharedArrayBuffer je podporován pouze v moderních prohlížečích s povolenými bezpečnostními hlavičkami
- Pro lokální vývoj může být potřeba použít HTTPS nebo správně nakonfigurovaný web server
- WASM modul poskytuje výrazně lepší výkon než čistý JavaScript, zejména pro větší mřížky
