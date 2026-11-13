/* Rennen 3D – Replay: Aufzeichnung, Wiedergabe und automatische Kino-Regie. */
import * as THREE from 'three';

const F = 9; // Werte je Auto: x, z, a, speed, steer, braking, drift, onRoad, prog
export const REC_HZ = 30;

export class Recorder {
  constructor(n) { this.n = n; this.frames = []; this.acc = 0; this.t = 0; this.done = false; }
  push(t, cars) {
    const f = new Float32Array(this.n * F);
    cars.forEach((c, i) => f.set([c.x, c.z, c.a, c.speed, c.steer, c.braking ? 1 : 0, c.drift, c.onRoad ? 1 : 0, c.prog], i * F));
    this.frames.push({ t, f });
  }
  tick(dt, t, cars) {
    if (this.done) return;
    this.acc += dt;
    if (this.acc >= 1 / REC_HZ || !this.frames.length) { this.acc = 0; this.push(t, cars); }
  }
  get duration() { return this.frames.length ? this.frames[this.frames.length - 1].t : 0; }

  /** Zustände aller Autos zur Replay-Zeit t (interpoliert) */
  sample(t, out) {
    const fr = this.frames;
    if (!fr.length) return out;
    let lo = 0, hi = fr.length - 1;
    if (t <= fr[0].t) hi = 0; else if (t >= fr[hi].t) lo = hi;
    else while (hi - lo > 1) { const m = (lo + hi) >> 1; if (fr[m].t <= t) lo = m; else hi = m; }
    const A = fr[lo], B = fr[hi];
    const k = hi === lo ? 0 : (t - A.t) / (B.t - A.t);
    for (let i = 0; i < this.n; i++) {
      const o = out[i] || (out[i] = {});
      const a = A.f, b = B.f, j = i * F;
      const lerp = (q) => a[j + q] + (b[j + q] - a[j + q]) * k;
      let da = b[j + 2] - a[j + 2];
      while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      o.x = lerp(0); o.z = lerp(1); o.a = a[j + 2] + da * k; o.speed = lerp(3); o.steer = lerp(4);
      o.braking = (k < 0.5 ? a : b)[j + 5] > 0.5; o.drift = lerp(6); o.onRoad = (k < 0.5 ? a : b)[j + 7] > 0.5; o.prog = lerp(8);
      o.vx = Math.sin(o.a) * o.speed; o.vz = -Math.cos(o.a) * o.speed;
    }
    return out;
  }

  /** Höhepunkte finden: Überholmanöver mit dem Fokus-Auto, Zieleinlauf */
  events(focus, N, laps) {
    const ev = [];
    let lastRank = null, lastLap = 0;
    for (const { t, f } of this.frames) {
      const prog = (i) => f[i * F + 8];
      let rank = 1;
      for (let i = 0; i < this.n; i++) if (i !== focus && prog(i) > prog(focus)) rank++;
      if (lastRank !== null && rank !== lastRank && t > 3) ev.push({ t, kind: 'overtake', gain: rank < lastRank });
      lastRank = rank;
      const lap = Math.floor(prog(focus) / N);
      if (lap > lastLap) { ev.push({ t, kind: lap >= laps ? 'finish' : 'lap' }); lastLap = lap; }
    }
    // dicht aufeinanderfolgende Überholvorgänge zusammenfassen
    return ev.filter((e, i) => e.kind !== 'overtake' || !ev.slice(0, i).some(p => p.kind === 'overtake' && e.t - p.t < 4));
  }
}

const SHOTS = { chase: 1, tv: 2.4, heli: 1, side: 1.5, front: 1.2, flyby: 1.3, wheel: 0.9, top: 0.5 };
export const CAM_MODES = { auto: 'Kino-Regie', chase: 'Verfolger', tv: 'TV-Kameras', heli: 'Helikopter' };
export const SHOT_NAMES = { chase: 'Verfolger', tv: 'TV-Kamera', heli: 'Helikopter', side: 'Kamerafahrt', front: 'Frontkamera', flyby: 'Vorbeiflug', wheel: 'Radkamera', top: 'Drohne' };

