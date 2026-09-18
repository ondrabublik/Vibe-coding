import { Input } from './Input.js';
import { AudioFx } from './Audio.js';
import { GameScene } from '../render/Scene.js';
import { Effects } from '../render/Effects.js';
import { Combat } from '../combat/Combat.js';
import { Level } from '../world/Level.js';
import { Player } from '../entities/Player.js';
import { Enemy } from '../entities/Enemy.js';
import { Thief } from '../entities/Thief.js';
import { Pickup } from '../entities/Pickup.js';
import { HUD } from '../ui/HUD.js';
import { Menus } from '../ui/Menus.js';
import { Showcase } from '../ui/Showcase.js';
import { CHARACTERS } from '../data/characters.js';
import { ENEMIES } from '../data/enemies.js';
import level1 from '../data/levels/level1.js';

const STEP = 1 / 60;
// Register new levels here.
const LEVELS = [level1];

// Game states: title → select → playing ⇄ paused → gameover | clear
export class Game {
  constructor(canvas) {
    this.input = new Input();
    this.audio = new AudioFx();
    this.gfx = new GameScene(canvas);
    this.effects = new Effects(this);
    this.combat = new Combat(this);
    this.hud = new HUD();
    this.menus = new Menus();
    this.showcase = new Showcase(this.gfx, CHARACTERS);
    this.menus.buildCards(CHARACTERS);

    this.level = null;
    this.levelIdx = 0;
    this.players = [];
    this.enemies = [];
    this.pickups = [];
    this.timers = [];
    this.time = 0;
    this.hitStop = 0;
    this.camX = 0;
    this.camTargetX = 0;
    this.aiTimer = 0;
    this.selected = 0;

    this.setState('title');
    this.last = performance.now();
    this.acc = 0;
    requestAnimationFrame(this.frame);
  }

  setState(s) {
    this.state = s;
    const screen = { title: 'title', select: 'select', paused: 'pause', gameover: 'gameover', clear: 'clear' }[s] || null;
    this.menus.show(screen);
    this.hud.show(s === 'playing' || s === 'paused' || s === 'gameover');
    if (s === 'select') this.menus.select(this.selected);
  }

  frame = (now) => {
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.acc += dt;
    while (this.acc >= STEP) {
      this.step(STEP);
      this.acc -= STEP;
    }
    this.render(dt);
    requestAnimationFrame(this.frame);
  };

  step(dt) {
    this.time += dt;
    let consumeInput = true;
    switch (this.state) {
      case 'title': this.stepTitle(); break;
      case 'select': this.stepSelect(); break;
      case 'playing': consumeInput = this.stepPlaying(dt); break;
      case 'paused':
        if (this.input.pressed('pause') || this.input.pressed('start')) this.setState('playing');
        break;
      case 'gameover': this.stepGameOver(dt); break;
      case 'clear':
        if (this.input.pressed('start')) { this.audio.play('confirm'); this.toTitle(); }
        break;
    }
    if (consumeInput) this.input.endStep();
  }

  render(dt) {
    if (this.state === 'title' || this.state === 'select') {
      this.showcase.update(dt, this.state, this.selected);
      this.showcase.render();
    } else {
      this.gfx.render();
    }
  }

  // ---------------------------------------------------------------- menus
  stepTitle() {
    if (this.input.pressed('start') || this.input.pressed('attack')) {
      this.audio.play('confirm');
      this.setState('select');
    }
  }

  stepSelect() {
    const inp = this.input;
    const n = CHARACTERS.length;
    if (inp.pressed('left')) { this.selected = (this.selected + n - 1) % n; this.menus.select(this.selected); this.audio.play('select'); }
    if (inp.pressed('right')) { this.selected = (this.selected + 1) % n; this.menus.select(this.selected); this.audio.play('select'); }
    if (inp.pressed('pause')) this.setState('title');
    if (inp.pressed('start') || inp.pressed('attack')) {
      this.audio.play('confirm');
      this.startLevel(0, CHARACTERS[this.selected]);
    }
  }

  // ---------------------------------------------------------------- world
  clearWorld() {
    for (const e of [...this.players, ...this.enemies, ...this.pickups]) e.dispose();
    this.players = [];
    this.enemies = [];
    this.pickups = [];
    this.timers = [];
    this.effects.clear();
    this.level?.dispose();
    this.level = null;
    this.hud.setBoss(null);
  }

