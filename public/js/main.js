import { t, setLang, lang, LANGS } from './i18n.js';
import { settings, saveSettings } from './store.js';
import { restoreSession, currentUser, onAuth, refreshIfProEnded } from './api.js';
import { route, startRouter, render, currentPath, back, go } from './router.js';
import { runLocal } from './local.js';
import { onlineHome, roomScreen } from './online.js';
import { homeScreen, trainingScreen, rulesScreen, authScreen, profileScreen, topScreen, proScreen } from './screens.js';
import { esc } from './ui.js';
import { journeyScreen } from './journey.js';
import { privacyScreen } from './privacy.js';

const view = document.getElementById('view');
const header = document.getElementById('site-header');

function drawHeader() {
  const u = currentUser();
  const path = currentPath();
  const nav = [['#/', 'navPlay'], ['#/journey', 'navJourney'], ['#/training', 'navTrain'], ['#/online', 'navOnline'], ['#/top', 'navTop'], ['#/pro', 'navPro'], ['#/rules', 'navRules']];
  header.innerHTML = `<a class="logo" href="#/"><span class="logo-mark">T</span><span>TARTYS<small>тартыс · tug of war</small></span></a>
    <nav class="main-nav">${nav.map(([h, k]) => `<a href="${h}" class="${(h === '#/' ? path === '/' : path === h.slice(1) || path.startsWith(h.slice(1) + '?')) ? 'on' : ''}">${t(k)}</a>`).join('')}</nav>
    <div class="head-tools">
      <div class="langs">${LANGS.map(([c, l]) => `<button data-lang="${c}" class="${lang() === c ? 'on' : ''}">${l}</button>`).join('')}</div>
      <button class="icon-btn" id="snd" title="${t('sound')}">${settings().sound ? '🔊' : '🔇'}</button>
      <a class="user-chip" href="${u ? '#/profile' : '#/login'}">${u ? `${esc(u.username)}${u.pro ? ' <em>PRO</em>' : ''}` : t('login')}</a>
    </div>`;
  header.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => { setLang(b.dataset.lang); drawHeader(); drawFooter(); render(); }));
  header.querySelector('#snd').addEventListener('click', () => { saveSettings({ sound: !settings().sound }); drawHeader(); });
}

function page(fn) {
  return (ctx) => { document.body.classList.remove('in-match'); drawHeader(); refreshIfProEnded(); return fn(ctx); };
}
// A tab left open over the end of the paid period still loses Pro: check every minute and when the tab comes back.
setInterval(refreshIfProEnded, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshIfProEnded(); });
function match(fn) {
  return (ctx) => { document.body.classList.add('in-match'); drawHeader(); return fn(ctx); };
}

route(/^\/$/, page(() => homeScreen(view)));
route(/^\/journey$/, page(({ params }) => journeyScreen(view, params)));
route(/^\/play\/journey$/, match(({ params }) => runLocal(view, { kind: 'journey', city: params.city })));
route(/^\/play\/(bot|series|duel|team)$/, match(({ match: m, params }) => runLocal(view, { kind: m[1], level: params.level || settings().level, atlas: params.atlas === '1' })));
route(/^\/play\/challenge$/, match(({ params }) => runLocal(view, { challenge: params.id })));
route(/^\/tutorial$/, match(() => runLocal(view, { kind: 'tutorial' })));
route(/^\/training$/, page(() => trainingScreen(view)));
route(/^\/online$/, page(() => onlineHome(view)));
route(/^\/room\/([A-Z0-9]{5})$/i, match(({ match: m, params }) => roomScreen(view, m[1].toUpperCase(), { watch: params.watch === '1' })));
route(/^\/rules$/, page(() => rulesScreen(view)));
route(/^\/login$/, page(({ params }) => authScreen(view, params)));
route(/^\/profile$/, page(() => { profileScreen(view); }));
route(/^\/top$/, page(() => { topScreen(view); }));
route(/^\/pro$/, page(({ params }) => proScreen(view, params)));
route(/^\/privacy$/, page(() => privacyScreen(view)));

// Every "← Back" button in the app goes through the in-app history
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-back]'); if (!b) return;
  e.preventDefault();
  if (b.dataset.mode === 'prev') back(b.dataset.back || '#/'); else go(b.dataset.back || '#/');
});
document.documentElement.lang = lang();
const AUTHOR = 'Danila Afanasyev', CONTACT = 'danila.afanasev@narxoz.kz';
const FOOT_LBL = { ru: ['Автор', 'Контакт'], kk: ['Автор', 'Байланыс'], en: ['Author', 'Contact'] };
const drawFooter = () => { const [a, c] = FOOT_LBL[lang()] || FOOT_LBL.ru; document.getElementById('foot').innerHTML = `<div>${esc(t('footer'))} · <a href="#/privacy">${esc(t('privacy'))}</a> · <a href="#/rules">${esc(t('navRules'))}</a></div>
  <div class="foot-author">${a}: <b>${AUTHOR}</b> · ${c}: <a href="mailto:${CONTACT}">${CONTACT}</a></div>`; };
drawFooter();
let wasPro = null;
onAuth((u) => {
  drawHeader();
  if (wasPro && u && !u.pro) { import('./ui.js').then(({ notify }) => notify(t('proExpired'))); if (!document.body.classList.contains('in-match')) render(); }
  wasPro = u ? u.pro : null;
});
restoreSession().finally(() => startRouter());
