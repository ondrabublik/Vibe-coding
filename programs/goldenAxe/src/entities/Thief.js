import { Fighter } from './Fighter.js';
import { rand } from '../core/util.js';

// Little gnome with a sack of potions. Hitting him makes items drop; he never fights back.
export class Thief extends Fighter {
  constructor(game, def, x, z, drops = ['potion']) {
    super(game, def, x, z, 'enemy');
    this.drops = [...drops];
    this.ignoreForClear = true;
    this.fleeing = false;
    this.dir = x < game.camX ? 1 : -1;
    this.facing = this.dir;
    this.life = 0;
    this.zTarget = rand(game.level.zMin, game.level.zMax);
  }

  update(dt) {
    this.tickTimers(dt);
    this.life += dt;
    if (!this.updateCommon(dt)) this.run(dt);
    this.physics(dt);

    const g = this.game, hw = g.gfx.halfWidth();
    if (this.fleeing && Math.abs(this.x - g.camX) > hw + 2) this.removed = true;
  }

  run(dt) {
    const g = this.game, hw = g.gfx.halfWidth();
    if (!this.fleeing) {
      if (this.life > 15) this.fleeing = true;
      // run back and forth across the screen
      if (this.x > g.camX + hw - 1 && this.life > 2) this.dir = -1;
      if (this.x < g.camX - hw + 1 && this.life > 2) this.dir = 1;
    }
    if (Math.abs(this.z - this.zTarget) < 0.2) this.zTarget = rand(g.level.zMin, g.level.zMax);
    const sp = this.def.speed * (this.fleeing ? 1.4 : 1);
    this.vx = this.dir * sp;
    this.vz = Math.sign(this.zTarget - this.z) * sp * 0.4;
    this.facing = this.dir;
    this.walkPhase += dt * 16;
    this.setStateSoft('run');
  }

  takeHit(attacker, dmg, o = {}) {
    if (!this.isVulnerable()) return false;
    this.flash = 0.12;
    const dir = o.dir || Math.sign(this.x - attacker.x) || 1;
    const item = this.drops.shift();
    if (item) this.game.spawnPickup(item, this.x, this.z, -dir * 2);
    this.knockdown(dir, 0.8);
    this.game.audio.play('hit');
    if (this.drops.length === 0) {
      this.fleeing = true;
      this.dir = dir;
    }
    return true;
  }
}
