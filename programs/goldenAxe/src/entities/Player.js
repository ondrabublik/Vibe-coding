import { Fighter } from './Fighter.js';
import { clamp, smooth } from '../core/util.js';

const JUMP_V = 8.5;
const COMBO_WINDOW = 0.45;
const MAX_POTIONS = 9;

export class Player extends Fighter {
  constructor(game, def, x, z) {
    super(game, def, x, z, 'player');
    this.lives = 3;
    this.potions = 0;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.lastHitLanded = false;
    this.buffered = false;
    this.jumpAttacked = false;
    this.respawnPending = false;
  }

  // Attack table – values scale with the character's stats.
  atk(kind) {
    const D = this.def.damage, R = this.def.reach;
    switch (kind) {
      case 'combo0': return { anim: 'slash', dur: 0.34, hitStart: 0.13, hitEnd: 0.21, dmg: D, reach: R };
      case 'combo1': return { anim: 'thrust', dur: 0.34, hitStart: 0.12, hitEnd: 0.2, dmg: D, reach: R + 0.15 };
      case 'combo2': return { anim: 'overhead', dur: 0.55, hitStart: 0.24, hitEnd: 0.34, dmg: D * 1.6, reach: R + 0.1, knockdown: true };
      case 'run': return { state: 'runAttack', anim: 'charge', dur: 0.5, hitStart: 0.03, hitEnd: 0.32, dmg: D * 1.3, reach: R * 0.8, knockdown: true, force: 1.2 };
      case 'jump': return { state: 'jumpAttack', anim: 'jumpSlash', dur: 0.35, hitStart: 0.06, hitEnd: 99, dmg: D * 1.4, reach: R, knockdown: true };
    }
  }

  update(dt) {
    const inp = this.game.input;
    this.tickTimers(dt);
    this.comboTimer -= dt;
    // remember a magic press briefly so it isn't lost mid-attack
    this.magicBuffer = inp.pressed('magic') ? 0.35 : Math.max(0, (this.magicBuffer || 0) - dt);

    if (!this.updateCommon(dt)) {
      switch (this.state) {
        case 'idle': case 'walk': case 'run': this.controlGround(dt, inp); break;
        case 'jump': this.controlAir(inp); break;
        case 'jumpAttack': this.updateAttack(); break;
        case 'attack': case 'runAttack': this.updateAttackState(dt, inp); break;
        case 'throw': this.updateThrow(); break;
        case 'magic': this.updateMagic(); break;
      }
    }
    this.physics(dt);
    this.clampToView();
  }

  controlGround(dt, inp) {
    const ix = inp.axisX(), iz = inp.axisZ();
    if (inp.pressed('jump')) {
      const run = this.state === 'run';
      this.vy = JUMP_V;
      this.y = 0.001;
      this.vx = ix * this.def.speed * (run ? 1.8 : 1);
      this.vz = iz * this.def.speed * 0.5;
      this.jumpAttacked = false;
      this.setState('jump');
      this.game.audio.play('jump');
      return;
    }
    if (inp.pressed('attack')) {
      if (this.state === 'run') {
        this.startAttack(this.atk('run'));
        this.vx = this.facing * this.def.speed * 2.1;
        this.vz = 0;
        this.game.audio.play('swing');
      } else {
        this.beginCombo();
      }
      return;
    }
    if (this.magicBuffer > 0 && this.potions > 0) {
      this.castMagic();
      return;
    }

    const running = inp.runDir !== 0 && ix === inp.runDir;
    const sp = this.def.speed * (running ? 1.9 : 1);
    this.vx = ix * sp;
    this.vz = iz * this.def.speed * 0.65;
    if (ix) this.facing = ix;
    const moving = ix !== 0 || iz !== 0;
    this.setStateSoft(moving ? (running ? 'run' : 'walk') : 'idle');
    if (moving) this.walkPhase += dt * (running ? 13 : 9);
  }

  controlAir(inp) {
    if (inp.pressed('attack') && !this.jumpAttacked) {
      this.jumpAttacked = true;
      this.startAttack(this.atk('jump'));
      this.game.audio.play('swing');
    }
  }

