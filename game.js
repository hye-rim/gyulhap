'use strict';
// 오락실 튜토리얼이 '진짜로 일어난 일'을 알아채는 신호 (arcade/public/tutorial.js 가 듣는다. 튜토리얼이 아니면 아무도 안 듣는다)
const tutorialSignal = (type) => window.dispatchEvent(new CustomEvent('arcade:tutorial', { detail: { type } }));

// 결! 합!: 화면·입력·소리. 규칙과 컴퓨터는 logic.js (LOGIC_GH)
(() => {
const L = LOGIC_GH;
const $ = (id) => document.getElementById(id);
const TUT = /[?&]tutorial=1/.test(location.search);
const REC_KEY = 'gyulhapRec', WINS_KEY = 'gyulhapWins', MUTE_KEY = 'gyulhapMuted';
const TURN_SEC = 10, PICK_SEC = 5, MISSION_SEC = 100;
const LEVELS = [{ id: 'easy', name: '쉬움' }, { id: 'normal', name: '보통' }, { id: 'hard', name: '어려움' }];

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};
let rec = (() => { try { const o = JSON.parse(store.get(REC_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (_) { return {}; } })();   // { easy:{w,l}, normal:.., hard:.., streak: 블랙 미션 최고 연속 }
let muted = store.get(MUTE_KEY) === '1';
const saveRec = () => { store.set(REC_KEY, JSON.stringify(rec)); store.set(WINS_KEY, String(LEVELS.reduce((a, l) => a + ((rec[l.id] || {}).w || 0), 0) + (rec.streak || 0))); };

// ---------- 소리 ----------
let audio = null;
function tone(freq, dur, type = 'sine', vol = 0.08, slide = 0) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + dur);
  } catch (_) {}
}
const seq = (notes, step, type = 'triangle', vol = 0.09) => notes.forEach((f, i) => setTimeout(() => tone(f, step * 0.0009, type, vol), i * step));
const sfx = {
  pick: () => tone(620, 0.04, 'triangle', 0.06), call: () => tone(520, 0.1, 'square', 0.05, 300),
  good: () => seq([659, 880], 70, 'triangle', 0.08), bad: () => tone(170, 0.15, 'square', 0.06, -60),
  big: () => seq([523, 659, 784, 1047], 80, 'triangle', 0.09), pass: () => tone(300, 0.05, 'sine', 0.04),
  win: () => seq([523, 659, 784, 1047, 1319], 100, 'triangle', 0.1), lose: () => seq([392, 330, 262, 196], 140, 'sawtooth', 0.06),
};

// ---------- 상태 ----------
let mode = 'title';                    // title · match · mission · practice
let m = null, sd = null, level = 'normal', sel = [], picking = false, deadline = 0, deadlineMax = 1, timer = null, busy = false, cpuTimer = null, streak = 0, missionEnd = 0, hl = [];

function clearAll() { clearInterval(timer); clearTimeout(cpuTimer); timer = null; cpuTimer = null; busy = false; picking = false; sel = []; hl = []; }

// ---------- 카드 그리기 ----------
function cardHtml(id, i, extra = '') {
  const d = L.describe(id);
  return `<button class="card bg-${d.bg}${extra}" data-id="${id}"><span class="num">${i + 1}</span><span class="shape ${d.shape} ${d.color}"></span></button>`;
}
function renderBoard() {
  const hand = (mode === 'match' ? m.hand : sd.hand);
  $('board').innerHTML = hand.map((id, i) => cardHtml(id, i, `${sel.includes(id) ? ' sel' : ''}${hl.includes(id) ? ' say' : ''}`)).join('');
  const found = mode === 'match' ? m.found : sd.found;
  $('found').innerHTML = found.map((f) => `<span>${f.map((c) => hand.indexOf(c) + 1).join('·')}</span>`).join('');
}
function renderHud() {
  if (mode === 'match') { $('roundN').textContent = `${m.round}/${L.ROUNDS}${m.round > L.ROUNDS ? ' (연장)' : ''}`; $('myScore').textContent = m.score.you; $('cpuScore').textContent = m.score.cpu; }
  else if (mode === 'mission' || mode === 'practice') { $('roundN').textContent = mode === 'practice' ? '연습' : `${streak + 1}번째`; $('myScore').textContent = sd ? sd.found.length : 0; $('cpuScore').textContent = sd ? sd.sets.length - sd.found.length : 0; }
  const solo = mode !== 'match';
  document.querySelector('#hud .item.you .label').textContent = solo ? '찾은 합' : '나'; document.querySelector('#hud .item.cpu .label').textContent = solo ? '남은 합' : '컴퓨터';
  document.querySelector('#hud .item.cpu .value').style.visibility = (mode === 'mission') ? 'hidden' : 'visible';
  document.querySelector('#hud .item.cpu .label').style.visibility = (mode === 'mission') ? 'hidden' : 'visible';
  const myTurn = mode === 'match' && m && m.turn === 'you' && !busy && !m.over;
  $('callBtn').disabled = solo ? true : !(myTurn && !picking); $('callBtn').style.display = solo ? 'none' : '';
  $('passBtn').disabled = !(myTurn && !picking); $('passBtn').style.display = solo ? 'none' : '';
  $('endBtn').disabled = solo ? !(sd && !sd.done && !busy) : !(myTurn && !picking);
}
function setMsg(t) { $('msg').textContent = t; }
function floatText(t, color) { const f = $('float'); f.textContent = t; f.style.color = color || '#fff'; f.classList.remove('show'); void f.offsetWidth; f.classList.add('show'); }

// ---------- 시계 ----------
function setDeadline(sec) { deadline = performance.now() + sec * 1000; deadlineMax = sec; }
function startTimer() {
  clearInterval(timer);
  timer = setInterval(() => {
    const left = Math.max(0, (deadline - performance.now()) / 1000);
    $('barIn').style.width = `${(left / deadlineMax) * 100}%`; $('barIn').style.background = left < deadlineMax * 0.3 ? '#ff5a5a' : '#4cd964';
    if (left <= 0) onTimeout();
  }, 100);
}
function onTimeout() {
  clearInterval(timer); timer = null;
  if (mode === 'match' && m.turn === 'you' && !busy) { if (picking) { picking = false; sel = []; doAction('you', { type: 'timeout' }); } else doAction('you', { type: 'pass' }); }
  else if (mode === 'mission' && sd && !sd.done) failMission('시간이 다 됐어요!');
}

// ---------- 대결 ----------
function startMatch(lv) {
  clearAll(); mode = 'match'; level = lv;
  m = L.newMatch({ seed: (Date.now() % 99991) + 1, level: lv, first: Math.random() < 0.5 ? 'you' : 'cpu' });
  $('overlay').classList.add('hidden'); renderBoard(); nextTurn();
}
function nextTurn() {
  if (!m || m.over) return;
  busy = false; picking = false; sel = []; hl = []; renderBoard(); renderHud();
  if (m.turn === 'you') { setMsg(`내 차례! 합이 보이면 「합!」, 남은 합이 없으면 「결!」 (${TURN_SEC}초)`); setDeadline(TURN_SEC); startTimer(); }
  else {
    setMsg('컴퓨터가 생각하는 중...'); busy = true; renderHud(); setDeadline(TURN_SEC); startTimer();
    const a = L.cpuAction(m);
    cpuTimer = setTimeout(() => cpuDo(a), Math.min(TURN_SEC - 0.5, a.think) * 1000);
  }
}
function cpuDo(a) {
  clearInterval(timer);
  if (a.type === 'call') { hl = a.cards; renderBoard(); setMsg('컴퓨터: 합!'); sfx.call(); cpuTimer = setTimeout(() => doAction('cpu', a), 1100); }
  else { setMsg(a.type === 'end' ? '컴퓨터: 결!' : '컴퓨터는 넘겼어요'); if (a.type === 'end') sfx.call(); cpuTimer = setTimeout(() => doAction('cpu', a), a.type === 'end' ? 700 : 400); }
}
function doAction(side, a) {
  clearInterval(timer); busy = true; renderHud();
  const r = L.act(m, side, a); if (!r.ok) { busy = false; return nextTurn(); }
  const who = side === 'you' ? '나' : '컴퓨터';
  const text = { set: '합! +1', wrong: '틀렸어요 −1', dup: '이미 나온 합 −1', endOk: '결! 정답 +3', endWrong: '결 틀렸어요 −1', timeout: '시간 초과 −1', pass: '' }[r.kind];
  if (r.kind === 'pass') sfx.pass(); else (r.delta > 0 ? (r.kind === 'endOk' ? sfx.big : sfx.good) : sfx.bad)();
  if (text) { floatText(`${who} ${text}`, r.delta > 0 ? '#9dffb0' : '#ff9b9b'); setMsg(`${who}: ${text}`); }
  tutorialSignal(r.kind);
  renderHud(); renderBoard();
  const ended = m.events.find((e) => e.t === 'roundEnd');
  setTimeout(() => {
    if (m.over) return finishMatch();
    if (ended) { setMsg(`라운드 끝! 새 카드를 펼쳐요 (${m.roundScores[m.roundScores.length - 1].you >= 0 ? '+' : ''}${m.roundScores[m.roundScores.length - 1].you} : ${m.roundScores[m.roundScores.length - 1].cpu >= 0 ? '+' : ''}${m.roundScores[m.roundScores.length - 1].cpu})`); return setTimeout(nextTurn, 1500); }
    nextTurn();
  }, side === 'cpu' ? 900 : 700);
}
function finishMatch() {
  clearAll(); mode = 'match'; const won = m.winner === 'you';
  const r = rec[level] || (rec[level] = { w: 0, l: 0 }); if (won) r.w++; else r.l++; saveRec();
  (won ? sfx.win : sfx.lose)();
  const ln = LEVELS.find((l) => l.id === level).name;
  showOverlay(`<h2>${won ? '이겼어요! 🎉' : '졌어요…'}</h2><p><b>${m.score.you}</b> 대 <b>${m.score.cpu}</b></p><dl class="stats"><dt>${ln} 전적</dt><dd>${r.w}승 ${r.l}패</dd></dl><div class="col"><button id="b1">한 판 더</button><button class="sub" id="b2">처음 화면</button></div>`);
  $('b1').onclick = () => startMatch(level); $('b2').onclick = showTitle;
}

// ---------- 블랙 미션 / 연습 ----------
function startMission(practice) {
  clearAll(); mode = practice ? 'practice' : 'mission'; if (!practice && !streak) streak = 0;
  sd = L.newSolo({ seed: practice ? 3 : (Date.now() % 99991) + 1 });
  $('overlay').classList.add('hidden'); renderBoard(); renderHud();
  if (practice) { setMsg('3장을 눌러 합을 찾아요! (합은 총 ' + sd.sets.length + '개)'); $('barIn').style.width = '100%'; }
  else { setMsg(`${MISSION_SEC}초 안에 합을 모두 찾고 「결!」을 외쳐요`); setDeadline(MISSION_SEC); startTimer(); }
}
function failMission(why) {
  clearAll(); const best = rec.streak || 0, cleared = streak; if (cleared > best) { rec.streak = cleared; saveRec(); } sfx.lose();
  showOverlay(`<h2>${why}</h2><p>합 ${sd.sets.length}개 중 <b>${sd.found.length}개</b>를 찾았어요</p><dl class="stats"><dt>이번 연속</dt><dd>${cleared}번 성공</dd><dt>최고 연속</dt><dd>${Math.max(best, cleared)}번</dd></dl><div class="col"><button id="b1">다시 도전</button><button class="sub" id="b2">처음 화면</button></div>`);
  streak = 0; $('b1').onclick = () => startMission(false); $('b2').onclick = showTitle;
}

// ---------- 입력 ----------
$('board').addEventListener('click', (e) => {
  const el = e.target.closest('.card'); if (!el) return;
  const id = Number(el.dataset.id);
  if (mode === 'match') { if (!picking) return; } else if (mode === 'mission' || mode === 'practice') { if (!sd || sd.done || busy) return; } else return;
  sel = sel.includes(id) ? sel.filter((x) => x !== id) : sel.concat([id]); sfx.pick(); tutorialSignal('pick');
  renderBoard();
  if (sel.length < 3) return;
  const cards = sel.slice(); sel = [];
  if (mode === 'match') { picking = false; doAction('you', { type: 'call', cards }); return; }
  const r = L.soloSubmit(sd, cards); renderBoard(); renderHud();
  if (r.kind === 'set') { sfx.good(); floatText('합! 🎉', '#9dffb0'); setMsg(mode === 'practice' ? (r.left > 0 ? `합! 남은 합 ${r.left}개` : '합을 모두 찾았어요! 이제 「결!」을 눌러요') : (r.left > 0 ? '합!' : '합을 모두 찾았어요? 「결!」을 눌러요')); tutorialSignal('set'); }
  else if (r.kind === 'dup') { sfx.bad(); floatText('이미 찾은 합', '#ffd23f'); }
  else if (r.kind === 'wrong') { sfx.bad(); floatText('합이 아니에요', '#ff9b9b'); setMsg('세 가지 모두 같거나, 모두 달라야 해요'); tutorialSignal('wrong'); }
});
$('callBtn').onclick = () => { if (mode !== 'match' || m.turn !== 'you' || busy || picking) return; picking = true; sel = []; setMsg(`합! ${PICK_SEC}초 안에 카드 3장을 눌러요`); sfx.call(); setDeadline(PICK_SEC); startTimer(); renderHud(); tutorialSignal('callSet'); };
$('endBtn').onclick = () => {
  if (mode === 'match') { if (m.turn !== 'you' || busy || picking) return; doAction('you', { type: 'end' }); tutorialSignal('endCall'); return; }
  if (!sd || sd.done || busy) return;
  const r = L.soloEnd(sd); renderHud();
  if (r.kind === 'endOk') {
    sfx.big(); clearInterval(timer); busy = true; floatText('결! 성공 🎉', '#9dffb0'); tutorialSignal('end');
    if (mode === 'practice') return setTimeout(() => showOverlay(`<h2>성공! 🎉</h2><p>합을 모두 찾고 「결」을 외쳤어요.</p><div class="col"><button id="b1">확인</button></div>`) || ($('b1').onclick = showTitle), 900);
    streak++; setMsg(`성공! 다음 판 (연속 ${streak}번)`); setTimeout(() => startMission(false), 1300);
  } else { sfx.bad(); floatText(`아직 합이 ${r.left}개 남았어요`, '#ff9b9b'); setMsg(`결 틀렸어요! 합이 ${r.left}개 남아 있어요`); tutorialSignal('endWrong'); }
};
$('passBtn').onclick = () => { if (mode === 'match' && m.turn === 'you' && !busy && !picking) doAction('you', { type: 'pass' }); };
addEventListener('keydown', (e) => { const k = e.key.toLowerCase(); if (k === 'm') toggleMute(); else if (k >= '1' && k <= '9') { const c = document.querySelectorAll('#board .card')[Number(k) - 1]; if (c) c.click(); } else if (k === 'h' && !$('callBtn').disabled) $('callBtn').click(); else if (k === 'g' && !$('endBtn').disabled) $('endBtn').click(); else if (k === ' ' && !$('passBtn').disabled) $('passBtn').click(); });
function toggleMute() { muted = !muted; store.set(MUTE_KEY, muted ? '1' : '0'); $('muteBtn').textContent = muted ? '🔇' : '🔊'; }
$('muteBtn').onclick = toggleMute; $('muteBtn').textContent = muted ? '🔇' : '🔊';

// ---------- 처음 화면 ----------
function showOverlay(html) { const o = $('overlay'); o.innerHTML = html; o.classList.remove('hidden'); }
function showTitle() {
  clearAll(); mode = 'title'; renderHud();
  const rules = `<p>카드 9장 중 <b>세 장</b>을 골라요. <b>모양·배경색·도형 색</b> 세 가지가 각각 <b>모두 같거나 모두 다르면 「합」</b>!<br>남은 합이 없다고 생각하면 <b>「결」</b>을 외쳐요.</p>`;
  if (TUT) { showOverlay(`<h1>결! 합! 🃏</h1>${rules}<div class="col"><button id="b1">시작하기</button></div>`); $('b1').onclick = () => startMission(true); return; }
  const lv = LEVELS.map((l) => { const r = rec[l.id] || {}; return `<button data-lv="${l.id}">${l.name}${r.w || r.l ? `<small>${r.w || 0}승 ${r.l || 0}패</small>` : ''}</button>`; }).join('');
  showOverlay(`<h1>결! 합! 🃏</h1>${rules}<p><b>컴퓨터와 대결</b> — 번갈아 10초씩, 합 +1 · 틀리면 −1 · 결 정답 +3 · 10라운드</p><div class="row">${lv}</div><p><b>블랙 미션</b> — 혼자 ${MISSION_SEC}초 안에 합을 모두 찾고 결!${rec.streak ? ` (최고 연속 ${rec.streak}번)` : ''}</p><div class="col"><button id="bm">블랙 미션</button></div>`);
  for (const b of document.querySelectorAll('#overlay [data-lv]')) b.onclick = () => startMatch(b.dataset.lv);
  $('bm').onclick = () => { streak = 0; startMission(false); };
}

showTitle();
/* @test-hooks:start */
window.__gh = { get m() { return m; }, get sd() { return sd; }, get mode() { return mode; }, get busy() { return busy; }, get picking() { return picking; }, startMatch, startMission };
/* @test-hooks:end */
})();
