/* Sternenfront – Oberfläche, Eingabe, Spielschleife. */
import { Game, dist } from './game.js';
import { AI } from './ai.js';
import { Renderer, loadSprites } from './render.js';
import { SHIPS, BASES, ADMIRALS, MAPS, DIFFICULTY, SYS_W, SYS_H, FACTIONS, BUILD_ORDER, UNIT_CAP, COMMAND_RADIUS } from './data.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtT = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const store = {
  get(k, d) { try { const v = localStorage.getItem('sf.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem('sf.' + k, JSON.stringify(v)); } catch (_) {} },
};
const opt = Object.assign({ map: 'small', diff: 'normal', sound: true }, store.get('opt', {}));

const canvas = $('#c'), sectorCv = $('#sectorCv');
let R = null, G = null, ai = null;
let viewSys = 0;
const views = {};
let sel = [];
const groups = {};
let build = null;          // { type, pos, valid, site, err }
const markers = [];
let speed = 1, paused = false, running = false;
let hoverSys = null, lastHud = 0, msgSeen = 0;
const alerts = {};
let dpr = Math.min(2, devicePixelRatio || 1);

/* ---------- Ansicht ---------- */
function resize() {
  dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
  const r = sectorCv.getBoundingClientRect();
  sectorCv.width = Math.max(1, r.width * dpr); sectorCv.height = Math.max(1, r.height * dpr);
}
addEventListener('resize', () => { resize(); for (const k in views) clampView(views[k]); });
const fitZ = () => Math.min(innerWidth / (SYS_W + 80), (innerHeight - 180) / (SYS_H + 80));
function view() {
  if (!views[viewSys]) views[viewSys] = { sys: viewSys, cx: SYS_W / 2, cy: SYS_H / 2 + 40, z: fitZ() };
  return views[viewSys];
}
function clampView(v) {
  const minZ = fitZ() * 0.8;
  v.z = Math.max(minZ, Math.min(2.2, v.z));
  v.cx = Math.max(0, Math.min(SYS_W, v.cx)); v.cy = Math.max(0, Math.min(SYS_H + 120, v.cy));
}
const toWorld = (sx, sy) => { const v = view(); return { x: v.cx + (sx - innerWidth / 2) / v.z, y: v.cy + (sy - innerHeight / 2) / v.z }; };
function goSystem(id, focus) {
  viewSys = id;
  const v = view();
  if (focus) { v.cx = focus.x; v.cy = focus.y + 40; }
  $('#sysName').textContent = '◎ ' + G.systems[id].name.toUpperCase();
  refreshHud(true);
}

/* ---------- Auswahl & Picking ---------- */
const own = (e) => e && e.owner === 0;
const visSet = () => G.visibleSystems(0);
function pick(wx, wy) {
  const v = view(), seen = visSet().has(viewSys), tol = 8 / v.z;
  let best = null, bd = Infinity;
  for (const s of G.ships) {
    if (s.sys !== viewSys || s.jumpT > 0 || (s.owner !== 0 && !seen)) continue;
    const d = Math.hypot(s.x - wx, s.y - wy);
    if (d < SHIPS[s.type].size + tol && d < bd) { bd = d; best = s; }
  }
  if (best) return best;
  for (const b of G.bases) {
    if (b.sys !== viewSys || (b.owner !== 0 && !seen && !b.seen[0])) continue;
    const d = Math.hypot(b.x - wx, b.y - wy), r = b.type === 'gate' ? 66 : BASES[b.type].size + tol;
    if (d < r && d < bd) { bd = d; best = b; }
  }
  return best;
}
function holeAt(wx, wy, r = 60) { return G.systems[viewSys].holes.find(h => Math.hypot(h.x - wx, h.y - wy) < r) || null; }
function planetAt(wx, wy) { return G.systems[viewSys].planets.find(p => Math.hypot(p.x - wx, p.y - wy) < p.r + 60) || null; }
const selShips = () => sel.filter(e => e.kind === 'ship' && own(e) && !e.dead);
function setSel(list) { sel = list.filter(Boolean); build = null; refreshHud(true); }

/* ---------- Befehle ---------- */
function marker(x, y, color) { markers.push({ sys: viewSys, x, y, t: 0, color }); }
function command(wx, wy) {
  const ships = selShips();
  if (!ships.length) {
    const b = sel[0];
    if (b && b.kind === 'base' && own(b) && BASES[b.type].produces) { b.rally = { x: wx, y: wy }; marker(wx, wy, 'rgba(255,255,255,A)'); refreshHud(true); }
    return;
  }
  const t = pick(wx, wy);
  if (t && t.owner !== 0) { G.cmdAttack(ships, t); marker(t.x, t.y, 'rgba(255,95,87,A)'); sfx('ack'); return; }
  if (t && t.kind === 'base' && !t.built) {
    const bs = ships.filter(s => s.type === 'builder');
    bs.forEach(b => G.cmdContinueBuild(b, t));
    const rest = ships.filter(s => s.type !== 'builder');
    if (rest.length) G.cmdMove(rest, viewSys, wx, wy);
    marker(t.x, t.y, 'rgba(255,224,138,A)'); sfx('ack'); return;
  }
  if (t && t.kind === 'ship' && own(t) && ships.some(s => s.type === 'supply') && !ships.includes(t)) {
    G.cmdFollow(ships.filter(s => s.type === 'supply'), t);
    const rest = ships.filter(s => s.type !== 'supply');
    if (rest.length) G.cmdMove(rest, viewSys, wx, wy);
    marker(t.x, t.y, 'rgba(94,231,255,A)'); sfx('ack'); return;
  }
  const h = holeAt(wx, wy, 55);
  if (h) {
    const p = h.pair, ang = Math.atan2(SYS_H / 2 - p.y, SYS_W / 2 - p.x);
    G.cmdMove(ships, h.to, p.x + Math.cos(ang) * 150, p.y + Math.sin(ang) * 150);
    marker(h.x, h.y, 'rgba(179,140,255,A)'); sfx('ack');
    toast(`Flug durch das Wurmloch nach ${G.systems[h.to].name}.`);
    return;
  }
  G.cmdMove(ships, viewSys, wx, wy);
  marker(wx, wy, 'rgba(126,255,170,A)'); sfx('ack');
}
function doStop() { G.cmdStop(selShips()); }
function doResupply() { const s = selShips(); G.cmdResupply(s); if (s.length) toast('Schiffe fliegen zur nächsten operativen Versorgungsbasis.'); }
function doSpecial() { const n = G.cmdSpecial(selShips()); toast(n ? `Spezialaktion ausgelöst (${n}×).` : 'Keine Spezialaktion möglich (Abklingzeit, Supplies oder kein Ziel in Reichweite).'); }
function doFleet() {
  const ships = selShips(), adm = ships.find(s => s.type === 'admiral');
  if (!adm) return toast('Wähle einen Admiral und die Schiffe, die er führen soll.');
  const n = G.formFleet(adm, ships);
  toast(n ? `${n} Schiffe unter dem Kommando von ${ADMIRALS[adm.adm].name}.` : 'Keine weiteren Schiffe ausgewählt.');
  refreshHud(true);
}
function doSelectFleet() {
  const ships = selShips();
  const ids = new Set(ships.map(s => s.type === 'admiral' ? s.id : s.fleet).filter(x => x != null));
  if (!ids.size) return toast('Keine Flotte in der Auswahl.');
  setSel(G.ships.filter(s => s.owner === 0 && (ids.has(s.id) || ids.has(s.fleet))));
}
function doDisband() {
  const adm = selShips().find(s => s.type === 'admiral');
  if (adm) { G.disband(adm); toast('Flotte aufgelöst.'); refreshHud(true); }
}
function selectAllCombat() { setSel(G.ships.filter(s => s.owner === 0 && SHIPS[s.type].weapon && s.sys === viewSys)); }

/* ---------- Bauen ---------- */
function startBuild(type) {
  if (!selShips().some(s => s.type === 'builder')) return;
  build = { type };
  toast(BASES[type].planet ? 'Klicke auf einen Planeten mit freiem Bauplatz.' : BASES[type].wormhole ? 'Klicke auf ein Wurmloch.' : 'Klicke auf eine freie Stelle im Raum.');
  refreshHud(true);
}
function updateBuildGhost(wx, wy) {
  if (!build) return;
  const T = BASES[build.type];
  build.valid = false; build.pos = null; build.site = null;
  if (T.planet) {
    const p = planetAt(wx, wy);
    if (p) {
      const slot = p.slots.findIndex(x => x === null);
      const ang = -Math.PI / 2 + Math.max(0, slot) * Math.PI * 0.9 + 0.35;
      build.pos = { x: p.x + Math.cos(ang) * (p.r + 30), y: p.y + Math.sin(ang) * (p.r + 30) };
      build.site = { planet: p };
      build.valid = slot >= 0 && !(build.type === 'hq' && G.bases.some(b => b.sys === p.sys && b.type === 'hq'));
    }
  } else if (T.wormhole) {
    const h = holeAt(wx, wy, 90);
    if (h) { build.pos = { x: h.x, y: h.y }; build.site = { hole: h }; build.valid = !h.gate; }
  } else {
    build.pos = { x: wx, y: wy }; build.site = { sys: viewSys, x: wx, y: wy };
    const s = G.systems[viewSys];
    build.valid = !s.planets.some(p => Math.hypot(p.x - wx, p.y - wy) < p.r + 40) && !s.holes.some(h => Math.hypot(h.x - wx, h.y - wy) < 90);
  }
  if (!G.canAfford(0, T.cost)) build.valid = false;
}
function placeBuild(keep) {
  if (!build || !build.site) return;
  const builders = selShips().filter(s => s.type === 'builder');
  if (!builders.length) { build = null; return; }
  const p = build.pos;
  builders.sort((a, b) => (a.order.type === 'idle' ? 0 : 1) - (b.order.type === 'idle' ? 0 : 1) || (a.sys === viewSys ? Math.hypot(a.x - p.x, a.y - p.y) : 1e6) - (b.sys === viewSys ? Math.hypot(b.x - p.x, b.y - p.y) : 1e6));
  const err = G.cmdBuild(builders[0], build.type, build.site);
  if (err) { toast(err); sfx('err'); return; }
  sfx('ack');
  const T = BASES[build.type];
  const sysNet = G.factions[0].net.has(viewSys);
  if (build.type !== 'gate' && build.type !== 'hq' && !sysNet) toast(`${T.name} wird gebaut – sie wird erst operativ, wenn dieses System per Sprungtor mit deinem Netz verbunden ist oder hier ein HQ steht.`);
  if (!keep) build = null;
  refreshHud(true);
}

/* ---------- Eingabe ---------- */
let down = null, box = null;
const pointers = new Map();
let pinch = null;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  if (!running) return;
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: view().z }; down = null; return; }
  down = { x: e.clientX, y: e.clientY, btn: e.button, touch: e.pointerType === 'touch', moved: false, shift: e.shiftKey, cx: view().cx, cy: view().cy, t: performance.now() };
});
canvas.addEventListener('pointermove', (e) => {
  if (!running) return;
  const w = toWorld(e.clientX, e.clientY);
  updateBuildGhost(w.x, w.y);
  hoverTip(e.clientX, e.clientY, w);
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()]; const v = view(); v.z = pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d; clampView(v); return; }
  if (!down) return;
  const dx = e.clientX - down.x, dy = e.clientY - down.y;
  if (Math.hypot(dx, dy) > 6) down.moved = true;
  if (!down.moved) return;
  const v = view();
  if (down.btn === 2 || down.btn === 1 || down.touch) { v.cx = down.cx - dx / v.z; v.cy = down.cy - dy / v.z; clampView(v); }
  else if (down.btn === 0 && !build) box = { x: Math.min(down.x, e.clientX), y: Math.min(down.y, e.clientY), w: Math.abs(dx), h: Math.abs(dy) };
});
canvas.addEventListener('pointerup', (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (!down || !running) { down = null; return; }
  const w = toWorld(e.clientX, e.clientY);
  const d = down; down = null;
  if (d.btn === 0 && box) {
    const a = toWorld(box.x, box.y), b = toWorld(box.x + box.w, box.y + box.h);
    const inside = G.ships.filter(s => s.owner === 0 && s.sys === viewSys && s.jumpT <= 0 && s.x >= a.x && s.x <= b.x && s.y >= a.y && s.y <= b.y);
    box = null;
    if (inside.length) setSel(d.shift ? [...new Set([...selShips(), ...inside])] : inside);
    return;
  }
  if (d.moved) return;
  if (d.btn === 2) { if (build) { build = null; refreshHud(true); } else command(w.x, w.y); return; }
  if (d.btn !== 0) return;
  if (build) { placeBuild(d.shift); return; }
  const t = pick(w.x, w.y);
  if (d.touch && (!t || t.owner !== 0) && selShips().length) { command(w.x, w.y); return; }
  if (!t) { if (!d.touch) setSel([]); return; }
  if (d.shift && t.kind === 'ship' && own(t)) {
    setSel(sel.includes(t) ? sel.filter(x => x !== t) : [...selShips(), t]);
  } else if (performance.now() - (lastClick.t || 0) < 350 && lastClick.e === t && t.kind === 'ship' && own(t)) {
    setSel(G.ships.filter(s => s.owner === 0 && s.sys === viewSys && s.type === t.type));
  } else setSel([t]);
  lastClick = { t: performance.now(), e: t };
});
let lastClick = {};
canvas.addEventListener('wheel', (e) => {
  if (!running) return;
  e.preventDefault();
  const v = view(), before = toWorld(e.clientX, e.clientY);
  v.z *= e.deltaY < 0 ? 1.12 : 1 / 1.12;
  clampView(v);
  const after = toWorld(e.clientX, e.clientY);
  v.cx += before.x - after.x; v.cy += before.y - after.y; clampView(v);
}, { passive: false });

