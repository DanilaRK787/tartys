import { Engine } from '/shared/engine.js';
import { Bot } from '/shared/bot.js';
import { Arena, renderPreview } from './render.js';
import { ROPES, OUTFITS, ARENAS } from '/shared/cosmetics.js';
import { t, lang } from './i18n.js';
import { settings, saveSettings, localHistory, localProgress } from './store.js';
import { api, currentUser, login, logout, updateMe, history, currentProgress } from './api.js';
import { CHALLENGES } from './challenges.js';
import { esc, notify, fmtDate, backButton, confirmDialog } from './ui.js';
import { go } from './router.js';
import { sfx } from './audio.js';

// ——— Home ———
export function homeScreen(root) {
  const s = settings();
  const levels = ['easy', 'normal', 'hard'];
  root.innerHTML = `<section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">TARTYS · ${t('tagline')}</span>
        <h1>${t('heroTitle')}</h1>
        <p class="lead">${t('heroText')}</p>
        <div class="hero-cta">
          <a class="btn primary big" href="#/play/bot?level=${s.level}${s.atlas ? '&atlas=1' : ''}">▶ ${t('quickStart')}</a>
          <a class="btn big ghost" href="#/tutorial">${t('startTutorial')}</a>
        </div>
        ${s.tutorialSeen ? '' : `<a class="first-time" href="#/tutorial">★ ${t('firstTime')}</a>`}
      </div>
      <div class="hero-demo"><canvas id="demo"></canvas>
        <div class="demo-legend"><span><i class="k">⎵</i> ${t('pull')}</span><span><i class="k">S</i> ${t('burst')}</span></div></div>
    </section>
    <section class="rule-strip">
      <div><b>1</b><h3>${t('pull')}</h3><p>${t('strip1')}</p></div>
      <div><b>2</b><h3>${t('letGo')}</h3><p>${t('strip2')}</p></div>
      <div><b>3</b><h3>${t('burst')}</h3><p>${t('strip3')}</p></div>
      <a href="#/rules" class="more">${t('rulesTitle')} →</a>
    </section>
    <section class="modes">
      <article class="mode-card main">
        <header><h2>${t('modeBot')}</h2><p>${t('modeBotText')}</p></header>
        <div class="levels">${levels.map((l) => `<button class="lvl ${s.level === l ? 'on' : ''}" data-level="${l}"><b>${t(l)}</b><small>${t(l + 'Text')}</small></button>`).join('')}</div>
        <label class="toggle"><input type="checkbox" id="atlas" ${s.atlas ? 'checked' : ''}><span></span><div><b>${t('modeAtlas')}</b><small>${t('modeAtlasText')}</small></div></label>
        <div class="row"><a class="btn primary" id="play-bot">${t('play')}</a><a class="btn ghost" id="play-series">${t('modeSeries')}</a></div>
      </article>
      <a class="mode-card journey-card" href="#/journey"><span class="jc-badge">NEW</span><h2>🗺 ${t('journeyTitle')}</h2><p>${t('journeyShort')}</p><span class="go">→</span></a>
      <a class="mode-card" href="#/play/duel"><h2>${t('modeDuel')}</h2><p>${t('modeDuelText')}</p><span class="go">→</span></a>
      <a class="mode-card" id="team-link" href="#/play/team?level=${s.level}"><h2>${t('modeTeam')}</h2><p>${t('modeTeamText')}</p><span class="go">→</span></a>
      <a class="mode-card accent" href="#/online"><h2>${t('modeOnline')}</h2><p>${t('modeOnlineText')}</p><span class="go">→</span></a>
      <a class="mode-card" href="#/training"><h2>${t('training')}</h2><p>${t('trainingText')}</p><span class="go">→</span></a>
    </section>`;
  const refresh = () => {
    const st = settings();
    root.querySelector('#play-bot').href = `#/play/bot?level=${st.level}${st.atlas ? '&atlas=1' : ''}`;
    root.querySelector('#play-series').href = `#/play/series?level=${st.level}`;
    root.querySelector('#team-link').href = `#/play/team?level=${st.level}`;
    root.querySelector('.hero-cta .primary').href = `#/play/bot?level=${st.level}${st.atlas ? '&atlas=1' : ''}`;
  };
  root.querySelectorAll('[data-level]').forEach((b) => b.addEventListener('click', () => {
    saveSettings({ level: b.dataset.level });
    root.querySelectorAll('[data-level]').forEach((x) => x.classList.toggle('on', x === b)); refresh();
  }));
  root.querySelector('#atlas').addEventListener('change', (e) => { saveSettings({ atlas: e.target.checked }); refresh(); });
  refresh();
  return demoLoop(root.querySelector('#demo'));
}

