'use strict';

// 결! 합! 규칙·컴퓨터 시험. 실행: node --test (디렉터리)
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

test('27 distinct cards: every combination of shape, background and shape colour', () => {
  const seen = new Set();
  for (let i = 0; i < L.N_CARDS; i++) { const d = L.describe(i); seen.add(`${d.shape}/${d.bg}/${d.color}`); assert.ok(L.SHAPES.includes(d.shape) && L.BGS.includes(d.bg) && L.COLORS.includes(d.color)); }
  assert.strictEqual(seen.size, 27);
});

test('a set: each of the three attributes is all the same or all different (117 sets among the 27 cards)', () => {
  let count = 0;
  for (let a = 0; a < 27; a++) for (let b = a + 1; b < 27; b++) for (let c = b + 1; c < 27; c++) {
    const A = L.attrs(a), B = L.attrs(b), C = L.attrs(c);
    const brute = [0, 1, 2].every((k) => { const n = new Set([A[k], B[k], C[k]]).size; return n === 1 || n === 3; });
    assert.strictEqual(L.isSet(a, b, c), brute);
    if (brute) count++;
  }
  assert.strictEqual(count, 117);
  assert.ok(!L.isSet(1, 1, 2), 'the same card twice is not a set');
});

test('two cards decide the third one that completes the set', () => {
  for (let a = 0; a < 27; a++) for (let b = 0; b < 27; b++) { if (a === b) continue; const t = L.thirdOf(a, b); assert.ok(L.isSet(a, b, t), `${a},${b},${t}`); }
});

test('findSets finds exactly the sets in a hand, and a deal is nine different cards', () => {
  const rand = L.rng(5);
  for (let k = 0; k < 60; k++) {
    const hand = L.deal(rand); assert.strictEqual(hand.length, 9); assert.strictEqual(new Set(hand).size, 9);
    let brute = 0; for (let i = 0; i < 9; i++) for (let j = i + 1; j < 9; j++) for (let l = j + 1; l < 9; l++) if (L.isSet(hand[i], hand[j], hand[l])) brute++;
    assert.strictEqual(L.findSets(hand).length, brute);
    for (const s of L.findSets(hand)) assert.ok(L.isSet(...s) && s.every((c) => hand.includes(c)));
  }
});

test('match scoring: a set is +1, a wrong set -1, a repeated set -1, a correct end +3 and a wrong end -1', () => {
  const st = L.newMatch({ seed: 3 });
  const sets = L.findSets(st.hand);
  const wrong = (() => { const h = st.hand; for (let i = 0; i < 9; i++) for (let j = i + 1; j < 9; j++) for (let k = j + 1; k < 9; k++) if (!L.isSet(h[i], h[j], h[k])) return [h[i], h[j], h[k]]; })();
  assert.strictEqual(st.turn, 'you');
  if (sets.length) { const r = L.act(st, 'you', { type: 'call', cards: sets[0] }); assert.deepStrictEqual([r.kind, r.delta], ['set', 1]); assert.strictEqual(st.turn, 'cpu'); }
  const w = L.act(st, 'cpu', { type: 'call', cards: wrong }); assert.deepStrictEqual([w.kind, w.delta], ['wrong', -1]);
  if (sets.length) { const d = L.act(st, 'you', { type: 'call', cards: sets[0] }); assert.deepStrictEqual([d.kind, d.delta], ['dup', -1]); }
  assert.strictEqual(st.score.you + st.score.cpu, (sets.length ? 1 - 1 : 0) + (-1));
});

test('end: correct only when no set is left; it finishes the round', () => {
  const st = L.newMatch({ seed: 1 });
  let guard = 0; while (L.findSets(st.hand).length === 0 && guard++ < 50) L.startRound(st);                 // 합이 하나라도 있는 판을 찾는다(라운드만 넘김)
  const sets = L.findSets(st.hand), before = st.round;
  const side = st.turn, bad = L.act(st, side, { type: 'end' });
  assert.deepStrictEqual([bad.kind, bad.delta], ['endWrong', -1]); assert.strictEqual(st.round, before, 'a wrong end does not finish the round');
  for (const s of sets) { L.act(st, st.turn, { type: 'call', cards: s }); }
  const s2 = st.turn, ok = L.act(st, s2, { type: 'end' });
  assert.deepStrictEqual([ok.kind, ok.delta], ['endOk', 3]); assert.strictEqual(st.round, before + 1, 'the round moved on');
  assert.ok(st.events.some((e) => e.t === 'roundEnd'));
});

test('six passes in a row end the round; any call in between resets the count', () => {
  const st = L.newMatch({ seed: 2 }), r0 = st.round;
  for (let i = 0; i < 5; i++) L.act(st, st.turn, { type: 'pass' });
  assert.strictEqual(st.round, r0); assert.strictEqual(st.passes, 5);
  L.act(st, st.turn, { type: 'pass' }); assert.strictEqual(st.round, r0 + 1);
  const t = st.round; for (let i = 0; i < 3; i++) L.act(st, st.turn, { type: 'pass' });
  L.act(st, st.turn, { type: 'end' }); assert.strictEqual(st.passes, 0, 'a call resets the passes'); assert.strictEqual(st.round, t);
});

