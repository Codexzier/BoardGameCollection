/* Rennen 3D – Nachbearbeitung: Bloom, Tiefenunschärfe, Kino-Look (Vignette, Korn, Farbsaum, Grading, Speed-Blur, Letterbox). */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';

const CinematicShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 }, resolution: { value: new THREE.Vector2(1, 1) },
    vignette: { value: 0.35 }, grain: { value: 0.04 }, chroma: { value: 0.0015 }, speed: { value: 0 },
    letterbox: { value: 0 }, saturation: { value: 1.05 }, contrast: { value: 1.05 }, warmth: { value: 0 }, fade: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time, vignette, grain, chroma, speed, letterbox, saturation, contrast, warmth, fade; uniform vec2 resolution; varying vec2 vUv;
    float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv; vec2 dc = uv - 0.5;
      // Farbsaum (chromatische Aberration) – stärker zum Rand
      float ca = chroma * (0.4 + dot(dc, dc) * 4.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dc * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dc * ca).b;
      // radiale Geschwindigkeits-Unschärfe
      if (speed > 0.01) {
        vec3 acc = col; float wsum = 1.0;
        for (int i = 1; i <= 6; i++) { float t = float(i) / 6.0 * speed * 0.045 * smoothstep(0.08, 0.6, length(dc));
          acc += texture2D(tDiffuse, uv - dc * t).rgb; wsum += 1.0; }
        col = acc / wsum;
      }
      // Grading
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);
      col = (col - 0.5) * contrast + 0.5;
      col += vec3(warmth, warmth * 0.35, -warmth) * 0.5 * (1.0 - l);
      // Vignette
      float v = smoothstep(0.85, 0.2, length(dc * vec2(1.0, 0.85)));
      col *= mix(1.0 - vignette, 1.0, v);
      // Filmkorn
      col += (rand(uv * resolution + fract(time * 13.7)) - 0.5) * grain;
      // Kinobalken (2,39:1)
      float aspect = resolution.x / resolution.y;
      float bar = max(0.0, (1.0 - aspect / 2.39) * 0.5) * letterbox;
      if (uv.y < bar || uv.y > 1.0 - bar) col = vec3(0.0);
      col = mix(col, vec3(0.0), fade);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.quality = 'high';
    this.build();
  }
  build() {
    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    const pr = r.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: this.quality === 'high' ? 4 : 0 });
    this.composer?.dispose();
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bokeh = new BokehPass(this.scene, this.camera, { focus: 20, aperture: 0.00012, maxblur: 0.008 });
    this.bokeh.enabled = false;
    this.composer.addPass(this.bokeh);
    const bloomRes = this.quality === 'high' ? 1 : 0.5;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x * bloomRes, size.y * bloomRes), 0.5, 0.55, 0.82);
    this.bloom.enabled = this.quality !== 'low';
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.cine = new ShaderPass(CinematicShader);
    this.composer.addPass(this.cine);
    this.resize();
  }
  setQuality(q) { if (q !== this.quality) { this.quality = q; this.build(); } }
  resize() {
    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    this.composer.setPixelRatio(r.getPixelRatio());
    this.composer.setSize(size.x, size.y);
    this.cine.uniforms.resolution.value.set(size.x * r.getPixelRatio(), size.y * r.getPixelRatio());
  }
  set(params) {
    const u = this.cine.uniforms;
    for (const [k, v] of Object.entries(params)) if (u[k]) u[k].value = v;
  }
  setBloom(strength) { this.bloom.strength = strength; }
  setDof(on, focus, aperture = 0.00012) {
    this.bokeh.enabled = on && this.quality === 'high';
    if (this.bokeh.enabled) { this.bokeh.uniforms.focus.value = focus; this.bokeh.uniforms.aperture.value = aperture; }
  }
  render(dt) {
    this.cine.uniforms.time.value += dt;
    this.composer.render(dt);
  }
}