// Attract mode: two bots play a real match on the home page.
function demoLoop(canvas) {
  const arena = new Arena(canvas);
  let e, bots, raf, last = performance.now(), overAt = 0;
  const reset = () => {
    e = new Engine({ players: [{ id: 'a', side: 0 }, { id: 'b', side: 1 }], seed: (Math.random() * 1e9) | 0 });
    e.countdownLeft = 600;
    bots = [new Bot(e, 'a', 'normal', 1 + ((Math.random() * 1e6) | 0)), new Bot(e, 'b', 'hard', 2)];
  };
  reset();
  const onResize = () => arena.resize(); window.addEventListener('resize', onResize);
  const frame = (now) => {
    const dt = Math.min(100, now - last); last = now;
    let budget = dt + (e.carry || 0);
    while (budget >= e.R.TICK_MS && e.phase !== 'over') { bots.forEach((b) => b.update()); e.tick(e.R.TICK_MS); budget -= e.R.TICK_MS; }
    e.carry = budget;
    for (const ev of e.drainEvents()) {
      if (ev.type === 'burst' && ev.kind === 'perfect') arena.effect('perfect', ev.side, '×1.7');
      if (ev.type === 'exhaust') arena.effect('slip', ev.side, t('slip'));
    }
    if (e.phase === 'over') { if (!overAt) overAt = now; if (now - overAt > 1800) { overAt = 0; reset(); } }
    arena.draw(e.snapshot(), dt, {});
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
}

// ——— Training ———
export function trainingScreen(root) {
  const progress = currentProgress();
  root.innerHTML = `<section class="page">${backButton('#/', t('toHome'))}<h1>${t('training')}</h1><p class="lead">${t('trainingText')}</p>
    <div class="ch-grid">${CHALLENGES.map((c) => {
      const done = progress[c.id]?.done;
      const href = c.id === 'tutorial' ? '#/tutorial' : `#/play/challenge?id=${c.id}`;
      return `<a class="ch-card ${done ? 'done' : ''}" href="${href}"><span class="ch-icon">${c.icon}</span><div><h3>${t(c.title)}</h3><p>${t(c.text)}</p></div>
        <span class="ch-state">${done ? '✓ ' + t('chDone') : t('chTry') + ' →'}</span></a>`;
    }).join('')}</div>
    <p class="muted">${Object.values(progress).filter((p) => p.done).length} / ${CHALLENGES.length} ${t('chDone').toLowerCase()}</p></section>`;
}

// ——— Rules ———
export function rulesScreen(root) {
  root.innerHTML = `<section class="page narrow rules">${backButton('#/', t('toHome'))}<h1>${t('rulesTitle')}</h1>
    ${[1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<p>${t('rules' + i)}</p>`).join('')}
    <div class="card"><div class="field-label">⌨ / 📱</div>
    <table class="tbl"><tbody>
      <tr><td>${t('modeBot')}</td><td>${t('keysSingle')}</td></tr>
      <tr><td>${t('modeDuel')}</td><td>${t('keysLeft')} · ${t('keysRight')}</td></tr>
      <tr><td>📱</td><td>${t('pull')} — ${t('pullHint')}, ${t('burst')} — tap</td></tr>
    </tbody></table></div>
    <a class="btn primary" href="#/tutorial">${t('startTutorial')}</a></section>`;
}

// ——— Auth ———
// 0..4: length, character variety; common passwords and ones containing the login are weak.
const COMMON_PW = ['123456', '1234567', '12345678', '123456789', 'qwerty', 'qwerty123', 'password', 'пароль', '111111', '000000', 'abc123', 'tartys', 'tartys2026', 'qazwsx', 'iloveyou'];
function pwScore(p, login = '') {
  if (!p || p.length < 6) return 1;
  const low = p.toLowerCase();
  if (COMMON_PW.includes(low) || (login && low.includes(login.toLowerCase()))) return 1;
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  const kinds = [/[a-zа-яәіңғүұқөһ]/, /[A-ZА-ЯӘІҢҒҮҰҚӨҺ]/, /\d/, /[^\p{L}\d]/u].filter((r) => r.test(p)).length;
  if (kinds >= 2) s++;
  if (kinds >= 3) s++;
  if (/^(.)\1+$/.test(p)) s = 0;
  return Math.max(1, Math.min(4, s));
}
const NAME_RE = /^[\p{L}\p{N}_.-]{3,20}$/u;
export function authScreen(root, params) {
  let reg = params.mode === 'register';
  let nameTimer = 0, nameState = null; // null | 'checking' | 'free' | 'taken' | 'invalid'
  const draw = () => {
    root.innerHTML = `<section class="page narrow">${backButton('#/', t('back'), 'prev')}<h1>${reg ? t('register') : t('authTitle')}</h1>
      <form class="card form-card" id="f" novalidate>
        <label>${t('username')}<input name="u" autocomplete="username" required maxlength="20" spellcheck="false" autocapitalize="off">
          <small class="fhint" id="uhint">${reg ? t('hintUsername') : ''}</small></label>
        <label>${t('password')}<div class="pw-wrap"><input name="p" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required maxlength="100">
          <button type="button" class="eye" aria-label="${t('showPassword')}" title="${t('showPassword')}">👁</button></div>
          ${reg ? `<div class="pw-meter" aria-hidden="true"><i></i><i></i><i></i><i></i></div>` : ''}
          <small class="fhint" id="phint">${reg ? t('hintPassword') : ''}</small></label>
        ${reg ? `<label>${t('password2')}<div class="pw-wrap"><input name="p2" type="password" autocomplete="new-password" maxlength="100">
          <button type="button" class="eye" aria-label="${t('showPassword')}" title="${t('showPassword')}">👁</button></div><small class="fhint" id="p2hint"></small></label>` : ''}
        <p class="err" hidden></p>
        <button class="btn primary wide">${reg ? t('register') : t('login')}</button>
        <p class="muted center">${reg ? t('haveAccount') : t('noAccount')} <a href="#" id="sw">${reg ? t('login') : t('register')}</a></p>
        <p class="muted small center">🔒 ${t('pwNote')}</p>
      </form>
      <p class="demo-hint">🔑 ${t('demoAccess')}</p></section>`;
    const f = root.querySelector('#f');
    const setHint = (id, text, cls) => { const el = root.querySelector('#' + id); if (!el) return; el.textContent = text; el.className = 'fhint ' + (cls || ''); };
    // 👁 show / hide what you type
    f.querySelectorAll('.eye').forEach((btn) => btn.addEventListener('click', () => {
      const input = btn.previousElementSibling; const show = input.type === 'password';
      input.type = show ? 'text' : 'password'; btn.classList.toggle('on', show);
      btn.textContent = show ? '🙈' : '👁'; btn.setAttribute('aria-label', show ? t('hidePassword') : t('showPassword')); input.focus();
    }));
    root.querySelector('#sw').addEventListener('click', (e) => { e.preventDefault(); reg = !reg; nameState = null; draw(); });
    if (reg) {
      // live checks while typing
      f.u.addEventListener('input', () => {
        clearTimeout(nameTimer);
        const v = f.u.value.trim();
        if (!v) { nameState = null; setHint('uhint', t('hintUsername')); return; }
        if (!NAME_RE.test(v)) { nameState = 'invalid'; setHint('uhint', t('errUsername'), 'bad'); return; }
        nameState = 'checking'; setHint('uhint', t('checkingName'));
        nameTimer = setTimeout(async () => {
          const r = await api('/api/auth/available?username=' + encodeURIComponent(v));
          if (f.u.value.trim() !== v) return;
          nameState = r.available ? 'free' : 'taken';
          setHint('uhint', r.available ? '✓ ' + t('nameFree') : t('errTaken'), r.available ? 'ok' : 'bad');
        }, 350);
      });
      const meter = f.querySelector('.pw-meter');
      const pwCheck = () => {
        const p = f.p.value;
        const sc = pwScore(p, f.u.value);
        meter.dataset.level = p ? sc : 0;
        if (!p) setHint('phint', t('hintPassword'));
        else if (p.length < 6) setHint('phint', t('pwShort', { n: 6 - p.length }), 'bad');
        else setHint('phint', `${t('pwStrength')}: ${t(['pwWeak', 'pwWeak', 'pwFair', 'pwGood', 'pwStrong'][sc])}${sc < 3 ? ' — ' + t('pwTip') : ''}`, sc >= 3 ? 'ok' : sc === 2 ? '' : 'bad');
        if (f.p2.value) setHint('p2hint', f.p2.value === p ? '✓ ' + t('pwMatch') : t('pwMismatch'), f.p2.value === p ? 'ok' : 'bad');
      };
      f.p.addEventListener('input', pwCheck); f.p2.addEventListener('input', pwCheck);
    }
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = f.u.value.trim(), p = f.p.value;
      const err = root.querySelector('.err');
      const fail = (key) => { err.hidden = false; err.textContent = t(key); };
      err.hidden = true;
      if (reg) {
        if (!NAME_RE.test(u)) return fail('errUsername');
        if (nameState === 'taken') return fail('errTaken');
        if (p.length < 6) return fail('errPassword');
        if (p !== f.p2.value) return fail('pwMismatch');
      } else if (!u || !p) return fail('errCredentials');
      const btn = f.querySelector('button.primary'); btn.disabled = true;
      const r = await login(u, p, reg);
      btn.disabled = false;
      if (r.ok) { go(params.next ? decodeURIComponent(params.next) : '#/profile'); return; }
      fail({ username: 'errUsername', password: 'errPassword', taken: 'errTaken', credentials: 'errCredentials', rate: 'errRate' }[r.error] || 'errServer');
      if (r.error === 'taken') setHint('uhint', t('errTaken'), 'bad');
    });
  };
  draw();
}