const keys = {};
addEventListener('keydown', (e) => {
  if (!running || e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  keys[e.code] = true;
  if (/^[1-9]$/.test(e.key)) {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); groups[e.key] = selShips().map(s => s.id); toast(`Gruppe ${e.key} gespeichert.`); }
    else if (groups[e.key]) { const l = groups[e.key].map(id => G.byId(id)).filter(x => x && !x.dead); setSel(l); if (l[0] && l[0].sys !== viewSys) goSystem(l[0].sys, l[0]); }
    return;
  }
  if (k === 'h') doStop();
  else if (k === 'r') doResupply();
  else if (k === 'q') doSpecial();
  else if (k === 'f' && e.shiftKey) doDisband();
  else if (k === 'f') doFleet();
  else if (k === 'g') doSelectFleet();
  else if (k === 'p') togglePause();
  else if (k === 'escape') { if (build) build = null; else setSel([]); refreshHud(true); }
  else if (k === 'tab') { e.preventDefault(); cycleSystem(); }
  else if (k === 'home') goSystem(G.homes[0]);
  else if (k === 'c') { const v = view(); v.z = fitZ(); v.cx = SYS_W / 2; v.cy = SYS_H / 2 + 40; }
  else if (k === 'k') selectAllCombat();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
function cycleSystem() {
  const ids = [...new Set(G.ships.filter(s => s.owner === 0).map(s => s.sys).concat(G.bases.filter(b => b.owner === 0).map(b => b.sys)))].sort((a, b) => a - b);
  if (!ids.length) return;
  const i = ids.indexOf(viewSys);
  goSystem(ids[(i + 1) % ids.length]);
}

/* Sektorkarte */
let sectorP = null;
function sectorHit(e) {
  if (!sectorP) return null;
  const r = sectorCv.getBoundingClientRect();
  const x = (e.clientX - r.left) * dpr, y = (e.clientY - r.top) * dpr;
  let best = null, bd = 22 * dpr;
  for (const s of G.systems) { const [px, py] = sectorP(s); const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = s.id; } }
  return best;
}
sectorCv.addEventListener('contextmenu', (e) => e.preventDefault());
sectorCv.addEventListener('pointermove', (e) => { hoverSys = sectorHit(e); });
sectorCv.addEventListener('pointerleave', () => { hoverSys = null; });
sectorCv.addEventListener('pointerup', (e) => {
  const id = sectorHit(e);
  if (id == null) return;
  if (e.button === 2 && selShips().length) {
    const s = G.systems[id];
    G.cmdMove(selShips(), id, s.star.x + 160, s.star.y + 160);
    toast(`Flug nach ${s.name}.`); sfx('ack');
  } else goSystem(id);
});

