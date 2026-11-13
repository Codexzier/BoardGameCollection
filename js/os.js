/* Spielesammlung – kleiner Fenstermanager im Stil eines Betriebssystems. */
(() => {
  'use strict';

  const ICONS = {
    domino: `<svg viewBox="0 0 48 48"><rect x="13" y="3" width="22" height="42" rx="5" fill="#f4f6fb" stroke="#25303c" stroke-width="2.5"/><path d="M17 24h14" stroke="#9aa3b2" stroke-width="2.5" stroke-linecap="round"/><g fill="#25303c"><circle cx="24" cy="13" r="3"/><circle cx="19" cy="30" r="2.6"/><circle cx="29" cy="30" r="2.6"/><circle cx="19" cy="38" r="2.6"/><circle cx="29" cy="38" r="2.6"/></g></svg>`,
    mahjong: `<svg viewBox="0 0 48 48"><rect x="12" y="7" width="26" height="36" rx="5" fill="#b9874a"/><rect x="9" y="4" width="26" height="36" rx="5" fill="#fbf6ea" stroke="#d8c9a6" stroke-width="2"/><text x="22" y="30.5" text-anchor="middle" font-size="19" font-weight="700" fill="#c8302c" font-family="serif">中</text></svg>`,
    romme: `<svg viewBox="0 0 48 48"><rect x="6" y="9" width="22" height="31" rx="3.5" fill="#fff" stroke="#25303c" stroke-width="2" transform="rotate(-12 17 24)"/><rect x="19" y="7" width="22" height="31" rx="3.5" fill="#fff" stroke="#25303c" stroke-width="2" transform="rotate(10 30 22)"/><path d="M31 17c-3-4-8-1-5 3l5 5 5-5c3-4-2-7-5-3z" fill="#e0393e" transform="rotate(10 30 22)"/></svg>`,
    duck: `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="#ffffff" stroke="#e0393e" stroke-width="3"/><circle cx="24" cy="24" r="12" fill="none" stroke="#e0393e" stroke-width="3"/><path d="M15 31c0-6 4-9 8-9 0-5 3-8 7-8 3 0 5 2 5 4l4 1-4 2c0 3-2 4-3 5 4 1 4 9-5 9H19c-3 0-4-2-4-4z" fill="#ffcc33" stroke="#9a6b10" stroke-width="1.6"/><circle cx="31" cy="18" r="1.4" fill="#25303c"/></svg>`,
    aquarium: `<svg viewBox="0 0 48 48"><rect x="4" y="8" width="40" height="32" rx="7" fill="#7fd0ee"/><path d="M4 33c6-3 10 2 16-1s10 2 16-1 8 1 8 1v1a7 7 0 0 1-7 7H11a7 7 0 0 1-7-7z" fill="#f2dfa7"/><path d="M14 22c4-5 12-5 16 0-4 5-12 5-16 0z" fill="#3a8ee6"/><path d="M30 22l6-5v10z" fill="#3a8ee6"/><circle cx="18.5" cy="21" r="1.4" fill="#fff"/><circle cx="36" cy="13" r="2" fill="none" stroke="#fff" stroke-width="1.4"/></svg>`,
    racing: `<svg viewBox="0 0 48 48"><rect x="4" y="6" width="40" height="36" rx="8" fill="#5bbf5f"/><path d="M14 42V20a10 10 0 0 1 20 0v22" fill="none" stroke="#8a96a3" stroke-width="8"/><rect x="20" y="20" width="9" height="16" rx="3" fill="#e0393e"/><rect x="21.5" y="23" width="6" height="3" rx="1" fill="#fff"/><g fill="#25303c"><rect x="6" y="8" width="5" height="5"/><rect x="16" y="8" width="5" height="5"/><rect x="11" y="13" width="5" height="5"/></g></svg>`,
    sketch: `<svg viewBox="0 0 48 48"><path d="M24 5C12 5 4 13 4 23c0 9 7 15 14 15 3 0 4-2 4-4s-2-3-2-5 2-4 5-4h6c7 0 13-4 13-11C44 9 35 5 24 5z" fill="#f4e6c9" stroke="#9b7b47" stroke-width="2"/><circle cx="14" cy="20" r="3.4" fill="#e0393e"/><circle cx="21" cy="13" r="3.4" fill="#f2c230"/><circle cx="31" cy="12" r="3.4" fill="#2fb36a"/><circle cx="37" cy="20" r="3.4" fill="#2f7cf6"/><path d="M27 44l14-21 4 2-12 22z" fill="#5a3b1e"/><path d="M41 23l2-4 4 2-2 4z" fill="#c0c6cf"/></svg>`,
    dicta: `<svg viewBox="0 0 48 48"><rect x="12" y="3" width="24" height="42" rx="7" fill="#3a4049"/><rect x="15.5" y="7" width="17" height="9" rx="2" fill="#a9d68c"/><g fill="#1f242b"><circle cx="19" cy="22" r="1.3"/><circle cx="24" cy="22" r="1.3"/><circle cx="29" cy="22" r="1.3"/><circle cx="19" cy="26" r="1.3"/><circle cx="24" cy="26" r="1.3"/><circle cx="29" cy="26" r="1.3"/></g><circle cx="19" cy="36" r="3.6" fill="#e5484d"/><path d="M27 32.5v7l5.5-3.5z" fill="#e8ecf1"/></svg>`,
    loop: `<svg viewBox="0 0 48 48"><rect x="3" y="7" width="42" height="34" rx="8" fill="#262c35"/><g fill="#e8582e"><rect x="8" y="12" width="6" height="6" rx="1.5"/><rect x="20" y="12" width="6" height="6" rx="1.5"/></g><g fill="#7b5cf0"><rect x="14" y="21" width="6" height="6" rx="1.5"/><rect x="32" y="21" width="6" height="6" rx="1.5"/></g><g fill="#2f9e5b"><rect x="8" y="30" width="12" height="6" rx="1.5"/><rect x="26" y="30" width="12" height="6" rx="1.5"/></g><rect x="29" y="10" width="2" height="28" fill="#7fe0a8"/></svg>`,
    racing3d: `<svg viewBox="0 0 48 48"><defs><linearGradient id="r3s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#23285a"/><stop offset="1" stop-color="#f3884a"/></linearGradient></defs><rect x="3" y="5" width="42" height="38" rx="9" fill="url(#r3s)"/><path d="M3 34l17-9h8l17 9v1a8 8 0 0 1-8 8H11a8 8 0 0 1-8-8z" fill="#3b3f46"/><path d="M24 26v4M24 33v5" stroke="#fff" stroke-width="2"/><path d="M14 30c0-3 2-5 5-5h10c3 0 5 2 5 5v3H14z" fill="#e8554f"/><circle cx="17" cy="31.5" r="1.6" fill="#fff6c8"/><circle cx="31" cy="31.5" r="1.6" fill="#fff6c8"/><circle cx="34" cy="14" r="3" fill="#ffd9a0"/></svg>`,
    games: `<svg viewBox="0 0 48 48"><rect x="4" y="14" width="40" height="22" rx="11" fill="#5b6cf0"/><path d="M14 20v10M9 25h10" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/><circle cx="32" cy="22" r="2.6" fill="#fff"/><circle cx="37" cy="27" r="2.6" fill="#fff"/></svg>`,
    apps: `<svg viewBox="0 0 48 48"><rect x="5" y="5" width="17" height="17" rx="5" fill="#2f9e5b"/><rect x="26" y="5" width="17" height="17" rx="5" fill="#f2a530"/><rect x="5" y="26" width="17" height="17" rx="5" fill="#e5484d"/><rect x="26" y="26" width="17" height="17" rx="5" fill="#2f7cf6"/></svg>`,
    about: `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="19" fill="#2f7cf6"/><rect x="21.5" y="20" width="5" height="15" rx="2.5" fill="#fff"/><circle cx="24" cy="14" r="3" fill="#fff"/></svg>`,
  };

  const APPS = [
    { id: 'domino',   name: 'Domino',      desc: 'Klassisches Anlege-Domino', url: 'games/domino/index.html',   w: 1040, h: 720, group: 'games' },
    { id: 'mahjong',  name: 'Mahjong',     desc: 'Solitaire mit Zeit & Rückgängig', url: 'games/mahjong/index.html', w: 1080, h: 760, group: 'games' },
    { id: 'romme',    name: 'Rommé',       desc: 'Kartenspiel gegen 1–3 NPCs', url: 'games/romme/index.html',    w: 1160, h: 800, group: 'games' },
    { id: 'duck',     name: 'Entenjagd',   desc: 'Schießbude – 2 Minuten', url: 'games/entenjagd/index.html', w: 1060, h: 660, group: 'games' },
    { id: 'aquarium', name: 'Aquarium',    desc: 'Fressen & gefressen werden', url: 'games/aquarium/index.html', w: 1100, h: 720, group: 'games' },
    { id: 'racing',   name: 'Rennen',      desc: '3 Runden gegen einen NPC', url: 'games/rennen/index.html',   w: 1180, h: 760, group: 'games' },
    { id: 'racing3d', name: 'Rennen 3D',   desc: '3D-Rennen mit Kino-Replay', url: 'games/rennen3d/index.html', w: 1200, h: 760, group: 'games' },
    { id: 'sketch',   name: 'SketchPainter', desc: 'Malen & Bilder bearbeiten', url: 'apps/sketchpainter/index.html', w: 1100, h: 760, group: 'apps' },
    { id: 'dicta',    name: 'Diktiergerät', desc: 'Sprachaufnahmen mit Effekten', url: 'apps/diktiergeraet/index.html', w: 460, h: 760, group: 'apps' },
    { id: 'loop',     name: 'LoopStudio',   desc: 'Musik aus Loops bauen', url: 'apps/loopstudio/index.html', w: 1200, h: 820, group: 'apps' },
    { id: 'about',    name: 'Über',        desc: 'Infos & Credits', url: 'apps/about.html', w: 560, h: 460 },
  ];

  const $ = (s, el = document) => el.querySelector(s);
  const desktop = $('#desktop');
  const iconsEl = $('#icons');
  const tasksEl = $('#tasks');
  const startBtn = $('#startBtn');
  const startMenu = $('#startMenu');
  const startList = $('#startList');
  const tpl = $('#winTpl');

  const windows = new Map(); // appId -> {app, el, task, state}
  let zTop = 10;
  let cascade = 0;

  const isSmall = () => desktop.clientWidth < 700 || desktop.clientHeight < 500;

  /* ---------- Desktop-Icons & Startmenü ---------- */
  for (const app of APPS) {
    const b = document.createElement('button');
    b.className = 'icon';
    b.innerHTML = `<span class="d-icon">${ICONS[app.id]}</span><span>${app.name}</span>`;
    b.title = app.desc;
    b.addEventListener('click', (e) => {
      // Ein Klick wählt aus, Doppelklick (oder Touch/Tastatur) öffnet.
      if (e.detail === 0 || matchMedia('(pointer: coarse)').matches) { openApp(app.id); return; }
      iconsEl.querySelectorAll('.icon.selected').forEach(i => i.classList.remove('selected'));
      b.classList.add('selected');
    });
    b.addEventListener('dblclick', () => openApp(app.id));
    iconsEl.appendChild(b);

  }

  // Startmenü: Spielesammlung, Anwendungen, Über
  const GROUPS = [
    { id: 'games', name: 'Spielesammlung', icon: ICONS.games },
    { id: 'apps', name: 'Anwendungen', icon: ICONS.apps },
  ];
  function menuItem(app, cls = '') {
    const s = document.createElement('button');
    s.className = 'start-item ' + cls;
    s.setAttribute('role', 'menuitem');
    s.innerHTML = `<span class="s-icon">${ICONS[app.id]}</span><span><b>${app.name}</b><small>${app.desc}</small></span>`;
    s.addEventListener('click', () => { toggleStart(false); openApp(app.id); });
    return s;
  }
  let openGroup = null;
  try { openGroup = localStorage.getItem('os.menuGroup'); } catch (_) {}
  for (const g of GROUPS) {
    const wrap = document.createElement('div');
    wrap.className = 'grp';
    const head = document.createElement('button');
    head.className = 'start-item grp-head';
    head.setAttribute('aria-expanded', String(openGroup === g.id));
    head.innerHTML = `<span class="s-icon">${g.icon}</span><span><b>${g.name}</b></span><span class="chev" aria-hidden="true"></span>`;
    const items = document.createElement('div');
    items.className = 'grp-items';
    items.hidden = openGroup !== g.id;
    APPS.filter(a => a.group === g.id).forEach(a => items.appendChild(menuItem(a, 'sub')));
    head.addEventListener('click', () => {
      const open = items.hidden;
      startList.querySelectorAll('.grp-items').forEach(el => { el.hidden = true; });
      startList.querySelectorAll('.grp-head').forEach(el => el.setAttribute('aria-expanded', 'false'));
      items.hidden = !open;
      head.setAttribute('aria-expanded', String(open));
      try { localStorage.setItem('os.menuGroup', open ? g.id : ''); } catch (_) {}
    });
    wrap.append(head, items);
    startList.appendChild(wrap);
  }
  APPS.filter(a => !a.group).forEach(a => startList.appendChild(menuItem(a)));

  function toggleStart(force) {
    const open = force ?? startMenu.hidden;
    startMenu.hidden = !open;
    startBtn.setAttribute('aria-expanded', String(open));
    if (open) startMenu.querySelector('.start-item')?.focus();
  }
  startBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleStart(); });
  document.addEventListener('pointerdown', (e) => {
    if (!startMenu.hidden && !startMenu.contains(e.target) && !startBtn.contains(e.target)) toggleStart(false);
    if (!e.target.closest('.icon')) iconsEl.querySelectorAll('.icon.selected').forEach(i => i.classList.remove('selected'));
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleStart(false); });

  /* ---------- Fenster ---------- */
  function openApp(id) {
    if (windows.has(id)) { const w = windows.get(id); restore(w); focus(w); return; }
    const app = APPS.find(a => a.id === id);
    const el = tpl.content.firstElementChild.cloneNode(true);
    $('.win-icon', el).innerHTML = ICONS[id];
    $('.win-title', el).textContent = app.name;
    el.setAttribute('aria-label', app.name);

    const iframe = document.createElement('iframe');
    iframe.src = app.url;
    iframe.title = app.name;
    iframe.setAttribute('allow', 'fullscreen; autoplay; microphone; clipboard-read; clipboard-write');
    $('.win-body', el).appendChild(iframe);

    const dw = desktop.clientWidth, dh = desktop.clientHeight;
    const w = Math.min(app.w, dw - 20), h = Math.min(app.h, dh - 20);
    const off = (cascade++ % 6) * 28;
    const x = Math.max(10, Math.min((dw - w) / 2 + off - 70, dw - w - 10));
    const y = Math.max(10, Math.min((dh - h) / 2 + off - 70, dh - h - 10));
    Object.assign(el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    desktop.appendChild(el);

    const task = document.createElement('button');
    task.className = 'task';
    task.title = app.name;
    task.innerHTML = `<span class="t-icon">${ICONS[id]}</span><span class="t-name">${app.name}</span>`;
    tasksEl.appendChild(task);

    const win = { app, el, task, iframe, prev: null };
    windows.set(id, win);

    task.addEventListener('click', () => {
      if (el.classList.contains('minimized')) { restore(win); focus(win); }
      else if (el.classList.contains('active-win')) minimize(win);
      else focus(win);
    });
    $('.min', el).addEventListener('click', () => minimize(win));
    $('.max', el).addEventListener('click', () => toggleMax(win));
    $('.close', el).addEventListener('click', () => closeWin(win));
    $('.titlebar', el).addEventListener('dblclick', (e) => { if (!e.target.closest('.wc')) toggleMax(win); });
    el.addEventListener('pointerdown', () => focus(win), true);

    makeDraggable(win);
    makeResizable(win);
    if (isSmall()) toggleMax(win);
    focus(win);
  }

  function focus(win) {
    for (const w of windows.values()) {
      const me = w === win;
      w.el.classList.toggle('inactive', !me);
      w.el.classList.toggle('active-win', me);
      w.task.classList.toggle('active', me);
    }
    if (win) win.el.style.zIndex = ++zTop;
  }

  function topVisible() {
    let best = null;
    for (const w of windows.values()) {
      if (w.el.classList.contains('minimized')) continue;
      if (!best || +w.el.style.zIndex > +best.el.style.zIndex) best = w;
    }
    return best;
  }

  function minimize(win) {
    win.el.classList.add('minimized');
    win.task.classList.add('minimized');
    win.el.classList.remove('active-win');
    win.task.classList.remove('active');
    const next = topVisible();
    if (next) focus(next);
  }

  function restore(win) {
    win.el.classList.remove('minimized');
    win.task.classList.remove('minimized');
  }

  function toggleMax(win) {
    const el = win.el;
    if (el.classList.contains('maximized')) {
      el.classList.remove('maximized');
      Object.assign(el.style, win.prev);
    } else {
      win.prev = { left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height };
      el.classList.add('maximized');
      fitMax(el);
    }
  }

  // Maximierte Fenster füllen den Desktop; im Hochformat ganz ohne Rand.
  const portrait = matchMedia('(orientation: portrait)');
  function fitMax(el) {
    const p = portrait.matches;
    const g = p ? 0 : 10;
    Object.assign(el.style, { left: '0px', top: g + 'px', width: (desktop.clientWidth - g) + 'px', height: (desktop.clientHeight - 2 * g) + 'px' });
  }

  function closeWin(win) {
    win.el.classList.add('closing');
    win.task.remove();
    windows.delete(win.app.id);
    setTimeout(() => win.el.remove(), 160);
    const next = topVisible();
    if (next) focus(next);
  }

  function makeDraggable(win) {
    const bar = $('.titlebar', win.el);
    bar.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.wc')) return;
      const el = win.el;
      let sx = e.clientX, sy = e.clientY;
      let ox = el.offsetLeft, oy = el.offsetTop;
      let moved = false;
      bar.setPointerCapture(e.pointerId);
      document.body.classList.add('dragging');
      const move = (ev) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!moved && Math.hypot(dx, dy) < 4) return;
        if (!moved && el.classList.contains('maximized')) {
          // Aus dem maximierten Zustand herausziehen
          const ratio = (sx - el.getBoundingClientRect().left) / el.offsetWidth;
          toggleMax(win);
          ox = sx - desktop.getBoundingClientRect().left - el.offsetWidth * ratio;
          oy = 10;
        }
        moved = true;
        const maxX = desktop.clientWidth - 80, maxY = desktop.clientHeight - 40;
        el.style.left = Math.min(maxX, Math.max(-el.offsetWidth + 80, ox + dx)) + 'px';
        el.style.top = Math.min(maxY, Math.max(0, oy + dy)) + 'px';
      };
      const up = () => {
        bar.removeEventListener('pointermove', move);
        bar.removeEventListener('pointerup', up);
        bar.removeEventListener('pointercancel', up);
        document.body.classList.remove('dragging');
      };
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', up);
      bar.addEventListener('pointercancel', up);
    });
  }

  function makeResizable(win) {
    const h = $('.resize-handle', win.el);
    h.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const el = win.el;
      const sx = e.clientX, sy = e.clientY, sw = el.offsetWidth, sh = el.offsetHeight;
      h.setPointerCapture(e.pointerId);
      document.body.classList.add('dragging');
      const move = (ev) => {
        el.style.width = Math.max(320, sw + ev.clientX - sx) + 'px';
        el.style.height = Math.max(220, sh + ev.clientY - sy) + 'px';
      };
      const up = () => {
        h.removeEventListener('pointermove', move);
        h.removeEventListener('pointerup', up);
        document.body.classList.remove('dragging');
      };
      h.addEventListener('pointermove', move);
      h.addEventListener('pointerup', up);
    });
  }

  // Klick in ein iframe fokussiert das zugehörige Fenster.
  window.addEventListener('blur', () => {
    setTimeout(() => {
      const a = document.activeElement;
      if (a && a.tagName === 'IFRAME') {
        for (const w of windows.values()) if (w.iframe === a) { focus(w); break; }
      }
    });
  });

  // Maximierte Fenster bei Größenänderung anpassen
  window.addEventListener('resize', () => {
    for (const w of windows.values()) {
      if (w.el.classList.contains('maximized')) fitMax(w.el);
      else if (isSmall()) toggleMax(w); // z. B. Smartphone ins Hochformat gedreht
      else {
        // Fenster im sichtbaren Bereich halten
        w.el.style.left = Math.max(0, Math.min(w.el.offsetLeft, desktop.clientWidth - 120)) + 'px';
        w.el.style.top = Math.max(0, Math.min(w.el.offsetTop, desktop.clientHeight - 60)) + 'px';
      }
    }
  });

  /* ---------- Uhr ---------- */
  const clockT = $('#clock .time'), clockD = $('#clock .date');
  function tick() {
    const d = new Date();
    clockT.textContent = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    clockD.textContent = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  tick();
  setInterval(tick, 5000);

  // Direktlink: index.html#mahjong öffnet ein Spiel sofort
  const hash = location.hash.slice(1);
  if (APPS.some(a => a.id === hash)) openApp(hash);
})();