// ——— Profile ———
const modeName = (m) => {
  if (!m) return '';
  const [a, b] = m.split('-');
  if (a === 'bot' || a === 'atlas') return `${a === 'atlas' ? t('modeAtlas') : t('modeBot')} · ${t(b)}`;
  if (m === 'duel') return t('modeDuel');
  if (m === 'journey') return t('journeyTitle');
  if (m === 'team-bot') return t('modeTeam');
  if (a === 'online') return `${t('online')} ${b === '2v2' ? '2×2' : '1×1'}`;
  if (a === 'challenge') { const c = CHALLENGES.find((x) => m === 'challenge-' + x.id); return `${t('training')} · ${c ? t(c.title) : ''}`; }
  return m;
};

export async function profileScreen(root) {
  const user = currentUser();
  root.innerHTML = `<section class="page"><p class="muted">…</p></section>`;
  let summary, pays = [];
  if (user) { const me = await api('/api/me'); if (me.ok) { summary = me.summary; pays = me.payments || []; updateMe(me.user); } }
  const { matches, local } = await history();
  if (!summary) {
    const h = localHistory(); summary = { played: h.length, wins: h.filter((m) => m.result === 'win').length, bestStreak: 0 };
    let run = 0; for (const m of [...h].reverse()) { run = m.result === 'win' ? run + 1 : 0; summary.bestStreak = Math.max(summary.bestStreak, run); }
  }
  const u = currentUser();
  const progress = currentProgress();
  const winrate = summary.played ? Math.round((summary.wins / summary.played) * 100) : 0;
  root.innerHTML = `<section class="page">${backButton('#/', t('toHome'))}
    <div class="profile-head"><div class="avatar">${esc((u?.username || t('guest'))[0].toUpperCase())}</div>
      <div><h1>${esc(u?.username || t('localProfile'))} ${u?.pro ? '<span class="pro-badge">PRO</span>' : ''}</h1>
      <p class="muted">${u ? `${t('rating')}: <b>${u.rating}</b>` : t('localProfileText')}</p></div>
      ${u ? `<button class="btn ghost" id="logout">${t('logout')}</button>` : `<a class="btn primary" href="#/login">${t('login')}</a>`}</div>
    <div class="tiles big">
      <div><b>${summary.played}</b><small>${t('played')}</small></div><div><b>${summary.wins}</b><small>${t('wins')}</small></div>
      <div><b>${winrate}%</b><small>${t('winrate')}</small></div><div><b>${summary.bestStreak}</b><small>${t('bestStreak')}</small></div>
      <div><b>${Object.values(progress).filter((p) => p.done).length}/${CHALLENGES.length}</b><small>${t('training')}</small></div>
    </div>
    <div class="card"><div class="field-label">${t('history')} ${local ? `<span class="muted">· ${t('savedLocal')}</span>` : ''}</div>
      ${matches.length ? `<div class="tbl-wrap"><table class="tbl hist"><thead><tr><th>${t('date')}</th><th>${t('mode')}</th><th>${t('opponent')}</th><th>${t('result')}</th><th>${t('duration')}</th><th>${t('statBursts')} / ${t('statPerfect')}</th></tr></thead><tbody>
      ${matches.map((m) => `<tr class="r-${m.result}"><td>${fmtDate(m.createdAt)}</td><td>${esc(modeName(m.mode))}${m.verified ? ` <span class="tag">✓ ${t('verified')}</span>` : ''}</td><td>${esc(m.opponent || '')}</td>
        <td><b>${m.result === 'win' ? t('win') : m.result === 'loss' ? t('lose') : t('draw')}</b>${m.ratingDelta != null ? ` <small>${m.ratingDelta >= 0 ? '+' : ''}${m.ratingDelta}</small>` : ''}</td>
        <td>${Math.round((m.durationMs || 0) / 1000)} s</td><td>${m.stats?.bursts ?? 0} / ${m.stats?.perfect ?? 0}</td></tr>`).join('')}</tbody></table></div>` : `<p class="muted">${t('noHistory')}</p>`}
    </div>
    ${cosmeticsMarkup(u)}
    ${u ? billingMarkup(u, pays) : ''}
    ${u ? `<div class="card danger-zone"><div class="field-label">${t('accountTitle')}</div><p class="muted small">${t('deleteText')}</p><button class="btn ghost" id="del-acc">🗑 ${t('deleteAccount')}</button></div>` : ''}
  </section>`;
  root.querySelector('#logout')?.addEventListener('click', () => { logout(); go('#/'); });
  bindCosmetics(root);
  bindTestExpire(root, () => profileScreen(root));
  root.querySelector('#del-acc')?.addEventListener('click', async () => {
    if (!(await confirmDialog({ title: t('deleteAccount'), text: t('deleteConfirm'), ok: t('deleteYes'), cancel: t('cancel'), danger: true }))) return;
    const r = await api('/api/me', { method: 'DELETE' });
    if (r.ok) { logout(); notify(t('deleted')); go('#/'); }
  });
}

