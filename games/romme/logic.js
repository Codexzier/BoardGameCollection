/* Rommé – Spiellogik (ohne DOM), auch in Node testbar. */
(function (root) {
  'use strict';

  const SUITS = ['Hearts', 'Spades', 'Diamonds', 'Clubs'];
  const RANK_NAME = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  const RANK_DE = { 1: 'Ass', 11: 'Bube', 12: 'Dame', 13: 'König' };
  const SUIT_DE = { Hearts: 'Herz', Spades: 'Pik', Diamonds: 'Karo', Clubs: 'Kreuz' };

  function makeDeck() {
    const d = [];
    let id = 0;
    for (let copy = 0; copy < 2; copy++)
      for (const s of SUITS) for (let r = 1; r <= 13; r++) d.push({ id: id++, s, r, j: false });
    for (let k = 0; k < 6; k++) d.push({ id: id++, j: true });
    return d;
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  const cardName = (c) => c.j ? 'Joker' : `${SUIT_DE[c.s]} ${RANK_DE[c.r] || c.r}`;
  const img = (c) => c.j ? 'cardJoker.png' : `card${c.s}${RANK_NAME[c.r] || c.r}.png`;

  // Strafpunkte für Karten auf der Hand
  const handValue = (c) => c.j ? 20 : c.r === 1 ? 11 : c.r >= 10 ? 10 : c.r;
  // Wert einer Position in einer Auslage (1 = Ass unten, 14 = Ass oben)
  const posValue = (p) => p === 1 ? 1 : p === 14 ? 11 : p >= 10 ? 10 : p;

  /**
   * Prüft eine Kombination. strict = für neue Auslagen (mind. 2 echte Karten, nicht mehr Joker als echte).
   * Rückgabe: { type: 'set'|'run', points, ordered } oder null
   */
  function analyze(cards, strict) {
    const n = cards.length;
    if (n < 3) return null;
    const nat = cards.filter(c => !c.j), jok = cards.filter(c => c.j);
    if (!nat.length) return null;
    if (strict && (nat.length < 2 || jok.length > nat.length)) return null;

    // Satz: gleicher Wert, verschiedene Farben, 3–4 Karten
    if (n <= 4 && nat.every(c => c.r === nat[0].r) && new Set(nat.map(c => c.s)).size === nat.length) {
      const v = nat[0].r === 1 ? 11 : posValue(nat[0].r);
      const ordered = [...nat].sort((a, b) => SUITS.indexOf(a.s) - SUITS.indexOf(b.s)).concat(jok);
      return { type: 'set', points: v * n, ordered };
    }

    // Reihe: gleiche Farbe, aufeinanderfolgend
    const suit = nat[0].s;
    if (n > 13 || !nat.every(c => c.s === suit)) return null;
    for (const high of [false, true]) {
      const m = (c) => (c.r === 1 && high) ? 14 : c.r;
      const vals = nat.map(m);
      if (new Set(vals).size !== vals.length) continue;
      const mn = Math.min(...vals), mx = Math.max(...vals);
      if (mx - mn + 1 > n) continue;
      for (let lo = mn; lo >= mx - n + 1; lo--) {
        const hi = lo + n - 1;
        if (lo < 1 || hi > 14) continue;
        const jl = [...jok];
        const ordered = [];
        let points = 0;
        for (let p = lo; p <= hi; p++) {
          const c = nat.find(x => m(x) === p);
          ordered.push(c || jl.pop());
          points += posValue(p);
        }
        return { type: 'run', points, ordered };
      }
    }
    return null;
  }

  /** Mögliche Kombinationen einer Hand (Kandidaten mit Platzhalter-Jokern) */
  function candidates(hand) {
    const nat = hand.filter(c => !c.j);
    const J = hand.filter(c => c.j).length;
    const out = [];
    const push = (natural, jok) => {
      const fake = Array.from({ length: jok }, (_, k) => ({ j: true, id: -1 - k }));
      const a = analyze(natural.concat(fake), true);
      if (a) out.push({ nat: natural, jok, points: a.points, size: natural.length + jok });
    };

    // Sätze
    const byRank = {};
    for (const c of nat) { const m = (byRank[c.r] ||= {}); if (!m[c.s]) m[c.s] = c; }
    for (const r in byRank) {
      const u = Object.values(byRank[r]);
      const subsets = (arr) => arr.reduce((acc, x) => acc.concat(acc.map(s => s.concat([x]))), [[]]);
      for (const s of subsets(u)) {
        if (s.length >= 3) push(s, 0);
        if (J && (s.length === 2 || s.length === 3)) push(s, 1);
      }
    }
    // Reihen
    for (const s of SUITS) {
      const map = {};
      for (const c of nat) if (c.s === s) { if (!map[c.r]) map[c.r] = c; if (c.r === 1 && !map[14]) map[14] = c; }
      for (let lo = 1; lo <= 12; lo++) {
        const list = [];
        let used = 0;
        for (let hi = lo; hi <= Math.min(14, lo + 12); hi++) {
          const c = map[hi];
          if (c && !list.includes(c)) list.push(c); else used++;
          if (used > J) break;
          if (hi - lo + 1 >= 3 && list.length >= 2 && used <= list.length && map[lo]) push([...list], used);
        }
      }
    }
    out.sort((a, b) => b.size - a.size || b.points - a.points);
    return out;
  }

  /**
   * Beste Aufteilung der Hand in Kombinationen.
   * mode 'cards' = möglichst viele Karten, 'points' = möglichst viele Punkte.
   */
  function bestMelds(hand, mode = 'cards') {
    const cands = candidates(hand);
    const jokers = hand.filter(c => c.j);
    const used = new Set();
    let best = { score: 0, melds: [], points: 0, cards: 0 };
    let nodes = 0;
    const chosen = [];
    (function dfs(i, jLeft, cards, pts) {
      if (++nodes > 30000) return;
      const score = mode === 'points' ? pts * 100 + cards : cards * 100 + pts;
      if (score > best.score) best = { score, melds: chosen.slice(), points: pts, cards };
      for (let k = i; k < cands.length; k++) {
        const c = cands[k];
        if (c.jok > jLeft || c.nat.some(x => used.has(x.id))) continue;
        c.nat.forEach(x => used.add(x.id)); chosen.push(c);
        dfs(k + 1, jLeft - c.jok, cards + c.size, pts + c.points);
        chosen.pop(); c.nat.forEach(x => used.delete(x.id));
      }
    })(0, jokers.length, 0, 0);
    // echte Joker zuordnen
    const jl = [...jokers];
    const melds = best.melds.map(c => analyze(c.nat.concat(jl.splice(0, c.jok)), true));
    return { melds, points: best.points, cards: best.cards };
  }

  /** Wie „nützlich“ eine Karte für die Hand ist (höher = behalten) */
  function keepScore(c, hand) {
    if (c.j) return 1000;
    let s = -handValue(c);
    for (const o of hand) {
      if (o === c || o.j) continue;
      if (o.r === c.r && o.s !== c.s) s += 9;
      if (o.s === c.s) {
        const d = Math.abs(o.r - c.r);
        if (d === 1) s += 9; else if (d === 2) s += 5;
        if ((c.r === 1 && o.r >= 12) || (o.r === 1 && c.r >= 12)) s += 4;
      }
    }
    return s;
  }

  const api = { SUITS, makeDeck, shuffle, analyze, candidates, bestMelds, keepScore, handValue, cardName, img };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RommeLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
