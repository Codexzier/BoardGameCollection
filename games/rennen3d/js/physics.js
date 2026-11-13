/* Rennen 3D – Fahrphysik (Draufsicht in x/z, Meter), Spurverfolgung, KI und Kollisionen. */
export const CAR = {
  maxSpeed: 58, accel: 25, brake: 58, revAccel: 12, revMax: 8.5, drag: 10, turn: 2.35, grip: 6.5,
  offroad: 0.45, offBrake: 80, radius: 2.0,
};

const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

export function makeCar(tr, idx, lane, opts = {}) {
  const p = tr.samples[(idx + tr.N) % tr.N];
  return {
    x: p.x + p.nx * lane, z: p.z + p.nz * lane,
    a: Math.atan2(p.tx, -p.tz), vx: 0, vz: 0, speed: 0, steer: 0, throttle: 0, drift: 0,
    idx: (idx + tr.N) % tr.N, prog: idx - tr.N, lapsDone: 0, lapStamp: 0, lapTimes: [],
    finished: false, finishTime: 0, onRoad: true, dist: 0,
    npc: !!opts.npc, skill: opts.skill || 1, lane: opts.laneBias || 0,
    stuck: 0, reverseT: 0, revSteer: 1, wrongT: 0, name: opts.name || '', color: opts.color || 'Red',
  };
}

