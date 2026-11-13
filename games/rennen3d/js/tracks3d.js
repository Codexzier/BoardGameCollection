/* Rennen 3D – Strecken (aus dem 2D-Rennen übernommen, in Meter umgerechnet) und Platzierung der Kulisse. */
const K = 0.12;          // Pixel des 2D-Kurses → Meter (Strecke 1,5× gestreckt)
export const ROAD_W = 12; // Fahrbahnbreite in Metern

export function rng(seed) {
  let a = 0;
  for (const ch of seed) a = (a * 31 + ch.charCodeAt(0)) | 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function convert(t2) {
  const s = t2.samples.map(p => ({ x: p.x * K, z: p.y * K, tx: p.tx, tz: p.ty, nx: p.nx, nz: p.ny }));
  const N = s.length;
  let len = 0;
  for (let i = 0; i < N; i++) { const b = s[(i + 1) % N]; s[i].d = len; len += Math.hypot(b.x - s[i].x, b.z - s[i].z); }
  const spacing = len / N;
  // Krümmung (Vorzeichen: >0 Rechtskurve) über ~18 m
  const L = Math.max(4, Math.round(18 / spacing));
  for (let i = 0; i < N; i++) {
    const a = s[(i - L + N) % N], b = s[(i + L) % N];
    s[i].curv = a.tx * b.tz - a.tz * b.tx;
  }
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const p of s) { minX = Math.min(minX, p.x); minZ = Math.min(minZ, p.z); maxX = Math.max(maxX, p.x); maxZ = Math.max(maxZ, p.z); }
  return {
    id: t2.id, name: t2.name, desc: t2.desc, samples: s, N, spacing, length: len, width: ROAD_W,
    bounds: { minX: minX - 60, minZ: minZ - 60, maxX: maxX + 60, maxZ: maxZ + 60 },
    center: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 },
  };
}

export function minDistTrack(tr, x, z, step = 3) {
  let d = Infinity;
  const s = tr.samples;
  for (let i = 0; i < s.length; i += step) d = Math.min(d, (s[i].x - x) ** 2 + (s[i].z - z) ** 2);
  return Math.sqrt(d);
}

