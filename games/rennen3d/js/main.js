/* Rennen 3D – Hauptprogramm: Menü, Rennen, HUD, Ton, Ergebnis, Replay. */
import * as THREE from 'three';
import { buildTracks } from './tracks3d.js';
import { makeCar, step, locate, npcDrive, collide } from './physics.js';
import { loadModels, makeCarMesh, syncCar, CAR_COLORS } from './models.js';
import { World, TIMES, FOGS } from './world.js';
import { Post } from './post.js';
import { Recorder, Director, CAM_MODES, SHOT_NAMES } from './replay.js';

const LAPS = 3;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (t) => { if (t == null || !isFinite(t)) return '–'; const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, '0')}`; };
const QUALS = { low: 'Niedrig', medium: 'Mittel', high: 'Hoch' };

/* ---------- Einstellungen ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('race3d.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem('race3d.' + k, JSON.stringify(v)); } catch (_) {} },
};
const isMobile = matchMedia('(pointer: coarse)').matches;
const opt = Object.assign({ track: 'oval', color: 'Red', opps: 3, time: 'dusk', fog: 'light', quality: isMobile ? 'low' : 'high', name: 'Spieler', sound: true }, store.get('opt', {}));
const saveOpt = () => store.set('opt', opt);

/* ---------- Renderer ---------- */
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const camera = new THREE.PerspectiveCamera(60, 1, 0.2, 3000);
function pixelRatio() { const d = devicePixelRatio || 1; return opt.quality === 'high' ? Math.min(d, 2) : opt.quality === 'medium' ? Math.min(d, 1.25) : Math.min(d, 1) * 0.75; }
renderer.setPixelRatio(pixelRatio());
renderer.setSize(innerWidth, innerHeight, false);
const world = new World(renderer);
const post = new Post(renderer, world.scene, camera);
function resize() {
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  post.resize();
}
addEventListener('resize', resize);

const TRACKS = buildTracks();
if (!TRACKS.some(t => t.id === opt.track)) opt.track = 'oval';

/* ---------- Bestenliste ---------- */
const hsGet = (id) => store.get('hs.' + id, []);
function hsAdd(id, e) { const l = hsGet(id); l.push(e); l.sort((a, b) => a.time - b.time); store.set('hs.' + id, l.slice(0, 10)); return l.indexOf(e); }
const qualifies = (id, t) => { const l = hsGet(id); return l.length < 10 || t < l[l.length - 1].time; };

/* ---------- Zustand ---------- */
const G = { mode: 'loading', tr: null, cars: [], meshes: [], t: 0, state: 'countdown', paused: false, cam: 0, finishOrder: [], rec: null, orbit: 0 };
const keys = { up: false, down: false, left: false, right: false };
let autopilot = false;
const CAMS = ['Verfolger', 'Nah', 'Motorhaube'];

/* ---------- Ton ---------- */
const Sound = {
  ctx: null,
  init() {
    if (this.ctx || !opt.sound) return;
    try {
      const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(ctx.destination);
      this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
      this.o2 = ctx.createOscillator(); this.o2.type = 'square';
      this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 900; this.lp.Q.value = 2;
      this.eng = ctx.createGain(); this.eng.gain.value = 0;
      const g2 = ctx.createGain(); g2.gain.value = 0.35;
      this.o1.connect(this.lp); this.o2.connect(g2).connect(this.lp); this.lp.connect(this.eng).connect(this.master);
      this.o1.start(); this.o2.start();
      const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = ctx.createBufferSource(); this.noise.buffer = nb; this.noise.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 3;
      this.squeal = ctx.createGain(); this.squeal.gain.value = 0;
      this.noise.connect(bp).connect(this.squeal).connect(this.master); this.noise.start();
    } catch (_) { this.ctx = null; }
  },
  engine(speed, throttle, drift, onRoad, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, v = Math.abs(speed);
    const gear = Math.min(5, Math.floor(v / 12.5)), r = (v - gear * 12.5) / 12.5;
    const f = 55 + gear * 9 + r * 85 + (throttle > 0 ? 6 : 0);
    this.o1.frequency.setTargetAtTime(f, t, 0.05); this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.lp.frequency.setTargetAtTime(500 + v * 25 + (throttle > 0 ? 500 : 0), t, 0.08);
    this.eng.gain.setTargetAtTime(on ? 0.1 + Math.min(0.12, v * 0.002) + (throttle > 0 ? 0.05 : 0) : 0, t, 0.08);
    this.squeal.gain.setTargetAtTime(on && onRoad && drift > 5 && v > 10 ? Math.min(0.12, (drift - 5) * 0.02) : 0, t, 0.05);
  },
  hit(power) {
    if (!this.ctx || power < 3) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    g.gain.setValueAtTime(Math.min(0.5, power * 0.03), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.32);
  },
  beep(high) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.value = high ? 880 : 440;
    g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + (high ? 0.6 : 0.25));
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.65);
  },
  mute(on) { if (this.master) this.master.gain.value = on ? 0 : 0.5; },
};

/* ---------- Menü ---------- */
function drawPreview(cv, tr) {
  const r = devicePixelRatio || 1;
  cv.width = 110 * r; cv.height = 66 * r;
  const g = cv.getContext('2d');
  const b = tr.bounds, w = b.maxX - b.minX - 100, h = b.maxZ - b.minZ - 100;
  const s = Math.min((cv.width - 14 * r) / w, (cv.height - 14 * r) / h);
  g.save(); g.translate(cv.width / 2, cv.height / 2); g.scale(s, s); g.translate(-tr.center.x, -tr.center.z);
  g.beginPath(); tr.samples.forEach((p, i) => i ? g.lineTo(p.x, p.z) : g.moveTo(p.x, p.z)); g.closePath();
  g.lineJoin = 'round'; g.strokeStyle = '#e8eef0'; g.lineWidth = tr.width + 7; g.stroke();
  g.strokeStyle = '#59646b'; g.lineWidth = tr.width; g.stroke();
  g.restore();
}
function pickRow(el, items, cur, onPick, render) {
  el.innerHTML = '';
  for (const [k, label] of items) {
    const b = document.createElement('button');
    b.className = (render ? 'sw' : '') + (k === cur ? ' on' : '');
    if (render) render(b, k); else b.textContent = label;
    b.title = label;
    b.onclick = () => onPick(k);
    el.appendChild(b);
  }
}
function buildMenu() {
  const te = $('#tracks'); te.innerHTML = '';
  for (const tr of TRACKS) {
    const b = document.createElement('button');
    b.className = 'choice' + (tr.id === opt.track ? ' on' : '');
    const cv = document.createElement('canvas'); drawPreview(cv, tr);
    const best = hsGet(tr.id)[0];
    b.appendChild(cv);
    b.insertAdjacentHTML('beforeend', `<span><b>${tr.name}</b><small>${Math.round(tr.length)} m pro Runde · Rekord ${best ? fmt(best.time) : '–'}</small></span>`);
    b.onclick = () => { opt.track = tr.id; saveOpt(); showMenu(); };
    te.appendChild(b);
  }
  pickRow($('#colors'), Object.entries(CAR_COLORS).map(([k, v]) => [k, v.name]), opt.color, (k) => { opt.color = k; saveOpt(); showMenu(); }, (b, k) => { b.style.background = CAR_COLORS[k].hex; });
  pickRow($('#opps'), [[1, '1'], [2, '2'], [3, '3']], opt.opps, (k) => { opt.opps = k; saveOpt(); showMenu(); });
  pickRow($('#times'), Object.entries(TIMES).map(([k, v]) => [k, v.name]), opt.time, (k) => { opt.time = k; saveOpt(); world.setAtmosphere(opt.time, opt.fog); buildMenu(); });
  pickRow($('#fogs'), Object.entries(FOGS).map(([k, v]) => [k, v.name]), opt.fog, (k) => { opt.fog = k; saveOpt(); world.setAtmosphere(opt.time, opt.fog); buildMenu(); });
  pickRow($('#quals'), Object.entries(QUALS), opt.quality, (k) => { opt.quality = k; saveOpt(); applyQuality(); buildMenu(); });
  renderHighscores();
}
function renderHighscores(hl = -1) {
  const tr = TRACKS.find(t => t.id === opt.track);
  $('#hsTrack').textContent = tr.name;
  const l = hsGet(tr.id), ol = $('#hsList');
  ol.innerHTML = '';
  for (let i = 0; i < 10; i++) {
    const e = l[i], li = document.createElement('li');
    if (!e) { li.className = 'empty'; li.innerHTML = '<span class="who">—</span><b></b>'; }
    else { if (i === hl) li.className = 'new'; li.innerHTML = `<span class="who">${esc(e.name)} <small style="opacity:.6">${CAR_COLORS[e.color]?.name || ''}</small></span><b>${fmt(e.time)}</b>`; }
    ol.appendChild(li);
  }
}
function applyQuality() {
  world.setQuality(opt.quality);
  post.setQuality(opt.quality);
  resize();
}

function setTrack(id) {
  const tr = TRACKS.find(t => t.id === id);
  if (G.tr !== tr) { G.tr = tr; world.setTrack(tr); }
  world.setAtmosphere(opt.time, opt.fog);
}

function clearCars() { for (const m of G.meshes) world.scene.remove(m); G.meshes = []; G.cars = []; }

function spawnCars(forMenu) {
  clearCars();
  const tr = G.tr, n = 1 + opt.opps;
  const slots = [[8, -1], [8, 1], [18, -1], [18, 1]];
  const playerSlot = n >= 3 ? 2 : 1;
  const others = Object.keys(CAR_COLORS).filter(c => c !== opt.color);
  const skills = [0.958, 0.94, 0.968];
  const names = ['Anna', 'Ben', 'Clara'];
  let k = 0;
  for (let s = 0; s < n; s++) {
    const [back, lane] = slots[s];
    const idx = tr.N - Math.round(back / tr.spacing);
    const isP = s === playerSlot;
    const color = isP ? opt.color : others[k % others.length];
    const car = makeCar(tr, idx, lane * tr.width / 4, isP ? { name: 'Du', color } : { npc: true, skill: skills[k], laneBias: [-0.15, 0.15, 0][k], name: names[k], color });
    if (!isP) k++;
    const spot = !forMenu && (opt.quality === 'high' || isP || (opt.quality === 'medium' && s < 2));
    const mesh = makeCarMesh(color, spot);
    world.scene.add(mesh);
    G.cars.push(car); G.meshes.push(mesh);
    if (isP) G.player = car;
  }
  G.playerIdx = G.cars.indexOf(G.player);
}

function showMenu() {
  G.mode = 'menu';
  setTrack(opt.track);
  spawnCars(true);
  $('#menu').hidden = false; $('#hud').hidden = true; $('#topBtns').hidden = true; $('#rp').hidden = true; $('#dlg').hidden = true;
  $('#touch').classList.remove('show');
  post.set({ letterbox: 0, speed: 0, fade: 0 });
  post.setDof(false);
  buildMenu();
}

/* ---------- Rennen ---------- */
function startRace() {
  Sound.init();
  setTrack(opt.track);
  world.clearSkids();
  spawnCars(false);
  G.mode = 'race'; G.state = 'countdown'; G.t = -4.4; G.paused = false; G.finishOrder = []; G.doneT = 0;
  G.rec = new Recorder(G.cars.length);
  G.introT = 0;
  G.lastLight = -1;
  $('#menu').hidden = true; $('#hud').hidden = false; $('#topBtns').hidden = false; $('#rp').hidden = true; $('#dlg').hidden = true;
  $('#touch').classList.add('show');
  $('#pauseBtn').textContent = 'Pause';
  post.set({ letterbox: 0, fade: 0 });
  post.setDof(false);
  world.setStartLights(0, false);
  canvas.focus();
}

function racingUpdate(dt) {
  G.t += dt;
  if (G.state === 'countdown') {
    const n = Math.min(5, Math.floor((G.t + 4.4) / 0.75));
    if (n !== G.lastLight && n >= 1) { G.lastLight = n; world.setStartLights(n, false); Sound.beep(false); }
    if (G.t >= 0) { G.state = 'run'; G.t = 0; world.setStartLights(0, true); Sound.beep(true); flash('LOS!'); }
  }
  const running = G.state !== 'countdown';
  const tr = G.tr, N = tr.N;
  for (const c of G.cars) {
    let inp = { throttle: 0, steer: 0 };
    if (running) {
      if (c.npc || c.finished || autopilot) inp = npcDrive(c, tr, dt, true);
      else inp = { throttle: keys.up ? 1 : keys.down ? -1 : 0, steer: (keys.right ? 1 : 0) - (keys.left ? 1 : 0) };
    }
    step(c, inp.throttle, inp.steer, dt, tr);
  }
  const hits = collide(G.cars, tr.solids);
  for (const h of hits) if (h.power > 4) { world.sparks(h.x, h.z, h.power); Sound.hit(h.power); }
  for (const c of G.cars) {
    locate(c, tr);
    if (!running || c.finished) continue;
    const done = Math.floor(c.prog / N);
    if (done > c.lapsDone) {
      c.lapsDone = done;
      c.lapTimes.push(G.t - c.lapStamp);
      c.lapStamp = G.t;
      if (done >= LAPS) {
        c.finished = true; c.finishTime = G.t; G.finishOrder.push(c);
        if (c === G.player) { G.state = 'done'; flash(G.finishOrder.length === 1 ? 'SIEG!' : `${G.finishOrder.length}. PLATZ`); }
      } else if (c === G.player) flash(done === LAPS - 1 ? 'Letzte Runde!' : `Runde ${done + 1}`);
    }
    if (c === G.player) { const p = tr.samples[c.idx]; c.wrongT = (c.vx * p.tx + c.vz * p.tz) < -4 ? c.wrongT + dt : 0; }
  }
  if (G.t > -1.5) G.rec.tick(dt, G.t, G.cars);
  if (G.state === 'done') {
    G.doneT += dt;
    if (G.doneT > 3.5 && !G.rec.done) { G.rec.done = true; showResults(); }
  }
}

function rankOf(c) {
  if (c.finished) return G.finishOrder.indexOf(c) + 1;
  return G.finishOrder.length + 1 + G.cars.filter(o => o !== c && !o.finished && o.prog > c.prog).length;
}

let flashT;
function flash(text) { const m = $('#msg'); m.textContent = text; m.classList.add('show'); clearTimeout(flashT); flashT = setTimeout(() => m.classList.remove('show'), 1600); }

/* ---------- Kamera im Rennen ---------- */
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function raceCamera(dt) {
  const c = G.player;
  const fx = Math.sin(c.a), fz = -Math.cos(c.a);
  const spd = Math.max(0, c.speed);
  const P = new THREE.Vector3(), L = new THREE.Vector3();
  let fov = 60;
  if (G.state === 'countdown') {
    // Einleitung: Kamerafahrt vom Startfeld hinter das eigene Auto
    const k = THREE.MathUtils.smoothstep(G.t, -4.4, -0.4);
    const ang = (1 - k) * Math.PI * 1.15;
    const R = 9 + (1 - k) * 9, H = 3.4 + (1 - k) * 4;
    const bx = -fx * Math.cos(ang) - (-fz) * Math.sin(ang), bz = -fz * Math.cos(ang) + fx * Math.sin(ang);
    P.set(c.x + bx * R, H, c.z + bz * R); L.set(c.x + fx * 6, 1.2, c.z + fz * 6);
    camPos.copy(P); camLook.copy(L);
  } else {
    if (G.cam === 0) { P.set(c.x - fx * 9.5, 3.4, c.z - fz * 9.5); L.set(c.x + fx * 8, 1.3, c.z + fz * 8); fov = 60 + spd * 0.22; }
    else if (G.cam === 1) { P.set(c.x - fx * 6.2, 2.2, c.z - fz * 6.2); L.set(c.x + fx * 8, 1.0, c.z + fz * 8); fov = 64 + spd * 0.22; }
    else { P.set(c.x + fx * 0.4, 1.32, c.z + fz * 0.4); L.set(c.x + fx * 20, 1.0, c.z + fz * 20); fov = 70 + spd * 0.18; }
    const k = G.cam === 2 || G.snapCam ? 1 : 1 - Math.exp(-dt * 7);
    camPos.lerp(P, k); camLook.lerp(L, G.cam === 2 || G.snapCam ? 1 : 1 - Math.exp(-dt * 12));
    if (G.snapCam) { camera.fov = fov; G.snapCam = false; }
    if (!c.onRoad && spd > 8) camPos.y += (Math.random() - 0.5) * 0.06;
  }
  camera.position.copy(camPos); camera.up.set(0, 1, 0); camera.lookAt(camLook);
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
  const P2 = TIMES[opt.time];
  post.set({ vignette: 0.3, grain: 0.03, chroma: 0.0012 + Math.min(1, spd / 58) * 0.0018, speed: G.cam === 2 ? 0 : THREE.MathUtils.clamp((spd - 30) / 28, 0, 1) * 0.8,
    letterbox: 0, contrast: P2.grade[0], saturation: P2.grade[1], warmth: P2.grade[2] });
}

/* ---------- HUD ---------- */
const mapCv = $('#map'), mapG = mapCv.getContext('2d');
function hud() {
  const p = G.player, tr = G.tr;
  const lap = Math.min(LAPS, Math.max(1, p.lapsDone + 1));
  $('#hLap').textContent = `Runde ${lap}/${LAPS}`;
  const r = rankOf(p);
  $('#hPos').textContent = `${r}/${G.cars.length}`;
  $('#hPos').style.color = r === 1 ? '#5bd47f' : r === G.cars.length ? '#ff7b6e' : '#ffd34d';
  const t = p.finished ? p.finishTime : Math.max(0, G.state === 'countdown' ? 0 : G.t);
  $('#hTime').textContent = fmt(t);
  $('#hLapT').textContent = G.state === 'run' ? 'Runde ' + fmt(G.t - p.lapStamp) : '';
  const best = p.lapTimes.length ? Math.min(...p.lapTimes) : null;
  $('#hBest').textContent = best ? 'Beste Runde ' + fmt(best) : '';
  $('#hKmh').innerHTML = `${Math.round(Math.abs(p.speed) * 3.6)}<small>km/h${p.onRoad ? '' : ' · Gras'}</small>`;
  const order = [...G.cars].sort((a, b) => rankOf(a) - rankOf(b));
  $('#board').innerHTML = order.map(c => `<div class="${c === p ? 'me' : ''}"><span>${rankOf(c)}. ${esc(c.name)}</span><span style="color:${CAR_COLORS[c.color].hex}">●</span></div>`).join('');
  $('#warn').hidden = !(p.wrongT > 1 && !p.finished);
  // Minikarte
  const W = mapCv.width, H = mapCv.height, b = tr.bounds;
  const s = Math.min((W - 24) / (b.maxX - b.minX - 100), (H - 24) / (b.maxZ - b.minZ - 100));
  mapG.clearRect(0, 0, W, H);
  mapG.save(); mapG.translate(W / 2, H / 2); mapG.scale(s, s); mapG.translate(-tr.center.x, -tr.center.z);
  mapG.beginPath(); tr.samples.forEach((q, i) => i ? mapG.lineTo(q.x, q.z) : mapG.moveTo(q.x, q.z)); mapG.closePath();
  mapG.strokeStyle = 'rgba(255,255,255,.55)'; mapG.lineWidth = tr.width * 0.9; mapG.lineJoin = 'round'; mapG.stroke();
  const s0 = tr.samples[0]; mapG.fillStyle = '#fff'; mapG.fillRect(s0.x - 5, s0.z - 5, 10, 10);
  for (const c of [...G.cars].reverse()) {
    mapG.beginPath(); mapG.arc(c.x, c.z, c === p ? 11 : 8, 0, 7);
    mapG.fillStyle = CAR_COLORS[c.color].hex; mapG.fill();
    if (c === p) { mapG.lineWidth = 4; mapG.strokeStyle = '#fff'; mapG.stroke(); }
  }
  mapG.restore();
}

/* ---------- Ergebnis ---------- */
function showResults() {
  const p = G.player, tr = G.tr;
  const place = rankOf(p), time = p.finishTime;
  const can = qualifies(tr.id, time);
  const bestLap = Math.min(...p.lapTimes);
  const laps = p.lapTimes.map((t, i) => `<tr><td>Runde ${i + 1}</td><td class="num">${t === bestLap ? '<b>' + fmt(t) + '</b>' : fmt(t)}</td></tr>`).join('');
  $('#dlgPanel').innerHTML = `<h2>${place === 1 ? 'Sieg! 🏁' : place + '. Platz'}</h2>
    <p>${esc(tr.name)} · ${TIMES[opt.time].name} · Gesamtzeit <b>${fmt(time)}</b></p>
    <table class="score">${laps}<tr><td>Gesamt</td><td class="num"><b>${fmt(time)}</b></td></tr></table>
    ${can && !G.saved ? '<p>Neue Top-10-Zeit! Dein Name für die Bestenliste:</p><input id="hsName" maxlength="16">' : ''}
    <div class="actions"><button class="btn" data-a="menu">Menü</button><button class="btn" data-a="again">Nochmal</button><button class="btn primary" data-a="replay">🎬 Replay ansehen</button></div>`;
  $('#dlg').hidden = false;
  const inp = $('#hsName');
  if (inp) { inp.value = opt.name; inp.focus(); inp.select(); }
  G.pending = can && !G.saved ? { time, color: p.color } : null;
}
function commitScore() {
  if (!G.pending) return;
  const name = ($('#hsName')?.value || 'Spieler').trim().slice(0, 16) || 'Spieler';
  opt.name = name; saveOpt();
  G.hlIndex = hsAdd(G.tr.id, { name, time: G.pending.time, color: G.pending.color, date: Date.now() });
  G.pending = null; G.saved = true;
}
$('#dlg').addEventListener('click', (e) => {
  const a = e.target.dataset.a;
  if (!a) return;
  commitScore();
  $('#dlg').hidden = true;
  if (a === 'again') { G.saved = false; startRace(); }
  if (a === 'menu') { G.saved = false; showMenu(); if (G.hlIndex != null) renderHighscores(G.hlIndex); G.hlIndex = null; }
  if (a === 'replay') enterReplay();
});

/* ---------- Replay ---------- */
const RP = { t: 0, playing: true, speed: 1, cam: 'auto', focus: 0, states: [], idle: 0, fade: 0, lb: 0, caption: '', capT: 0 };
function enterReplay() {
  G.mode = 'replay';
  const rec = G.rec;
  RP.t = rec.frames[0].t; RP.playing = true; RP.focus = G.playerIdx; RP.lb = 0; RP.fade = 1;
  RP.dir = new Director(G.tr);
  RP.dir.setEvents(rec.events(RP.focus, G.tr.N, LAPS));
  $('#hud').hidden = true; $('#topBtns').hidden = true; $('#touch').classList.remove('show');
  $('#rp').hidden = false;
  $('#rpCam').innerHTML = Object.entries(CAM_MODES).map(([k, v]) => `<option value="${k}"${k === RP.cam ? ' selected' : ''}>${v}</option>`).join('');
  $('#rpFocus').innerHTML = G.cars.map((c, i) => `<option value="${i}"${i === RP.focus ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
  $('#rpPlay').textContent = '❚❚';
  RP.idle = 0;
}
function exitReplay() {
  $('#rp').hidden = true;
  post.set({ letterbox: 0, fade: 0 }); post.setDof(false);
  // Autos wieder auf den Endstand setzen und Ergebnis zeigen
  G.mode = 'race';
  showResults();
}
function replayUpdate(dt) {
  const rec = G.rec, t0 = rec.frames[0].t, t1 = rec.duration;
  let ts = 1;
  if (RP.playing) {
    RP.t += dt * RP.speed * (RP.timeScale || 1);
    if (RP.t >= t1) { RP.t = t0; RP.dir.reset(); RP.dir.setEvents(rec.events(RP.focus, G.tr.N, LAPS)); RP.fade = 1; }
  }
  const states = rec.sample(RP.t, RP.states);
  const sdt = RP.playing ? dt * RP.speed * (RP.timeScale || 1) : 0;
  states.forEach((st, i) => { syncCar(G.meshes[i], st, sdt, world.night, world.fogAmt); if (sdt > 0) world.carEffects(st, sdt, G.meshes[i], true); });
  const shot = RP.dir.update(sdt || 0.0001, states, RP.focus, RP.cam, RP.t);
  RP.timeScale = shot.timeScale;
  camera.position.copy(shot.pos); camera.up.copy(shot.up); camera.lookAt(shot.look);
  camera.fov = shot.fov; camera.updateProjectionMatrix();
  // Bild: Kinobalken einblenden, Überblendung bei Schnitt
  RP.lb = Math.min(1, RP.lb + dt * 1.5);
  if (shot.cut) RP.fade = Math.max(RP.fade, 0.35);
  RP.fade = Math.max(0, RP.fade - dt * 2.2);
  const P2 = TIMES[opt.time];
  const slow = shot.timeScale < 1;
  post.set({ letterbox: RP.lb, vignette: 0.48, grain: 0.055, chroma: slow ? 0.004 : 0.0024, speed: 0, fade: RP.fade,
    contrast: P2.grade[0] + 0.06, saturation: P2.grade[1] * (slow ? 0.85 : 0.98), warmth: P2.grade[2] + 0.03 });
  post.setDof(true, shot.focusDist, shot.aperture * (slow ? 1.6 : 1));
  $('#rpShot').textContent = SHOT_NAMES[shot.shot] + (slow ? ' · Zeitlupe' : '');
  const c = states[RP.focus], car = G.cars[RP.focus];
  const lap = Math.min(LAPS, Math.max(1, Math.floor(c.prog / G.tr.N) + 1));
  const rank = 1 + states.filter((o, i) => i !== RP.focus && o.prog > c.prog).length;
  const evCap = slow ? (RP.dir.slow?.kind === 'finish' ? 'Zieleinlauf' : 'Überholmanöver!') : '';
  $('#rpCap').textContent = `${car.name} · Runde ${lap}/${LAPS} · Platz ${rank}${evCap ? ' — ' + evCap : ''}`;
  if (!RP.seeking) $('#rpSeek').value = Math.round((RP.t - t0) / (t1 - t0) * 1000);
  $('#rpTime').textContent = `${fmt(Math.max(0, RP.t)).slice(0, -3)} / ${fmt(t1).slice(0, -3)}`;
  RP.idle += dt;
  $('#rp').classList.toggle('idle', RP.idle > 2.6 && RP.playing);
  Sound.engine(c.speed, c.speed > 1 ? 1 : 0, c.drift, c.onRoad, RP.playing && opt.sound);
  return c;
}
$('#rpRestart').onclick = () => { RP.t = G.rec.frames[0].t; RP.dir.reset(); RP.dir.setEvents(G.rec.events(RP.focus, G.tr.N, LAPS)); RP.fade = 1; };
$('#rpPlay').onclick = () => { RP.playing = !RP.playing; $('#rpPlay').textContent = RP.playing ? '❚❚' : '▶'; };
$('#rpSpeed').onchange = (e) => { RP.speed = +e.target.value; };
$('#rpCam').onchange = (e) => { RP.cam = e.target.value; RP.dir.shot = null; canvas.focus(); };
$('#rpFocus').onchange = (e) => { RP.focus = +e.target.value; RP.dir.reset(); RP.dir.setEvents(G.rec.events(RP.focus, G.tr.N, LAPS)); canvas.focus(); };
$('#rpSeek').oninput = (e) => { RP.seeking = true; const t0 = G.rec.frames[0].t; RP.t = t0 + (G.rec.duration - t0) * e.target.value / 1000; RP.dir.shot = null; for (const ev of RP.dir.events) ev.used = ev.t < RP.t; };
$('#rpSeek').onchange = () => { RP.seeking = false; };
$('#rpExit').onclick = exitReplay;
addEventListener('pointermove', () => { RP.idle = 0; });

