/* Entenjagd – Schießbude. 2 Minuten, alle 30 Sekunden steigt der Schwierigkeitsgrad. */
(() => {
  'use strict';
  const VW = 1280, VH = 720;
  const DURATION = 120, LEVEL_EVERY = 30, MAG = 6;
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const $ = (s) => document.querySelector(s);

  /* ---------- Bilder ---------- */
  const NAMES = ['bg_wood', 'curtain', 'curtain_straight', 'curtain_top', 'curtain_rope', 'grass1', 'grass2', 'water1', 'water2',
    'tree_oak', 'tree_pine', 'cloud1', 'cloud2', 'stick_wood', 'stick_metal', 'duck_yellow', 'duck_brown', 'duck_white',
    'duck_target_yellow', 'duck_target_brown', 'duck_target_white', 'target_colored', 'target_red1', 'target_red2', 'target_red3',
    'target_white', 'shot_brown_small', 'shot_grey_large', 'shot_grey_small', 'crosshair_white_large', 'crosshair_red_large', 'rifle',
    'icon_bullet_gold_long', 'icon_bullet_empty_long', 'icon_duck', 'text_ready', 'text_go', 'text_timeup'];
  const IMG = {};
  let loaded = 0;
  for (const n of NAMES) {
    const im = new Image();
    im.onload = () => { loaded++; if (n.startsWith('duck') || n.startsWith('target')) buildMask(n, im); };
    im.src = `../../assets/shooting/${n}.png`;
    IMG[n] = im;
  }

  // Pixelgenaue Trefferprüfung über den Alphakanal
  const MASK = {};
  function buildMask(n, im) {
    try {
      const c = document.createElement('canvas');
      c.width = im.width; c.height = im.height;
      const g = c.getContext('2d');
      g.drawImage(im, 0, 0);
      MASK[n] = { w: im.width, h: im.height, d: g.getImageData(0, 0, im.width, im.height).data };
    } catch (_) { /* z. B. file:// – dann Ellipsen-Test */ }
  }
  function hitMask(n, lx, ly) {
    const m = MASK[n];
    const im = IMG[n];
    if (lx < 0 || ly < 0 || lx >= im.width || ly >= im.height) return false;
    if (!m) { const rx = im.width / 2, ry = im.height / 2; return ((lx - rx) / rx) ** 2 + ((ly - ry) / ry) ** 2 <= 1; }
    return m.d[((ly | 0) * m.w + (lx | 0)) * 4 + 3] > 40;
  }

  /* ---------- Sound (WebAudio, synthetisch) ---------- */
  let actx = null, muted = false;
  try { muted = localStorage.getItem('duck.muted') === '1'; } catch (_) {}
  $('#muteBtn').textContent = muted ? '🔇' : '🔊';
  function sfx(type) {
    if (muted) return;
    try {
      actx ||= new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime;
      if (type === 'shot') {
        const len = 0.18, buf = actx.createBuffer(1, actx.sampleRate * len, actx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
        const s = actx.createBufferSource(); s.buffer = buf;
        const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
        const g = actx.createGain(); g.gain.value = 0.5;
        s.connect(f).connect(g).connect(actx.destination); s.start(t);
      } else {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = type === 'hit' ? 'triangle' : 'square';
        const [f0, f1, dur] = type === 'hit' ? [660, 990, 0.12] : type === 'reload' ? [220, 330, 0.08] : type === 'level' ? [520, 1040, 0.35] : [180, 120, 0.08];
        o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
        g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
      }
    } catch (_) {}
  }

  /* ---------- Spielfeld ---------- */
  // Reihen: obere Kante der Vordergrund-Ebene, Richtung, Ebenenbild
  const LANES = [
    { top: 405, dir: 1, layer: 'grass1', amp: 4 },
    { top: 478, dir: -1, layer: 'water2', amp: 8 },
    { top: 560, dir: 1, layer: 'water1', amp: 10 },
  ];
  const LEVELS = [
    { speed: 120, every: 1.15, scale: 1.0, kinds: ['duck_yellow', 'duck_yellow', 'duck_brown', 'target_colored'], dip: 0 },
    { speed: 175, every: 0.95, scale: 0.92, kinds: ['duck_yellow', 'duck_brown', 'duck_white', 'target_colored', 'target_red1', 'target_red2'], dip: 0.15 },
    { speed: 235, every: 0.8, scale: 0.82, kinds: ['duck_brown', 'duck_white', 'duck_target_yellow', 'duck_target_brown', 'target_red2', 'target_red3', 'target_white'], dip: 0.35 },
    { speed: 300, every: 0.62, scale: 0.72, kinds: ['duck_white', 'duck_target_white', 'duck_target_brown', 'target_red3', 'target_white', 'target_white'], dip: 0.55 },
  ];
  const POINTS = {
    duck_yellow: 10, duck_brown: 15, duck_white: 20, duck_target_yellow: 35, duck_target_brown: 40, duck_target_white: 45,
    target_colored: 25, target_red1: 25, target_red2: 30, target_red3: 35, target_white: 50,
  };

  let state = 'menu';
  let T = 0, stateT = 0;           // Spielzeit, Zeit im aktuellen Zustand
  let objs = [], floaters = [], holes = [];
  let score = 0, shots = 0, hits = 0, combo = 0, bestCombo = 0, ammo = MAG, reloadT = 0;
  let level = 0, spawnT = 0, banner = null, recoil = 0;
  let best = 0;
  try { best = +localStorage.getItem('duck.best') || 0; } catch (_) {}
  const mouse = { x: VW / 2, y: VH / 2, in: false };
  const clouds = [{ x: 200, y: 110, s: 1, v: 8, n: 'cloud1' }, { x: 780, y: 150, s: 0.8, v: 12, n: 'cloud2' }, { x: 1100, y: 90, s: 0.9, v: 6, n: 'cloud1' }];

  function start() {
    $('#dlg').hidden = true;
    objs = []; floaters = []; holes = [];
    score = shots = hits = combo = bestCombo = 0;
    ammo = MAG; reloadT = 0; level = 0; spawnT = 0; banner = null;
    T = 0; stateT = 0; state = 'ready';
    // ein paar Ziele direkt verteilen
    for (let i = 0; i < 5; i++) spawn(Math.random() * VW);
  }

  function spawn(atX) {
    const L = LEVELS[level];
    const laneIdx = Math.random() * 3 | 0;
    const lane = LANES[laneIdx];
    const kind = L.kinds[Math.random() * L.kinds.length | 0];
    const isTarget = kind.startsWith('target');
    const s = L.scale * (isTarget ? 0.8 : 1) * (kind === 'target_white' ? 0.75 : 1);
    const w = IMG[kind].width * s;
    objs.push({
      kind, lane: laneIdx, s,
      x: atX ?? (lane.dir > 0 ? -w : VW + w),
      dir: lane.dir,
      speed: L.speed * (0.85 + Math.random() * 0.3) * (laneIdx === 0 ? 0.85 : 1),
      phase: Math.random() * 6.28,
      rise: atX != null ? 1 : 0,        // 0 = versteckt, 1 = ganz oben
      dip: Math.random() < L.dip, dipT: 0.6 + Math.random() * 1.5,
      dead: 0, holes: [], stick: isTarget ? 'stick_metal' : 'stick_wood',
    });
  }

  // Position (Mittelpunkt unten des Sprites)
  function objBase(o) {
    const lane = LANES[o.lane];
    const bob = Math.sin(T * 3 + o.phase) * 4;
    const hide = (1 - o.rise) * (IMG[o.kind].height * o.s + 20);
    return { x: o.x, y: lane.top - 6 + bob + hide };
  }

  /* ---------- Schießen ---------- */
  function shoot() {
    if (state !== 'play') return;
    if (reloadT > 0) return;
    if (ammo <= 0) { sfx('empty'); reload(); return; }
    ammo--; shots++; recoil = 1;
    sfx('shot');
    const hit = pick(mouse.x, mouse.y);
    if (hit) {
      const { o, lx, ly } = hit;
      o.dead = 0.0001;
      o.holes.push({ x: lx, y: ly });
      hits++; combo++; bestCombo = Math.max(bestCombo, combo);
      const mult = Math.min(4, 1 + Math.floor(combo / 4));
      const pts = POINTS[o.kind] * mult;
      score += pts;
      floaters.push({ x: mouse.x, y: mouse.y - 20, t: 0, text: `+${pts}`, color: mult > 1 ? '#ffd23f' : '#ffffff' });
      sfx('hit');
    } else {
      combo = 0;
      holes.push({ x: mouse.x, y: mouse.y, t: 0 });
      if (holes.length > 25) holes.shift();
    }
    if (ammo === 0) setTimeout(() => { if (state === 'play' && ammo === 0 && reloadT <= 0) reload(); }, 250);
  }

  function reload() {
    if (state !== 'play' || ammo === MAG || reloadT > 0) return;
    reloadT = 0.75;
    sfx('reload');
  }

  // Oberstes getroffenes Objekt (Reihen weiter vorne verdecken hintere)
  function pick(px, py) {
    for (let li = LANES.length - 1; li >= 0; li--) {
      // Vordergrund dieser Reihe verdeckt alles darunter
      if (py >= LANES[li].top + 8 && li < LANES.length) {
        // Punkt liegt im Gras/Wasser dieser Reihe → nur Objekte vorderer Reihen kommen in Frage (schon geprüft)
        return null;
      }
      const list = objs.filter(o => o.lane === li && !o.dead);
      for (let i = list.length - 1; i >= 0; i--) {
        const o = list[i];
        const b = objBase(o), im = IMG[o.kind];
        const w = im.width * o.s, h = im.height * o.s;
        let lx = (px - (b.x - w / 2)) / o.s, ly = (py - (b.y - h)) / o.s;
        if (o.dir < 0) lx = im.width - lx;
        if (hitMask(o.kind, lx, ly)) return { o, lx, ly };
      }
    }
    return null;
  }

  /* ---------- Update ---------- */
  function update(dt) {
    stateT += dt;
    for (const c of clouds) { c.x += c.v * dt; if (c.x > VW + 150) c.x = -150; }
    recoil = Math.max(0, recoil - dt * 6);
    floaters.forEach(f => f.t += dt);
    floaters = floaters.filter(f => f.t < 0.9);
    holes.forEach(h => h.t += dt);
    holes = holes.filter(h => h.t < 4);

    if (state === 'ready' && stateT > 1.6) { state = 'play'; stateT = 0; }
    if (state !== 'play' && state !== 'ready') { moveObjs(dt * 0.4); return; }
    if (state === 'ready') { moveObjs(dt); return; }

    T += dt;
    if (reloadT > 0) { reloadT -= dt; if (reloadT <= 0) { ammo = MAG; reloadT = 0; } }

    const lv = Math.min(LEVELS.length - 1, Math.floor(T / LEVEL_EVERY));
    if (lv !== level) { level = lv; banner = { text: `Stufe ${level + 1}`, t: 0 }; sfx('level'); }
    if (banner) { banner.t += dt; if (banner.t > 1.6) banner = null; }

    spawnT -= dt;
    if (spawnT <= 0) { spawn(); spawnT = LEVELS[level].every * (0.7 + Math.random() * 0.6); }
    moveObjs(dt);

    if (T >= DURATION) finish();
  }

  function moveObjs(dt) {
    for (const o of objs) {
      if (o.dead) { o.dead += dt; continue; }
      o.x += o.dir * o.speed * dt;
      // auftauchen / abtauchen
      if (o.dip) {
        o.dipT -= dt;
        if (o.dipT <= 0) { o.hiding = !o.hiding; o.dipT = o.hiding ? 0.5 + Math.random() * 0.6 : 0.9 + Math.random() * 1.4; }
      }
      const target = o.hiding ? 0 : 1;
      o.rise += Math.sign(target - o.rise) * Math.min(Math.abs(target - o.rise), dt * 4);
    }
    objs = objs.filter(o => o.dead < 0.45 && o.x > -200 && o.x < VW + 200);
  }

  function finish() {
    state = 'over'; stateT = 0;
    const record = score > best;
    if (record) { best = score; try { localStorage.setItem('duck.best', String(best)); } catch (_) {} }
    setTimeout(() => {
      const acc = shots ? Math.round(hits / shots * 100) : 0;
      $('#dlgPanel').innerHTML = `<h2><img src="../../assets/shooting/icon_duck.png" alt="">Zeit ist um!</h2>
        <div class="stats"><span>Punkte</span><b>${score}</b><span>Treffer</span><b>${hits} / ${shots}</b>
        <span>Genauigkeit</span><b>${acc} %</b><span>Längste Serie</span><b>${bestCombo}</b><span>Rekord</span><b>${best}${record ? ' 🎉' : ''}</b></div>
        <div class="actions"><button class="btn primary big" data-a="start">Nochmal</button></div>`;
      $('#dlg').hidden = false;
    }, 1800);
  }

  /* ---------- Zeichnen ---------- */
  function tile(name, y, offset = 0, h) {
    const im = IMG[name];
    const w = im.width, hh = h || im.height;
    let x = -((offset % w) + w) % w;
    for (; x < VW; x += w) ctx.drawImage(im, x, y, w, hh);
  }

  function drawObj(o) {
    const b = objBase(o), im = IMG[o.kind];
    const w = im.width * o.s, h = im.height * o.s;
    const flip = o.dead ? Math.max(0, 1 - o.dead / 0.3) : 1; // umklappen beim Treffer
    // Stab
    const st = IMG[o.stick];
    ctx.drawImage(st, b.x - st.width * 0.5 * o.s, b.y - 4, st.width * o.s, st.height * 1.1);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(o.dir < 0 ? -1 : 1, flip);
    ctx.drawImage(im, -w / 2, -h, w, h);
    const hole = IMG.shot_brown_small;
    for (const hp of o.holes) ctx.drawImage(hole, -w / 2 + hp.x * o.s - 10, -h + hp.y * o.s - 10, 20, 20);
    ctx.restore();
  }

  function text(str, x, y, size, color = '#fff', align = 'center') {
    ctx.font = `800 ${size}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.22; ctx.strokeStyle = '#5a3a1e';
    ctx.strokeText(str, x, y);
    ctx.fillStyle = color; ctx.fillText(str, x, y);
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#2a1d12'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.s, 0, 0, view.s, view.x, view.y);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, VW, VH); ctx.clip();

    if (loaded < NAMES.length) { text('Lade …', VW / 2, VH / 2, 40); ctx.restore(); return; }

    // Rückwand
    for (let y = 0; y < VH; y += 256) tile('bg_wood', y);
    // Himmelsausschnitt + Deko
    for (const c of clouds) { const im = IMG[c.n]; ctx.drawImage(im, c.x - im.width * c.s / 2, c.y, im.width * c.s, im.height * c.s); }
    ctx.drawImage(IMG.tree_pine, 120, 190); ctx.drawImage(IMG.tree_oak, 1000, 180);
    ctx.drawImage(IMG.tree_oak, 560, 215, 120, 205);

    // Einschusslöcher in der Wand
    for (const h of holes) {
      ctx.globalAlpha = Math.min(1, 4 - h.t);
      ctx.drawImage(IMG.shot_grey_small, h.x - 9, h.y - 9, 18, 18);
    }
    ctx.globalAlpha = 1;

    // Reihen mit Vordergrund
    LANES.forEach((lane, i) => {
      objs.filter(o => o.lane === i).forEach(drawObj);
      const off = lane.layer.startsWith('water') ? Math.sin(performance.now() / 900 + i) * lane.amp * 3 + i * 50 : i * 40;
      tile(lane.layer, lane.top, off);
    });
    // Theke
    ctx.fillStyle = '#7a4f2c'; ctx.fillRect(0, 648, VW, 72);
    ctx.fillStyle = '#5f3c20'; ctx.fillRect(0, 648, VW, 8);
    ctx.fillStyle = 'rgba(0,0,0,.15)'; for (let x = 0; x < VW; x += 160) ctx.fillRect(x, 656, 3, 64);

    // Vorhang
    tile('curtain_straight', -6);
    const cur = IMG.curtain;
    ctx.drawImage(cur, -20, 30, 150, 520);
    ctx.save(); ctx.translate(VW + 20, 30); ctx.scale(-1, 1); ctx.drawImage(cur, 0, 0, 150, 520); ctx.restore();

    // Gewehr
    const rx = VW / 2 + (mouse.x - VW / 2) * 0.55 + 140, ry = VH + 70 + recoil * 22;
    const ang = Math.atan2(mouse.x - rx, ry - mouse.y) * 0.45;
    ctx.save(); ctx.translate(rx, ry); ctx.rotate(ang);
    ctx.drawImage(IMG.rifle, -IMG.rifle.width / 2, -IMG.rifle.height + 40);
    ctx.restore();

    // Punkteanzeigen
    for (const f of floaters) { ctx.globalAlpha = 1 - f.t / 0.9; text(f.text, f.x, f.y - f.t * 50, 34, f.color); }
    ctx.globalAlpha = 1;

    // HUD
    ctx.drawImage(IMG.icon_duck, 26, 76, 44, 42);
    text(String(score), 80, 98, 42, '#fff', 'left');
    const remain = Math.max(0, DURATION - T);
    const m = Math.floor(remain / 60), s = Math.floor(remain % 60);
    text(`${m}:${String(s).padStart(2, '0')}`, VW / 2, 98, 44, remain < 10 && state === 'play' ? '#ff6b5e' : '#fff');
    text(`Stufe ${level + 1}`, VW / 2, 140, 22, '#ffe7a6');
    const mult = Math.min(4, 1 + Math.floor(combo / 4));
    if (mult > 1) text(`×${mult}`, 80, 140, 26, '#ffd23f', 'left');
    text(`Rekord ${best}`, VW - 30, 98, 22, '#ffe7a6', 'right');
    // Munition
    for (let i = 0; i < MAG; i++) {
      const im = i < ammo ? IMG.icon_bullet_gold_long : IMG.icon_bullet_empty_long;
      ctx.drawImage(im, VW - 60 - (MAG - 1 - i) * 34, 652, 26, 58);
    }
    if (reloadT > 0) text('Nachladen …', VW - 160, 630, 22, '#ffe7a6');
    else if (ammo === 0 && state === 'play') text('Nachladen: Rechtsklick / R', VW - 210, 630, 20, '#ff9b8e');

    // Banner / Zustände
    if (state === 'ready') {
      const im = stateT < 1.1 ? IMG.text_ready : IMG.text_go;
      const k = 1 + Math.max(0, 0.3 - (stateT % 1.1)) ;
      ctx.drawImage(im, VW / 2 - im.width * k / 2, VH / 2 - 90 - im.height * k / 2, im.width * k, im.height * k);
    }
    if (banner) {
      const a = banner.t < 0.2 ? banner.t / 0.2 : banner.t > 1.3 ? (1.6 - banner.t) / 0.3 : 1;
      ctx.globalAlpha = Math.max(0, a);
      text(banner.text + '!', VW / 2, VH / 2 - 80, 72, '#ffd23f');
      text('schneller & kleiner', VW / 2, VH / 2 - 20, 26, '#fff');
      ctx.globalAlpha = 1;
    }
    if (state === 'over') {
      const im = IMG.text_timeup;
      ctx.drawImage(im, VW / 2 - im.width / 2, VH / 2 - 90 - im.height / 2);
    }

    // Fadenkreuz
    if (mouse.in && state !== 'menu') {
      const over = state === 'play' && pick(mouse.x, mouse.y);
      const ch = over ? IMG.crosshair_red_large : IMG.crosshair_white_large;
      ctx.drawImage(ch, mouse.x - 25, mouse.y - 25, 50, 50);
    }
    ctx.restore();
  }

  /* ---------- Ansicht & Eingabe ---------- */
  const view = { s: 1, x: 0, y: 0 };
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    view.s = Math.min(canvas.width / VW, canvas.height / VH);
    view.x = (canvas.width - VW * view.s) / 2;
    view.y = (canvas.height - VH * view.s) / 2;
  }
  addEventListener('resize', resize);
  resize();

  function toGame(e) {
    const r = canvas.getBoundingClientRect();
    const dpr = canvas.width / r.width;
    mouse.x = ((e.clientX - r.left) * dpr - view.x) / view.s;
    mouse.y = ((e.clientY - r.top) * dpr - view.y) / view.s;
    mouse.in = true;
  }
  canvas.addEventListener('pointermove', toGame);
  canvas.addEventListener('pointerleave', () => { mouse.in = false; });
  canvas.addEventListener('pointerdown', (e) => {
    toGame(e);
    if (e.button === 2) { reload(); return; }
    if (e.button === 0) shoot();
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R' || e.code === 'Space') { e.preventDefault(); reload(); }
  });
  $('#dlg').addEventListener('click', (e) => { if (e.target.dataset.a === 'start') start(); });
  $('#muteBtn').onclick = () => {
    muted = !muted;
    $('#muteBtn').textContent = muted ? '🔇' : '🔊';
    try { localStorage.setItem('duck.muted', muted ? '1' : '0'); } catch (_) {}
  };

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
