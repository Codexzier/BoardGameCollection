/* Mahjong Solitaire – Schildkröten-Layout, Zeitmessung, Rückgängig, Tipp, Mischen. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const boardEl = $('#board'), stage = $('#stage');

  /* ---------- Steinbilder als SVG ---------- */
  const NUM_CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const WINDS = [['東', 'O'], ['南', 'S'], ['西', 'W'], ['北', 'N']];
  const FLOWERS = [['梅', '#e0457b'], ['蘭', '#8e5bd6'], ['菊', '#e8a317'], ['竹', '#2f9e5b']];
  const SEASONS = [['春', '#2f9e5b'], ['夏', '#e0393e'], ['秋', '#d9822b'], ['冬', '#2f7cf6']];
  const FONT = `font-family="'Noto Serif CJK SC','Noto Serif SC','Songti SC','SimSun','MS Mincho',serif"`;

  const POS = {
    1: [[30, 40]],
    2: [[30, 22], [30, 58]],
    3: [[16, 18], [30, 40], [44, 62]],
    4: [[18, 22], [42, 22], [18, 58], [42, 58]],
    5: [[17, 19], [43, 19], [30, 40], [17, 61], [43, 61]],
    6: [[18, 17], [42, 17], [18, 40], [42, 40], [18, 63], [42, 63]],
    7: [[14, 13], [30, 21], [46, 29], [18, 49], [42, 49], [18, 67], [42, 67]],
    8: [[18, 13], [42, 13], [18, 31], [42, 31], [18, 49], [42, 49], [18, 67], [42, 67]],
    9: [[14, 17], [30, 17], [46, 17], [14, 40], [30, 40], [46, 40], [14, 63], [30, 63], [46, 63]],
  };

  function corner(t, color = '#5b6675') {
    return `<text x="6" y="13" font-size="10" font-weight="700" fill="${color}" font-family="system-ui,sans-serif">${t}</text>`;
  }

  function faceSVG(type) {
    let body = '';
    if (type < 9) { // Kreise
      const n = type + 1, cols = ['#2f6fd6', '#d63a3a', '#2f9e5b'];
      const r = n === 1 ? 15 : n <= 4 ? 10 : n <= 6 ? 8.5 : 7.2;
      POS[n].forEach(([x, y], i) => {
        const c = n === 1 ? '#d63a3a' : cols[(i + n) % 3];
        body += `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/><circle cx="${x}" cy="${y}" r="${r * .62}" fill="#fff"/><circle cx="${x}" cy="${y}" r="${r * .3}" fill="${c}"/>`;
      });
      body += corner(n);
    } else if (type < 18) { // Bambus
      const n = type - 8;
      if (n === 1) {
        body += `<g transform="translate(30 40)"><path d="M-10 18c0-14 4-26 14-30 6-2 10 2 8 6-2 3-6 2-6 2 4 6 2 16-4 22z" fill="#2f9e5b"/><path d="M4-12l6-8 2 6z" fill="#d63a3a"/><circle cx="6" cy="-8" r="1.8" fill="#222"/><path d="M-10 18l-8 6 4-10z" fill="#d63a3a"/></g>`;
      } else {
        const h = n <= 4 ? 26 : n <= 6 ? 18 : 15;
        POS[n].forEach(([x, y], i) => {
          const c = (n === 5 || n === 7 || n === 9) && (i === (n === 7 ? 0 : (n - 1) / 2)) ? '#d63a3a' : '#2f9e5b';
          body += `<rect x="${x - 3.2}" y="${y - h / 2}" width="6.4" height="${h}" rx="3" fill="${c}"/><rect x="${x - 4}" y="${y - 1}" width="8" height="2" rx="1" fill="${c}" opacity=".7"/><rect x="${x - 1}" y="${y - h / 2 + 2}" width="2" height="${h - 4}" fill="#fff" opacity=".35"/>`;
        });
      }
      body += corner(n, '#2f9e5b');
    } else if (type < 27) { // Zeichen
      const n = type - 17;
      body += `<text x="30" y="36" text-anchor="middle" font-size="25" fill="#1f3a6e" ${FONT}>${NUM_CN[n - 1]}</text>`;
      body += `<text x="30" y="70" text-anchor="middle" font-size="27" fill="#c8302c" ${FONT}>萬</text>`;
      body += corner(n, '#c8302c');
    } else if (type < 31) { // Winde
      const [ch, l] = WINDS[type - 27];
      body += `<text x="30" y="55" text-anchor="middle" font-size="38" fill="#1d2733" ${FONT}>${ch}</text>` + corner(l);
    } else if (type === 31) {
      body += `<text x="30" y="55" text-anchor="middle" font-size="40" fill="#c8302c" ${FONT}>中</text>`;
    } else if (type === 32) {
      body += `<text x="30" y="55" text-anchor="middle" font-size="38" fill="#2f9e5b" ${FONT}>發</text>`;
    } else if (type === 33) {
      body += `<rect x="12" y="14" width="36" height="52" rx="4" fill="none" stroke="#2f6fd6" stroke-width="4"/><rect x="18" y="20" width="24" height="40" rx="2" fill="none" stroke="#2f6fd6" stroke-width="1.6"/>`;
    } else if (type < 38) { // Blumen
      const [ch, c] = FLOWERS[type - 34];
      let petals = '';
      for (let i = 0; i < 5; i++) petals += `<ellipse cx="30" cy="31" rx="6" ry="10" fill="${c}" transform="rotate(${i * 72} 30 40)"/>`;
      body += `${petals}<circle cx="30" cy="40" r="5" fill="#ffd34d"/><text x="30" y="74" text-anchor="middle" font-size="12" fill="${c}" ${FONT}>${ch}</text>`;
    } else { // Jahreszeiten
      const [ch, c] = SEASONS[type - 38];
      let rays = '';
      for (let i = 0; i < 8; i++) rays += `<rect x="28.5" y="18" width="3" height="8" rx="1.5" fill="${c}" transform="rotate(${i * 45} 30 38)"/>`;
      body += `${rays}<circle cx="30" cy="38" r="9" fill="${c}"/><text x="30" y="74" text-anchor="middle" font-size="12" fill="${c}" ${FONT}>${ch}</text>`;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 80"><rect x="1.5" y="1.5" width="57" height="77" rx="7" fill="#fbf7ec" stroke="#e6dcc4" stroke-width="1.5"/>${body}</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }
  const FACES = Array.from({ length: 42 }, (_, i) => faceSVG(i));
  const group = (t) => t < 34 ? t : t < 38 ? 34 : 38; // Blumen bzw. Jahreszeiten passen untereinander

  /* ---------- Layout „Schildkröte“ (Halbe-Stein-Koordinaten) ---------- */
  function turtle() {
    const P = [];
    const add = (x, y, z) => P.push({ x2: Math.round(x * 2), y2: Math.round(y * 2), z });
    const rows0 = [[1, 12], [3, 10], [2, 11], [1, 12], [1, 12], [2, 11], [3, 10], [1, 12]];
    rows0.forEach(([a, b], y) => { for (let x = a; x <= b; x++) add(x, y, 0); });
    add(0, 3.5, 0); add(13, 3.5, 0); add(14, 3.5, 0);
    for (let y = 1; y <= 6; y++) for (let x = 4; x <= 9; x++) add(x, y, 1);
    for (let y = 2; y <= 5; y++) for (let x = 5; x <= 8; x++) add(x, y, 2);
    for (let y = 3; y <= 4; y++) for (let x = 6; x <= 7; x++) add(x, y, 3);
    add(6.5, 3.5, 4);
    return P;
  }

  function isFree(t, tiles) {
    let left = false, right = false;
    for (const u of tiles) {
      if (u === t || u.removed) continue;
      const dy = Math.abs(u.y2 - t.y2);
      if (u.z === t.z + 1 && Math.abs(u.x2 - t.x2) < 2 && dy < 2) return false;
      if (u.z === t.z && dy < 2) {
        if (u.x2 === t.x2 - 2) left = true;
        if (u.x2 === t.x2 + 2) right = true;
      }
    }
    return !(left && right);
  }

  // Verteilt Paare so, dass das Spiel garantiert lösbar ist (rückwärts abbauen).
  function assignSolvable(positions, pairs) {
    for (let attempt = 0; attempt < 300; attempt++) {
      positions.forEach(p => { p.removed = false; });
      const order = [...pairs].sort(() => Math.random() - .5);
      let ok = true;
      for (const [a, b] of order) {
        const free = positions.filter(p => !p.removed && isFree(p, positions));
        if (free.length < 2) { ok = false; break; }
        // höher liegende Steine leicht bevorzugen → weniger Sackgassen
        free.sort((p, q) => (q.z - p.z) + (Math.random() - .5) * 3);
        const i = Math.random() * Math.min(free.length, 6) | 0;
        const p1 = free.splice(i, 1)[0];
        const p2 = free[Math.random() * free.length | 0];
        p1.type = a; p2.type = b;
        p1.removed = p2.removed = true;
      }
      if (ok) { positions.forEach(p => { p.removed = false; }); return true; }
    }
    return false;
  }

  /* ---------- Spielzustand ---------- */
  let tiles = [], selected = null, history = [], moves = 0;
  let startTime = 0, elapsedBefore = 0, running = false, paused = false, finished = false;

  function newGame() {
    const pos = turtle();
    const pairs = [];
    for (let t = 0; t < 34; t++) { pairs.push([t, t], [t, t]); }
    pairs.push([34, 35], [36, 37], [38, 39], [40, 41]);
    assignSolvable(pos, pairs);
    tiles = pos.map((p, i) => ({ ...p, id: i, removed: false }));
    selected = null; history = []; moves = 0; finished = false;
    elapsedBefore = 0; startTime = performance.now(); running = true; setPaused(false);
    $('#dlg').hidden = true;
    build();
  }

  function build() {
    boardEl.innerHTML = '';
    for (const t of tiles) {
      const d = document.createElement('div');
      d.className = 'mj';
      d.style.backgroundImage = FACES[t.type];
      d.addEventListener('click', () => clickTile(t));
      t.el = d;
      boardEl.appendChild(d);
    }
    layout();
    refresh();
  }

  function layout() {
    const W = stage.clientWidth - 24, H = stage.clientHeight - 24;
    const ratio = 1.3;
    const w = Math.max(14, Math.min(W / 15.6, H / (8.4 * ratio)));
    const h = w * ratio, d = w * 0.09;
    const bw = 15 * w + 4 * d, bh = 8 * h + 4 * d;
    boardEl.style.left = ((stage.clientWidth - bw) / 2 + 4 * d) + 'px';
    boardEl.style.top = ((stage.clientHeight - bh) / 2 + 4 * d) + 'px';
    boardEl.style.setProperty('--w', w + 'px');
    boardEl.style.setProperty('--d', d + 'px');
    for (const t of tiles) {
      Object.assign(t.el.style, {
        left: (t.x2 * w / 2 + t.z * d) + 'px',
        top: (t.y2 * h / 2 - t.z * d) + 'px',
        width: (w - 1) + 'px',
        height: (h - 1) + 'px',
        zIndex: t.z * 1000 + t.y2 * 30 - t.x2 + 40,
      });
    }
  }

  function refresh() {
    let left = 0;
    for (const t of tiles) {
      if (t.removed) { t.el.classList.add('gone'); continue; }
      left++;
      const free = isFree(t, tiles);
      t.el.classList.remove('gone');
      t.el.classList.toggle('free', free);
      t.el.classList.toggle('blocked', !free);
      t.el.classList.toggle('sel', t === selected);
    }
    $('#left').textContent = left;
    $('#pairs').textContent = moves;
    $('#undoBtn').disabled = !history.length || finished;
  }

  function clickTile(t) {
    if (t.removed || paused || finished) return;
    if (!isFree(t, tiles)) {
      t.el.classList.remove('shake'); void t.el.offsetWidth; t.el.classList.add('shake');
      return;
    }
    if (selected === t) { selected = null; }
    else if (selected && group(selected.type) === group(t.type)) {
      selected.removed = t.removed = true;
      history.push([selected, t]);
      moves++;
      selected = null;
      refresh();
      checkState();
      return;
    } else selected = t;
    refresh();
  }

  function undo() {
    if (!history.length || finished || paused) return;
    const [a, b] = history.pop();
    a.removed = b.removed = false;
    moves++;
    selected = null;
    refresh();
  }

  function freePairs() {
    const free = tiles.filter(t => !t.removed && isFree(t, tiles));
    const out = [];
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++)
      if (group(free[i].type) === group(free[j].type)) out.push([free[i], free[j]]);
    return out;
  }

  function hint() {
    if (paused || finished) return;
    const p = freePairs();
    if (!p.length) return toast('Keine passenden Paare mehr – mische oder mache Züge rückgängig.');
    const [a, b] = p[Math.random() * p.length | 0];
    for (const t of [a, b]) { t.el.classList.remove('hint'); void t.el.offsetWidth; t.el.classList.add('hint'); }
    elapsedBefore += 15000; // Zeitstrafe für Tipps
    toast('Tipp (+15 s)');
  }

  function shuffle() {
    if (paused || finished) return;
    const rest = tiles.filter(t => !t.removed);
    // Typen paarweise neu gruppieren
    const byGroup = {};
    rest.forEach(t => (byGroup[group(t.type)] ||= []).push(t.type));
    const pairs = [];
    Object.values(byGroup).forEach(list => { for (let i = 0; i + 1 < list.length; i += 2) pairs.push([list[i], list[i + 1]]); });
    const pos = rest.map(t => ({ x2: t.x2, y2: t.y2, z: t.z, ref: t }));
    if (!assignSolvable(pos, pairs)) return toast('Mischen nicht möglich.');
    pos.forEach(p => { p.ref.type = p.type; p.ref.el.style.backgroundImage = FACES[p.type]; });
    history = [];
    selected = null;
    elapsedBefore += 30000;
    refresh();
    toast('Gemischt (+30 s). Rückgängig wurde zurückgesetzt.');
  }

  function checkState() {
    if (tiles.every(t => t.removed)) {
      finished = true;
      const ms = elapsed();
      running = false;
      let best = null;
      try { best = +localStorage.getItem('mahjong.best') || null; } catch (_) {}
      const record = !best || ms < best;
      if (record) try { localStorage.setItem('mahjong.best', String(ms)); } catch (_) {}
      dialog(`<h2>Geschafft! 🎉</h2><p>Alle 144 Steine abgeräumt in <b>${fmt(ms)}</b> mit ${moves} Zügen.</p>
        <p>${record ? 'Neue Bestzeit!' : `Bestzeit: ${fmt(best)}`}</p>
        <div class="actions"><button class="btn primary" data-a="new">Neues Spiel</button></div>`);
      return;
    }
    if (!freePairs().length) {
      dialog(`<h2>Keine Züge mehr</h2><p>Es gibt keine freien Paare. Du kannst mischen (+30 s), Züge rückgängig machen oder neu beginnen.</p>
        <div class="actions"><button class="btn" data-a="undo">Rückgängig</button><button class="btn" data-a="shuffle">Mischen</button><button class="btn primary" data-a="new">Neues Spiel</button></div>`);
    }
  }

  /* ---------- Zeit ---------- */
  const elapsed = () => elapsedBefore + (running && !paused ? performance.now() - startTime : 0);
  const fmt = (ms) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
    return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  };
  function setPaused(p) {
    if (p === paused) return;
    if (p) { elapsedBefore = elapsed(); paused = true; }
    else { paused = false; startTime = performance.now(); }
    document.body.classList.toggle('paused', paused);
    $('#pauseBtn').textContent = paused ? 'Weiter' : 'Pause';
  }
  setInterval(() => { if (!finished) $('#timer').textContent = fmt(elapsed()); }, 250);

  /* ---------- UI ---------- */
  const dlg = $('#dlg');
  function dialog(html) { $('#dlgPanel').innerHTML = html; dlg.hidden = false; }
  dlg.addEventListener('click', (e) => {
    const a = e.target.dataset.a;
    if (!a) return;
    dlg.hidden = true;
    if (a === 'new') newGame();
    if (a === 'undo') undo();
    if (a === 'shuffle') shuffle();
    if (a === 'resume') setPaused(false);
  });
  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200);
  }

  $('#newBtn').onclick = newGame;
  $('#undoBtn').onclick = undo;
  $('#hintBtn').onclick = hint;
  $('#shuffleBtn').onclick = shuffle;
  $('#pauseBtn').onclick = () => {
    if (finished) return;
    setPaused(!paused);
    if (paused) dialog(`<h2>Pause</h2><p>Die Zeit ist angehalten.</p><div class="actions"><button class="btn primary" data-a="resume">Weiter</button></div>`);
    else dlg.hidden = true;
  };
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    if (e.key === 'h') hint();
  });
  new ResizeObserver(() => tiles.length && layout()).observe(stage);

  newGame();
})();
