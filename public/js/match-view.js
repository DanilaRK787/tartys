// Match screen: canvas arena + HUD + touch/keyboard controls.
// It only renders snapshots and forwards player intents; it never decides outcomes.
import { RULES } from '/shared/engine.js';
import { QUESTION_BY_ID } from '/shared/questions.js';
import { Arena } from './render.js';
import { t, lang } from './i18n.js';
import { sfx, buzz } from './audio.js';
import { esc } from './ui.js';

export class MatchView {
  /**
   * @param {HTMLElement} root
   * @param {object} cfg
   *  players: [{id, side, label, ctrl: 'p1'|'p2'|null}]
   *  layout: 'single' | 'duel' | 'none'
   *  mySide: 0|1|null   (perspective for messages)
   *  atlas, theme, skins, title
   *  onInput(ctrl, type, value), onExit()
   */
  constructor(root, cfg) {
    this.root = root; this.cfg = cfg;
    this.held = { p1: false, p2: false };
    this.lastCountdown = null; this.lastQuiz = null; this.snap = null; this.alive = true;
    root.innerHTML = this.markup();
    this.canvas = root.querySelector('canvas');
    this.arena = new Arena(this.canvas);
    this.cacheNodes();
    this.bindControls();
    this.onResize = () => this.arena.resize();
    window.addEventListener('resize', this.onResize);
  }

  markup() {
    const c = this.cfg;
    const panel = (side) => `<div class="team-panel side-${side}">${c.players.filter((p) => p.side === side).map((p) => `
      <div class="pl" data-pid="${p.id}"><div class="pl-top"><span class="pl-name">${esc(p.label)}</span><span class="pl-chip"></span></div>
      <div class="bar"><i></i><b style="left:${RULES.BURST_COST}%"></b></div></div>`).join('')}</div>`;
    const ctrlGroup = (ctrl, cls, hint) => `<div class="ctrl-group ${cls} ${c.atlas && ctrl === 'p1' ? 'with-charge' : ''}" data-ctrl="${ctrl}">
      <button class="btn-hold" data-act="hold" aria-label="${t('pull')}"><span>${t('pull')}</span><small>${t('pullHint')}</small></button>
      <button class="btn-burst" data-act="burst" aria-label="${t('burst')}"><span>${t('burst')}</span><small>${t('burstHint')}</small><i class="cd"></i></button>
      ${c.atlas && ctrl === 'p1' ? `<button class="btn-charge" data-act="charge" aria-label="${t('chargeBtn')}"><span>⚡×2</span><small>${t('chargeNone')}</small></button>` : ''}
      ${hint ? `<div class="keys">${hint}${c.atlas && ctrl === 'p1' ? ' · ' + t('keysCharge') : ''}</div>` : ''}</div>`;
    let controls = '';
    if (c.layout === 'single') controls = ctrlGroup('p1', 'solo', t('keysSingle'));
    if (c.layout === 'duel') controls = ctrlGroup('p1', 'duel-left', t('keysLeft')) + ctrlGroup('p2', 'duel-right', t('keysRight'));
    return `<div class="match ${c.layout}">
      <div class="match-top">
        <button class="icon-btn exit-btn" aria-label="${t('exit')}" title="${t('exit')} (Esc)">←</button>
        ${panel(0)}
        <div class="clock"><b>60</b><small>${t('timeLeft')}</small>${c.title ? `<em>${esc(c.title)}</em>` : ''}</div>
        ${panel(1)}
      </div>
      <div class="arena-wrap">
        <canvas aria-label="arena"></canvas>
        <div class="countdown-ov" hidden><b></b><span>${t('waitSignal')}</span></div>
        <div class="quiz-card" hidden></div>
        <div class="toast" hidden></div>
        <div class="banner" hidden></div>
        <div class="result-ov" hidden></div>
      </div>
      ${controls ? `<div class="controls">${controls}</div>` : ''}
    </div>`;
  }

  cacheNodes() {
    const q = (s) => this.root.querySelector(s);
    this.n = { clock: q('.clock b'), cd: q('.countdown-ov'), cdNum: q('.countdown-ov b'), quiz: q('.quiz-card'), toast: q('.toast'), banner: q('.banner'), result: q('.result-ov'), exit: q('.exit-btn') };
    this.rows = new Map([...this.root.querySelectorAll('.pl')].map((el) => [el.dataset.pid, { el, bar: el.querySelector('.bar i'), chip: el.querySelector('.pl-chip'), state: '' }]));
    this.ctrlEls = new Map([...this.root.querySelectorAll('.ctrl-group')].map((el) => [el.dataset.ctrl, { hold: el.querySelector('.btn-hold'), burst: el.querySelector('.btn-burst'), charge: el.querySelector('.btn-charge'), cd: el.querySelector('.cd') }]));
  }