/* ---------- Tooltip ---------- */
function hoverTip(sx, sy, w) {
  const tip = $('#tip');
  if (build || down) { tip.hidden = true; return; }
  const t = pick(w.x, w.y);
  const h = !t && holeAt(w.x, w.y, 55);
  const p = !t && !h && planetAt(w.x, w.y);
  let html = '';
  if (t && t.kind === 'ship') {
    const T = SHIPS[t.type];
    html = `<b style="color:${FACTIONS[t.owner].color}">${t.type === 'admiral' ? esc(ADMIRALS[t.adm]?.name || 'Admiral') : T.name}</b><br>HP ${Math.ceil(t.hp)}/${t.maxHp}`;
    if (T.supplyMax && t.owner === 0) html += ` · Supply ${Math.floor(t.supply)}/${Math.round(G.supplyMax(t))}`;
    if (t.type === 'supply' && t.owner === 0) html += ` · Fracht ${Math.floor(t.cargo)}`;
  } else if (t && t.kind === 'base') {
    html = `<b style="color:${FACTIONS[t.owner].color}">${BASES[t.type].name}</b><br>${t.built ? (t.op ? 'operativ' : '<span style="color:#ffb84d">nicht operativ</span>') : `im Bau ${Math.round(t.progress * 100)} %`} · HP ${Math.ceil(t.hp)}`;
  } else if (h) {
    const gate = h.gate && G.byId(h.gate);
    html = `<b style="color:#c9b0ff">Wurmloch nach ${G.systems[h.to].name}</b><br>${gate ? `Sprungtor: ${FACTIONS[gate.owner].name}` : 'Kein Sprungtor'}<br><span style="opacity:.7">Rechtsklick mit Schiffen: hindurchfliegen</span>`;
  } else if (p) {
    const free = p.slots.filter(x => x === null).length;
    html = `<b>${p.name}</b><br>Ergiebigkeit ◆${p.rich.toFixed(1)} · freie Bauplätze ${free}/${p.slots.length}`;
  }
  if (!html) { tip.hidden = true; return; }
  tip.innerHTML = html; tip.hidden = false;
  tip.style.left = Math.min(innerWidth - 290, sx + 16) + 'px'; tip.style.top = (sy + 16) + 'px';
}

