import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine, RULES } from '../shared/engine.js';
import { Bot } from '../shared/bot.js';

const adv = (e, ms) => { while (ms > 0) { const s = Math.min(ms, 100); e.advance(s); ms -= s; } };
const duel = (o = {}) => new Engine({ players: [{ id: 'a', side: 0 }, { id: 'b', side: 1 }], seed: 3, ...o });
const toPlay = (e) => adv(e, RULES.COUNTDOWN_MS + 20);

test('input before the start signal is ignored', () => {
  const e = duel();
  assert.equal(e.input('a', { type: 'hold' }).ok, false);
  assert.equal(e.input('a', { type: 'burst' }).ok, false);
  toPlay(e);
  assert.equal(e.phase, 'play');
  assert.equal(e.byId.get('a').holding, false);
  assert.equal(e.byId.get('a').stamina, RULES.STAMINA_MAX);
});

test('holding forever ends in a grip slip, not a win', () => {
  const e = duel(); toPlay(e);
  e.input('a', { type: 'hold' });
  adv(e, RULES.STAMINA_MAX / RULES.HOLD_DRAIN * 1000 + 100);
  const a = e.byId.get('a');
  assert.equal(a.holding, false);
  assert.ok(a.exhaustedUntil > e.t);
  assert.equal(e.input('a', { type: 'hold' }).ok, false);
  assert.equal(e.input('a', { type: 'burst' }).ok, false);
  assert.equal(e.phase, 'play');
});

test('burst spam: one burst per cooldown, stamina never negative', () => {
  const e = duel(); toPlay(e);
  let accepted = 0;
  for (let i = 0; i < 600; i++) { if (e.input('a', { type: 'burst' }).ok) accepted++; adv(e, 10); }
  const expectedMax = Math.ceil(6000 / (RULES.BURST_WINDUP_MS + RULES.BURST_COOLDOWN_MS)) + 1;
  assert.ok(accepted <= expectedMax, `accepted ${accepted}`);
  assert.ok(e.byId.get('a').stamina >= 0);
});

test('hold/release spam does not recover stamina faster than resting', () => {
  const spam = duel(); toPlay(spam); const rest = duel(); toPlay(rest);
  spam.byId.get('a').stamina = 30; rest.byId.get('a').stamina = 30;
  for (let i = 0; i < 200; i++) { spam.input('a', { type: i % 2 ? 'release' : 'hold' }); adv(spam, 10); adv(rest, 10); }
  assert.ok(spam.byId.get('a').stamina < rest.byId.get('a').stamina);
});

test('frame rate independence: 1 big step == many small steps', () => {
  const a = duel(), b = duel(); toPlay(a); toPlay(b);
  a.input('a', { type: 'hold' }); b.input('a', { type: 'hold' });
  for (let i = 0; i < 120; i++) adv(a, 1000 / 30);   // 30 fps
  for (let i = 0; i < 480; i++) adv(b, 1000 / 120);  // 120 fps
  assert.ok(Math.abs(a.pos - b.pos) < 0.5, `${a.pos} vs ${b.pos}`);
});

test('perfect burst against a resting opponent beats a blocked one', () => {
  const run = (oppHolds) => { const e = duel(); toPlay(e);
    if (oppHolds) e.input('b', { type: 'hold' });
    const p0 = e.pos; e.input('a', { type: 'burst' }); adv(e, 600); return p0 - e.pos + (oppHolds ? 0 : 0); };
  const perfect = run(false), blocked = run(true);
  assert.ok(perfect > blocked + 5, `${perfect} vs ${blocked}`);
});

test('time limit: centre = draw, otherwise mark side wins; no input after end', () => {
  const e = duel({ matchMs: 2000 }); toPlay(e); adv(e, 2100);
  assert.equal(e.phase, 'over'); assert.equal(e.winner, 'draw'); assert.equal(e.reason, 'time');
  assert.equal(e.input('a', { type: 'hold' }).ok, false);
  const pos = e.pos; adv(e, 1000); assert.equal(e.pos, pos);
  const f = duel({ matchMs: 3000 }); toPlay(f); f.input('a', { type: 'hold' }); adv(f, 3100);
  assert.equal(f.winner, 0);
});

test('reaching the finish line wins immediately', () => {
  const e = duel(); toPlay(e); e.pos = -RULES.WIN + 0.5; e.input('a', { type: 'hold' }); adv(e, 200);
  assert.equal(e.winner, 0); assert.equal(e.reason, 'line');
});

