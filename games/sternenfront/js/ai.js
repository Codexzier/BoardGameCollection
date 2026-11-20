/* Sternenfront – Computergegner. */
import { SHIPS, BASES, ADMIRALS, SYS_W, SYS_H, UNIT_CAP } from './data.js';
import { dist } from './game.js';

const COMBAT = ['fighter', 'corvette', 'battleship', 'admiral'];

export class AI {
  constructor(game, owner = 1) {
    this.g = game; this.me = owner; this.t = 2; this.mode = 'gather'; this.attacks = 0;
    this.target = null; this.startStrength = 0; this.turretsBuilt = 0;
  }
  get f() { return this.g.factions[this.me]; }
  mine(list) { return list.filter(e => e.owner === this.me && !e.dead); }

  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = this.g.diff.think;
    const g = this.g;
    const ships = this.mine(g.ships), bases = this.mine(g.bases);
    const net = this.f.net;
    const hqs = bases.filter(b => b.type === 'hq' && b.built);
    const yards = bases.filter(b => b.type === 'yard');
    const builders = ships.filter(s => s.type === 'builder');
    const supplies = ships.filter(s => s.type === 'supply');
    const army = ships.filter(s => COMBAT.includes(s.type));
    const queued = (type) => bases.reduce((n, b) => n + b.queue.filter(q => q.type === type).length, 0);

    // --- Produktion im HQ
    for (const hq of hqs) {
      if (!hq.op || hq.queue.length >= 2) continue;
      const wantB = this.f.res > 900 ? 3 : 2;
      if (builders.length + queued('builder') < wantB) g.queueUnit(hq, 'builder');
      else if (supplies.length + queued('supply') < Math.min(3, 1 + Math.floor(army.length / 7)) && this.f.res > 180) g.queueUnit(hq, 'supply');
    }
    // --- Werften
    for (const y of yards) {
      if (!y.op || !y.built) continue;
      while (y.queue.length < 2) {
        const reserve = builders.some(b => b.order.type === 'idle') ? 150 : 0;
        let type;
        const free = Object.keys(ADMIRALS).filter(k => !g.admiralTaken(this.me, k));
        const admNow = ships.filter(s => s.type === 'admiral').length;
        if (army.length >= 6 && free.length && admNow < 1 + Math.floor(g.time / 420) && this.f.res > 420) type = 'admiral';
        else {
          const r = Math.random(), late = g.time > 360;
          type = r < (late ? 0.28 : 0.4) ? 'fighter' : r < (late ? 0.68 : 0.82) ? 'corvette' : 'battleship';
          if (type === 'battleship' && this.f.res < 330) type = 'corvette';
        }
        if (this.f.res < SHIPS[type].cost + reserve || g.unitCount(this.me) >= UNIT_CAP - 2) break;
        const adm = type === 'admiral' ? free[Math.floor(Math.random() * free.length)] : undefined;
        if (g.queueUnit(y, type, adm)) break;
      }
      if (!y.rally) { const s = g.systems[y.sys]; y.rally = { x: (y.x + s.star.x) / 2, y: (y.y + s.star.y) / 2 }; }
    }

    // --- Konstrukteure
    for (const b of builders) if (b.order.type === 'idle') this.builderTask(b, bases, net);
    // Unfertige Baustellen weiterbauen
    for (const site of bases.filter(x => !x.built)) {
      if (!builders.some(b => b.order.type === 'build' && b.order.base === site.id)) {
        const idle = builders.find(b => b.order.type === 'idle');
        if (idle) g.cmdContinueBuild(idle, site);
      }
    }

