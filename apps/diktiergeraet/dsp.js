/* Diktiergerät – Audioverarbeitung: Tempo (Tonhöhe bleibt), Stimmeffekte, WAV-Export. */
(function (root) {
  'use strict';
  const WORK_RATE = 24000; // für Sprache völlig ausreichend und schnell zu verarbeiten

  const EFFECTS = {
    none:    { name: 'Aus', short: 'Aus', pitch: 1 },
    high:    { name: 'Hoch (Helium)', short: 'Hoch', pitch: Math.pow(2, 7 / 12) },
    low:     { name: 'Tief (Monster)', short: 'Tief', pitch: Math.pow(2, -6 / 12) },
    robot:   { name: 'Roboter', short: 'Roboter', pitch: 1 },
    phone:   { name: 'Telefon/Funk', short: 'Funk', pitch: 1 },
  };
  const TEMPOS = [1, 1.25, 1.5, 2, 3];

  /**
   * WSOLA-Zeitdehnung: ändert die Länge um den Faktor `stretch`, ohne die Tonhöhe zu verändern.
   * stretch < 1 → schneller/kürzer, stretch > 1 → langsamer/länger.
   */
  function wsola(x, stretch, sr) {
    if (Math.abs(stretch - 1) < 1e-3) return x;
    const N = Math.round(sr * 0.04) & ~1;     // 40-ms-Fenster
    const Hs = N / 2;                          // Syntheseschritt
    const Ha = Hs / stretch;                   // Analyseschritt
    const tol = Math.round(sr * 0.008);        // Suchbereich ±8 ms
    const L = Hs;                              // Vergleichslänge
    const win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    const outLen = Math.ceil(x.length * stretch) + N;
    const y = new Float32Array(outLen), w = new Float32Array(outLen);
    let prev = -1;
    for (let k = 0; ; k++) {
      const out = k * Hs;
      const nominal = Math.round(k * Ha);
      if (nominal + N + tol >= x.length || out + N >= outLen) break;
      let best = nominal;
      if (prev >= 0) {
        const target = prev + Hs;
        if (target + L < x.length) {
          let bestC = -Infinity;
          const lo = Math.max(0, nominal - tol), hi = Math.min(x.length - N - 1, nominal + tol);
          for (let c = lo; c <= hi; c += 2) {
            let s = 0;
            for (let i = 0; i < L; i += 3) s += x[c + i] * x[target + i];
            if (s > bestC) { bestC = s; best = c; }
          }
        }
      }
      for (let i = 0; i < N; i++) { y[out + i] += x[best + i] * win[i]; w[out + i] += win[i]; }
      prev = best;
    }
    const len = Math.min(outLen, Math.round(x.length * stretch));
    const res = new Float32Array(len);
    for (let i = 0; i < len; i++) res[i] = w[i] > 1e-3 ? y[i] / w[i] : 0;
    return res;
  }

  /** Mono-Signal mit der Arbeits-Abtastrate aus einem AudioBuffer gewinnen */
  async function toMono(buffer) {
    const Off = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    const len = Math.ceil(buffer.duration * WORK_RATE);
    const oc = new Off(1, Math.max(1, len), WORK_RATE);
    const src = oc.createBufferSource();
    src.buffer = buffer;
    src.connect(oc.destination);
    src.start();
    const r = await oc.startRendering();
    return r.getChannelData(0);
  }

  function softClip(k) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
    return c;
  }

  /**
   * Fertig bearbeiteten AudioBuffer erzeugen.
   * mono: Float32Array mit WORK_RATE, tempo: 1…3, effect: Schlüssel aus EFFECTS
   */
  async function render(mono, tempo, effect) {
    const Off = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    const fx = EFFECTS[effect] || EFFECTS.none;
    const P = fx.pitch;
    // Erst zeitlich dehnen, dann per Abspielrate die Tonhöhe verschieben:
    // Gesamtlänge = Länge / Tempo, Tonhöhe × P.
    const stretched = wsola(mono, P / tempo, WORK_RATE);
    const outLen = Math.max(1, Math.ceil(stretched.length / P));
    const oc = new Off(1, outLen, WORK_RATE);
    const buf = oc.createBuffer(1, stretched.length, WORK_RATE);
    buf.copyToChannel ? buf.copyToChannel(stretched, 0) : buf.getChannelData(0).set(stretched);
    const src = oc.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = P;
    let node = src;

    if (effect === 'robot') {
      // Ringmodulation + kurze metallische Rückkopplung
      const ring = oc.createGain(); ring.gain.value = 0;
      const osc = oc.createOscillator(); osc.type = 'sine'; osc.frequency.value = 55;
      const depth = oc.createGain(); depth.gain.value = 1;
      osc.connect(depth).connect(ring.gain);
      node.connect(ring);
      const delay = oc.createDelay(0.05); delay.delayTime.value = 0.009;
      const fb = oc.createGain(); fb.gain.value = 0.45;
      const mix = oc.createGain(); mix.gain.value = 1.3;
      ring.connect(mix); ring.connect(delay); delay.connect(fb).connect(delay); delay.connect(mix);
      osc.start();
      node = mix;
    } else if (effect === 'phone') {
      // Bandbegrenzung wie Telefon/Funk, leichte Verzerrung und Rauschen
      const hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 450; hp.Q.value = 0.9;
      const lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2900; lp.Q.value = 0.9;
      const pk = oc.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1600; pk.gain.value = 7; pk.Q.value = 1.2;
      const pre = oc.createGain(); pre.gain.value = 2.2;
      const sh = oc.createWaveShaper(); sh.curve = softClip(6);
      const post = oc.createGain(); post.gain.value = 0.7;
      node.connect(hp).connect(lp).connect(pk).connect(pre).connect(sh).connect(post);
      const nb = oc.createBuffer(1, outLen, WORK_RATE), nd = nb.getChannelData(0);
      for (let i = 0; i < outLen; i++) nd[i] = (Math.random() * 2 - 1) * 0.012;
      const ns = oc.createBufferSource(); ns.buffer = nb;
      const nf = oc.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1800;
      ns.connect(nf).connect(oc.destination); ns.start();
      node = post;
    }
    node.connect(oc.destination);
    src.start();
    const out = await oc.startRendering();
    // Übersteuerung vermeiden
    const d = out.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0.97) { const g = 0.97 / peak; for (let i = 0; i < d.length; i++) d[i] *= g; }
    return out;
  }

  /** 16-Bit-PCM-WAV aus Float32-Daten */
  function encodeWav(samples, sr) {
    const n = samples.length;
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([buf], { type: 'audio/wav' });
  }

  const api = { WORK_RATE, EFFECTS, TEMPOS, wsola, toMono, render, encodeWav };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DictaDSP = api;
})(typeof window !== 'undefined' ? window : globalThis);