  beginCombo() {
    const chain = this.comboTimer > 0 && this.lastHitLanded;
    this.combo = chain ? Math.min(this.combo + 1, 2) : 0;
    this.lastHitLanded = false;
    this.vx = 0; this.vz = 0;
    if (this.combo === 2) {
      const target = this.game.combat.findGrabTarget(this);
      if (target) { this.startThrow(target); return; }
    }
    this.startAttack(this.atk('combo' + this.combo));
    this.game.audio.play('swing');
  }

  updateAttackState(dt, inp) {
    this.updateAttack();
    if (this.state === 'runAttack') this.vx *= Math.pow(0.03, dt);
    if (inp.pressed('attack') && this.t > this.attack.hitStart) this.buffered = true;
    if (this.t >= this.attack.dur) {
      const finisher = this.state === 'runAttack' || this.combo === 2;
      this.comboTimer = finisher ? 0 : COMBO_WINDOW;
      this.vx = 0;
      this.attack = null;
      this.setState('idle');
      if (this.buffered) { this.buffered = false; this.beginCombo(); }
    }
  }

  onHitLanded() {
    this.lastHitLanded = true;
    this.score += 10;
  }

  // --- grab & throw (3rd combo hit on a close enemy)
  startThrow(target) {
    this.grabTarget = target;
    target.setState('grabbed');
    target.vx = target.vy = target.vz = 0;
    target.facing = -this.facing;
    this.setState('throw');
    this.game.audio.play('grab');
  }

  updateThrow() {
    const g = this.grabTarget;
    if (g && g.state === 'grabbed') {
      if (this.t < 0.32) {
        const k = smooth(this.t / 0.32);
        g.x = this.x + this.facing * 0.6 * (1 - k);
        g.y = 1.8 * Math.sin((k * Math.PI) / 2);
        g.z = this.z + 0.01;
      } else {
        g.x = this.x - this.facing * 0.4;
        g.setState('idle'); // release so the hit registers
        g.takeHit(this, this.def.damage * 2, { knockdown: true, dir: -this.facing, force: 1.3 });
        this.score += 50;
        this.game.audio.play('hit');
        this.game.gfx.shake(0.15, 0.15);
        this.grabTarget = null;
      }
    }
    if (this.t > 0.55) {
      this.grabTarget = null;
      this.comboTimer = 0;
      this.setState('idle');
    }
  }

  // --- magic
  castMagic() {
    this.magicBuffer = 0;
    this.magicLevel = Math.min(this.potions, this.def.magic.max);
    this.potions = 0;
    this.magicFired = false;
    this.vx = this.vz = 0;
    this.invuln = Math.max(this.invuln, 2.0);
    this.setState('magic');
    this.game.audio.play('magic');
  }

  updateMagic() {
    if (!this.magicFired && this.t > 0.45) {
      this.magicFired = true;
      this.game.combat.castMagic(this, this.magicLevel);
    }
    if (this.t > 1.4) this.setState('idle');
  }

  addPotion() { this.potions = Math.min(MAX_POTIONS, this.potions + 1); }
  heal(amount) { this.hp = Math.min(this.maxHp, this.hp + amount); }

  // a throw can't be interrupted, otherwise the grabbed enemy would stay stuck
  isVulnerable() {
    return this.state !== 'throw' && super.isVulnerable();
  }

  takeHit(attacker, dmg, o) {
    const hit = super.takeHit(attacker, dmg, o);
    if (hit) this.game.audio.play(this.hp <= 0 ? 'die' : 'hurt');
    return hit;
  }

  onDeath() {
    if (this.respawnPending) return;
    this.respawnPending = true;
    this.game.onPlayerDeath(this);
  }

  respawn(x) {
    this.lives--;
    this.hp = this.maxHp;
    this.dying = false;
    this.respawnPending = false;
    this.x = x; this.z = 0; this.y = 5;
    this.vx = this.vy = this.vz = 0;
    this.attack = null;
    this.combo = 0;
    this.setState('jump');
    this.jumpAttacked = true;
    this.invuln = 3;
  }

  // The player can't leave the visible screen (the camera never scrolls back).
  clampToView() {
    const g = this.game, hw = g.gfx.halfWidth();
    this.x = clamp(this.x, g.camX - hw + 0.6, g.camX + hw - 0.6);
  }
}