test('team sync: two bursts together push further than two apart', () => {
  const mk = () => new Engine({ players: [{ id: 'a1', side: 0 }, { id: 'a2', side: 0 }, { id: 'b1', side: 1 }, { id: 'b2', side: 1 }], seed: 1 });
  const s = mk(); toPlay(s); s.input('a1', { type: 'burst' }); adv(s, 100); s.input('a2', { type: 'burst' }); adv(s, 900);
  const u = mk(); toPlay(u); u.input('a1', { type: 'burst' }); adv(u, 700); u.input('a2', { type: 'burst' }); adv(u, 300);
  assert.ok(-s.pos > -u.pos + 3, `${s.pos} vs ${u.pos}`);
});

test('Atlas break: rope and clock freeze, correct answer = one charged ×2 jerk without stamina cost', () => {
  const e = new Engine({ players: [{ id: 'a', side: 0 }, { id: 'b', side: 1 }], quiz: [{ id: 'q1', a: 2 }], seed: 2 });
  toPlay(e);
  e.input('a', { type: 'hold' });
  adv(e, RULES.QUIZ_FIRST_MS + 50);
  assert.ok(e.quiz, 'question opened');
  const t0 = e.t, pos0 = e.pos;
  assert.equal(e.byId.get('a').holding, false, 'everyone lets go');
  assert.equal(e.input('a', { type: 'hold' }).reason, 'quiz');
  assert.equal(e.input('a', { type: 'burst' }).reason, 'quiz');
  adv(e, 2000);
  assert.equal(e.t, t0, 'match clock stopped'); assert.equal(e.pos, pos0, 'rope frozen');
  assert.equal(e.input('b', { type: 'answer', value: 0 }).correct, false);
  assert.equal(e.input('b', { type: 'answer', value: 2 }).ok, false, 'wrong answer locks');
  assert.equal(e.input('a', { type: 'answer', value: 2 }).correct, true);
  assert.equal(e.byId.get('a').charges, 1);
  assert.equal('a' in e.snapshot().quiz, false, 'correct index never leaves the engine');
  adv(e, RULES.QUIZ_RESULT_MS + 50);
  assert.equal(e.quiz, null, 'break ends right after the result');
  // charged jerk: no stamina spent, twice as far as a normal one in the same situation
  const a = e.byId.get('a'); a.stamina = 10;
  assert.equal(e.input('a', { type: 'burst' }).reason, 'no-stamina', 'a normal jerk never spends the charge');
  assert.equal(a.charges, 1);
  const p1 = e.pos; assert.equal(e.input('a', { type: 'burst', charged: true }).ok, true); adv(e, 600);
  assert.equal(a.charges, 0); assert.ok(a.stamina >= 10);
  const charged = p1 - e.pos;
  const f = duel(); toPlay(f); const p2 = f.pos; f.input('a', { type: 'burst' }); adv(f, 600);
  const normal = p2 - f.pos;
  assert.ok(Math.abs(charged - 2 * normal) < 1.5, `${charged} vs ${normal}`);
  assert.equal(e.input('a', { type: 'burst', charged: true }).ok, false, 'no charge left');
});

test('Atlas break ends early when both answered wrong, and times out otherwise', () => {
  const e = new Engine({ players: [{ id: 'a', side: 0 }, { id: 'b', side: 1 }], quiz: [{ id: 'q1', a: 1 }], seed: 4 });
  toPlay(e); adv(e, RULES.QUIZ_FIRST_MS + 50);
  e.input('a', { type: 'answer', value: 0 }); e.input('b', { type: 'answer', value: 3 });
  adv(e, RULES.QUIZ_RESULT_MS + 50);
  assert.equal(e.quiz, null);
  const g = new Engine({ players: [{ id: 'a', side: 0 }, { id: 'b', side: 1 }], quiz: [{ id: 'q1', a: 1 }], seed: 4 });
  toPlay(g); adv(g, RULES.QUIZ_FIRST_MS + 50); adv(g, RULES.QUIZ_WINDOW_MS + RULES.QUIZ_RESULT_MS + 50);
  assert.equal(g.quiz, null);
});

test('bots only act through input(): hard bot never exceeds stamina rules', () => {
  const e = duel(); const b = new Bot(e, 'b', 'hard', 9); const a = new Bot(e, 'a', 'easy', 4);
  while (e.phase !== 'over') { a.update(); b.update(); adv(e, 1000 / 60);
    for (const p of e.players) assert.ok(p.stamina >= 0 && p.stamina <= RULES.STAMINA_MAX); }
  assert.equal(e.winner, 1);
});
