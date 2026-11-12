/* LoopStudio – kleines Musikprogramm: Spuren, Loops im 1/16-Raster, Arrangement, Mixer. */
(() => {
  'use strict';
  const A = window.LoopAudio;
  const $ = (s, el = document) => el.querySelector(s);
  const uid = () => Math.random().toString(36).slice(2, 9);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- Projekt ---------- */
  function newTrack(type, name) {
    const p = { id: uid(), name: 'Loop 1', len: 16, notes: [] };
    return { id: uid(), name: name || A.TYPES[type].name, type, vol: 0.8, mute: false, solo: false,
      fx: { reverb: 0, radio: 0, phaser: 0 }, patterns: [p], cur: p.id, clips: [] };
  }

  function demo() {
    const d = newTrack('drums');
    const dp = d.patterns[0]; dp.name = 'Beat';
    for (const s of [0, 4, 8, 12]) dp.notes.push({ s, r: 0, l: 1 });
    for (const s of [4, 12]) dp.notes.push({ s, r: 1, l: 1 });
    for (let s = 0; s < 16; s += 2) dp.notes.push({ s, r: 3, l: 1 });
    dp.notes.push({ s: 14, r: 4, l: 1 }, { s: 15, r: 0, l: 1 });
    d.fx.reverb = 0.15;
    const b = newTrack('bass');
    const bp = b.patterns[0]; bp.name = 'Groove'; bp.len = 32;
    // A-Moll / F-Dur (Basis C2: A = 9, F = 5, G = 7, E = 4)
    [[0, 9, 2], [3, 9, 1], [6, 21, 1], [8, 9, 2], [11, 7, 1], [14, 4, 2],
     [16, 5, 2], [19, 5, 1], [22, 17, 1], [24, 5, 2], [27, 7, 1], [30, 7, 2]].forEach(([s, r, l]) => bp.notes.push({ s, r, l }));
    const st = newTrack('strings');
    const sp = st.patterns[0]; sp.name = 'Akkorde'; sp.len = 32;
    for (const r of [9, 12, 16]) sp.notes.push({ s: 0, r, l: 16 });
    for (const r of [5, 9, 12]) sp.notes.push({ s: 16, r, l: 16 });
    st.vol = 0.55; st.fx.reverb = 0.5; st.fx.phaser = 0.25;
    const m = newTrack('melo');
    const mp = m.patterns[0]; mp.name = 'Hook'; mp.len = 32;
    [[0, 16, 2], [2, 19, 2], [4, 21, 4], [10, 19, 2], [12, 16, 4], [16, 17, 2], [18, 16, 2], [20, 14, 4], [26, 12, 2], [28, 14, 4]]
      .forEach(([s, r, l]) => mp.notes.push({ s, r, l }));
    m.vol = 0.6; m.fx.reverb = 0.35;
    for (let bar = 0; bar < 8; bar++) d.clips.push({ bar, pat: dp.id });
    for (let bar = 2; bar < 8; bar += 2) b.clips.push({ bar, pat: bp.id });
    for (let bar = 0; bar < 8; bar += 2) st.clips.push({ bar, pat: sp.id });
    for (let bar = 4; bar < 8; bar += 2) m.clips.push({ bar, pat: mp.id });
    return { app: 'LoopStudio', version: 1, bpm: 110, bars: 16, master: 0.85, tracks: [d, b, st, m], sel: d.id };
  }

  function validate(o) {
    if (!o || o.app !== 'LoopStudio' || !Array.isArray(o.tracks)) throw new Error('Keine LoopStudio-Datei.');
    const out = { app: 'LoopStudio', version: 1, bpm: clamp(+o.bpm || 110, 40, 240), bars: [8, 16, 32, 64].includes(+o.bars) ? +o.bars : 16,
      master: Number.isFinite(+o.master) ? clamp(+o.master, 0, 1) : 0.85, tracks: [], sel: null };
    for (const t of o.tracks.slice(0, 32)) {
      if (!A.TYPES[t.type]) continue;
      const rows = A.rowCount(t.type);
      const tr = { id: uid(), name: String(t.name || A.TYPES[t.type].name).slice(0, 30), type: t.type,
        vol: Number.isFinite(+t.vol) ? clamp(+t.vol, 0, 1) : 0.8, mute: !!t.mute, solo: !!t.solo,
        fx: { reverb: clamp(+t.fx?.reverb || 0, 0, 1), radio: clamp(+t.fx?.radio || 0, 0, 1), phaser: clamp(+t.fx?.phaser || 0, 0, 1) },
        patterns: [], cur: null, clips: [] };
      const idMap = {};
      for (const p of (t.patterns || []).slice(0, 64)) {
        const len = [16, 32, 64].includes(+p.len) ? +p.len : 16;
        const np = { id: uid(), name: String(p.name || 'Loop').slice(0, 30), len,
          notes: (p.notes || []).filter(n => n.s >= 0 && n.s < len && n.r >= 0 && n.r < rows).slice(0, 2000)
            .map(n => ({ s: n.s | 0, r: n.r | 0, l: clamp(n.l | 0 || 1, 1, len - (n.s | 0)) })) };
        idMap[p.id] = np.id;
        tr.patterns.push(np);
      }
      if (!tr.patterns.length) tr.patterns.push({ id: uid(), name: 'Loop 1', len: 16, notes: [] });
      tr.cur = idMap[t.cur] || tr.patterns[0].id;
      tr.clips = (t.clips || []).filter(c => idMap[c.pat] && c.bar >= 0 && c.bar < 64).map(c => ({ bar: c.bar | 0, pat: idMap[c.pat] }));
      out.tracks.push(tr);
    }
    out.sel = out.tracks[0]?.id || null;
    return out;
  }

  let S;
  try { S = validate(JSON.parse(localStorage.getItem('loopstudio.project'))); } catch (_) { S = demo(); }
  let saveT;
  function changed() {
    clearTimeout(saveT);
    saveT = setTimeout(() => { try { localStorage.setItem('loopstudio.project', JSON.stringify(S)); } catch (_) {} }, 400);
  }

  const track = (id = S.sel) => S.tracks.find(t => t.id === id) || null;
  const pattern = (t, id = t?.cur) => t?.patterns.find(p => p.id === id) || null;
  const anySolo = () => S.tracks.some(t => t.solo);
  const audible = (t) => !t.mute && (!anySolo() || t.solo);
  function syncAudio() { if (!A.ctx) return; S.tracks.forEach(t => { A.chain(t); A.update(t, audible(t)); }); A.setMaster(S.master); }

  /* ---------- Abspielen ---------- */
  const P = { state: 'stop', loop: false, mode: 'song', step: 0, next: 0, timer: null, queue: [], endAt: null };
  const stepDur = () => 60 / S.bpm / 4;

  function songEnd() {
    let end = 0;
    for (const t of S.tracks) for (const c of t.clips) {
      const p = pattern(t, c.pat);
      if (p) end = Math.max(end, c.bar * 16 + p.len);
    }
    return Math.min(end || 16, S.bars * 16);
  }
  const endStep = () => P.mode === 'pattern' ? (pattern(track())?.len || 16) : songEnd();

  function playStep(step, time) {
    const d = stepDur();
    const fire = (t, p, ps) => { for (const n of p.notes) if (n.s === ps) A.trigger(t, n.r, time, n.l * d * 0.95); };
    if (P.mode === 'pattern') {
      const t = track(), p = pattern(t);
      if (t && p && audible(t)) fire(t, p, step);
      return;
    }
    const bar = Math.floor(step / 16);
    for (const t of S.tracks) {
      if (!audible(t)) continue;
      for (const c of t.clips) {
        const p = pattern(t, c.pat);
        if (!p || bar < c.bar || step >= c.bar * 16 + p.len) continue;
        fire(t, p, step - c.bar * 16);
      }
    }
  }

  function schedule() {
    const ctx = A.ctx;
    while (P.next < ctx.currentTime + 0.12) {
      if (P.endAt !== null) break;
      playStep(P.step, P.next);
      P.queue.push({ step: P.step, time: P.next });
      if (P.queue.length > 64) P.queue.shift();
      P.step++;
      P.next += stepDur();
      if (P.step >= endStep()) {
        if (P.loop) P.step = 0;
        else { P.endAt = P.next; break; }
      }
    }
    if (P.endAt !== null && ctx.currentTime >= P.endAt) stop();
  }

  async function play(loop) {
    A.init();
    syncAudio();
    await A.ctx.resume?.();
    P.loop = loop;
    if (P.state === 'play') { ui(); return; }
    if (P.state === 'stop') { P.step = 0; P.queue = []; }
    if (P.step >= endStep()) P.step = 0;
    P.endAt = null;
    P.next = A.ctx.currentTime + 0.06;
    P.state = 'play';
    clearInterval(P.timer);
    P.timer = setInterval(schedule, 25);
    schedule();
    ui();
  }
  function pause() {
    if (P.state !== 'play') return;
    clearInterval(P.timer);
    const cur = currentStep();
    P.shown = cur == null ? P.step : cur;
    P.step = cur == null ? P.step : (cur + 1) % Math.max(1, endStep());
    P.state = 'pause';
    ui();
  }
  function stop() {
    clearInterval(P.timer);
    P.state = 'stop'; P.step = 0; P.queue = []; P.endAt = null;
    ui();
  }
  function currentStep() {
    if (!A.ctx || !P.queue.length) return null;
    const now = A.ctx.currentTime;
    let cur = null;
    for (const q of P.queue) if (q.time <= now) cur = q.step;
    return cur;
  }

  /* ---------- Drehregler ---------- */
  function knob(label, value, onChange, color = '#7fe0a8') {
    const el = document.createElement('div');
    el.className = 'knob'; el.tabIndex = 0; el.title = `${label}: ziehen, Mausrad oder Pfeiltasten · Doppelklick = 0`;
    el.setAttribute('role', 'slider'); el.setAttribute('aria-label', label);
    el.innerHTML = `<svg viewBox="0 0 30 30"><circle cx="15" cy="15" r="11" fill="#1b2026" stroke="#46505d" stroke-width="1.5"/><path class="arc" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/><line class="ptr" x1="15" y1="15" x2="15" y2="6" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg><small>${label}</small>`;
    const arc = $('.arc', el), ptr = $('.ptr', el);
    let v = value;
    const draw = () => {
      const a0 = -135, a1 = -135 + 270 * v;
      const pt = (a) => [15 + 12.5 * Math.sin(a * Math.PI / 180), 15 - 12.5 * Math.cos(a * Math.PI / 180)];
      const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
      arc.setAttribute('d', v > 0.001 ? `M${x0} ${y0} A12.5 12.5 0 ${270 * v > 180 ? 1 : 0} 1 ${x1} ${y1}` : '');
      ptr.setAttribute('transform', `rotate(${a1} 15 15)`);
      el.setAttribute('aria-valuenow', Math.round(v * 100));
    };
    const set = (nv) => { v = clamp(nv, 0, 1); draw(); onChange(v); };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      const y0 = e.clientY, v0 = v;
      const mv = (ev) => set(v0 + (y0 - ev.clientY) / 140);
      const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); };
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
    });
    el.addEventListener('click', (e) => e.stopPropagation());
    el.addEventListener('dblclick', (e) => { e.stopPropagation(); set(0); });
    el.addEventListener('wheel', (e) => { e.preventDefault(); set(v - Math.sign(e.deltaY) * 0.05); }, { passive: false });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); set(v + 0.05); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); set(v - 0.05); }
    });
    draw();
    return el;
  }

  /* ---------- Arrangement ---------- */
  const BW = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bw')) || 48;

  function renderArr() {
    const el = $('#arr');
    el.innerHTML = '';
    const ruler = document.createElement('div');
    ruler.className = 'ruler';
    ruler.innerHTML = '<div class="corner"></div>' + Array.from({ length: S.bars }, (_, i) => `<div class="bar" data-bar="${i}" title="Ab hier abspielen">${i + 1}</div>`).join('');
    el.appendChild(ruler);
    ruler.addEventListener('click', (e) => {
      const b = e.target.dataset.bar;
      if (b == null) return;
      P.mode = 'song'; P.step = +b * 16; P.shown = P.step; P.queue = [];
      if (P.state === 'stop') P.state = 'pause';
      if (P.state === 'play') { P.next = A.ctx.currentTime + 0.05; }
      ui();
    });
    if (!S.tracks.length) {
      el.insertAdjacentHTML('beforeend', '<div class="empty-arr">Noch keine Spuren. Lege oben rechts mit „+ Spur hinzufügen“ eine Spur an – danach kannst du Loops bauen und hier in die Takte eintragen.</div>');
    }
    for (const t of S.tracks) {
      const row = document.createElement('div');
      row.className = 'trow';
      const head = document.createElement('div');
      head.className = 'thead' + (t.id === S.sel ? ' sel' : '');
      head.innerHTML = `<span class="color" style="background:${A.TYPES[t.type].color}"></span>
        <div class="info"><b title="Doppelklick zum Umbenennen">${esc(t.name)}</b><small>${A.TYPES[t.type].name}</small></div>
        <div class="ms"><button class="m${t.mute ? ' on' : ''}" title="Stumm">M</button><button class="s${t.solo ? ' on' : ''}" title="Solo">S</button></div>`;
      const knobs = document.createElement('div');
      knobs.style.display = 'flex'; knobs.style.gap = '4px';
      for (const [k, lbl] of [['reverb', 'Hall'], ['radio', 'Radio'], ['phaser', 'Phaser']]) {
        knobs.appendChild(knob(lbl, t.fx[k], (v) => { t.fx[k] = v; if (A.ctx) A.update(t, audible(t)); changed(); }, A.TYPES[t.type].color));
      }
      head.appendChild(knobs);
      head.insertAdjacentHTML('beforeend', '<button class="del" title="Spur löschen">✕</button>');
      head.addEventListener('click', () => selectTrack(t.id));
      $('.info b', head).addEventListener('dblclick', () => renameTrack(t));
      $('.m', head).addEventListener('click', (e) => { e.stopPropagation(); t.mute = !t.mute; syncAudio(); changed(); renderArr(); renderMixer(); });
      $('.s', head).addEventListener('click', (e) => { e.stopPropagation(); t.solo = !t.solo; syncAudio(); changed(); renderArr(); renderMixer(); });
      $('.del', head).addEventListener('click', (e) => { e.stopPropagation(); deleteTrack(t); });

      const lane = document.createElement('div');
      lane.className = 'lane';
      lane.style.width = S.bars * BW() + 'px';
      lane.title = 'Klick: aktuellen Loop dieser Spur eintragen · Doppelklick auf einen Block: entfernen';
      for (const c of t.clips) {
        const p = pattern(t, c.pat);
        if (!p || c.bar >= S.bars) continue;
        const clip = document.createElement('div');
        clip.className = 'clip' + (p.id === t.cur && t.id === S.sel ? ' cur' : '');
        clip.style.left = c.bar * BW() + 1 + 'px';
        clip.style.width = Math.min(p.len / 16, S.bars - c.bar) * BW() - 2 + 'px';
        clip.style.background = A.TYPES[t.type].color;
        clip.innerHTML = `<span>${esc(p.name)}</span>`;
        clip.appendChild(miniPreview(t, p));
        clip.addEventListener('click', (e) => { e.stopPropagation(); t.cur = p.id; selectTrack(t.id); });
        clip.addEventListener('dblclick', (e) => { e.stopPropagation(); removeClip(t, c); });
        clip.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); removeClip(t, c); });
        lane.appendChild(clip);
      }
      lane.addEventListener('click', (e) => {
        const bar = Math.floor(e.offsetX / BW());
        if (bar < 0 || bar >= S.bars) return;
        placeClip(t, bar);
      });
      row.append(head, lane);
      el.appendChild(row);
    }
    const ph = document.createElement('div');
    ph.className = 'playhead'; ph.id = 'playhead'; ph.style.display = 'none';
    el.appendChild(ph);
  }

  function miniPreview(t, p) {
    const c = document.createElement('canvas');
    const rows = A.rowCount(t.type);
    c.width = p.len * 2; c.height = rows * 2;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,.85)';
    for (const n of p.notes) g.fillRect(n.s * 2, (rows - 1 - n.r) * 2, Math.max(1, n.l * 2 - 0.5), 2);
    return c;
  }

  function placeClip(t, bar) {
    let p = pattern(t);
    if (!p) return;
    const span = p.len / 16;
    // überlappende Blöcke dieser Spur entfernen
    t.clips = t.clips.filter(c => {
      const cp = pattern(t, c.pat), cl = cp ? cp.len / 16 : 1;
      return c.bar + cl <= bar || c.bar >= bar + span;
    });
    t.clips.push({ bar, pat: p.id });
    t.clips.sort((a, b) => a.bar - b.bar);
    S.sel = t.id;
    changed();
    renderArr(); renderEditor();
  }
  function removeClip(t, c) {
    t.clips = t.clips.filter(x => x !== c);
    changed(); renderArr();
  }

  function selectTrack(id) {
    S.sel = id;
    changed();
    renderArr(); renderEditor();
  }

  function addTrack(type) {
    const n = S.tracks.filter(t => t.type === type).length;
    const t = newTrack(type, A.TYPES[type].name + (n ? ' ' + (n + 1) : ''));
    S.tracks.push(t);
    S.sel = t.id;
    if (A.ctx) syncAudio();
    changed();
    renderAll();
    toast(`Spur „${t.name}“ angelegt. Setze im Pattern-Editor Noten und trage den Loop im Arrangement ein.`);
  }

  function deleteTrack(t) {
    dialog(`<h2>Spur löschen?</h2><p>„${esc(t.name)}“ mit allen Loops wird entfernt.</p>
      <div class="actions"><button class="btn" data-a="close">Abbrechen</button><button class="btn primary" data-a="ok" style="background:var(--danger)">Löschen</button></div>`, () => {
      S.tracks = S.tracks.filter(x => x !== t);
      A.remove(t.id);
      if (S.sel === t.id) S.sel = S.tracks[0]?.id || null;
      changed(); renderAll();
    });
  }
  function renameTrack(t) {
    ask('Spur umbenennen', t.name, (v) => { t.name = v; changed(); renderArr(); renderEditor(); renderMixer(); });
  }

  /* ---------- Pattern-Editor ---------- */
  const isPiano = (t) => !A.TYPES[t.type].rows;
  const CW = 24;
  let rowH = 18;

  function renderEditorTools() {
    const el = $('#edTools');
    const t = track(), p = pattern(t);
    if (!t || !p || $('#editorView').hidden) { el.innerHTML = ''; return; }
    el.innerHTML = `<select class="btn" id="patSel" title="Loop dieser Spur">${t.patterns.map(x => `<option value="${x.id}"${x.id === p.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <button class="btn" id="patNew" title="Neuer leerer Loop">Neu</button>
      <button class="btn" id="patDup" title="Loop duplizieren">Kopie</button>
      <button class="btn" id="patRen" title="Loop umbenennen">Name</button>
      <button class="btn" id="patDel" title="Loop löschen">Löschen</button>
      <span class="seg" id="lenSeg" title="Länge des Loops">${[16, 32, 64].map(l => `<button data-l="${l}" class="${p.len === l ? 'on' : ''}">${l / 16} T</button>`).join('')}</span>
      <button class="btn" id="patClr" title="Alle Noten entfernen">Leeren</button>`;
    $('#patSel').onchange = (e) => { t.cur = e.target.value; changed(); renderArr(); renderEditor(); };
    $('#patNew').onclick = () => { const np = { id: uid(), name: 'Loop ' + (t.patterns.length + 1), len: p.len, notes: [] }; t.patterns.push(np); t.cur = np.id; changed(); renderArr(); renderEditor(); };
    $('#patDup').onclick = () => { const np = { id: uid(), name: p.name + ' Kopie', len: p.len, notes: p.notes.map(n => ({ ...n })) }; t.patterns.push(np); t.cur = np.id; changed(); renderArr(); renderEditor(); };
    $('#patRen').onclick = () => ask('Loop umbenennen', p.name, (v) => { p.name = v; changed(); renderArr(); renderEditor(); });
    $('#patDel').onclick = () => {
      if (t.patterns.length < 2) return toast('Eine Spur braucht mindestens einen Loop.');
      t.patterns = t.patterns.filter(x => x !== p);
      t.clips = t.clips.filter(c => c.pat !== p.id);
      t.cur = t.patterns[0].id; changed(); renderArr(); renderEditor();
    };
    $('#lenSeg').onclick = (e) => {
      const l = +e.target.dataset.l; if (!l) return;
      p.len = l; p.notes = p.notes.filter(n => n.s < l).map(n => ({ ...n, l: Math.min(n.l, l - n.s) }));
      changed(); renderArr(); renderEditor();
    };
    $('#patClr').onclick = () => { p.notes = []; changed(); renderArr(); renderEditor(); };
  }

  function renderEditor() {
    renderEditorTools();
    const ed = $('#ed');
    ed.innerHTML = '';
    const t = track(), p = pattern(t);
    if (!t || !p) { ed.innerHTML = '<div class="ed-empty">Wähle oder lege eine Spur an, um einen Loop zu bearbeiten.</div>'; return; }
    const rows = A.rowCount(t.type);
    rowH = isPiano(t) ? 18 : 28;
    ed.style.setProperty('--rh', rowH + 'px');
    ed.style.setProperty('--cw', CW + 'px');
    const keys = document.createElement('div');
    keys.className = 'keys';
    for (let dr = 0; dr < rows; dr++) {
      const r = rows - 1 - dr;
      const k = document.createElement('div');
      if (isPiano(t)) {
        const m = A.TYPES[t.type].base + r, black = [1, 3, 6, 8, 10].includes(m % 12);
        k.className = 'key ' + (black ? 'black' : 'white') + (m % 12 === 0 ? ' c' : '');
        k.textContent = A.midiName(m);
      } else {
        k.className = 'key';
        k.textContent = A.TYPES[t.type].rows[r];
      }
      k.addEventListener('pointerdown', () => preview(t, r));
      keys.appendChild(k);
    }
    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.style.width = p.len * CW + 'px';
    grid.style.height = rows * rowH + 'px';
    if (isPiano(t)) for (let dr = 0; dr < rows; dr++) {
      const m = A.TYPES[t.type].base + rows - 1 - dr;
      if ([1, 3, 6, 8, 10].includes(m % 12)) { const s = document.createElement('div'); s.className = 'stripe'; s.style.top = dr * rowH + 'px'; grid.appendChild(s); }
    }
    drawNotes(grid, t, p, rows);
    const sc = document.createElement('div'); sc.className = 'stepcol'; sc.id = 'stepcol'; sc.style.display = 'none';
    grid.appendChild(sc);
    attachGrid(grid, t, p, rows);
    ed.append(keys, grid);
  }

  function drawNotes(grid, t, p, rows) {
    grid.querySelectorAll('.note').forEach(n => n.remove());
    const col = A.TYPES[t.type].color;
    for (const n of p.notes) grid.appendChild(noteEl(n, rows, col));
  }

  function noteEl(n, rows, color) {
    const d = document.createElement('div');
    d.className = 'note';
    d.style.left = n.s * CW + 1 + 'px';
    d.style.top = (rows - 1 - n.r) * rowH + 'px';
    d.style.width = n.l * CW - 2 + 'px';
    d.style.background = color;
    return d;
  }

  function attachGrid(grid, t, p, rows) {
    const cell = (e) => {
      const r = grid.getBoundingClientRect();
      return { s: clamp(Math.floor((e.clientX - r.left) / CW), 0, p.len - 1), r: clamp(rows - 1 - Math.floor((e.clientY - r.top) / rowH), 0, rows - 1) };
    };
    const at = (s, r) => p.notes.find(n => n.r === r && s >= n.s && s < n.s + n.l);
    grid.addEventListener('contextmenu', (e) => e.preventDefault());
    grid.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      grid.setPointerCapture(e.pointerId);
      const c = cell(e);
      const hit = at(c.s, c.r);
      let mode, note = null;
      if (hit || e.button === 2) {
        mode = 'erase';
        if (hit) p.notes = p.notes.filter(n => n !== hit);
      } else {
        mode = isPiano(t) ? 'stretch' : 'paint';
        note = { s: c.s, r: c.r, l: 1 };
        p.notes.push(note);
        preview(t, c.r);
      }
      const redraw = () => drawNotes(grid, t, p, rows);
      redraw();
      const mv = (ev) => {
        const d = cell(ev);
        if (mode === 'stretch') {
          const l = clamp(d.s - note.s + 1, 1, p.len - note.s);
          if (l !== note.l) {
            // keine Überlappung mit Folgenoten derselben Zeile
            const next = p.notes.filter(n => n !== note && n.r === note.r && n.s > note.s).reduce((m, n) => Math.min(m, n.s), p.len);
            note.l = Math.min(l, next - note.s);
            redraw();
          }
        } else if (mode === 'paint') {
          if (!at(d.s, c.r)) { p.notes.push({ s: d.s, r: c.r, l: 1 }); redraw(); }
        } else {
          const h = at(d.s, d.r);
          if (h) { p.notes = p.notes.filter(n => n !== h); redraw(); }
        }
      };
      const up = () => {
        grid.removeEventListener('pointermove', mv); grid.removeEventListener('pointerup', up); grid.removeEventListener('pointercancel', up);
        changed(); renderArr();
      };
      grid.addEventListener('pointermove', mv); grid.addEventListener('pointerup', up); grid.addEventListener('pointercancel', up);
    });
  }

  function preview(t, r) {
    A.init(); syncAudio(); A.ctx.resume?.();
    A.trigger(t, r, A.ctx.currentTime + 0.01, 0.3);
  }

  /* ---------- Mixer ---------- */
  function strip(name, color, value, onInput, t) {
    const s = document.createElement('div');
    s.className = 'strip' + (t ? '' : ' master');
    if (color) s.style.setProperty('--c', color);
    s.innerHTML = `<div class="nm" title="${esc(name)}">${esc(name)}</div>
      <div class="fader"><input type="range" min="0" max="100" value="${Math.round(value * 100)}" aria-label="Lautstärke ${esc(name)}"><div class="vu"><i></i></div></div>
      <div class="val">${Math.round(value * 100)} %</div>`;
    const inp = $('input', s), val = $('.val', s);
    inp.addEventListener('input', () => { val.textContent = inp.value + ' %'; onInput(inp.value / 100); });
    if (t) {
      const ms = document.createElement('div');
      ms.className = 'ms';
      ms.innerHTML = `<button class="m${t.mute ? ' on' : ''}" title="Stumm">M</button><button class="s${t.solo ? ' on' : ''}" title="Solo">S</button>`;
      $('.m', ms).onclick = () => { t.mute = !t.mute; syncAudio(); changed(); renderArr(); renderMixer(); };
      $('.s', ms).onclick = () => { t.solo = !t.solo; syncAudio(); changed(); renderArr(); renderMixer(); };
      s.appendChild(ms);
      s.dataset.id = t.id;
    } else s.dataset.id = 'master';
    return s;
  }
  function renderMixer() {
    const el = $('#mixer');
    el.innerHTML = '';
    for (const t of S.tracks) el.appendChild(strip(t.name, A.TYPES[t.type].color, t.vol, (v) => { t.vol = v; if (A.ctx) A.update(t, audible(t)); changed(); }, t));
    el.appendChild(strip('Master', '#ffffff', S.master, (v) => { S.master = v; if (A.ctx) A.setMaster(v); changed(); }, null));
  }

  /* ---------- Anzeige-Schleife ---------- */
  function ui() {
    $('#playBtn').classList.toggle('on', P.state === 'play' && !P.loop);
    $('#loopBtn').classList.toggle('on', P.state === 'play' && P.loop);
    $('#pauseBtn').classList.toggle('on', P.state === 'pause');
    document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.m === P.mode));
  }
  function frame() {
    const cur = P.state === 'play' ? currentStep() : P.state === 'pause' ? (P.shown ?? P.step) : null;
    const step = cur ?? 0;
    $('#pos').textContent = `${Math.floor(step / 16) + 1}.${Math.floor(step % 16 / 4) + 1}.${step % 4 + 1}`;
    const ph = $('#playhead');
    if (ph) {
      if (cur != null && P.mode === 'song') { ph.style.display = ''; ph.style.left = `calc(var(--hdr) + ${(step / 16) * BW()}px)`; }
      else ph.style.display = 'none';
    }
    const sc = $('#stepcol');
    if (sc) {
      let ps = null;
      const t = track(), p = pattern(t);
      if (cur != null && p) {
        if (P.mode === 'pattern') ps = cur;
        else {
          const c = t.clips.find(c => c.pat === p.id && cur >= c.bar * 16 && cur < c.bar * 16 + p.len);
          if (c) ps = cur - c.bar * 16;
        }
      }
      sc.style.display = ps == null ? 'none' : '';
      if (ps != null) sc.style.left = ps * CW + 'px';
    }
    if (!$('#mixerView').hidden && A.ctx) {
      document.querySelectorAll('.strip').forEach(s => {
        const lv = s.dataset.id === 'master' ? A.masterLevel() : A.level(A.analyser(s.dataset.id));
        const i = $('.vu i', s);
        const prev = +i.dataset.v || 0, v = Math.max(lv, prev * 0.9);
        i.dataset.v = v;
        i.style.height = Math.min(100, v * 110) + '%';
        i.style.setProperty('--vh', $('.vu', s).clientHeight + 'px');
      });
    }
    requestAnimationFrame(frame);
  }

  function renderAll() {
    $('#bpm').value = S.bpm;
    $('#bars').value = S.bars;
    renderArr(); renderEditor(); renderMixer(); ui();
  }

  /* ---------- Speichern / Laden ---------- */
  function download() {
    const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date(), pad = (n) => String(n).padStart(2, '0');
    a.download = `loopstudio-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast('Setup heruntergeladen. Mit „Laden“ kannst du es in jedem Browser wieder öffnen.');
  }
  async function loadFile(f) {
    try {
      const o = validate(JSON.parse(await f.text()));
      stop();
      S.tracks.forEach(t => A.remove(t.id));
      S = o;
      changed(); syncAudio(); renderAll();
      toast(`Setup „${f.name}“ geladen (${S.tracks.length} Spuren).`);
    } catch (e) {
      toast('Die Datei konnte nicht geladen werden: ' + (e.message || 'ungültiges Format'));
    }
  }

  /* ---------- Dialog & Toast ---------- */
  let pending = null;
  const dlg = $('#dlg');
  function dialog(html, onOk) { $('#dlgPanel').innerHTML = html; dlg.hidden = false; pending = onOk || null; }
  function ask(title, value, onOk) {
    dialog(`<h2>${title}</h2><p><input type="text" id="askIn" maxlength="30"></p>
      <div class="actions"><button class="btn" data-a="close">Abbrechen</button><button class="btn primary" data-a="ok">OK</button></div>`, () => {
      const v = $('#askIn').value.trim();
      if (v) onOk(v.slice(0, 30));
    });
    const i = $('#askIn'); i.value = value; i.focus(); i.select();
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('[data-a=ok]').click(); });
  }
  dlg.addEventListener('click', (e) => {
    const a = e.target.dataset.a;
    if (!a) return;
    const fn = pending; pending = null;
    dlg.hidden = true;
    if (a === 'ok' && fn) fn();
  });
  let toastT;
  function toast(t) {
    const el = $('#toast'); el.textContent = t; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 3200);
  }

  /* ---------- Ereignisse ---------- */
  $('#playBtn').onclick = () => play(false);
  $('#loopBtn').onclick = () => play(true);
  $('#pauseBtn').onclick = pause;
  $('#stopBtn').onclick = stop;
  $('#modeSeg').onclick = (e) => {
    const m = e.target.dataset.m;
    if (!m || m === P.mode) return;
    P.mode = m; P.step = 0; P.shown = 0; P.queue = [];
    if (P.state === 'play') P.next = A.ctx.currentTime + 0.05;
    ui();
  };
  $('#bpm').onchange = (e) => { S.bpm = clamp(+e.target.value || 110, 40, 240); e.target.value = S.bpm; changed(); };
  $('#bars').onchange = (e) => { S.bars = +e.target.value; changed(); renderArr(); };
  $('#addTrack').onchange = (e) => { if (e.target.value) addTrack(e.target.value); e.target.value = ''; };
  $('#newBtn').onclick = () => dialog(`<h2>Neues Projekt</h2><p>Alle Spuren und Loops werden entfernt. Lade dein aktuelles Setup vorher herunter, wenn du es behalten möchtest.</p>
      <div class="actions"><button class="btn" data-a="close">Abbrechen</button><button class="btn" id="demoBtn">Demo laden</button><button class="btn primary" data-a="ok">Leeres Projekt</button></div>`, () => {
    stop(); S.tracks.forEach(t => A.remove(t.id));
    S = { app: 'LoopStudio', version: 1, bpm: 110, bars: 16, master: 0.85, tracks: [], sel: null };
    changed(); renderAll();
  });
  document.addEventListener('click', (e) => {
    if (e.target.id !== 'demoBtn') return;
    dlg.hidden = true; pending = null;
    stop(); S.tracks.forEach(t => A.remove(t.id));
    S = demo(); changed(); syncAudio(); renderAll();
  });
  $('#saveBtn').onclick = download;
  $('#loadBtn').onclick = () => $('#file').click();
  $('#file').onchange = (e) => { const f = e.target.files[0]; if (f) loadFile(f); e.target.value = ''; };
  $('#tabs').onclick = (e) => {
    const v = e.target.closest('button')?.dataset.v;
    if (!v) return;
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    $('#editorView').hidden = v !== 'editor';
    $('#mixerView').hidden = v !== 'mixer';
    if (v === 'mixer') renderMixer();
    renderEditorTools();
  };
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea') || !dlg.hidden) return;
    if (e.code === 'Space') { e.preventDefault(); P.state === 'play' ? pause() : play(P.loop); }
  });

  renderAll();
  requestAnimationFrame(frame);
})();