export class Director {
  constructor(tr) {
    this.tr = tr;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
    this.reset();
  }
  reset() { this.shot = null; this.timer = 0; this.last = null; this.slow = null; this.events = []; this.fixed = null; this.orbit = Math.random() * 6.28; this.side = 1; }
  setEvents(ev) { this.events = ev.map(e => ({ ...e, used: false })); }

  pick(c, others, mode) {
    let type = mode;
    if (mode === 'auto') {
      const opts = Object.entries(SHOTS).filter(([k]) => k !== this.last);
      let r = Math.random() * opts.reduce((s, [, w]) => s + w, 0);
      type = opts.find(([, w]) => (r -= w) < 0)?.[0] || 'chase';
    }
    this.start(type, c, others);
  }
  start(type, c, others, dur) {
    const tr = this.tr, s = tr.samples, N = tr.N;
    this.shot = type; this.last = type;
    this.timer = dur ?? 3.6 + Math.random() * 2.6;
    this.side = Math.random() < 0.5 ? -1 : 1;
    // Seitliche Kameras auf die Seite ohne Gegner setzen
    if (type === 'side' || type === 'wheel') {
      const rx = Math.cos(c.a), rz = Math.sin(c.a);
      const s = (others || []).filter(o => Math.hypot(o.x - c.x, o.z - c.z) < 14)
        .reduce((acc, o) => acc + Math.sign((o.x - c.x) * rx + (o.z - c.z) * rz), 0);
      if (s !== 0) this.side = -Math.sign(s);
    }
    this.fixed = null;
    this.smooth = false;
    const idx = nearestIdx(tr, c);
    if (type === 'tv') {
      // nächste Kamera vor dem Auto
      let best = null, bd = Infinity;
      for (const cam of tr.cams) {
        let d = (cam.i - idx + N) % N;
        const dist = d * tr.spacing;
        if (dist > 25 && dist < 260 && dist < bd) { bd = dist; best = cam; }
      }
      if (!best) best = tr.cams[0];
      if (best) { this.fixed = new THREE.Vector3(best.x, best.y, best.z); this.fixedIdx = best.i; this.timer = dur ?? 7; }
      else this.shot = 'chase';
    } else if (type === 'flyby') {
      const ahead = Math.round(Math.max(30, Math.abs(c.speed) * 1.6) / tr.spacing);
      const i = (idx + ahead) % N, p = s[i];
      const out = Math.abs(p.curv) > 0.05 ? -Math.sign(p.curv) : this.side;
      const off = tr.width / 2 + 2.2;
      this.fixed = new THREE.Vector3(p.x + p.nx * out * off, 0.7, p.z + p.nz * out * off);
      this.fixedIdx = i;
      this.timer = dur ?? 3.2;
    }
  }

