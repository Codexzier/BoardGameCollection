/* SketchPainter – einfaches Malprogramm mit 16-Farben-Palette und 24-Bit-Farbwahl. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const cv = $('#cv'), ov = $('#ov');
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const octx = ov.getContext('2d');
  const stage = $('#stage');

  // Standard-16-Farbpalette (VGA / klassisches Malprogramm)
  const PALETTE = ['#000000', '#808080', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080',
                   '#ffffff', '#c0c0c0', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff'];

  const state = {
    tool: 'pencil', size: 4, fill: 'stroke',
    colors: ['#000000', '#ffffff'], active: 0,
    zoom: 1,
  };
  const undo = [], redo = [];
  const MAX_UNDO = 40;

  /* ---------- Leinwand ---------- */
  function newCanvas(w, h, keepHistory = false) {
    cv.width = ov.width = w;
    cv.height = ov.height = h;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    if (!keepHistory) { undo.length = 0; redo.length = 0; }
    fitZoom();
    updateUI();
  }

  function snapshot() {
    undo.push(ctx.getImageData(0, 0, cv.width, cv.height));
    if (undo.length > MAX_UNDO) undo.shift();
    redo.length = 0;
    updateUI();
  }
  function restore(from, to) {
    if (!from.length) return;
    to.push(ctx.getImageData(0, 0, cv.width, cv.height));
    const img = from.pop();
    if (img.width !== cv.width || img.height !== cv.height) { cv.width = ov.width = img.width; cv.height = ov.height = img.height; applyZoom(); }
    ctx.putImageData(img, 0, 0);
    updateUI();
  }

  function setZoom(z) {
    state.zoom = Math.max(0.1, Math.min(8, z));
    applyZoom();
  }
  function applyZoom() {
    const w = cv.width * state.zoom, h = cv.height * state.zoom;
    for (const c of [cv, ov]) { c.style.width = w + 'px'; c.style.height = h + 'px'; }
    stage.classList.toggle('pixel', state.zoom >= 2);
    $('#zoomLbl').textContent = Math.round(state.zoom * 100) + '%';
    $('#stSize').textContent = `${cv.width} × ${cv.height} px`;
  }
  function fitZoom() {
    const m = innerWidth < 720 ? 24 : 48;
    const z = Math.min(1, (stage.clientWidth - m) / cv.width, (stage.clientHeight - m) / cv.height);
    setZoom(z > 0 ? z : 1);
  }

  /* ---------- Farben ---------- */
  const hexToRgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('');

  function setColor(slot, hex) {
    state.colors[slot] = hex.toLowerCase();
    updateUI();
  }
  function updateUI() {
    $('#slot0').style.background = state.colors[0];
    $('#slot1').style.background = state.colors[1];
    $('#slot0').classList.toggle('active', state.active === 0);
    $('#slot1').classList.toggle('active', state.active === 1);
    const c = state.colors[state.active];
    const [r, g, b] = hexToRgb(c);
    if (document.activeElement !== $('#hex')) $('#hex').value = c;
    $('#picker').value = c;
    for (const [id, v] of [['r', r], ['g', g], ['b', b]]) if (document.activeElement !== $('#' + id)) $('#' + id).value = v;
    $('#undoBtn').disabled = !undo.length;
    $('#redoBtn').disabled = !redo.length;
  }

  const pal = $('#palette');
  for (const c of PALETTE) {
    const b = document.createElement('button');
    b.style.background = c;
    b.title = c;
    b.addEventListener('click', () => setColor(state.active, c));
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); setColor(1, c); });
    pal.appendChild(b);
  }
  $('#slot0').onclick = () => { state.active = 0; updateUI(); };
  $('#slot1').onclick = () => { state.active = 1; updateUI(); };
  $('#swapBtn').onclick = () => { state.colors.reverse(); updateUI(); };
  $('#picker').addEventListener('input', (e) => setColor(state.active, e.target.value));
  $('#hex').addEventListener('input', (e) => {
    let v = e.target.value.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (/^#[0-9a-f]{6}$/i.test(v)) setColor(state.active, v);
    else if (/^#[0-9a-f]{3}$/i.test(v)) setColor(state.active, '#' + [...v.slice(1)].map(x => x + x).join(''));
  });
  $('#hex').addEventListener('blur', updateUI);
  for (const id of ['r', 'g', 'b']) {
    $('#' + id).addEventListener('input', () => {
      setColor(state.active, rgbToHex(+$('#r').value || 0, +$('#g').value || 0, +$('#b').value || 0));
    });
    $('#' + id).addEventListener('blur', updateUI);
  }

  /* ---------- Werkzeuge ---------- */
  document.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => {
    state.tool = b.dataset.tool;
    document.querySelectorAll('.tool').forEach(x => x.classList.toggle('on', x === b));
  }));
  $('#size').addEventListener('input', (e) => { state.size = +e.target.value; $('#sizeLbl').textContent = state.size + ' px'; });
  document.querySelectorAll('#fillmode button').forEach(b => b.addEventListener('click', () => {
    state.fill = b.dataset.f;
    document.querySelectorAll('#fillmode button').forEach(x => x.classList.toggle('on', x === b));
  }));

  let drag = null;
  function pos(e) {
    const r = ov.getBoundingClientRect();
    return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height };
  }

  ov.addEventListener('contextmenu', (e) => e.preventDefault());
  ov.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    ov.setPointerCapture(e.pointerId);
    const p = pos(e);
    const color = state.colors[e.button === 2 ? 1 : 0];
    const other = state.colors[e.button === 2 ? 0 : 1];
    if (state.tool === 'picker') {
      const d = ctx.getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data;
      setColor(e.button === 2 ? 1 : state.active, rgbToHex(d[0], d[1], d[2]));
      return;
    }
    snapshot();
    if (state.tool === 'fill') { floodFill(Math.floor(p.x), Math.floor(p.y), color); return; }
    drag = { start: p, last: p, color, other, shift: e.shiftKey };
    if (['pencil', 'brush', 'eraser'].includes(state.tool)) strokeSeg(p, p);
  });
  ov.addEventListener('pointermove', (e) => {
    const p = pos(e);
    $('#stPos').textContent = `${Math.floor(p.x)}, ${Math.floor(p.y)}`;
    if (!drag) return;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    if (['pencil', 'brush', 'eraser'].includes(state.tool)) {
      for (const ev of events) { const q = pos(ev); strokeSeg(drag.last, q); drag.last = q; }
    } else {
      drag.last = p; drag.shift = e.shiftKey;
      octx.clearRect(0, 0, ov.width, ov.height);
      drawShape(octx, drag);
    }
  });
  const end = () => {
    if (!drag) return;
    if (['line', 'rect', 'ellipse'].includes(state.tool)) {
      octx.clearRect(0, 0, ov.width, ov.height);
      drawShape(ctx, drag);
    }
    drag = null;
  };
  ov.addEventListener('pointerup', end);
  ov.addEventListener('pointercancel', end);
  ov.addEventListener('pointerleave', () => { $('#stPos').textContent = '–'; });

  function strokeSeg(a, b) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = state.size;
    ctx.strokeStyle = state.tool === 'eraser' ? '#ffffff' : drag.color;
    if (state.tool === 'brush') {
      ctx.globalAlpha = 0.35;
      ctx.shadowColor = drag.color; ctx.shadowBlur = state.size * 0.6;
    }
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x + 0.01, b.y); ctx.stroke();
    ctx.restore();
  }

  function drawShape(g, d) {
    let { x: x0, y: y0 } = d.start, { x: x1, y: y1 } = d.last;
    if (d.shift) {
      if (state.tool === 'line') {
        const ang = Math.round(Math.atan2(y1 - y0, x1 - x0) / (Math.PI / 4)) * Math.PI / 4;
        const len = Math.hypot(x1 - x0, y1 - y0);
        x1 = x0 + Math.cos(ang) * len; y1 = y0 + Math.sin(ang) * len;
      } else {
        const s = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        x1 = x0 + Math.sign(x1 - x0 || 1) * s; y1 = y0 + Math.sign(y1 - y0 || 1) * s;
      }
    }
    g.save();
    g.lineWidth = state.size; g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = d.color;
    g.beginPath();
    if (state.tool === 'line') { g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.restore(); return; }
    const x = Math.min(x0, x1), y = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
    if (state.tool === 'rect') g.rect(x, y, w, h);
    else g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    if (state.fill === 'fill') { g.fillStyle = d.color; g.fill(); }
    if (state.fill === 'both') { g.fillStyle = d.other; g.fill(); g.stroke(); }
    if (state.fill === 'stroke') g.stroke();
    g.restore();
  }

  // Füllen mit Toleranz (Scanline)
  function floodFill(x, y, hex) {
    const W = cv.width, H = cv.height;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const img = ctx.getImageData(0, 0, W, H), d = img.data;
    const i0 = (y * W + x) * 4;
    const t = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]];
    const [r, g, b] = hexToRgb(hex);
    if (t[0] === r && t[1] === g && t[2] === b && t[3] === 255) return;
    const TOL = 40;
    const match = (i) => Math.abs(d[i] - t[0]) + Math.abs(d[i + 1] - t[1]) + Math.abs(d[i + 2] - t[2]) + Math.abs(d[i + 3] - t[3]) <= TOL;
    const seen = new Uint8Array(W * H);
    const stack = [[x, y]];
    while (stack.length) {
      let [sx, sy] = stack.pop();
      while (sx >= 0 && !seen[sy * W + sx] && match((sy * W + sx) * 4)) sx--;
      sx++;
      let up = false, down = false;
      while (sx < W && !seen[sy * W + sx] && match((sy * W + sx) * 4)) {
        const k = sy * W + sx, i = k * 4;
        seen[k] = 1;
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
        if (sy > 0) { const m = !seen[k - W] && match(i - W * 4); if (m && !up) { stack.push([sx, sy - 1]); up = true; } else if (!m) up = false; }
        if (sy < H - 1) { const m = !seen[k + W] && match(i + W * 4); if (m && !down) { stack.push([sx, sy + 1]); down = true; } else if (!m) down = false; }
        sx++;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  /* ---------- Datei & Zwischenablage ---------- */
  function loadImageBlob(blob) {
    const url = URL.createObjectURL(blob);
    const im = new Image();
    im.onload = () => {
      snapshot();
      cv.width = ov.width = im.naturalWidth;
      cv.height = ov.height = im.naturalHeight;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(im, 0, 0);
      URL.revokeObjectURL(url);
      fitZoom();
      updateUI();
      toast(`Bild geladen (${cv.width} × ${cv.height}).`);
    };
    im.onerror = () => { URL.revokeObjectURL(url); toast('Das Bild konnte nicht geladen werden.'); };
    im.src = url;
  }

  async function pasteFromClipboard() {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) throw new Error('unsupported');
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = it.types.find(t => t.startsWith('image/'));
        if (type) { loadImageBlob(await it.getType(type)); return; }
      }
      toast('In der Zwischenablage ist kein Bild.');
    } catch (_) {
      toast('Kein Zugriff auf die Zwischenablage – drücke Strg+V zum Einfügen.');
    }
  }
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData ? [...e.clipboardData.items] : [];
    const it = items.find(i => i.type.startsWith('image/'));
    if (it) { e.preventDefault(); loadImageBlob(it.getAsFile()); }
    else if (!e.target.matches('input')) toast('In der Zwischenablage ist kein Bild.');
  });

  async function copyToClipboard() {
    try {
      const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('Bild in die Zwischenablage kopiert.');
    } catch (_) {
      toast('Kopieren wird von diesem Browser nicht unterstützt – nutze „Speichern“.');
    }
  }

  function save() {
    cv.toBlob((blob) => {
      const a = document.createElement('a');
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      a.download = `skizze-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.png`;
      a.href = URL.createObjectURL(blob);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  }

  function newDialog() {
    dialog(`<h2>Neues Bild</h2>
      <p>Größe der Leinwand in Pixeln:</p>
      <label class="row">Breite <input type="number" id="nw" min="16" max="4096" value="${cv.width}"></label>
      <label class="row">Höhe <input type="number" id="nh" min="16" max="4096" value="${cv.height}"></label>
      <div class="actions" style="justify-content:flex-start">
        <button class="btn" data-size="800x600">800×600</button><button class="btn" data-size="1280x720">1280×720</button><button class="btn" data-size="1920x1080">1920×1080</button>
      </div>
      <div class="actions"><button class="btn" data-a="close">Abbrechen</button><button class="btn primary" data-a="create">Erstellen</button></div>`);
  }

  /* ---------- Dialog & Toast ---------- */
  const dlg = $('#dlg');
  function dialog(html) { $('#dlgPanel').innerHTML = html; dlg.hidden = false; }
  dlg.addEventListener('click', (e) => {
    const sz = e.target.dataset.size;
    if (sz) { const [w, h] = sz.split('x'); $('#nw').value = w; $('#nh').value = h; return; }
    const a = e.target.dataset.a;
    if (!a) return;
    if (a === 'create') {
      const w = Math.max(16, Math.min(4096, +$('#nw').value || 800));
      const h = Math.max(16, Math.min(4096, +$('#nh').value || 600));
      snapshot();
      newCanvas(w, h, true);
    }
    dlg.hidden = true;
  });
  let toastT;
  function toast(t) {
    const el = $('#toast'); el.textContent = t; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2600);
  }

  /* ---------- Knöpfe & Tastatur ---------- */
  $('#newBtn').onclick = newDialog;
  $('#openBtn').onclick = () => $('#file').click();
  $('#file').onchange = (e) => { const f = e.target.files[0]; if (f) loadImageBlob(f); e.target.value = ''; };
  $('#pasteBtn').onclick = pasteFromClipboard;
  $('#copyBtn').onclick = copyToClipboard;
  $('#saveBtn').onclick = save;
  $('#undoBtn').onclick = () => restore(undo, redo);
  $('#redoBtn').onclick = () => restore(redo, undo);
  $('#zoomIn').onclick = () => setZoom(state.zoom * 1.25);
  $('#zoomOut').onclick = () => setZoom(state.zoom / 1.25);
  $('#zoomLbl').onclick = () => (Math.abs(state.zoom - 1) < 0.01 ? fitZoom() : setZoom(1));
  stage.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom(state.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
  }, { passive: false });
  // Bilder per Drag & Drop öffnen
  stage.addEventListener('dragover', (e) => e.preventDefault());
  stage.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = [...e.dataTransfer.files].find(x => x.type.startsWith('image/'));
    if (f) loadImageBlob(f);
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input')) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey) {
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); restore(undo, redo); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); restore(redo, undo); }
      else if (k === 's') { e.preventDefault(); save(); }
      else if (k === 'o') { e.preventDefault(); $('#file').click(); }
      else if (k === 'c') { e.preventDefault(); copyToClipboard(); }
    }
  });

  newCanvas(800, 600);
  addEventListener('resize', () => { if (Math.abs(state.zoom - 1) > 0.01) fitZoom(); });
})();
