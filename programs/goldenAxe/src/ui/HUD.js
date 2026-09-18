// DOM overlay HUD. Only touches the DOM when a displayed value changes.
const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.root = $('hud');
    this.el = {
      name: $('hudName'), hp: $('hudHp'), magic: $('hudMagic'), score: $('hudScore'), lives: $('hudLives'),
      boss: $('bossBar'), bossName: $('bossName'), bossFill: $('bossFill'), msg: $('message'),
    };
    this.cache = {};
    this.boss = null;
    this.msgTimer = 0;
  }

  show(visible) { this.root.classList.toggle('hidden', !visible); }

  set(key, value, fn) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    fn(value);
  }

  setPlayer(p) {
    this.cache = {};
    this.el.name.textContent = p.def.name;
    this.el.name.style.color = p.def.color;
  }

  update(p, dt) {
    const blocks = Math.ceil(p.maxHp / 10);
    const filled = Math.ceil(p.hp / 10);
    this.set('hp', filled, (v) => {
      let html = '';
      for (let i = 0; i < blocks; i++) html += `<span class="hp-block${i < v ? '' : ' empty'}"></span>`;
      this.el.hp.innerHTML = html;
    });
    this.set('magic', `${p.potions}/${p.def.magic.max}`, () => {
      let html = '';
      for (let i = 0; i < p.potions; i++) html += `<span class="potion${i < p.def.magic.max ? '' : ' over'}"></span>`;
      this.el.magic.innerHTML = html || '<span class="potion-empty">MAGIC</span>';
    });
    this.set('score', p.score, (v) => { this.el.score.textContent = String(v).padStart(6, '0'); });
    this.set('lives', p.lives, (v) => { this.el.lives.textContent = v; });

    if (this.boss) {
      const k = Math.max(0, this.boss.hp / this.boss.maxHp);
      this.set('boss', Math.round(k * 200), () => { this.el.bossFill.style.width = `${k * 100}%`; });
    }

    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.el.msg.classList.add('hidden');
    }
  }

  setBoss(f) {
    this.boss = f;
    this.el.boss.classList.toggle('hidden', !f);
    if (f) {
      this.el.bossName.textContent = f.def.name;
      delete this.cache.boss;
    }
  }

  message(text, duration = 2, cls = '') {
    const m = this.el.msg;
    m.textContent = text;
    m.className = cls;
    this.msgTimer = duration;
  }

  go() { this.message('GO ➜', 3, 'go'); }
}