/** Deko, Lichter, Kameras – immer gleich pro Strecke */
function layout(tr) {
  const rand = rng(tr.id + '3d');
  const s = tr.samples, N = tr.N, W = tr.width;
  const props = [], solids = [], lamps = [], cams = [];
  const free = (x, z, need) => minDistTrack(tr, x, z, 2) > need && props.every(p => Math.hypot(p.x - x, p.z - z) > (p.r || 3) + 3);
  const at = (i, side, off) => { const p = s[(i + N) % N]; return { x: p.x + p.nx * side * off, z: p.z + p.nz * side * off, p }; };
  const faceRoad = (x, z, p) => Math.atan2(p.x - x, p.z - z); // lokale +Z-Achse zeigt zur Strecke

  // Startbrücke
  const s0 = s[0];
  props.push({ m: 'overheadLights', x: s0.x, z: s0.z, rot: Math.atan2(-s0.nz, s0.nx), scale: (W + 4) / 1.26, r: 0, gantry: true });
  for (const side of [-1, 1]) solids.push({ x: s0.x + s0.nx * side * (W / 2 + 1.6), z: s0.z + s0.nz * side * (W / 2 + 1.6), r: 0.8 });

  // Seite mit mehr Platz an der Startgeraden: Tribünen, gegenüber Boxengaragen
  const test = (side) => { let d = 0; for (let k = -40; k <= 40; k += 10) { const q = at(k, side, W / 2 + 18); d += Math.min(40, minDistTrack(tr, q.x, q.z)); } return d; };
  const side = test(1) >= test(-1) ? 1 : -1;
  const stride = Math.max(1, Math.round(9.2 / tr.spacing));
  for (let k = -3; k <= 3; k++) {
    const q = at(k * stride + 4, side, W / 2 + 11);
    if (!free(q.x, q.z, W / 2 + 7)) continue;
    props.push({ m: k % 3 === 0 ? 'grandStandAwning' : 'grandStandCovered', x: q.x, z: q.z, rot: faceRoad(q.x, q.z, q.p), scale: 9, r: 5, stand: true });
    solids.push({ x: q.x, z: q.z, r: 5.2 });
  }
  for (let k = -2; k <= 2; k++) {
    const q = at(k * stride + 2, -side, W / 2 + 10);
    if (!free(q.x, q.z, W / 2 + 6)) continue;
    props.push({ m: k === 0 ? 'pitsOffice' : 'pitsGarage', x: q.x, z: q.z, rot: faceRoad(q.x, q.z, q.p), scale: 9, r: 5 });
    solids.push({ x: q.x, z: q.z, r: 5 });
  }
  for (const k of [-6, 6]) {
    const q = at(k * stride, -side, W / 2 + 8);
    if (free(q.x, q.z, W / 2 + 5)) props.push({ m: k < 0 ? 'tentLong' : 'tent', x: q.x, z: q.z, rot: faceRoad(q.x, q.z, q.p), scale: 6, r: 4 });
  }
  for (const k of [-1, 1]) {
    const q = at(k * 14, side, W / 2 + 3.5);
    props.push({ m: 'flagCheckers', x: q.x, z: q.z, rot: faceRoad(q.x, q.z, q.p) + Math.PI / 2, scale: 4, r: 1 });
  }

  // Kurven: Banden außen, Banner/Fahnen, Werbetafeln
  const segLen = 6;
  const step = Math.max(1, Math.round(segLen / tr.spacing));
  for (let i = 0; i < N; i += step) {
    const c = s[i].curv;
    if (Math.abs(c) < 0.32) continue;
    const out = -Math.sign(c);
    const q = at(i, out, W / 2 + 3.2);
    if (minDistTrack(tr, q.x, q.z, 2) < W / 2 + 2) continue;
    const p = s[i];
    props.push({ m: 'barrierWall', x: q.x, z: q.z, rot: Math.atan2(-p.tz, p.tx) + Math.PI, scale: segLen / 0.98, r: 0, barrier: true });
    solids.push({ x: q.x, z: q.z, r: 1.6 }, { x: q.x + p.tx * 2, z: q.z + p.tz * 2, r: 1.3 }, { x: q.x - p.tx * 2, z: q.z - p.tz * 2, r: 1.3 });
  }
  let lastBanner = -1e9;
  for (let i = 0; i < N; i += step) {
    const c = s[i].curv;
    if (Math.abs(c) < 0.5 || s[i].d - lastBanner < 70) continue;
    const out = -Math.sign(c);
    const q = at(i, out, W / 2 + 9);
    if (!free(q.x, q.z, W / 2 + 6)) continue;
    lastBanner = s[i].d;
    const m = rand() < 0.5 ? 'billboard' : (rand() < 0.5 ? 'bannerTowerRed' : 'bannerTowerGreen');
    props.push({ m, x: q.x, z: q.z, rot: faceRoad(q.x, q.z, q.p), scale: m === 'billboard' ? 8 : 6, r: 3 });
    solids.push({ x: q.x, z: q.z, r: 2.4 });
  }

  // Lichtmasten entlang der Strecke (jeweils außen)
  const lampStep = Math.max(1, Math.round(42 / tr.spacing));
  for (let i = Math.round(lampStep / 2); i < N; i += lampStep) {
    const c = s[i].curv;
    const out = Math.abs(c) > 0.05 ? -Math.sign(c) : (Math.floor(i / lampStep) % 2 ? 1 : -1);
    let q = at(i, out, W / 2 + 4.2), sideUsed = out;
    if (!free(q.x, q.z, W / 2 + 3.5)) { q = at(i, -out, W / 2 + 4.2); sideUsed = -out; if (!free(q.x, q.z, W / 2 + 3.5)) continue; }
    const rot = faceRoad(q.x, q.z, q.p);
    props.push({ m: 'lightPostModern', x: q.x, z: q.z, rot, scale: 11.5, r: 1, lamp: true });
    solids.push({ x: q.x, z: q.z, r: 0.6 });
    // Lampenkopf ragt über die Fahrbahn
    lamps.push({ x: q.x + Math.sin(rot) * 1.9, z: q.z + Math.cos(rot) * 1.9, y: 8.7, side: sideUsed });
  }

  // TV-Kamerapositionen für das Replay (mit Kamera-Requisite)
  const camStep = Math.max(1, Math.round(tr.length / 9 / tr.spacing));
  for (let i = Math.round(camStep * 0.3); i < N; i += camStep) {
    const c = s[i].curv;
    const out = Math.abs(c) > 0.05 ? -Math.sign(c) : (rand() < 0.5 ? 1 : -1);
    for (const off of [W / 2 + 7, W / 2 + 11, W / 2 + 15]) {
      const q = at(i, out, off);
      if (!free(q.x, q.z, W / 2 + 5)) continue;
      props.push({ m: 'camera_exclusive', x: q.x, z: q.z, rot: faceRoad(q.x, q.z, q.p), scale: 4, r: 1.5 });
      cams.push({ x: q.x, z: q.z, i, y: 2.2 + rand() * 3.5 });
      break;
    }
  }

  // Bäume: innerhalb und rund um die Strecke
  const b = tr.bounds;
  let tries = 0, trees = 0;
  while (tries++ < 900 && trees < 95) {
    const x = b.minX - 40 + rand() * (b.maxX - b.minX + 80), z = b.minZ - 40 + rand() * (b.maxZ - b.minZ + 80);
    if (!free(x, z, W / 2 + 14) || props.some(p => p.tree && Math.hypot(p.x - x, p.z - z) < 11)) continue;
    const big = rand() < 0.6;
    props.push({ m: big ? 'treeLarge' : 'treeSmall', x, z, rot: rand() * 6.28, scale: (big ? 7.5 : 7) * (0.8 + rand() * 0.45), r: 3, tree: true });
    solids.push({ x, z, r: big ? 1.1 : 0.9 });
    trees++;
  }
  // Pylonen an den Kurveninnenseiten
  for (let i = 0; i < N; i += step * 3) {
    const c = s[i].curv;
    if (Math.abs(c) < 0.45) continue;
    const q = at(i, Math.sign(c), W / 2 + 2.2);
    if (minDistTrack(tr, q.x, q.z, 2) < W / 2 + 1.5) continue;
    props.push({ m: 'pylon', x: q.x, z: q.z, rot: 0, scale: 5, r: 0.5 });
  }
  return { props, solids, lamps, cams };
}

export function buildTracks() {
  return window.RaceTracks.TRACKS.map(t2 => {
    const tr = convert(t2);
    Object.assign(tr, layout(tr));
    return tr;
  });
}
