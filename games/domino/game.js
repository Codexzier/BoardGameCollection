/* Domino – Anlegespiel (Ziehdomino) gegen 1–3 Computergegner. */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const boardEl = $('#board'), handEl = $('#hand'), oppsEl = $('#opps');
  const statusEl = $('#status'), choicesEl = $('#choices'), boneEl = $('#boneyard');
  const scoresEl = $('#scores');
  const TARGET = 100;
  const NPC_NAMES = ['Anna', 'Ben', 'Clara'];

  let theme = 'light';
  try { theme = localStorage.getItem('domino.theme') || 'light'; } catch (_) {}
  $('#themeSel').value = theme;

  const img = (a, b) => `../../assets/domino/${theme}/tile_${Math.min(a, b)}_${Math.max(a, b)}.png`;

  let S = null; // Spielzustand

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  function newMatch() {
    const n = +$('#oppSel').value;
    const players = [{ name: 'Du', human: true, score: 0, hand: [] }];
    for (let i = 0; i < n; i++) players.push({ name: NPC_NAMES[i], human: false, score: 0, hand: [] });
    S = { players, starter: null, round: 0 };
    newRound();
  }

  function newRound() {
    const set = [];
    for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) set.push({ a, b, id: a * 10 + b });
    shuffle(set);
    const per = S.players.length === 2 ? 7 : 5;
    for (const p of S.players) { p.hand = set.splice(0, per); p.msg = ''; sortHand(p); }
    S.boneyard = set;
    S.chain = [];           // [{a,b,l,r,id}] – l/r sind die angezeigten Werte in Kettenrichtung
    S.passes = 0;
    S.selected = null;
    S.over = false;
    S = { ...S };  // neues Objekt → alte NPC-Timer greifen ins Leere
    S.round++;
    S.lastId = null;

    if (S.starter == null) {
      // Wer den höchsten Pasch hat, beginnt – sonst der höchste Stein.
      let best = -1, who = 0;
      S.players.forEach((p, i) => p.hand.forEach(t => {
        const v = (t.a === t.b ? 100 : 0) + t.a + t.b;
        if (v > best) { best = v; who = i; }
      }));
      S.starter = who;
    }
    S.turn = S.starter;
    render();
    nextTurn();
  }

  function sortHand(p) { p.hand.sort((x, y) => (x.a + x.b) - (y.a + y.b) || x.a - y.a); }

  const ends = () => S.chain.length ? [S.chain[0].l, S.chain[S.chain.length - 1].r] : null;

  // Wo kann der Stein angelegt werden? → Liste von 'L' / 'R'
  function placements(t) {
    const e = ends();
    if (!e) return ['R'];
    const out = [];
    if (t.a === e[0] || t.b === e[0]) out.push('L');
    if (t.a === e[1] || t.b === e[1]) out.push('R');
    if (out.length === 2 && e[0] === e[1]) return ['R'];
    return out;
  }

  function place(p, t, side) {
    p.hand.splice(p.hand.indexOf(t), 1);
    const e = ends();
    let piece;
    if (!e) piece = { ...t, l: t.a, r: t.b };
    else if (side === 'L') piece = { ...t, r: e[0], l: t.a === e[0] ? t.b : t.a };
    else piece = { ...t, l: e[1], r: t.a === e[1] ? t.b : t.a };
    if (side === 'L') S.chain.unshift(piece); else S.chain.push(piece);
    S.lastId = t.id;
    S.passes = 0;
    p.msg = '';
  }

  const pipSum = (p) => p.hand.reduce((s, t) => s + t.a + t.b, 0);

  function nextTurn() {
    if (S.over) return;
    const p = S.players[S.turn];
    S.players.forEach(q => q.isTurn = q === p);
    if (p.human) {
      S.selected = null;
      const can = p.hand.some(t => placements(t).length);
      setStatus(can ? 'Du bist dran – wähle einen Stein.' :
        S.boneyard.length ? 'Kein passender Stein – ziehe aus dem Vorrat.' : 'Kein Zug möglich – du musst passen.');
      render();
    } else {
      render();
      setStatus(`${p.name} ist am Zug …`);
      const cur = S;
      setTimeout(() => { if (S === cur && !S.over) npcMove(p); }, 650 + Math.random() * 350);
    }
  }

  function endTurn() {
    const p = S.players[S.turn];
    if (p.hand.length === 0) return roundOver(S.turn, false);
    if (S.passes >= S.players.length) {
      // Blockiert: niedrigste Augensumme gewinnt
      let best = Infinity, who = -1, tie = false;
      S.players.forEach((q, i) => {
        const v = pipSum(q);
        if (v < best) { best = v; who = i; tie = false; } else if (v === best) tie = true;
      });
      return roundOver(tie ? -1 : who, true);
    }
    S.turn = (S.turn + 1) % S.players.length;
    nextTurn();
  }

  function npcMove(p) {
    if (S.over) return;
    // Ziehen, bis ein Stein passt
    let drew = 0;
    while (!p.hand.some(t => placements(t).length) && S.boneyard.length) { p.hand.push(S.boneyard.pop()); drew++; }
    const options = [];
    for (const t of p.hand) for (const side of placements(t)) {
      // Heuristik: Paschs und hohe Steine zuerst loswerden, Enden mit eigenen Zahlen offen halten
      const e = ends();
      const newEnd = !e ? t.b : side === 'L' ? (t.a === e[0] ? t.b : t.a) : (t.a === e[1] ? t.b : t.a);
      const follow = p.hand.filter(o => o !== t && (o.a === newEnd || o.b === newEnd)).length;
      options.push({ t, side, v: (t.a + t.b) + (t.a === t.b ? 6 : 0) + follow * 3 + Math.random() });
    }
    if (!options.length) {
      S.passes++;
      p.msg = drew ? `zieht ${drew} und passt` : 'passt';
      render();
      return endTurn();
    }
    options.sort((x, y) => y.v - x.v);
    place(p, options[0].t, options[0].side);
    p.msg = drew ? `zieht ${drew} Stein${drew > 1 ? 'e' : ''}` : '';
    render();
    endTurn();
  }

  /* ---------- Menschlicher Spieler ---------- */
  function onHandClick(t) {
    const me = S.players[0];
    if (S.over || !me.isTurn) return;
    const pl = placements(t);
    if (!pl.length) return;
    if (pl.length === 1) { doPlace(t, pl[0]); return; }
    S.selected = S.selected === t ? null : t;
    render();
  }

  function doPlace(t, side) {
    const me = S.players[0];
    place(me, t, side);
    S.selected = null;
    render();
    endTurn();
  }

  function draw() {
    const me = S.players[0];
    if (!me.isTurn || me.hand.some(t => placements(t).length)) return;
    if (S.boneyard.length) {
      me.hand.push(S.boneyard.pop());
      const can = me.hand.some(t => placements(t).length);
      setStatus(can ? 'Passt! Lege den Stein an.' : S.boneyard.length ? 'Passt nicht – zieh weiter.' : 'Vorrat leer – du musst passen.');
      render();
    }
  }

  function pass() {
    const me = S.players[0];
    S.passes++;
    me.msg = 'passt';
    endTurn();
  }

  /* ---------- Rundenende ---------- */
  function roundOver(winner, blocked) {
    S.over = true;
    setStatus('Runde beendet.');
    S.players.forEach(q => q.isTurn = false);
    let pts = 0;
    if (winner >= 0) {
      S.players.forEach((q, i) => { if (i !== winner) pts += pipSum(q); });
      S.players[winner].score += pts;
      S.starter = winner;
    }
    render(true);
    const champion = S.players.find(q => q.score >= TARGET);
    const rows = S.players.map(q => `<tr><td>${q.name}</td><td class="num">${pipSum(q)}</td><td class="num"><b>${q.score}</b></td></tr>`).join('');
    const head = winner < 0 ? 'Unentschieden' : champion ? (champion.human ? 'Du gewinnst das Spiel! 🎉' : `${champion.name} gewinnt das Spiel`) :
      S.players[winner].human ? 'Runde gewonnen!' : `${S.players[winner].name} gewinnt die Runde`;
    const sub = blocked ? 'Das Spiel ist blockiert – die niedrigste Augenzahl gewinnt. ' : '';
    showDialog(`<h2>${head}</h2>
      <p>${sub}${winner >= 0 ? `+${pts} Punkte für ${S.players[winner].human ? 'dich' : S.players[winner].name}.` : 'Keine Punkte.'} Ziel: ${TARGET} Punkte.</p>
      <table class="score"><tr><th>Spieler</th><th class="num">Augen übrig</th><th class="num">Gesamt</th></tr>${rows}</table>
      <div class="actions">${champion ? '<button class="btn primary" data-a="match">Neues Spiel</button>' :
        '<button class="btn" data-a="close">Brett ansehen</button><button class="btn primary" data-a="round">Nächste Runde</button>'}</div>`);
  }

  /* ---------- Darstellung ---------- */
  function setStatus(t) { statusEl.textContent = t; }

  function render(reveal = false) {
    // Gegner
    oppsEl.innerHTML = '';
    S.players.slice(1).forEach(p => {
      const d = document.createElement('div');
      d.className = 'opp' + (p.isTurn ? ' turn' : '');
      const tiles = reveal
        ? p.hand.map(t => `<img src="${img(t.a, t.b)}" style="width:14px;height:28px" alt="">`).join('')
        : p.hand.map(() => '<span class="back"></span>').join('');
      d.innerHTML = `<span class="name">${p.name} · ${p.score} P</span><span class="backs">${tiles}</span><span class="msg">${p.msg || ''}</span>`;
      oppsEl.appendChild(d);
    });

    // Hand
    const me = S.players[0];
    handEl.classList.toggle('turn', !!me.isTurn);
    handEl.innerHTML = '';
    for (const t of me.hand) {
      const b = document.createElement('button');
      const ok = me.isTurn && placements(t).length > 0;
      b.className = 'htile' + (ok ? ' playable' : me.isTurn ? ' dim' : '') + (S.selected === t ? ' sel' : '');
      b.innerHTML = `<img src="${img(t.a, t.b)}" alt="${t.a}|${t.b}">`;
      b.title = `${t.a} | ${t.b}`;
      b.addEventListener('click', () => onHandClick(t));
      handEl.appendChild(b);
    }

    // Auswahlknöpfe
    choicesEl.innerHTML = '';
    const addBtn = (label, fn, cls = 'btn') => {
      const b = document.createElement('button'); b.className = cls; b.textContent = label; b.onclick = fn; choicesEl.appendChild(b);
    };
    if (me.isTurn && !S.over) {
      if (S.selected) {
        const e = ends();
        addBtn(`◀ Links an ${e[0]}`, () => doPlace(S.selected, 'L'), 'btn primary');
        addBtn(`Rechts an ${e[1]} ▶`, () => doPlace(S.selected, 'R'), 'btn primary');
      } else if (!me.hand.some(t => placements(t).length)) {
        if (S.boneyard.length) addBtn('Stein ziehen', draw, 'btn primary');
        else addBtn('Passen', pass, 'btn primary');
      }
    }
    boneEl.textContent = `Vorrat: ${S.boneyard.length} Steine · Runde ${S.round}`;
    scoresEl.innerHTML = `Du: <b>${me.score}</b> P · Ziel ${TARGET}`;

    renderBoard();
  }

  function renderBoard() {
    boardEl.innerHTML = '';
    const W = boardEl.clientWidth, H = boardEl.clientHeight;
    if (!S.chain.length) {
      boardEl.innerHTML = `<div class="empty-hint">${S.players[S.turn].human ? 'Lege den ersten Stein.' : ''}</div>`;
      return;
    }
    const gap = 3;
    let U = 36, rows;
    // Größte Steingröße finden, bei der die Schlange aufs Brett passt
    for (; U >= 10; U -= 1) {
      rows = layoutRows(U, gap, W);
      const h = rows.length * 2 * U + (rows.length - 1) * (gap * 3);
      if (h <= H) break;
    }
    const totalH = rows.length * 2 * U + (rows.length - 1) * gap * 3;
    let y = Math.max(0, (H - totalH) / 2);
    rows.forEach((row, ri) => {
      const rtl = ri % 2 === 1;
      let x = rows.length === 1 ? (W - row.width) / 2 : rtl ? W - 4 : 4;
      for (const p of row.items) {
        const dbl = p.a === p.b;
        const w = dbl ? U : 2 * U, h = dbl ? 2 * U : U;
        if (rtl) x -= w;
        const d = document.createElement('div');
        d.className = 'tile' + (p.id === S.lastId ? ' fresh' : '');
        Object.assign(d.style, { left: x + 'px', top: (y + (2 * U - h) / 2) + 'px', width: w + 'px', height: h + 'px' });
        const im = document.createElement('img');
        im.src = img(p.a, p.b);
        im.alt = '';
        Object.assign(im.style, { width: U + 'px', height: 2 * U + 'px', marginLeft: -U / 2 + 'px', marginTop: -U + 'px' });
        if (!dbl) {
          const visLeft = rtl ? p.r : p.l;
          const top = Math.min(p.a, p.b); // Bilddatei: oben der kleinere Wert
          im.style.transform = `rotate(${visLeft === top ? -90 : 90}deg)`;
        }
        d.appendChild(im);
        if (S.selected && (p === S.chain[0] || p === S.chain[S.chain.length - 1])) d.classList.add('glow');
        boardEl.appendChild(d);
        if (!rtl) x += w + gap; else x -= gap;
      }
      y += 2 * U + gap * 3;
    });
    S.lastId = null;
  }

  function layoutRows(U, gap, W) {
    const maxW = W - 8;
    const rows = [{ items: [], width: 0 }];
    for (const p of S.chain) {
      const w = (p.a === p.b ? U : 2 * U);
      let r = rows[rows.length - 1];
      if (r.items.length && r.width + gap + w > maxW) { r = { items: [], width: 0 }; rows.push(r); }
      r.width += (r.items.length ? gap : 0) + w;
      r.items.push(p);
    }
    return rows;
  }

  /* ---------- Dialoge ---------- */
  const dlg = $('#dlg'), dlgPanel = $('#dlgPanel');
  function showDialog(html) { dlgPanel.innerHTML = html; dlg.hidden = false; }
  dlg.addEventListener('click', (e) => {
    const a = e.target.dataset.a;
    if (!a) return;
    dlg.hidden = true;
    if (a === 'round') newRound();
    if (a === 'match') newMatch();
  });

  $('#helpBtn').onclick = () => showDialog(`<h2>Regeln</h2>
    <ul>
      <li>Jeder erhält 7 Steine (bei 3–4 Spielern 5). Wer den höchsten Pasch hat, beginnt.</li>
      <li>Lege reihum einen Stein mit passender Augenzahl links oder rechts an die Kette an.</li>
      <li>Passt kein Stein, ziehst du aus dem Vorrat. Ist er leer, musst du passen.</li>
      <li>Wer zuerst alle Steine los ist, bekommt die Augen aller Gegner als Punkte.</li>
      <li>Ist das Spiel blockiert, gewinnt die niedrigste Augensumme. Wer zuerst ${TARGET} Punkte hat, gewinnt.</li>
    </ul>
    <div class="actions"><button class="btn primary" data-a="close">Verstanden</button></div>`);

  $('#newBtn').onclick = newMatch;
  $('#oppSel').onchange = newMatch;
  $('#themeSel').onchange = (e) => {
    theme = e.target.value;
    try { localStorage.setItem('domino.theme', theme); } catch (_) {}
    render(S.over);
  };
  new ResizeObserver(() => S && renderBoard()).observe(boardEl);

  newMatch();
})();
