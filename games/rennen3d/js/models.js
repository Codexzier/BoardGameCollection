/* Rennen 3D – Kenney-Racing-Kit-Modelle laden, ausrichten und Fahrzeuge mit Lichtern erzeugen. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = '../../assets/racing3d/';
export const CAR_COLORS = {
  Red: { name: 'Rot', hex: '#e8554f' }, Orange: { name: 'Orange', hex: '#f08a3c' },
  Green: { name: 'Grün', hex: '#3fa86e' }, White: { name: 'Weiß', hex: '#eef0f4' },
};
// Verankerung: 'center' = Mitte unten, 'pole' = Mast steht im Ursprung (Arm zeigt nach +Z)
const MODELS = {
  overheadLights: 'center', lightPostModern: 'pole', grandStandCovered: 'center', grandStandAwning: 'center',
  treeLarge: 'center', treeSmall: 'center', barrierWall: 'center', flagCheckers: 'center', pylon: 'center',
  tent: 'center', tentLong: 'center', billboard: 'center', camera_exclusive: 'center',
  bannerTowerRed: 'center', bannerTowerGreen: 'center', pitsGarage: 'center', pitsOffice: 'center',
};

export const T = {};       // Vorlagen
export let carTemplates = {};

function normalize(scene, mode) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const c = box.getCenter(new THREE.Vector3());
  const off = new THREE.Vector3(-c.x, -box.min.y, mode === 'pole' ? -box.min.z : -c.z);
  const g = new THREE.Group();
  scene.position.add(off);
  g.add(scene);
  g.userData.size = box.getSize(new THREE.Vector3());
  return g;
}

function prepMaterials(root, opts = {}) {
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = opts.cast !== false;
    o.receiveShadow = opts.receive !== false;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) {
      if (!m || m.userData.prepped) continue;
      m.userData.prepped = true;
      if (m.name === 'glass') { m.roughness = 0.08; m.metalness = 0.6; }
      else if (m.name === 'carTire') { m.roughness = 0.9; }
      else if (opts.car && ['red', 'green', 'white', 'orange', 'grey'].includes(m.name)) { m.roughness = 0.32; m.metalness = 0.25; }
      else { m.roughness = Math.max(0.55, m.roughness ?? 0.8); }
    }
  });
}

export async function loadModels(onProgress) {
  const loader = new GLTFLoader();
  const names = [...Object.keys(MODELS), ...Object.keys(CAR_COLORS).map(c => 'raceCar' + c)];
  let done = 0;
  await Promise.all(names.map(n => new Promise((res, rej) => {
    loader.load(BASE + n + '.glb', (g) => {
      if (n.startsWith('raceCar')) {
        prepMaterials(g.scene, { car: true });
        carTemplates[n.slice(7)] = g.scene;
      } else {
        prepMaterials(g.scene, { cast: !['pylon'].includes(n), receive: true });
        T[n] = normalize(g.scene, MODELS[n]);
        // Lampenmaterial der Lichtmasten merken (wird nachts zum Leuchten gebracht)
        if (n === 'lightPostModern') g.scene.traverse(o => { if (o.isMesh) { const m = o.material; if (m.name === '_defaultMat') T.lampMat = m; } });
      }
      onProgress?.(++done / names.length);
      res();
    }, undefined, rej);
  })));
}

export function placeProp(p) {
  const tpl = T[p.m];
  if (!tpl) return null;
  const o = tpl.clone(true);
  o.position.set(p.x, 0, p.z);
  o.rotation.y = p.rot || 0;
  o.scale.setScalar(p.scale || 1);
  o.matrixAutoUpdate = false;
  o.updateMatrix();
  return o;
}

/* ---------- Fahrzeug mit Lichtern ---------- */
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
export { glowTex };

function beamMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uColor: { value: new THREE.Color(1, 0.93, 0.78) }, uStrength: { value: 0 } },
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV; varying float vD;
      void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vD = -mv.z; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uStrength; varying float vY; varying vec3 vN; varying vec3 vV; varying float vD;
      void main(){ float edge = pow(abs(dot(vN, vV)), 1.6); float a = uStrength * edge * pow(vY, 1.8) * smoothstep(3.0, 14.0, vD);
        gl_FragColor = vec4(uColor * a, a); }`,
  });
}
export { beamMaterial };

export function makeCarMesh(color, withHeadlight) {
  const src = carTemplates[color] || carTemplates.Red;
  const inner = src.clone(true);
  const holder = new THREE.Group();
  holder.add(inner);
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const c = box.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -box.min.y, -c.z);
  const S = 4.5 / (box.max.z - box.min.z);
  const car = new THREE.Group();
  holder.scale.setScalar(S);
  car.add(holder);
  const L = (box.max.z - box.min.z) * S, Wd = (box.max.x - box.min.x) * S, H = (box.max.y - box.min.y) * S;

  const wheels = {};
  for (const n of ['wheelFrontLeft', 'wheelFrontRight', 'wheelBackLeft', 'wheelBackRight']) {
    const w = inner.getObjectByName(n);
    if (w) { w.rotation.order = 'YXZ'; wheels[n] = w; }
  }

  // Leuchten (leuchtend, für Bloom nicht tonemapped)
  const mk = (col) => new THREE.MeshBasicMaterial({ color: col, toneMapped: false });
  const headMat = mk(new THREE.Color(1, 1, 1));
  const tailMat = mk(new THREE.Color(0.6, 0.02, 0.02));
  const lampGeo = new THREE.BoxGeometry(0.42, 0.14, 0.06);
  const lights = { headMat, tailMat };
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(lampGeo, headMat); h.position.set(sx * Wd * 0.3, H * 0.34, L / 2 - 0.02); car.add(h);
    const t = new THREE.Mesh(lampGeo, tailMat); t.position.set(sx * Wd * 0.32, H * 0.42, -L / 2 + 0.02); car.add(t);
  }
  // Lichtschein (Sprites) vorne und hinten
  const spriteMat = (col) => new THREE.SpriteMaterial({ map: glowTex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false });
  lights.headGlow = []; lights.tailGlow = [];
  for (const sx of [-1, 1]) {
    const hs = new THREE.Sprite(spriteMat(new THREE.Color(1, 0.95, 0.85))); hs.scale.set(1.15, 1.15, 1); hs.position.set(sx * Wd * 0.3, H * 0.34, L / 2 + 0.15); car.add(hs); lights.headGlow.push(hs);
    const ts = new THREE.Sprite(spriteMat(new THREE.Color(1, 0.1, 0.05))); ts.scale.set(1.1, 1.1, 1); ts.position.set(sx * Wd * 0.32, H * 0.42, -L / 2 - 0.12); car.add(ts); lights.tailGlow.push(ts);
  }
  // Sichtbarer Lichtkegel im Nebel
  const beamGeo = new THREE.ConeGeometry(4.2, 22, 24, 1, true);
  beamGeo.translate(0, -11, 0);
  beamGeo.rotateX(-Math.PI / 2);   // Spitze am Auto, Öffnung nach vorne (+Z)
  // uv.y: 1 an der Spitze → 0 am Ende; ConeGeometry hat v=1 oben (Spitze)
  lights.beamMat = beamMaterial();
  const beam = new THREE.Mesh(beamGeo, lights.beamMat);
  beam.position.set(0, H * 0.34, L / 2);
  beam.rotation.x = 0.06;
  beam.frustumCulled = false;
  beam.renderOrder = 5;
  car.add(beam);
  lights.beam = beam;

  if (withHeadlight) {
    const spot = new THREE.SpotLight(0xfff2dd, 0, 70, 0.42, 0.6, 1.6);
    spot.position.set(0, H * 0.6, L / 2 - 0.3);
    spot.target.position.set(0, 0, L / 2 + 26);
    car.add(spot, spot.target);
    lights.spot = spot;
  }
  car.userData = { wheels, lights, L, Wd, H, wheelR: 0.42, spin: 0 };
  return car;
}

/** Fahrzeugdarstellung aus dem Simulationszustand aktualisieren */
export function syncCar(mesh, st, dt, night, fog = 0) {
  mesh.position.set(st.x, 0.03, st.z);
  mesh.rotation.y = Math.PI - st.a;
  const u = mesh.userData;
  u.spin += (st.speed || 0) * dt / u.wheelR;
  for (const [n, w] of Object.entries(u.wheels)) {
    w.rotation.x = u.spin;
    w.rotation.y = n.startsWith('wheelFront') ? -(st.steer || 0) * 0.45 : 0;
  }
  // leichte Neigung beim Lenken / Bremsen
  mesh.rotation.z = (st.steer || 0) * Math.min(1, Math.abs(st.speed || 0) / 40) * 0.035;
  mesh.rotation.x = st.braking ? -0.02 : 0;
  const L = u.lights;
  L.tailMat.color.setRGB(st.braking ? 3.2 : (night > 0 ? 1.1 : 0.55), st.braking ? 0.12 : 0.03, st.braking ? 0.08 : 0.02);
  for (const s of L.tailGlow) s.material.opacity = st.braking ? 0.95 : night * 0.55;
  for (const s of L.headGlow) s.material.opacity = night * 0.42;
  L.headMat.color.setScalar(0.9 + night * 1.3);
  if (L.spot) L.spot.intensity = night * 55;
  L.beamMat.uniforms.uStrength.value = night > 0 ? night * (0.12 + fog * 0.55) : 0;
  L.beam.visible = night > 0;
}
