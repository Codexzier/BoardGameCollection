/* Diktiergerät – Aufnahme, Speicherung im Browser (IndexedDB), Wiedergabe mit Tempo & Stimmeffekt, Download. */
(() => {
  'use strict';
  const DSP = window.DictaDSP;
  const $ = (s) => document.querySelector(s);
  const ICON = (n) => `<span class="ico" style="--i:url(../../assets/icons/${n}.png)"></span>`;

  /* ---------- Speicher (IndexedDB, sonst nur im Arbeitsspeicher) ---------- */
  const DB = (() => {
    let dbp = null, mem = [], memId = 1;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((res) => {
        try {
          const r = indexedDB.open('diktiergeraet', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('recs', { keyPath: 'id', autoIncrement: true });
          r.onsuccess = () => res(r.result);
          r.onerror = () => res(null);
        } catch (_) { res(null); }
      });
      return dbp;
    }
    const tx = async (mode, fn) => {
      const db = await open();
      if (!db) return fn(null);
      return new Promise((res, rej) => {
        const t = db.transaction('recs', mode);
        const st = t.objectStore('recs');
        const out = fn(st);
        t.oncomplete = () => res(out && 'result' in out ? out.result : out);
        t.onerror = () => rej(t.error);
      });
    };
    return {
      async persistent() { return !!(await open()); },
      async all() {
        const db = await open();
        if (!db) return [...mem];
        return tx('readonly', st => st.getAll());
      },
      async add(rec) {
        const db = await open();
        if (!db) { rec.id = memId++; mem.push(rec); return rec.id; }
        return tx('readwrite', st => st.add(rec));
      },
      async put(rec) {
        const db = await open();
        if (!db) { mem = mem.map(r => r.id === rec.id ? rec : r); return; }
        return tx('readwrite', st => st.put(rec));
      },
      async del(id) {
        const db = await open();
        if (!db) { mem = mem.filter(r => r.id !== id); return; }
        return tx('readwrite', st => st.delete(id));
      },
    };
  })();

  /* ---------- Zustand ---------- */
  let recs = [];                 // neueste zuerst
  let selId = null;
  let tempo = 1, fx = 'none';
  try { tempo = +localStorage.getItem('dicta.tempo') || 1; fx = localStorage.getItem('dicta.fx') || 'none'; } catch (_) {}
  if (!DSP.TEMPOS.includes(tempo)) tempo = 1;
  if (!DSP.EFFECTS[fx]) fx = 'none';

  let ac = null;
  const audioCtx = () => (ac ||= new (window.AudioContext || window.webkitAudioContext)());

  const fmt = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(sec).padStart(2, '0');
  };
  const tempoLabel = (t) => String(t).replace('.', ',') + 'x';
  const selected = () => recs.find(r => r.id === selId) || null;

  /* ---------- Wiedergabe ---------- */
  const monoCache = new Map(), renderCache = new Map();
  const P = { source: null, buffer: null, key: null, startAt: 0, offset: 0, playing: false, token: 0, busy: false };

  async function mono(rec) {
    if (monoCache.has(rec.id)) return monoCache.get(rec.id);
    const ab = await rec.blob.arrayBuffer();
    const buf = await new Promise((res, rej) => {
      const p = audioCtx().decodeAudioData(ab, res, rej);
      if (p && p.then) p.then(res, rej);
    });
    const m = await DSP.toMono(buf);
    monoCache.set(rec.id, m);
    if (monoCache.size > 3) monoCache.delete(monoCache.keys().next().value);
    return m;
  }

  async function rendered(rec, t = tempo, f = fx) {
    const key = `${rec.id}|${t}|${f}`;
    if (renderCache.has(key)) return { key, buffer: renderCache.get(key) };
    const buffer = await DSP.render(await mono(rec), t, f);
    renderCache.set(key, buffer);
    if (renderCache.size > 4) renderCache.delete(renderCache.keys().next().value);
    return { key, buffer };
  }

  const position = () => P.playing ? audioCtx().currentTime - P.startAt : P.offset;

  function startSource() {
    const ctx = audioCtx();
    const src = ctx.createBufferSource();
    src.buffer = P.buffer;
    src.connect(ctx.destination);
    const token = ++P.token;
    src.onended = () => {
      if (token !== P.token) return;           // durch Pause/Sprung beendet
      P.playing = false; P.offset = 0; P.source = null;
      ui();
    };
    P.offset = Math.max(0, Math.min(P.offset, P.buffer.duration - 0.01));
    src.start(0, P.offset);
    P.startAt = ctx.currentTime - P.offset;
    P.source = src;
    P.playing = true;
  }
  function stopSource() {
    if (P.source) { P.token++; try { P.source.stop(); } catch (_) {} P.source = null; }
  }

  async function prepare(keepFraction) {
    const rec = selected();
    if (!rec) return false;
    const want = `${rec.id}|${tempo}|${fx}`;
    if (P.key === want && P.buffer) return true;
    const frac = keepFraction && P.buffer ? position() / P.buffer.duration : 0;
    P.busy = true; ui();
    try {
      const r = await rendered(rec);
      P.buffer = r.buffer; P.key = r.key;
      P.offset = frac * r.buffer.duration;
    } catch (e) {
      toast('Die Aufnahme kann nicht abgespielt werden.');
      return false;
    } finally { P.busy = false; ui(); }
    return true;
  }

  async function play() {
    if (R.active || P.busy) return;
    if (!selected()) { if (recs[0]) select(recs[0].id); else return toast('Noch keine Aufnahme vorhanden.'); }
    if (P.playing) { P.offset = position(); stopSource(); P.playing = false; ui(); return; }
    audioCtx().resume?.();
    if (!(await prepare(true))) return;
    startSource();
    ui();
  }

  function stop() {
    if (R.active) { stopRecording(); return; }
    stopSource();
    P.playing = false; P.offset = 0;
    ui();
  }

  function seek(sec) {
    if (!P.buffer) return;
    const wasPlaying = P.playing;
    P.offset = Math.max(0, Math.min(P.buffer.duration, sec));
    if (wasPlaying) { stopSource(); startSource(); }
    ui();
  }

  async function settingsChanged() {
    try { localStorage.setItem('dicta.tempo', String(tempo)); localStorage.setItem('dicta.fx', fx); } catch (_) {}
    if (!P.buffer) { ui(); return; }
    const wasPlaying = P.playing;
    if (wasPlaying) { P.offset = position(); stopSource(); P.playing = false; }
    await prepare(true);
    if (wasPlaying) startSource();
    ui();
  }

  /* ---------- Aufnahme ---------- */
  const R = { active: false, media: null, stream: null, chunks: [], t0: 0, analyser: null, level: 0 };

  function pickMime() {
    const list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];
    return list.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
  }

  async function startRecording() {
    if (R.active) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('Dieser Browser unterstützt keine Audioaufnahme.');
    stop();
    try {
      R.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      $('#lcdName').textContent = 'KEIN MIKROFON';
      return toast('Kein Zugriff auf das Mikrofon. Bitte im Browser erlauben.');
    }
    const mime = pickMime();
    R.media = new MediaRecorder(R.stream, mime ? { mimeType: mime } : undefined);
    R.chunks = [];
    R.media.ondataavailable = (e) => { if (e.data && e.data.size) R.chunks.push(e.data); };
    R.media.onstop = finishRecording;
    R.media.start(250);
    R.active = true;
    R.t0 = performance.now();
    try {
      const ctx = audioCtx();
      ctx.resume?.();
      R.analyser = ctx.createAnalyser();
      R.analyser.fftSize = 512;
      ctx.createMediaStreamSource(R.stream).connect(R.analyser);
    } catch (_) { R.analyser = null; }
    ui();
  }

  function stopRecording() {
    if (!R.active) return;
    R.active = false;
    try { R.media.stop(); } catch (_) { finishRecording(); }
    ui();
  }

  async function finishRecording() {
    const elapsed = (performance.now() - R.t0) / 1000;
    R.stream?.getTracks().forEach(t => t.stop());
    R.analyser = null;
    const type = R.media?.mimeType || R.chunks[0]?.type || 'audio/webm';
    const blob = new Blob(R.chunks, { type });
    R.chunks = [];
    if (!blob.size) return toast('Die Aufnahme ist leer.');
    let n = 1;
    try { n = (+localStorage.getItem('dicta.counter') || 0) + 1; localStorage.setItem('dicta.counter', String(n)); } catch (_) { n = recs.length + 1; }
    const rec = { name: `Aufnahme ${n}`, created: Date.now(), duration: elapsed, mime: type, blob };
    // genaue Dauer durch Dekodieren ermitteln (WebM-Dateien enthalten sie oft nicht)
    try { rec.duration = (await mono(Object.assign({ id: -1 }, rec))).length / DSP.WORK_RATE; monoCache.delete(-1); } catch (_) {}
    rec.id = await DB.add(rec);
    recs.unshift(rec);
    select(rec.id);
    toast(`${rec.name} gespeichert (${fmt(rec.duration)}).`);
  }

  /* ---------- Liste ---------- */
  function select(id) {
    if (selId !== id) {
      stopSource();
      P.playing = false; P.offset = 0; P.buffer = null; P.key = null;
    }
    selId = id;
    renderList();
    ui();
  }

  function renderList() {
    const el = $('#items');
    el.innerHTML = '';
    $('#count').textContent = recs.length ? `${recs.length}` : '';
    if (!recs.length) {
      el.innerHTML = '<div class="empty">Noch keine Aufnahmen.<br>Drücke die rote Taste, um aufzunehmen.</div>';
      return;
    }
    for (const r of recs) {
      const row = document.createElement('div');
      row.className = 'item' + (r.id === selId ? ' sel' : '');
      const d = new Date(r.created);
      row.innerHTML = `<div class="meta"><b></b><small>${d.toLocaleDateString('de-DE')} ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} · ${fmt(Math.max(1, Math.round(r.duration)))}</small></div>
        <button class="act dl" title="Herunterladen">${ICON('import')}</button>
        <button class="act del" title="Löschen">${ICON('trashcan')}</button>`;
      row.querySelector('b').textContent = r.name;
      row.querySelector('b').title = 'Doppelklick zum Umbenennen';
      row.addEventListener('click', (e) => { if (!e.target.closest('.act')) select(r.id); });
      row.querySelector('.meta').addEventListener('dblclick', () => rename(r));
      row.querySelector('.dl').addEventListener('click', () => download(r));
      row.querySelector('.del').addEventListener('click', () => askDelete(r));
      el.appendChild(row);
    }
    el.querySelector('.item.sel')?.scrollIntoView({ block: 'nearest' });
  }

  function rename(r) {
    dialog(`<h2>Umbenennen</h2><p><input id="newName" maxlength="40" style="width:100%;font:inherit;padding:6px 10px;border-radius:8px;border:1px solid rgba(24,34,46,.2)"></p>
      <div class="actions"><button class="btn" data-a="close">Abbrechen</button><button class="btn primary" data-a="rename">Speichern</button></div>`);
    const inp = $('#newName');
    inp.value = r.name; inp.focus(); inp.select();
    pending = async () => {
      const v = inp.value.trim();
      if (!v) return;
      r.name = v.slice(0, 40);
      await DB.put(r);
      renderList(); ui();
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('[data-a=rename]').click(); });
  }

  function askDelete(r) {
    dialog(`<h2>Aufnahme löschen?</h2><p>„${r.name.replace(/[<>&]/g, '')}“ wird aus diesem Browser entfernt. Das kann nicht rückgängig gemacht werden.</p>
      <div class="actions"><button class="btn" data-a="close">Abbrechen</button><button class="btn primary" data-a="delete" style="background:var(--danger)">Löschen</button></div>`);
    pending = async () => {
      if (selId === r.id) { stopSource(); P.playing = false; P.buffer = null; P.key = null; P.offset = 0; selId = null; }
      await DB.del(r.id);
      recs = recs.filter(x => x.id !== r.id);
      monoCache.delete(r.id);
      for (const k of [...renderCache.keys()]) if (k.startsWith(r.id + '|')) renderCache.delete(k);
      if (!selId && recs[0]) selId = recs[0].id;
      renderList(); ui();
    };
  }

  async function download(r = selected()) {
    if (!r) return toast('Keine Aufnahme ausgewählt.');
    toast('WAV-Datei wird erstellt …');
    try {
      const { buffer } = await rendered(r);
      const blob = DSP.encodeWav(buffer.getChannelData(0), buffer.sampleRate);
      const extra = [fx !== 'none' ? DSP.EFFECTS[fx].short : '', tempo !== 1 ? tempoLabel(tempo) : ''].filter(Boolean).join(', ');
      const safe = r.name.replace(/[\\/:*?"<>|]+/g, '_');
      const a = document.createElement('a');
      a.download = `${safe}${extra ? ` (${extra})` : ''}.wav`;
      a.href = URL.createObjectURL(blob);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast(`„${a.download}“ heruntergeladen.`);
    } catch (_) {
      toast('Download fehlgeschlagen.');
    }
  }

  /* ---------- Anzeige ---------- */
  function ui() {
    const rec = selected();
    const idx = rec ? recs.indexOf(rec) : -1;
    $('#lcdIndex').textContent = recs.length ? `${String(idx + 1).padStart(2, '0')}/${String(recs.length).padStart(2, '0')}` : '--/--';
    const led = $('#led');
    led.className = 'led' + (R.active ? ' on' : P.playing ? ' play' : '');
    $('#recBtn').classList.toggle('on', R.active);
    $('#playIco').style.setProperty('--i', `url(../../assets/icons/${P.playing ? 'pause' : 'right'}.png)`);
    for (const id of ['playBtn', 'rewBtn', 'ffBtn', 'dlBtn']) $('#' + id).disabled = R.active || !recs.length;
    $('#lcdSpeed').textContent = tempoLabel(tempo);
    $('#lcdFx').textContent = 'FX ' + DSP.EFFECTS[fx].short.toUpperCase();
    document.querySelectorAll('#speedSel button').forEach(b => b.classList.toggle('on', +b.dataset.v === tempo));
    document.querySelectorAll('#fxSel button').forEach(b => b.classList.toggle('on', b.dataset.v === fx));

    if (R.active) {
      $('#lcdState').textContent = '● REC';
      $('#lcdName').textContent = 'Neue Aufnahme';
      $('#lcdTotal').textContent = '';
    } else {
      $('#lcdState').textContent = P.busy ? '… BEREITE VOR' : P.playing ? '▶ PLAY' : P.offset > 0 ? '❚❚ PAUSE' : '■ STOP';
      $('#lcdName').textContent = rec ? rec.name : recs.length ? 'Aufnahme wählen' : 'Bereit';
      $('#lcdTotal').textContent = rec ? fmt(P.buffer ? P.buffer.duration : rec.duration / tempo) : '--:--';
    }
    tick();
  }

  function tick() {
    if (R.active) {
      $('#lcdTime').textContent = fmt((performance.now() - R.t0) / 1000);
      let lvl = 0;
      if (R.analyser) {
        const a = new Float32Array(R.analyser.fftSize);
        R.analyser.getFloatTimeDomainData(a);
        for (const v of a) lvl = Math.max(lvl, Math.abs(v));
      }
      R.level = Math.max(lvl, R.level * 0.85);
      $('#meterBar').style.width = Math.min(100, R.level * 140) + '%';
    } else {
      const pos = position();
      $('#lcdTime').textContent = fmt(pos);
      $('#meterBar').style.width = P.buffer ? Math.min(100, pos / P.buffer.duration * 100) + '%' : '0%';
    }
  }
  (function loop() { if (R.active || P.playing) tick(); requestAnimationFrame(loop); })();

  /* ---------- Bedienelemente ---------- */
  for (const t of DSP.TEMPOS) {
    const b = document.createElement('button');
    b.textContent = tempoLabel(t); b.dataset.v = t;
    b.onclick = () => { if (tempo !== t) { tempo = t; settingsChanged(); } };
    $('#speedSel').appendChild(b);
  }
  for (const [k, e] of Object.entries(DSP.EFFECTS)) {
    const b = document.createElement('button');
    b.textContent = e.short; b.title = e.name; b.dataset.v = k;
    b.onclick = () => { if (fx !== k) { fx = k; settingsChanged(); } };
    $('#fxSel').appendChild(b);
  }
  $('#recBtn').onclick = () => (R.active ? stopRecording() : startRecording());
  $('#playBtn').onclick = play;
  $('#stopBtn').onclick = stop;
  $('#rewBtn').onclick = async () => { if (!P.buffer && !(await prepare(false))) return; seek(position() - 5); };
  $('#ffBtn').onclick = async () => { if (!P.buffer && !(await prepare(false))) return; seek(position() + 5); };
  $('#dlBtn').onclick = () => download();
  $('#meter').onclick = async (e) => {
    if (R.active) return;
    if (!P.buffer && !(await prepare(false))) return;
    const r = e.currentTarget.getBoundingClientRect();
    seek((e.clientX - r.left) / r.width * P.buffer.duration);
  };
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input') || !$('#dlg').hidden) return;
    if (e.code === 'Space') { e.preventDefault(); play(); }
    if (e.code === 'KeyR') { R.active ? stopRecording() : startRecording(); }
    if (e.code === 'ArrowLeft') $('#rewBtn').click();
    if (e.code === 'ArrowRight') $('#ffBtn').click();
  });

  /* ---------- Dialog & Toast ---------- */
  let pending = null;
  const dlg = $('#dlg');
  function dialog(html) { $('#dlgPanel').innerHTML = html; dlg.hidden = false; }
  dlg.addEventListener('click', async (e) => {
    const a = e.target.dataset.a;
    if (!a) return;
    const fn = pending; pending = null;
    if (a !== 'close' && fn) await fn();
    dlg.hidden = true;
  });
  let toastT;
  function toast(t) {
    const el = $('#toast'); el.textContent = t; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2800);
  }

  /* ---------- Start ---------- */
  (async () => {
    try { recs = (await DB.all()).sort((a, b) => b.created - a.created); } catch (_) { recs = []; }
    if (!(await DB.persistent())) $('#note').textContent = 'Hinweis: Dieser Browser erlaubt keine dauerhafte Speicherung – Aufnahmen gehen beim Schließen verloren. Lade sie herunter, um sie zu behalten.';
    if (recs[0]) selId = recs[0].id;
    renderList();
    ui();
  })();
})();
