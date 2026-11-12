/* LoopStudio – Klangerzeugung (Web Audio, alles synthetisch) und Effektketten je Spur. */
(function (root) {
  'use strict';

  const TYPES = {
    drums:   { name: 'Drumset',      color: '#e8582e', rows: ['Kick', 'Snare', 'Clap', 'Hi-Hat zu', 'Hi-Hat offen', 'Tom tief', 'Tom hoch', 'Becken'] },
    bass:    { name: 'Bassline',     color: '#7b5cf0', base: 36 },
    melo:    { name: 'Melo',         color: '#2f9e5b', base: 60 },
    strings: { name: 'Strings',      color: '#2f7cf6', base: 48 },
    fx:      { name: 'Soundeffekte', color: '#d9a400', rows: ['Laser', 'Anstieg', 'Absturz', 'Wind', 'Zap', 'Blip', 'Explosion', 'Münze'] },
  };
  const PIANO_ROWS = 25; // zwei Oktaven + 1
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const rowCount = (type) => TYPES[type].rows ? TYPES[type].rows.length : PIANO_ROWS;
  const midiName = (m) => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
  const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  let ctx = null, master = null, masterAnalyser = null, reverb = null, noiseBuf = null;
  const chains = new Map();

  function init() {
    if (ctx) return ctx;
    ctx = new (root.AudioContext || root.webkitAudioContext)();
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.ratio.value = 4;
    masterAnalyser = ctx.createAnalyser(); masterAnalyser.fftSize = 512;
    master.connect(comp).connect(masterAnalyser).connect(ctx.destination);
    // Hall: Impulsantwort aus abklingendem Rauschen
    const len = ctx.sampleRate * 2.4;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    reverb = ctx.createConvolver(); reverb.buffer = ir;
    reverb.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function radioCurve() {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = Math.tanh(x * 4); }
    return c;
  }

  /** Effektkette einer Spur: Eingang → Radio (Mischung) → Phaser (Mischung) → Lautstärke → Master, + Hall-Send */
  function chain(track) {
    init();
    let ch = chains.get(track.id);
    if (ch) return ch;
    const input = ctx.createGain();
    // Radio
    const dryR = ctx.createGain(), wetR = ctx.createGain();
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 600;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800;
    const sh = ctx.createWaveShaper(); sh.curve = radioCurve();
    const radioOut = ctx.createGain();
    input.connect(dryR).connect(radioOut);
    input.connect(hp).connect(lp).connect(sh).connect(wetR).connect(radioOut);
    // Phaser: 4 Allpässe, per LFO moduliert
    const dryP = ctx.createGain(), wetP = ctx.createGain(), phOut = ctx.createGain();
    radioOut.connect(dryP).connect(phOut);
    let node = radioOut;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.45;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 700;
    lfo.connect(lfoGain);
    for (let i = 0; i < 4; i++) {
      const ap = ctx.createBiquadFilter(); ap.type = 'allpass'; ap.frequency.value = 1000 + i * 250; ap.Q.value = 0.7;
      lfoGain.connect(ap.frequency);
      node.connect(ap); node = ap;
    }
    node.connect(wetP).connect(phOut);
    lfo.start();
    // Lautstärke, Stumm, Hall
    const vol = ctx.createGain(), mute = ctx.createGain(), send = ctx.createGain();
    const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
    phOut.connect(vol).connect(mute);
    mute.connect(master); mute.connect(analyser); mute.connect(send).connect(reverb);
    ch = { input, dryR, wetR, dryP, wetP, vol, mute, send, analyser };
    chains.set(track.id, ch);
    update(track, true);
    return ch;
  }

  function update(track, audible) {
    const ch = chains.get(track.id);
    if (!ch) return;
    const t = ctx.currentTime, k = 0.02;
    const f = track.fx;
    ch.dryR.gain.setTargetAtTime(1 - f.radio, t, k);
    ch.wetR.gain.setTargetAtTime(f.radio * 0.7, t, k);
    ch.dryP.gain.setTargetAtTime(1 - f.phaser * 0.5, t, k);
    ch.wetP.gain.setTargetAtTime(f.phaser, t, k);
    ch.send.gain.setTargetAtTime(f.reverb * 0.9, t, k);
    ch.vol.gain.setTargetAtTime(track.vol, t, k);
    ch.mute.gain.setTargetAtTime(audible ? 1 : 0, t, k);
  }

  function setMaster(v) { init(); master.gain.setTargetAtTime(v, ctx.currentTime, 0.02); }

  function remove(id) {
    const ch = chains.get(id);
    if (!ch) return;
    try { ch.mute.disconnect(); } catch (_) {}
    chains.delete(id);
  }

  function level(an) {
    if (!an) return 0;
    const a = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(a);
    let p = 0; for (const v of a) p = Math.max(p, Math.abs(v));
    return p;
  }

  /* ---------- Instrumente ---------- */
  function env(g, t, a, peak, d, s, rel, end) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * s), t + a + d);
    const hold = Math.max(end, t + a + d);
    g.gain.setValueAtTime(Math.max(0.0001, peak * s), hold);
    g.gain.exponentialRampToValueAtTime(0.0001, hold + rel);
  }
  function osc(type, f, t, stop) { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(stop); return o; }
  function noise(t, stop) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(t, Math.random()); s.stop(stop); return s; }
  function vca(out, t) { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.connect(out); return g; }

  const DRUMS = [
    (o, t) => { // Kick
      const g = vca(o, t), s = osc('sine', 150, t, t + 0.5);
      s.frequency.exponentialRampToValueAtTime(42, t + 0.18);
      env(g, t, 0.003, 1, 0.12, 0.3, 0.25, t + 0.15); s.connect(g);
    },
    (o, t) => { // Snare
      const g = vca(o, t), n = noise(t, t + 0.3), f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.7;
      env(g, t, 0.002, 0.7, 0.08, 0.2, 0.12, t + 0.08); n.connect(f).connect(g);
      const g2 = vca(o, t), s = osc('triangle', 190, t, t + 0.2); env(g2, t, 0.002, 0.5, 0.05, 0.1, 0.06, t + 0.05); s.connect(g2);
    },
    (o, t) => { // Clap
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 1.2; f.connect(o);
      for (const dt of [0, 0.012, 0.024]) { const g = vca(f, t + dt), n = noise(t + dt, t + dt + 0.25); env(g, t + dt, 0.001, 0.9, 0.03, 0.2, dt === 0.024 ? 0.18 : 0.02, t + dt + 0.03); n.connect(g); }
    },
    (o, t) => hat(o, t, 0.05),
    (o, t) => hat(o, t, 0.32),
    (o, t) => tom(o, t, 110),
    (o, t) => tom(o, t, 190),
    (o, t) => { // Becken
      const g = vca(o, t), n = noise(t, t + 1.6), f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 5500;
      env(g, t, 0.002, 0.45, 0.2, 0.4, 1.1, t + 0.25); n.connect(f).connect(g);
    },
  ];
  function hat(o, t, len) {
    const g = vca(o, t), n = noise(t, t + len + 0.1), f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    env(g, t, 0.001, 0.4, len * 0.4, 0.3, len * 0.6, t + len * 0.4); n.connect(f).connect(g);
  }
  function tom(o, t, f0) {
    const g = vca(o, t), s = osc('sine', f0 * 1.6, t, t + 0.6);
    s.frequency.exponentialRampToValueAtTime(f0, t + 0.15);
    env(g, t, 0.003, 0.8, 0.15, 0.2, 0.25, t + 0.15); s.connect(g);
  }

  const FX = [
    (o, t) => { const g = vca(o, t), s = osc('square', 1800, t, t + 0.4); s.frequency.exponentialRampToValueAtTime(110, t + 0.3); env(g, t, 0.002, 0.25, 0.1, 0.6, 0.15, t + 0.2); s.connect(g); },
    (o, t) => { const g = vca(o, t), n = noise(t, t + 1.3), f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 4; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(6000, t + 1.1); env(g, t, 0.9, 0.6, 0.1, 0.8, 0.15, t + 1.05); n.connect(f).connect(g); },
    (o, t) => { const g = vca(o, t), s = osc('sine', 1300, t, t + 0.9); s.frequency.exponentialRampToValueAtTime(70, t + 0.8); env(g, t, 0.01, 0.4, 0.2, 0.7, 0.2, t + 0.6); s.connect(g); },
    (o, t) => { const g = vca(o, t), n = noise(t, t + 2), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(1600, t + 0.8); f.frequency.linearRampToValueAtTime(300, t + 1.6); env(g, t, 0.5, 0.5, 0.3, 0.8, 0.5, t + 1.2); n.connect(f).connect(g); },
    (o, t) => { const g = vca(o, t), s = osc('sawtooth', 3200, t, t + 0.2); s.frequency.exponentialRampToValueAtTime(180, t + 0.12); env(g, t, 0.001, 0.3, 0.05, 0.4, 0.06, t + 0.08); s.connect(g); },
    (o, t) => { const g = vca(o, t), s = osc('sine', 1250, t, t + 0.12); env(g, t, 0.001, 0.4, 0.03, 0.3, 0.05, t + 0.04); s.connect(g); },
    (o, t) => { const g = vca(o, t), n = noise(t, t + 1.6), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1200, t); f.frequency.exponentialRampToValueAtTime(60, t + 1.3); env(g, t, 0.004, 1, 0.3, 0.5, 0.9, t + 0.4); n.connect(f).connect(g);
      const g2 = vca(o, t), s = osc('sine', 80, t, t + 0.8); s.frequency.exponentialRampToValueAtTime(30, t + 0.6); env(g2, t, 0.003, 0.9, 0.2, 0.3, 0.3, t + 0.3); s.connect(g2); },
    (o, t) => { const g = vca(o, t), s = osc('square', 988, t, t + 0.45); s.frequency.setValueAtTime(1319, t + 0.08); env(g, t, 0.001, 0.22, 0.05, 0.8, 0.25, t + 0.15); s.connect(g); },
  ];

  function bass(o, t, m, dur) {
    const end = t + dur, f = freq(m);
    const g = vca(o, t), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
    lp.frequency.setValueAtTime(250, t); lp.frequency.exponentialRampToValueAtTime(1400, t + 0.02); lp.frequency.exponentialRampToValueAtTime(380, t + 0.25);
    const a = osc('sawtooth', f, t, end + 0.2), b = osc('square', f / 2, t, end + 0.2);
    const bg = ctx.createGain(); bg.gain.value = 0.5;
    a.connect(lp); b.connect(bg).connect(lp); lp.connect(g);
    env(g, t, 0.005, 0.55, 0.15, 0.6, 0.08, end);
  }
  function melo(o, t, m, dur) {
    const end = t + dur, f = freq(m);
    const g = vca(o, t), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    const a = osc('square', f, t, end + 0.4), b = osc('triangle', f * 2.003, t, end + 0.4);
    const bg = ctx.createGain(); bg.gain.value = 0.35;
    a.connect(lp); b.connect(bg).connect(lp); lp.connect(g);
    env(g, t, 0.005, 0.22, 0.12, 0.45, 0.25, end);
  }
  function strings(o, t, m, dur) {
    const end = t + dur, f = freq(m);
    const g = vca(o, t), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    const vib = osc('sine', 5.2, t, end + 0.8), vg = ctx.createGain(); vg.gain.value = f * 0.004; vib.connect(vg);
    for (const det of [-7, 0, 7]) {
      const s = osc('sawtooth', f, t, end + 0.8); s.detune.value = det; vg.connect(s.frequency);
      const sg = ctx.createGain(); sg.gain.value = 0.33; s.connect(sg).connect(lp);
    }
    lp.connect(g);
    env(g, t, 0.14, 0.2, 0.2, 0.85, 0.5, Math.max(end, t + 0.16));
  }

  /** Einen Ton/Schlag einer Spur zum Zeitpunkt t spielen */
  function trigger(track, row, t, dur) {
    init();
    const o = chain(track).input;
    t = Math.max(t, ctx.currentTime);
    if (track.type === 'drums') DRUMS[row]?.(o, t);
    else if (track.type === 'fx') FX[row]?.(o, t);
    else {
      const m = TYPES[track.type].base + row;
      ({ bass, melo, strings })[track.type](o, t, m, Math.max(0.05, dur));
    }
  }

  root.LoopAudio = {
    TYPES, PIANO_ROWS, rowCount, midiName, init, chain, update, setMaster, remove, trigger, level,
    get ctx() { return ctx; },
    analyser: (id) => chains.get(id)?.analyser,
    masterLevel: () => level(masterAnalyser),
  };
})(window);