  startLevel(idx, charDef) {
    this.clearWorld();
    this.levelIdx = idx;
    this.level = new Level(this, LEVELS[idx]);
    const player = new Player(this, charDef, 1, 0);
    this.players.push(player);
    this.camX = this.camTargetX = 6;
    this.hitStop = 0;
    this.hud.setPlayer(player);
    this.setState('playing');
    this.hud.message(LEVELS[idx].name, 2.5, 'stage');
    this.schedule(2.6, () => { if (!this.level.wave) this.hud.go(); });
  }

  spawnEnemy(type, x, z, extra) {
    const def = ENEMIES[type];
    const e = def.thief ? new Thief(this, def, x, z, extra) : new Enemy(this, def, x, z);
    this.enemies.push(e);
    return e;
  }

  spawnPickup(type, x, z, vx) {
    this.pickups.push(new Pickup(this, type, x, z, vx));
  }

  nearestPlayer(from) {
    let best = null, bestD = Infinity;
    for (const p of this.players) {
      if (!p.alive || p.respawnPending) continue;
      const d = Math.abs(p.x - from.x) + Math.abs(p.z - from.z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  schedule(delay, fn) {
    this.timers.push({ t: delay, fn });
  }

  // Returns false during hit-stop so button presses are not lost.
  stepPlaying(dt) {
    if (this.input.pressed('pause')) { this.setState('paused'); return true; }
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      return false;
    }

    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); }
    }

    this.aiTimer -= dt;
    if (this.aiTimer <= 0) { this.aiTimer = 0.4; this.combat.assignAggression(); }

    this.level.update(dt);
    for (const p of this.players) p.update(dt);
    for (const e of this.enemies) e.update(dt);
    for (const k of this.pickups) k.update(dt);
    this.effects.update(dt);

    this.enemies = this.prune(this.enemies);
    this.pickups = this.prune(this.pickups);

    this.updateCamera(dt);
    for (const f of this.players) f.syncModel(dt);
    for (const f of this.enemies) f.syncModel(dt);
    for (const k of this.pickups) k.syncModel(dt);
    this.gfx.update(dt);
    if (this.players[0]) this.hud.update(this.players[0], dt);
    return true;
  }

  prune(list) {
    if (!list.some((e) => e.removed)) return list;
    return list.filter((e) => {
      if (e.removed) e.dispose();
      return !e.removed;
    });
  }

  updateCamera(dt) {
    const p = this.players[0];
    if (!p) return;
    const maxX = this.level.cameraMaxX();
    // the camera only ever scrolls forward, like the arcade
    this.camTargetX = Math.max(this.camTargetX, Math.min(p.x + 1.5, maxX));
    this.camX += (this.camTargetX - this.camX) * (1 - Math.exp(-dt * 5));
    this.gfx.camX = this.camX;
  }

  // ---------------------------------------------------------------- flow
  onPlayerDeath(p) {
    if (p.lives > 0) {
      this.schedule(0.4, () => p.respawn(this.camX - this.gfx.halfWidth() * 0.4));
    } else {
      this.continueTimer = 9.99;
      this.setState('gameover');
    }
  }

  stepGameOver(dt) {
    this.continueTimer -= dt;
    this.menus.setContinue(Math.max(0, Math.floor(this.continueTimer)));
    if (this.input.pressed('start')) {
      const p = this.players[0];
      p.lives = 3;
      p.score = 0;
      p.respawn(this.camX - this.gfx.halfWidth() * 0.4);
      this.audio.play('confirm');
      this.setState('playing');
    } else if (this.continueTimer <= 0) {
      this.toTitle();
    }
  }

  onLevelComplete() {
    const p = this.players[0];
    this.hud.message('STAGE CLEAR', 3, 'stage');
    this.audio.play('fanfare');
    this.schedule(3, () => {
      const potionBonus = p.potions * 1000;
      const lifeBonus = p.lives * 2000;
      p.score += potionBonus + lifeBonus;
      this.menus.setClearStats([
        ['MAGIE BONUS', potionBonus],
        ['ŽIVOTY BONUS', lifeBonus],
        ['SKÓRE', p.score],
      ]);
      this.setState('clear');
    });
  }

  toTitle() {
    this.clearWorld();
    this.setState('title');
  }
}
