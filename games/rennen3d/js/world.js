/* Rennen 3D – Szene: Himmel, Tageszeit, Nebel, Fahrbahn, Kulisse, Laternen, Bremsspuren, Rauch. */
import * as THREE from 'three';
import { T, placeProp, glowTex, beamMaterial } from './models.js';

export const TIMES = {
  day: {
    name: 'Tag', top: 0x3f86d6, horizon: 0xcfe6f2, bottom: 0x9fc4b0, sun: 0xfff2dd, sunI: 3.0, sunDir: [0.45, 0.8, 0.35],
    hemiSky: 0xdcefff, hemiGround: 0x5d7a4a, hemiI: 1.15, env: 0.75, fog: 0xc7dbe6, exposure: 1.0, night: 0, bloom: 0.18, stars: 0, grade: [1.04, 1.06, 0.0],
  },
  dusk: {
    name: 'Abend', top: 0x23285a, horizon: 0xf3884a, bottom: 0x5b4152, sun: 0xff9a55, sunI: 1.7, sunDir: [-0.8, 0.13, 0.35],
    hemiSky: 0x8f80c8, hemiGround: 0x3b2c2a, hemiI: 0.55, env: 0.45, fog: 0xc98a6f, exposure: 1.05, night: 0.6, bloom: 0.5, stars: 0, grade: [1.08, 1.12, 0.06],
  },
  night: {
    name: 'Nacht', top: 0x02040c, horizon: 0x1a2546, bottom: 0x0b0f18, sun: 0x9fb6ff, sunI: 0.35, sunDir: [0.3, 0.6, -0.5],
    hemiSky: 0x3a4a7a, hemiGround: 0x10140f, hemiI: 0.18, env: 0.12, fog: 0x1b2232, exposure: 1.15, night: 1, bloom: 0.8, stars: 1, grade: [1.1, 1.0, -0.04],
  },
};
export const FOGS = { off: { name: 'Aus', d: 0.0012 }, light: { name: 'Leicht', d: 0.0065 }, dense: { name: 'Dicht', d: 0.02 } };

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function noise(g, w, h, base, amp, n = 6000, size = 2) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = (Math.random() * 2 - 1) * amp;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    g.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}

export class World {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.time = 'day'; this.fog = 'light';
    this.q = 'high';
    const scene = this.scene;
    scene.fog = new THREE.FogExp2(0xc7dbe6, 0.006);

