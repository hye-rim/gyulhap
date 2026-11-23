'use strict';
// 결! 합!(더 지니어스): 27장의 그림 카드(모양 3 × 배경색 3 × 도형색 3). 한 라운드에 9장을 펼친다.
// 세 장을 골랐을 때 세 가지 속성이 각각 '모두 같거나 모두 다르면' 합. 남은 합이 없다고 생각하면 결을 외친다.
// 규칙·컴퓨터는 화면 없이 여기서 (LOGIC_GH).
const LOGIC_GH = (() => {
  const SHAPES = ['circle', 'triangle', 'square'], BGS = ['black', 'gray', 'white'], COLORS = ['red', 'yellow', 'blue'];
  const N_CARDS = 27, SHOWN = 9, ROUNDS = 10;
  const POINTS = { set: 1, wrong: -1, endOk: 3, endWrong: -1, dup: -1 };
  const attrs = (id) => [Math.floor(id / 9), Math.floor(id / 3) % 3, id % 3];
  const describe = (id) => { const [s, b, c] = attrs(id); return { shape: SHAPES[s], bg: BGS[b], color: COLORS[c] }; };

  function rng(seed) {
    let t = (seed >>> 0) || 1;
    return () => {
      t = (t + 0x6D2B79F5) | 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 세 장이 합인가: 세 가지 속성 각각이 모두 같거나 모두 다르다
  function isSet(a, b, c) {
    if (new Set([a, b, c]).size !== 3) return false;
    const A = attrs(a), B = attrs(b), C = attrs(c);
    for (let k = 0; k < 3; k++) { const n = new Set([A[k], B[k], C[k]]).size; if (n === 2) return false; }
    return true;
  }
  // 두 장이 정해지면 합이 되는 나머지 한 장은 하나뿐이다
  function thirdOf(a, b) {
    const A = attrs(a), B = attrs(b);
    const t = A.map((x, k) => (x === B[k] ? x : 3 - x - B[k]));
    return t[0] * 9 + t[1] * 3 + t[2];
  }
  const key = (cards) => cards.slice().sort((x, y) => x - y).join(',');

  // 펼친 카드(hand) 안의 모든 합 [[a,b,c], ...]
  function findSets(hand) {
    const out = [], pos = new Map(hand.map((c, i) => [c, i]));
    for (let i = 0; i < hand.length; i++) for (let j = i + 1; j < hand.length; j++) {
      const t = thirdOf(hand[i], hand[j]);
      if (pos.has(t) && pos.get(t) > j) out.push([hand[i], hand[j], t]);
    }
    return out;
  }

  function deal(rand) {
    const ids = Array.from({ length: N_CARDS }, (_, i) => i);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    return ids.slice(0, SHOWN);
  }

  // ---------- 대결: 번갈아 한 번씩 (제한 시간은 화면이 센다) ----------
  // 한 번의 행동: 합 외치기(call: 세 장 고르기) · 결 외치기(end) · 넘기기(pass). 합/결이 틀리면 감점. 라운드는 결이 맞거나, 모두가 연달아 여섯 번 넘기면 끝난다
  function newMatch(opts = {}) {
    const rand = opts.rand || rng(opts.seed || 1);
    const st = { rand, level: opts.level || 'normal', round: 0, score: { you: 0, cpu: 0 }, first: opts.first || 'you', hand: [], found: [], turn: 'you', passes: 0, over: false, winner: null, events: [], roundScores: [] };
    startRound(st); return st;
  }
  function startRound(st) {
    st.round++; st.hand = deal(st.rand); st.found = []; st.passes = 0;
    st.turn = (st.round % 2 === 1) === (st.first === 'you') ? 'you' : 'cpu';
    st.roundStart = { you: st.score.you, cpu: st.score.cpu };
    st.events.push({ t: 'round', round: st.round });
  }
  const other = (s) => (s === 'you' ? 'cpu' : 'you');
  const add = (st, side, d) => { st.score[side] += d; };

  function finishRound(st, why) {
    st.roundScores.push({ round: st.round, you: st.score.you - st.roundStart.you, cpu: st.score.cpu - st.roundStart.cpu, why });
    st.events.push({ t: 'roundEnd', round: st.round, why });
    const tied = st.score.you === st.score.cpu;
    if (st.round >= ROUNDS && !tied) { st.over = true; st.winner = st.score.you > st.score.cpu ? 'you' : 'cpu'; st.events.push({ t: 'over', winner: st.winner }); }
    else startRound(st);                                                                  // 동점이면 연장 라운드
  }

  function act(st, side, a) {
    st.events = [];
    if (st.over) return { ok: false, why: 'over' };
    if (st.turn !== side) return { ok: false, why: 'turn' };
    let result;
    if (a.type === 'call') {
      const cards = a.cards || [];
      if (cards.length !== 3 || new Set(cards).size !== 3 || cards.some((c) => !st.hand.includes(c))) return { ok: false, why: 'cards' };
      const k = key(cards);
      if (st.found.some((f) => key(f) === k)) { add(st, side, POINTS.dup); result = { kind: 'dup', delta: POINTS.dup }; }
      else if (isSet(cards[0], cards[1], cards[2])) { st.found.push(cards.slice().sort((x, y) => x - y)); add(st, side, POINTS.set); result = { kind: 'set', delta: POINTS.set }; }
      else { add(st, side, POINTS.wrong); result = { kind: 'wrong', delta: POINTS.wrong }; }
      st.passes = 0; st.turn = other(side);
    } else if (a.type === 'end') {
      const left = findSets(st.hand).length - st.found.length;
      if (left === 0) { add(st, side, POINTS.endOk); result = { kind: 'endOk', delta: POINTS.endOk }; st.events.push({ t: 'result', side, ...result }); finishRound(st, 'end'); return { ok: true, ...result }; }
      add(st, side, POINTS.endWrong); result = { kind: 'endWrong', delta: POINTS.endWrong }; st.passes = 0; st.turn = other(side);
    } else if (a.type === 'timeout') {                                          // 합이라고 해 놓고 시간 안에 세 장을 못 고름: 틀린 것과 같이 감점
      add(st, side, POINTS.wrong); result = { kind: 'timeout', delta: POINTS.wrong }; st.passes = 0; st.turn = other(side);
    } else if (a.type === 'pass') {
      st.passes++; result = { kind: 'pass', delta: 0 }; st.turn = other(side);
      st.events.push({ t: 'result', side, ...result });
      if (st.passes >= 6) { finishRound(st, 'passes'); return { ok: true, ...result }; }
      return { ok: true, ...result };
    } else return { ok: false, why: 'type' };
    st.events.push({ t: 'result', side, ...result });
    return { ok: true, ...result };
  }

  // ---------- 컴퓨터 ----------
  // 컴퓨터는 자기 차례에 (실력만큼) 남은 합을 찾아 외치고, 남은 합이 없다고 보면 결을 외친다. level: easy · normal · hard
  const SKILL = { easy: { find: 0.45, slip: 0.12, endOk: 0.35, endBad: 0.06 }, normal: { find: 0.72, slip: 0.06, endOk: 0.7, endBad: 0.03 }, hard: { find: 0.92, slip: 0.02, endOk: 0.95, endBad: 0.01 } };
  function cpuAction(st) {
    const sk = SKILL[st.level] || SKILL.normal, rand = st.rand;
    const sets = findSets(st.hand), left = sets.filter((s) => !st.found.some((f) => key(f) === key(s)));
    if (left.length === 0) {
      if (rand() < sk.endOk) return { type: 'end', think: thinkTime(st, rand) };
      return { type: 'pass', think: thinkTime(st, rand) };
    }
    if (rand() < sk.endBad) return { type: 'end', think: thinkTime(st, rand) };           // 남아 있는데 결을 외치는 실수
    if (rand() < sk.find) {
      if (rand() < sk.slip) { const w = st.hand.slice().sort(() => rand() - 0.5).slice(0, 3); if (!isSet(w[0], w[1], w[2])) return { type: 'call', cards: w, think: thinkTime(st, rand) }; }
      return { type: 'call', cards: left[Math.floor(rand() * left.length)], think: thinkTime(st, rand) };
    }
    return { type: 'pass', think: thinkTime(st, rand) };
  }
  const thinkTime = (st, rand) => ({ easy: 5, normal: 3.5, hard: 2 }[st.level] * (0.6 + rand() * 0.8));          // 초

  // ---------- 혼자 하기(블랙 미션): 한 라운드의 합을 모두 찾고 결 ----------
  function newSolo(opts = {}) {
    const rand = opts.rand || rng(opts.seed || 1);
    const hand = deal(rand);
    return { hand, sets: findSets(hand), found: [], wrong: 0, done: false, failed: false };
  }
  function soloSubmit(sd, cards) {
    if (sd.done || cards.length !== 3 || new Set(cards).size !== 3 || cards.some((c) => !sd.hand.includes(c))) return { ok: false };
    const k = key(cards);
    if (sd.found.some((f) => key(f) === k)) return { ok: true, kind: 'dup' };
    if (isSet(cards[0], cards[1], cards[2])) { sd.found.push(cards.slice().sort((x, y) => x - y)); return { ok: true, kind: 'set', left: sd.sets.length - sd.found.length }; }
    sd.wrong++; return { ok: true, kind: 'wrong' };
  }
  function soloEnd(sd) {                                                 // 결: 합을 다 찾았으면 성공, 아니면 틀림(계속)
    if (sd.found.length === sd.sets.length) { sd.done = true; return { ok: true, kind: 'endOk' }; }
    sd.wrong++; return { ok: true, kind: 'endWrong', left: sd.sets.length - sd.found.length };
  }

  return { SHAPES, BGS, COLORS, N_CARDS, SHOWN, ROUNDS, POINTS, attrs, describe, rng, isSet, thirdOf, findSets, deal, newMatch, startRound, act, cpuAction, newSolo, soloSubmit, soloEnd, key };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LOGIC_GH;