// Status block inside the plan card (instead of a bare "✓ Active")
function planStateBlock(u, id, mine) {
  if (!mine) return `<span class="plan-state ok">✓ ${t('includedInOrg')}</span>`;
  if (u.subStatus === 'cancelled') return `<div class="plan-state warn">⏳ ${t('stCancelled')}<small>${t('proWorksUntil', { date: fmtDate(u.proUntil, false) })}</small></div>
    <button class="btn primary wide" data-resume>${t('resumePro')}</button>`;
  if (id === 'org') return `<div class="plan-state ok">✓ ${t('stActive')}<small>${t('proWorksUntil', { date: fmtDate(u.proUntil, false) })}</small></div>`;
  return `<div class="plan-state ok">✓ ${t('stActive')}<small>${t('renewsOn', { date: fmtDate(u.nextChargeAt, false) })}</small></div>
    <button class="btn ghost wide" data-cancel-sub>${t('cancelPro')}</button>`;
}

// One line that says exactly what happens with the subscription next
function subStatusLine(u) {
  if (!u.pro) return '';
  if (u.proPlan === 'player' && u.subStatus === 'active') return `<p class="sub-line ok">🔄 ${t('subRenews', { date: fmtDate(u.nextChargeAt, false) })}</p>`;
  if (u.proPlan === 'player' && u.subStatus === 'cancelled') return `<p class="sub-line warn">⏳ ${t('subCancelled', { date: fmtDate(u.proUntil, false) })}</p>`;
  return `<p class="sub-line">📅 ${t('subOneOff', { date: fmtDate(u.proUntil, false) })}</p>`;
}

// TEST MODE: jump to the end of a period that will not renew and watch Pro switch off
function testExpireBtn(u) {
  return u?.pro && (u.subStatus === 'cancelled' || u.proPlan === 'org') ? `<button class="btn ghost test-ff" data-test-expire>⏩ ${t('testExpire')}</button>` : '';
}
function bindTestExpire(root, redraw) {
  root.querySelectorAll('[data-test-expire]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog({ title: t('testExpire'), text: t('testExpireText'), ok: t('testExpireYes'), cancel: t('cancel') }))) return;
    const r = await api('/api/pro/test-expire', { method: 'POST' });
    if (r.ok) { updateMe(r.user); notify(t('proExpired')); redraw(); }
  }));
}

// Pro status, next charge and payment history (test mode)
function billingMarkup(u, pays) {
  const plan = u.pro ? t(u.proPlan === 'org' ? 'planOrg' : 'planPlayer') : 'Free';
  const statusText = { succeeded: t('paySucceeded'), declined: t('payDeclinedShort'), failed: t('payFailed'), requires_action: t('payPending') };
  const rows = pays.map((p) => `<tr class="pay-${p.status}"><td>${fmtDate(p.created_at)}</td><td>${esc(t(p.plan === 'org' ? 'planOrg' : 'planPlayer'))}</td>
    <td>${(p.amount || 0).toLocaleString('ru-RU').replace(/\u00a0/g, ' ')} ₸</td><td>${p.brand ? `${esc(p.brand)} •••• ${esc(p.last4 || '')}` : '—'}</td>
    <td><span class="pay-st">${statusText[p.status] || esc(p.status)}</span></td></tr>`).join('');
  return `<div class="card billing"><div class="field-label">${t('billingTitle')} <span class="test-flag small-flag">${t('testMode')}</span></div>
    <div class="bill-top">
      <div><small>${t('currentPlan')}</small><b>${plan}${u.pro ? ' <span class="pro-badge">PRO</span>' : ''}</b></div>
      <div><small>${t('status')}</small><b class="st-${u.subStatus}">${t({ active: 'stActive', cancelled: 'stCancelled', expired: 'stExpired', none: 'stNone' }[u.subStatus] || 'stNone')}</b></div>
      ${u.pro ? `<div><small>${t('activeSince')}</small><b>${fmtDate(u.proSince)}</b></div>` : ''}
      ${u.pro ? `<div><small>${u.nextChargeAt ? t('nextCharge') : t('activeUntil')}</small><b>${u.nextChargeAt ? `${fmtDate(u.nextChargeAt, false)} · 990 ₸` : fmtDate(u.proUntil, false)}</b></div>` : ''}
      <div class="bill-act">${u.pro ? `<a class="btn ghost" href="#/pro?to=plans">${t('managePlan')}</a>` : `<a class="btn primary" href="#/pro?to=plans">🔓 TARTYS Pro</a>`}</div>
    </div>
    ${u.pro ? subStatusLine(u) : u.subStatus === 'expired' ? `<p class="sub-line">⌛ ${t('subExpiredLine')}</p>` : ''}
    ${testExpireBtn(u)}
    ${pays.length ? `<div class="tbl-wrap"><table class="tbl bill"><thead><tr><th>${t('date')}</th><th>${t('rcPlan')}</th><th>${t('rcSum')}</th><th>${t('rcCard')}</th><th>${t('status')}</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<p class="muted">${t('noPayments')}</p>`}
  </div>`;
}

