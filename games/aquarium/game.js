/* Aquarium – Fressen und gefressen werden nach dem Schere-Stein-Papier-Prinzip.
 * Ziel: So lange wie möglich mindestens MIN_FISH Fische am Leben halten. */
(() => {
  'use strict';
  const VW = 1280, VH = 720;
  const MIN_FISH = 3;
  const START_MONEY = 100;
  const SWIM_TOP = 70, SWIM_BOTTOM = 560, SAND_Y = 600;
  const FOOD_COST = 6;
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const $ = (s) => document.querySelector(s);
  const A = '../../assets/fish/';

  /* ---------- Arten ---------- */
  const SPECIES = {
    red:    { name: 'Rotbarsch',  img: 'fish_red',    cost: 20, speed: 70, decay: 1.0, scale: 1.0, eats: ['green', 'orange'], skel: 'fish_red_skeleton' },
    green:  { name: 'Grünling',   img: 'fish_green',  cost: 20, speed: 75, decay: 1.0, scale: 1.0, eats: ['blue', 'orange'],  skel: 'fish_green_skeleton' },
    blue:   { name: 'Blauling',   img: 'fish_blue',   cost: 20, speed: 80, decay: 1.0, scale: 1.0, eats: ['red', 'orange'],   skel: 'fish_blue_skeleton' },
    orange: { name: 'Goldfisch',  img: 'fish_orange', cost: 8,  speed: 95, decay: 0.75, scale: 0.75, eats: [], skel: 'fish_orange_skeleton' },
    brown:  { name: 'Kugelfisch', img: 'fish_brown',  cost: 30, speed: 40, decay: 0.6, scale: 1.05, eats: [], immune: true, skel: null },
  };
  const ORDER = ['red', 'green', 'blue', 'orange', 'brown'];
  const BASE_DECAY = 100 / 45;     // Energie pro Sekunde (≈45 s ohne Nahrung)
  const EAT_GAIN = 55, FLAKE_GAIN = 22, BREED_AFTER = 3;
  const INCOME_EVERY = 6;          // jede lebende Fisch bringt alle 6 s eine Einheit

  /* ---------- Bilder ---------- */
  const IMG = {};
  const files = [
    ...Object.values(SPECIES).flatMap(s => [s.img, s.skel].filter(Boolean)),
    'bubble_a', 'bubble_b', 'bubble_c', 'rock_a', 'rock_b',
    'background_rock_a', 'background_rock_b', ...'abcdefgh'.split('').map(c => 'background_seaweed_' + c),
    'seaweed_green_a', 'seaweed_green_b', 'seaweed_green_c', 'seaweed_green_d', 'seaweed_pink_a', 'seaweed_pink_b', 'seaweed_pink_c',
    'seaweed_orange_a', 'seaweed_orange_b', 'seaweed_grass_a', 'seaweed_grass_b',
    ...'abcdefgh'.split('').map(c => 'terrain_sand_top_' + c), ...'abcd'.split('').map(c => 'terrain_sand_' + c),
  ];
  let loaded = 0;
  for (const f of files) { const im = new Image(); im.onload = () => loaded++; im.src = A + f + '.png'; IMG[f] = im; }

  /* ---------- Deko (einmal zufällig) ---------- */
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pickOne = (a) => a[Math.random() * a.length | 0];
  const deco = { back: [], front: [], sandTop: [], sand: [] };
  for (let x = -20; x < VW; x += rnd(50, 110)) deco.back.push({ x, n: pickOne(['background_rock_a', 'background_rock_b', ...'abcdefgh'.split('').map(c => 'background_seaweed_' + c)]), s: rnd(1.4, 2.4) });
  for (let x = 30; x < VW; x += rnd(70, 160)) deco.front.push({ x, n: pickOne(['seaweed_green_a', 'seaweed_green_b', 'seaweed_green_c', 'seaweed_green_d', 'seaweed_pink_a', 'seaweed_pink_b', 'seaweed_pink_c', 'seaweed_orange_a', 'seaweed_orange_b', 'seaweed_grass_a', 'seaweed_grass_b', 'rock_a', 'rock_b']), s: rnd(1.1, 1.6), ph: rnd(0, 6) });
  for (let x = 0; x < VW; x += 64) { deco.sandTop.push(pickOne('abcdefgh'.split(''))); deco.sand.push(pickOne('abcd'.split(''))); }

  /* ---------- Zustand ---------- */
  let state = 'setup'; // setup | play | over
  let paused = false;
  let money = START_MONEY, T = 0, incomeT = 0;
  let fish = [], dead = [], flakes = [], bubbles = [], popups = [];
  let selected = 'red';
  let stats = { eaten: 0, born: 0, bought: 0, starved: 0 };
  let best = 0;
  try { best = +localStorage.getItem('aquarium.best') || 0; } catch (_) {}
  const mouse = { x: -1, y: -1, in: false };

  function reset() {
    state = 'setup'; paused = false;
    money = START_MONEY; T = 0; incomeT = 0;
    fish = []; dead = []; flakes = []; popups = [];
    stats = { eaten: 0, born: 0, bought: 0, starved: 0 };
    $('#startBtn').textContent = 'Start';
    $('#startBtn').disabled = false;
    $('#pauseBtn').textContent = 'Pause';
    updateUI();
  }

  function addFish(type, x, y, baby = false) {
    const sp = SPECIES[type];
    const f = {
      type, x, y, baseY: y,
      dir: Math.random() < 0.5 ? -1 : 1,
      energy: baby ? 70 : 100,
      size: baby ? 0.7 : 1,
      meals: 0, phase: rnd(0, 6), turnT: rnd(4, 10), boost: 0, flash: 0,
    };
    fish.push(f);
    return f;
  }

  const decayFactor = () => 1 + T / 150 * 0.6; // Wasser wird mit der Zeit „anspruchsvoller“
  const fishW = (f) => 64 * 1.25 * SPECIES[f.type].scale * f.size;

  /* ---------- Spiel-Logik ---------- */
  function update(dt) {
    // Blasen
    if (Math.random() < dt * 3) bubbles.push({ x: rnd(0, VW), y: SAND_Y, r: rnd(8, 22), v: rnd(30, 70), n: pickOne(['bubble_a', 'bubble_b', 'bubble_c']), ph: rnd(0, 6) });
    bubbles.forEach(b => { b.y -= b.v * dt; b.x += Math.sin(b.y / 30 + b.ph) * 0.4; });
    bubbles = bubbles.filter(b => b.y > -30);
    popups.forEach(p => p.t += dt);
    popups = popups.filter(p => p.t < 1.4);

    // tote Fische sinken
    for (const d of dead) {
      d.t += dt;
      if (d.y < SAND_Y - 10) { d.y += 45 * dt; d.rot += dt * 0.8 * d.dir; }
    }
    dead = dead.filter(d => d.t < 9);

    if (state === 'setup') { swim(dt, false); return; }
    if (state !== 'play') { swim(dt * 0.3, false); return; }

    T += dt;

    // Einkommen
    incomeT += dt;
    if (incomeT >= INCOME_EVERY) {
      incomeT -= INCOME_EVERY;
      const n = fish.length;
      if (n) { money += n; popups.push({ x: 70, y: 40, t: 0, text: `+${n}`, color: '#ffe27a' }); }
    }

    // Futter
    for (const fl of flakes) {
      if (fl.y < SAND_Y - 8) { fl.y += fl.v * dt; fl.x += Math.sin(T * 2 + fl.ph) * 12 * dt; }
      else fl.ground += dt;
    }

    swim(dt, true);

    // Hunger
    const k = BASE_DECAY * decayFactor();
    for (const f of fish) f.energy -= k * SPECIES[f.type].decay * dt * (1 + (f.size - 1) * 0.5);

    // Fressen
    for (const a of fish) {
      if (a.gone || a.energy > 85) continue;
      const sp = SPECIES[a.type];
      if (!sp.eats.length) continue;
      for (const b of fish) {
        if (b === a || b.gone || !sp.eats.includes(b.type) || SPECIES[b.type].immune) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const reach = fishW(a) * 0.45 + fishW(b) * 0.25;
        if (Math.abs(dx) < reach && Math.abs(dy) < 26 * a.size && dx * a.dir > -fishW(a) * 0.15) {
          eat(a, b);
          break;
        }
      }
    }
    // Flocken fressen
    for (const fl of flakes) {
      if (fl.gone) continue;
      for (const f of fish) {
        if (f.gone || f.energy > 96) continue;
        if (Math.abs(fl.x - (f.x + f.dir * fishW(f) * 0.25)) < fishW(f) * 0.4 && Math.abs(fl.y - f.y) < 22 * f.size) {
          fl.gone = true;
          f.energy = Math.min(100, f.energy + FLAKE_GAIN);
          f.flash = 0.3;
          break;
        }
      }
    }
    flakes = flakes.filter(fl => !fl.gone && fl.ground < 4);

    // Verhungern
    for (const f of fish) if (!f.gone && f.energy <= 0) { kill(f, false); stats.starved++; }
    fish = fish.filter(f => !f.gone);

    if (fish.length < MIN_FISH) gameOver();
    updateUI();
  }

  function swim(dt, smart) {
    for (const f of fish) {
      const sp = SPECIES[f.type];
      let speed = sp.speed * (f.boost > 0 ? 1.5 : 1);
      f.boost = Math.max(0, f.boost - dt);
      f.flash = Math.max(0, f.flash - dt);

      if (smart) {
        // Hungrige Räuber drehen sich zur nächsten Beute in ihrer Tiefe, Beute flieht vor nahen Räubern.
        if (f.energy < 50 && sp.eats.length) {
          const prey = nearest(f, (o) => sp.eats.includes(o.type), 320, 45);
          if (prey) { f.dir = Math.sign(prey.x - f.x) || f.dir; f.boost = 0.2; }
        }
        const hunter = nearest(f, (o) => SPECIES[o.type].eats.includes(f.type) && o.energy <= 85, 140, 40);
        if (hunter && Math.sign(f.x - hunter.x) !== 0 && hunter.dir === Math.sign(f.x - hunter.x)) {
          f.dir = Math.sign(f.x - hunter.x); f.boost = 0.25;
        }
      }
      f.turnT -= dt;
      if (f.turnT <= 0) { f.dir *= -1; f.turnT = rnd(5, 12); }
      f.x += f.dir * speed * dt;
      const w = fishW(f) / 2;
      if (f.x < w + 6) { f.x = w + 6; f.dir = 1; }
      if (f.x > VW - w - 6) { f.x = VW - w - 6; f.dir = -1; }
      f.y = f.baseY + Math.sin(performance.now() / 700 + f.phase) * 5;
    }
  }

  function nearest(f, pred, maxDx, maxDy) {
    let best = null, bd = Infinity;
    for (const o of fish) {
      if (o === f || o.gone || !pred(o)) continue;
      const dx = Math.abs(o.x - f.x), dy = Math.abs(o.y - f.y);
      if (dx < maxDx && dy < maxDy && dx < bd) { bd = dx; best = o; }
    }
    return best;
  }

  function eat(a, b) {
    kill(b, true);
    a.energy = Math.min(100, a.energy + EAT_GAIN);
    a.size = Math.min(1.45, a.size + 0.08);
    a.meals++;
    a.flash = 0.4;
    stats.eaten++;
    popups.push({ x: a.x, y: a.y - 40, t: 0, text: 'Happs!', color: '#fff' });
    if (a.meals >= BREED_AFTER) {
      a.meals = 0;
      a.size = Math.max(1, a.size - 0.2);
      const y = Math.max(SWIM_TOP, Math.min(SWIM_BOTTOM, a.baseY + rnd(-60, 60)));
      const baby = addFish(a.type, a.x, y, true);
      baby.dir = -a.dir;
      stats.born++;
      popups.push({ x: a.x, y: a.y - 64, t: 0, text: `Nachwuchs: ${SPECIES[a.type].name}!`, color: '#c8ffbf' });
      toast(`${SPECIES[a.type].name} hat Nachwuchs bekommen.`);
    }
  }

  function kill(f, eaten) {
    f.gone = true;
    const sp = SPECIES[f.type];
    dead.push({ x: f.x, y: f.y, dir: f.dir, rot: 0, t: 0, img: sp.skel || sp.img, size: f.size * sp.scale, fade: !sp.skel });
    if (eaten) popups.push({ x: f.x, y: f.y, t: 0, text: '✕', color: '#ff8e8e' });
  }

  function gameOver() {
    if (state !== 'play') return;
    state = 'over';
    const record = T > best;
    if (record) { best = T; try { localStorage.setItem('aquarium.best', String(T)); } catch (_) {} }
    $('#startBtn').textContent = 'Neues Aquarium';
    setTimeout(() => dialog(`<h2>Das Aquarium ist leer(er)</h2>
      <p>Es leben weniger als ${MIN_FISH} Fische. Dein Aquarium hat <b>${fmt(T)}</b> durchgehalten.</p>
      <table class="score">
        <tr><td>Gekaufte Fische</td><td class="num">${stats.bought}</td></tr>
        <tr><td>Gefressen</td><td class="num">${stats.eaten}</td></tr>
        <tr><td>Verhungert</td><td class="num">${stats.starved}</td></tr>
        <tr><td>Nachwuchs</td><td class="num">${stats.born}</td></tr>
        <tr><td>Rekord</td><td class="num"><b>${fmt(best)}</b>${record ? ' 🎉' : ''}</td></tr>
      </table>
      <div class="actions"><button class="btn primary" data-a="reset">Neues Aquarium</button></div>`), 900);
  }

  /* ---------- Eingabe ---------- */
  function place(x, y) {
    if (state === 'over' || paused) return;
    if (y > SAND_Y + 10 || y < 20) return;
    if (selected === 'food') {
      if (state !== 'play') return toast('Futter gibt es, sobald das Spiel läuft.');
      if (money < FOOD_COST) return toast('Nicht genug Einheiten.');
      money -= FOOD_COST;
      for (let i = 0; i < 3; i++) flakes.push({ x: x + rnd(-28, 28), y: Math.min(y, 120) + rnd(-10, 10), v: rnd(22, 34), ph: rnd(0, 6), ground: 0 });
    } else {
      const sp = SPECIES[selected];
      if (money < sp.cost) return toast('Nicht genug Einheiten.');
      money -= sp.cost;
      const f = addFish(selected, Math.max(50, Math.min(VW - 50, x)), Math.max(SWIM_TOP, Math.min(SWIM_BOTTOM, y)));
      f.dir = x < VW / 2 ? 1 : -1;
      stats.bought++;
    }
    updateUI();
  }

  /* ---------- Zeichnen ---------- */
  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1f5a78'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.s, 0, 0, view.s, view.x, view.y);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, VW, VH); ctx.clip();

    const g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, '#bdf0fb'); g.addColorStop(0.55, '#7fd0ea'); g.addColorStop(1, '#4aa9cf');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    // Lichtstrahlen
    ctx.globalAlpha = 0.12; ctx.fillStyle = '#fff';
    for (let i = 0; i < 5; i++) {
      const x = (i * 300 + performance.now() / 80) % (VW + 400) - 200;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 90, 0); ctx.lineTo(x - 100, SAND_Y); ctx.lineTo(x - 220, SAND_Y); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (loaded < files.length) { ctx.fillStyle = '#fff'; ctx.font = '28px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Lade …', VW / 2, VH / 2); ctx.restore(); return; }

    // Hintergrund-Silhouetten
    for (const d of deco.back) { const im = IMG[d.n]; ctx.globalAlpha = 0.7; ctx.drawImage(im, d.x, SAND_Y - 64 * d.s + 18, 64 * d.s, 64 * d.s); }
    ctx.globalAlpha = 1;

    // Bodenzone & Schwimmzone dezent markieren
    for (const b of bubbles) { ctx.globalAlpha = 0.7; ctx.drawImage(IMG[b.n], b.x - b.r, b.y - b.r, b.r * 2, b.r * 2); }
    ctx.globalAlpha = 1;

    // Futter
    ctx.fillStyle = '#c47a2c';
    for (const fl of flakes) { ctx.globalAlpha = fl.ground > 3 ? 4 - fl.ground : 1; ctx.beginPath(); ctx.ellipse(fl.x, fl.y, 5, 3.5, fl.ph, 0, 6.3); ctx.fill(); }
    ctx.globalAlpha = 1;

    // Tote Fische
    for (const d of dead) {
      const im = IMG[d.img], w = 64 * 1.25 * d.size;
      ctx.save(); ctx.globalAlpha = Math.min(1, (9 - d.t) / 2) * (d.fade ? 0.6 : 1);
      ctx.translate(d.x, d.y); ctx.rotate(d.rot * 0.4); ctx.scale(d.dir, d.fade ? -1 : 1);
      ctx.drawImage(im, -w / 2, -w / 2, w, w);
      ctx.restore();
    }

    // Lebende Fische
    for (const f of fish) drawFish(f);

    // Vorschau beim Platzieren
    if (mouse.in && selected !== 'food' && state !== 'over' && mouse.y < SAND_Y + 10) {
      const sp = SPECIES[selected], im = IMG[sp.img], w = 64 * 1.25 * sp.scale;
      const y = Math.max(SWIM_TOP, Math.min(SWIM_BOTTOM, mouse.y));
      ctx.globalAlpha = money >= sp.cost ? 0.45 : 0.18;
      ctx.drawImage(im, mouse.x - w / 2, y - w / 2, w, w);
      ctx.globalAlpha = 1;
    }

    // Sand
    deco.sandTop.forEach((c, i) => ctx.drawImage(IMG['terrain_sand_top_' + c], i * 64, SAND_Y, 64, 64));
    for (let y = SAND_Y + 64; y < VH; y += 64) deco.sand.forEach((c, i) => ctx.drawImage(IMG['terrain_sand_' + c], i * 64, y, 64, 64));
    // Pflanzen vorne
    for (const d of deco.front) {
      const im = IMG[d.n], s = 64 * d.s;
      ctx.save(); ctx.translate(d.x, SAND_Y + 28);
      if (!d.n.startsWith('rock')) ctx.transform(1, 0, Math.sin(performance.now() / 1300 + d.ph) * 0.08, 1, 0, 0);
      ctx.drawImage(im, -s / 2, -s, s, s);
      ctx.restore();
    }

    // Popups
    ctx.textAlign = 'center'; ctx.font = '700 22px "Segoe UI", system-ui, sans-serif';
    for (const p of popups) {
      ctx.globalAlpha = 1 - p.t / 1.4;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,50,70,.6)';
      ctx.strokeText(p.text, p.x, p.y - p.t * 30); ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y - p.t * 30);
    }
    ctx.globalAlpha = 1;

    if (state === 'setup') {
      banner(fish.length < MIN_FISH ? `Setze mindestens ${MIN_FISH} Fische ins Becken und drücke „Start“` : 'Bereit? Drücke „Start“ – oder setze weitere Fische');
    }
    if (paused) banner('Pause');
    ctx.restore();
  }

  function banner(t) {
    ctx.font = '600 22px "Segoe UI", system-ui, sans-serif';
    const w = ctx.measureText(t).width + 40;
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    roundRect(VW / 2 - w / 2, 22, w, 44, 14); ctx.fill();
    ctx.fillStyle = '#18323f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t, VW / 2, 45);
    ctx.textBaseline = 'alphabetic';
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawFish(f) {
    const sp = SPECIES[f.type], im = IMG[sp.img], w = fishW(f);
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(f.dir, 1);
    const wob = Math.sin(performance.now() / 160 + f.phase) * 0.04;
    ctx.rotate(wob);
    if (f.flash > 0) { ctx.shadowColor = '#fff7a8'; ctx.shadowBlur = 18; }
    ctx.drawImage(im, -w / 2, -w / 2, w, w);
    ctx.restore();
    // Energiebalken
    const bw = Math.max(34, w * 0.6), x = f.x - bw / 2, y = f.y - w * 0.42 - 8;
    ctx.fillStyle = 'rgba(20,40,55,.35)'; roundRect(x - 1, y - 1, bw + 2, 7, 3.5); ctx.fill();
    const e = Math.max(0, f.energy) / 100;
    ctx.fillStyle = e > 0.5 ? '#4cd07d' : e > 0.25 ? '#f2c94c' : '#ef5350';
    roundRect(x, y, Math.max(3, bw * e), 5, 2.5); ctx.fill();
    if (f.meals) { ctx.fillStyle = '#fff'; for (let i = 0; i < f.meals; i++) { ctx.beginPath(); ctx.arc(x + bw + 6 + i * 7, y + 2.5, 2.5, 0, 6.3); ctx.fill(); } }
  }

  /* ---------- UI ---------- */
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function buildShop() {
    const shop = $('#shop');
    for (const t of ORDER) {
      const sp = SPECIES[t];
      const b = document.createElement('button');
      b.className = 'item'; b.dataset.t = t;
      b.innerHTML = `<img src="${A + sp.img}.png" alt=""><span>${sp.name}<small>${sp.cost} Einheiten</small></span>`;
      b.title = sp.eats.length ? `frisst ${sp.eats.map(e => SPECIES[e].name).join(' & ')}` : sp.immune ? 'wird von niemandem gefressen, frisst nur Futter' : 'frisst nur Futter';
      b.onclick = () => { selected = t; updateUI(); };
      shop.appendChild(b);
    }
    const f = document.createElement('button');
    f.className = 'item'; f.dataset.t = 'food';
    f.innerHTML = `<span class="food">🟤</span><span>Futter<small>${FOOD_COST} Einheiten</small></span>`;
    f.title = 'Streut 3 Futterflocken an die geklickte Stelle';
    f.onclick = () => { selected = 'food'; updateUI(); };
    shop.appendChild(f);

    const icon = (t) => `<img src="${A + SPECIES[t].img}.png" alt="">`;
    $('#legend').innerHTML = `${icon('red')} frisst ${icon('green')} frisst ${icon('blue')} frisst ${icon('red')}<br>
      Alle drei fressen ${icon('orange')} · ${icon('brown')} ist ungenießbar`;
  }

  function updateUI() {
    $('#money').textContent = `${Math.floor(money)} Einheiten`;
    $('#time').textContent = fmt(T);
    const a = $('#alive');
    a.textContent = `${fish.length} (min. ${MIN_FISH})`;
    a.style.color = fish.length <= MIN_FISH && state === 'play' ? 'var(--danger)' : '';
    document.querySelectorAll('.item').forEach(b => {
      const t = b.dataset.t;
      const cost = t === 'food' ? FOOD_COST : SPECIES[t].cost;
      b.classList.toggle('on', t === selected);
      b.disabled = money < cost || state === 'over';
    });
    if (state === 'setup') $('#startBtn').disabled = fish.length < MIN_FISH;
  }

  const dlg = $('#dlg');
  function dialog(html) { $('#dlgPanel').innerHTML = html; dlg.hidden = false; }
  dlg.addEventListener('click', (e) => {
    const a = e.target.dataset.a;
    if (!a) return;
    dlg.hidden = true;
    if (a === 'reset') reset();
  });
  let toastT;
  function toast(t) {
    const el = $('#toast'); el.textContent = t; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function showHelp() {
    const icon = (t) => `<img src="${A + SPECIES[t].img}.png" alt="${SPECIES[t].name}" title="${SPECIES[t].name}">`;
    dialog(`<h2>Aquarium</h2>
      <p>Du startest mit <b>${START_MONEY} Einheiten</b>. Kaufe Fische und setze sie per Klick ins Becken – die Höhe, in der du sie absetzt, ist ihre Schwimmbahn. Fische schwimmen nur hin und her.</p>
      <div class="rps">${icon('red')}<span class="arrow">frisst →</span>${icon('green')}<span class="arrow">frisst →</span>${icon('blue')}<span class="arrow">frisst →</span>${icon('red')}</div>
      <ul>
        <li>Jeder Fisch hat Energie (Balken), die stetig sinkt. Bei 0 verhungert er.</li>
        <li>Ein hungriger Fisch frisst seine Beute, wenn sich beide in ähnlicher Tiefe begegnen – das füllt seine Energie stark auf. Wer 3 Fische gefressen hat, bekommt <b>Nachwuchs</b>.</li>
        <li><b>Goldfische</b> (${SPECIES.orange.cost}) sind billiges Futter für alle Räuber. <b>Kugelfische</b> (${SPECIES.brown.cost}) frisst niemand – sie leben nur von Futter.</li>
        <li><b>Futter</b> (${FOOD_COST}) streut 3 Flocken. Jeder lebende Fisch bringt alle ${INCOME_EVERY} s eine Einheit ein.</li>
        <li>Mit der Zeit verbrauchen alle Fische mehr Energie. Ziel: so lange wie möglich <b>mindestens ${MIN_FISH} Fische</b> am Leben halten.</li>
      </ul>
      <p>Tipp: Ohne Räuber verhungern die Fische, mit zu vielen Räubern ist die Beute schnell weg. Halte das Gleichgewicht!</p>
      <div class="actions"><button class="btn primary" data-a="close">Los geht's</button></div>`);
  }

  $('#startBtn').onclick = () => {
    if (state === 'over') { reset(); return; }
    if (state === 'setup') {
      if (fish.length < MIN_FISH) return toast(`Setze zuerst mindestens ${MIN_FISH} Fische ein.`);
      state = 'play';
      $('#startBtn').textContent = 'Läuft …';
      $('#startBtn').disabled = true;
    }
  };
  $('#pauseBtn').onclick = () => {
    if (state !== 'play') return;
    paused = !paused;
    $('#pauseBtn').textContent = paused ? 'Weiter' : 'Pause';
  };
  $('#helpBtn').onclick = showHelp;

  /* ---------- Ansicht ---------- */
  const view = { s: 1, x: 0, y: 0 };
  const wrap = canvas.parentElement;
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(wrap.clientWidth * dpr);
    canvas.height = Math.round(wrap.clientHeight * dpr);
    view.s = Math.min(canvas.width / VW, canvas.height / VH);
    view.x = (canvas.width - VW * view.s) / 2;
    view.y = (canvas.height - VH * view.s) / 2;
  }
  new ResizeObserver(resize).observe(wrap);
  resize();
  function toGame(e) {
    const r = canvas.getBoundingClientRect(), dpr = canvas.width / r.width;
    mouse.x = ((e.clientX - r.left) * dpr - view.x) / view.s;
    mouse.y = ((e.clientY - r.top) * dpr - view.y) / view.s;
    mouse.in = mouse.x >= 0 && mouse.x <= VW && mouse.y >= 0 && mouse.y <= VH;
  }
  canvas.addEventListener('pointermove', toGame);
  canvas.addEventListener('pointerleave', () => { mouse.in = false; });
  canvas.addEventListener('pointerdown', (e) => { toGame(e); if (mouse.in) place(mouse.x, mouse.y); });

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused) update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  buildShop();
  reset();
  showHelp();
  requestAnimationFrame(loop);
})();