/** Nächsten Stützpunkt suchen, Fortschritt (Runden) mitzählen */
export function locate(car, tr) {
  const s = tr.samples, N = tr.N;
  let best = car.idx, bd = Infinity;
  const back = Math.round(25 / tr.spacing), fwd = Math.round(55 / tr.spacing);
  for (let k = -back; k <= fwd; k++) {
    const i = (car.idx + k + N) % N;
    const d = (s[i].x - car.x) ** 2 + (s[i].z - car.z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  if (bd > (tr.width * 3) ** 2) {
    for (let i = 0; i < N; i++) { const d = (s[i].x - car.x) ** 2 + (s[i].z - car.z) ** 2; if (d < bd) { bd = d; best = i; } }
  }
  let delta = best - car.idx;
  if (delta > N / 2) delta -= N;
  if (delta < -N / 2) delta += N;
  car.prog += delta;
  car.idx = best;
  car.dist = Math.sqrt(bd);
  car.onRoad = car.dist < tr.width / 2 + 1.0;
}

export function step(car, throttle, steer, dt, tr) {
  const sp = CAR;
  let fx = Math.sin(car.a), fz = -Math.cos(car.a);
  const fwd0 = car.vx * fx + car.vz * fz;
  // Lenkung weich nachführen (für Räder & Replay)
  car.steer += (steer - car.steer) * Math.min(1, dt * 10);
  const sf = Math.max(-1, Math.min(1, fwd0 / 12));
  car.a += car.steer * sp.turn * dt * sf * (1 - 0.3 * Math.min(1, Math.abs(fwd0) / sp.maxSpeed));
  fx = Math.sin(car.a); fz = -Math.cos(car.a);
  let fwd = car.vx * fx + car.vz * fz;
  let lx = car.vx - fx * fwd, lz = car.vz - fz * fwd;

  const maxS = sp.maxSpeed * car.skill * (car.onRoad ? 1 : sp.offroad);
  if (throttle > 0) fwd += sp.accel * throttle * dt * (fwd < 0 ? 2.5 : 1);
  else if (throttle < 0) fwd -= (fwd > 0.5 ? sp.brake : sp.revAccel) * -throttle * dt;
  else { const d = sp.drag * dt; fwd = Math.abs(fwd) <= d ? 0 : fwd - Math.sign(fwd) * d; }
  if (fwd > maxS) fwd = Math.max(maxS, fwd - (car.onRoad ? sp.brake : sp.offBrake) * dt);
  if (fwd < -sp.revMax) fwd = -sp.revMax;

  const grip = Math.min(1, sp.grip * (car.onRoad ? 1 : 0.55) * dt);
  car.drift = Math.hypot(lx, lz);
  lx -= lx * grip; lz -= lz * grip;
  car.vx = fx * fwd + lx; car.vz = fz * fwd + lz;
  car.x += car.vx * dt; car.z += car.vz * dt;
  car.speed = fwd;
  car.throttle = throttle;
  car.braking = throttle < 0 && fwd > 1;
  const b = tr.bounds;
  car.x = Math.max(b.minX, Math.min(b.maxX, car.x));
  car.z = Math.max(b.minZ, Math.min(b.maxZ, car.z));
}

export function npcDrive(car, tr, dt, racing) {
  const s = tr.samples, N = tr.N;
  if (car.reverseT > 0) { car.reverseT -= dt; return { throttle: -1, steer: car.revSteer }; }
  const lookDist = 9 + Math.max(0, car.speed) * 0.42;
  const look = Math.round(lookDist / tr.spacing);
  const tp = s[(car.idx + look) % N];
  const ahead = s[(car.idx + look + Math.round(24 / tr.spacing)) % N];
  const cross = tp.tx * ahead.tz - tp.tz * ahead.tx;
  const off = (car.lane - cross * 1.4) * tr.width * 0.42;
  const tx = tp.x + tp.nx * off, tz = tp.z + tp.nz * off;
  const want = Math.atan2(tx - car.x, -(tz - car.z));
  const d = angDiff(want, car.a);
  const steer = Math.max(-1, Math.min(1, d * 3.2));
  let sharp = 0;
  const p1 = s[(car.idx + Math.round(6 / tr.spacing)) % N];
  for (const m of [28, 48, 70]) {
    const p2 = s[(car.idx + Math.round(m / tr.spacing)) % N];
    sharp = Math.max(sharp, Math.acos(Math.max(-1, Math.min(1, p1.tx * p2.tx + p1.tz * p2.tz))));
  }
  const vmax = CAR.maxSpeed * car.skill;
  const target = vmax * Math.max(0.4, 1 - sharp * 0.62);
  const throttle = car.speed < target ? 1 : car.speed > target + 4 ? -0.7 : 0;
  if (racing && Math.abs(car.speed) < 2) car.stuck += dt; else car.stuck = 0;
  if (car.stuck > 1.2) { car.stuck = 0; car.reverseT = 0.9; car.revSteer = -Math.sign(d) || 1; }
  return { throttle, steer };
}

/** Fahrzeuge untereinander und mit festen Hindernissen; gibt Aufprallstärken zurück */
export function collide(cars, solids) {
  const hits = [];
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j];
    const dx = b.x - a.x, dz = b.z - a.z, dist = Math.hypot(dx, dz), min = CAR.radius * 2;
    if (dist > 0 && dist < min) {
      const nx = dx / dist, nz = dz / dist, push = (min - dist) / 2;
      a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
      const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (rel < 0) {
        a.vx += nx * rel * 0.5; a.vz += nz * rel * 0.5; b.vx -= nx * rel * 0.5; b.vz -= nz * rel * 0.5;
        hits.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, power: -rel });
      }
    }
  }
  for (const c of cars) for (const o of solids) {
    const ox = c.x - o.x, oz = c.z - o.z;
    if (Math.abs(ox) > 12 || Math.abs(oz) > 12) continue;
    const d = Math.hypot(ox, oz), m = o.r + CAR.radius * 0.8;
    if (d > 0 && d < m) {
      const nx = ox / d, nz = oz / d;
      c.x = o.x + nx * m; c.z = o.z + nz * m;
      const vn = c.vx * nx + c.vz * nz;
      if (vn < 0) {
        c.vx -= nx * vn * 1.4; c.vz -= nz * vn * 1.4; c.vx *= 0.6; c.vz *= 0.6;
        hits.push({ x: c.x - nx * CAR.radius, z: c.z - nz * CAR.radius, power: -vn });
      }
    }
  }
  return hits;
}