// ——— Cosmetics (profile): rope, outfit, arena — previews use the real renderer ———
// Outfit and rope previews are a 2-slide show: the whole scene, then a close-up of the item.
const previewMarkup = (kind, id) => (kind === 'arena'
  ? `<canvas data-prev="${kind}:${id}"></canvas>`
  : `<div class="slides" data-slides><canvas data-prev="${kind}:${id}"></canvas><canvas data-prev="${kind}:${id}" data-zoom="${kind}"></canvas>
      <span class="slide-nav" data-flip role="button" tabindex="0" aria-label="${t('slidesHint')}">🔍 <span>${t('closeUp')}</span></span>
      <div class="dots"><i></i><i></i></div></div>`);

// "Coming soon" cards: greyed-out, not clickable, national theme. They fill the grid rows so there are no empty holes.
const SOON = {
  outfit: [
    { icon: '🌷', ru: 'Наурыз: праздничный камзол', kk: 'Наурыз: мерекелік камзол', en: 'Nauryz festive camisole' },
    { icon: '🛡', ru: 'Батыр: доспехи и дулыға', kk: 'Батыр: сауыт пен дулыға', en: 'Batyr armour & helmet' },
    { icon: '👑', ru: 'Саукеле и камзол', kk: 'Сәукеле мен камзол', en: 'Saukele & camisole' },
    { icon: '🪕', ru: 'Айтыс: наряд акына', kk: 'Айтыс: ақын киімі', en: 'Aitys: akyn outfit' }
  ],
  arena: [
    { icon: '🛖', ru: 'Наурыз: аул и юрты', kk: 'Наурыз: ауыл мен киіз үй', en: 'Nauryz: yurt village' },
    { icon: '🏜', ru: 'Чарынский каньон', kk: 'Шарын шатқалы', en: 'Charyn Canyon' },
    { icon: '🏞', ru: 'Озёра Кольсай', kk: 'Көлсай көлдері', en: 'Kolsai Lakes' },
    { icon: '🌲', ru: 'Бурабай', kk: 'Бурабай', en: 'Burabay' }
  ],
  rope: [
    { icon: '🎉', ru: 'Наурыз: цветная тесьма', kk: 'Наурыз: түрлі-түсті бау', en: 'Nauryz ribbon' },
    { icon: '🧶', ru: 'Алаша: тканый узор', kk: 'Алаша: тоқыма өрнек', en: 'Alasha weave' },
    { icon: '🐎', ru: 'Аркан из конского волоса', kk: 'Қыл арқан', en: 'Horsehair lasso' },
    { icon: '☀', ru: 'Шанырак', kk: 'Шаңырақ', en: 'Shanyrak' }
  ]
};
const COLS = 4; // desktop columns; mobile uses 2 — both divide 8/4 evenly
// fillRow: pad the last row; fullRow: always add one whole row (Pro shop shows what is coming next).
const soonCards = (kind, n, tag, fullRow = false) => SOON[kind].slice(0, fullRow ? COLS : (COLS - (n % COLS)) % COLS).map((x) =>
  `<${tag} class="soon" aria-disabled="true"><div class="soon-pic"><b>${x.icon}</b></div><span>${esc(x[lang()] || x.ru)}</span><em>${t('comingSoon')}</em></${tag}>`).join('');

function cosmeticsMarkup(u) {
  const cur = { rope: u?.skin || 'classic', outfit: u?.settings?.outfit || 'team', arena: u?.settings?.arena || 'steppe' };
  const group = (kind, title, cat) => `<div class="cos-group"><h3 class="shop-title small">${{ outfit: '👕', arena: '🏟', rope: '🪢' }[kind]} ${title}</h3><div class="cos-grid">${Object.entries(cat).map(([k, item]) => {
    const locked = item.pro && !u?.pro;
    return `<button class="cos ${cur[kind] === k ? 'on' : ''} ${locked ? 'locked' : ''}" data-kind="${kind}" data-id="${k}" ${!u ? 'disabled' : ''}>
      ${previewMarkup(kind, k)}<span>${t(kind + '_' + k)}</span>${item.pro ? `<em>${locked ? '🔒 ' : ''}Pro</em>` : ''}</button>`;
  }).join('')}${soonCards(kind, Object.keys(cat).length, 'div')}</div></div>`;
  return `<div class="card cosmetics">
    ${group('outfit', t('outfitsTitle'), OUTFITS)}
    ${group('arena', t('arenasTitle'), ARENAS)}
    ${group('rope', t('skins'), ROPES)}
    ${!u ? `<p class="muted">${t('needLogin')}</p>` : !u.pro ? `<a class="btn primary" href="#/pro">🔓 TARTYS Pro</a>` : ''}
  </div>`;
}

function drawPreviews(root, u) {
  root.querySelectorAll('canvas[data-prev]').forEach((c) => {
    const [kind, id] = c.dataset.prev.split(':');
    const opt = { theme: u?.settings?.arena && kind !== 'arena' ? 'steppe' : 'steppe', outfit: 'team', skin: 'classic' };
    if (kind === 'arena') opt.theme = id; if (kind === 'outfit') opt.outfit = id; if (kind === 'rope') opt.skin = id;
    if (c.dataset.zoom) opt.zoom = c.dataset.zoom;
    renderPreview(c, opt);
  });
  // Slides change ONLY when the player asks: the 🔍 button (or a tap on the picture in the shop) flips scene ↔ close-up.
  root.querySelectorAll('[data-slides]').forEach((el) => {
    const flip = (e) => { e.stopPropagation(); e.preventDefault(); el.classList.toggle('second'); el.querySelector('[data-flip] span').textContent = el.classList.contains('second') ? t('wholeScene') : t('closeUp'); };
    const btn = el.querySelector('[data-flip]'); if (!btn) return;
    btn.addEventListener('click', flip);
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') flip(e); });
    if (el.closest('.showcase')) el.addEventListener('click', flip);
  });
}