    this.military(army, supplies, bases, net);
  }

  freeSlots(sysIds) {
    const out = [];
    for (const id of sysIds) for (const p of this.g.systems[id].planets) if (p.slots.some(x => x === null)) out.push(p);
    return out;
  }

  builderTask(b, bases, net) {
    const g = this.g;
    const res = this.f.res;
    const has = (type) => g.bases.some(x => x.owner === this.me && !x.dead && x.type === type);
    const homeSys = g.homes[this.me];
    const netSys = [...net].sort((a, c) => (g.path(b.sys, a)?.length || 99) - (g.path(b.sys, c)?.length || 99));
    const tryBuild = (type, site) => !g.cmdBuild(b, type, site);
    // 1. Werft
    if (!has('yard') && res >= BASES.yard.cost) { for (const p of this.freeSlots(netSys)) if (tryBuild('yard', { planet: p })) return; }
    // 2. Förderstationen auf freien Planeten im Netz
    if (res >= BASES.mine.cost) {
      const mines = g.bases.filter(x => x.owner === this.me && !x.dead && x.type === 'mine').length;
      for (const p of this.freeSlots(netSys)) {
        if (p.sys === homeSys && p.slots.filter(x => x === null).length === 1 && !has('depot') && mines >= 2) continue;
        if (tryBuild('mine', { planet: p })) return;
      }
    }
    // 3. Versorgungsdepot an der Front
    if (has('yard') && !has('depot') && res >= BASES.depot.cost + 100) {
      const front = this.frontSystem(net);
      for (const p of this.freeSlots([front, ...netSys])) if (tryBuild('depot', { planet: p })) return;
    }
    // 4. Geschütztürme an Wurmlöchern im Heimatsystem
    if (this.turretsBuilt < g.diff.turrets && has('yard') && res >= BASES.turret.cost + 250) {
      const s = g.systems[this.frontSystem(net)];
      const h = s.holes.find(h => !net.has(h.to)) || s.holes[0];
      const x = h.x + (s.star.x - h.x) * 0.18 + (Math.random() - 0.5) * 80, y = h.y + (s.star.y - h.y) * 0.18 + (Math.random() - 0.5) * 80;
      if (tryBuild('turret', { sys: s.id, x, y })) { this.turretsBuilt++; return; }
    }
    // 5. Expansion: Sprungtor zu einem Nachbarsystem ohne eigenes Netz
    if (res >= BASES.gate.cost + 80) {
      const enemyBases = new Set(g.bases.filter(x => x.owner !== this.me).map(x => x.sys));
      let best = null;
      for (const sid of net) for (const h of g.systems[sid].holes) {
        const pg = h.pair.gate && g.byId(h.pair.gate);
        if (net.has(h.to) || h.gate || (pg && pg.owner === this.me)) continue;
        const free = g.systems[h.to].planets.reduce((n, p) => n + p.slots.filter(x => x === null).length, 0);
        if (!free) continue;
        const score = free * 2 - (enemyBases.has(h.to) ? 6 : 0) - (g.path(sid, homeSys).length);
        if (!best || score > best.score) best = { h, score };
      }
      if (best && best.score > -3 && tryBuild('gate', { hole: best.h })) return;
    }
    // 6. Zweites HQ wenn reich
    if (res > 1100) for (const sid of net) {
      if (g.bases.some(x => x.sys === sid && x.type === 'hq' && !x.dead)) continue;
      for (const p of this.freeSlots([sid])) if (tryBuild('hq', { planet: p })) return;
    }
    // sonst: zum HQ zurück
    const hq = bases.find(x => x.type === 'hq');
    if (hq && (b.sys !== hq.sys || dist(b, hq) > 300)) g.cmdMove([b], hq.sys, hq.x + 80, hq.y + 80);
  }

  frontSystem(net) {
    const g = this.g, enemyHome = g.homes[1 - this.me];
    let best = g.homes[this.me], bd = Infinity;
    for (const s of net) { const d = g.path(s, enemyHome)?.length ?? 99; if (d < bd) { bd = d; best = s; } }
    return best;
  }

  military(army, supplies, bases, net) {
    const g = this.g;
    const strength = army.reduce((n, s) => n + SHIPS[s.type].cost * (s.hp / s.maxHp), 0);
    const avgSupply = army.length ? army.reduce((n, s) => n + s.supply / Math.max(1, g.supplyMax(s)), 0) / army.length : 1;
    const cargo = supplies.reduce((n, s) => n + s.cargo, 0);
    const adm = army.find(s => s.type === 'admiral');
    if (adm) g.formFleet(adm, [...army, ...supplies].filter(s => s.fleet == null));

    // Bedrohung eigener Systeme
    const threat = new Map();
    for (const s of g.ships) {
      if (s.owner === this.me || s.dead || !SHIPS[s.type].weapon || s.jumpT > 0) continue;
      if (bases.some(b => b.sys === s.sys)) threat.set(s.sys, (threat.get(s.sys) || 0) + SHIPS[s.type].cost);
    }
    const rally = this.frontSystem(net);
    const lead = adm || army[0];

    // Spezialfähigkeiten im Gefecht
    for (const s of army) if (SHIPS[s.type].special && s.supply > SHIPS[s.type].special.cost + 8 && g.enemiesNear(s, g.range(s)).length && Math.random() < 0.35) g.useSpecial(s);

    if (this.mode === 'attack') {
      const t = this.target;
      const stillThere = g.bases.some(b => b.owner !== this.me && b.sys === t && !b.dead);
      if ((avgSupply < 0.22 && cargo < 40) || strength < this.startStrength * 0.35) {
        this.mode = 'retreat';
        g.cmdResupply(army);
        for (const v of supplies) g.cmdResupply([v]);
      } else if (!stillThere) {
        this.mode = 'gather';
      } else {
        for (const s of army) {
          if (s.order.type !== 'idle' && !(s.order.type === 'move' && s.order.amove)) continue;
          if (s.sys !== t) { g.cmdMove([s], t, SYS_W / 2, SYS_H / 2, true); continue; }
          const foes = g.enemiesNear(s, 5000);
          const tgt = foes.find(e => e.kind === 'ship' && SHIPS[e.type].weapon) || foes[0];
          if (tgt) g.cmdAttack([s], tgt);
        }
        for (const v of supplies) if (v.order.type === 'idle' && lead && v.fleet == null) g.cmdFollow([v], lead);
      }
    }
    if (this.mode === 'retreat') {
      if (avgSupply > 0.8 || !army.length) this.mode = 'gather';
      else for (const s of army) if (s.order.type === 'idle') g.cmdResupply([s]);
    }
    if (this.mode === 'gather') {
      // Verteidigung hat Vorrang
      let defend = null, dv = 0;
      for (const [sys, v] of threat) if (v > dv) { dv = v; defend = sys; }
      if (defend != null && strength > 0) {
        for (const s of army) if (s.order.type === 'idle' || (s.order.type === 'move' && s.order.sys !== defend)) {
          if (s.sys !== defend) g.cmdMove([s], defend, SYS_W / 2, SYS_H / 2, true);
        }
        return;
      }
      // Sammelpunkt in Reichweite einer operativen Versorgungsbasis
      const sb = bases.filter(b => b.op && ['depot', 'yard', 'hq'].includes(b.type))
        .sort((a, b) => (a.sys === rally ? 0 : 1) - (b.sys === rally ? 0 : 1) || ['depot', 'yard', 'hq'].indexOf(a.type) - ['depot', 'yard', 'hq'].indexOf(b.type))[0];
      if (sb) {
        const sys = g.systems[sb.sys];
        const px = sb.x + (sys.star.x - sb.x) * 0.25, py = sb.y + (sys.star.y - sb.y) * 0.25;
        for (const s of army) {
          if (s.order.type !== 'idle' || (s.fleet != null && s.type !== 'admiral')) continue;
          if (s.supply < g.supplyMax(s) * 0.85) { g.cmdResupply([s]); continue; }
          if (s.sys !== sb.sys || Math.hypot(s.x - px, s.y - py) > 160) g.cmdMove([s], sb.sys, px + (Math.random() - 0.5) * 120, py + (Math.random() - 0.5) * 120);
        }
      }
      for (const v of supplies) if (v.order.type === 'idle' && v.cargo < 200) g.cmdResupply([v]);
      const need = g.diff.attackAt * (1 + this.attacks * 0.3);
      if (strength >= need && avgSupply > 0.7 && g.time >= g.diff.firstAttack) {
        const t = this.pickTarget();
        if (t != null) {
          this.mode = 'attack'; this.target = t; this.attacks++; this.startStrength = strength;
          if (adm) g.cmdMove([adm], t, SYS_W / 2, SYS_H / 2, true);
          else for (const s of army) g.cmdMove([s], t, SYS_W / 2, SYS_H / 2, true);
          for (const v of supplies) if (lead) g.cmdFollow([v], lead);
        }
      }
    }
  }

  pickTarget() {
    const g = this.g;
    const from = this.frontSystem(this.f.net);
    let best = null, bd = Infinity;
    for (const b of g.bases) {
      if (b.owner === this.me || b.dead) continue;
      const d = (g.path(from, b.sys)?.length ?? 99) * 10 + (b.type === 'hq' ? 4 : 0) - (b.type === 'gate' ? 3 : 0);
      if (d < bd) { bd = d; best = b.sys; }
    }
    return best;
  }
}
