/* Sternenfront – Darstellung im Vektorstil: schwarzer Raum, Linien, eingefärbte Kenney-Sprites. */
import { SYS_W, SYS_H, SHIPS, BASES, ADMIRALS, FACTIONS, COMMAND_RADIUS } from './data.js';

const PLANET_COLS = ['#9fd8ff', '#ffd39f', '#b6ffb0', '#ffb3e6', '#d6c2ff', '#ffe08a'];
const ROCKS = ['meteor_large', 'meteor_small', 'meteor_detailedLarge', 'meteor_detailedSmall', 'meteor_squareLarge', 'meteor_squareSmall'];
export const SPRITES = ['ship_J', 'ship_I', 'ship_F', 'ship_sidesB', 'ship_sidesC', 'satellite_A', 'satellite_B', 'satellite_D', 'station_A', 'station_B', 'station_C', 'enemy_D', 'icon_exclamationSmall', 'icon_plusSmall', ...ROCKS];

export function loadSprites(base) {
  const out = {};
  return Promise.all(SPRITES.map(n => new Promise(res => { const im = new Image(); im.onload = () => { out[n] = im; res(); }; im.onerror = res; im.src = base + n + '.png'; }))).then(() => out);
}

export class Renderer {
  constructor(canvas, sprites) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.sp = sprites; this.cache = new Map();
  }
  /** Sprite einfärben (Schattierung bleibt) und mit leichtem Leuchten versehen */
  tint(name, color, glow = true) {
    const key = name + color + glow;
    if (this.cache.has(key)) return this.cache.get(key);
    const im = this.sp[name];
    if (!im) return null;
    const w = im.width, h = im.height;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.drawImage(im, 0, 0);
    x.globalCompositeOperation = 'multiply'; x.fillStyle = color; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'destination-in'; x.drawImage(im, 0, 0);
    let out = c;
    if (glow) {
      const pad = 24, g = document.createElement('canvas'); g.width = w + pad * 2; g.height = h + pad * 2;
      const y = g.getContext('2d');
      y.shadowColor = color; y.shadowBlur = 14; y.drawImage(c, pad, pad); y.shadowBlur = 0; y.drawImage(c, pad, pad);
      out = g; out.pad = pad / w;
    } else out.pad = 0;
    this.cache.set(key, out);
    return out;
  }
  sprite(name, color, x, y, size, rot = 0, alpha = 1, glow = true) {
    const t = this.tint(name, color, glow);
    if (!t) return;
    const ctx = this.ctx, s = size * (1 + 2 * t.pad);
    ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); ctx.rotate(rot);
    ctx.drawImage(t, -s / 2, -s / 2, s, s);
    ctx.restore();
  }

  draw(g, view, ui) {
    const ctx = this.ctx, W = this.cv.width, H = this.cv.height, dpr = ui.dpr, z = view.z * dpr;
    const sys = g.systems[view.sys], T = g.time;
    const vis = ui.vis;
    const seen = vis.has(view.sys);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    // Sterne (Parallaxe)
    for (const st of sys.stars) {
      const x = W / 2 + (st.x - view.cx) * z * st.d, y = H / 2 + (st.y - view.cy) * z * st.d;
      if (x < 0 || y < 0 || x > W || y > H) continue;
      ctx.fillStyle = `rgba(255,255,255,${0.25 + st.b * 0.6})`;
      const r = st.b > 0.9 ? 2 : 1;
      ctx.fillRect(x, y, r * dpr, r * dpr);
    }
    ctx.setTransform(z, 0, 0, z, W / 2 - view.cx * z, H / 2 - view.cy * z);
    const lw = 1.4 / z * dpr;
    ctx.lineWidth = lw;
    // Systemgrenze
    ctx.strokeStyle = 'rgba(94,231,255,.08)'; ctx.setLineDash([12 / z * dpr, 10 / z * dpr]);
    ctx.strokeRect(0, 0, SYS_W, SYS_H); ctx.setLineDash([]);

    this.drawStar(sys.star, T, lw);
    // Asteroidengürtel
    for (const r of sys.rocks) {
      const a = r.a + T * 0.004;
      this.sprite(ROCKS[r.kind], '#8d97ab', sys.star.x + Math.cos(a) * r.r * 1.3, sys.star.y + Math.sin(a) * r.r * 0.78, 64 * r.s, r.rot + T * r.spin, 0.75, false);
    }
    // Planeten
    for (const p of sys.planets) this.drawPlanet(p, lw, ui, g);
    // Wurmlöcher & Sprungtore
    for (const h of sys.holes) this.drawHole(g, h, T, lw, ui);

    // Versorgungs- und Befehlsradien der Auswahl
    for (const e of ui.selection) {
      if (e.sys !== view.sys) continue;
      if (e.kind === 'base' && BASES[e.type].supplyRange && e.op) this.ring(e.x, e.y, BASES[e.type].supplyRange, 'rgba(94,231,255,.35)', lw, true);
      if (e.kind === 'base' && BASES[e.type].weapon) this.ring(e.x, e.y, BASES[e.type].weapon.range, 'rgba(255,255,255,.2)', lw, true);
      if (e.kind === 'ship' && e.type === 'admiral') this.ring(e.x, e.y, COMMAND_RADIUS, ADMIRALS[e.adm]?.color || '#fff', lw, true, 0.45);
      if (e.kind === 'ship' && e.type === 'supply') this.ring(e.x, e.y, SHIPS.supply.range, 'rgba(94,231,255,.4)', lw, true);
      if (e.kind === 'base' && e.rally) { ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.setLineDash([6 / z, 6 / z]); this.line(e.x, e.y, e.rally.x, e.rally.y); ctx.setLineDash([]); this.flag(e.rally.x, e.rally.y, lw); }
    }

    // Basen
    for (const b of g.bases) {
      if (b.sys !== view.sys || b.type === 'gate') continue;
      if (b.owner !== 0 && !seen && !b.seen[0]) continue;
      this.drawBase(b, T, lw, ui, b.owner !== 0 && !seen);
    }
    // Versorgungslinien
    ctx.setLineDash([3 / z * dpr, 5 / z * dpr]);
    for (const v of g.ships) {
      if (v.sys !== view.sys || !v.feeding?.length || (v.owner !== 0 && !seen)) continue;
      ctx.strokeStyle = 'rgba(94,231,255,.7)';
      for (const id of v.feeding) { const t = g.byId(id); if (t) this.line(v.x, v.y, t.x, t.y); }
    }
    ctx.setLineDash([]);
    // Befehlslinien der Auswahl
    for (const e of ui.selection) {
      if (e.kind !== 'ship' || e.sys !== view.sys) continue;
      const o = e.order;
      if (o.type === 'move' && o.sys === view.sys) { ctx.strokeStyle = 'rgba(126,255,170,.35)'; this.line(e.x, e.y, o.x, o.y); }
      if (o.type === 'attack') { const t = g.byId(o.target); if (t && t.sys === e.sys) { ctx.strokeStyle = 'rgba(255,95,87,.45)'; this.line(e.x, e.y, t.x, t.y); } }
      if (o.type === 'build') { const t = g.byId(o.base); if (t && t.sys === e.sys) { ctx.strokeStyle = 'rgba(255,224,138,.5)'; this.line(e.x, e.y, t.x, t.y); } }
    }
    // Schiffe
    const sel = new Set(ui.selection);
    for (const s of g.ships) {
      if (s.sys !== view.sys) continue;
      if (s.owner !== 0 && !seen) continue;
      this.drawShip(g, s, T, lw, sel.has(s), ui);
    }
    // Geschosse
    for (const p of g.shots) {
      if (p.sys !== view.sys) continue;
      ctx.strokeStyle = p.color; ctx.lineWidth = (p.big ? 3 : 1.8) / z * dpr;
      this.line(p.x - (p.dx || 0) * (p.big ? 6 : 10), p.y - (p.dy || 0) * (p.big ? 6 : 10), p.x, p.y);
      if (p.big) this.ring(p.x, p.y, 5, p.color, lw);
    }
    ctx.lineWidth = lw;
    for (const f of g.fx) if (f.sys === view.sys) this.drawFx(f, lw, z);
    // UI-Marker (Bewegungsbefehle)
    for (const m of ui.markers) {
      if (m.sys !== view.sys) continue;
      const k = m.t / 0.6;
      this.ring(m.x, m.y, 8 + k * 18, m.color.replace('A', String(1 - k)), lw);
    }
    // Bauvorschau
    if (ui.build && ui.build.pos) {
      const b = ui.build, col = b.valid ? 'rgba(126,255,170,.9)' : 'rgba(255,95,87,.9)';
      if (b.type === 'gate') this.ring(b.pos.x, b.pos.y, 62, col, lw, true);
      else this.sprite(BASES[b.type].sprite, b.valid ? '#7effaa' : '#ff5f57', b.pos.x, b.pos.y, BASES[b.type].size * 1.6, 0, 0.6);
      if (BASES[b.type].supplyRange) this.ring(b.pos.x, b.pos.y, BASES[b.type].supplyRange, col, lw, true, 0.3);
      if (BASES[b.type].weapon) this.ring(b.pos.x, b.pos.y, BASES[b.type].weapon.range, col, lw, true, 0.3);
    }
    // Auswahlrechteck
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (ui.box) {
      ctx.strokeStyle = 'rgba(126,255,170,.9)'; ctx.lineWidth = 1 * dpr; ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.strokeRect(ui.box.x * dpr, ui.box.y * dpr, ui.box.w * dpr, ui.box.h * dpr); ctx.setLineDash([]);
    }
    if (!seen) {
      ctx.font = `${13 * dpr}px ui-monospace, Menlo, monospace`; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.fillText('KEINE AUFKLÄRUNG – FEINDLICHE SCHIFFE UNSICHTBAR', W / 2, 70 * dpr);
    }
  }

  line(x1, y1, x2, y2) { const c = this.ctx; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
  ring(x, y, r, color, lw, dashed = false, alpha = 1) {
    const c = this.ctx; c.save(); c.globalAlpha *= alpha; c.strokeStyle = color; c.lineWidth = lw;
    if (dashed) c.setLineDash([lw * 6, lw * 5]);
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke(); c.restore();
  }
  flag(x, y, lw) { const c = this.ctx; c.strokeStyle = '#fff'; c.lineWidth = lw; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 26); c.lineTo(x + 14, y - 20); c.lineTo(x, y - 14); c.stroke(); }
  text(t, x, y, size, color, align = 'center') {
    const c = this.ctx; c.save(); c.fillStyle = color; c.font = `${size}px ui-monospace, Menlo, monospace`; c.textAlign = align; c.fillText(t, x, y); c.restore();
  }

  drawStar(st, T, lw) {
    const c = this.ctx;
    const g = c.createRadialGradient(st.x, st.y, 0, st.x, st.y, st.r * 4);
    g.addColorStop(0, 'rgba(255,230,160,.35)'); g.addColorStop(1, 'rgba(255,230,160,0)');
    c.fillStyle = g; c.beginPath(); c.arc(st.x, st.y, st.r * 4, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#ffe9a8';
    c.beginPath(); c.arc(st.x, st.y, st.r, 0, Math.PI * 2); c.stroke();
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2 + T * 0.05, l = st.r * (1.4 + (i % 2) * 0.5 + Math.sin(T * 2 + i) * 0.1);
      this.line(st.x + Math.cos(a) * st.r * 1.15, st.y + Math.sin(a) * st.r * 1.15, st.x + Math.cos(a) * l, st.y + Math.sin(a) * l);
    }
  }

  drawPlanet(p, lw, ui, g) {
    const c = this.ctx, col = PLANET_COLS[Math.floor(p.hue * PLANET_COLS.length)];
    c.strokeStyle = col; c.lineWidth = lw * 1.3;
    c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.stroke();
    c.save(); c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.clip();
    c.lineWidth = lw; c.globalAlpha = 0.45;
    for (let k = -2; k <= 2; k++) { c.beginPath(); c.ellipse(p.x, p.y + k * p.r * 0.38, p.r, p.r * 0.18, 0, 0, Math.PI * 2); c.stroke(); }
    c.restore();
    if (p.ring) { c.globalAlpha = 0.7; c.beginPath(); c.ellipse(p.x, p.y, p.r * 1.75, p.r * 0.42, -0.35, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1; }
    this.text(`${p.name}  ◆${p.rich.toFixed(1)}`, p.x, p.y + p.r + 22, 13, 'rgba(255,255,255,.55)');
    // freie Bauplätze anzeigen, wenn gebaut wird
    if (ui.showSlots) p.slots.forEach((id, i) => {
      if (id !== null) return;
      const ang = -Math.PI / 2 + i * Math.PI * 0.9 + 0.35, off = p.r + 30;
      this.ring(p.x + Math.cos(ang) * off, p.y + Math.sin(ang) * off, 10, 'rgba(126,255,170,.8)', lw, true);
    });
  }

  drawHole(g, h, T, lw, ui) {
    const c = this.ctx;
    c.save(); c.translate(h.x, h.y);
    for (let i = 0; i < 4; i++) {
      c.strokeStyle = `rgba(179,140,255,${0.85 - i * 0.18})`; c.lineWidth = lw * (1.6 - i * 0.25);
      c.setLineDash([lw * 10, lw * 6]); c.lineDashOffset = -T * (20 + i * 12);
      c.beginPath(); c.ellipse(0, 0, 40 - i * 8, 26 - i * 5, T * 0.3 + i * 0.6, 0, Math.PI * 2); c.stroke();
    }
    c.setLineDash([]);
    c.restore();
    this.text('⇄ ' + g.systems[h.to].name.toUpperCase(), h.x, h.y + 82, 13, 'rgba(201,176,255,.85)');
    const gate = h.gate && g.byId(h.gate);
    if (gate && (gate.owner === 0 || ui.vis.has(h.sys) || gate.seen[0])) {
      const col = FACTIONS[gate.owner].color;
      c.save(); c.translate(h.x, h.y); c.rotate(T * 0.1);
      c.strokeStyle = col; c.lineWidth = lw * 1.6; c.globalAlpha = gate.built ? 1 : 0.5;
      if (!gate.built) c.setLineDash([lw * 5, lw * 5]);
      c.beginPath();
      for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI * 2; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 60, Math.sin(a) * 60); }
      c.stroke();
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; this.line(Math.cos(a) * 60, Math.sin(a) * 60, Math.cos(a) * 72, Math.sin(a) * 72); }
      c.restore();
      if (!gate.built) this.progress(h.x, h.y, 76, gate.progress, col, lw);
      if (ui.selection.includes(gate) || gate.hp < gate.maxHp * 0.99) this.bar(h.x, h.y - 84, 70, gate.hp / gate.maxHp, '#7effaa');
      if (ui.selection.includes(gate)) this.brackets(h.x, h.y, 70, col, lw);
    }
  }

  drawBase(b, T, lw, ui, ghost) {
    const T2 = BASES[b.type], col = FACTIONS[b.owner].color, sel = ui.selection.includes(b);
    let alpha = ghost ? 0.3 : b.built ? (b.op ? 1 : 0.5) : 0.35;
    this.sprite(T2.sprite, col, b.x, b.y, T2.size * 1.6, b.type === 'turret' ? b.a + Math.PI / 2 : T * 0.08, alpha);
    if (!b.built) this.progress(b.x, b.y, T2.size + 8, b.progress, col, lw);
    if (b.built && !b.op && !ghost) {
      this.ring(b.x, b.y, T2.size + 10, '#ffb84d', lw, true);
      if (Math.floor(T * 2) % 2 === 0) this.sprite('icon_exclamationSmall', '#ffb84d', b.x + T2.size * 0.8, b.y - T2.size * 0.8, 26, 0, 1, false);
    }
    if (b.queue?.length && b.op) this.progress(b.x, b.y, T2.size + 4, b.queue[0].t / SHIPS[b.queue[0].type].time, '#ffffff', lw, 0.5);
    if (sel) this.brackets(b.x, b.y, T2.size + 6, col, lw);
    if (sel || b.hp < b.maxHp * 0.99) this.bar(b.x, b.y - T2.size - 14, T2.size * 1.6, b.hp / b.maxHp, '#7effaa');
  }

  drawShip(g, s, T, lw, sel, ui) {
    const ST = SHIPS[s.type], col = FACTIONS[s.owner].color;
    let size = ST.size * 2, alpha = 1;
    if (s.jumpT > 0) { const k = s.jumpT / (s.jumpMax || 1); size *= Math.max(0.05, k); alpha = k; }
    this.sprite(ST.sprite, s.dry ? '#8a8a8a' : col, s.x, s.y, size, s.a + Math.PI / 2, alpha);
    // Triebwerk
    const sp = Math.hypot(s.vx, s.vy);
    if (sp > 15 && s.jumpT <= 0) {
      const c = this.ctx; c.strokeStyle = s.boost > 0 ? '#ffd36b' : 'rgba(255,255,255,.6)';
      const l = ST.size * (0.4 + sp / 200) * (s.boost > 0 ? 2 : 1);
      this.line(s.x - Math.cos(s.a) * ST.size * 0.8, s.y - Math.sin(s.a) * ST.size * 0.8, s.x - Math.cos(s.a) * (ST.size * 0.8 + l), s.y - Math.sin(s.a) * (ST.size * 0.8 + l));
    }
    if (s.jumpT > 0) return;
    if (sel) this.brackets(s.x, s.y, ST.size + 4, col, lw);
    // Balken: HP und (bei eigenen Schiffen) Supply bzw. Fracht
    const w = Math.max(22, ST.size * 1.6), y = s.y - ST.size - 10;
    const showHp = s.owner === 0 || s.hp < s.maxHp;
    if (showHp) this.bar(s.x, y, w, s.hp / s.maxHp, '#7effaa');
    if (s.owner === 0) {
      if (ST.supplyMax) {
        const m = g.supplyMax(s), k = m ? s.supply / m : 0;
        this.bar(s.x, y + 4, w, k, k <= 0.01 ? '#ff5f57' : k < 0.25 ? '#ffb84d' : '#5ee7ff');
      } else if (s.type === 'supply') this.bar(s.x, y + 4, w, s.cargo / ST.cargo, '#c9b0ff');
    }
    if (s.dry && Math.floor(T * 3) % 2 === 0) this.text('SUPPLY 0', s.x, s.y + ST.size + 16, 10, '#ff5f57');
    // Flottenzugehörigkeit
    if (s.type === 'admiral') {
      const A = ADMIRALS[s.adm];
      this.text('★ ' + (A?.title || '').toUpperCase(), s.x, s.y + ST.size + 16, 10, A?.color || '#fff');
    } else if (s.fleet != null) {
      const a = g.byId(s.fleet), A = a && ADMIRALS[a.adm];
      if (A) { this.ctx.fillStyle = s.bonus ? A.color : 'rgba(255,255,255,.35)'; this.ctx.beginPath(); this.ctx.arc(s.x + w / 2 + 5, y + 2, 2.6, 0, 7); this.ctx.fill(); }
    }
  }

  bar(x, y, w, k, color) {
    const c = this.ctx, h = 2.6;
    c.fillStyle = 'rgba(255,255,255,.15)'; c.fillRect(x - w / 2, y, w, h);
    c.fillStyle = k < 0.3 && color === '#7effaa' ? '#ff5f57' : k < 0.6 && color === '#7effaa' ? '#ffd36b' : color;
    c.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, k)), h);
  }
  progress(x, y, r, k, color, lw, alpha = 1) {
    const c = this.ctx; c.save(); c.globalAlpha *= alpha; c.strokeStyle = color; c.lineWidth = lw * 2;
    c.beginPath(); c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, k))); c.stroke(); c.restore();
  }
  brackets(x, y, r, color, lw) {
    const c = this.ctx, l = r * 0.45;
    c.strokeStyle = color; c.lineWidth = lw * 1.2;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      c.beginPath(); c.moveTo(x + sx * r, y + sy * (r - l)); c.lineTo(x + sx * r, y + sy * r); c.lineTo(x + sx * (r - l), y + sy * r); c.stroke();
    }
  }

  drawFx(f, lw, z) {
    const c = this.ctx, k = f.t / f.life;
    c.save();
    c.globalAlpha = 1 - k;
    c.strokeStyle = f.color;
    if (f.kind === 'beam') { c.lineWidth = lw * 2.5; this.line(f.x, f.y, f.x2, f.y2); }
    else if (f.kind === 'spark') { const r = 4 + k * 6; this.line(f.x - r, f.y, f.x + r, f.y); this.line(f.x, f.y - r, f.x, f.y + r); }
    else if (f.kind === 'ring') this.ring(f.x, f.y, f.r + (f.max - f.r) * k, f.color, lw);
    else if (f.kind === 'jump') { for (let i = 0; i < 3; i++) this.ring(f.x, f.y, 10 + k * (40 + i * 25), f.color, lw * 1.5); }
    else if (f.kind === 'boom') {
      // Trümmerlinien wie bei Asteroids
      let s = f.seed;
      const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
      const n = f.big ? 18 : 10;
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, sp = 0.4 + rnd(), len = (f.big ? 16 : 8) * (0.5 + rnd()), rot = a + k * (rnd() - 0.5) * 8;
        const d = f.r * sp * (0.2 + k * 1.2);
        const cx = f.x + Math.cos(a) * d, cy = f.y + Math.sin(a) * d;
        c.lineWidth = lw * 1.5;
        this.line(cx - Math.cos(rot) * len / 2, cy - Math.sin(rot) * len / 2, cx + Math.cos(rot) * len / 2, cy + Math.sin(rot) * len / 2);
      }
      this.ring(f.x, f.y, f.r * (0.3 + k), '#fff', lw);
      if (k < 0.2) { c.globalAlpha = (0.2 - k) * 4; c.fillStyle = '#fff'; c.beginPath(); c.arc(f.x, f.y, f.r * 0.5, 0, 7); c.fill(); }
    }
    c.restore();
  }

  /* ---------- Sektorkarte ---------- */
  drawSector(cv, g, viewSys, vis, alerts, dpr, hoverSys) {
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, pad = 22 * dpr;
    const P = (s) => [pad + s.mx * (W - pad * 2), pad + s.my * (H - pad * 2)];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1.5 * dpr;
    for (const [a, b] of g.links) {
      const A = g.systems[a], B = g.systems[b];
      const ha = g.holeTo(a, b), hb = ha.pair;
      const owners = new Set([ha.gate, hb.gate].map(id => id && g.byId(id)).filter(x => x && x.built && (x.owner === 0 || x.seen[0])).map(x => x.owner));
      ctx.strokeStyle = owners.has(0) && owners.has(1) ? '#ffd36b' : owners.has(0) ? FACTIONS[0].color : owners.has(1) ? FACTIONS[1].color : 'rgba(179,140,255,.45)';
      ctx.setLineDash(owners.size ? [] : [4 * dpr, 4 * dpr]);
      const [x1, y1] = P(A), [x2, y2] = P(B);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.setLineDash([]);
    const T = g.time;
    for (const s of g.systems) {
      const [x, y] = P(s), r = 11 * dpr;
      const myB = g.bases.some(b => b.sys === s.id && b.owner === 0);
      const enB = g.bases.some(b => b.sys === s.id && b.owner === 1 && (vis.has(s.id) || b.seen[0]));
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      ctx.lineWidth = 2 * dpr;
      if (myB && enB) { ctx.strokeStyle = FACTIONS[0].color; ctx.beginPath(); ctx.arc(x, y, r, Math.PI / 2, Math.PI * 1.5); ctx.stroke(); ctx.strokeStyle = FACTIONS[1].color; ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2); ctx.stroke(); }
      else { ctx.strokeStyle = myB ? FACTIONS[0].color : enB ? FACTIONS[1].color : 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); }
      if (g.factions[0].net.has(s.id)) { ctx.fillStyle = FACTIONS[0].color; ctx.beginPath(); ctx.arc(x, y, 3 * dpr, 0, 7); ctx.fill(); }
      if (s.id === viewSys) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1 * dpr; ctx.beginPath(); ctx.arc(x, y, r + 5 * dpr, 0, 7); ctx.stroke(); }
      if (s.id === hoverSys) { ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1 * dpr; ctx.beginPath(); ctx.arc(x, y, r + 8 * dpr, 0, 7); ctx.stroke(); }
      if (alerts[s.id] && T - alerts[s.id] < 8 && Math.floor(T * 3) % 2 === 0) { ctx.strokeStyle = '#ff5f57'; ctx.lineWidth = 2 * dpr; ctx.beginPath(); ctx.arc(x, y, r + 9 * dpr, 0, 7); ctx.stroke(); }
      ctx.font = `${10 * dpr}px ui-monospace, Menlo, monospace`; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillText(s.name.toUpperCase(), x, y + r + 12 * dpr);
      const mine = g.ships.filter(sh => sh.sys === s.id && sh.owner === 0).length;
      const foe = vis.has(s.id) ? g.ships.filter(sh => sh.sys === s.id && sh.owner === 1).length : 0;
      ctx.font = `bold ${10 * dpr}px ui-monospace, Menlo, monospace`;
      if (mine) { ctx.fillStyle = FACTIONS[0].color; ctx.textAlign = 'right'; ctx.fillText(mine, x - r - 3 * dpr, y - r + 2 * dpr); }
      if (foe) { ctx.fillStyle = FACTIONS[1].color; ctx.textAlign = 'left'; ctx.fillText(foe, x + r + 3 * dpr, y - r + 2 * dpr); }
    }
    return P;
  }
}