  bindControls() {
    const c = this.cfg;
    this.n.exit.addEventListener('click', () => c.onExit?.());
    for (const [ctrl, els] of this.ctrlEls) {
      const down = (e) => { e.preventDefault(); sfx.unlock(); try { els.hold.setPointerCapture(e.pointerId); } catch {} this.press(ctrl, true); };
      const up = (e) => { e.preventDefault(); this.press(ctrl, false); };
      els.hold.addEventListener('pointerdown', down);
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => els.hold.addEventListener(ev, up));
      els.hold.addEventListener('contextmenu', (e) => e.preventDefault());
      els.burst.addEventListener('pointerdown', (e) => { e.preventDefault(); sfx.unlock(); this.fire(ctrl, 'burst'); });
      els.burst.addEventListener('contextmenu', (e) => e.preventDefault());
      els.charge?.addEventListener('pointerdown', (e) => { e.preventDefault(); sfx.unlock(); this.fire(ctrl, 'charge'); });
      els.charge?.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    const keymap = c.layout === 'duel'
      ? { KeyA: ['p1', 'hold'], KeyS: ['p1', 'burst'], KeyL: ['p2', 'hold'], KeyK: ['p2', 'burst'] }
      : c.layout === 'single' ? { Space: ['p1', 'hold'], KeyA: ['p1', 'hold'], KeyS: ['p1', 'burst'], ShiftLeft: ['p1', 'burst'], ShiftRight: ['p1', 'burst'], ...(c.atlas ? { KeyD: ['p1', 'charge'] } : {}) } : {};
    this.onKeyDown = (e) => {
      if (e.target.closest && e.target.closest('input, textarea')) return;
      const m = keymap[e.code];
      if (m) { e.preventDefault(); if (e.repeat) return; sfx.unlock(); if (m[1] === 'hold') this.press(m[0], true); else this.fire(m[0], m[1]); return; }
      if (c.atlas && c.layout === 'single' && /^Digit[1-4]$/.test(e.code)) { const i = Number(e.code.slice(5)) - 1; this.answerByPosition(i); }
      if (!this.n.result.hidden && (e.code === 'Enter' || e.code === 'KeyR')) { e.preventDefault(); (this.n.result.querySelector('[data-travel]') || this.n.result.querySelector('[data-rematch]'))?.click(); }
      if (e.code === 'Escape') c.onExit?.();
    };
    this.onKeyUp = (e) => { const m = keymap[e.code]; if (m && m[1] === 'hold') { e.preventDefault(); this.press(m[0], false); } };
    this.onBlur = () => { for (const k of Object.keys(this.held)) if (this.held[k]) this.press(k, false); };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  press(ctrl, down) {
    if (this.held[ctrl] === down) return;
    this.held[ctrl] = down;
    this.ctrlEls.get(ctrl)?.hold.classList.toggle('pressed', down);
    this.cfg.onInput?.(ctrl, down ? 'hold' : 'release');
  }
  fire(ctrl, type) {
    const els = this.ctrlEls.get(ctrl); const b = type === 'charge' ? els?.charge : els?.burst; if (b) { b.classList.add('pressed'); setTimeout(() => b.classList.remove('pressed'), 120); }
    this.cfg.onInput?.(ctrl, type);
  }
  answerByPosition(i) {
    const q = this.snap?.quiz; if (!q || q.closed) return;
    this.cfg.onInput?.('p1', 'answer', q.order[i]);
  }

  /** Presses made before the signal are discarded: the player must press again after "PULL!". */
  clearHeld() { for (const k of Object.keys(this.held)) { this.held[k] = false; this.ctrlEls.get(k)?.hold.classList.remove('pressed'); } }

  update(snap, dt, extra = {}) {
    if (!this.alive) return;
    this.snap = snap;
    this.arena.draw(snap, dt, { theme: this.cfg.theme, skins: this.cfg.skins, outfits: this.cfg.outfits });
    const left = this.cfg.noClock ? '∞' : Math.max(0, Math.ceil((snap.matchMs - snap.t) / 1000)); // tutorial has no time limit
    if (this.n.clock.textContent !== String(left)) { this.n.clock.textContent = left; this.n.clock.parentElement.classList.toggle('hurry', !this.cfg.noClock && left <= 10 && snap.phase === 'play'); }
    // countdown
    const showCd = snap.phase === 'countdown' && !snap.paused;
    this.n.cd.hidden = !showCd;
    if (showCd && this.lastCountdown !== snap.countdown) { this.n.cdNum.textContent = snap.countdown; sfx.tick(); }
    this.lastCountdown = showCd ? snap.countdown : null;
    // players
    for (const p of snap.players) {
      const r = this.rows.get(p.id); if (!r) continue;
      r.bar.style.width = Math.max(0, p.st) + '%';
      const state = p.ex > 0 ? 'slip' : p.wind ? 'wind' : p.hold ? 'hold' : 'rest';
      if (state !== r.state) {
        r.state = state; r.el.dataset.state = state;
        r.chip.textContent = t({ slip: 'stSlip', wind: 'stWind', hold: 'stHold', rest: 'stRest' }[state]);
      }
      r.el.classList.toggle('low', p.st < RULES.BURST_COST);
      const chs = '⚡'.repeat(p.ch || 0);
      if (r.chs !== chs) { r.chs = chs; let el = r.el.querySelector('.pl-ch'); if (!el) { el = document.createElement('span'); el.className = 'pl-ch'; r.el.querySelector('.pl-name').after(el); } el.textContent = chs; }
    }
    // controls state
    for (const [ctrl, els] of this.ctrlEls) {
      const pid = this.cfg.players.find((p) => p.ctrl === ctrl)?.id;
      const p = snap.players.find((x) => x.id === pid); if (!p) continue;
      const free = snap.phase === 'play' && !snap.quiz && p.ex <= 0 && p.cd <= 0;
      els.burst.classList.toggle('ready', free && p.st >= RULES.BURST_COST);
      if (els.charge) {
        const ch = p.ch || 0;
        els.charge.classList.toggle('ready', free && ch > 0);
        els.charge.classList.toggle('has', ch > 0);
        if (els.charge.dataset.ch !== String(ch)) { els.charge.dataset.ch = ch; els.charge.querySelector('small').textContent = ch > 0 ? t('chargeHint', { n: ch }) : t('chargeNone'); }
      }
      els.hold.classList.toggle('slipped', p.ex > 0);
      els.cd.style.transform = `scaleX(${p.cd > 0 ? Math.min(1, p.cd / (RULES.BURST_COOLDOWN_MS + RULES.BURST_WINDUP_MS)) : 0})`;
    }
    this.renderQuiz(snap);
    if (extra.banner !== undefined) this.setBanner(extra.banner);
  }

  renderQuiz(snap) {
    const q = snap.quiz;
    if (!this.cfg.atlas || !q) { if (!this.n.quiz.hidden) this.n.quiz.hidden = true; this.lastQuiz = null; return; }
    const me = this.cfg.players.find((p) => p.ctrl === 'p1')?.id;
    const key = q.id + ':' + q.closed + ':' + q.locked.join(',') + ':' + q.winnerSide;
    const left = Math.max(0, Math.ceil(q.left / 1000));
    if (key !== this.lastQuiz) {
      this.lastQuiz = key;
      const bank = QUESTION_BY_ID[q.id]; const L = lang();
      const opts = bank.o[L] || bank.o.ru;
      const locked = q.locked.includes(me);
      let status = '';
      if (q.closed && q.winnerSide != null) status = q.winnerSide === this.cfg.mySide ? t('quizWinYou') : t('quizWinRival');
      else if (locked) status = t('quizWrong');
      this.n.quiz.innerHTML = `<div class="qz-head"><span>${t('quizLabel')}</span><b class="qz-time">${left}</b></div>
        <div class="qz-sub">${t('quizBreak')}</div>
        <p>${esc(bank.q[L] || bank.q.ru)}</p>
        <div class="qz-opts">${q.order.map((oi, i) => `<button data-oi="${oi}" ${q.closed || locked ? 'disabled' : ''} class="${q.closed && q.winnerSide != null && oi === bank.a ? 'right' : ''}"><kbd>${i + 1}</kbd>${esc(opts[oi])}</button>`).join('')}</div>
        ${status ? `<div class="qz-status">${status}</div>` : ''}`;
      this.n.quiz.querySelectorAll('[data-oi]').forEach((b) => b.addEventListener('click', () => this.cfg.onInput?.('p1', 'answer', Number(b.dataset.oi))));
      this.n.quiz.hidden = false;
    } else {
      const tEl = this.n.quiz.querySelector('.qz-time'); if (tEl && tEl.textContent !== String(left)) tEl.textContent = left;
    }
  }

  /** Visual + audio feedback for engine events. */
  events(list) {
    const my = this.cfg.mySide;
    for (const e of list) {
      const mine = e.side === my;
      switch (e.type) {
        case 'start': case 'resume':
          sfx.go(); this.flash(t('go')); this.clearHeld(); break;
        case 'burst': {
          let text = e.synced ? t('synced') : e.kind === 'perfect' ? t('perfect') : e.kind === 'blocked' ? t('blocked') : t('normalBurst');
          if (e.charged) text = '⚡ ' + text + ' ×2';
          this.arena.effect(e.synced || e.charged ? 'synced' : e.kind === 'perfect' ? 'perfect' : 'burst', e.side, text);
          (e.kind === 'perfect' || e.synced ? sfx.perfect : e.kind === 'blocked' ? sfx.blocked : sfx.burst)();
          if (mine) buzz(e.kind === 'perfect' ? [20, 30, 40] : 25);
          break; }
        case 'exhaust':
          this.arena.effect('slip', e.side, t('slip')); sfx.slip(); if (this.cfg.players.some((p) => p.id === e.pid && p.ctrl)) buzz([60, 40, 60]); break;
        case 'quizStart': sfx.quiz(); this.clearHeld(); break;
        case 'quizEnd': sfx.go(); this.flash(t('go')); this.clearHeld(); break;
        case 'quizWin': (mine ? sfx.right : sfx.wrong)(); break;
        case 'quizWrong': if (this.cfg.players.some((p) => p.id === e.pid && p.ctrl)) sfx.wrong(); break;
        default: break;
      }
    }
  }

  flash(text) {
    this.n.banner.textContent = text; this.n.banner.hidden = false; this.n.banner.classList.remove('pop'); void this.n.banner.offsetWidth; this.n.banner.classList.add('pop');
    clearTimeout(this.flashT); this.flashT = setTimeout(() => { this.n.banner.hidden = true; }, 900);
  }
  setBanner(text) {
    if (!text) { if (this.stickyBanner) { this.n.banner.hidden = true; this.stickyBanner = false; } return; }
    this.stickyBanner = true; this.n.banner.hidden = false; this.n.banner.classList.remove('pop'); this.n.banner.textContent = text;
  }
  toast(text) {
    this.n.toast.textContent = text; this.n.toast.hidden = false;
    clearTimeout(this.toastT); this.toastT = setTimeout(() => { this.n.toast.hidden = true; }, 1100);
  }
  rejection(reason) {
    const key = { 'no-charge': 'noCharge', 'no-stamina': 'noStamina', cooldown: 'cooldown', exhausted: 'exhaustedMsg', 'not-playing': 'waitSignal' }[reason];
    if (key) this.toast(t(key));
  }

  showResult(html, onBind) { this.n.result.innerHTML = html; this.n.result.hidden = false; this.n.quiz.hidden = true; onBind?.(this.n.result); (this.n.result.querySelector('[data-travel]') || this.n.result.querySelector('[data-rematch]'))?.focus(); }
  hideResult() { this.n.result.hidden = true; this.n.result.innerHTML = ''; }

  destroy() {
    this.alive = false;
    window.removeEventListener('keydown', this.onKeyDown); window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur); window.removeEventListener('resize', this.onResize);
  }
}

