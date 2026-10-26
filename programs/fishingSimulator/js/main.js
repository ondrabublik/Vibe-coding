'use strict';
// Inicializace scény, světla, postupné načítání a hlavní smyčka.
(function (FS) {
  FS.uniforms = {
    uTime: { value: 0 },
    uMurkColor: { value: new THREE.Color(0.03, 0.045, 0.025) },
    uMurkK: { value: 2.3 },
    uGlare: { value: 1 },
    uClarity: { value: 1 },
  };

  const status = (t, p) => {
    document.getElementById('loadText').textContent = t;
    document.getElementById('loadFill').style.width = Math.round(p * 100) + '%';
  };
  const frame = () => new Promise((r) => setTimeout(r, 16));

  async function init() {
    if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
    const canvas = document.getElementById('game');
    const D = FS.Device;
    // televize mají slabé GPU – vyhlazování vypnuto a velké rozlišení se renderuje zmenšené
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !D.tv, powerPreference: 'high-performance' });
    const pixelRatio = () => (D.tv ? Math.min(1, 1280 / Math.max(1, window.innerWidth)) : 1);
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // slunce stojí a nic pohyblivého stín nevrhá – stínová mapa celého revíru se vykreslí jen jednou
    // (přepočítávání během hry způsobovalo pravidelné zaškobrtnutí snímků)
    renderer.shadowMap.autoUpdate = false;
    FS.renderer = renderer;

    const scene = new THREE.Scene();
    // hustší opar schová okraj terénu (W.extent) – svět není nekonečný
    scene.fog = new THREE.FogExp2(0xb9cde0, 0.0021);
    FS.scene = scene;
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 1500);
    camera.layers.enable(1); camera.layers.enable(2);

    FS.Game.load();
    status('Obloha a světlo…', 0.05); await frame();
    FS.Sky.create(scene);
    scene.environment = FS.Sky.envMap(renderer);
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.5);
    sun.castShadow = true;
    // pokrývá celý revír (World.bounds) i se stromy kolem; 4096 px ≈ 3,8 cm na texel
    const SH = D.low ? 2048 : 4096, SR = 78;
    sun.shadow.mapSize.set(SH, SH);
    const sc = sun.shadow.camera;
    sc.left = -SR; sc.right = SR; sc.top = SR; sc.bottom = -SR; sc.near = 1; sc.far = 420;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x56663a, 0.6));
    FS.sun = sun;

    status('Terén a rybník…', 0.15); await frame();
    FS.World.buildTerrain(scene);
    FS.World.buildPlatform(scene);
    FS.World.buildPath(scene);
    FS.World.buildRocks(scene);
    FS.World.buildFarm(scene);
    status('Voda…', 0.3); await frame();
    FS.Water.create(scene, renderer);
    FS.FX.init(scene);
    status('Tráva a rákosí…', 0.4); await frame();
    FS.Veg.buildGrass(scene);
    FS.Veg.buildReeds(scene);
    status('Stromy…', 0.55); await frame();
    FS.Veg.buildTrees(scene);
    FS.World.buildFence(scene);
    status('Stánek s rybářskými potřebami…', 0.68); await frame();
    FS.Shop.build(scene);
    status('Ryby…', 0.78); await frame();
    FS.FishAI.init(scene);
    FS.Birds.init(scene);
    status('Prut a vlasec…', 0.92); await frame();
    FS.Rod.init(scene);
    FS.Player.init(camera, canvas);
    FS.Player.update(0);
    FS.Controls.init();
    FS.Fishing.init();
    FS.UI.init();
    FS.Quests.init();
    FS.UI.refreshQuests();
    FS.Audio.setVolume(FS.Game.state.settings.vol);
    status('Hotovo', 1); await frame();

    // předkompilace shaderů
    renderer.compile(scene, camera);

    // Adaptivní rozlišení: když snímky nestíhají obnovu displeje (některé zůstanou na obrazovce
    // déle než jiné = trhání), vykresluje se v menším rozlišení. ?q=high ho vypne.
    const RS = { scale: 1, min: D.low ? 0.6 : 0.75, on: new URLSearchParams(location.search).get('q') !== 'high', t: 0, dts: [], good: 0, banUntil: {} };
    FS.renderScale = RS;
    let lastW = 0, lastH = 0;
    const fitSize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      if (!w || !h || (w === lastW && h === lastH)) return;
      lastW = w; lastH = h;
      renderer.setPixelRatio(pixelRatio() * RS.scale);
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      FS.Water.resize(renderer);
    };
    window.addEventListener('resize', fitSize);
    fitSize();

    document.getElementById('loading').style.display = 'none';
    document.getElementById('start').style.display = 'flex';
    document.getElementById('playBtn').addEventListener('click', () => {
      FS.Audio.init();
      FS.Audio.setVolume(FS.Game.state.settings.vol);
      document.getElementById('start').style.display = 'none';
      FS.Player.started = true;
      FS.Player.lock();
    });

    // stínová mapa celého revíru – jednou, vystředěná na revír
    {
      const B = FS.World.bounds;
      sun.position.set(B.cx + FS.Sky.sunDir.x * 200, FS.Sky.sunDir.y * 200, B.cz + FS.Sky.sunDir.z * 200);
      sun.target.position.set(B.cx, -2, B.cz);
      sun.target.updateMatrixWorld();
      renderer.shadowMap.needsUpdate = true;
    }

    function adaptResolution(dt, now) {
      if (!RS.on || dt > 0.1) return; // výpadky (skrytá karta) nepočítat
      RS.dts.push(dt); RS.t += dt;
      if (RS.t < 2) return;
      const dts = RS.dts.sort((a, b) => a - b);
      const base = dts[Math.floor(dts.length * 0.1)]; // ≈ interval obnovy displeje
      const mean = RS.t / dts.length, fps = 1 / mean;
      RS.t = 0; RS.dts = [];
      // vynechané obnovy: průměr výrazně nad nejkratším intervalem. Rovnoměrných 30 fps (úspora baterie)
      // nebo 50Hz monitor se tak nepočítají – tam snímky netrhají a nižší rozlišení by nepomohlo.
      const missing = mean > base * 1.12 && fps < 55;
      const smooth = mean <= base * 1.04;
      let next = RS.scale;
      if (missing && RS.scale > RS.min) {
        next = Math.max(RS.min, RS.scale - 0.1);
        RS.banUntil[RS.scale.toFixed(2)] = now + 30; // tuhle úroveň chvíli nezkoušet znovu
        RS.good = 0;
      } else if (smooth && RS.scale < 1) {
        RS.good++;
        const up = Math.min(1, RS.scale + 0.05);
        if (RS.good >= 2 && !(now < RS.banUntil[up.toFixed(2)])) { next = up; RS.good = 0; }
      } else RS.good = 0;
      if (next !== RS.scale) {
        RS.scale = next;
        renderer.setPixelRatio(pixelRatio() * RS.scale);
        renderer.setSize(window.innerWidth, window.innerHeight);
        FS.Water.resize(renderer);
      }
    }

    let fpsT = 0, fpsN = 0, lodX = 1e9, lodZ = 1e9, lastTs = 0;
    function loop(ts) {
      requestAnimationFrame(loop);
      fitSize();
      // krok podle časové značky snímku (svázané s obnovou displeje), ne podle chvíle, kdy doběhne kód
      if (ts === undefined) ts = performance.now();
      const rawDt = lastTs ? (ts - lastTs) / 1000 : 1 / 60;
      lastTs = ts;
      const dt = Math.min(0.05, Math.max(0, rawDt));
      adaptResolution(rawDt, ts / 1000);
      FS.uniforms.uTime.value += dt;
      const glasses = FS.Game.has('bryle');
      FS.uniforms.uGlare.value = glasses ? 0.45 : 1;
      FS.uniforms.uClarity.value = glasses ? 1.8 : 1;
      FS.uniforms.uMurkK.value = glasses ? 1.25 : 2.3;

      FS.Controls.update(dt);
      FS.Player.update(dt);
      if (!FS.Shop.open && FS.UI.modal !== 'catch') FS.Fishing.update(dt);
      FS.FishAI.update(dt);
      FS.Shop.update(dt);
      FS.Birds.update(dt);
      FS.FX.update(dt);
      FS.Audio.update(dt);
      FS.UI.update(dt);
      const near = !FS.Shop.open && !FS.UI.modal && FS.Shop.nearPlayer();
      FS.UI.prompt(near ? FS.dev('<b>[E]</b> Nakoupit ve stánku', 'Nakoupit ve stánku', '<b>[OK]</b> Nakoupit ve stánku') : null);

      // LOD stromů po krocích 4 m (levné, stínová mapa se kvůli tomu nepřekresluje)
      const cp = camera.position;
      const lx = Math.round(cp.x / 4) * 4, lz = Math.round(cp.z / 4) * 4;
      if (lx !== lodX || lz !== lodZ) { lodX = lx; lodZ = lz; FS.Veg.updateLOD(cp.x, cp.z); }
      FS.Sky.update(camera);
      camera.updateMatrixWorld();
      FS.Veg.update(camera);
      // odraz každý snímek – po jednom snímku by se při otáčení zpožďoval a snímky by byly střídavě těžké a lehké
      FS.Water.renderReflection(renderer, scene, camera);
      renderer.render(scene, camera);
      FS.Player.endFrame();

      fpsN++; fpsT += dt;
      if (fpsT > 1) { document.getElementById('fps').textContent = fpsN + ' fps' + (RS.scale < 1 ? ` · rozlišení ${Math.round(RS.scale * 100)} %` : ''); fpsN = 0; fpsT = 0; }
    }
    loop();
  }

  window.addEventListener('load', () => {
    init().catch((e) => {
      console.error(e);
      document.getElementById('loadText').textContent = 'Chyba při načítání: ' + e.message;
    });
  });
})(window.FS);