  /** Kamera für dieses Bild bestimmen */
  update(dt, cars, focus, mode, rt) {
    const c = cars[focus];
    const others = cars.filter((_, i) => i !== focus);
    // Zeitlupe bei Höhepunkten (nur Kino-Regie)
    let timeScale = 1;
    if (mode === 'auto') {
      for (const e of this.events) {
        if (e.used || rt < e.t - 1.0 || rt > e.t + 0.2) continue;
        e.used = true;
        this.slow = { until: e.t + (e.kind === 'finish' ? 1.6 : 1.0), kind: e.kind };
        this.start(e.kind === 'finish' ? 'flyby' : (Math.random() < 0.5 ? 'side' : 'flyby'), c, others, 4);
      }
      if (this.slow) { if (rt > this.slow.until) this.slow = null; else timeScale = this.slow.kind === 'finish' ? 0.25 : 0.35; }
    }
    if (!this.shot || (mode !== 'auto' && this.shot !== mode && !(mode === 'tv' && this.shot === 'tv'))) this.pick(c, others, mode);
    this.timer -= dt;
    const tr = this.tr, N = tr.N;
    // Schuss vorbei?
    if (this.fixed && this.fixedIdx != null) {
      const idx = nearestIdx(tr, c);
      const passed = ((idx - this.fixedIdx + N) % N) * tr.spacing;
      if (passed > 0 && passed < 200 && passed > (this.shot === 'flyby' ? 18 : 45)) this.timer = Math.min(this.timer, 0.4);
    }
    if (this.timer <= 0) this.pick(c, others, mode);

    const fx = Math.sin(c.a), fz = -Math.cos(c.a), rx = -fz, rz = fx;
    const P = new THREE.Vector3(), L = new THREE.Vector3(c.x, 1.0, c.z);
    let fov = 55, smoothK = 6, aperture = 0.00008, up = 1;
    // Duell im Bild?
    let rival = null;
    for (const o of others) { const d = Math.hypot(o.x - c.x, o.z - c.z); if (d < 22 && (!rival || d < rival.d)) rival = { o, d }; }
    switch (this.shot) {
      case 'chase': P.set(c.x - fx * 10.5, 3.8, c.z - fz * 10.5); L.set(c.x + fx * 7, 1.2, c.z + fz * 7); fov = 60; smoothK = 5; break;
      case 'heli': {
        this.orbit += dt * 0.22;
        const R = rival ? 34 : 28;
        const mx = rival ? (c.x + rival.o.x) / 2 : c.x, mz = rival ? (c.z + rival.o.z) / 2 : c.z;
        P.set(mx + Math.cos(this.orbit) * R, 19, mz + Math.sin(this.orbit) * R); L.set(mx, 0.8, mz); fov = 42; smoothK = 3; break;
      }
      case 'side': P.set(c.x + rx * this.side * 6.8 + fx * 2.2, 1.15, c.z + rz * this.side * 6.8 + fz * 2.2); L.set(c.x - fx * 0.5, 0.75, c.z - fz * 0.5); fov = 36; smoothK = 10; aperture = 0.00028; break;
      case 'front': P.set(c.x + fx * 12, 1.0, c.z + fz * 12); L.set(c.x, 0.9, c.z); fov = 38; smoothK = 8; aperture = 0.0002; break;
      case 'wheel': P.set(c.x + rx * this.side * 1.75 - fx * 0.9, 0.48, c.z + rz * this.side * 1.75 - fz * 0.9); L.set(c.x + fx * 25, 0.35, c.z + fz * 25); fov = 72; smoothK = 30; aperture = 0.00005; break;
      case 'top': P.set(c.x - fx * 14, 34, c.z - fz * 14); L.set(c.x + fx * 10, 0, c.z + fz * 10); fov = 38; smoothK = 4; break;
      case 'tv': case 'flyby': {
        P.copy(this.fixed);
        const tx = rival ? (c.x + rival.o.x) / 2 : c.x, tz = rival ? (c.z + rival.o.z) / 2 : c.z;
        L.set(tx, 0.9, tz);
        const d = P.distanceTo(L);
        const frame = this.shot === 'flyby' ? 14 : (rival ? 16 : 10);
        fov = THREE.MathUtils.clamp(2 * Math.atan(frame / 2 / d) * 180 / Math.PI, 5, this.shot === 'flyby' ? 70 : 48);
        smoothK = 20; aperture = this.shot === 'flyby' ? 0.00012 : 0.00006;
        if (this.shot === 'tv') { const t = performance.now() / 1000; L.x += Math.sin(t * 1.3) * 0.12 * d / 30; L.y += Math.sin(t * 1.7) * 0.08 * d / 30; }
        break;
      }
    }
    const k = 1 - Math.exp(-dt * smoothK);
    const cut = this._lastShot !== this.shot || this._lastFocus !== focus;
    this._lastShot = this.shot; this._lastFocus = focus;
    if (cut || this.fixed) { this.pos.copy(P); } else this.pos.lerp(P, k);
    if (cut) this.look.copy(L); else this.look.lerp(L, Math.min(1, k * 1.6));
    if (up === 0) this.up.set(fx, 0, fz); else this.up.set(0, 1, 0);
    return { pos: this.pos, look: this.look, up: this.up, fov, aperture, focusDist: this.pos.distanceTo(new THREE.Vector3(c.x, 0.9, c.z)), timeScale, shot: this.shot, cut };
  }
}

function nearestIdx(tr, c) {
  let best = 0, bd = Infinity;
  const s = tr.samples;
  for (let i = 0; i < s.length; i += 2) { const d = (s[i].x - c.x) ** 2 + (s[i].z - c.z) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}
