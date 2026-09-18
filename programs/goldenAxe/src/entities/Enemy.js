import { Fighter } from './Fighter.js';
import { clamp, rand } from '../core/util.js';

// Generic melee enemy. Behaviour is tuned by the data in src/data/enemies.js.
// The game hands out "aggressive" tokens so only a couple of enemies attack at once;
// the others hover at a distance, like in the arcade original.
export class Enemy extends Fighter {
  constructor(game, def, x, z) {
    super(game, def, x, z, 'enemy');
    this.cooldown = rand(0.6, 1.4);
    this.think = 0;
    this.aggressive = !!def.boss;
    this.offX = 0;
    this.offZ = 0;
    this.entering = true;
    this.facing = x > game.camX ? -1 : 1;
  }

  makeAttack() {
    const d = this.def, w = d.windup;
    return {
      anim: d.attackAnim || 'slash',
      dur: w + 0.32, hitStart: w, hitEnd: w + 0.1,
      dmg: d.damage, reach: d.reach,
      knockdown: Math.random() < d.knockdownChance,
      force: d.boss ? 1.4 : 1,
    };
  }

  update(dt) {
    this.tickTimers(dt);
    if (this.state === 'grabbed') return; // position is driven by the grabber
    if (!this.updateCommon(dt)) this.think_(dt);
    this.physics(dt);
    this.clampToView();
  }

  think_(dt) {
    if (this.state === 'attack') {
      this.updateAttack();
      if (!this.attack || this.t >= this.attack.dur) {
        this.attack = null;
        this.setState('idle');
        this.cooldown = rand(this.def.cooldown[0], this.def.cooldown[1]);
      }
      return;
    }

    this.cooldown -= dt;
    this.think -= dt;
    const target = this.game.nearestPlayer(this);
    if (!target) {
      this.vx = this.vz = 0;
      this.setStateSoft('idle');
      return;
    }

    const dx = target.x - this.x, dz = target.z - this.z;
    const range = this.def.reach * 0.85;
    if (this.think <= 0) {
      this.think = rand(0.3, 0.7);
      const side = Math.sign(-dx) || 1;
      if (this.aggressive && target.isVulnerable()) {
        this.offX = side * range;
        this.offZ = 0;
      } else {
        this.offX = side * (range + rand(1.6, 3.2));
        this.offZ = rand(-1.4, 1.4);
      }
    }

    this.facing = Math.sign(dx) || this.facing;
    if (Math.abs(dx) < range + 0.15 && Math.abs(dz) < 0.3 && this.cooldown <= 0 && this.aggressive && target.isVulnerable()) {
      this.vx = this.vz = 0;
      this.startAttack(this.makeAttack());
      this.game.audio.play('swing');
      return;
    }

    const gx = target.x + this.offX - this.x;
    const gz = clamp(target.z + this.offZ, this.game.level.zMin, this.game.level.zMax) - this.z;
    const dist = Math.hypot(gx, gz);
    if (dist > 0.12) {
      const sp = this.def.speed * (this.aggressive ? 1 : 0.7);
      this.vx = (gx / dist) * sp;
      this.vz = (gz / dist) * sp * 0.8;
      this.setStateSoft('walk');
      this.walkPhase += dt * sp * 2.6;
    } else {
      this.vx = this.vz = 0;
      this.setStateSoft('idle');
    }
  }

  onKilled(attacker) {
    if (attacker.team === 'player') attacker.score += this.def.score;
    this.game.audio.play('die');
  }

  // Once an enemy has walked on screen it stays on screen.
  clampToView() {
    const g = this.game, hw = g.gfx.halfWidth() - 0.4;
    if (this.entering) {
      if (Math.abs(this.x - g.camX) < hw) this.entering = false;
      return;
    }
    this.x = clamp(this.x, g.camX - hw, g.camX + hw);
  }
}