function bindCosmetics(root) {
  drawPreviews(root, currentUser());
  root.querySelectorAll('.cos[data-kind]').forEach((b) => b.addEventListener('click', async () => {
    if (b.classList.contains('locked')) { go('#/pro'); return; }
    const { kind, id } = b.dataset;
    const body = kind === 'rope' ? { skin: id } : { settings: { [kind]: id } };
    const r = await api('/api/me', { method: 'PUT', body });
    if (r.ok) { updateMe(r.user); root.querySelectorAll(`.cos[data-kind="${kind}"]`).forEach((x) => x.classList.toggle('on', x === b)); notify('✓ ' + t(kind + '_' + id)); }
    else if (r.status === 403) go('#/pro');
  }));
}

// ——— Leaderboard ———
export async function topScreen(root) {
  root.innerHTML = `<section class="page narrow">${backButton('#/', t('toHome'))}<h1>${t('top')}</h1><p class="lead">${t('topText')}</p><div class="card"><p class="muted">…</p></div></section>`;
  const r = await api('/api/leaderboard');
  const me = currentUser()?.username;
  root.querySelector('.card').innerHTML = r.rows?.length ? `<table class="tbl top"><thead><tr><th>#</th><th>${t('player')}</th><th>${t('rating')}</th><th>${t('onlineGames')}</th><th>${t('wins')}</th><th>${t('played')}</th></tr></thead><tbody>
    ${r.rows.map((x, i) => `<tr class="${x.username === me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(x.username)} ${x.pro ? '<span class="pro-badge">PRO</span>' : ''}</td><td>${x.online ? `<b>${x.rating}</b>` : '<span class="muted" title="' + t('noRatingYet') + '">—</span>'}</td><td>${x.online}</td><td>${x.wins}</td><td>${x.played}</td></tr>`).join('')}</tbody></table>`
    : `<p class="muted">${t('noHistory')}</p>`;
}

// ——— Pro / monetisation demo ———
const PLAN_INFO = { player: { amount: 990, period: 'perMonth' }, org: { amount: 4990, period: 'perEvent' } };
const fmtKzt = (n) => n.toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₸';

export function proScreen(root, params = {}) {
  const u = currentUser();
  const plan = (id, featured) => {
    const mine = u?.pro && u.proPlan === id;
    const active = u?.pro && (mine || (id === 'player' && u.proPlan === 'org'));
    return `<article class="plan ${featured ? 'featured' : ''}"><h2>${t(id === 'org' ? 'planOrg' : 'planPlayer')}</h2>
      <p class="price">${fmtKzt(PLAN_INFO[id].amount)} <small>${t(PLAN_INFO[id].period)}</small></p>
      <ul>${t(id === 'org' ? 'planOrgList' : 'planPlayerList').split('|').map((x) => `<li>${x}</li>`).join('')}</ul>
      ${active ? planStateBlock(u, id, mine) : `<button class="btn primary wide" data-plan="${id}">${t('buy')}</button>`}</article>`;
  };
  const showcase = (kind, cat) => Object.entries(cat).filter(([, v]) => v.pro).map(([k]) => `<figure>${previewMarkup(kind, k)}<figcaption>${t(kind + '_' + k)}</figcaption></figure>`).join('')
    + soonCards(kind, Object.values(cat).filter((v) => v.pro).length, 'figure', true);
  root.innerHTML = `<section class="page">${backButton('#/', t('back'), 'prev')}
    <span class="test-flag">${t('testMode')}</span>
    <h1>${t('proTitle')}</h1><p class="lead">${t('proText')}</p>
    <div class="card shop"><h2 class="shop-title">🏟 ${t('arenasTitle')} <span class="pro-badge">PRO</span></h2><div class="showcase">${showcase('arena', ARENAS)}</div>
      <h2 class="shop-title">👕 ${t('outfitsTitle')} <span class="pro-badge">PRO</span></h2><div class="showcase">${showcase('outfit', OUTFITS)}</div>
      <h2 class="shop-title">🪢 ${t('skins')} <span class="pro-badge">PRO</span></h2><div class="showcase">${showcase('rope', ROPES)}</div></div>
    <div class="plans" id="plans">
      <article class="plan"><h2>Free</h2><p class="price">0 ₸</p><ul>${t('planFreeList').split('|').map((x) => `<li>${x}</li>`).join('')}</ul><span class="btn ghost wide disabled">✓</span></article>
      ${plan('player')}${plan('org', true)}
    </div>
    ${u?.pro ? `<div class="card unlocked"><div class="field-label">${t('proUnlocked')}</div>
      ${subStatusLine(u)}
      <div class="row"><a class="btn" href="#/profile">${t('proGoSkins')}</a><a class="btn" href="#/online">${t('proGoRoom')}</a>
      ${testExpireBtn(u)}</div></div>` : ''}
    <div class="card"><div class="field-label">${t('whyFree')}</div><ul class="why">${t('whyList').split('|').map((x) => `<li>${x}</li>`).join('')}</ul></div>
    <dialog id="pay" class="pay-dialog"></dialog></section>`;
  drawPreviews(root, u);
  root.querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', () => {
    if (!currentUser()) { go('#/login?next=' + encodeURIComponent('#/pro')); return; }
    openCheckout(root.querySelector('#pay'), b.dataset.plan, () => proScreen(root));
  }));
  root.querySelectorAll('#cancel, [data-cancel-sub]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog({ title: t('cancelPro'), text: t('cancelConfirm', { date: fmtDate(currentUser().nextChargeAt, false) }), ok: t('cancelYes'), cancel: t('keepSub'), danger: true }))) return;
    const r = await api('/api/pro/cancel', { method: 'POST' }); if (r.ok) { updateMe(r.user); notify(t('cancelDone', { date: fmtDate(r.user.proUntil, false) })); proScreen(root, params); }
  }));
  root.querySelectorAll('#resume, [data-resume]').forEach((b) => b.addEventListener('click', async () => { const r = await api('/api/pro/resume', { method: 'POST' }); if (r.ok) { updateMe(r.user); notify(t('resumeDone')); proScreen(root, params); } }));
  bindTestExpire(root, () => proScreen(root, params));
  if (params.to === 'plans') setTimeout(() => { const el = root.querySelector('#plans'); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); el?.classList.add('flash'); }, 60);
}

