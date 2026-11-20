/* Sternenfront – Simulation: Karte, Schiffe, Basen, Kampf, Supplies, Versorgungsnetz, Admiräle. */
import { SYS_W, SYS_H, SHIPS, BASES, ADMIRALS, COMMAND_RADIUS, UNIT_CAP, START_RES, MAPS, DIFFICULTY } from './data.js';

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

export function rng(seed) {
  let a = 0;
  for (const ch of String(seed)) a = (a * 31 + ch.charCodeAt(0)) | 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

const ROMAN = ['I', 'II', 'III', 'IV'];
const SUPPLY_BASES = ['hq', 'yard', 'depot'];

export class Game {
  constructor({ map = 'small', diff = 'normal', seed = Date.now() } = {}) {
    this.mapKey = map; this.diff = DIFFICULTY[diff]; this.diffKey = diff;
    this.time = 0; this.nextId = 1;
    this.ships = []; this.bases = []; this.shots = []; this.fx = [];
    this.factions = [0, 1].map(i => ({ res: START_RES, income: 0, net: new Set(), built: 0, lost: 0, killed: 0, basesLost: 0, alive: true }));
    this.msgs = [];
    this.sfx = [];
    this.netT = 0; this.secT = 0; this.alertT = {};
    this.over = null;
    this.buildMap(MAPS[map], seed);
    this.setup();
  }

  /* ---------- Karte ---------- */
  buildMap(M, seed) {
    this.links = M.links;
    this.homes = M.homes;
    this.systems = M.systems.map(([name, mx, my], id) => ({ id, name, mx, my, planets: [], holes: [], rocks: [], stars: [] }));
    const holeId = { n: 1 };
    for (const [a, b] of M.links) {
      const ha = this.addHole(a, b, holeId), hb = this.addHole(b, a, holeId);
      ha.pair = hb; hb.pair = ha;
    }
    for (const s of this.systems) {
      const R = rng(s.name + seed);
      const home = this.homes.includes(s.id);
      s.star = { x: SYS_W / 2, y: SYS_H / 2, r: 34 + R() * 18, hue: R() };
      const n = home ? 3 : 2 + (R() < 0.55 ? 1 : 0);
      let tries = 0;
      while (s.planets.length < n && tries++ < 400) {
        const ang = R() * Math.PI * 2, rad = 250 + R() * 300;
        const x = SYS_W / 2 + Math.cos(ang) * rad * 1.35, y = SYS_H / 2 + Math.sin(ang) * rad * 0.82;
        if (x < 160 || x > SYS_W - 160 || y < 140 || y > SYS_H - 140) continue;
        if (s.holes.some(h => Math.hypot(h.x - x, h.y - y) < 300)) continue;
        if (s.planets.some(p => Math.hypot(p.x - x, p.y - y) < 330)) continue;
        const big = (home && s.planets.length === 0) || R() < 0.3;
        s.planets.push({
          id: s.id * 10 + s.planets.length, sys: s.id, x, y, r: big ? 50 + R() * 8 : 28 + R() * 14,
          rich: home && s.planets.length === 0 ? 1.6 : Math.round((0.8 + R() * 1.1) * 10) / 10,
          slots: big ? [null, null] : [null], name: s.name + ' ' + ROMAN[s.planets.length], ring: R() < 0.35, hue: R(),
        });
      }
      // Asteroidengürtel (Deko)
      const beltR = 640 + R() * 60, a0 = R() * Math.PI * 2, span = 1.2 + R() * 1.6;
      for (let i = 0; i < 16; i++) {
        const a = a0 + (i / 16) * span + (R() - 0.5) * 0.08;
        s.rocks.push({ a, r: beltR + (R() - 0.5) * 60, s: 0.25 + R() * 0.45, spin: (R() - 0.5) * 0.6, rot: R() * 6, kind: Math.floor(R() * 6) });
      }
      for (let i = 0; i < 140; i++) s.stars.push({ x: R() * SYS_W * 1.3 - SYS_W * 0.15, y: R() * SYS_H * 1.3 - SYS_H * 0.15, b: R(), d: 0.2 + R() * 0.6 });
    }
  }
  addHole(a, b, counter) {
    const A = this.systems[a], B = this.systems[b];
    let ang = Math.atan2((B.my - A.my) * 0.7, B.mx - A.mx);
    const place = (an) => ({ x: SYS_W / 2 + Math.cos(an) * 820, y: SYS_H / 2 + Math.sin(an) * 470 });
    let p = place(ang), k = 0;
    while (A.holes.some(h => Math.hypot(h.x - p.x, h.y - p.y) < 320) && k++ < 12) { ang += (k % 2 ? 1 : -1) * 0.35 * k; p = place(ang); }
    const h = { id: counter.n++, sys: a, to: b, x: p.x, y: p.y, gate: null };
    A.holes.push(h);
    return h;
  }
  path(from, to) {
    if (from === to) return [from];
    const prev = new Map([[from, -1]]), q = [from];
    while (q.length) {
      const c = q.shift();
      for (const h of this.systems[c].holes) {
        if (prev.has(h.to)) continue;
        prev.set(h.to, c);
        if (h.to === to) { const p = [to]; let x = c; while (x !== -1) { p.unshift(x); x = prev.get(x); } return p; }
        q.push(h.to);
      }
    }
    return null;
  }
  holeTo(sys, to) { return this.systems[sys].holes.find(h => h.to === to); }

  /* ---------- Start ---------- */
  setup() {
    for (const owner of [0, 1]) {
      const s = this.systems[this.homes[owner]];
      const pl = s.planets[0];
      const hq = this.makeBase('hq', owner, s.id, { planet: pl, slot: 0 });
      hq.progress = 1; hq.built = true; hq.hp = hq.maxHp;
      const toward = s.holes[0];
      const ox = (toward.x - pl.x) * 0.18, oy = (toward.y - pl.y) * 0.18;
      const spawn = (type, dx, dy) => this.makeShip(type, owner, s.id, pl.x + ox + dx, pl.y + oy + dy);
      spawn('builder', -40, 60); spawn('builder', 40, 60);
      spawn('supply', 0, 110);
      for (let i = 0; i < 3; i++) spawn('fighter', -60 + i * 60, 160);
      spawn('corvette', 0, 210);
    }
    this.computeNetworks();
  }

  makeShip(type, owner, sys, x, y) {
    const T = SHIPS[type];
    const s = {
      id: this.nextId++, kind: 'ship', type, owner, sys, x, y, a: -Math.PI / 2, vx: 0, vy: 0,
      hp: T.hp, maxHp: T.hp, supply: T.supplyMax || 0, cargo: T.cargo || 0, order: { type: 'idle' },
      cd: Math.random() * 0.5, specCd: 0, boost: 0, fleet: null, bonus: null, jumpT: 0, adm: null,
    };
    this.ships.push(s);
    return s;
  }
  makeBase(type, owner, sys, site) {
    const T = BASES[type];
    const b = {
      id: this.nextId++, kind: 'base', type, owner, sys, hp: T.hp * 0.1, maxHp: T.hp, progress: 0, built: false, op: false,
      queue: [], rally: null, cd: 0, planet: site.planet || null, slot: site.slot ?? null, hole: site.hole || null, seen: [false, false], a: 0,
    };
    if (b.planet) {
      const ang = -Math.PI / 2 + (b.slot || 0) * Math.PI * 0.9 + 0.35;
      const off = b.planet.r + 30;
      b.x = b.planet.x + Math.cos(ang) * off; b.y = b.planet.y + Math.sin(ang) * off;
      b.planet.slots[b.slot] = b.id;
    } else if (b.hole) { b.x = b.hole.x; b.y = b.hole.y; b.hole.gate = b.id; }
    else { b.x = site.x; b.y = site.y; }
    this.bases.push(b);
    return b;
  }

  byId(id) { return this.ships.find(s => s.id === id) || this.bases.find(b => b.id === id) || null; }
  alive(e) { return e && !e.dead; }

  /* ---------- Werte mit Admiralsbonus ---------- */
  bonus(s) { return s.bonus ? ADMIRALS[s.bonus] : null; }
  speed(s) {
    const T = SHIPS[s.type], B = this.bonus(s);
    let v = T.speed * (B?.speed || 1) * (T.cls === 'fighter' ? (B?.fighterSpeed || 1) : 1);
    if (s.boost > 0) v *= 1.7;
    return v;
  }
  range(e) {
    const W = e.kind === 'ship' ? SHIPS[e.type].weapon : BASES[e.type].weapon;
    if (!W) return 0;
    return W.range * (e.kind === 'ship' ? (this.bonus(e)?.range || 1) : 1);
  }
  damage(e) {
    const W = e.kind === 'ship' ? SHIPS[e.type].weapon : BASES[e.type].weapon;
    if (e.kind !== 'ship') return W.dmg;
    const B = this.bonus(e), T = SHIPS[e.type];
    return W.dmg * (B?.dmg || 1) * (T.cls === 'fighter' ? (B?.fighterDmg || 1) : 1);
  }
  supplyMax(s) { return (SHIPS[s.type].supplyMax || 0) * (this.bonus(s)?.supplyMax || 1); }
  supplyUse(s) { return this.bonus(s)?.use || 1; }

  /* ---------- Versorgungsnetz ---------- */
  computeNetworks() {
    for (const f of [0, 1]) {
      const net = new Set(this.bases.filter(b => b.owner === f && b.type === 'hq' && b.built && !b.dead).map(b => b.sys));
      const q = [...net];
      while (q.length) {
        const c = q.shift();
        for (const h of this.systems[c].holes) {
          if (net.has(h.to)) continue;
          const g1 = h.gate && this.byId(h.gate), g2 = h.pair.gate && this.byId(h.pair.gate);
          const ok = (g1 && g1.owner === f && g1.built) || (g2 && g2.owner === f && g2.built);
          if (ok) { net.add(h.to); q.push(h.to); }
        }
      }
      this.factions[f].net = net;
    }
    for (const b of this.bases) b.op = b.built && (b.type === 'gate' || this.factions[b.owner].net.has(b.sys));
  }

  /* ---------- Befehle ---------- */
  withFleets(ships) {
    const set = new Set(ships);
    for (const s of ships) if (s.type === 'admiral') for (const m of this.ships) if (m.fleet === s.id && m.owner === s.owner) set.add(m);
    return [...set];
  }
  formation(n, i) {
    if (i === 0) return [0, 0];
    let ring = 1, idx = i - 1;
    while (idx >= ring * 6) { idx -= ring * 6; ring++; }
    const a = (idx / (ring * 6)) * Math.PI * 2;
    return [Math.cos(a) * ring * 46, Math.sin(a) * ring * 46];
  }
  cmdMove(ships, sys, x, y, attackMove = false) {
    ships = this.withFleets(ships).filter(s => !s.dead);
    // Admiral vorne, Versorger hinten
    ships.sort((a, b) => (b.type === 'admiral') - (a.type === 'admiral') || (a.type === 'supply') - (b.type === 'supply'));
    ships.forEach((s, i) => {
      const [dx, dy] = this.formation(ships.length, i);
      s.order = { type: 'move', sys, x: clamp(x + dx, 40, SYS_W - 40), y: clamp(y + dy, 40, SYS_H - 40), amove: attackMove };
    });
  }
  cmdAttack(ships, target) {
    for (const s of this.withFleets(ships)) {
      if (s.dead) continue;
      if (!SHIPS[s.type].weapon) { s.order = { type: 'follow', target: target.id, dist: 260 }; continue; }
      s.order = { type: 'attack', target: target.id };
    }
  }
  cmdStop(ships) { for (const s of ships) s.order = { type: 'idle' }; }
  cmdResupply(ships) { for (const s of ships) if (SHIPS[s.type].supplyMax || s.type === 'supply') s.order = { type: 'resupply' }; }
  cmdFollow(ships, target) { for (const s of ships) if (s !== target) s.order = { type: 'follow', target: target.id, dist: 120 }; }
  cmdSpecial(ships) {
    let used = 0;
    for (const s of ships) if (this.useSpecial(s)) used++;
    return used;
  }
  useSpecial(s) {
    const T = SHIPS[s.type];
    if (!T.special || s.specCd > 0 || s.jumpT > 0) return false;
    const cost = T.special.cost * this.supplyUse(s);
    if (s.supply < cost) return false;
    const sp = T.special.key;
    if (sp === 'boost') { s.boost = 5; }
    else {
      const R = this.range(s) * (sp === 'torpedo' ? 1.25 : 1);
      const foes = this.enemiesNear(s, R);
      if (!foes.length) return false;
      if (sp === 'torpedo') this.fire(s, foes[0], 45, { speed: 420, big: true });
      else for (const f of foes) this.fire(s, f, 30, { beam: true });
    }
    s.supply -= cost;
    s.specCd = T.special.cd;
    this.fx.push({ kind: 'ring', sys: s.sys, x: s.x, y: s.y, r: 10, max: 46, t: 0, life: 0.4, color: '#fff' });
    return true;
  }
  formFleet(adm, ships) {
    if (!adm || adm.type !== 'admiral') return 0;
    let n = 0;
    for (const s of ships) if (s !== adm && s.owner === adm.owner && s.type !== 'admiral' && s.type !== 'builder') { s.fleet = adm.id; n++; }
    return n;
  }
  disband(adm) { for (const s of this.ships) if (s.fleet === adm.id) s.fleet = null; }

  canAfford(owner, cost) { return this.factions[owner].res >= cost; }
  unitCount(owner) { return this.ships.filter(s => s.owner === owner && !s.dead).length + this.bases.filter(b => b.owner === owner && !b.dead).reduce((n, b) => n + b.queue.length, 0); }

  /** Bauauftrag prüfen und erteilen – gibt Fehlertext oder null zurück */
  cmdBuild(builder, btype, site) {
    const T = BASES[btype], owner = builder.owner;
    if (T.planet) {
      if (!site.planet) return 'Diese Basis muss auf einem Planeten gebaut werden.';
      const slot = site.planet.slots.findIndex(x => x === null);
      if (slot < 0) return 'Auf diesem Planeten ist kein Bauplatz mehr frei.';
      if (btype === 'hq' && this.bases.some(b => b.sys === site.planet.sys && b.type === 'hq' && !b.dead)) return 'In diesem System steht bereits ein Hauptquartier.';
      site = { planet: site.planet, slot, sys: site.planet.sys };
    } else if (T.wormhole) {
      if (!site.hole) return 'Sprungtore werden an Wurmlöchern gebaut.';
      if (site.hole.gate) return 'An diesem Wurmloch steht bereits ein Sprungtor.';
      site = { hole: site.hole, sys: site.hole.sys };
    } else {
      if (site.x == null) return 'Ungültiger Bauplatz.';
      const s = this.systems[site.sys];
      if (s.planets.some(p => Math.hypot(p.x - site.x, p.y - site.y) < p.r + 40) || s.holes.some(h => Math.hypot(h.x - site.x, h.y - site.y) < 90)) return 'Zu nah an einem Planeten oder Wurmloch.';
    }
    if (!this.canAfford(owner, T.cost)) return 'Nicht genug Rohstoffe.';
    this.factions[owner].res -= T.cost;
    const b = this.makeBase(btype, owner, site.sys, site);
    b.reserved = builder.id;
    builder.order = { type: 'build', base: b.id };
    return null;
  }
  cmdContinueBuild(builder, base) { if (!base.built && base.owner === builder.owner) builder.order = { type: 'build', base: base.id }; }

  queueUnit(base, type, adm) {
    const T = SHIPS[type];
    if (!base.built) return 'Die Basis ist noch im Bau.';
    if (!BASES[base.type].produces?.includes(type)) return 'Diese Basis kann das nicht bauen.';
    if (base.queue.length >= 5) return 'Die Bauschleife ist voll.';
    if (this.unitCount(base.owner) >= UNIT_CAP) return `Einheitenlimit (${UNIT_CAP}) erreicht.`;
    if (type === 'admiral') {
      if (!adm || this.admiralTaken(base.owner, adm)) return 'Dieser Admiral dient bereits.';
    }
    if (!this.canAfford(base.owner, T.cost)) return 'Nicht genug Rohstoffe.';
    this.factions[base.owner].res -= T.cost;
    base.queue.push({ type, t: 0, adm });
    return null;
  }
  cancelUnit(base, i) {
    const q = base.queue[i];
    if (!q) return;
    this.factions[base.owner].res += SHIPS[q.type].cost;
    base.queue.splice(i, 1);
  }
  admiralTaken(owner, adm) {
    return this.ships.some(s => s.owner === owner && s.adm === adm && !s.dead) || this.bases.some(b => b.owner === owner && b.queue.some(q => q.adm === adm));
  }

  /* ---------- Hilfen ---------- */
  isEnemy(a, b) { return a.owner !== b.owner; }
  enemiesNear(e, R) {
    const out = [];
    for (const s of this.ships) if (s.owner !== e.owner && s.sys === e.sys && !s.dead && s.jumpT <= 0 && dist(s, e) <= R) out.push(s);
    for (const b of this.bases) if (b.owner !== e.owner && b.sys === e.sys && !b.dead && dist(b, e) <= R + BASES[b.type].size * 0.5) out.push(b);
    out.sort((a, b) => dist(a, e) - dist(b, e) + (a.kind === 'base') * 60 - (b.kind === 'base') * 60);
    return out;
  }
  supplyBaseFor(s) {
    let best = null, bd = Infinity;
    for (const b of this.bases) {
      if (b.owner !== s.owner || b.dead || !b.op || !SUPPLY_BASES.includes(b.type)) continue;
      const p = this.path(s.sys, b.sys);
      if (!p) continue;
      const d = (p.length - 1) * 4000 + (b.sys === s.sys ? dist(b, s) : 0);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  msg(text, owner, sys, kind = 'info') { this.msgs.push({ text, owner, sys, kind, t: this.time }); }

  /* ---------- Simulation ---------- */
  update(dt) {
    if (this.over) return;
    this.time += dt;
    this.netT -= dt;
    if (this.netT <= 0) { this.netT = 0.5; this.computeNetworks(); }
    this.updateFleets();
    this.economy(dt);
    for (const b of this.bases) if (!b.dead) this.updateBase(b, dt);
    for (const s of this.ships) if (!s.dead) this.updateShip(s, dt);
    this.separate(dt);
    this.supplyTick(dt);
    this.updateShots(dt);
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter(f => f.t < f.life);
    this.ships = this.ships.filter(s => !s.dead);
    this.bases = this.bases.filter(b => !b.dead);
    this.secT -= dt;
    if (this.secT <= 0) { this.secT = 1; this.checkEnd(); this.updateSeen(); }
  }

  updateFleets() {
    const adms = new Map(this.ships.filter(s => s.type === 'admiral').map(a => [a.id, a]));
    for (const s of this.ships) {
      s.bonus = null;
      if (s.type === 'admiral') { s.bonus = s.adm; continue; }
      if (s.fleet == null) continue;
      const a = adms.get(s.fleet);
      if (!a) { s.fleet = null; continue; }
      if (a.sys === s.sys && a.jumpT <= 0 && s.jumpT <= 0 && dist(a, s) <= COMMAND_RADIUS) s.bonus = a.adm;
    }
    // Clamp supply to (bonus-abhängiges) Maximum
    for (const s of this.ships) { const m = this.supplyMax(s); if (s.supply > m) s.supply = m; }
  }

  economy(dt) {
    for (const f of [0, 1]) {
      let inc = 0;
      for (const b of this.bases) {
        if (b.owner !== f || !b.op || b.dead) continue;
        if (b.type === 'hq') inc += BASES.hq.income;
        if (b.type === 'mine') inc += BASES.mine.income * b.planet.rich;
      }
      if (f === 1) inc *= this.diff.income;
      this.factions[f].income = inc;
      this.factions[f].res += inc * dt;
    }
  }

  updateBase(b, dt) {
    const T = BASES[b.type];
    if (!b.built) return;
    // Produktion
    if (b.op && b.queue.length) {
      const q = b.queue[0];
      q.t += dt;
      if (q.t >= SHIPS[q.type].time) {
        const ang = Math.random() * Math.PI * 2;
        const s = this.makeShip(q.type, b.owner, b.sys, b.x + Math.cos(ang) * (T.size + 20), b.y + Math.sin(ang) * (T.size + 20));
        if (q.adm) s.adm = q.adm;
        b.queue.shift();
        this.factions[b.owner].built++;
        if (b.rally) s.order = { type: 'move', sys: b.sys, x: b.rally.x + (Math.random() - 0.5) * 60, y: b.rally.y + (Math.random() - 0.5) * 60 };
        if (b.owner === 0) this.msg(`${q.adm ? ADMIRALS[q.adm].name : SHIPS[q.type].name} fertiggestellt (${this.systems[b.sys].name}).`, 0, b.sys, 'good');
      }
    }
    // Geschütztürme
    if (T.weapon && b.op) {
      b.cd -= dt;
      if (b.cd <= 0) {
        const foes = this.enemiesNear(b, T.weapon.range);
        if (foes.length) { b.cd = T.weapon.rof; b.a = Math.atan2(foes[0].y - b.y, foes[0].x - b.x); this.fire(b, foes[0], T.weapon.dmg, { speed: T.weapon.speed }); }
      }
    }
    // Reparatur an HQ und Depot
    if (b.op && (b.type === 'hq' || b.type === 'depot') && b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.004 * dt);
  }

  moveTo(s, x, y, dt, stopDist = 6) {
    const dx = x - s.x, dy = y - s.y, d = Math.hypot(dx, dy);
    const sp = this.speed(s);
    if (d < stopDist) { s.vx *= 0.8; s.vy *= 0.8; return true; }
    const want = Math.atan2(dy, dx);
    const turn = 3.2 * dt;
    s.a += clamp(angDiff(want, s.a), -turn, turn);
    const v = Math.min(sp, d * 2.2) * (Math.abs(angDiff(want, s.a)) > 1.2 ? 0.35 : 1);
    s.vx = Math.cos(s.a) * v; s.vy = Math.sin(s.a) * v;
    s.x += s.vx * dt; s.y += s.vy * dt;
    return false;
  }

  /** Steuert ein Schiff zu einem Punkt in einem (evtl. anderen) System. true = angekommen */
  navigate(s, sys, x, y, dt, stopDist) {
    if (s.sys === sys) return this.moveTo(s, x, y, dt, stopDist);
    const p = this.path(s.sys, sys);
    if (!p) { s.order = { type: 'idle' }; return true; }
    const h = this.holeTo(s.sys, p[1]);
    if (this.moveTo(s, h.x, h.y, dt, 22)) this.startJump(s, h);
    return false;
  }
  startJump(s, h) {
    const g1 = h.gate && this.byId(h.gate), g2 = h.pair.gate && this.byId(h.pair.gate);
    const own = (g1 && g1.owner === s.owner && g1.built) || (g2 && g2.owner === s.owner && g2.built);
    s.jumpT = own ? 0.25 : 1.6;
    s.jumpMax = s.jumpT;
    s.jumpHole = h;
    s.vx = s.vy = 0;
    this.fx.push({ kind: 'jump', sys: s.sys, x: h.x, y: h.y, t: 0, life: 0.6, color: own ? '#5ee7ff' : '#b38cff' });
  }
  finishJump(s) {
    const h = s.jumpHole.pair;
    s.sys = h.sys;
    const out = Math.atan2(SYS_H / 2 - h.y, SYS_W / 2 - h.x) + (Math.random() - 0.5) * 0.8;
    s.x = h.x + Math.cos(out) * (60 + Math.random() * 30); s.y = h.y + Math.sin(out) * (60 + Math.random() * 30);
    s.a = out;
    s.jumpHole = null;
    this.fx.push({ kind: 'jump', sys: s.sys, x: h.x, y: h.y, t: 0, life: 0.6, color: '#b38cff' });
  }

  updateShip(s, dt) {
    const T = SHIPS[s.type];
    s.cd -= dt; s.specCd = Math.max(0, s.specCd - dt); s.boost = Math.max(0, s.boost - dt);
    if (s.jumpT > 0) { s.jumpT -= dt; if (s.jumpT <= 0) this.finishJump(s); return; }
    const o = s.order;
    let firing = null;
    if (T.weapon) firing = this.pickTarget(s);

    switch (o.type) {
      case 'move': {
        if (o.amove && firing) break; // Angriffsbewegung: anhalten und kämpfen
        if (this.navigate(s, o.sys, o.x, o.y, dt)) s.order = { type: 'idle' };
        break;
      }
      case 'attack': {
        const t = this.byId(o.target);
        if (!t || t.dead) { s.order = { type: 'idle' }; break; }
        if (t.sys !== s.sys) { this.navigate(s, t.sys, t.x, t.y, dt); break; }
        const R = this.range(s) * 0.85 + (t.kind === 'base' ? BASES[t.type].size * 0.4 : 0);
        if (dist(s, t) > R) this.moveTo(s, t.x, t.y, dt, 4); else { s.vx *= 0.9; s.vy *= 0.9; this.face(s, t, dt); }
        break;
      }
      case 'follow': {
        const t = this.byId(o.target);
        if (!t || t.dead) { s.order = { type: 'idle' }; break; }
        if (t.sys !== s.sys) { if (t.jumpT <= 0) this.navigate(s, t.sys, t.x, t.y, dt); break; }
        if (dist(s, t) > (o.dist || 120)) this.moveTo(s, t.x, t.y, dt, o.dist || 120);
        break;
      }
      case 'build': {
        const b = this.byId(o.base);
        if (!b || b.dead || b.built) { s.order = { type: 'idle' }; break; }
        const tx = b.planet ? b.planet.x + (b.x - b.planet.x) * 1.6 : b.x + 70, ty = b.planet ? b.planet.y + (b.y - b.planet.y) * 1.6 : b.y + 40;
        if (this.navigate(s, b.sys, tx, ty, dt, 30) || (s.sys === b.sys && dist(s, b) < 150)) {
          const BT = BASES[b.type];
          b.progress = Math.min(1, b.progress + dt / BT.time);
          b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.9 * dt / BT.time);
          s.building = b.id;
          if (b.progress >= 1) {
            b.built = true; b.hp = Math.max(b.hp, b.maxHp * 0.98);
            this.sfx.push({ kind: 'done', sys: b.sys, owner: b.owner });
            s.order = { type: 'idle' }; s.building = null;
            this.computeNetworks();
            if (b.owner === 0) {
              const op = b.op ? '' : ' – noch nicht operativ (HQ oder Sprungtor-Verbindung fehlt)';
              this.msg(`${BASES[b.type].name} in ${this.systems[b.sys].name} fertig${op}.`, 0, b.sys, b.op ? 'good' : 'warn');
            }
          }
        }
        break;
      }
      case 'resupply': {
        const b = this.supplyBaseFor(s);
        if (!b) { if (s.owner === 0) this.msg('Keine operative Versorgungsbasis erreichbar.', 0, s.sys, 'warn'); s.order = { type: 'idle' }; break; }
        const full = s.type === 'supply' ? s.cargo >= T.cargo - 1 : s.supply >= this.supplyMax(s) - 0.5;
        if (full) { s.order = { type: 'idle' }; break; }
        this.navigate(s, b.sys, b.x + 60, b.y + 60, dt, 50);
        break;
      }
      default: { // idle
        if (T.weapon && firing && s.type !== 'admiral') {
          const R = this.range(s);
          if (dist(s, firing) > R) this.moveTo(s, firing.x, firing.y, dt, 4);
        } else if (s.fleet != null) {
          const a = this.byId(s.fleet);
          if (a && !a.dead && (a.sys !== s.sys || dist(a, s) > (s.type === 'supply' ? 200 : 330))) {
            if (a.jumpT <= 0) this.navigate(s, a.sys, a.x - Math.cos(a.a) * (s.type === 'supply' ? 110 : 60), a.y - Math.sin(a.a) * (s.type === 'supply' ? 110 : 60), dt, 50);
          } else { s.vx *= 0.9; s.vy *= 0.9; }
        } else { s.vx *= 0.9; s.vy *= 0.9; }
      }
    }
    // Feuern
    if (firing && s.cd <= 0 && dist(s, firing) <= this.range(s) + (firing.kind === 'base' ? BASES[firing.type].size * 0.5 : 0)) {
      const W = T.weapon, cost = W.cost * this.supplyUse(s);
      let dmg = this.damage(s), rof = W.rof;
      if (s.supply >= cost) s.supply -= cost;
      else { dmg *= 0.15; rof *= 2.5; s.dry = true; }
      s.cd = rof;
      if (Math.hypot(s.vx, s.vy) < 10) this.face(s, firing, dt * 4);
      this.fire(s, firing, dmg, { speed: W.speed, beam: W.beam, weak: s.supply < cost });
    }
    if (s.supply > 1) s.dry = false;
    s.x = clamp(s.x, 20, SYS_W - 20); s.y = clamp(s.y, 20, SYS_H - 20);
  }
  face(s, t, dt) { s.a += clamp(angDiff(Math.atan2(t.y - s.y, t.x - s.x), s.a), -3 * dt, 3 * dt); }

  pickTarget(s) {
    const o = s.order;
    if (o.type === 'attack') { const t = this.byId(o.target); if (t && !t.dead && t.sys === s.sys && dist(s, t) <= this.range(s) * 1.05 + (t.kind === 'base' ? BASES[t.type].size * 0.5 : 0)) return t; }
    const aggro = (o.type === 'idle' || o.amove) ? this.range(s) * 1.7 : this.range(s);
    const foes = this.enemiesNear(s, aggro);
    // Admiral bleibt zurückhaltend
    return foes[0] || null;
  }

  fire(src, target, dmg, opt = {}) {
    if (this.sfx.length < 40) this.sfx.push({ kind: opt.beam ? 'beam' : 'shot', sys: src.sys, owner: src.owner });
    const color = opt.weak ? '#666' : (src.owner === 0 ? '#9ff3ff' : '#ff9a8f');
    if (opt.beam) {
      this.fx.push({ kind: 'beam', sys: src.sys, x: src.x, y: src.y, x2: target.x, y2: target.y, t: 0, life: 0.18, color });
      this.hit(target, dmg, src);
      return;
    }
    this.shots.push({ sys: src.sys, x: src.x, y: src.y, target: target.id, tx: target.x, ty: target.y, dmg, speed: opt.speed || 600, color, big: !!opt.big, owner: src.owner, src: src.id });
  }
  updateShots(dt) {
    for (const p of this.shots) {
      const t = this.byId(p.target);
      if (t && !t.dead && t.sys === p.sys) { p.tx = t.x; p.ty = t.y; }
      const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), step = p.speed * dt;
      p.dx = dx / (d || 1); p.dy = dy / (d || 1);
      if (d <= step + 6) {
        p.done = true;
        if (t && !t.dead && t.sys === p.sys) this.hit(t, p.dmg, this.byId(p.src) || { owner: p.owner });
      } else { p.x += p.dx * step; p.y += p.dy * step; }
    }
    this.shots = this.shots.filter(p => !p.done);
  }
  hit(t, dmg, src) {
    if (t.dead) return;
    t.hp -= dmg;
    this.fx.push({ kind: 'spark', sys: t.sys, x: t.x + (Math.random() - 0.5) * 10, y: t.y + (Math.random() - 0.5) * 10, t: 0, life: 0.25, color: '#fff' });
    if (t.owner === 0 && t.kind === 'base') this.alert(t.sys, `Basis in ${this.systems[t.sys].name} wird angegriffen!`);
    else if (t.owner === 0 && t.kind === 'ship') this.alert(t.sys, `Gefecht in ${this.systems[t.sys].name}!`);
    if (t.hp <= 0) this.destroy(t, src);
  }
  alert(sys, text) {
    if ((this.alertT[sys] || -99) > this.time - 15) return;
    this.alertT[sys] = this.time;
    this.msg(text, 0, sys, 'alert');
  }
  destroy(e, src) {
    e.dead = true;
    this.sfx.push({ kind: 'boom', sys: e.sys, big: e.kind === 'base' });
    const big = e.kind === 'base';
    this.fx.push({ kind: 'boom', sys: e.sys, x: e.x, y: e.y, t: 0, life: big ? 1.6 : 0.9, r: big ? 70 : (SHIPS[e.type]?.size || 20) * 1.6, color: e.owner === 0 ? '#5ee7ff' : '#ff5f57', seed: Math.random() * 1000, big });
    if (src && src.owner !== e.owner) this.factions[src.owner].killed++;
    if (e.kind === 'ship') {
      this.factions[e.owner].lost++;
      if (e.type === 'admiral') {
        this.disband(e);
        if (e.owner === 0) this.msg(`${ADMIRALS[e.adm]?.name || 'Admiral'} ist gefallen – die Flotte ist aufgelöst.`, 0, e.sys, 'alert');
        else this.msg(`Feindlicher Admiral (${ADMIRALS[e.adm]?.title}) zerstört!`, 0, e.sys, 'good');
      }
    } else {
      this.factions[e.owner].basesLost++;
      if (e.planet) e.planet.slots[e.slot] = null;
      if (e.hole) e.hole.gate = null;
      for (const q of e.queue) this.factions[e.owner].res += SHIPS[q.type].cost * 0.5;
      this.msg(e.owner === 0 ? `${BASES[e.type].name} in ${this.systems[e.sys].name} verloren!` : `Feindliche ${BASES[e.type].name} in ${this.systems[e.sys].name} zerstört.`, 0, e.sys, e.owner === 0 ? 'alert' : 'good');
      this.computeNetworks();
    }
  }

  separate(dt) {
    const S = this.ships;
    for (let i = 0; i < S.length; i++) {
      const a = S[i];
      if (a.jumpT > 0 || a.dead) continue;
      for (let j = i + 1; j < S.length; j++) {
        const b = S[j];
        if (b.sys !== a.sys || b.jumpT > 0 || b.dead) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = (SHIPS[a.type].size + SHIPS[b.type].size) * 0.55;
        if (d > 0 && d < m) {
          const push = (m - d) * 0.5 * Math.min(1, dt * 8), nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        }
      }
    }
  }

  supplyTick(dt) {
    // Basen versorgen Schiffe in Reichweite
    for (const b of this.bases) {
      const T = BASES[b.type];
      if (!b.op || !T.supplyRange) continue;
      for (const s of this.ships) {
        if (s.owner !== b.owner || s.sys !== b.sys || s.jumpT > 0 || dist(s, b) > T.supplyRange) continue;
        const m = this.supplyMax(s);
        if (m && s.supply < m) { s.supply = Math.min(m, s.supply + T.supplyRate * dt); s.fed = 0.3; }
        if (s.type === 'supply' && s.cargo < SHIPS.supply.cargo) { s.cargo = Math.min(SHIPS.supply.cargo, s.cargo + 22 * dt); s.fed = 0.3; }
      }
    }
    // Versorgungsschiffe geben Supplies ab
    for (const v of this.ships) {
      if (v.type !== 'supply' || v.cargo <= 0 || v.jumpT > 0) { v.feeding = null; continue; }
      const need = this.ships.filter(s => s.owner === v.owner && s.sys === v.sys && s !== v && s.jumpT <= 0 && this.supplyMax(s) && s.supply < this.supplyMax(s) - 0.5 && dist(s, v) <= SHIPS.supply.range)
        .sort((a, b) => a.supply / this.supplyMax(a) - b.supply / this.supplyMax(b)).slice(0, 3);
      v.feeding = need.map(s => s.id);
      for (const s of need) {
        const give = Math.min(SHIPS.supply.transfer * dt, this.supplyMax(s) - s.supply, v.cargo);
        s.supply += give; v.cargo -= give; s.fed = 0.3;
      }
    }
    for (const s of this.ships) if (s.fed) s.fed = Math.max(0, s.fed - dt);
  }

  updateSeen() {
    const vis = this.visibleSystems(0);
    for (const b of this.bases) if (b.owner === 1 && vis.has(b.sys)) b.seen[0] = true;
  }
  visibleSystems(owner) {
    const v = new Set();
    for (const s of this.ships) if (s.owner === owner && s.jumpT <= 0) v.add(s.sys);
    for (const b of this.bases) if (b.owner === owner) v.add(b.sys);
    return v;
  }

  checkEnd() {
    for (const f of [0, 1]) {
      const alive = this.bases.some(b => b.owner === f && !b.dead) || this.ships.some(s => s.owner === f && s.type === 'builder' && !s.dead);
      if (!alive && this.factions[f].alive) {
        this.factions[f].alive = false;
        this.over = { winner: 1 - f, time: this.time };
      }
    }
  }
}