/* ---------- HUD ---------- */
function bar(k, color) { return `<div class="bar"><i style="width:${Math.max(0, Math.min(1, k)) * 100}%;background:${color}"></i></div>`; }
const ORDER_TXT = { idle: 'bereit', move: 'fliegt', attack: 'greift an', follow: 'folgt', build: 'baut', resupply: 'holt Nachschub' };
function refreshHud(force) {
  if (!G) return;
  const now = performance.now();
  if (!force && now - lastHud < 250) return;
  lastHud = now;
  sel = sel.filter(e => !e.dead);
  const f = G.factions[0];
  $('#res').textContent = Math.floor(f.res);
  $('#inc').textContent = `+${f.income.toFixed(1)}/s`;
  $('#units').textContent = `${G.unitCount(0)}/${UNIT_CAP}`;
  $('#time').textContent = fmtT(G.time);
  renderInfo();
  if (force || !$('#cmds').matches(':hover')) renderCmds();
}
function renderInfo() {
  const el = $('#info');
  const ships = sel.filter(e => e.kind === 'ship');
  if (!sel.length) {
    const s = G.systems[viewSys], inNet = G.factions[0].net.has(viewSys);
    el.innerHTML = `<div class="name">${s.name}</div>
      <div class="${inNet ? 'ok' : 'warn'}">${inNet ? '● Im Versorgungsnetz – Basen sind hier operativ' : '○ Nicht im Versorgungsnetz – Basen wären inaktiv'}</div>
      <div class="muted">${s.planets.map(p => `${p.name} ◆${p.rich.toFixed(1)} (${p.slots.filter(x => x === null).length} frei)`).join('<br>')}</div>
      <div class="muted">Wurmlöcher: ${s.holes.map(h => G.systems[h.to].name).join(', ')}</div>`;
    return;
  }
  if (sel.length === 1) {
    const e = sel[0], mine = own(e);
    if (e.kind === 'ship') {
      const T = SHIPS[e.type];
      let h = `<div class="name" style="color:${FACTIONS[e.owner].color}">${e.type === 'admiral' ? esc(ADMIRALS[e.adm]?.name || 'Admiral') : T.name}${mine ? '' : ' (Gegner)'}</div>`;
      h += `<div class="row">HP ${bar(e.hp / e.maxHp, '#7effaa')} ${Math.ceil(e.hp)}/${e.maxHp}</div>`;
      if (T.supplyMax && mine) { const m = G.supplyMax(e); h += `<div class="row">SUP ${bar(e.supply / m, e.supply < 1 ? '#ff5f57' : '#5ee7ff')} ${Math.floor(e.supply)}/${Math.round(m)}</div>`; }
      if (e.type === 'supply' && mine) h += `<div class="row">FRACHT ${bar(e.cargo / T.cargo, '#c9b0ff')} ${Math.floor(e.cargo)}/${T.cargo}</div>`;
      if (mine) {
        h += `<div class="muted">${ORDER_TXT[e.order.type] || ''}${e.jumpT > 0 ? ' · springt …' : ''}${e.sys !== viewSys ? ' · in ' + G.systems[e.sys].name : ''}</div>`;
        if (e.dry) h += '<div class="bad">Supply leer – Kampfkraft stark reduziert! (R = Nachschub)</div>';
        if (e.type === 'admiral') {
          const A = ADMIRALS[e.adm], n = G.ships.filter(s => s.fleet === e.id).length;
          h += `<div style="color:${A.color}">★ ${A.title}: ${A.desc}</div><div class="muted">Flotte: ${n} Schiffe · Befehlsradius ${COMMAND_RADIUS}</div>`;
        } else if (e.fleet != null) {
          const a = G.byId(e.fleet), A = a && ADMIRALS[a.adm];
          if (A) h += `<div style="color:${e.bonus ? A.color : '#888'}">★ Flotte von ${A.name}${e.bonus ? ' – Bonus aktiv' : ' – außer Reichweite'}</div>`;
        }
        if (T.special) h += `<div class="muted">Spezial (Q): ${T.special.name} – ${T.special.desc} · ${T.special.cost} Supply${e.specCd > 0 ? ` · bereit in ${Math.ceil(e.specCd)} s` : ''}</div>`;
      }
      el.innerHTML = h;
    } else {
      const T = BASES[e.type];
      let h = `<div class="name" style="color:${FACTIONS[e.owner].color}">${T.name}${mine ? '' : ' (Gegner)'}</div>`;
      h += `<div class="row">HP ${bar(e.hp / e.maxHp, '#7effaa')} ${Math.ceil(e.hp)}/${e.maxHp}</div>`;
      if (!e.built) h += `<div class="row">BAU ${bar(e.progress, '#ffd36b')} ${Math.round(e.progress * 100)} %</div>${G.ships.some(s => s.order.type === 'build' && s.order.base === e.id) ? '' : '<div class="warn">Kein Konstrukteur – Rechtsklick mit Konstrukteur zum Weiterbauen</div>'}`;
      else if (mine) h += e.op ? '<div class="ok">● Operativ</div>' : '<div class="warn">○ Nicht operativ: In diesem System fehlt ein HQ und es ist nicht per Sprungtor mit einem HQ-System verbunden.</div>';
      if (mine && e.type === 'mine') h += `<div class="muted">Förderung: +${(BASES.mine.income * e.planet.rich).toFixed(1)}/s (◆${e.planet.rich.toFixed(1)})</div>`;
      if (mine && T.supplyRange) h += `<div class="muted">Versorgt Schiffe im Umkreis von ${T.supplyRange} (${T.supplyRate}/s)</div>`;
      h += `<div class="muted">${T.desc}</div>`;
      el.innerHTML = h;
    }
    return;
  }
  const counts = {};
  for (const s of ships) { const k = s.type === 'admiral' ? 'admiral' : s.type; counts[k] = (counts[k] || 0) + 1; }
  const sup = ships.filter(s => SHIPS[s.type].supplyMax);
  const avg = sup.length ? sup.reduce((n, s) => n + s.supply / G.supplyMax(s), 0) / sup.length : 0;
  const dry = sup.filter(s => s.dry).length;
  el.innerHTML = `<div class="name">${ships.length} Schiffe</div>
    <div class="units">${Object.entries(counts).map(([k, n]) => `<span>${n}× ${SHIPS[k].name}</span>`).join('')}</div>
    ${sup.length ? `<div class="row">SUP Ø ${bar(avg, avg < 0.25 ? '#ffb84d' : '#5ee7ff')} ${Math.round(avg * 100)} %</div>` : ''}
    ${dry ? `<div class="bad">${dry} Schiff(e) ohne Supply!</div>` : ''}
    ${ships.some(s => s.bonus) ? `<div class="ok">★ Admiralsbonus aktiv bei ${ships.filter(s => s.bonus).length} Schiffen</div>` : ''}`;
}

