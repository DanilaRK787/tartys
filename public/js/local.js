// Offline matches: vs bot, duel on one device, 2×2 with bots, series, challenges, tutorial.
// The engine runs in the browser; bots use the same engine.input() as the player.
import { Engine, RULES } from '/shared/engine.js';
import { Bot } from '/shared/bot.js';
import { QUIZ_KEYS } from '/shared/questions.js';
import { MatchView, resultMarkup, tipFor } from './match-view.js';
import { t, lang } from './i18n.js';
import { sfx } from './audio.js';
import { settings, saveSettings, pushLocalHistory, markProgress, localProgress } from './store.js';
import { currentUser, reportMatch, saveProgress, currentProgress } from './api.js';
import { CHALLENGE_BY_ID } from './challenges.js';
import { OUTFITS, ARENAS, allowed } from '/shared/cosmetics.js';
import { CITIES, cityTheme, JOURNEY_LEVEL } from '/shared/journey.js';
import { notify, esc, confirmDialog } from './ui.js';
import { go } from './router.js';

export function runLocal(root, opts) {
  const challenge = opts.challenge ? CHALLENGE_BY_ID[opts.challenge] : null;
  const cfg = { ...(challenge?.setup || {}), ...opts, ...(challenge ? challenge.setup : {}) };
  const kind = cfg.kind || 'bot';
  const city = kind === 'journey' ? Math.max(0, Math.min(CITIES.length - 1, Number(cfg.city) || 0)) : null;
  const level = kind === 'journey' ? JOURNEY_LEVEL : ['easy', 'normal', 'hard'].includes(cfg.level) ? cfg.level : 'normal';
  const user = currentUser();
  const L = lang();
  // Locked city typed into the URL? Back to the map — progress decides, not the address bar.
  if (kind === 'journey' && city > journeyUnlocked()) { go('#/journey'); return () => {}; }
  const myName = user?.username || settings().name || t('you');
  const mySkin = user?.skin || 'classic';
  // Cosmetics come from the account (checked by the server on purchase); guests get the free ones.
  const myOutfit = allowed(OUTFITS, user?.settings?.outfit, user?.pro) ? user.settings.outfit : 'team';
  const myArena = allowed(ARENAS, user?.settings?.arena, user?.pro) ? user.settings.arena : 'steppe';
  let series = kind === 'series' ? { wins: [0, 0], round: 1 } : null;
  let engine, bots, view, raf, last, tutorial, tutorialCleanup = null, destroyed = false, reported = false;

  function players() {
    if (kind === 'duel') return [{ id: 'p1', side: 0, label: t('player1'), ctrl: 'p1' }, { id: 'p2', side: 1, label: t('player2'), ctrl: 'p2' }];
    if (kind === 'team') return [
      { id: 'you', side: 0, label: myName, ctrl: 'p1' }, { id: 'mate', side: 0, label: t('partner') + ' · ' + t('normal') },
      { id: 'b1', side: 1, label: t(level) + ' 1' }, { id: 'b2', side: 1, label: t(level) + ' 2' }];
    if (kind === 'tutorial') return [{ id: 'you', side: 0, label: myName, ctrl: 'p1' }, { id: 'bot', side: 1, label: t('rival') }];
    if (kind === 'journey') return [{ id: 'you', side: 0, label: myName, ctrl: 'p1' }, { id: 'bot', side: 1, label: t('teamOf', { city: CITIES[city].name[L] }) }];
    return [{ id: 'you', side: 0, label: myName, ctrl: 'p1' }, { id: 'bot', side: 1, label: t('rival') + ' · ' + t(level) }];
  }

  function modeInfo() {
    if (kind === 'journey') return { mode: 'journey', opponent: CITIES[city].name[L] };
    const mode = challenge ? 'challenge-' + challenge.id : kind === 'duel' ? 'duel' : kind === 'team' ? 'team-bot' : (cfg.atlas ? 'atlas-' : 'bot-') + level;
    const opponent = kind === 'duel' ? t('player2') : kind === 'team' ? `2× ${t(level)}` : `${t('rival')} · ${t(level)}`;
    return { mode, opponent };
  }

  /** Leaving a running match in ANY way (button, back, typing another URL, closing the tab) = loss. */
  function recordForfeit() {
    if (!engine || engine.phase !== 'play' || reported || kind === 'tutorial' || kind === 'duel') return false;
    reported = true;
    const record = { ...modeInfo(), result: 'loss', durationMs: Math.max(1000, Math.round(engine.t)), stats: engine.statsFor('you'), pos: -engine.pos, reason: 'forfeit' };
    if (currentUser()) reportMatch(record, { keepalive: true }); else pushLocalHistory(record);
    return true;
  }

  function start() {
    cancelAnimationFrame(raf);
    view?.destroy();
    const pl = players();
    const seed = (Math.random() * 2 ** 31) | 0;
    engine = new Engine({ players: pl.map(({ id, side, label }) => ({ id, side, name: label })), seed,
      quiz: cfg.atlas ? QUIZ_KEYS : null, matchMs: kind === 'tutorial' ? 10 * 60 * 1000 : RULES.MATCH_MS });
    bots = [];
    if (kind === 'bot' || kind === 'series' || kind === 'journey') bots.push(new Bot(engine, 'bot', level, seed + 1));
    if (kind === 'team') { bots.push(new Bot(engine, 'mate', 'normal', seed + 2), new Bot(engine, 'b1', level, seed + 3), new Bot(engine, 'b2', level, seed + 4)); }
    reported = false;
    const title = kind === 'journey' ? `🗺 ${CITIES[city].name[L]} · ${city + 1}/${CITIES.length}` : series ? `${t('seriesScore')} ${series.wins[0]}:${series.wins[1]} · ${t('round')} ${series.round}` : challenge ? t(challenge.title) : cfg.atlas ? t('modeAtlas') : '';
    view = new MatchView(root, {
      players: pl, layout: kind === 'duel' ? 'duel' : 'single', mySide: kind === 'duel' ? null : 0,
      noClock: kind === 'tutorial', atlas: !!cfg.atlas, theme: kind === 'journey' ? cityTheme(city) : myArena,
      skins: [mySkin, 'classic'], outfits: [kind === 'duel' ? 'team' : myOutfit, 'team'], title,
      onInput: (ctrl, type, value) => {
        const pid = pl.find((p) => p.ctrl === ctrl)?.id; if (!pid) return;
        const res = engine.input(pid, type === 'charge' ? { type: 'burst', charged: true } : { type, value });
        if (!res.ok && type !== 'release') view.rejection(res.reason);
      },
      onExit: exit
    });
    if (kind === 'tutorial') setupTutorial();
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    if (destroyed) return;
    let dt = Math.min(250, now - last); last = now;
    if (!engine.paused) {
      // fixed-step simulation: bots think between ticks, exactly like the server
      engine.acc = engine.acc || 0;
      let budget = dt + (engine.stepCarry || 0);
      while (budget >= RULES.TICK_MS && engine.phase !== 'over') {
        for (const b of bots) b.update();
        engine.tick(RULES.TICK_MS);
        if (tutorial) tutorial.tick();
        budget -= RULES.TICK_MS;
      }
      engine.stepCarry = budget;
      if (engine.phase === 'over' && !reported) finish();
    }
    const ev = engine.drainEvents();
    if (ev.length) { view.events(ev); if (tutorial) tutorial.onEvents(ev); if (challenge?.live) liveCheck(); }
    view.update(engine.snapshot(), dt);
    raf = requestAnimationFrame(frame);
  }

  function liveCheck() {
    const s = engine.statsFor(kind === 'duel' ? 'p1' : 'you');
    if (challenge.progress) view.setBanner(`${t(challenge.title)} · ${challenge.progress(s)}`);
  }

  function finish() {
    reported = true;
    const me = kind === 'duel' ? 'p1' : 'you';
    const stats = engine.statsFor(me);
    const w = engine.winner;
    const result = w === 'draw' ? 'draw' : w === 0 ? 'win' : 'loss';
    if (kind === 'tutorial') return tutorial.finish(result);
    (result === 'win' ? sfx.win : result === 'loss' ? sfx.lose : sfx.draw)();
    const record = { ...modeInfo(), result, durationMs: Math.round(engine.t), stats, pos: -engine.pos, reason: engine.reason };
    if (currentUser()) reportMatch(record).then((r) => r.ok && notify(t('saved'))); else pushLocalHistory(record);

    // Challenge verdict
    let chLine = '';
    if (challenge && challenge.check) {
      const ok = challenge.check({ winner: w, reason: engine.reason, t: engine.t, stats });
      if (ok) completeChallenge(challenge.id, challenge.score ? challenge.score({ t: engine.t }) : 1);
      chLine = `<p class="ch-verdict ${ok ? 'ok' : 'fail'}">${ok ? '✓ ' + t('challengeDone') : '✗ ' + t('challengeFail')} — ${esc(t(challenge.title))}</p>`;
    }

    // Series flow
    let seriesLine = '', seriesOver = false;
    if (series) {
      if (w === 0 || w === 1) series.wins[w]++;
      seriesOver = series.wins[0] >= 2 || series.wins[1] >= 2;
      seriesLine = `<div class="series-score"><span>${t('seriesScore')}</span><b>${series.wins[0]} : ${series.wins[1]}</b>${seriesOver ? `<em>${series.wins[0] >= 2 ? t('seriesWin') : t('seriesLose')}</em>` : ''}</div>`;
      if (seriesOver && challenge?.checkSeries) {
        const ok = challenge.checkSeries(series.wins);
        if (ok) completeChallenge(challenge.id, 1);
        chLine = `<p class="ch-verdict ${ok ? 'ok' : 'fail'}">${ok ? '✓ ' + t('challengeDone') : '✗ ' + t('challengeFail')}</p>`;
      }
    }

    const duelTitle = w === 'draw' ? t('draw') : t('winnerIs', { name: w === 0 ? t('player1') : t('player2') });
    const title = kind === 'duel' ? duelTitle : result === 'win' ? t('win') : result === 'loss' ? t('lose') : t('draw');
    const reason = engine.reason === 'line' ? t('reasonLine') : w === 'draw' ? t('reasonTimeDraw') : t('reasonTime');
    const hook = result === 'loss' ? t('loseHook') : result === 'win' ? t('winHook') : t('drawHook');
    const nextLabel = series && !seriesOver ? t('nextRound') : t('rematch');
    // Journey: a win moves you to the next city on the map
    let journeyBtn = '', journeyLine = '';
    if (kind === 'journey') {
      if (result === 'win') {
        const best = Math.max(journeyUnlocked(), city + 1);
        saveProgress('journey', { best, done: best >= CITIES.length });
        const next = CITIES[city + 1];
        journeyBtn = next ? `<button class="btn primary" data-travel>${t('travelTo', { city: next.name[L] })} →</button>`
          : `<button class="btn primary" data-travel>🏁 ${t('journeyFinish')}</button>`;
        journeyLine = `<p class="ch-verdict ok">✓ ${t('cityWon', { city: CITIES[city].name[L] })}</p>`;
      } else journeyLine = `<p class="ch-verdict fail">${t('cityStay', { city: CITIES[city].name[L] })}</p>`;
    }
    view.showResult(resultMarkup({
      title, cls: kind === 'duel' ? 'neutral' : result, reason, hook: kind === 'duel' ? t('winHook') : hook,
      stats: kind === 'duel' ? null : stats, tip: kind === 'duel' ? '' : tipFor(stats, result === 'win'),
      extra: seriesLine + chLine + journeyLine,
      buttons: journeyBtn + `<button class="btn ${journeyBtn ? 'ghost' : 'primary'}" data-rematch>${nextLabel} <kbd>${t('rematchHint')}</kbd></button><button class="btn ghost" data-change>${kind === 'journey' ? t('toMap') : t('changeMode')}</button>`
    }), (el) => {
      el.querySelector('[data-rematch]').addEventListener('click', () => {
        if (series) { if (seriesOver) series = { wins: [0, 0], round: 1 }; else series.round++; }
        start();
      });
      el.querySelector('[data-change]').addEventListener('click', () => go(challenge ? '#/training' : kind === 'journey' ? '#/journey' : '#/'));
      el.querySelector('[data-travel]')?.addEventListener('click', () => go(city + 1 < CITIES.length ? `#/journey?travel=${city + 1}` : '#/journey?done=1'));
    });
  }

  function completeChallenge(id, best) {
    saveProgress(id, { done: true, best });
  }

  async function exit() {
    const midMatch = engine && engine.phase === 'play' && !reported && kind !== 'tutorial' && kind !== 'duel';
    if (midMatch) {
      engine.pause(); // the rope waits while you decide
      const ok = await confirmDialog({ title: t('exitTitle'), text: t('exitConfirm'), ok: t('exitYes'), cancel: t('exitNo'), danger: true });
      if (!ok) { engine.resume(); return; }
    }
    recordForfeit();
    go(challenge || kind === 'tutorial' ? '#/training' : kind === 'journey' ? '#/journey' : '#/');
  }

  function onVisibility() {
    if (!engine) return;
    if (document.hidden && engine.phase !== 'over') { engine.pause(); view.setBanner(t('paused')); }
    else if (!document.hidden && engine.paused) { engine.resume(); view.setBanner(null); }
  }
  document.addEventListener('visibilitychange', onVisibility);
  const onBeforeUnload = (e) => {
    if (engine && engine.phase === 'play' && !reported && kind !== 'tutorial' && kind !== 'duel') { recordForfeit(); e.preventDefault(); e.returnValue = ''; }
  };
  window.addEventListener('beforeunload', onBeforeUnload);

  // ————— Tutorial —————
  function setupTutorial() {
    const coach = document.createElement('div');
    coach.className = 'coach';
    root.querySelector('.arena-wrap').appendChild(coach);
    // reached = the step being practised; viewing = the hint on screen (player can flip back and forth).
    let reached = 0, viewing = 0; const done = {}; let doneShown = false;
    const you = () => engine.byId.get('you');
    const show = () => {
      const canNext = viewing < reached || done[reached];
      coach.innerHTML = `<div class="coach-steps">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= reached ? 'on' : ''} ${i === viewing ? 'cur' : ''}"></i>`).join('')}</div>
        <div class="coach-num">${t('tutStep', { n: viewing, total: 5 })}</div>
        <p>${t('tut' + viewing)}</p>
        ${viewing === reached && done[reached] ? `<p class="coach-ok">✓ ${t('tutGot')}</p>` : viewing < reached ? `<p class="coach-past">${t('tutPast')}</p>` : ''}
        <div class="coach-nav">
          <button class="coach-btn" data-prev ${viewing <= 1 ? 'disabled' : ''}>← ${t('back')}</button>
          ${viewing < 5 ? `<button class="coach-btn primary ${canNext ? 'ready' : ''}" data-next ${canNext ? '' : 'disabled'}>${t('tutNext')} →</button>` : ''}
        </div>
        <button class="link" data-skip>${t('tutSkip')}</button>`;
      coach.querySelector('[data-skip]').addEventListener('click', () => { saveSettings({ tutorialSeen: true }); go('#/training'); });
      // blur after click so Space keeps meaning "pull", not "press the focused button"
      coach.querySelector('[data-prev]').addEventListener('click', (e) => { e.currentTarget.blur(); prev(); });
      coach.querySelector('[data-next]')?.addEventListener('click', (e) => { e.currentTarget.blur(); next(); });
    };
    const advance = () => { // start practising the next step
      reached++; viewing = reached; engine.pos = 0; engine.bursts = [];
      if (reached === 2) { const p = you(); p.holding = false; p.stamina = Math.min(p.stamina, 45); } // so the refill is visible
      if (reached === 5) bots.push(new Bot(engine, 'bot', 'easy', 5));
      show();
    };
    const next = () => {
      if (viewing < reached) { viewing++; show(); return; }
      if (done[reached] && reached < 5) advance();
    };
    const prev = () => { if (viewing > 1) { viewing--; show(); } };
    const complete = (i) => { if (reached === i && !done[i]) { done[i] = true; sfx.right(); show(); } };
    const onKey = (e) => { if (e.code === 'ArrowRight') { e.preventDefault(); next(); } if (e.code === 'ArrowLeft') { e.preventDefault(); prev(); } };
    window.addEventListener('keydown', onKey);
    tutorialCleanup = () => window.removeEventListener('keydown', onKey);
    tutorial = {
      tick() {
        if (engine.phase !== 'play') return;
        if (reached === 0) advance();
        if (reached < 5) engine.pos = Math.max(-60, Math.min(60, engine.pos));
        const p = you();
        if (reached === 1 && p.stats.holdMs >= 1300) complete(1);
        else if (reached === 2 && !p.holding && p.stamina >= 95) complete(2);
      },
      onEvents(ev) {
        for (const e of ev) {
          if (reached === 3 && e.type === 'exhaust' && e.pid === 'you') complete(3);
          if (reached === 4 && e.type === 'burst' && e.pid === 'you' && e.kind === 'perfect') complete(4);
        }
      },
      finish(result) {
        if (doneShown) return; doneShown = true;
        coach.remove();
        saveSettings({ tutorialSeen: true });
        if (result === 'win') { completeChallenge('tutorial', 1); sfx.win(); }
        view.showResult(resultMarkup({ title: result === 'win' ? t('win') : t('lose'), cls: result, reason: t('tutDone'), hook: t('winHook'), stats: null,
          buttons: `<button class="btn primary" data-rematch>${t('play')} → ${t('normal')}</button><button class="btn ghost" data-change>${t('training')}</button>` }), (el) => {
          el.querySelector('[data-rematch]').addEventListener('click', () => go('#/play/bot?level=normal'));
          el.querySelector('[data-change]').addEventListener('click', () => go('#/training'));
        });
      }
    };
  }

  start();
  return () => {
    // Route changed while the match was running (URL edited, back button, menu link) → counted as a loss.
    if (recordForfeit()) notify(t('forfeitByNav'), 'err');
    destroyed = true; cancelAnimationFrame(raf); view?.destroy(); tutorialCleanup?.();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('beforeunload', onBeforeUnload);
  };
}

export { localProgress };

/** How many journey cities are beaten (= index of the furthest unlocked city). Account and local progress, whichever is further. */
export function journeyUnlocked() {
  return Math.min(CITIES.length, currentProgress().journey?.best || 0);
}
