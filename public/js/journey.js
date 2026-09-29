// "Journey across Kazakhstan" map: SVG outline built from approximate border coordinates,
// a dashed road that grows city by city and a little van that drives to the next stop.
import { CITIES, JOURNEY_LEVEL } from '/shared/journey.js';
import { t, lang } from './i18n.js';
import { journeyUnlocked } from './local.js';
import { esc, backButton } from './ui.js';
import { sfx } from './audio.js';

const K = 16, LAT0 = 55.9, LON0 = 45.3;
const P = (lon, lat) => [+((lon - LON0) * K * 0.68).toFixed(1), +((LAT0 - lat) * K).toFixed(1)];
const path = (pts, close = true) => 'M' + pts.map(([lo, la]) => P(lo, la).join(',')).join('L') + (close ? 'Z' : '');

// Simplified border of Kazakhstan (lon, lat), clockwise from the Volga delta.
const BORDER = [[49.0, 46.4], [48.6, 47.4], [47.3, 47.7], [46.5, 48.4], [46.8, 49.4], [47.5, 50.4], [48.7, 50.6], [50.8, 51.6], [52.4, 51.5],
  [54.6, 51.0], [55.7, 50.6], [57.2, 51.1], [58.6, 51.1], [59.9, 50.6], [61.4, 50.8], [61.6, 51.9], [61.0, 52.4], [61.1, 53.4], [62.0, 54.0],
  [65.2, 54.6], [68.2, 55.0], [69.0, 55.4], [70.8, 55.2], [73.4, 53.9], [74.4, 53.6], [76.5, 54.2], [77.8, 53.3], [80.0, 50.8], [82.5, 50.8],
  [83.4, 51.0], [85.0, 50.0], [86.8, 49.1], [85.6, 48.4], [85.5, 47.1], [83.0, 47.2], [82.3, 45.5], [80.1, 45.1], [80.4, 44.0], [80.3, 42.9],
  [79.0, 42.8], [75.6, 42.8], [74.0, 43.2], [73.5, 42.5], [71.8, 42.8], [70.9, 42.3], [70.2, 41.5], [68.9, 40.7], [68.0, 41.0], [66.5, 42.0],
  [66.0, 42.9], [64.9, 43.7], [62.0, 43.5], [61.0, 44.4], [58.6, 45.6], [56.0, 45.0], [55.9, 41.3], [55.0, 41.3], [53.0, 42.1], [52.5, 42.8],
  [51.3, 43.2], [51.2, 43.7], [50.3, 44.5], [51.0, 45.1], [52.9, 45.3], [53.2, 46.6], [51.9, 47.05]];
const CASPIAN = [[44.8, 46.9], [49.0, 46.4], [51.9, 47.05], [53.2, 46.6], [52.9, 45.3], [51.0, 45.1], [50.3, 44.5], [51.2, 43.7], [51.3, 43.2],
  [52.5, 42.8], [53.0, 42.1], [53.3, 40.2], [44.8, 40.2]];
const ARAL = [[59.9, 46.6], [61.2, 46.9], [61.6, 46.3], [60.9, 45.9], [60.2, 46.0]];
const BALKHASH = [[73.4, 46.2], [74.6, 46.6], [76.4, 46.5], [78.2, 46.8], [79.2, 46.5], [78.0, 46.3], [76.2, 46.2], [74.5, 46.1]];