function btn(act, label, opts = {}) {
  return `<button class="v${opts.on ? ' on' : ''}" data-act="${act}" ${opts.dis ? 'disabled' : ''} ${opts.tip ? `data-tip="${esc(opts.tip)}"` : ''}>${label}${opts.k ? `<span class="k">${opts.k}</span>` : ''}${opts.cost != null ? `<span class="cost">${opts.cost}</span>` : ''}</button>`;
}
function renderCmds() {
  const el = $('#cmds');
  const ships = selShips();
  const res = G.factions[0].res;
  let h = '';
  if (ships.length) {
    const sp = ships.find(s => SHIPS[s.type].special);
    const hasAdm = ships.some(s => s.type === 'admiral');
    const inFleet = ships.some(s => s.fleet != null || s.type === 'admiral');
    h += `<div class="lbl">BEFEHLE · Rechtsklick: Bewegen / Angreifen / Wurmloch</div><div class="grp">
      ${btn('stop', 'Halt', { k: 'H' })}${btn('resupply', 'Nachschub', { k: 'R', tip: 'Zur nächsten operativen Versorgungsbasis fliegen' })}
      ${sp ? btn('special', SHIPS[sp.type].special.name, { k: 'Q', tip: SHIPS[sp.type].special.desc + ' – kostet ' + SHIPS[sp.type].special.cost + ' Supply' }) : ''}
      ${hasAdm ? btn('fleet', 'Flotte bilden', { k: 'F', tip: 'Alle ausgewählten Schiffe dem Admiral unterstellen' }) : ''}
      ${inFleet ? btn('selfleet', 'Flotte wählen', { k: 'G' }) : ''}
      ${hasAdm ? btn('disband', 'Auflösen', { k: '⇧F' }) : ''}</div>`;
    if (ships.some(s => s.type === 'builder')) {
      h += `<div class="lbl">BAUEN${build ? ' · ' + BASES[build.type].name.toUpperCase() + ' platzieren (Rechtsklick/Esc: abbrechen)' : ''}</div><div class="grp">` +
        BUILD_ORDER.map(t => btn('build:' + t, BASES[t].name, { on: build?.type === t, dis: res < BASES[t].cost, cost: BASES[t].cost + ' RS', tip: BASES[t].desc })).join('') + '</div>';
    }
  } else if (sel.length === 1 && sel[0].kind === 'base' && own(sel[0])) {
    const b = sel[0], T = BASES[b.type];
    if (T.produces && b.built) {
      const full = G.unitCount(0) >= UNIT_CAP || b.queue.length >= 5;
      h += `<div class="lbl">PRODUKTION${b.op ? '' : ' · BASIS NICHT OPERATIV – PRODUKTION PAUSIERT'} · Rechtsklick: Sammelpunkt</div><div class="grp">` +
        T.produces.filter(t => t !== 'admiral').map(t => btn('prod:' + t, SHIPS[t].name, { dis: res < SHIPS[t].cost || full, cost: `${SHIPS[t].cost} RS · ${SHIPS[t].time}s`, tip: SHIPS[t].desc })).join('') + '</div>';
      if (T.produces.includes('admiral')) {
        h += `<div class="lbl">ADMIRÄLE (${SHIPS.admiral.cost} RS)</div><div class="grp">` + Object.entries(ADMIRALS).map(([k, A]) =>
          btn('adm:' + k, `<span style="color:${A.color}">★</span> ${A.title}`, { dis: res < SHIPS.admiral.cost || full || G.admiralTaken(0, k), cost: A.desc, tip: `${A.name}: ${A.desc}` })).join('') + '</div>';
      }
      if (b.queue.length) h += `<div class="lbl">BAUSCHLEIFE (Klick = abbrechen)</div><div class="queue">${b.queue.map((q, i) => `<div class="qi" data-act="cancel:${i}">${q.adm ? '★ ' + ADMIRALS[q.adm].title : SHIPS[q.type].name}<i style="width:${i === 0 ? Math.min(100, q.t / SHIPS[q.type].time * 100) : 0}%"></i></div>`).join('')}</div>`;
    } else h += `<div class="hint">${T.desc}</div>`;
  } else {
    h += `<div class="hint">Linksklick: auswählen · Ziehen: Rahmen · Doppelklick: alle dieses Typs · Rechtsklick: Befehl · Rechts ziehen / WASD: Ansicht verschieben · Mausrad: Zoom · Tab: nächstes System · Strg+1–9: Gruppe speichern</div>
      <div class="grp">${btn('allcombat', 'Alle Kampfschiffe hier', { k: 'K' })}${btn('home', 'Heimatsystem', { k: 'Pos1' })}</div>`;
  }
  el.innerHTML = h;
}
$('#cmds').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const [a, arg] = b.dataset.act.split(':');
  if (a === 'stop') doStop();
  if (a === 'resupply') doResupply();
  if (a === 'special') doSpecial();
  if (a === 'fleet') doFleet();
  if (a === 'selfleet') doSelectFleet();
  if (a === 'disband') doDisband();
  if (a === 'build') { build?.type === arg ? (build = null) : startBuild(arg); }
  if (a === 'prod' || a === 'adm') {
    const err = G.queueUnit(sel[0], a === 'adm' ? 'admiral' : arg, a === 'adm' ? arg : undefined);
    if (err) { toast(err); sfx('err'); } else sfx('ack');
  }
  if (a === 'cancel') G.cancelUnit(sel[0], +arg);
  if (a === 'allcombat') selectAllCombat();
  if (a === 'home') goSystem(G.homes[0]);
  refreshHud(true);
});
$('#cmds').addEventListener('pointermove', (e) => {
  const b = e.target.closest('[data-tip]'), tip = $('#tip');
  if (!b) { tip.hidden = true; return; }
  tip.innerHTML = esc(b.dataset.tip); tip.hidden = false;
  const r = b.getBoundingClientRect();
  tip.style.left = Math.min(innerWidth - 290, r.left) + 'px'; tip.style.top = (r.top - 60) + 'px';
});
$('#cmds').addEventListener('pointerleave', () => { $('#tip').hidden = true; });