/* ---------- Eingabe ---------- */
const MAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') { if (e.key === 'Enter') $('[data-a=replay]')?.click(); return; }
  const k = MAP[e.code];
  if (k) { keys[k] = true; e.preventDefault(); }
  if (G.mode === 'race' && (e.code === 'KeyP' || e.code === 'Escape') && G.state !== 'done') togglePause();
  if (G.mode === 'race' && e.code === 'KeyC') cycleCam();
  if (e.code === 'KeyM') toggleSound();
  if (G.mode === 'replay' && e.code === 'Space') { e.preventDefault(); $('#rpPlay').click(); }
  if (G.mode === 'menu' && e.code === 'Enter') startRace();
  RP.idle = 0;
});
addEventListener('keyup', (e) => { const k = MAP[e.code]; if (k) keys[k] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
document.querySelectorAll('#touch button').forEach(b => {
  const k = b.dataset.k;
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); keys[k] = true; });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { keys[k] = false; });
});
function togglePause() { G.paused = !G.paused; $('#pauseBtn').textContent = G.paused ? 'Weiter' : 'Pause'; flash(G.paused ? 'PAUSE' : ''); if (G.paused) clearTimeout(flashT); }
function cycleCam() { G.cam = (G.cam + 1) % CAMS.length; toast('Kamera: ' + CAMS[G.cam]); }
function toggleSound() { opt.sound = !opt.sound; saveOpt(); if (opt.sound) Sound.init(); Sound.mute(!opt.sound); $('#soundBtn').textContent = opt.sound ? 'Ton' : 'Ton aus'; }
$('#camBtn').onclick = cycleCam;
$('#soundBtn').onclick = toggleSound;
$('#soundBtn').textContent = opt.sound ? 'Ton' : 'Ton aus';
$('#pauseBtn').onclick = () => { if (G.state !== 'done') togglePause(); };
$('#menuBtn').onclick = showMenu;
$('#goBtn').onclick = startRace;
let toastT;
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 1500); }