export function journeyScreen(root, params) {
  const L = lang();
  const unlocked = journeyUnlocked();           // number of cities beaten
  const current = Math.min(unlocked, CITIES.length - 1);
  const finished = unlocked >= CITIES.length;
  let travel = params.travel != null ? Number(params.travel) : null;
  if (!(travel >= 1 && travel <= Math.min(unlocked, CITIES.length - 1))) travel = null; // URL cannot fake a trip
  const pts = CITIES.map((c) => P(c.lon, c.lat));
  const W = Math.ceil((87.6 - LON0) * K * 0.68), H = Math.ceil((LAT0 - 40.2) * K);

  const seg = (i) => `M${pts[i - 1].join(',')}L${pts[i].join(',')}`;
  const roads = CITIES.slice(1).map((_, k) => {
    const i = k + 1;
    const done = i <= unlocked && i !== travel;
    const cls = done ? 'road done' : i === travel ? 'road hidden' : i === current + 1 || (i === current && !finished) ? 'road next' : 'road future';
    return `<path class="${cls}" d="${seg(i)}"/>`;
  }).join('');
  const cityDots = CITIES.map((c, i) => {
    const state = i < unlocked ? 'won' : i === current && !finished ? 'here' : i <= unlocked ? 'open' : 'locked';
    const [x, y] = pts[i];
    const anchor = ['aktau', 'atyrau', 'aralsk', 'baikonur', 'turkestan'].includes(c.id) ? 'end' : c.id === 'taraz' ? 'middle' : 'start';
    const dx = anchor === 'end' ? -9 : anchor === 'middle' ? 0 : 9;
    const dy = c.id === 'taraz' ? 16 : 4;
    return `<g class="city ${state}" data-i="${i}" transform="translate(${x},${y})" tabindex="${i <= unlocked ? 0 : -1}" role="button" aria-label="${esc(c.name[L])}">
      <circle r="${state === 'here' ? 7 : 5.5}"/>${state === 'won' ? '<path d="M-2.6,0 L-0.6,2.2 L3,-2.2" class="tick"/>' : ''}
      <text x="${dx}" y="${dy}" text-anchor="${anchor}">${esc(c.name[L])}</text></g>`;
  }).join('');

  const chips = CITIES.map((c, i) => `<button class="jchip ${i < unlocked ? 'won' : i === current && !finished ? 'here' : i > unlocked ? 'locked' : ''}" data-i="${i}" ${i > unlocked ? 'disabled' : ''}>
      <b>${i + 1}</b>${esc(c.name[L])}${i < unlocked ? ' ✓' : i > unlocked ? ' 🔒' : ''}</button>`).join('');

  root.innerHTML = `<section class="page journey">${backButton('#/', t('toHome'))}
    <div class="jhead"><div><span class="eyebrow">${t('journeyEyebrow')}</span><h1>${t('journeyTitle')}</h1><p class="lead">${t('journeyText')}</p></div>
      <div class="jprogress"><b>${Math.min(unlocked, CITIES.length)}</b><span>/ ${CITIES.length}</span><small>${t('journeyCities')}</small></div></div>
    <div class="jgrid">
      <div class="jmap card"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('journeyTitle')}">
        <path class="sea" d="${path(CASPIAN)}"/>
        <path class="land" d="${path(BORDER)}"/>
        <path class="sea" d="${path(ARAL)}"/><path class="sea" d="${path(BALKHASH)}"/>
        <g class="roads">${roads}</g>
        ${travel ? `<path id="trip" class="road done" d="${seg(travel)}" style="stroke-dasharray:0 9999"/>` : ''}
        <g class="cities">${cityDots}</g>
        <g id="van" class="van" style="opacity:${travel ? 1 : 0}"><rect x="-9" y="-6" width="18" height="10" rx="3"/><rect x="2" y="-4.5" width="5" height="4" rx="1" class="win"/><circle cx="-5" cy="4.5" r="2.4"/><circle cx="5" cy="4.5" r="2.4"/></g>
      </svg></div>
      <aside class="jcity card" id="jcity"></aside>
    </div>
    <div class="jchips">${chips}</div>
  </section>`;

  const panel = root.querySelector('#jcity');
  const showCity = (i, arrived = false) => {
    const c = CITIES[i];
    const won = i < unlocked;
    panel.innerHTML = `${arrived ? `<p class="arrived">🚐 ${t('welcomeTo', { city: esc(c.name[L]) })}</p>` : ''}
      <span class="eyebrow">${t('stop')} ${i + 1} / ${CITIES.length}</span>
      <h2>${esc(c.name[L])}</h2>
      <p class="sight">📍 ${esc(c.sight[L])}</p>
      <canvas class="jpreview" aria-hidden="true"></canvas>
      <p class="muted small">${t('journeyRival', { level: t(JOURNEY_LEVEL) })}</p>
      ${finished && i === CITIES.length - 1 && params.done ? `<p class="ch-verdict ok">🏁 ${t('journeyDone')}</p>` : ''}
      <a class="btn primary wide" href="#/play/journey?city=${i}">${won ? t('replayCity') : t('fightCity')} ▶</a>`;
    import('./render.js').then(({ renderPreview }) => renderPreview(panel.querySelector('.jpreview'), { theme: 'city-' + c.id }));
    root.querySelectorAll('.jchip').forEach((b) => b.classList.toggle('sel', Number(b.dataset.i) === i));
  };
  root.querySelectorAll('.jchip:not([disabled]), .city:not(.locked)').forEach((el) => {
    const open = () => showCity(Number(el.dataset.i));
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && open());
  });

  let raf = 0;
  if (travel) {
    // Drive the van along the new road while the dashes appear behind it.
    history.replaceState(null, '', '#/journey'); // a refresh will not replay the trip
    const trip = root.querySelector('#trip'), van = root.querySelector('#van');
    const len = trip.getTotalLength(); const dur = 2600; const t0 = performance.now();
    const [ax, ay] = pts[travel - 1], [bx, by] = pts[travel];
    const flip = bx < ax ? -1 : 1;
    showCity(travel - 1);
    panel.querySelector('.btn')?.classList.add('disabled');
    sfx.unlock();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur); const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const d = e * len;
      trip.style.strokeDasharray = `${Array.from({ length: Math.ceil(d / 9) }, () => '5 4').join(' ')} 0 9999`;
      const p = trip.getPointAtLength(d);
      van.setAttribute('transform', `translate(${p.x},${p.y - 7}) scale(${flip},1)`);
      if (k < 1) raf = requestAnimationFrame(step);
      else {
        trip.style.strokeDasharray = '';
        root.querySelector(`.city[data-i="${travel}"]`)?.classList.add('pop');
        van.style.opacity = 0.9;
        sfx.win();
        showCity(travel, true);
      }
    };
    raf = requestAnimationFrame(step);
  } else {
    showCity(finished && params.done ? CITIES.length - 1 : current);
    const [x, y] = pts[current]; const van = root.querySelector('#van');
    van.setAttribute('transform', `translate(${x},${y - 11})`); van.style.opacity = 1;
  }
  return () => cancelAnimationFrame(raf);
}
