/* Rommé – Oberfläche, Spielablauf und Computergegner. */
(() => {
  'use strict';
  const L = window.RommeLogic;
  const $ = (s) => document.querySelector(s);
  const CARD = (c) => '../../assets/cards/' + L.img(c);
  const BACK = '../../assets/cards/cardBack_blue2.png';
  const NPC_NAMES = ['Anna', 'Ben', 'Clara'];
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  let G = null;
  let sortMode = 'suit';

  /* ---------- Spielstart ---------- */
  function newMatch() {
    const n = +$('#npcSel').value;
    const players = [{ name: 'Du', human: true, total: 0 }];
    for (let i = 0; i < n; i++) players.push({ name: NPC_NAMES[i], human: false, total: 0 });
    G = { players, round: 0, starter: 0, history: [] };
    newRound();
  }

  function newRound() {
    G.round++;
    G.token = Math.random(); // bricht laufende NPC-Züge alter Runden ab
    G.deck = L.shuffle(L.makeDeck());
    G.discard = [];
    G.melds = [];
    G.over = false;
    G.openNeeded = $('#openRule').checked ? 40 : 0;
    for (const p of G.players) { p.hand = G.deck.splice(0, 13); p.opened = false; p.msg = ''; }
    G.discard.push(G.deck.pop());
    G.turn = G.starter;
    G.starter = (G.starter + 1) % G.players.length;
    G.sel = new Set();
    $('#dlg').hidden = true;
    startTurn();
  }

  function startTurn() {
    const p = G.players[G.turn];
    G.phase = 'draw';
    G.turnMelds = [];
    G.takenDiscard = null;
    G.snapshot = null;
    G.newCard = null;
    G.players.forEach(q => q.isTurn = q === p);
    if (p.human) {
      status('Du bist dran: Ziehe eine Karte vom Stapel oder nimm die oberste der Ablage.');
      render();
    } else {
      render();
      npcTurn(p, G.token);
    }
  }

  function drawFromStock(p) {
    if (!G.deck.length) {
      const top = G.discard.pop();
      G.deck = L.shuffle(G.discard);
      G.discard = [top];
      toast('Der Stapel wurde aus der Ablage neu gemischt.');
    }
    const c = G.deck.pop();
    if (c) p.hand.push(c);
    return c;
  }

  /* ---------- Computergegner ---------- */
  async function npcTurn(p, token) {
    const alive = () => G.token === token && !G.over;
    await sleep(600);
    if (!alive()) return;

    // 1) Ziehen: Ablage nehmen, wenn sie sofort für eine Kombination nützt
    const top = G.discard[G.discard.length - 1];
    let took = false;
    if (top) {
      const before = L.bestMelds(p.hand, 'cards');
      const after = L.bestMelds(p.hand.concat([top]), 'cards');
      const usesTop = after.melds.some(m => m.ordered.includes(top));
      const opensNow = !p.opened && G.openNeeded && L.bestMelds(p.hand.concat([top]), 'points').points >= G.openNeeded;
      const layoff = p.opened && !top.j && G.melds.some(m => L.analyze(m.cards.concat([top]), false));
      if (top.j || (usesTop && after.cards > before.cards && (p.opened || opensNow || !G.openNeeded)) || layoff) {
        p.hand.push(G.discard.pop());
        G.takenDiscard = top;
        took = true;
      }
    }
    if (!took) drawFromStock(p);
    p.msg = took ? `nimmt ${L.cardName(top)}` : 'zieht vom Stapel';
    render();
    await sleep(700);
    if (!alive()) return;

    // 2) Auslegen
    const plan = L.bestMelds(p.hand, p.opened ? 'cards' : 'points');
    if (plan.melds.length && (p.opened || plan.points >= G.openNeeded)) {
      for (const m of plan.melds) {
        layMeld(p, m.ordered);
      }
      p.opened = true;
      p.msg = `legt ${plan.melds.length} Kombination${plan.melds.length > 1 ? 'en' : ''} aus`;
      render();
      if (checkWin(p)) return;
      await sleep(700);
      if (!alive()) return;
    }

    // 3) Anlegen
    if (p.opened) {
      let added = 0, again = true;
      while (again) {
        again = false;
        for (const c of [...p.hand]) {
          if (c.j && p.hand.length > 2) continue; // Joker lieber behalten
          for (const m of G.melds) {
            const a = L.analyze(m.cards.concat([c]), false);
            if (a && p.hand.length > 1) {
              m.cards = a.ordered; m.points = a.points;
              p.hand.splice(p.hand.indexOf(c), 1);
              added++; again = true; break;
            }
          }
          if (again) break;
        }
      }
      if (added) {
        p.msg = `legt ${added} Karte${added > 1 ? 'n' : ''} an`;
        render();
        await sleep(600);
        if (!alive()) return;
      }
    }

    // 4) Abwerfen
    let pick = null, worst = Infinity;
    for (const c of p.hand) {
      if (c === G.takenDiscard && p.hand.length > 1) continue;
      const s = L.keepScore(c, p.hand) + Math.random();
      if (s < worst) { worst = s; pick = c; }
    }
    if (pick) {
      p.hand.splice(p.hand.indexOf(pick), 1);
      G.discard.push(pick);
      p.msg = `wirft ${L.cardName(pick)} ab`;
    }
    render();
    if (checkWin(p)) return;
    nextPlayer();
  }

  function layMeld(p, cards) {
    for (const c of cards) p.hand.splice(p.hand.indexOf(c), 1);
    const a = L.analyze(cards, true);
    const m = { id: Math.random(), owner: p.name, cards: a.ordered, points: a.points, type: a.type };
    G.melds.push(m);
    return m;
  }

  function nextPlayer() {
    G.turn = (G.turn + 1) % G.players.length;
    startTurn();
  }

  function checkWin(p) {
    if (p.hand.length) return false;
    G.over = true;
    G.players.forEach(q => q.isTurn = false);
    const res = G.players.map(q => {
      const pen = q.hand.reduce((s, c) => s + L.handValue(c), 0) * (q.opened || q === p ? 1 : 2);
      q.total += pen;
      return { name: q.name, pen, total: q.total };
    });
    G.history.push({ round: G.round, winner: p.name, res });
    status(p.human ? 'Du hast gewonnen!' : `${p.name} hat die Runde gewonnen.`);
    render(true);
    const rows = res.map(r => `<tr><td>${r.name}</td><td class="num">${r.pen ? '+' + r.pen : '0'}</td><td class="num"><b>${r.total}</b></td></tr>`).join('');
    dialog(`<h2>${p.human ? 'Rommé! Du gewinnst die Runde 🎉' : `${p.name} macht Rommé`}</h2>
      <p>Verbleibende Handkarten zählen als Minuspunkte (Joker 20, Ass 11, Bilder 10). Wer noch nicht ausgelegt hatte, zahlt doppelt. Wenige Punkte sind gut.</p>
      <table class="score"><tr><th>Spieler</th><th class="num">Runde</th><th class="num">Gesamt</th></tr>${rows}</table>
      <div class="actions"><button class="btn" data-a="close">Tisch ansehen</button><button class="btn primary" data-a="round">Nächste Runde</button></div>`);
    return true;
  }

  /* ---------- Menschlicher Spieler ---------- */
  const me = () => G.players[0];
  const myTurn = () => !G.over && G.players[G.turn].human;
  const turnPoints = () => G.turnMelds.reduce((s, m) => s + m.points, 0);
  const canLayOff = () => me().opened || turnPoints() >= G.openNeeded;

  function takeSnapshot() {
    G.snapshot = { opened: me().opened, hand: [...me().hand], melds: G.melds.map(m => ({ ...m, cards: [...m.cards] })) };
  }

  function humanDraw(fromDiscard) {
    if (!myTurn() || G.phase !== 'draw') return;
    let c;
    if (fromDiscard) {
      if (!G.discard.length) return;
      c = G.discard.pop();
      me().hand.push(c);
      G.takenDiscard = c;
    } else c = drawFromStock(me());
    G.newCard = c;
    G.phase = 'play';
    takeSnapshot();
    status('Lege Kombinationen aus, lege an oder wirf eine Karte ab.');
    render();
  }

  function selectedCards() { return me().hand.filter(c => G.sel.has(c.id)); }

  function humanMeld() {
    if (!myTurn() || G.phase !== 'play') return;
    const cards = selectedCards();
    const a = L.analyze(cards, true);
    if (!a) return toast('Keine gültige Kombination (Satz oder Reihe aus mind. 3 Karten).');
    if (me().hand.length === cards.length && !(me().opened || turnPoints() + a.points >= G.openNeeded))
      return toast(`Für die Erstauslage brauchst du ${G.openNeeded} Punkte.`);
    const m = layMeld(me(), cards);
    m.fresh = true;
    G.turnMelds.push(m);
    G.sel.clear();
    if (!me().opened && turnPoints() >= G.openNeeded) {
      me().opened = true;
      toast(`Erstauslage geschafft (${turnPoints()} Punkte)!`);
    }
    render();
    checkWin(me());
  }

  function humanLayOff(m) {
    if (!myTurn() || G.phase !== 'play') return;
    const cards = selectedCards();
    if (!cards.length) return;
    if (!canLayOff()) return toast(`Anlegen erst nach der Erstauslage (${G.openNeeded} Punkte).`);
    const a = L.analyze(m.cards.concat(cards), false);
    if (!a) return toast('Diese Karten passen nicht an die Kombination.');
    m.cards = a.ordered; m.points = a.points;
    for (const c of cards) me().hand.splice(me().hand.indexOf(c), 1);
    G.sel.clear();
    if (!me().opened && turnPoints() >= G.openNeeded) me().opened = true;
    render();
    checkWin(me());
  }

  function humanDiscard() {
    if (!myTurn() || G.phase !== 'play') return;
    const cards = selectedCards();
    if (cards.length !== 1) return toast('Wähle genau eine Karte zum Abwerfen.');
    const c = cards[0];
    if (c === G.takenDiscard && me().hand.length > 1) return toast('Die eben aufgenommene Karte darfst du nicht gleich wieder abwerfen.');
    if (!me().opened && G.turnMelds.length && turnPoints() < G.openNeeded)
      return toast(`Erstauslage: ${turnPoints()}/${G.openNeeded} Punkte. Lege mehr aus oder nimm den Zug zurück.`);
    if (G.turnMelds.length) me().opened = true;
    me().hand.splice(me().hand.indexOf(c), 1);
    G.discard.push(c);
    G.sel.clear();
    G.melds.forEach(m => m.fresh = false);
    me().msg = '';
    render();
    if (checkWin(me())) return;
    nextPlayer();
  }

  function humanReset() {
    if (!myTurn() || G.phase !== 'play' || !G.snapshot) return;
    me().hand = [...G.snapshot.hand];
    G.melds = G.snapshot.melds.map(m => ({ ...m, cards: [...m.cards] }));
    me().opened = G.snapshot.opened;
    G.turnMelds = [];
    G.sel.clear();
    render();
  }

  /* ---------- Darstellung ---------- */
  function sortHand(hand) {
    const sv = (c) => c.j ? 99 : L.SUITS.indexOf(c.s);
    const rv = (c) => c.j ? 99 : c.r === 1 ? 14 : c.r;
    if (sortMode === 'suit') hand.sort((a, b) => sv(a) - sv(b) || rv(a) - rv(b));
    else hand.sort((a, b) => rv(a) - rv(b) || sv(a) - sv(b));
  }

  function render(reveal = false) {
    // Gegner
    const opps = $('#opps');
    opps.innerHTML = '';
    for (const p of G.players.slice(1)) {
      const d = document.createElement('div');
      d.className = 'opp' + (p.isTurn ? ' turn' : '');
      const fan = p.hand.slice(0, 14).map(c => `<img src="${reveal ? CARD(c) : BACK}" alt="">`).join('');
      d.innerHTML = `<span class="name">${p.name}${p.opened ? '<span class="badge">ausgelegt</span>' : ''}</span>
        <span class="fan">${fan}</span><span class="msg">${p.hand.length} Karten · ${p.msg || ''}</span>`;
      opps.appendChild(d);
    }

    // Stapel
    $('#stockCount').textContent = G.deck.length;
    const top = G.discard[G.discard.length - 1];
    $('#discard').innerHTML = top ? `<img src="${CARD(top)}" alt="${L.cardName(top)}">` : '';
    const drawing = myTurn() && G.phase === 'draw';
    $('#stock').classList.toggle('active', drawing);
    $('#discard').classList.toggle('active', drawing && !!top || (myTurn() && G.phase === 'play' && G.sel.size === 1));

    // Tisch
    const table = $('#table');
    table.innerHTML = '';
    if (!G.melds.length) table.innerHTML = '<div class="empty">Noch keine Kombinationen ausgelegt.<br>Sätze: 3–4 gleiche Werte · Reihen: mind. 3 aufeinanderfolgende Karten einer Farbe</div>';
    const sel = selectedCards();
    for (const m of G.melds) {
      const d = document.createElement('div');
      const target = myTurn() && G.phase === 'play' && sel.length && canLayOff() && L.analyze(m.cards.concat(sel), false);
      d.className = 'meld' + (m.fresh ? ' mine-new' : '') + (target ? ' target' : '');
      d.innerHTML = `<span class="owner">${m.owner}</span>` + m.cards.map(c => `<img src="${CARD(c)}" alt="${L.cardName(c)}">`).join('');
      d.addEventListener('click', () => humanLayOff(m));
      table.appendChild(d);
    }

    // Hand
    const hand = $('#hand');
    sortHand(me().hand);
    hand.classList.toggle('turn', myTurn());
    hand.innerHTML = '';
    const cw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cw')) || 70;
    const n = me().hand.length;
    const avail = hand.clientWidth - 24;
    const overlap = n > 1 ? Math.min(6, (avail - n * cw) / (n - 1)) : 0;
    me().hand.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'card' + (G.sel.has(c.id) ? ' sel' : '') + (c === G.newCard ? ' new' : '');
      b.style.marginLeft = i ? overlap + 'px' : '0';
      b.style.zIndex = i;
      b.innerHTML = `<img src="${CARD(c)}" alt="${L.cardName(c)}">`;
      b.title = L.cardName(c);
      b.addEventListener('click', () => {
        if (G.over) return;
        if (G.sel.has(c.id)) G.sel.delete(c.id); else G.sel.add(c.id);
        render();
      });
      hand.appendChild(b);
    });

    // Knöpfe & Status
    const playing = myTurn() && G.phase === 'play';
    const a = sel.length >= 3 ? L.analyze(sel, true) : null;
    $('#meldBtn').disabled = !playing || !a;
    $('#meldBtn').textContent = a ? `Auslegen (${a.type === 'set' ? 'Satz' : 'Reihe'}, ${a.points} P)` : 'Auslegen';
    $('#discardBtn').disabled = !playing || sel.length !== 1;
    $('#resetBtn').disabled = !playing || !snapshotDiffers();
    $('#roundInfo').innerHTML = `Runde <b>${G.round}</b> · Stapel <b>${G.deck.length}</b>`;
    if (playing && !me().opened && G.openNeeded) {
      status(`Erstauslage: ${turnPoints()}/${G.openNeeded} Punkte` + (sel.length ? ` · Auswahl: ${a ? a.points + ' P' : 'keine gültige Kombination'}` : ''));
    } else if (playing) {
      status(sel.length ? (a ? `Auswahl: ${a.type === 'set' ? 'Satz' : 'Reihe'} mit ${a.points} Punkten` : 'Wähle Karten zum Auslegen, klicke eine Tisch-Kombination zum Anlegen.') :
        'Lege aus, lege an oder wirf eine Karte ab.');
    } else if (!G.over && !myTurn()) {
      status(`${G.players[G.turn].name} ist am Zug …`);
    }
  }

  function snapshotDiffers() {
    return G.snapshot && (G.snapshot.hand.length !== me().hand.length);
  }

  function status(t) { $('#status').textContent = t; }
  let toastT;
  function toast(t) {
    const el = $('#toast'); el.textContent = t; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2600);
  }

  const dlg = $('#dlg');
  function dialog(html) { $('#dlgPanel').innerHTML = html; dlg.hidden = false; }
  dlg.addEventListener('click', (e) => {
    const a = e.target.dataset.a;
    if (!a) return;
    dlg.hidden = true;
    if (a === 'round') newRound();
    if (a === 'match') newMatch();
  });

  function showScores() {
    const head = G.players.map(p => `<th class="num">${p.name}</th>`).join('');
    const rows = G.history.map(h => `<tr><td>${h.round}</td>${h.res.map(r => `<td class="num">${r.pen}</td>`).join('')}</tr>`).join('');
    const tot = G.players.map(p => `<td class="num"><b>${p.total}</b></td>`).join('');
    dialog(`<h2>Punktestand</h2><p>Minuspunkte je Runde – wer am wenigsten hat, führt.</p>
      <table class="score"><tr><th>Runde</th>${head}</tr>${rows || ''}<tr><td><b>Summe</b></td>${tot}</tr></table>
      <div class="actions"><button class="btn" data-a="match">Neues Spiel</button><button class="btn primary" data-a="close">Schließen</button></div>`);
  }

  /* ---------- Ereignisse ---------- */
  $('#stock').onclick = () => humanDraw(false);
  $('#discard').onclick = () => {
    if (G.phase === 'draw') humanDraw(true); else humanDiscard();
  };
  $('#meldBtn').onclick = humanMeld;
  $('#discardBtn').onclick = humanDiscard;
  $('#resetBtn').onclick = humanReset;
  $('#sortBtn').onclick = () => {
    sortMode = sortMode === 'suit' ? 'rank' : 'suit';
    $('#sortBtn').textContent = 'Sortieren: ' + (sortMode === 'suit' ? 'Farbe' : 'Wert');
    render(G.over);
  };
  $('#newBtn').onclick = newMatch;
  $('#npcSel').onchange = newMatch;
  $('#openRule').onchange = () => toast('Gilt ab der nächsten Runde.');
  $('#scoreBtn').onclick = showScores;
  $('#helpBtn').onclick = () => dialog(`<h2>Rommé – Regeln</h2>
    <ul>
      <li>Gespielt wird mit 110 Karten (2 × 52 + 6 Joker). Jeder erhält 13 Karten.</li>
      <li>Ziehe zu Beginn deines Zuges eine Karte vom Stapel oder nimm die oberste Karte der Ablage.</li>
      <li><b>Sätze:</b> 3–4 Karten gleichen Werts in verschiedenen Farben. <b>Reihen:</b> mind. 3 aufeinanderfolgende Karten einer Farbe (Ass vor der 2 oder nach dem König).</li>
      <li>Die erste Auslage muss zusammen mindestens 40 Punkte ergeben (Ass 11 bzw. 1 in A-2-3, Bilder 10, Joker zählt wie die ersetzte Karte).</li>
      <li>Nach der Erstauslage darfst du Karten an beliebige Kombinationen auf dem Tisch anlegen: Karten wählen, dann die Kombination anklicken.</li>
      <li>Beende jeden Zug durch Abwerfen einer Karte. Wer zuerst keine Karten mehr hat, gewinnt die Runde.</li>
      <li>„Zug zurücknehmen“ holt alles, was du in diesem Zug ausgelegt oder angelegt hast, zurück auf die Hand.</li>
    </ul>
    <div class="actions"><button class="btn primary" data-a="close">Verstanden</button></div>`);

  function fitCards() {
    const w = innerWidth, h = innerHeight;
    const cw = Math.max(44, Math.min(78, w / 14, h / 9.5));
    document.documentElement.style.setProperty('--cw', cw + 'px');
    if (G) render(G.over);
  }
  addEventListener('resize', fitCards);
  fitCards();
  newMatch();
})();