test('turns alternate, and who starts a round alternates too; illegal actions are refused', () => {
  const st = L.newMatch({ seed: 4, first: 'you' });
  assert.strictEqual(st.turn, 'you');
  assert.strictEqual(L.act(st, 'cpu', { type: 'pass' }).why, 'turn');
  const outside = [...Array(27).keys()].find((c) => !st.hand.includes(c));
  assert.strictEqual(L.act(st, 'you', { type: 'call', cards: [st.hand[0], st.hand[1], outside] }).why, 'cards', 'a card that is not on the table');
  assert.strictEqual(L.act(st, 'you', { type: 'call', cards: [st.hand[0], st.hand[0], st.hand[1]] }).why, 'cards', 'the same card twice');
  assert.strictEqual(L.act(st, 'you', { type: 'call', cards: [st.hand[0], st.hand[1]] }).why, 'cards', 'only two cards');
  assert.strictEqual(st.turn, 'you', 'refused actions do not change the turn');
  const s2 = L.newMatch({ seed: 4 });
  assert.strictEqual(L.act(s2, 'you', { type: 'dance' }).why, 'type');
  L.startRound(s2); assert.strictEqual(s2.turn, 'cpu', 'round 2 starts with the other side');
});

test('ten rounds, then the higher score wins; a tie plays extra rounds', () => {
  const st = L.newMatch({ seed: 6, level: 'normal' });
  let guard = 0;
  while (!st.over && guard++ < 5000) { const side = st.turn; const a = L.cpuAction(st); L.act(st, side, a); }
  assert.ok(st.over); assert.ok(st.round >= L.ROUNDS);
  assert.notStrictEqual(st.score.you, st.score.cpu, 'no tie at the end'); assert.strictEqual(st.winner, st.score.you > st.score.cpu ? 'you' : 'cpu');
  assert.ok(st.roundScores.length >= L.ROUNDS);
});

test('the computer only does legal things on every level', () => {
  for (const level of ['easy', 'normal', 'hard']) for (let seed = 1; seed <= 15; seed++) {
    const st = L.newMatch({ seed, level }); let guard = 0;
    while (!st.over && guard++ < 5000) { const side = st.turn, a = L.cpuAction(st); assert.ok(a.think > 0); const r = L.act(st, side, a); assert.ok(r.ok, `${level}/${seed}: ${JSON.stringify(a)}`); }
    assert.ok(st.over);
  }
});

test('a stronger computer wins more (cpu vs cpu, many games)', () => {
  function game(seed, lvlYou, lvlCpu) {
    const st = L.newMatch({ seed, level: lvlCpu }); let guard = 0;
    while (!st.over && guard++ < 5000) { const side = st.turn; st.level = side === 'you' ? lvlYou : lvlCpu; L.act(st, side, L.cpuAction(st)); }
    return st.winner;
  }
  for (const [weak, strong] of [['easy', 'normal'], ['normal', 'hard']]) {
    let strongWins = 0, weakWins = 0;
    for (let s = 1; s <= 120; s++) { const w = game(s * 5, weak, strong); if (w === 'cpu') strongWins++; else weakWins++; }
    assert.ok(strongWins > weakWins * 1.3, `${strong} ${strongWins} vs ${weak} ${weakWins}`);
  }
});

test('solo (black mission): finding every set then calling end succeeds; a wrong end or wrong set counts', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const sd = L.newSolo({ seed });
    for (const s of sd.sets) { const r = L.soloSubmit(sd, s); assert.strictEqual(r.kind, 'set'); }
    assert.strictEqual(L.soloSubmit(sd, sd.sets[0] || [0, 1, 2]).kind === 'dup' || sd.sets.length === 0, true);
    const r = L.soloEnd(sd); assert.strictEqual(r.kind, 'endOk'); assert.ok(sd.done);
  }
  const sd = L.newSolo({ seed: 1 }); let g = 0; while (sd.sets.length === 0 && g++ < 30) Object.assign(sd, L.newSolo({ seed: 100 + g }));
  assert.strictEqual(L.soloEnd(sd).kind, 'endWrong'); assert.ok(!sd.done); assert.strictEqual(sd.wrong, 1);
  assert.strictEqual(L.soloSubmit(sd, [sd.hand[0], sd.hand[1], sd.hand[2]]).ok, true);
});

test('a call that runs out of time costs a point and passes the turn', () => {
  const st = L.newMatch({ seed: 8 }); const side = st.turn;
  const r = L.act(st, side, { type: 'timeout' });
  assert.deepStrictEqual([r.kind, r.delta], ['timeout', -1]); assert.strictEqual(st.score[side], -1); assert.strictEqual(st.turn, side === 'you' ? 'cpu' : 'you');
});