/* ---------- Hauptschleife ---------- */
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.mode === 'menu') {
    G.orbit += dt * 0.06;
    const tr = G.tr, b = tr.bounds;
    const R = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.42;
    camera.position.set(tr.center.x + Math.cos(G.orbit) * R, 70, tr.center.z + Math.sin(G.orbit) * R);
    camera.up.set(0, 1, 0); camera.lookAt(tr.center.x, 0, tr.center.z);
    camera.fov = 55; camera.updateProjectionMatrix();
    G.cars.forEach((c, i) => syncCar(G.meshes[i], c, 0, world.night, world.fogAmt));
    const P2 = TIMES[opt.time];
    post.set({ vignette: 0.4, grain: 0.03, chroma: 0.0015, speed: 0, contrast: P2.grade[0], saturation: P2.grade[1], warmth: P2.grade[2] });
    world.update(dt, { x: tr.center.x, z: tr.center.z }, camera.position);
    post.setBloom(TIMES[opt.time].bloom);
  } else if (G.mode === 'race') {
    if (!G.paused && $('#dlg').hidden) {
      let rest = dt;
      while (rest > 0) { const s = Math.min(rest, 1 / 120); racingUpdate(s); rest -= s; }
    } else if (!$('#dlg').hidden && !G.paused) {
      // Hinter dem Ergebnisdialog fahren alle mit Autopilot weiter
      let rest = dt;
      while (rest > 0) { const s = Math.min(rest, 1 / 120); for (const c of G.cars) { const i = npcDrive(c, G.tr, s, true); step(c, i.throttle, i.steer, s, G.tr); } collide(G.cars, G.tr.solids); for (const c of G.cars) locate(c, G.tr); rest -= s; }
    }
    const fdt = G.paused ? 0 : dt;
    G.cars.forEach((c, i) => { syncCar(G.meshes[i], c, fdt, world.night, world.fogAmt); if (fdt) world.carEffects(c, fdt, G.meshes[i]); });
    raceCamera(dt);
    world.update(fdt, G.player, camera.position);
    post.setBloom(TIMES[opt.time].bloom);
    post.setDof(false);
    hud();
    const p = G.player;
    Sound.engine(p.speed, p.throttle, p.drift, p.onRoad, !G.paused && opt.sound);
  } else if (G.mode === 'replay') {
    const c = replayUpdate(dt);
    world.update(RP.playing ? dt * RP.speed * (RP.timeScale || 1) : 0, c, camera.position);
    post.setBloom(TIMES[opt.time].bloom * 1.1);
  }
  if (G.mode !== 'loading') post.render(dt);
  requestAnimationFrame(loop);
}

/* ---------- Start ---------- */
(async () => {
  try {
    await loadModels((p) => { $('#loadBar').style.width = Math.round(p * 100) + '%'; });
  } catch (e) {
    $('#loadTxt').textContent = 'Modelle konnten nicht geladen werden.';
    return;
  }
  $('#loadTxt').textContent = 'Baue Strecke …';
  await new Promise(r => setTimeout(r, 30));
  applyQuality();
  showMenu();
  $('#loading').hidden = true;
  if (/[?&]debug\b/.test(location.search)) {
    window.__r3d = { G, opt, world, camera, RP, startRace, enterReplay, showMenu, setAuto(v) { autopilot = v; },
      sim(sec) { for (let i = 0; i < sec * 120 && G.mode === 'race' && $('#dlg').hidden; i++) racingUpdate(1 / 120); G.snapCam = true; },
      jump(dt) { RP.t += dt; RP.dir._lastShot = null; }, renderer };
  }
  requestAnimationFrame(loop);
})();
