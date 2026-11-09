/* Rennen – Top-Down-Rennspiel, 3 Runden gegen einen Computergegner. */
(() => {
  'use strict';
  const { TRACKS } = window.RaceTracks;
  const LAPS = 3;
  const A = '../../assets/racing/';
  const $ = (s) => document.querySelector(s);
  const canvas = $('#c'), ctx = canvas.getContext('2d');

  const COLORS = { red: '#e8582e', blue: '#2f8fdc', green: '#2fb36a', yellow: '#f2c230', black: '#4a4f57' };
  const VEHICLES = {
    car: {
      name: 'Sportwagen', desc: 'Hohe Endgeschwindigkeit, liegt satt auf der Straße.',
      img: (c) => `car_${c}_1`, scale: 0.6, radius: 24,
      maxSpeed: 580, accel: 300, brake: 720, revAccel: 160, revMax: 120, drag: 140, turn: 2.45, grip: 6.5, offroad: 0.42,
      stats: { Tempo: 0.95, Beschleunigung: 0.6, Wendigkeit: 0.6 },
    },
    bike: {
      name: 'Motorrad', desc: 'Spritzig und wendig, aber etwas langsamer.',
      img: (c) => `motorcycle_${c}`, scale: 0.66, radius: 17,
      maxSpeed: 525, accel: 440, brake: 760, revAccel: 160, revMax: 110, drag: 150, turn: 3.25, grip: 8, offroad: 0.48,
      stats: { Tempo: 0.8, Beschleunigung: 0.9, Wendigkeit: 0.92 },
    },
  };

  /* ---------- Einstellungen ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('race.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem('race.' + k, JSON.stringify(v)); } catch (_) {} },
  };
  const opt = {
    track: store.get('track', 'oval'),
    vehicle: store.get('vehicle', 'car'),
    color: store.get('color', 'red'),
    name: store.get('name', 'Spieler'),
  };
  if (!TRACKS.some(t => t.id === opt.track)) opt.track = 'oval';
  if (!VEHICLES[opt.vehicle]) opt.vehicle = 'car';
  if (!COLORS[opt.color]) opt.color = 'red';

  /* ---------- Bilder ---------- */
  const IMG = {};
  const names = ['road_asphalt22', 'land_grass11', 'land_sand01', 'tree_large', 'tree_small', 'tires_red', 'tires_white', 'tribune_full',
    'tent_red', 'tent_blue', 'tent_red_large', 'barrel_red', 'barrel_blue', 'cone_straight'];
  for (const c of Object.keys(COLORS)) names.push(`car_${c}_1`, `motorcycle_${c}`);
  const ready = Promise.all(names.map(n => new Promise(res => {
    const im = new Image(); im.onload = res; im.onerror = res; im.src = A + n + '.png'; IMG[n] = im;
  })));

  /* ---------- Bestenliste ---------- */
  const fmt = (t) => {
    if (t == null || !isFinite(t)) return '–';
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${s.toFixed(2).padStart(5, '0')}`;
  };
  const hsGet = (id) => store.get('hs.' + id, []);
  function hsAdd(id, entry) {
    const list = hsGet(id);
    list.push(entry);
    list.sort((a, b) => a.time - b.time);
    const top = list.slice(0, 10);
    store.set('hs.' + id, top);
    return top.indexOf(entry);
  }
  const qualifies = (id, time) => { const l = hsGet(id); return l.length < 10 || time < l[l.length - 1].time; };

  /* ---------- Menü ---------- */
  function drawPreview(cv, tr) {
    const r = devicePixelRatio || 1;
    cv.width = 120 * r; cv.height = 72 * r;
    const g = cv.getContext('2d');
    const s = Math.min((cv.width - 16 * r) / (tr.worldW - 600), (cv.height - 16 * r) / (tr.worldH - 600));
    g.save();
    g.translate(cv.width / 2, cv.height / 2);
    g.scale(s, s);
    g.translate(-tr.worldW / 2, -tr.worldH / 2);
    g.lineJoin = 'round';
    path(g, tr.samples);
    g.strokeStyle = '#e8eef0'; g.lineWidth = tr.width + 70; g.stroke();
    g.strokeStyle = '#7d8c92'; g.lineWidth = tr.width; g.stroke();
    const p = tr.samples[0];
    g.fillStyle = '#fff'; g.beginPath(); g.arc(p.x, p.y, 90, 0, 7); g.fill();
    g.restore();
  }

  function buildMenu() {
    const tracksEl = $('#tracks');
    tracksEl.innerHTML = '';
    for (const tr of TRACKS) {
      const b = document.createElement('button');
      b.className = 'choice' + (tr.id === opt.track ? ' on' : '');
      const cv = document.createElement('canvas');
      drawPreview(cv, tr);
      const best = hsGet(tr.id)[0];
      b.appendChild(cv);
      b.insertAdjacentHTML('beforeend', `<span><b>${tr.name}</b><small>${tr.desc}<br>${Math.round(tr.length / 100) / 10} km · Rekord ${best ? fmt(best.time) : '–'}</small></span>`);
      b.onclick = () => { opt.track = tr.id; store.set('track', tr.id); buildMenu(); };
      tracksEl.appendChild(b);
    }
    const vEl = $('#vehicles');
    vEl.innerHTML = '';
    for (const [id, v] of Object.entries(VEHICLES)) {
      const b = document.createElement('button');
      b.className = 'choice vehicle' + (id === opt.vehicle ? ' on' : '');
      const bars = Object.entries(v.stats).map(([k, x]) => `<span>${k}</span><span class="bar"><i style="width:${x * 100}%"></i></span>`).join('');
      b.innerHTML = `<span class="pic"><img src="${A + v.img(opt.color)}.png" alt=""></span><span style="flex:1"><b>${v.name}</b><small>${v.desc}</small><span class="bars">${bars}</span></span>`;
      b.onclick = () => { opt.vehicle = id; store.set('vehicle', id); buildMenu(); };
      vEl.appendChild(b);
    }
    const cEl = $('#colors');
    cEl.innerHTML = 'Farbe';
    for (const [c, hex] of Object.entries(COLORS)) {
      const s = document.createElement('button');
      s.className = 'sw' + (c === opt.color ? ' on' : '');
      s.style.background = hex;
      s.title = c;
      s.onclick = () => { opt.color = c; store.set('color', c); buildMenu(); };
      cEl.appendChild(s);
    }
    renderHighscores();
  }

  function renderHighscores(highlight = -1) {
    const tr = TRACKS.find(t => t.id === opt.track);
    $('#hsTrack').textContent = tr.name;
    const list = hsGet(tr.id);
    const ol = $('#hsList');
    ol.innerHTML = '';
    for (let i = 0; i < 10; i++) {
      const e = list[i];
      const li = document.createElement('li');
      if (!e) { li.className = 'empty'; li.innerHTML = '<span class="who">—</span><b></b>'; }
      else {
        if (i === highlight) li.className = 'new';
        const who = document.createElement('span');
        who.className = 'who';
        who.textContent = e.name + ' ';
        who.insertAdjacentHTML('beforeend', `<small>${VEHICLES[e.veh]?.name || ''}</small>`);
        li.appendChild(who);
        li.insertAdjacentHTML('beforeend', `<b>${fmt(e.time)}</b>`);
      }
      ol.appendChild(li);
    }
  }

  /* ---------- Hilfsfunktionen ---------- */
  function path(g, s) {
    g.beginPath();
    g.moveTo(s[0].x, s[0].y);
    for (let i = 1; i < s.length; i++) g.lineTo(s[i].x, s[i].y);
    g.closePath();
  }
  function rng(seed) {
    let a = 0;
    for (const ch of seed) a = (a * 31 + ch.charCodeAt(0)) | 0;
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function minDistTrack(tr, x, y, step = 3) {
    let d = Infinity;
    const s = tr.samples;
    for (let i = 0; i < s.length; i += step) d = Math.min(d, (s[i].x - x) ** 2 + (s[i].y - y) ** 2);
    return Math.sqrt(d);
  }
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

  /* ---------- Strecke vorbereiten ---------- */
  function buildWorld(tr) {
    const W = tr.width;
    const wc = document.createElement('canvas');
    wc.width = Math.ceil(tr.worldW); wc.height = Math.ceil(tr.worldH);
    const g = wc.getContext('2d');
    g.fillStyle = g.createPattern(IMG.land_grass11, 'repeat');
    g.fillRect(0, 0, wc.width, wc.height);

    // Deko & Hindernisse (immer gleich pro Strecke)
    const rand = rng(tr.id);
    const solids = [];
    const sprites = [];
    const s = tr.samples, N = s.length;

    // Tribüne und Zelte am Start
    const p0 = s[Math.floor(N * 0.03)];
    const sideA = minDistTrack(tr, p0.x + p0.nx * (W / 2 + 160), p0.y + p0.ny * (W / 2 + 160));
    const sideB = minDistTrack(tr, p0.x - p0.nx * (W / 2 + 160), p0.y - p0.ny * (W / 2 + 160));
    const side = sideA > sideB ? 1 : -1;
    const ang = Math.atan2(p0.ty, p0.tx);
    sprites.push({ n: 'tribune_full', x: p0.x + p0.nx * side * (W / 2 + 150), y: p0.y + p0.ny * side * (W / 2 + 150), a: ang + (side > 0 ? Math.PI : 0), s: 0.9 });
    for (const off of [-1, 1]) {
      const p = s[(Math.floor(N * 0.03) + off * 45 + N) % N];
      sprites.push({ n: off < 0 ? 'tent_red' : 'tent_blue', x: p.x + p.nx * side * (W / 2 + 120), y: p.y + p.ny * side * (W / 2 + 120), a: ang, s: 0.9 });
    }
    // Reifenstapel an den Kurvenaußenseiten
    for (let i = 0; i < N; i += 14) {
      const a = s[i], b = s[(i + 18) % N];
      const cross = a.tx * b.ty - a.ty * b.tx;
      if (Math.abs(cross) < 0.22) continue;
      const out = -Math.sign(cross);
      const x = a.x + a.nx * out * (W / 2 + 46), y = a.y + a.ny * out * (W / 2 + 46);
      if (minDistTrack(tr, x, y, 2) < W / 2 + 30) continue;
      if (solids.some(o => Math.hypot(o.x - x, o.y - y) < 50)) continue;
      const n = (i / 14) % 2 ? 'tires_red' : 'tires_white';
      sprites.push({ n, x, y, a: 0, s: 0.85 });
      solids.push({ x, y, r: 22 });
    }
    // Bäume
    let tries = 0;
    while (tries++ < 400) {
      const x = 80 + rand() * (wc.width - 160), y = 80 + rand() * (wc.height - 160);
      if (minDistTrack(tr, x, y) < W / 2 + 140) continue;
      if (sprites.some(o => Math.hypot(o.x - x, o.y - y) < 190)) continue;
      const big = rand() < 0.55;
      sprites.push({ n: big ? 'tree_large' : 'tree_small', x, y, a: rand() * 6.28, s: big ? 0.75 : 0.8, tree: true });
      solids.push({ x, y, r: big ? 44 : 34 });
    }

    // Fahrbahn: Randsteine, Asphalt
    g.lineJoin = 'round'; g.lineCap = 'round';
    path(g, s);
    g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = W + 40; g.stroke();
    g.strokeStyle = '#e0393e'; g.lineWidth = W + 24; g.stroke();
    g.lineCap = 'butt'; g.setLineDash([30, 30]); g.strokeStyle = '#ffffff'; g.stroke(); g.setLineDash([]); g.lineCap = 'round';
    g.strokeStyle = g.createPattern(IMG.road_asphalt22, 'repeat'); g.lineWidth = W; g.stroke();
    g.lineCap = 'butt'; g.setLineDash([40, 50]); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 4; g.stroke(); g.setLineDash([]); g.lineCap = 'round';

    // Start/Ziel-Linie (Schachbrett)
    const st = s[0];
    g.save();
    g.translate(st.x, st.y);
    g.rotate(Math.atan2(st.ty, st.tx));
    const q = 12;
    for (let r = -1; r < 2; r++) for (let c = -W / 2; c < W / 2; c += q) {
      g.fillStyle = ((c / q + r) & 1) ? '#222' : '#fff';
      g.fillRect(r * q, c, q, q);
    }
    g.restore();
    // Startplätze
    for (const k of [12, 26]) {
      const p = s[(N - k) % N];
      for (const lane of [-1, 1]) {
        g.save();
        g.translate(p.x + p.nx * lane * W / 4, p.y + p.ny * lane * W / 4);
        g.rotate(Math.atan2(p.ty, p.tx));
        g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(22, -24); g.lineTo(-22, -24); g.lineTo(-22, 24); g.lineTo(22, 24); g.stroke();
        g.restore();
      }
    }

    // Sprites (Bäume zuletzt)
    sprites.sort((a, b) => (a.tree ? 1 : 0) - (b.tree ? 1 : 0));
    for (const o of sprites) {
      const im = IMG[o.n];
      g.save(); g.translate(o.x, o.y); g.rotate(o.a);
      g.drawImage(im, -im.width * o.s / 2, -im.height * o.s / 2, im.width * o.s, im.height * o.s);
      g.restore();
    }
    // Hindernis-Mauern um Tribüne grob als Kreise
    const tb = sprites[0];
    for (let k = -2; k <= 2; k++) solids.push({ x: tb.x + Math.cos(tb.a) * k * 80, y: tb.y + Math.sin(tb.a) * k * 80, r: 60 });

    return { canvas: wc, ctx: g, solids };
  }

  /* ---------- Rennen ---------- */
  let race = null;
  let paused = false;
  let autoPilot = false; // nur für Tests (?debug)
  const keys = { up: false, down: false, left: false, right: false };

  function newCar(tr, startIdx, lane, vehicle, color, npc) {
    const p = tr.samples[startIdx];
    const N = tr.samples.length;
    return {
      x: p.x + p.nx * lane * tr.width / 4, y: p.y + p.ny * lane * tr.width / 4,
      a: Math.atan2(p.tx, -p.ty), vx: 0, vy: 0, speed: 0,
      spec: VEHICLES[vehicle], vehicle, color, img: IMG[VEHICLES[vehicle].img(color)],
      idx: startIdx, prog: startIdx - N, lapsDone: 0, lapStamp: 0, lapTimes: [],
      finished: false, finishTime: 0, npc, skill: npc ? 0.95 : 1, lane: lane * 0.2,
      stuck: 0, reverseT: 0, wrongT: 0, onRoad: true,
    };
  }

  async function startRace() {
    await ready;
    const tr = TRACKS.find(t => t.id === opt.track);
    const world = buildWorld(tr);
    const N = tr.samples.length;
    const npcColors = Object.keys(COLORS).filter(c => c !== opt.color);
    const npcColor = npcColors[Math.random() * npcColors.length | 0];
    const player = newCar(tr, (N - 12) % N, 1, opt.vehicle, opt.color, false);
    const npc = newCar(tr, (N - 12) % N, -1, opt.vehicle, npcColor, true);
    race = { tr, world, cars: [player, npc], player, npc, t: -3.6, state: 'countdown', msg: null, finishOrder: [] };
    paused = false;
    $('#menu').hidden = true;
    $('#dlg').hidden = true;
    $('#hudBtns').hidden = false;
    $('#touch').classList.add('show');
    canvas.focus();
  }

  function showMenu() {
    race = null;
    $('#menu').hidden = false;
    $('#dlg').hidden = true;
    $('#hudBtns').hidden = true;
    $('#touch').classList.remove('show');
    buildMenu();
  }

  function locate(car) {
    const s = race.tr.samples, N = s.length;
    let best = car.idx, bd = Infinity;
    for (let k = -30; k <= 60; k++) {
      const i = (car.idx + k + N) % N;
      const d = (s[i].x - car.x) ** 2 + (s[i].y - car.y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    // weit verloren? → globale Suche
    if (bd > (race.tr.width * 3) ** 2) {
      for (let i = 0; i < N; i++) { const d = (s[i].x - car.x) ** 2 + (s[i].y - car.y) ** 2; if (d < bd) { bd = d; best = i; } }
    }
    let delta = best - car.idx;
    if (delta > N / 2) delta -= N;
    if (delta < -N / 2) delta += N;
    car.prog += delta;
    car.idx = best;
    car.dist = Math.sqrt(bd);
    car.onRoad = car.dist < race.tr.width / 2 + 6;
  }

  function physics(car, throttle, steer, dt) {
    const sp = car.spec;
    let fx = Math.sin(car.a), fy = -Math.cos(car.a);
    const fwd0 = car.vx * fx + car.vy * fy;
    // Lenken (abhängig von der Geschwindigkeit, rückwärts invertiert)
    const sf = Math.max(-1, Math.min(1, fwd0 / 150));
    car.a += steer * sp.turn * dt * sf * (1 - 0.28 * Math.min(1, Math.abs(fwd0) / sp.maxSpeed));
    fx = Math.sin(car.a); fy = -Math.cos(car.a);
    let fwd = car.vx * fx + car.vy * fy;
    let lx = car.vx - fx * fwd, ly = car.vy - fy * fwd;

    const maxS = sp.maxSpeed * car.skill * (car.onRoad ? 1 : sp.offroad);
    if (throttle > 0) fwd += sp.accel * throttle * dt * (fwd < 0 ? 2.5 : 1);
    else if (throttle < 0) fwd -= (fwd > 5 ? sp.brake : sp.revAccel) * -throttle * dt;
    else { const d = sp.drag * dt; fwd = Math.abs(fwd) <= d ? 0 : fwd - Math.sign(fwd) * d; }
    if (fwd > maxS) fwd = Math.max(maxS, fwd - (car.onRoad ? sp.brake : 1100) * dt);
    if (fwd < -sp.revMax) fwd = -sp.revMax;

    const grip = Math.min(1, sp.grip * (car.onRoad ? 1 : 0.6) * dt);
    car.drift = Math.hypot(lx, ly);
    lx -= lx * grip; ly -= ly * grip;
    car.vx = fx * fwd + lx; car.vy = fy * fwd + ly;
    car.x += car.vx * dt; car.y += car.vy * dt;
    car.speed = fwd;
    car.x = Math.max(30, Math.min(race.tr.worldW - 30, car.x));
    car.y = Math.max(30, Math.min(race.tr.worldH - 30, car.y));

    // Bremsspuren
    if ((car.drift > 90 || (throttle < 0 && fwd > 200)) && Math.random() < 0.9) {
      const g = race.world.ctx;
      g.fillStyle = 'rgba(30,30,30,.18)';
      const bx = car.x - fx * 22, by = car.y - fy * 22;
      const off = car.spec === VEHICLES.bike ? [0] : [-12, 12];
      for (const o of off) g.fillRect(bx + -fy * o - 3, by + fx * o - 3, 6, 6);
    }
  }

  function npcDrive(car, dt) {
    const s = race.tr.samples, N = s.length;
    if (car.reverseT > 0) { car.reverseT -= dt; return { throttle: -1, steer: car.revSteer }; }
    const look = Math.round(14 + Math.max(0, car.speed) / 24);
    const tp = s[(car.idx + look) % N];
    // leicht auf der eigenen Spur bleiben, Kurven innen anschneiden
    const ahead = s[(car.idx + look + 30) % N];
    const cross = tp.tx * ahead.ty - tp.ty * ahead.tx;
    const off = (car.lane - cross * 1.6) * race.tr.width * 0.5;
    const tx = tp.x + tp.nx * off, ty = tp.y + tp.ny * off;
    const want = Math.atan2(tx - car.x, -(ty - car.y));
    const d = angDiff(want, car.a);
    const steer = Math.max(-1, Math.min(1, d * 3.2));
    // Kurvenschärfe voraus → Zielgeschwindigkeit
    let sharp = 0;
    const p1 = s[(car.idx + 8) % N];
    for (const k of [30, 55, 80]) {
      const p2 = s[(car.idx + k) % N];
      sharp = Math.max(sharp, Math.acos(Math.max(-1, Math.min(1, p1.tx * p2.tx + p1.ty * p2.ty))));
    }
    const vmax = car.spec.maxSpeed * car.skill;
    const target = vmax * Math.max(0.42, 1 - sharp * 0.55);
    const throttle = car.speed < target ? 1 : car.speed > target + 60 ? -0.6 : 0;
    // festgefahren?
    if (race.state === 'run' && Math.abs(car.speed) < 25) car.stuck += dt; else car.stuck = 0;
    if (car.stuck > 1.2) { car.stuck = 0; car.reverseT = 0.9; car.revSteer = -Math.sign(d) || 1; }
    return { throttle, steer };
  }

  function collide() {
    // Fahrzeuge untereinander
    const [a, b] = race.cars;
    const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy), min = a.spec.radius + b.spec.radius;
    if (dist > 0 && dist < min) {
      const nx = dx / dist, ny = dy / dist, push = (min - dist) / 2;
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) { a.vx += nx * rel * 0.5; a.vy += ny * rel * 0.5; b.vx -= nx * rel * 0.5; b.vy -= ny * rel * 0.5; }
    }
    // Hindernisse
    for (const c of race.cars) for (const o of race.world.solids) {
      const ox = c.x - o.x, oy = c.y - o.y, d = Math.hypot(ox, oy), m = o.r + c.spec.radius;
      if (d > 0 && d < m) {
        const nx = ox / d, ny = oy / d;
        c.x = o.x + nx * m; c.y = o.y + ny * m;
        const vn = c.vx * nx + c.vy * ny;
        if (vn < 0) { c.vx -= nx * vn * 1.4; c.vy -= ny * vn * 1.4; c.vx *= 0.6; c.vy *= 0.6; }
      }
    }
  }

  function update(dt) {
    if (!race || paused) return;
    race.t += dt;
    if (race.msg) race.msg.t += dt;
    if (race.state === 'countdown' && race.t >= 0) { race.state = 'run'; race.t = 0; }
    const running = race.state !== 'countdown';
    const N = race.tr.samples.length;

    for (const car of race.cars) {
      let input = { throttle: 0, steer: 0 };
      if (running) {
        if (car.npc || car.finished || autoPilot) input = npcDrive(car, dt);
        else input = { throttle: keys.up ? 1 : keys.down ? -1 : 0, steer: (keys.right ? 1 : 0) - (keys.left ? 1 : 0) };
      }
      if (car.finished && !car.npc) input.throttle = Math.min(input.throttle, 0.4);
      physics(car, input.throttle, input.steer, dt);
    }
    collide();
    for (const car of race.cars) {
      locate(car);
      if (!running || car.finished) continue;
      const done = Math.floor(car.prog / N);
      if (done > car.lapsDone) {
        car.lapsDone = done;
        car.lapTimes.push(race.t - car.lapStamp);
        car.lapStamp = race.t;
        if (done >= LAPS) {
          car.finished = true;
          car.finishTime = race.t;
          race.finishOrder.push(car);
          if (car.npc && !race.player.finished) flash('Dein Gegner ist im Ziel!');
          if (!car.npc) finishPlayer();
        } else if (!car.npc) flash(done === LAPS - 1 ? 'Letzte Runde!' : `Runde ${done + 1}`);
      }
      // Falsche Richtung
      const tp = race.tr.samples[car.idx];
      if (!car.npc) car.wrongT = (car.vx * tp.tx + car.vy * tp.ty) < -60 ? car.wrongT + dt : 0;
    }
  }

  function flash(text) { race.msg = { text, t: 0 }; }

  function finishPlayer() {
    race.state = 'done';
    const p = race.player;
    const place = race.finishOrder.indexOf(p) + 1;
    const time = p.finishTime;
    const can = qualifies(race.tr.id, time);
    const bestLap = Math.min(...p.lapTimes);
    const laps = p.lapTimes.map((t, i) => `<tr><td>Runde ${i + 1}</td><td class="num">${t === bestLap ? '<b>' + fmt(t) + '</b>' : fmt(t)}</td></tr>`).join('');
    setTimeout(() => {
      if (!race || race.player !== p) return;
      $('#dlgPanel').innerHTML = `<h2>${place === 1 ? 'Sieg! 🏁' : 'Platz 2'}</h2>
        <p>${race.tr.name} · ${VEHICLES[p.vehicle].name} · Gesamtzeit <b>${fmt(time)}</b></p>
        <table class="score">${laps}<tr><td>Gesamt</td><td class="num"><b>${fmt(time)}</b></td></tr></table>
        ${can ? `<p>Neue Top-10-Zeit! Dein Name für die Bestenliste:</p><input id="hsName" maxlength="16" value="">` : '<p>Für die Top 10 hat es diesmal nicht gereicht.</p>'}
        <div class="actions"><button class="btn" data-a="menu">Menü</button><button class="btn primary" data-a="again">Nochmal</button></div>`;
      $('#dlg').hidden = false;
      const inp = $('#hsName');
      if (inp) { inp.value = opt.name; inp.focus(); inp.select(); }
      race.pending = can ? { time, veh: p.vehicle } : null;
    }, 1400);
  }

  function commitScore() {
    if (!race || !race.pending) return;
    const inp = $('#hsName');
    const name = (inp?.value || 'Spieler').trim().slice(0, 16) || 'Spieler';
    opt.name = name; store.set('name', name);
    hsAdd(race.tr.id, { name, time: race.pending.time, veh: race.pending.veh, date: Date.now() });
    race.pending = null;
  }

  /* ---------- Zeichnen ---------- */
  const view = { s: 1, cx: 0, cy: 0 };
  function draw() {
    const cw = canvas.width, ch = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!race) {
      ctx.fillStyle = '#3e8f45'; ctx.fillRect(0, 0, cw, ch);
      if (IMG.land_grass11.complete && IMG.land_grass11.naturalWidth) { ctx.fillStyle = ctx.createPattern(IMG.land_grass11, 'repeat'); ctx.fillRect(0, 0, cw, ch); }
      return;
    }
    const p = race.player;
    const s = Math.min(cw / 1250, ch / 800) * 1.0;
    // Kamera folgt mit leichtem Vorlauf
    const tx = p.x + p.vx * 0.35, ty = p.y + p.vy * 0.35;
    view.cx += (tx - view.cx) * (race.t < -3.4 ? 1 : 0.12);
    view.cy += (ty - view.cy) * (race.t < -3.4 ? 1 : 0.12);
    const hw = cw / 2 / s, hh = ch / 2 / s;
    const camX = Math.max(hw, Math.min(race.tr.worldW - hw, view.cx));
    const camY = Math.max(hh, Math.min(race.tr.worldH - hh, view.cy));
    ctx.fillStyle = '#3e8f45'; ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(s, 0, 0, s, cw / 2 - camX * s, ch / 2 - camY * s);
    const sx = Math.max(0, camX - hw - 4), sy = Math.max(0, camY - hh - 4);
    const sw = Math.min(race.tr.worldW - sx, hw * 2 + 8), sh = Math.min(race.tr.worldH - sy, hh * 2 + 8);
    ctx.drawImage(race.world.canvas, sx, sy, sw, sh, sx, sy, sw, sh);

    for (const c of [...race.cars].sort((a, b) => (a === p) - (b === p))) {
      const im = c.img, sc = c.spec.scale;
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
      ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 8; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 5;
      ctx.drawImage(im, -im.width * sc / 2, -im.height * sc / 2, im.width * sc, im.height * sc);
      ctx.restore();
    }
    // Namensschild NPC
    const n = race.npc;
    ctx.font = '600 15px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillText('NPC', n.x + 1, n.y - 45 + 1);
    ctx.fillStyle = '#fff'; ctx.fillText('NPC', n.x, n.y - 45);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    hud(cw, ch);
  }

  function hud(cw, ch) {
    const k = Math.max(0.7, Math.min(1.4, Math.min(cw / 1250, ch / 800) * (devicePixelRatio > 1 ? 1 : 1)));
    const p = race.player, n = race.npc, N = race.tr.samples.length;
    const pad = 14 * k;
    // Infobox
    const lap = Math.min(LAPS, Math.max(1, p.lapsDone + 1));
    const tNow = p.finished ? p.finishTime : Math.max(0, race.state === 'countdown' ? 0 : race.t);
    const ahead = p.finished ? race.finishOrder.indexOf(p) === 0 : n.finished ? false : p.prog >= n.prog;
    box(pad, pad, 240 * k, 112 * k);
    ctx.fillStyle = '#18222e'; ctx.textAlign = 'left';
    ctx.font = `700 ${22 * k}px system-ui, sans-serif`;
    ctx.fillText(`Runde ${lap}/${LAPS}`, pad + 14 * k, pad + 32 * k);
    ctx.textAlign = 'right';
    ctx.fillStyle = ahead ? '#2f9e5b' : '#e5484d';
    ctx.fillText(`${ahead ? 1 : 2}. Platz`, pad + 226 * k, pad + 32 * k);
    ctx.textAlign = 'left'; ctx.fillStyle = '#18222e';
    ctx.font = `600 ${18 * k}px system-ui, sans-serif`;
    ctx.fillText(fmt(tNow), pad + 14 * k, pad + 62 * k);
    ctx.font = `${13 * k}px system-ui, sans-serif`; ctx.fillStyle = '#4b5866';
    const cur = race.state === 'countdown' || p.finished ? 0 : race.t - p.lapStamp;
    const best = p.lapTimes.length ? Math.min(...p.lapTimes) : null;
    ctx.fillText(`Runde ${fmt(cur)}  ·  Beste ${fmt(best)}`, pad + 14 * k, pad + 86 * k);
    ctx.fillText(`${Math.round(Math.abs(p.speed) * 0.36)} km/h${p.onRoad ? '' : ' · Gras!'}`, pad + 14 * k, pad + 104 * k);

    // Minikarte
    const mw = 190 * k, mh = 150 * k, mx = cw - mw - pad, my = ch - mh - pad;
    box(mx, my, mw, mh);
    const sc = Math.min((mw - 20 * k) / race.tr.worldW, (mh - 20 * k) / race.tr.worldH);
    const ox = mx + (mw - race.tr.worldW * sc) / 2, oy = my + (mh - race.tr.worldH * sc) / 2;
    ctx.save(); ctx.translate(ox, oy); ctx.scale(sc, sc);
    path(ctx, race.tr.samples);
    ctx.strokeStyle = '#8796a0'; ctx.lineWidth = race.tr.width; ctx.lineJoin = 'round'; ctx.stroke();
    const st = race.tr.samples[0];
    ctx.fillStyle = '#fff'; ctx.fillRect(st.x - 40, st.y - 40, 80, 80);
    for (const c of [n, p]) {
      ctx.fillStyle = c === p ? '#ffffff' : '#18222e';
      ctx.beginPath(); ctx.arc(c.x, c.y, 70, 0, 7); ctx.fill();
      ctx.fillStyle = COLORS[c.color];
      ctx.beginPath(); ctx.arc(c.x, c.y, 48, 0, 7); ctx.fill();
    }
    ctx.restore();

    // Countdown & Meldungen
    ctx.textAlign = 'center';
    if (race.state === 'countdown' || (race.state === 'run' && race.t < 0.8)) {
      const t = race.state === 'countdown' ? race.t : 0.01;
      const label = t < -2.4 ? '3' : t < -1.2 ? '2' : t < 0 ? '1' : 'LOS!';
      const lights = t < -2.4 ? 1 : t < -1.2 ? 2 : t < 0 ? 3 : 4;
      bigText(label, cw / 2, ch * 0.38, 110 * k, lights === 4 ? '#5bd463' : '#ffd23f');
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = 'rgba(20,24,30,.8)';
        ctx.beginPath(); ctx.arc(cw / 2 + (i - 1) * 60 * k, ch * 0.22, 24 * k, 0, 7); ctx.fill();
        ctx.fillStyle = lights === 4 ? '#5bd463' : i < lights ? '#ff4b3e' : '#3a3f47';
        ctx.beginPath(); ctx.arc(cw / 2 + (i - 1) * 60 * k, ch * 0.22, 18 * k, 0, 7); ctx.fill();
      }
    }
    if (race.msg) {
      if (race.msg.t > 2) race.msg = null;
      else { ctx.globalAlpha = Math.min(1, 2 - race.msg.t); bigText(race.msg.text, cw / 2, ch * 0.3, 52 * k, '#fff'); ctx.globalAlpha = 1; }
    }
    if (p.wrongT > 1 && !p.finished) bigText('Falsche Richtung!', cw / 2, ch * 0.42, 48 * k, '#ff6b5e');
    if (race.state === 'done' && $('#dlg').hidden) bigText('ZIEL!', cw / 2, ch * 0.35, 90 * k, '#fff');
    if (paused) bigText('Pause', cw / 2, ch / 2, 80 * k, '#fff');
  }

  function box(x, y, w, h) {
    ctx.fillStyle = 'rgba(255,255,255,.78)';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, 12) : ctx.rect(x, y, w, h); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1; ctx.stroke();
  }
  function bigText(t, x, y, size, color) {
    ctx.font = `800 ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.16; ctx.strokeStyle = 'rgba(20,30,40,.75)';
    ctx.strokeText(t, x, y); ctx.fillStyle = color; ctx.fillText(t, x, y);
    ctx.textBaseline = 'alphabetic';
  }

  /* ---------- Eingabe ---------- */
  const MAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') { if (e.key === 'Enter') $('[data-a=again]')?.click(); return; }
    const k = MAP[e.code];
    if (k) { keys[k] = true; e.preventDefault(); }
    if ((e.code === 'KeyP' || e.code === 'Escape') && race && race.state !== 'done') togglePause();
    if (e.code === 'Enter' && !$('#menu').hidden) startRace();
  });
  addEventListener('keyup', (e) => { const k = MAP[e.code]; if (k) keys[k] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  document.querySelectorAll('#touch button').forEach(b => {
    const k = b.dataset.k;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); keys[k] = true; });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { keys[k] = false; });
  });

  function togglePause() {
    paused = !paused;
    $('#pauseBtn').textContent = paused ? 'Weiter (P)' : 'Pause (P)';
  }
  $('#pauseBtn').onclick = () => { if (race && race.state !== 'done') togglePause(); };
  $('#menuBtn').onclick = showMenu;
  $('#goBtn').onclick = startRace;
  $('#dlg').addEventListener('click', (e) => {
    const a = e.target.dataset.a;
    if (!a) return;
    const trackId = race?.tr.id;
    const hadPending = !!race?.pending;
    commitScore();
    if (a === 'again') startRace();
    if (a === 'menu') {
      showMenu();
      if (hadPending && trackId) {
        const list = hsGet(trackId);
        renderHighscores(list.findIndex(x => x.name === opt.name && Date.now() - x.date < 5000));
      }
    }
  });

  /* ---------- Hauptschleife ---------- */
  function resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
  }
  addEventListener('resize', resize);
  resize();
  canvas.tabIndex = 0;

  let last = performance.now();
  function loop(now) {
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // feste Teilschritte für stabile Physik
    while (dt > 0) { const st = Math.min(dt, 1 / 120); update(st); dt -= st; }
    draw();
    requestAnimationFrame(loop);
  }
  if (/[?&]debug\b/.test(location.search)) window.__race = { get: () => race, setAuto(v) { autoPilot = v; } };
  ready.then(buildMenu);
  buildMenu();
  requestAnimationFrame(loop);
})();
