/* Rennen – Streckendefinitionen (Mittellinie als gleichmäßig verteilte Punkte). */
(function (root) {
  'use strict';
  const SPACING = 8;      // Abstand der Stützpunkte in Welt-Pixeln
  const WIDTH = 150;      // Fahrbahnbreite

  function resample(pts, spacing) {
    const out = [];
    const n = pts.length;
    let carry = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      let d = carry;
      while (d < len) {
        const t = d / len;
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        d += spacing;
      }
      carry = d - len;
    }
    return out;
  }

  // Polygon mit abgerundeten Ecken (Ecken als quadratische Bézierkurven)
  function roundedPolygon(P, r) {
    const out = [];
    const n = P.length;
    const unit = (a, b) => { const l = Math.hypot(b.x - a.x, b.y - a.y); return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };
    for (let i = 0; i < n; i++) {
      const p = P[i], prev = P[(i - 1 + n) % n], next = P[(i + 1) % n];
      const u1 = unit(p, prev), u2 = unit(p, next);
      const a = { x: p.x + u1.x * r, y: p.y + u1.y * r };
      const b = { x: p.x + u2.x * r, y: p.y + u2.y * r };
      for (let k = 0; k <= 24; k++) {
        const t = k / 24, m = 1 - t;
        out.push({ x: m * m * a.x + 2 * m * t * p.x + t * t * b.x, y: m * m * a.y + 2 * m * t * p.y + t * t * b.y });
      }
    }
    return out;
  }

  function rotateTo(samples, target) {
    let best = 0, bd = Infinity;
    samples.forEach((s, i) => { const d = (s.x - target.x) ** 2 + (s.y - target.y) ** 2; if (d < bd) { bd = d; best = i; } });
    return samples.slice(best).concat(samples.slice(0, best));
  }

  function finish(def, raw, start) {
    let s = resample(raw, SPACING);
    s = rotateTo(s, start);
    // Tangenten & Normalen
    const N = s.length;
    for (let i = 0; i < N; i++) {
      const a = s[(i - 2 + N) % N], b = s[(i + 2) % N];
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      s[i].tx = (b.x - a.x) / l; s[i].ty = (b.y - a.y) / l;
      s[i].nx = -s[i].ty; s[i].ny = s[i].tx;   // zeigt nach rechts in Fahrtrichtung
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of s) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
    const M = 380;
    // Weltkoordinaten so verschieben, dass alles bei (M, M) beginnt
    for (const p of s) { p.x += M - minX; p.y += M - minY; }
    let length = 0;
    for (let i = 0; i < N; i++) { const b = s[(i + 1) % N]; length += Math.hypot(b.x - s[i].x, b.y - s[i].y); }
    return { ...def, samples: s, width: WIDTH, worldW: maxX - minX + 2 * M, worldH: maxY - minY + 2 * M, length };
  }

  function oval() {
    const P = [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 1000 }, { x: 0, y: 1000 }];
    return finish({ id: 'oval', name: 'Oval', desc: 'Zwei lange Geraden, zwei weite Kurven – Vollgas!' }, roundedPolygon(P, 500), { x: 1000, y: 0 });
  }

  function lShape() {
    const P = [{ x: 0, y: 0 }, { x: 2100, y: 0 }, { x: 2100, y: 800 }, { x: 950, y: 800 }, { x: 950, y: 1800 }, { x: 0, y: 1800 }];
    return finish({ id: 'l', name: 'L-Kurs', desc: 'Sechs Ecken, darunter eine enge Innenkurve.' }, roundedPolygon(P, 340), { x: 1050, y: 0 });
  }

  function eight() {
    const raw = [];
    const A = 1150, B = 1200;
    for (let i = 0; i < 720; i++) {
      const t = i / 720 * Math.PI * 2;
      raw.push({ x: A * Math.sin(t), y: B * Math.sin(t) * Math.cos(t) });
    }
    return finish({ id: 'acht', name: 'Acht', desc: 'Achterbahn mit Kreuzung in der Mitte – Vorsicht!' }, raw, { x: A * Math.SQRT1_2, y: B * 0.5 });
  }

  const TRACKS = [oval(), lShape(), eight()];
  const api = { TRACKS, SPACING };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RaceTracks = api;
})(typeof window !== 'undefined' ? window : globalThis);
