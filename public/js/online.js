// Online rooms: lobby, server-driven match view, spectators, reconnects.
import { MatchView, resultMarkup, tipFor } from './match-view.js';
import { t } from './i18n.js';
import { sfx } from './audio.js';
import { settings, saveSettings, clientId, token, pushLocalHistory } from './store.js';
import { currentUser } from './api.js';
import { esc, notify, backButton, confirmDialog } from './ui.js';
import { ARENAS } from '/shared/cosmetics.js';
import { go } from './router.js';

function connect() {
  // eslint-disable-next-line no-undef
  return io({ auth: { token: token(), clientId: clientId(), name: settings().name || currentUser()?.username || t('guest') }, transports: ['websocket', 'polling'] });
}

export function onlineHome(root) {
  const user = currentUser();
  const org = user?.pro && user.proPlan === 'org';
  const pro = !!user?.pro;
  root.innerHTML = `<section class="page narrow">${backButton('#/', t('toHome'))}
    <h1>${t('online')}</h1><p class="lead">${t('onlineText')}</p>
    <div class="card form-card">
      ${user ? '' : `<label>${t('yourName')}<input id="nm" maxlength="20" value="${esc(settings().name)}" placeholder="${t('guest')}"></label>`}
      <div class="field-label">${t('format')}</div>
      <div class="seg" id="fmt"><button data-v="1v1" class="on">1 × 1</button><button data-v="2v2">2 × 2</button></div>
      <div class="org ${pro ? '' : 'locked'}">
        <div class="field-label">${t('theme')} <span class="pro-badge">PRO</span></div>
        ${pro ? `<select id="thm">${Object.keys(ARENAS).map((k) => `<option value="${k}" ${user.settings?.arena === k ? 'selected' : ''}>${t('arena_' + k)}</option>`).join('')}</select>`
          : `<p class="muted">${t('arenaLocked')} <a href="#/pro">Pro →</a></p>`}
      </div>
      <div class="org ${org ? '' : 'locked'}">
        <div class="field-label">${t('orgOptions')} <span class="pro-badge">ORG</span></div>
        ${org ? `<label>${t('eventTitle')}<input id="ttl" maxlength="48" placeholder="Narxoz Cup"></label>`
          : `<p class="muted">${t('orgLocked')} <a href="#/pro">Pro →</a></p>`}
      </div>
      <button class="btn primary wide" id="create">${t('createRoom')}</button>
    </div>
    <div class="card form-card">
      <label>${t('roomCode')}<input id="code" maxlength="5" autocapitalize="characters" placeholder="ABCDE" style="text-transform:uppercase"></label>
      <button class="btn wide" id="join">${t('joinRoom')}</button>
    </div>
  </section>`;
  let format = '1v1';
  root.querySelectorAll('#fmt button').forEach((b) => b.addEventListener('click', () => { format = b.dataset.v; root.querySelectorAll('#fmt button').forEach((x) => x.classList.toggle('on', x === b)); }));
  const saveName = () => { const n = root.querySelector('#nm'); if (n) saveSettings({ name: n.value.trim().slice(0, 20) }); };
  root.querySelector('#create').addEventListener('click', () => {
    saveName();
    const s = connect();
    s.emit('room:create', { format, title: root.querySelector('#ttl')?.value, theme: root.querySelector('#thm')?.value }, (res) => {
      s.close();
      if (res?.room) go('#/room/' + res.room.code); else notify(t('errServer'), 'err');
    });
  });
  const join = () => { saveName(); const c = root.querySelector('#code').value.trim().toUpperCase(); if (c.length === 5) go('#/room/' + c); };
  root.querySelector('#join').addEventListener('click', join);
  root.querySelector('#code').addEventListener('keydown', (e) => e.key === 'Enter' && join());
}