export function resultMarkup({ title, cls, reason, hook, stats, tip, extra = '', buttons }) {
  const s = stats || {};
  const tiles = [
    [s.bursts ?? 0, t('statBursts')], [s.perfect ?? 0, t('statPerfect')], [s.blocked ?? 0, t('statBlocked')],
    [s.exhausts ?? 0, t('statSlips')], [((s.holdMs ?? 0) / 1000).toFixed(1), t('statHold')]
  ];
  if (s.correct) tiles.push([s.correct, t('statCorrect')]);
  if (s.synced) tiles.push([s.synced, t('statSynced')]);
  if (s.charged) tiles.push([s.charged, t('statCharged')]);
  return `<div class="result ${cls}">
    <h2>${title}</h2><p class="reason">${reason}</p>${extra}
    ${stats ? `<div class="tactics"><span class="lbl">${t('yourTactics')}</span><div class="tiles">${tiles.map(([v, l]) => `<div><b>${v}</b><small>${l}</small></div>`).join('')}</div>${tip ? `<p class="tip">💡 ${tip}</p>` : ''}</div>` : ''}
    <p class="hook">${hook}</p>
    <div class="actions">${buttons}</div></div>`;
}

export function tipFor(stats, won) {
  if (!stats) return '';
  if (stats.exhausts >= 2) return t('tipSlip', { n: stats.exhausts });
  if (stats.blocked >= 2 && stats.blocked >= stats.perfect) return t('tipBlocked');
  if (stats.bursts <= 1) return t('tipNoBurst');
  if (stats.perfect >= 3 && won) return t('tipPerfect', { n: stats.perfect });
  return t('tipGeneric');
}