/* ---------- Meldungen ---------- */
function pushLog(m) {
  const el = $('#log');
  const d = document.createElement('div');
  d.className = m.kind; d.textContent = `${fmtT(m.t)}  ${m.text}`;
  d.onclick = () => goSystem(m.sys);
  el.appendChild(d);
  while (el.children.length > 6) el.firstChild.remove();
  setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 600); }, 9000);
  if (m.kind === 'alert') { alerts[m.sys] = G.time; sfx('alert'); }
}
function toast(text) { pushLog({ text, kind: 'info', t: G ? G.time : 0, sys: viewSys }); }

/* ---------- Ton ---------- */
let actx = null, sfxBudget = 0;
function sfx(kind) {
  if (!opt.sound) return;
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (sfxBudget > 10 && kind === 'shot') return;
    sfxBudget++;
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    const P = { shot: ['square', 900, 300, 0.07, 0.03], beam: ['sawtooth', 220, 90, 0.18, 0.05], boom: ['triangle', 120, 30, 0.5, 0.18], ack: ['sine', 660, 880, 0.06, 0.05], err: ['square', 200, 140, 0.15, 0.06], alert: ['sine', 520, 380, 0.3, 0.08], done: ['sine', 523, 1046, 0.25, 0.06] }[kind];
    if (!P) return;
    o.type = P[0]; o.frequency.setValueAtTime(P[1], t); o.frequency.exponentialRampToValueAtTime(P[2], t + P[3]);
    g.gain.setValueAtTime(P[4], t); g.gain.exponentialRampToValueAtTime(0.0001, t + P[3]);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + P[3] + 0.02);
  } catch (_) {}
}
setInterval(() => { sfxBudget = 0; }, 1000);

