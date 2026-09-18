# Golden Axe – lightweight remake

Beat 'em up v prohlížeči (three.js, ES moduly, bez build kroku a bez backendu). Veškerá grafika i zvuky jsou generované kódem.

Spuštění: `startServer.bat` (PHP built-in server na http://localhost:8000) – moduly nejdou otevřít přes `file://`.

Ovládání: šipky/WASD pohyb, 2× ←/→ běh, `J` útok, `K`/mezerník skok, `L` magie, `Esc` pauza.

## Struktura

| Soubor | Účel |
|---|---|
| `src/core/Game.js` | stavy hry, smyčka s pevným krokem 60 Hz, spawn entit, kamera, **seznam levelů `LEVELS`** |
| `src/core/Input.js` | klávesy → akce (`left`, `attack`, …); sem přidat gamepad/dotyk |
| `src/entities/Fighter.js` | společný základ bojovníků (fyzika, zásahy, pád, vstávání) |
| `src/entities/Player.js` | ovládání hráče, kombo, hod, běh, magie, životy |
| `src/entities/Enemy.js` / `Thief.js` / `Pickup.js` | AI nepřátel, zloděj s lahvičkami, sbíratelné předměty |
| `src/combat/Combat.js` | detekce zásahů v 2.5D, magie, rozdělování „agresivních“ nepřátel |
| `src/render/CharacterModel.js` + `Animator.js` | procedurální low-poly postava a pózy podle stavu |
| `src/render/Effects.js` | částice, blesky, záblesk obrazovky |
| `src/world/Level.js` + `Props.js` | stavba levelu z dat, kulisy, skript vln |
| `src/data/*` | **data**: postavy, nepřátelé, levely |

## Jak rozšiřovat

- **Nový level:** zkopíruj `src/data/levels/level1.js`, uprav vlny/kulisy a přidej ho do `LEVELS` v `Game.js`
  (po `STAGE CLEAR` pak stačí spustit `startLevel(idx + 1, …)` místo návratu do menu).
- **Nový nepřítel:** přidej záznam do `src/data/enemies.js` (model se skládá z parametrů `CharacterModel`).
  Speciální chování = podtřída `Enemy`, zaregistrovaná ve `Game.spawnEnemy`.
- **Nová postava:** záznam v `src/data/characters.js` (typ magie: `fire` / `lightning` / `earth`, nebo nový v `Effects.magic`).
- **3D modely místo primitiv:** třída se stejným rozhraním jako `CharacterModel` (`root`, `applyPose`, `setFacing`, `setFlash`, `dispose`).