export function roomScreen(root, code, { watch = false } = {}) {
  const sock = connect();
  let room = null, mySeat = null, view = null, prev = null, cur = null, seq = 0, raf = 0, lastFrame = performance.now();
  let pausedInfo = null, ping = null, alive = true, resultShownFor = null, joined = false;
  root.innerHTML = `<section class="page"><p class="muted center">${t('connecting')}</p></section>`;

  const joinRoom = () => sock.emit('room:join', { code, watch }, (res) => {
    if (!res || res.error) { root.innerHTML = `<section class="page narrow center">${backButton('#/online', t('toOnline'))}<h1>${t('room')} ${esc(code)}</h1><p class="lead">${t('roomNotFound')}</p><a class="btn primary" href="#/online">${t('online')}</a></section>`; return; }
    // (Re)joined: seat may differ from what an early view was built with → rebuild from scratch.
    const seatChanged = joined && mySeat !== res.seat;
    mySeat = res.seat; room = res.room; joined = true;
    if (view && (seatChanged || view.cfg.layout === 'none' && mySeat)) destroyView();
    onRoom();
  });
  sock.on('connect', joinRoom);
  sock.on('room:state', (r) => { room = r; if (joined) onRoom(); });
  sock.on('game:snap', (s) => { prev = cur; cur = { s, at: performance.now() }; if (joined && !view && room?.status === 'play' && s.phase !== 'over') buildView(); });
  sock.on('game:event', (evs) => {
    for (const e of evs) {
      if (e.type === 'disconnected') { const seat = room?.seats.find((x) => x.id === e.seat); pausedInfo = { name: seat?.name || '—', until: Date.now() + (e.until - Date.now()) }; }
      if (e.type === 'reconnected') { pausedInfo = null; view?.toast(t('reconnected')); }
      if (e.type === 'resume' || e.type === 'over') pausedInfo = null;
    }
    view?.events(evs);
  });
  sock.on('input:rej', (r) => view?.rejection(r.reason));
  const pingT = setInterval(() => { const t0 = performance.now(); sock.emit('ping:t', t0, () => { ping = Math.round(performance.now() - t0); const el = root.querySelector('.ping'); if (el) el.textContent = `${t('ping')} ${ping} ms`; }); }, 3000);

  function seatLabel(s) { return (s.name || t('seatFree')) + (s.id === mySeat ? ` (${t('youTag')})` : ''); }
  function mySide() { return room?.seats.find((s) => s.id === mySeat)?.side ?? null; }

  let lastStatus = null;
  function onRoom() {
    if (!alive || !room) return;
    const was = lastStatus; lastStatus = room.status;
    if (room.status === 'play') { if (view && was !== 'play') destroyView(); if (!view) buildView(); return; }
    if (room.status === 'over' && view) { showResult(); return; }
    if (!view) renderLobby();
  }

  function buildView() {
    root.innerHTML = '<div class="match-host"></div>';
    const host = root.firstChild;
    const skinOf = (side) => room.seats.find((s) => s.side === side && s.taken)?.skin || 'classic';
    const outfitOf = (side) => room.seats.find((s) => s.side === side && s.taken)?.outfit || 'team';
    view = new MatchView(host, {
      players: room.seats.map((s) => ({ id: s.id, side: s.side, label: seatLabel(s), ctrl: s.id === mySeat ? 'p1' : null })),
      layout: mySeat ? 'single' : 'none', mySide: mySide(), atlas: false, theme: room.theme, skins: [skinOf(0), skinOf(1)], outfits: [outfitOf(0), outfitOf(1)],
      title: room.title || `${t('room')} ${room.code}${mySeat ? '' : ' · ' + t('spectatorMode')}`,
      onInput: (ctrl, type) => { if (type === 'hold' || type === 'release' || type === 'burst') sock.emit('input', { seq: ++seq, type }); },
      onExit: async () => { if (room.status === 'play' && mySeat && !(await confirmDialog({ title: t('exitTitle'), text: t('exitConfirm'), ok: t('exitYes'), cancel: t('exitNo'), danger: true }))) return; sock.emit('room:leave'); go('#/online'); }
    });
    host.querySelector('.match-top').insertAdjacentHTML('beforeend', `<span class="ping">${ping ? `${t('ping')} ${ping} ms` : ''}</span>`);
    lastFrame = performance.now();
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    if (!alive || !view) return;
    const dt = Math.min(100, now - lastFrame); lastFrame = now;
    if (cur) {
      let s = cur.s;
      if (prev && s.phase === 'play' && prev.s.phase === 'play') {
        const k = Math.min(1, (now - cur.at) / 50);
        s = { ...s, pos: prev.s.pos + (s.pos - prev.s.pos) * k };
      }
      let banner = null;
      if (s.paused && pausedInfo) banner = t('disconnectedMsg', { name: pausedInfo.name, s: Math.max(0, Math.ceil((pausedInfo.until - Date.now()) / 1000)) });
      view.update(s, dt, { banner });
    }
    raf = requestAnimationFrame(frame);
  }

  function showResult() {
    const r = room.lastResult; if (!r) return;
    const side = mySide();
    const readyList = `<div class="ready-list">${room.seats.map((s) => `<span class="${s.ready ? 'on' : ''}">${s.ready ? '✓' : '…'} ${esc(s.name || t('seatFree'))}</span>`).join('')}</div>`;
    if (resultShownFor === r.round) { const el = view.n.result.querySelector('.ready-list'); if (el) el.outerHTML = readyList; return; }
    resultShownFor = r.round;
    const win = r.winner === side, draw = r.winner === 'draw';
    const spectator = side == null;
    (spectator ? sfx.draw : draw ? sfx.draw : win ? sfx.win : sfx.lose)();
    const stats = mySeat ? r.stats?.[mySeat] : null;
    const winners = draw ? '' : (r.teams?.[r.winner] || []).join(' + ');
    const title = spectator ? (draw ? t('draw') : t('winnerIs', { name: esc(winners) })) : draw ? t('draw') : win ? t('win') : t('lose');
    // Players see "Victory/Defeat" plus who won, so everyone knows the name.
    const whoLine = !draw && !spectator ? `<p class="who">${t('winnerIs', { name: esc(winners) })}</p>` : '';
    // Guests have no account: keep their online results in this browser's history.
    if (mySeat && !currentUser()) {
      const opp = room.seats.filter((s) => s.side !== side).map((s) => s.name).join(' + ');
      pushLocalHistory({ mode: 'online-' + room.format, opponent: opp, result: draw ? 'draw' : win ? 'win' : 'loss', durationMs: r.durationMs, stats: stats || {}, reason: r.reason });
    }
    const reason = r.reason === 'forfeit' ? t('reasonForfeit') : r.reason === 'line' ? t('reasonLine') : draw ? t('reasonTimeDraw') : t('reasonTime');
    const delta = r.ratingDeltas?.[mySeat];
    const extra = `<div class="series-score"><span>${t('roomScore')}</span><b>${room.score[0]} : ${room.score[1]}</b>${delta != null ? `<em>${t('rating')} ${delta >= 0 ? '+' : ''}${delta}</em>` : ''}</div>`;
    view.showResult(resultMarkup({ title, cls: spectator ? 'neutral' : draw ? 'draw' : win ? 'win' : 'loss', reason,
      hook: win ? t('winHook') : draw ? t('drawHook') : t('loseHook'), stats, tip: stats ? tipFor(stats, win) : '', extra: whoLine + extra + readyList,
      buttons: `${mySeat ? `<button class="btn primary" data-rematch>${t('rematch')} <kbd>${t('rematchHint')}</kbd></button>` : ''}<button class="btn ghost" data-lobby>${t('room')} ${room.code}</button>` }), (el) => {
      el.querySelector('[data-rematch]')?.addEventListener('click', (e) => { sock.emit('room:ready', true); e.currentTarget.disabled = true; e.currentTarget.textContent = t('waiting'); });
      el.querySelector('[data-lobby]').addEventListener('click', () => { destroyView(); renderLobby(); });
    });
  }

  function destroyView() { view?.destroy(); view = null; cancelAnimationFrame(raf); prev = cur = null; }

  function renderLobby() {
    if (!room) return;
    const base = location.origin + location.pathname;
    const link = `${base}#/room/${room.code}`;
    const watchLink = `${link}?watch=1`;
    const me = room.seats.find((s) => s.id === mySeat);
    const user = currentUser();
    const isHost = room.hostSeat && room.hostSeat === mySeat;
    const allRegistered = room.seats.every((s) => s.registered);
    const col = (side) => `<div class="seats side-${side}"><h3>${side === 0 ? t('leftTeam') : t('rightTeam')}</h3>${room.seats.filter((s) => s.side === side).map((s) => `
      <div class="seat ${s.taken ? 'taken' : ''} ${s.id === mySeat ? 'mine' : ''} ${s.ready ? 'ready' : ''}">
        <b>${esc(s.taken ? s.name : t('seatFree'))}</b>
        <small>${s.taken ? (s.connected ? (s.ready ? '✓ ' + t('ready') : t('notReady')) : '⚠ offline') : t('waiting')}${s.rating ? ' · ' + s.rating : ''}</small>
      </div>`).join('')}</div>`;
    root.innerHTML = `<section class="page room-page"><button class="back-btn" id="leave-top">← <span>${t('toOnline')}</span></button>
      <div class="room-head"><div><span class="eyebrow">${t('room')} · ${room.format === '2v2' ? '2 × 2' : '1 × 1'}</span>
        <h1>${esc(room.title || room.code)}</h1>${room.title ? `<p class="muted">${t('roomCode')}: <b>${room.code}</b></p>` : ''}</div>
        <div class="room-meta"><span>👁 ${room.spectators} ${t('spectators')}</span><span>${allRegistered ? t('rated') : t('unrated')}</span></div></div>
      <div class="card invite"><div class="field-label">${t('invite')}</div>
        <div class="copy-row"><input readonly value="${esc(link)}"><button class="btn" data-copy="${esc(link)}">${t('copyLink')}</button></div>
        <div class="copy-row small"><input readonly value="${esc(watchLink)}"><button class="btn ghost" data-copy="${esc(watchLink)}">${t('watchLink')}</button></div>
        <p class="big-code">${room.code}</p></div>
      <div class="teams">${col(0)}<div class="vs">VS<small>${room.score[0]} : ${room.score[1]}</small></div>${col(1)}</div>
      <p class="muted center">${me ? t('lobbyHint') : t('spectatorMode')}</p>
      <div class="room-actions">
        ${me ? `<button class="btn primary" id="ready">${me.ready ? t('notReady') : t('ready')}</button><button class="btn ghost" id="switch">${t('switchSide')}</button>` : ''}
        <button class="btn ghost" id="leave">${t('leaveRoom')}</button>
        ${isHost && user?.proPlan === 'org' ? `<button class="btn ghost" id="csv">${t('exportCsv')}</button>` : ''}
      </div>
      ${room.history.length ? `<div class="card"><div class="field-label">${t('history')}</div><table class="tbl"><tbody>${room.history.slice().reverse().map((h) => `<tr><td>#${h.round}</td><td>${esc(h.teams[0].join(' + '))}</td><td><b>${h.winner === 'draw' ? '=' : h.winner === 0 ? '◀' : '▶'}</b></td><td>${esc(h.teams[1].join(' + '))}</td><td>${(h.durationMs / 1000).toFixed(0)}s · ${h.reason}</td></tr>`).join('')}</tbody></table></div>` : ''}
    </section>`;
    root.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); } catch { b.previousElementSibling.select(); document.execCommand('copy'); }
      notify(t('copied'));
    }));
    root.querySelector('#ready')?.addEventListener('click', () => { sfx.unlock(); sock.emit('room:ready', !me.ready); });
    root.querySelector('#switch')?.addEventListener('click', () => sock.emit('room:switch', null, (res) => { if (res?.seat) { mySeat = res.seat; renderLobby(); } }));
    const leave = () => { sock.emit('room:leave'); go('#/online'); };
    root.querySelector('#leave').addEventListener('click', leave);
    root.querySelector('#leave-top').addEventListener('click', leave);
    root.querySelector('#csv')?.addEventListener('click', async () => {
      const res = await fetch(`/api/rooms/${room.code}/results.csv`, { headers: { Authorization: 'Bearer ' + token() } });
      if (!res.ok) return notify(t('errServer'), 'err');
      const blob = await res.blob(); const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `tartys-${room.code}.csv`; a.click(); URL.revokeObjectURL(a.href);
    });
  }

  return () => {
    // Navigating away (menu, back button, edited URL) during a match = leaving the match: immediate technical loss.
    if (room?.status === 'play' && mySeat) { sock.emit('room:leave'); notify(t('forfeitByNav'), 'err'); }
    alive = false; clearInterval(pingT); destroyView(); setTimeout(() => sock.close(), 150);
  };
}