/* ---------- Dialoge ---------- */
function dialog(html) { $('#dlgPanel').innerHTML = html; $('#dlg').hidden = false; }
$('#dlg').addEventListener('click', (e) => {
  const a = e.target.dataset?.a;
  if (!a) return;
  $('#dlg').hidden = true;
  if (a === 'menu') showStart();
  if (a === 'again') startGame();
  if (a === 'resume') { paused = false; $('#pauseBtn').classList.remove('on'); }
});
const HELP = `<h2>Anleitung</h2>
  <h3>Ziel</h3><p>Zerstöre alle feindlichen Basen und Konstrukteure. Verlierst du selbst alle Basen und Konstrukteure, ist das Spiel vorbei.</p>
  <h3>Versorgungsnetz</h3><p>Basen funktionieren nur in Systemen, die zu deinem Netz gehören: Ein System gehört dazu, wenn dort ein eigenes <b>Hauptquartier</b> steht oder wenn es über ein eigenes <b>Sprungtor</b> an einem Wurmloch mit einem Netz-System verbunden ist. Nicht operative Basen sind grau und blinken mit <span style="color:#ffb84d">!</span> – sie fördern nichts, produzieren nichts und versorgen nicht.</p>
  <h3>Supplies</h3><p>Jedes Kampfschiff hat einen Supply-Balken (cyan). Jeder Schuss und jede Spezialaktion kostet Supplies. Bei 0 wird das Schiff grau und richtet kaum noch Schaden an. Nachschub gibt es an operativen Basen (HQ, Werft, besonders Versorgungsdepot) oder von <b>Versorgungsschiffen</b>, die Schiffe in ihrer Nähe automatisch auffüllen und sich an Basen selbst wieder beladen.</p>
  <h3>Admiräle</h3><p>In der Werft baust du bis zu vier verschiedene Admiräle. Wähle Admiral + Schiffe und drücke <b>F</b> (Flotte bilden). Schiffe im Befehlsradius erhalten den Bonus und folgen dem Admiral automatisch.</p>
  <table>${Object.values(ADMIRALS).map(A => `<tr><td style="color:${A.color}">★ ${A.title}</td><td>${A.name}: ${A.desc}</td></tr>`).join('')}</table>
  <h3>Steuerung</h3>
  <table>
    <tr><td>Linksklick / Ziehen</td><td>Auswählen / Rahmenauswahl (Doppelklick: alle eines Typs)</td></tr>
    <tr><td>Rechtsklick</td><td>Bewegen, Angreifen (auf Gegner), durch Wurmloch fliegen, Baustelle weiterbauen, Versorger folgen lassen, Sammelpunkt setzen</td></tr>
    <tr><td>Rechts ziehen / WASD / Pfeile</td><td>Ansicht verschieben · Mausrad: Zoom · C: ganze Ansicht</td></tr>
    <tr><td>Sektorkarte</td><td>Klick: System ansehen · Rechtsklick: ausgewählte Schiffe dorthin schicken</td></tr>
    <tr><td>H · R · Q</td><td>Halt · Nachschub holen · Spezialaktion</td></tr>
    <tr><td>F · G · ⇧F</td><td>Flotte bilden · Flotte auswählen · Flotte auflösen</td></tr>
    <tr><td>Strg+1–9 / 1–9</td><td>Gruppe speichern / auswählen</td></tr>
    <tr><td>Tab · Pos1 · K · P</td><td>Nächstes System · Heimatsystem · alle Kampfschiffe · Pause</td></tr>
  </table>
  <h3>Tipps</h3><ul><li>Baue früh Förderstationen auf ergiebigen Planeten (◆) und eine Werft.</li><li>Sichere Nachbarsysteme mit Sprungtoren, bevor du dort Förderstationen baust.</li><li>Schicke Versorgungsschiffe mit deinen Flotten – sonst gehen ihnen bei Offensiven die Supplies aus.</li><li>Ohne Supply ist die stärkste Flotte wehrlos: Achte auf die Balken!</li></ul>`;
$('#helpBtn').onclick = () => { paused = true; dialog(HELP + '<div class="actions"><button class="v on" data-a="resume">Weiter</button></div>'); };
$('#howBtn').onclick = () => { $('#startDlg').hidden = true; dialog(HELP + '<div class="actions"><button class="v on" data-a="menu">Zurück</button></div>'); };
$('#menuBtn').onclick = () => { paused = true; dialog(`<h2>Menü</h2><p>Das laufende Spiel wird beim Verlassen beendet.</p><div class="actions"><button class="v" data-a="menu">Hauptmenü</button><button class="v" data-a="again">Neu starten</button><button class="v on" data-a="resume">Weiter</button></div>`); };
function togglePause() { paused = !paused; $('#pauseBtn').classList.toggle('on', paused); toast(paused ? 'Pause' : 'Weiter'); }
$('#pauseBtn').onclick = togglePause;
$('#speedBtn').onclick = () => { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; $('#speedBtn').textContent = speed + '×'; };
$('#soundBtn').onclick = () => { opt.sound = !opt.sound; store.set('opt', opt); $('#soundBtn').classList.toggle('on', !opt.sound); $('#soundBtn').textContent = opt.sound ? 'Ton' : 'Ton aus'; };
$('#soundBtn').textContent = opt.sound ? 'Ton' : 'Ton aus';

