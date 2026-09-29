// TARTYS bot. It plays ONLY through engine.input() — the same door a human uses —
// so it spends stamina, can slip, waits for cooldowns and has no hidden power.
// Levels differ in reaction time, stamina discipline and how well they read the opponent.
import { RULES, mulberry32 } from './engine.js';

export const BOT_LEVELS = {
  easy:   { reaction: 520, jitter: 260, restAt: 10, resumeAt: 55, greed: 0.45, read: 0.15, counter: 0.1, randomBurst: 0.05, desperation: 0.3, quizAcc: 0.45, quizDelay: [3800, 7200] },
  normal: { reaction: 320, jitter: 160, restAt: 18, resumeAt: 62, greed: 0.12, read: 0.5,  counter: 0.4, randomBurst: 0.05, desperation: 0.6, quizAcc: 0.65, quizDelay: [2800, 5600] },
  hard:   { reaction: 190, jitter: 90,  restAt: 22, resumeAt: 58, greed: 0.0,  read: 0.9,  counter: 0.8, randomBurst: 0.02, desperation: 0.9, quizAcc: 0.85, quizDelay: [2000, 4200] }
};

export class Bot {
  constructor(engine, pid, level = 'normal', seed = 7) {
    this.e = engine; this.pid = pid;
    this.cfg = BOT_LEVELS[level] || BOT_LEVELS.normal;
    this.rng = mulberry32(seed);
    this.nextThink = 0;
    this.greedy = false;
    this.quizPlan = null;
  }

  update() {
    const e = this.e;
    if (e.phase !== 'play' || e.paused) return;
    this.planQuiz();
    if (e.t < this.nextThink) return;
    this.nextThink = e.t + this.cfg.reaction + this.rng() * this.cfg.jitter;
    this.think();
  }

  think() {
    const e = this.e, c = this.cfg, R = RULES;
    const me = e.byId.get(this.pid);
    const opp = e.players.filter((p) => p.side !== me.side);
    const mates = e.players.filter((p) => p.side === me.side && p !== me);
    if (e.t < me.exhaustedUntil) return;

    // How close am I to losing? (0 = centre, 1 = at my own finish line)
    const danger = me.side === 0 ? e.pos / R.WIN : -e.pos / R.WIN;
    const oppResting = opp.every((o) => !o.holding || e.t < o.exhaustedUntil);
    const oppWinding = opp.some((o) => o.windup);

    // Burst decisions
    const canBurst = !me.windup && e.t >= me.cooldownUntil;
    if (canBurst && me.charges > 0) {
      // A charged jerk is precious: spend it on a resting opponent, or to save the match.
      if ((oppResting && this.rng() < c.read + 0.2) || danger > 0.6) { e.input(this.pid, { type: 'burst', charged: true }); return; }
    }
    if (canBurst && me.stamina >= R.BURST_COST + 4) {
      const mateWinding = mates.some((m) => m.windup);
      if (mateWinding && this.rng() < c.read) { e.input(this.pid, { type: 'burst' }); return; }
      if (oppResting && this.rng() < c.read) { e.input(this.pid, { type: 'burst' }); return; }
      if (this.rng() < c.randomBurst) { e.input(this.pid, { type: 'burst' }); return; }
    }

    if (me.holding) {
      if (!this.greedy && me.stamina < c.restAt) {
        // Hard bots keep pulling through a dangerous moment only if they can afford it
        if (danger > 0.75 && me.stamina > 8 && this.rng() < c.desperation) return;
        e.input(this.pid, { type: 'release' });
      }
      return;
    }

    // Not holding: decide whether to start pulling
    if (oppWinding && me.stamina > 12 && this.rng() < c.counter) { this.greedy = false; e.input(this.pid, { type: 'hold' }); return; }
    if (danger > 0.6 && me.stamina > 20 && this.rng() < c.desperation) { e.input(this.pid, { type: 'hold' }); return; }
    if (me.stamina >= c.resumeAt) {
      this.greedy = this.rng() < c.greed; // greedy = will pull until it slips
      e.input(this.pid, { type: 'hold' });
    }
  }

  planQuiz() {
    const q = this.e.quiz;
    if (!q || q.closed) { this.quizPlan = null; return; }
    const key = q.id + ':' + q.startedAt;
    if (!this.quizPlan || this.quizPlan.id !== key) {
      const [lo, hi] = this.cfg.quizDelay;
      const knows = this.rng() < this.cfg.quizAcc;
      const wrong = [0, 1, 2, 3].filter((i) => i !== q.a);
      this.quizPlan = { id: key, at: lo + this.rng() * (hi - lo), value: knows ? q.a : wrong[Math.floor(this.rng() * wrong.length)], done: false };
    }
    // q.elapsed is break time (the match clock is frozen during a question)
    if (!this.quizPlan.done && q.elapsed >= this.quizPlan.at) {
      this.quizPlan.done = true;
      this.e.input(this.pid, { type: 'answer', value: this.quizPlan.value });
    }
  }
}
