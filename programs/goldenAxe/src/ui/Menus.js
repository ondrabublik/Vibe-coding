// Title / character select / pause / game over / stage clear screens (DOM).
const $ = (id) => document.getElementById(id);

export class Menus {
  constructor() {
    this.screens = {
      title: $('screenTitle'),
      select: $('screenSelect'),
      pause: $('screenPause'),
      gameover: $('screenGameOver'),
      clear: $('screenClear'),
    };
    this.cards = $('cards');
  }

  show(name) {
    for (const [key, el] of Object.entries(this.screens)) el.classList.toggle('hidden', key !== name);
  }

  buildCards(chars) {
    const bar = (label, v, max) =>
      `<div class="stat"><span>${label}</span><div class="stat-track"><div class="stat-fill" style="width:${Math.round((v / max) * 100)}%"></div></div></div>`;
    this.cards.innerHTML = chars
      .map(
        (c) => `
      <div class="card" style="--accent:${c.color}">
        <div class="card-name">${c.name}</div>
        <div class="card-title">${c.title}</div>
        ${bar('SÍLA', c.damage, 12)}
        ${bar('RYCHLOST', c.speed, 4)}
        ${bar('ŽIVOTY', c.hp, 112)}
        ${bar('MAGIE', c.magic.max, 6)}
        <div class="card-magic">Magie: ${c.magic.name}</div>
        <div class="card-desc">${c.desc}</div>
      </div>`
      )
      .join('');
  }

  select(i) {
    [...this.cards.children].forEach((el, k) => el.classList.toggle('active', k === i));
  }

  setContinue(n) { $('continueCount').textContent = n; }

  setClearStats(rows) {
    $('clearStats').innerHTML = rows.map(([k, v]) => `<div class="row"><span>${k}</span><span>${v}</span></div>`).join('');
  }
}
