// TARTYS — authoritative game engine.
// Pure logic: no DOM, no network, no Date.now(). The same file runs in the browser
// (local matches, bots, tutorial) and on the server (online rooms), so rules are identical.
// Time advances only through advance(ms) in fixed 1/60 s ticks, so speed never depends on FPS.

export const RULES = Object.freeze({
  TICK_MS: 1000 / 60,
  COUNTDOWN_MS: 3000,
  MATCH_MS: 60000,
  WIN: 100,               // rope mark must reach ±WIN (the finish line)
  DRAW_ZONE: 5,           // at time-up |pos| < DRAW_ZONE → draw
  STAMINA_MAX: 100,
  HOLD_DRAIN: 24,         // stamina per second while pulling
  REGEN: 26,              // stamina per second while resting
  REGEN_DELAY_MS: 400,    // recovery starts only after you really let go
  EXHAUST_MS: 1700,       // "grip slip" lock when stamina hits zero while pulling
  EXHAUST_REGEN: 0.45,    // slower recovery after a slip
  PULL_FORCE: 1,
  FATIGUE_MIN: 0.55,      // pull strength at 0 stamina (scales up to 1 at full)
  BRACE_FORCE: 0.3,       // resting players still dig in their heels
  ROPE_SPEED: 17,         // units per second per unit of net (team-normalised) force
  BURST_COST: 28,
  BURST_WINDUP_MS: 220,   // visible wind-up: opponents can react, teammates can sync
  BURST_APPLY_MS: 260,
  BURST_COOLDOWN_MS: 1400,
  BURST_DIST: 9,
  PERFECT_MULT: 1.7,      // opponents were all resting → rope flies
  BLOCKED_MULT: 0.55,     // opponents were all pulling → rope barely moves
  SYNC_WINDOW_MS: 220,    // team mode: bursts started this close together sync up
  SYNC_MULT: 1.5,
  // "Atlas" break: the rope freezes, the match clock stops, players answer calmly.
  QUIZ_FIRST_MS: 10000,   // play time before the first question
  QUIZ_EVERY_MS: 18000,   // play time between questions
  QUIZ_WINDOW_MS: 8000,   // max time to answer
  QUIZ_RESULT_MS: 1000,   // show who was right, then resume
  CHARGE_MULT: 2,         // a correct answer = one charged jerk: ×2 and costs no strength
  MAX_CHARGES: 2
});

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export class Engine {
  /**
   * @param {object} opts
   * @param {{id:string, side:0|1, name?:string}[]} opts.players  side 0 = left team, 1 = right team
   * @param {number} [opts.seed]
   * @param {number} [opts.matchMs]
   * @param {{id:string, a:number}[]} [opts.quiz]  enables "Atlas" questions (id + correct index)
   */
  constructor(opts) {
    this.R = RULES;
    this.rng = mulberry32(opts.seed ?? 1);
    this.matchMs = opts.matchMs ?? RULES.MATCH_MS;
    this.players = opts.players.map((p) => ({
      id: p.id, side: p.side, name: p.name || p.id,
      stamina: RULES.STAMINA_MAX, holding: false, charges: 0, releasedAt: -1e9,
      exhaustedUntil: 0, cooldownUntil: 0, windup: null,
      stats: { holdMs: 0, bursts: 0, charged: 0, perfect: 0, blocked: 0, synced: 0, exhausts: 0, answers: 0, correct: 0, rejected: 0 }
    }));
    this.byId = new Map(this.players.map((p) => [p.id, p]));
    this.teamSize = [0, 1].map((s) => this.players.filter((p) => p.side === s).length || 1);
    this.phase = 'countdown'; // countdown → play → over  (paused is a temporary overlay)
    this.countdownLeft = RULES.COUNTDOWN_MS;
    this.t = 0;          // ms of play time elapsed
    this.pos = 0;        // rope mark: negative → left team winning, positive → right
    this.vel = 0;
    this.bursts = [];    // active burst pushes
    this.acc = 0;
    this.winner = null;  // 0 | 1 | 'draw'
    this.reason = null;  // 'line' | 'time' | 'forfeit'
    this.paused = false;
    this.events = [];
    this.quizBank = opts.quiz && opts.quiz.length ? opts.quiz.slice() : null;
    this.quizOrder = this.quizBank ? this.shuffle(this.quizBank.map((_, i) => i)) : [];
    this.quiz = null;
    this.nextQuizAt = RULES.QUIZ_FIRST_MS;
    this.quizCount = 0;
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  emit(type, data = {}) { this.events.push({ type, t: this.t, ...data }); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  /** Player input. Everything is validated here, so no client can bypass limits. */
  input(pid, action) {
    const p = this.byId.get(pid);
    if (!p) return { ok: false, reason: 'unknown-player' };
    if (this.phase !== 'play' || this.paused) return { ok: false, reason: 'not-playing' };
    const now = this.t;
    if (this.quiz && (action.type === 'hold' || action.type === 'burst')) return { ok: false, reason: 'quiz' };
    switch (action.type) {
      case 'hold':
        if (now < p.exhaustedUntil) { p.stats.rejected++; return { ok: false, reason: 'exhausted' }; }
        if (p.stamina <= 0) { p.stats.rejected++; return { ok: false, reason: 'no-stamina' }; }
        p.holding = true;
        return { ok: true };
      case 'release':
        if (p.holding) { p.holding = false; p.releasedAt = now; }
        return { ok: true };
      case 'burst': {
        if (now < p.exhaustedUntil) { p.stats.rejected++; return { ok: false, reason: 'exhausted' }; }
        if (p.windup || now < p.cooldownUntil) { p.stats.rejected++; return { ok: false, reason: 'cooldown' }; }
        // A charge (earned by a correct Atlas answer) is spent ONLY when the player asks for it explicitly.
        const charged = !!action.charged;
        if (charged && p.charges <= 0) { p.stats.rejected++; return { ok: false, reason: 'no-charge' }; }
        if (!charged && p.stamina < RULES.BURST_COST) { p.stats.rejected++; return { ok: false, reason: 'no-stamina' }; }
        if (charged) p.charges--; else p.stamina -= RULES.BURST_COST;
        p.windup = { startedAt: now, fireAt: now + RULES.BURST_WINDUP_MS, charged };
        p.cooldownUntil = now + RULES.BURST_WINDUP_MS + RULES.BURST_COOLDOWN_MS;
        p.releasedAt = Math.max(p.releasedAt, now); // a burst also resets the recovery delay
        this.emit('windup', { pid, side: p.side });
        return { ok: true };
      }
      case 'answer': {
        const q = this.quiz;
        if (!q || q.closed) return { ok: false, reason: 'no-question' };
        if (q.locked.includes(pid)) return { ok: false, reason: 'locked' };
        p.stats.answers++;
        if (action.value === q.a) {
          p.stats.correct++;
          p.charges = Math.min(RULES.MAX_CHARGES, p.charges + 1);
          q.closed = true; q.winnerSide = p.side; q.by = pid; q.finishAt = q.elapsed + RULES.QUIZ_RESULT_MS;
          this.emit('quizWin', { pid, side: p.side, qid: q.id });
          return { ok: true, correct: true };
        }
        q.locked.push(pid);
        this.emit('quizWrong', { pid, side: p.side, qid: q.id });
        if (q.locked.length >= this.players.length) { q.closed = true; q.finishAt = q.elapsed + RULES.QUIZ_RESULT_MS; }
        return { ok: true, correct: false };
      }
      default:
        return { ok: false, reason: 'bad-action' };
    }
  }

  pushRope(side, dist) {
    const dir = side === 0 ? -1 : 1;
    this.bursts.push({ dir, left: RULES.BURST_APPLY_MS, speed: dist / (RULES.BURST_APPLY_MS / 1000) });
  }

  pause() { if (this.phase !== 'over') this.paused = true; }
  resume() {
    if (!this.paused) return;
    this.paused = false;
    if (this.phase === 'play') { this.phase = 'countdown'; this.countdownLeft = RULES.COUNTDOWN_MS; this.resuming = true; }
  }

  forfeit(loserSide) {
    if (this.phase === 'over') return;
    this.finish(loserSide === 0 ? 1 : 0, 'forfeit');
  }

  advance(ms) {
    if (this.phase === 'over' || this.paused) return;
    this.acc += Math.min(ms, 250); // guard against huge jumps (background tab)
    while (this.acc >= RULES.TICK_MS && this.phase !== 'over') {
      this.acc -= RULES.TICK_MS;
      this.tick(RULES.TICK_MS);
    }
  }

  tick(dt) {
    if (this.phase === 'countdown') {
      this.countdownLeft -= dt;
      if (this.countdownLeft <= 0) {
        this.phase = 'play'; this.countdownLeft = 0;
        for (const p of this.players) { p.holding = false; }
        this.emit(this.resuming ? 'resume' : 'start');
        this.resuming = false;
      }
      return;
    }
    if (this.phase !== 'play') return;
    const R = RULES;
    if (this.quizBank && this.tickQuiz(dt)) return; // during an Atlas break nothing moves and the clock stops
    this.t += dt;
    const sec = dt / 1000;

    // 1. Stamina & exhaustion
    for (const p of this.players) {
      const exhausted = this.t < p.exhaustedUntil;
      if (p.holding && !exhausted) {
        p.stamina -= R.HOLD_DRAIN * sec;
        p.stats.holdMs += dt;
        if (p.stamina <= 0) {
          p.stamina = 0; p.holding = false; p.releasedAt = this.t;
          p.exhaustedUntil = this.t + R.EXHAUST_MS;
          p.stats.exhausts++;
          if (p.windup) p.windup = null; // slip cancels a pending burst
          this.emit('exhaust', { pid: p.id, side: p.side });
        }
      } else if (this.t - p.releasedAt >= R.REGEN_DELAY_MS && !p.windup) {
        const mult = exhausted ? R.EXHAUST_REGEN : 1;
        p.stamina = Math.min(R.STAMINA_MAX, p.stamina + R.REGEN * mult * sec);
      }
    }

    // 2. Bursts whose wind-up is over fire now
    for (const p of this.players) {
      if (!p.windup || this.t < p.windup.fireAt) continue;
      const started = p.windup.startedAt;
      const charged = !!p.windup.charged;
      p.windup = null;
      const opp = this.players.filter((o) => o.side !== p.side);
      const pulling = opp.filter((o) => o.holding && this.t >= o.exhaustedUntil).length;
      let mult = 1, kind = 'normal';
      if (pulling === 0) { mult = R.PERFECT_MULT; kind = 'perfect'; p.stats.perfect++; }
      else if (pulling === opp.length) { mult = R.BLOCKED_MULT; kind = 'blocked'; p.stats.blocked++; }
      if (charged) { mult *= R.CHARGE_MULT; p.stats.charged++; } // timing still matters: charged ×2 on top
      const mates = this.players.filter((m) => m !== p && m.side === p.side);
      const synced = this.teamSize[p.side] > 1 && mates.some((m) =>
        (m.windup && Math.abs(m.windup.startedAt - started) <= R.SYNC_WINDOW_MS) ||
        (m.lastBurstAt != null && Math.abs(m.lastBurstAt - started) <= R.SYNC_WINDOW_MS));
      if (synced) { mult *= R.SYNC_MULT; p.stats.synced++; }
      p.lastBurstAt = started;
      p.stats.bursts++;
      this.pushRope(p.side, (R.BURST_DIST * mult) / this.teamSize[p.side]);
      this.emit('burst', { pid: p.id, side: p.side, kind, synced, charged });
    }

    // 3. Forces → rope velocity (team-normalised so 2×2 has the same pace as 1×1)
    const force = [0, 0];
    for (const p of this.players) {
      const exhausted = this.t < p.exhaustedUntil;
      let f = 0;
      if (p.holding && !exhausted) f = R.PULL_FORCE * (R.FATIGUE_MIN + (1 - R.FATIGUE_MIN) * (p.stamina / R.STAMINA_MAX));
      else if (!exhausted) f = R.BRACE_FORCE;
      force[p.side] += f / this.teamSize[p.side];
    }
    this.vel = (force[1] - force[0]) * R.ROPE_SPEED;
    let move = this.vel * sec;
    for (const b of this.bursts) {
      const step = Math.min(dt, b.left);
      move += b.dir * b.speed * (step / 1000);
      b.left -= step;
    }
    this.bursts = this.bursts.filter((b) => b.left > 0);
    this.pos = clamp(this.pos + move, -R.WIN, R.WIN);

    // 5. Victory
    if (this.pos <= -R.WIN) return this.finish(0, 'line');
    if (this.pos >= R.WIN) return this.finish(1, 'line');
    if (this.t >= this.matchMs) {
      if (Math.abs(this.pos) < R.DRAW_ZONE) return this.finish('draw', 'time');
      return this.finish(this.pos < 0 ? 0 : 1, 'time');
    }
  }

  /** Returns true while an Atlas break is running (the match is frozen). */
  tickQuiz(dt) {
    const R = RULES;
    const q = this.quiz;
    if (q) {
      q.elapsed += dt;
      if (!q.closed && q.elapsed >= R.QUIZ_WINDOW_MS) { q.closed = true; q.finishAt = q.elapsed + R.QUIZ_RESULT_MS; this.emit('quizTimeout', { qid: q.id }); }
      if (q.closed && q.elapsed >= q.finishAt) {
        this.quiz = null;
        this.nextQuizAt = this.t + R.QUIZ_EVERY_MS;
        for (const p of this.players) p.releasedAt = this.t; // everyone starts from "let go"
        this.emit('quizEnd', { qid: q.id });
        return false;
      }
      return true;
    }
    if (this.t >= this.nextQuizAt && this.t < this.matchMs - 8000) {
      const bank = this.quizBank[this.quizOrder[this.quizCount % this.quizOrder.length]];
      this.quizCount++;
      // Freeze: nobody keeps pulling, pending jerks are cancelled and refunded, rope stops.
      for (const p of this.players) {
        p.holding = false; p.releasedAt = this.t;
        if (p.windup) { if (p.windup.charged) p.charges++; else p.stamina = Math.min(R.STAMINA_MAX, p.stamina + R.BURST_COST); p.windup = null; p.cooldownUntil = this.t; }
      }
      this.bursts = []; this.vel = 0;
      this.quiz = { id: bank.id, a: bank.a, elapsed: 0, startedAt: this.t, locked: [], closed: false, finishAt: Infinity, order: this.shuffle([0, 1, 2, 3]) };
      this.emit('quizStart', { qid: bank.id });
      return true;
    }
    return false;
  }

  finish(winner, reason) {
    this.phase = 'over';
    this.winner = winner; this.reason = reason;
    for (const p of this.players) { p.holding = false; p.windup = null; }
    this.bursts = [];
    this.emit('over', { winner, reason });
  }

  /** Compact, JSON-safe view for renderers and network. Correct quiz answer is NOT included. */
  snapshot() {
    const q = this.quiz;
    return {
      phase: this.phase, paused: this.paused, t: Math.round(this.t), matchMs: this.matchMs,
      countdown: Math.ceil(this.countdownLeft / 1000), pos: +this.pos.toFixed(2), vel: +this.vel.toFixed(2),
      winner: this.winner, reason: this.reason,
      quiz: q ? { id: q.id, order: q.order, left: Math.max(0, Math.round(RULES.QUIZ_WINDOW_MS - q.elapsed)), closed: q.closed, winnerSide: q.winnerSide ?? null, by: q.by ?? null, locked: q.locked.slice() } : null,
      players: this.players.map((p) => ({
        id: p.id, side: p.side, name: p.name,
        st: +p.stamina.toFixed(1), hold: p.holding,
        ex: Math.max(0, Math.round(p.exhaustedUntil - this.t)),
        cd: Math.max(0, Math.round(p.cooldownUntil - this.t)),
        wind: !!p.windup, ch: p.charges
      }))
    };
  }

  statsFor(pid) { const p = this.byId.get(pid); return p ? { ...p.stats } : null; }
}