function gameOver() {
  running = false;
  const win = G.over.winner === 0, f = G.factions[0], e = G.factions[1];
  dialog(`<h2 style="color:${win ? '#7effaa' : '#ff5f57'}">${win ? 'Sieg' : 'Niederlage'}</h2>
    <p>${win ? 'Alle feindlichen Basen sind zerstört. Der Sektor gehört dir.' : 'Deine letzte Basis ist gefallen.'}</p>
    <table><tr><td>Spielzeit</td><td>${fmtT(G.time)}</td></tr><tr><td>Schiffe gebaut</td><td>${f.built}</td></tr>
    <tr><td>Abschüsse</td><td>${f.killed}</td></tr><tr><td>Eigene Verluste</td><td>${f.lost} Schiffe, ${f.basesLost} Basen</td></tr>
    <tr><td>Feindliche Basen zerstört</td><td>${e.basesLost}</td></tr></table>
    <div class="actions"><button class="v" data-a="menu">Hauptmenü</button><button class="v on" data-a="again">Nochmal</button></div>`);
}

/* ---------- Start ---------- */
function pickRow(el, items, cur, onPick) {
  el.innerHTML = '';
  for (const [k, label] of items) {
    const b = document.createElement('button');
    b.className = 'v' + (k === cur ? ' on' : ''); b.textContent = label;
    b.onclick = () => onPick(k);
    el.appendChild(b);
  }
}
function showStart() {
  running = false;
  $('#startDlg').hidden = false;
  for (const id of ['#top', '#sector', '#hud']) $(id).hidden = true;
  $('#log').innerHTML = '';
  pickRow($('#mapPick'), Object.entries(MAPS).map(([k, m]) => [k, m.name]), opt.map, (k) => { opt.map = k; store.set('opt', opt); showStart(); });
  pickRow($('#diffPick'), Object.entries(DIFFICULTY).map(([k, d]) => [k, d.name]), opt.diff, (k) => { opt.diff = k; store.set('opt', opt); showStart(); });
}
function startGame() {
  G = new Game({ map: opt.map, diff: opt.diff });
  ai = new AI(G, 1);
  for (const k in views) delete views[k];
  sel = []; build = null; markers.length = 0; msgSeen = 0; speed = 1; paused = false;
  $('#speedBtn').textContent = '1×'; $('#pauseBtn').classList.remove('on');
  $('#startDlg').hidden = true; $('#dlg').hidden = true;
  for (const id of ['#top', '#sector', '#hud']) $(id).hidden = false;
  resize();
  running = true;
  const home = G.systems[G.homes[0]];
  goSystem(home.id);
  const v = view(); v.cx = home.planets[0].x; v.cy = home.planets[0].y + 60; v.z = Math.max(fitZ(), 0.75); clampView(v);
  toast('Tipp: Wähle einen Konstrukteur (Doppelklick) und baue eine Förderstation auf einem Planeten mit ◆.');
  setTimeout(() => running && toast('Danach: eine Werft für Kampfschiffe und Sprungtore an den Wurmlöchern, um Nachbarsysteme anzuschließen.'), 6000);
}
$('#startBtn').onclick = startGame;

/* ---------- Schleife ---------- */
const STEP = 1 / 30;
let acc = 0, last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (running && G) {
    if (!paused && $('#dlg').hidden) {
      acc += dt * speed;
      let n = 0;
      while (acc >= STEP && n++ < 12) { ai.update(STEP); G.update(STEP); acc -= STEP; }
    }
    // Kamera per Tastatur
    const v = view(), pan = 700 * dt / v.z;
    if (keys.KeyA || keys.ArrowLeft) v.cx -= pan;
    if (keys.KeyD || keys.ArrowRight) v.cx += pan;
    if (keys.KeyW || keys.ArrowUp) v.cy -= pan;
    if (keys.KeyS || keys.ArrowDown) v.cy += pan;
    clampView(v);
    for (const m of markers) m.t += dt;
    while (markers.length && markers[0].t > 0.6) markers.shift();
    // Meldungen & Töne
    while (msgSeen < G.msgs.length) { const m = G.msgs[msgSeen++]; if (m.owner === 0) pushLog(m); }
    for (const s of G.sfx) if (s.sys === viewSys || s.kind === 'done' && s.owner === 0) sfx(s.kind);
    G.sfx.length = 0;
    const vis = visSet();
    R.draw(G, view(), { dpr, selection: sel, vis, markers, box, build, showSlots: !!build && BASES[build.type].planet });
    sectorP = R.drawSector(sectorCv, G, viewSys, vis, alerts, dpr, hoverSys);
    refreshHud(false);
    if (G.over) gameOver();
  } else {
    // Hintergrund im Menü
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 160; i++) { const x = (i * 7919 % 1000) / 1000 * canvas.width, y = (i * 104729 % 1000) / 1000 * canvas.height; ctx.globalAlpha = 0.2 + (i % 7) / 10; ctx.fillRect((x + now * 0.004 * (1 + i % 3)) % canvas.width, y, 1.5 * dpr, 1.5 * dpr); }
    ctx.globalAlpha = 1;
  }
  requestAnimationFrame(frame);
}

(async () => {
  resize();
  R = new Renderer(canvas, await loadSprites('../../assets/space/'));
  showStart();
  if (/[?&]debug\b/.test(location.search)) window.__sf = { get G() { return G; }, get ai() { return ai; }, startGame, goSystem, setSel, view, AI };
  requestAnimationFrame(frame);
})();
