// Hit detection in 2.5D: reach along x in the facing direction, a tolerance band in z
// (depth) and a height tolerance for jump attacks.
const DEPTH_TOLERANCE = 0.55;
const HEIGHT_TOLERANCE = 1.6;
const MAX_ATTACKERS = 2;

export class Combat {
  constructor(game) {
    this.game = game;
  }

  targetsOf(f) {
    return f.team === 'player' ? this.game.enemies : this.game.players;
  }

  resolveAttack(att, a) {
    const g = this.game;
    for (const t of this.targetsOf(att)) {
      if (att.hitSet.has(t) || !t.isVulnerable()) continue;
      const dx = (t.x - att.x) * att.facing;
      if (dx < -0.3 || dx > a.reach) continue;
      if (Math.abs(t.z - att.z) > (a.depth || DEPTH_TOLERANCE)) continue;
      if (Math.abs(t.y - att.y) > HEIGHT_TOLERANCE) continue;
      att.hitSet.add(t);
      if (!t.takeHit(att, a.dmg, { knockdown: a.knockdown, dir: att.facing, force: a.force })) continue;
      att.onHitLanded?.(t);
      g.effects.sparks((t.x + att.x) / 2 + att.facing * 0.3, 1.2 + t.y, t.z + 0.3, 0xfff0a0, a.knockdown ? 16 : 10);
      if (!t.def.thief) g.audio.play('hit');
      g.hitStop = Math.max(g.hitStop, a.knockdown ? 0.09 : 0.05);
      if (a.knockdown) g.gfx.shake(0.18, 0.12);
    }
  }

  findGrabTarget(p) {
    for (const e of this.game.enemies) {
      if (e.def.grabbable === false || !e.isVulnerable() || e.y > 0.1) continue;
      const dx = (e.x - p.x) * p.facing;
      if (dx > -0.2 && dx < 1.0 && Math.abs(e.z - p.z) < 0.4) return e;
    }
    return null;
  }

  // Refresh which enemies may actively attack each player.
  assignAggression() {
    const g = this.game;
    const target = g.players.find((p) => p.alive);
    const list = g.enemies.filter((e) => !e.def.thief && e.alive && !e.def.boss);
    if (!target) return;
    list.sort((a, b) => Math.abs(a.x - target.x) + Math.abs(a.z - target.z) - (Math.abs(b.x - target.x) + Math.abs(b.z - target.z)));
    const bosses = g.enemies.filter((e) => e.def.boss && e.alive).length;
    list.forEach((e, i) => { e.aggressive = i < MAX_ATTACKERS - Math.min(1, bosses); });
  }

  onScreen(f, margin = 0.3) {
    const g = this.game;
    return Math.abs(f.x - g.camX) < g.gfx.halfWidth() + margin;
  }

  // Magic hits every enemy on screen; power grows with the number of potions used.
  castMagic(p, level) {
    const g = this.game;
    const magic = p.def.magic;
    const targets = g.enemies.filter((e) => e.alive && this.onScreen(e));
    g.effects.magic(magic.type, level, p, targets);
    g.schedule(0.55, () => {
      for (const e of targets) {
        if (!e.alive || e.state === 'grabbed') continue;
        e.invuln = 0;
        if (['knockdown', 'down', 'getup'].includes(e.state)) e.setState('idle');
        e.takeHit(p, magic.dmgPerLevel * level, { knockdown: true, dir: Math.sign(e.x - p.x) || 1, force: 1.2 });
        p.score += 20 * level;
      }
    });
  }
}