// Checkout wizard: card form → "connecting to the bank" → 3-D Secure SMS code → "checking" → receipt.
function openCheckout(dlg, planId, onDone) {
  const info = PLAN_INFO[planId];
  const title = t(planId === 'org' ? 'planOrg' : 'planPlayer');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const luhn = (num) => { let sum = 0; for (let i = 0; i < num.length; i++) { let d = +num[num.length - 1 - i]; if (i % 2) { d *= 2; if (d > 9) d -= 9; } sum += d; } return sum % 10 === 0; };
  const brand = (num) => (/^4/.test(num) ? 'VISA' : /^(5[1-5]|2[2-7])/.test(num) ? 'Mastercard' : '');
  let payment = null, otpTimer = 0, busy = false; // busy: talking to the "bank" — the window must stay open
  const head = `<div class="pay-head"><div><span class="test-flag">${t('testMode')}</span><h2>${title}</h2><p class="muted">TARTYS Pay · ${t('secure')} 🔒</p></div><div class="pay-sum">${fmtKzt(info.amount)}<small>${t(info.period)}</small></div></div>`;
  const close = () => { if (busy) return; clearInterval(otpTimer); dlg.close(); };

  const stepForm = (err = '') => {
    busy = false;
    dlg.innerHTML = `<form class="pay-form" novalidate>${head}
      <details class="test-cards" open><summary>${t('testCardsTitle')}</summary>
        <dl class="tc-list">
          <dt>✅ ${t('tcOk')}</dt><dd><span class="cardno">4242 4242 4242 4242</span> Visa<br><span class="cardno">5555 5555 5555 4444</span> Mastercard</dd>
          <dt>💸 ${t('tcFunds')}</dt><dd><span class="cardno">4000 0000 0000 0002</span></dd>
          <dt>🔒 ${t('tcBlocked')}</dt><dd><span class="cardno">4000 0000 0000 9995</span></dd>
        </dl><p class="tc-note">${t('tcNote')}</p></details>
      <label>${t('cardNumber')}<div class="card-input"><input name="num" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0000" maxlength="19"><span class="brand"></span></div><small class="ferr" data-f="num"></small></label>
      <div class="row"><label>${t('cardExp')}<input name="exp" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/YY" maxlength="5"><small class="ferr" data-f="exp"></small></label>
        <label>${t('cardCvc')}<input name="cvc" inputmode="numeric" autocomplete="cc-csc" placeholder="•••" maxlength="3" type="password"><small class="ferr" data-f="cvc"></small></label></div>
      <label>${t('cardName')}<input name="name" autocomplete="cc-name" placeholder="DANILA AFANASYEV" maxlength="26" autocapitalize="characters" spellcheck="false"><small class="fhint">${t('cardNameHint')}</small><small class="ferr" data-f="name"></small></label>
      <p class="err" ${err ? '' : 'hidden'}>${err}</p>
      <button class="btn primary wide" type="submit">${t('payAmount', { sum: fmtKzt(info.amount) })}</button>
      <button class="btn ghost wide" type="button" data-cancel>${t('cancel')}</button>
      <p class="muted small center">${t('payFootnote')}</p></form>`;
    const f = dlg.querySelector('form');
    const num = f.num, exp = f.exp;
    const now = new Date(), yy = now.getFullYear() % 100, mm = now.getMonth() + 1;
    // Field rules — the same checks run again on the server.
    const rules = {
      num: (v) => { const d = v.replace(/\D/g, ''); return d.length < 16 ? t('errCardShort') : !luhn(d) ? t('errCardNumber') : ''; },
      exp: (v) => {
        const m = /^(\d{2})\/(\d{2})$/.exec(v);
        if (!m) return t('errExpFormat');
        const month = +m[1], year = +m[2];
        if (month < 1 || month > 12) return t('errExpMonth');
        if (year < yy || (year === yy && month < mm)) return t('errExpPast');
        if (year > yy + 15) return t('errExpFar');
        return '';
      },
      cvc: (v) => (/^\d{3}$/.test(v) ? '' : t('errCardCvc')),
      name: (v) => {
        const words = v.trim().split(/[ -]+/).filter(Boolean);
        if (!words.length) return t('errCardName');
        if (words.length === 1) return t('errNoSurname');
        if (words.some((w) => w.length < 2)) return t('errCardName');
        return '';
      }
    };
    const touched = {};
    // Message under the field explains WHAT is wrong; the border turns green only once the field is complete and valid.
    const check = (field, forced) => {
      const el = f[field]; const msg = forced || rules[field](el.value);
      const box = f.querySelector(`.ferr[data-f="${field}"]`);
      const show = touched[field] || !!forced;
      box.textContent = show ? msg : '';
      el.classList.toggle('good', !msg && touched[field]);
      return msg;
    };
    // Input masks: only digits where digits belong, month can never exceed 12, name in Latin capitals.
    num.addEventListener('input', () => {
      const d = num.value.replace(/\D/g, '').slice(0, 16);
      num.value = d.replace(/(\d{4})(?=\d)/g, '$1 ');
      f.querySelector('.brand').textContent = brand(d);
      if (d.length === 16) touched.num = true;
      check('num');
    });
    exp.addEventListener('input', (e) => {
      let d = exp.value.replace(/\D/g, '').slice(0, 4);
      let blocked = '';
      if (d.length >= 1 && +d[0] > 1) d = '0' + d;               // "5" → "05"
      if (d.length >= 2 && +d.slice(0, 2) > 12) { blocked = t('errMonth13'); d = d[0]; }   // month 13+ cannot be typed — and we say why
      else if (d.length >= 2 && d.slice(0, 2) === '00') { blocked = t('errMonth00'); d = d[0]; }
      d = d.slice(0, 4);
      exp.value = d.length > 2 || (d.length === 2 && e.inputType !== 'deleteContentBackward') ? d.slice(0, 2) + '/' + d.slice(2) : d;
      if (d.length === 4) touched.exp = true;
      check('exp', blocked);
    });
    f.cvc.addEventListener('input', () => { f.cvc.value = f.cvc.value.replace(/\D/g, '').slice(0, 3); if (f.cvc.value.length === 3) touched.cvc = true; check('cvc'); });
    f.name.addEventListener('input', () => {
      const raw = f.name.value.toUpperCase();
      const clean = raw.replace(/[^A-Z -]/g, '').replace(/\s{2,}/g, ' ').replace(/^\s+/, '');
      const hint = f.querySelector('.fhint');
      hint.classList.toggle('warn', clean !== raw); // Cyrillic or digits were typed
      hint.textContent = clean !== raw ? t('cardNameLatin') : t('cardNameHint');
      if (clean.trim().split(/[ -]+/).filter(Boolean).length >= 2 && /[A-Z]{2}$/.test(clean)) touched.name = true;
      f.name.value = clean;
      check('name');
    });
    ['num', 'exp', 'cvc', 'name'].forEach((k) => f[k].addEventListener('blur', () => { if (f[k].value) { touched[k] = true; check(k); } }));
    f.querySelector('[data-cancel]').addEventListener('click', close);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fields = ['num', 'exp', 'cvc', 'name'];
      fields.forEach((k) => { touched[k] = true; });
      const bad = fields.filter((k) => check(k));
      if (bad.length) { f[bad[0]].focus(); return; }
      const d = num.value.replace(/\D/g, '');
      const card = { number: d, exp: exp.value, cvc: f.cvc.value, name: f.name.value.trim() };
      stepWait(t('payConnecting'));
      const [r] = await Promise.all([api('/api/pro/checkout', { method: 'POST', body: { plan: planId, card } }), wait(1800)]);
      if (r.ok) { payment = r; stepOtp(); return; }
      const map = { insufficient: 'payInsufficient', blocked: 'payBlocked', 'test-only': 'payTestOnly', 'card-number': 'errCardNumber', 'card-exp': 'errExpMonth', 'card-cvc': 'errCardCvc', 'card-name': 'errCardName' };
      stepForm(t(map[r.error] || 'errServer'));
    });
    if (!dlg.open) dlg.showModal();
    num.focus();
  };

  const stepWait = (text) => {
    busy = true;
    dlg.innerHTML = `<div class="pay-form">${head}<div class="pay-wait"><span class="spinner"></span><p>${text}</p><small class="muted">${t('payDontClose')}</small></div></div>`;
  };

  const stepOtp = (err = '') => {
    busy = false;
    let left = 30;
    dlg.innerHTML = `<form class="pay-form" novalidate>${head}
      <div class="otp-bank"><b>3-D Secure</b><span>${payment.brand} •••• ${payment.last4}</span></div>
      <p>${t('otpText', { phone: payment.phone })}</p>
      <p class="test-hint">${t('otpTestHint')}</p>
      <input name="code" class="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••">
      <p class="err" ${err ? '' : 'hidden'}>${err}</p>
      <button class="btn primary wide" type="submit">${t('confirm')}</button>
      <p class="muted small center" id="resend">${t('otpResend', { s: left })}</p>
      <button class="btn ghost wide" type="button" data-cancel>${t('cancel')}</button></form>`;
    const f = dlg.querySelector('form');
    clearInterval(otpTimer);
    otpTimer = setInterval(() => { left--; const el = dlg.querySelector('#resend'); if (!el) return; el.innerHTML = left > 0 ? t('otpResend', { s: left }) : `<a href="#" id="again">${t('otpAgain')}</a>`;
      if (left <= 0) { clearInterval(otpTimer); el.querySelector('#again').addEventListener('click', (e) => { e.preventDefault(); stepOtp(); }); } }, 1000);
    f.code.addEventListener('input', () => { f.code.value = f.code.value.replace(/\D/g, '').slice(0, 6); });
    f.querySelector('[data-cancel]').addEventListener('click', close);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (f.code.value.length !== 6) { stepOtp(t('otpShort')); return; }
      clearInterval(otpTimer);
      stepWait(t('payChecking'));
      const [r] = await Promise.all([api('/api/pro/confirm', { method: 'POST', body: { paymentId: payment.paymentId, code: f.code.value } }), wait(1600)]);
      if (r.ok) { updateMe(r.user); stepDone(r.receipt); return; }
      if (r.error === 'otp') { stepOtp(t('otpWrong', { n: r.attemptsLeft })); return; }
      if (r.error === 'otp-locked') { stepForm(t('otpLocked')); return; }
      stepForm(t('errServer'));
    });
    f.code.focus();
  };

  const stepDone = (rc) => {
    busy = false;
    dlg.innerHTML = `<div class="pay-form">${head}<div class="pay-ok"><span>✓</span><h3>${t('payOk')}</h3></div>
      <table class="tbl receipt"><tbody>
        <tr><td>${t('rcOrder')}</td><td><b>${rc.id}</b></td></tr>
        <tr><td>${t('rcPlan')}</td><td>${title}</td></tr>
        <tr><td>${t('rcSum')}</td><td>${fmtKzt(rc.amount)}</td></tr>
        <tr><td>${t('rcCard')}</td><td>${rc.brand} •••• ${rc.last4}</td></tr>
        <tr><td>${t('rcDate')}</td><td>${fmtDate(rc.at)}</td></tr>
      </tbody></table>
      <p class="test-hint">${t('rcTest')}</p>
      <a class="btn primary wide" href="#/profile" data-go>${t('proGoSkins')}</a>
      <button class="btn ghost wide" data-close>${t('done')}</button></div>`;
    dlg.querySelector('[data-go]').addEventListener('click', close);
    dlg.querySelector('[data-close]').addEventListener('click', () => { close(); onDone(); });
    sfx.win();
  };

  // Esc or a click outside the window closes it (except while the "bank" is answering)
  dlg.oncancel = (e) => { e.preventDefault(); close(); };
  dlg.onclick = (e) => { if (e.target === dlg) close(); };
  stepForm();
}