    // Himmel
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() },
        sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, sunSize: { value: 0.9985 },
        fogCol: { value: new THREE.Color() }, fogAmt: { value: 0 },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `uniform vec3 top, horizon, bottom, sunCol, fogCol; uniform vec3 sunDir; uniform float sunSize, fogAmt; varying vec3 vDir;
        void main(){ vec3 d = normalize(vDir); float h = d.y;
          vec3 col = h > 0.0 ? mix(horizon, top, pow(clamp(h,0.0,1.0), 0.55)) : mix(horizon, bottom, pow(clamp(-h,0.0,1.0), 0.4));
          float sd = dot(d, normalize(sunDir));
          col += sunCol * (smoothstep(sunSize, sunSize + 0.0008, sd) * 6.0 + pow(max(sd, 0.0), 32.0) * 0.6 + pow(max(sd,0.0), 4.0) * 0.12);
          col = mix(col, fogCol, fogAmt * (1.0 - smoothstep(0.0, 0.45, abs(h))));
          gl_FragColor = vec4(col, 1.0); }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);
    // Sterne
    const sp = new Float32Array(1500 * 3);
    for (let i = 0; i < 1500; i++) {
      const u = Math.random() * 2 * Math.PI, v = Math.random() * 0.9 + 0.08;
      const r = 1300;
      sp.set([Math.cos(u) * Math.sqrt(1 - v * v) * r, v * r, Math.sin(u) * Math.sqrt(1 - v * v) * r], i * 3);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, color: 0xffffff, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // Lichter
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);
    // Laternen-Lichtpool (die nächsten Laternen bekommen echtes Licht)
    this.pool = [];
    for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0xffc98a, 0, 34, 1.6); scene.add(l); this.pool.push(l); }

    // Boden
    const grassTex = canvasTex(256, 256, (g, w, h) => {
      noise(g, w, h, '#4f8f45', 0.08, 9000, 2);
      for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${30 + Math.random() * 40},${90 + Math.random() * 60},${30 + Math.random() * 30},.5)`; g.fillRect(Math.random() * w, Math.random() * h, 1, 3); }
    });
    grassTex.repeat.set(300, 300);
    grassTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95, color: 0xb9d9a6 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.08; // klar unter der Fahrbahn (kein Z-Fighting)
    this.ground.receiveShadow = true;
    scene.add(this.ground);

    this.trackGroup = new THREE.Group();
    scene.add(this.trackGroup);
    this.initSkids();
    this.initSmoke();
  }

  /* ---------- Strecke aufbauen ---------- */
  setTrack(tr) {
    this.tr = tr;
    const G = this.trackGroup;
    G.traverse(o => { if (o.isMesh && o.geometry && o.userData.own) o.geometry.dispose(); });
    G.clear();
    const s = tr.samples, N = tr.N, W = tr.width;
    const aniso = this.renderer.capabilities.getMaxAnisotropy();

    const ribbon = (inner, outer, y, mat, vScale) => {
      const pos = new Float32Array((N + 1) * 2 * 3), uv = new Float32Array((N + 1) * 2 * 2), idx = [];
      for (let k = 0; k <= N; k++) {
        const p = s[k % N], d = k === N ? tr.length : p.d;
        const yy = y + (k % N) * 0.00002; // Kreuzung der Acht: spätere Abschnitte liegen minimal höher
        pos.set([p.x + p.nx * inner, yy, p.z + p.nz * inner, p.x + p.nx * outer, yy, p.z + p.nz * outer], k * 6);
        uv.set([0, d / vScale, 1, d / vScale], k * 4);
        if (k < N) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      // Dreiecke so ausrichten, dass ihre Vorderseite nach oben zeigt
      const ax = pos[3] - pos[0], az = pos[5] - pos[2], bx = pos[6] - pos[0], bz = pos[8] - pos[2];
      if (az * bx - ax * bz > 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      geo.setIndex(idx);
      const nrm = new Float32Array(pos.length);
      for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true; m.userData.own = true;
      G.add(m);
      return m;
    };
    if (!this.roadMat) {
      const roadTex = canvasTex(256, 256, (g, w, h) => {
        noise(g, w, h, '#4b4f55', 0.07, 14000, 1);
        g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(6, 0, 7, h); g.fillRect(w - 13, 0, 7, h);
        g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(w / 2 - 3, 0, 6, h * 0.45);
      });
      roadTex.anisotropy = aniso;
      this.roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.72, metalness: 0.0 });
      const curbTex = canvasTex(64, 128, (g, w, h) => { g.fillStyle = '#d93a32'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#f2f2f2'; g.fillRect(0, h / 2, w, h / 2); });
      curbTex.anisotropy = aniso;
      this.curbMat = new THREE.MeshStandardMaterial({ map: curbTex, roughness: 0.6 });
      const shoulderTex = canvasTex(64, 64, (g, w, h) => noise(g, w, h, '#a99a7c', 0.1, 900, 2));
      this.shoulderMat = new THREE.MeshStandardMaterial({ map: shoulderTex, roughness: 1 });
    }
    // Seitenstreifen, Randsteine und Fahrbahn liegen nebeneinander statt übereinander
    ribbon(-W / 2 - 2.6, -W / 2 - 1.3, 0.0, this.shoulderMat, 8);
    ribbon(W / 2 + 1.3, W / 2 + 2.6, 0.0, this.shoulderMat, 8);
    ribbon(-W / 2 - 1.3, -W / 2, 0.012, this.curbMat, 4);
    ribbon(W / 2, W / 2 + 1.3, 0.012, this.curbMat, 4);
    ribbon(-W / 2, W / 2, 0.03, this.roadMat, 14);

    // Start/Ziel: Schachbrett
    const chk = canvasTex(128, 32, (g, w, h) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 8, y * 8, 8, 8); } }, false);
    const start = new THREE.Mesh(new THREE.PlaneGeometry(W, 2), new THREE.MeshStandardMaterial({ map: chk, roughness: 0.7 }));
    start.rotation.x = -Math.PI / 2;
    start.rotation.z = Math.atan2(-s[0].tz, s[0].tx) + Math.PI / 2;
    start.position.set(s[0].x, 0.075, s[0].z);
    start.receiveShadow = true; start.userData.own = true;
    G.add(start);
    // Startplätze
    const gridMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
    for (const back of [8, 18]) for (const lane of [-1, 1]) {
      const i = (N - Math.round(back / tr.spacing)) % N, p = s[i];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.35), gridMat);
      m.rotation.x = -Math.PI / 2; m.rotation.z = Math.atan2(-p.tz, p.tx) + Math.PI / 2;
      m.position.set(p.x + p.nx * lane * W / 4 + p.tx * 2.6, 0.07, p.z + p.nz * lane * W / 4 + p.tz * 2.6);
      m.userData.own = true;
      G.add(m);
    }

    // Kulisse
    this.lampHeads = [];
    for (const p of tr.props) {
      const o = placeProp(p);
      if (!o) continue;
      G.add(o);
      if (p.gantry) this.gantry = o;
    }
    // Startampel an der Brücke (5 Lichter)
    const s0 = s[0];
    this.startLights = [];
    const lg = new THREE.SphereGeometry(0.45, 16, 12);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: 0x220000, toneMapped: false }));
      const off = (i - 2) * 1.25;
      m.position.set(s0.x + s0.nx * off - s0.tx * 0.6, 6.6, s0.z + s0.nz * off - s0.tz * 0.6);
      m.userData.own = true;
      G.add(m); this.startLights.push(m);
    }
    // Laternenköpfe, Lichtpools am Boden und Lichtkegel im Nebel
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false });
    const poolMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffb870, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false });
    const coneGeo = new THREE.ConeGeometry(5.5, 8.6, 20, 1, true); coneGeo.translate(0, -4.3, 0);
    this.lampCones = []; this.lampPools = []; this.lampHeadMat = headMat; this.poolMat = poolMat;
    const coneMat = beamMaterial(); coneMat.uniforms.uColor.value.set(1, 0.78, 0.5);
    this.lampConeMat = coneMat;
    for (const l of tr.lamps) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.5), headMat);
      h.position.set(l.x, l.y - 0.15, l.z); h.userData.own = true; G.add(h);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), poolMat);
      pool.rotation.x = -Math.PI / 2; pool.position.set(l.x, 0.085, l.z); pool.renderOrder = 2; G.add(pool); this.lampPools.push(pool);
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(l.x, l.y - 0.2, l.z); cone.renderOrder = 6; cone.frustumCulled = true; G.add(cone); this.lampCones.push(cone);
    }
    this.clearSkids();
    this.applyAtmosphere();
  }

  setStartLights(n, green) {
    if (!this.startLights) return;
    this.startLights.forEach((m, i) => m.material.color.set(green ? 0x000000 : i < n ? 0xff1a0a : 0x220000).multiplyScalar(green ? 1 : i < n ? 4 : 1));
  }

  /* ---------- Tageszeit & Nebel ---------- */
  setAtmosphere(time, fog) { this.time = time; this.fog = fog; this.applyAtmosphere(); }
  setQuality(q) {
    this.q = q;
    this.sun.castShadow = q !== 'low';
    this.sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.pool.forEach((l, i) => { l.visible = q === 'high' ? true : q === 'medium' ? i < 3 : i < 1; });
  }
  applyAtmosphere() {
    const P = TIMES[this.time], F = FOGS[this.fog];
    const u = this.skyMat.uniforms;
    u.top.value.set(P.top); u.horizon.value.set(P.horizon); u.bottom.value.set(P.bottom);
    u.sunDir.value.set(...P.sunDir).normalize(); u.sunCol.value.set(P.sun).multiplyScalar(this.time === 'night' ? 0.6 : 1);
    u.sunSize.value = this.time === 'night' ? 0.9992 : 0.9985;
    const fogAmt = Math.min(1, F.d * 60);
    u.fogCol.value.set(P.fog); u.fogAmt.value = fogAmt;
    this.scene.fog.color.set(P.fog);
    this.scene.fog.density = F.d;
    this.sunDir = new THREE.Vector3(...P.sunDir).normalize();
    this.sun.color.set(P.sun); this.sun.intensity = P.sunI * (1 - fogAmt * 0.35);
    this.hemi.color.set(P.hemiSky); this.hemi.groundColor.set(P.hemiGround); this.hemi.intensity = P.hemiI;
    this.stars.material.opacity = P.stars * (1 - fogAmt);
    this.renderer.toneMappingExposure = P.exposure;
    this.night = P.night;
    const lit = P.night > 0;
    if (this.lampHeadMat) this.lampHeadMat.color.set(lit ? 0xffe2b0 : 0x8a8a80).multiplyScalar(lit ? 2.5 : 1);
    if (this.poolMat) this.poolMat.opacity = P.night * 0.28;
    if (this.lampConeMat) this.lampConeMat.uniforms.uStrength.value = lit ? (0.12 + fogAmt * 0.5) * P.night : 0;
    this.fogAmt = fogAmt;
    // Umgebungslicht für Reflexionen aus dem Himmel erzeugen
    const pm = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.skyMat));
    if (this.envRT) this.envRT.dispose();
    this.envRT = pm.fromScene(envScene, 0.02);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = P.env;
    pm.dispose();
  }

  /* ---------- Bremsspuren ---------- */
  initSkids() {
    this.skidMax = 2400; this.skidN = 0;
    const geo = new THREE.PlaneGeometry(0.42, 1.0); geo.rotateX(-Math.PI / 2);
    this.skids = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.45, depthWrite: false }), this.skidMax);
    this.skids.count = 0; this.skids.frustumCulled = false; this.skids.renderOrder = 1;
    this.scene.add(this.skids);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
  }
  clearSkids() { this.skidN = 0; this.skids.count = 0; this.skids.instanceMatrix.needsUpdate = true; }
  addSkid(x, z, a, len) {
    const i = this.skidN % this.skidMax;
    this._q.setFromAxisAngle(this._v.set(0, 1, 0), Math.PI - a);
    this._m.compose(this._v.set(x, 0.062, z), this._q, this._s.set(1, 1, len));
    this.skids.setMatrixAt(i, this._m);
    this.skidN++;
    this.skids.count = Math.min(this.skidN, this.skidMax);
    this.skids.instanceMatrix.needsUpdate = true;
  }

  /* ---------- Rauch / Staub / Funken ---------- */
  initSmoke() {
    const M = 400;
    this.pMax = M; this.pNext = 0;
    this.pPos = new Float32Array(M * 3); this.pVel = new Float32Array(M * 3);
    this.pLife = new Float32Array(M); this.pMaxLife = new Float32Array(M).fill(1);
    this.pSize = new Float32Array(M); this.pCol = new Float32Array(M * 4);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 4));
    this.particles = new THREE.Points(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { map: { value: glowTex }, scale: { value: 600 } },
      vertexShader: `attribute float size; attribute vec4 color; varying vec4 vC;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * 600.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec4 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb, vC.a * t.a); }`,
    }));
    this.particles.frustumCulled = false;
    this.particles.renderOrder = 4;
    this.scene.add(this.particles);
  }
  emit(x, y, z, vx, vy, vz, life, size, r, g, b, a) {
    const i = this.pNext; this.pNext = (this.pNext + 1) % this.pMax;
    this.pPos.set([x, y, z], i * 3); this.pVel.set([vx, vy, vz], i * 3);
    this.pLife[i] = life; this.pMaxLife[i] = life; this.pSize[i] = size;
    this.pCol.set([r, g, b, a], i * 4);
    this.pBase = this.pBase || new Float32Array(this.pMax * 2);
    this.pBase[i * 2] = size; this.pBase[i * 2 + 1] = a;
  }
  updateParticles(dt) {
    if (!this.pBase) return;
    for (let i = 0; i < this.pMax; i++) {
      if (this.pLife[i] <= 0) { this.pCol[i * 4 + 3] = 0; continue; }
      this.pLife[i] -= dt;
      const k = Math.max(0, this.pLife[i] / this.pMaxLife[i]);
      for (let j = 0; j < 3; j++) this.pPos[i * 3 + j] += this.pVel[i * 3 + j] * dt;
      this.pVel[i * 3 + 1] += 0.4 * dt;
      this.pSize[i] = this.pBase[i * 2] * (1 + (1 - k) * 2.2);
      this.pCol[i * 4 + 3] = this.pBase[i * 2 + 1] * k;
    }
    const g = this.particles.geometry;
    g.attributes.position.needsUpdate = g.attributes.size.needsUpdate = g.attributes.color.needsUpdate = true;
  }

  /** Effekte eines Fahrzeugs pro Frame (Bremsspuren, Rauch, Staub) */
  carEffects(st, dt, mesh, noSkid) {
    const fx = Math.sin(st.a), fz = -Math.cos(st.a), rx = -fz, rz = fx;
    const spd = Math.abs(st.speed || 0);
    const sliding = (st.drift > 4.5 && spd > 8) || (st.braking && spd > 20);
    if (sliding && st.onRoad) {
      st._skidAcc = (st._skidAcc || 0) + spd * dt;
      if (st._skidAcc > 0.9 && noSkid) st._skidAcc = 0;
      if (st._skidAcc > 0.9) {
        for (const o of [-0.85, 0.85]) this.addSkid(st.x - fx * 1.4 + rx * o, st.z - fz * 1.4 + rz * o, st.a, st._skidAcc + 0.1);
        st._skidAcc = 0;
      }
      if (Math.random() < 0.7) {
        const lit = 0.75 - this.night * 0.35;
        this.emit(st.x - fx * 2 + (Math.random() - 0.5) * 1.6, 0.4, st.z - fz * 2 + (Math.random() - 0.5) * 1.6, -st.vx * 0.05, 0.6, -st.vz * 0.05, 1.6, 1.4, lit, lit, lit, 0.35);
      }
    } else st._skidAcc = 0;
    if (!st.onRoad && spd > 6 && Math.random() < 0.8) {
      this.emit(st.x - fx * 2, 0.3, st.z - fz * 2, -st.vx * 0.1 + (Math.random() - 0.5), 1.2, -st.vz * 0.1 + (Math.random() - 0.5), 1.1, 1.2, 0.55, 0.45, 0.3, 0.4);
    }
  }
  sparks(x, z, power) {
    for (let i = 0; i < Math.min(30, power * 1.5); i++) {
      this.emit(x, 0.6, z, (Math.random() - 0.5) * 12, Math.random() * 5, (Math.random() - 0.5) * 12, 0.4, 0.25, 4, 2.5, 0.8, 1);
    }
  }

  /** Pro Frame: Schatten folgen, Laternenlicht zuordnen */
  update(dt, focus, camPos) {
    const d = this.sunDir;
    this.sun.position.set(focus.x + d.x * 120, d.y * 120, focus.z + d.z * 120);
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.sun.target.updateMatrixWorld();
    this.sky.position.copy(camPos);
    this.stars.position.copy(camPos);
    const lamps = this.tr?.lamps || [];
    const on = this.night > 0;
    if (lamps.length) {
      const sorted = lamps.map(l => [l, (l.x - focus.x) ** 2 + (l.z - focus.z) ** 2]).sort((a, b) => a[1] - b[1]);
      this.pool.forEach((pl, i) => {
        const l = sorted[i]?.[0];
        if (!l || !on) { pl.intensity = 0; return; }
        pl.position.set(l.x, l.y - 0.6, l.z);
        pl.intensity = 55 * this.night;
      });
    }
    this.updateParticles(dt);
  }
}
