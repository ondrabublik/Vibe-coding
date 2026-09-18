import { CharacterModel } from '../render/CharacterModel.js';
import { Animator } from '../render/Animator.js';
import { clamp } from '../core/util.js';

export const GRAVITY = -26;
const DOWN_STATES = new Set(['knockdown', 'down', 'getup', 'dead', 'grabbed']);
let nextId = 1;

// Shared base for everything that fights: players, enemies, thieves.
// World axes: x = along the level, z = depth of the walkable band, y = height (jumps).
export class Fighter {
  constructor(game, def, x, z, team) {
    this.id = nextId++;
    this.game = game;
    this.def = def;
    this.team = team;
    this.x = x; this.y = 0; this.z = z;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.facing = 1;
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.state = 'idle';
    this.t = 0;
    this.invuln = 0;
    this.flash = 0;
    this.attack = null;
    this.hitSet = new Set();
    this.walkPhase = 0;
    this.dying = false;
    this.removed = false;

    this.model = new CharacterModel(def.model);
    this.animator = new Animator(this.model);
    game.gfx.scene.add(this.model.root);
    const m = def.model || {};
    this.shadowSize = 0.42 * (m.scale || 1) * Math.sqrt(m.bulk || 1);
    this.shadow = game.gfx.makeBlobShadow(this.shadowSize);
  }

  get alive() { return !this.dying && this.hp > 0; }

  setState(s) { this.state = s; this.t = 0; }
  setStateSoft(s) { if (this.state !== s) this.setState(s); }

  isVulnerable() {
    return this.invuln <= 0 && !this.dying && !DOWN_STATES.has(this.state);
  }

  startAttack(spec) {
    this.attack = spec;
    this.hitSet.clear();
    this.setState(spec.state || 'attack');
  }

  // Checks the active window of the current attack against targets.
  updateAttack() {
    const a = this.attack;
    if (a && this.t >= a.hitStart && this.t <= a.hitEnd) this.game.combat.resolveAttack(this, a);
  }

  tickTimers(dt) {
    this.t += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.flash = Math.max(0, this.flash - dt);
  }

  physics(dt) {
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    if (this.y > 0 || this.vy > 0) {
      this.vy += GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.onLand();
      }
    }
    const L = this.game.level;
    this.z = clamp(this.z, L.zMin, L.zMax);
  }

  onLand() {
    if (this.state === 'jump' || this.state === 'jumpAttack') {
      this.vx = 0; this.vz = 0;
      this.attack = null;
      this.setState('idle');
      this.game.effects.dust(this.x, this.z, 4);
    }
  }

  // States that take control away from the player / AI. Returns true if handled.
  updateCommon(dt) {
    switch (this.state) {
      case 'hurt':
        this.vx *= Math.pow(0.02, dt);
        if (this.t > this.hurtTime) this.setState('idle');
        return true;
      case 'knockdown':
        if (this.y <= 0 && this.vy === 0 && this.t > 0.05) {
          this.vx = 0; this.vz = 0;
          this.setState('down');
          this.game.effects.dust(this.x, this.z, 10);
          this.game.gfx.shake(0.12, 0.12);
          this.game.audio.play('thud');
        }
        return true;
      case 'down':
        if (this.t > (this.dying ? 0.5 : 0.7)) this.setState(this.dying ? 'dead' : 'getup');
        return true;
      case 'getup':
        if (this.t > 0.45) {
          this.setState('idle');
          this.invuln = Math.max(this.invuln, this.team === 'player' ? 1.0 : 0.25);
        }
        return true;
      case 'dead':
        if (this.t > 1.2) this.onDeath();
        return true;
      case 'grabbed':
        return true;
    }
    return false;
  }

  takeHit(attacker, dmg, o = {}) {
    if (!this.isVulnerable()) return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.flash = 0.12;
    const dir = o.dir || Math.sign(this.x - attacker.x) || 1;
    if (this.hp <= 0) {
      this.dying = true;
      this.knockdown(dir, 1.25);
      this.onKilled(attacker);
      return true;
    }
    if (o.knockdown || this.y > 0.1) {
      this.knockdown(dir, o.force || 1);
    } else if (this.def.superArmor && ++this.armorHits % 3 !== 0) {
      // heavy enemies shrug off most light hits and keep attacking
      return true;
    } else {
      this.setState('hurt');
      this.facing = -dir;
      this.attack = null;
      this.hurtTime = 0.32;
      this.vx = dir * 1.6;
      this.vz = 0;
    }
    return true;
  }

  knockdown(dir, force = 1) {
    const heavy = this.def.superArmor ? 0.6 : 1;
    this.facing = -dir;
    this.attack = null;
    this.setState('knockdown');
    this.vx = dir * 4 * force * heavy;
    this.vy = 6.5 * Math.min(1.2, force);
    this.vz = 0;
    this.y = Math.max(this.y, 0.01);
  }

  onKilled() {}
  onDeath() { this.removed = true; }

  animState() {
    return { state: this.state, t: this.t, time: this.game.time, phase: this.walkPhase, vy: this.vy, attack: this.attack };
  }

  syncModel(dt) {
    const root = this.model.root;
    root.position.set(this.x, this.y, this.z);
    this.model.setFacing(this.facing);
    this.animator.update(this.animState(), dt);
    this.model.setFlash(this.flash > 0 ? 0.9 : 0);
    const blink = (this.invuln > 0 && this.team === 'player' && this.state !== 'magic') || this.state === 'dead';
    root.visible = !blink || Math.floor(this.game.time * 16) % 2 === 0;
    this.shadow.position.set(this.x, 0.03, this.z);
    this.shadow.scale.setScalar(this.shadowSize / (1 + this.y * 0.35));
  }

  dispose() {
    this.model.dispose();
    this.shadow.removeFromParent();
  }
}

Fighter.prototype.armorHits = 0;
