// Online rooms. The server owns the only real Engine: clients send intents
// (hold / release / burst), the server validates, simulates and broadcasts.
// A client can never send a rope position, stamina value or winner.
import { Engine } from '../shared/engine.js';
import { expected } from './elo.js';
import { ROPES, OUTFITS, ARENAS, allowed } from '../shared/cosmetics.js';

const TICK_MS = 1000 / 60;
const SNAP_EVERY_MS = 50;
const RECONNECT_MS = 15000;
const LOBBY_SEAT_TTL_MS = 60000;
const MAX_INPUTS_PER_SEC = 20;
const ROOM_IDLE_MS = 30 * 60 * 1000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function createRoomHub(io, store, log = () => {}) {
  const rooms = new Map();

  const newCode = () => {
    let c;
    do { c = Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join(''); } while (rooms.has(c));
    return c;
  };

  function seatLayout(format) {
    return format === '2v2'
      ? [{ id: 's0', side: 0 }, { id: 's1', side: 1 }, { id: 's2', side: 0 }, { id: 's3', side: 1 }]
      : [{ id: 's0', side: 0 }, { id: 's1', side: 1 }];
  }

  function publicRoom(r) {
    return {
      code: r.code, format: r.format, title: r.title, theme: r.theme, status: r.status, round: r.round,
      hostSeat: r.seats.find((s) => s.clientId === r.hostClientId)?.id || null,
      seats: r.seats.map((s) => ({ id: s.id, side: s.side, name: s.name, skin: s.skin, outfit: s.outfit || 'team', taken: !!s.clientId, connected: s.connected, ready: s.ready, rating: s.rating ?? null, registered: !!s.userId })),
      spectators: r.spectators.size,
      pausedUntil: r.pausedUntil || null,
      score: r.score, lastResult: r.lastResult, history: r.history.slice(-10)
    };
  }

  function broadcastRoom(r) { io.to('room:' + r.code).emit('room:state', publicRoom(r)); }

  function seatOf(r, clientId) { return r.seats.find((s) => s.clientId === clientId) || null; }

  function freeSeat(s) { Object.assign(s, { clientId: null, userId: null, name: null, socketId: null, connected: false, ready: false, skin: 'classic', outfit: 'team', rating: null, lastSeq: 0, inputs: [] }); }

  async function createRoom(sock, opts) {
    const format = opts.format === '2v2' ? '2v2' : '1v1';
    const user = sock.data.userId ? await store.user(sock.data.userId) : null;
    const org = user?.pro && user.pro_plan === 'org';
    const code = newCode();
    const r = {
      code, format, hostClientId: sock.data.clientId, hostUserId: user?.id || null,
      title: org && opts.title ? String(opts.title).slice(0, 48) : null,
      theme: allowed(ARENAS, opts.theme, user?.pro) ? opts.theme : 'steppe', // Pro arenas for any Pro plan
      seats: seatLayout(format).map((s) => ({ ...s })), spectators: new Map(),
      status: 'lobby', engine: null, loop: null, round: 0, score: [0, 0], history: [], lastResult: null,
      lastActive: Date.now(), pausedUntil: null, reconnectTimer: null
    };
    r.seats.forEach(freeSeat);
    rooms.set(code, r);
    log('room created', code, format);
    return r;
  }

  async function join(sock, code, { watch = false } = {}) {
    const r = rooms.get(String(code || '').toUpperCase());
    if (!r) return { error: 'not-found' };
    r.lastActive = Date.now();
    leaveCurrent(sock);
    sock.join('room:' + r.code);
    sock.data.room = r.code;
    let seat = seatOf(r, sock.data.clientId);
    // A logged-in player who closed the tab can reclaim their disconnected seat from a new tab/device.
    if (!seat && !watch && sock.data.userId) {
      seat = r.seats.find((s) => s.userId === sock.data.userId && !s.connected) || null;
      if (seat) seat.clientId = sock.data.clientId;
    }
    if (!seat && !watch) {
      // balance teams: take the first free seat on the smaller side
      const free = r.seats.filter((s) => !s.clientId);
      const count = (side) => r.seats.filter((s) => s.side === side && s.clientId).length;
      free.sort((a, b) => count(a.side) - count(b.side));
      if (free.length && r.status !== 'play') seat = free[0];
    }
    if (seat) {
      const user = sock.data.userId ? await store.user(sock.data.userId) : null;
      Object.assign(seat, {
        clientId: sock.data.clientId, userId: user?.id || null, socketId: sock.id, connected: true,
        name: user?.username || sock.data.name || 'Гость', skin: allowed(ROPES, user?.skin, user?.pro) ? user.skin : 'classic',
        outfit: allowed(OUTFITS, user?.settings?.outfit, user?.pro) ? user.settings.outfit : 'team',
        rating: user?.rating ?? null
      });
      seat.lastSeq = seat.lastSeq || 0; seat.inputs = [];
      clearTimeout(seat.lobbyTimer);
      sock.data.seat = seat.id;
      if (r.engine && r.engine.paused && r.seats.every((s) => !s.clientId || s.connected)) {
        clearTimeout(r.reconnectTimer); r.pausedUntil = null;
        r.engine.resume();
        io.to('room:' + r.code).emit('game:event', [{ type: 'reconnected', seat: seat.id }]);
      }
    } else {
      r.spectators.set(sock.id, sock.data.name || 'Зритель');
      sock.data.seat = null;
    }
    broadcastRoom(r);
    if (r.engine) sock.emit('game:snap', snapFor(r));
    return { ok: true, room: publicRoom(r), seat: seat?.id || null };
  }

  function leaveCurrent(sock, explicit = false) {
    const code = sock.data.room; if (!code) return;
    const r = rooms.get(code); sock.leave('room:' + code); sock.data.room = null;
    if (!r) return;
    r.spectators.delete(sock.id);
    const seat = r.seats.find((s) => s.socketId === sock.id);
    if (seat) onSeatGone(r, seat, explicit);
    sock.data.seat = null;
    broadcastRoom(r);
  }

  function onSeatGone(r, seat, explicit) {
    seat.connected = false; seat.socketId = null; seat.ready = false;
    if (r.status === 'play' && r.engine && r.engine.phase !== 'over') {
      if (explicit) { r.engine.forfeit(seat.side); return; }
      r.engine.pause();
      r.pausedUntil = Date.now() + RECONNECT_MS;
      io.to('room:' + r.code).emit('game:event', [{ type: 'disconnected', seat: seat.id, until: r.pausedUntil }]);
      clearTimeout(r.reconnectTimer);
      r.reconnectTimer = setTimeout(() => {
        if (!r.engine || r.engine.phase === 'over') return;
        const gone = r.seats.find((s) => s.clientId && !s.connected);
        if (gone) { r.engine.paused = false; r.engine.forfeit(gone.side); r.pausedUntil = null; }
      }, RECONNECT_MS);
    } else if (explicit) {
      freeSeat(seat);
    } else {
      seat.lobbyTimer = setTimeout(() => { if (!seat.connected && r.status !== 'play') { freeSeat(seat); broadcastRoom(r); } }, LOBBY_SEAT_TTL_MS);
    }
  }

  function setReady(sock, ready) {
    const r = rooms.get(sock.data.room); if (!r || r.status === 'play') return;
    const seat = r.seats.find((s) => s.socketId === sock.id); if (!seat) return;
    seat.ready = !!ready;
    r.lastActive = Date.now();
    if (r.seats.every((s) => s.clientId && s.connected && s.ready)) startMatch(r);
    else broadcastRoom(r);
  }

  function switchSide(sock) {
    const r = rooms.get(sock.data.room); if (!r || r.status === 'play') return null;
    const seat = r.seats.find((s) => s.socketId === sock.id); if (!seat) return null;
    const target = r.seats.find((s) => !s.clientId && s.side !== seat.side);
    if (!target) return { seat: seat.id };
    const keep = { clientId: seat.clientId, userId: seat.userId, name: seat.name, socketId: seat.socketId, connected: true, skin: seat.skin, rating: seat.rating };
    freeSeat(seat); Object.assign(target, keep, { ready: false, lastSeq: 0, inputs: [] });
    sock.data.seat = target.id;
    broadcastRoom(r);
    return { seat: target.id };
  }

  function startMatch(r) {
    r.round += 1;
    r.status = 'play';
    r.lastResult = null;
    r.engine = new Engine({ players: r.seats.map((s) => ({ id: s.id, side: s.side, name: s.name })), seed: (Math.random() * 2 ** 31) | 0 });
    for (const s of r.seats) { s.lastSeq = 0; s.inputs = []; s.ready = false; }
    let last = performance.now(), sinceSnap = 0;
    clearInterval(r.loop);
    r.loop = setInterval(() => {
      const now = performance.now(); const dt = now - last; last = now;
      r.engine.advance(dt);
      const ev = r.engine.drainEvents();
      if (ev.length) io.to('room:' + r.code).emit('game:event', ev);
      sinceSnap += dt;
      if (sinceSnap >= SNAP_EVERY_MS || r.engine.phase === 'over') { sinceSnap = 0; io.to('room:' + r.code).volatile.emit('game:snap', snapFor(r)); }
      if (r.engine.phase === 'over') endMatch(r);
    }, TICK_MS);
    broadcastRoom(r);
    log('match start', r.code, r.round);
  }

  function snapFor(r) { return { ...r.engine.snapshot(), room: r.code, round: r.round }; }

  async function endMatch(r) {
    clearInterval(r.loop); r.loop = null;
    clearTimeout(r.reconnectTimer); r.pausedUntil = null;
    const e = r.engine;
    io.to('room:' + r.code).emit('game:snap', snapFor(r));
    r.status = 'over';
    if (e.winner === 0 || e.winner === 1) r.score[e.winner]++;
    const entry = { round: r.round, winner: e.winner, reason: e.reason, pos: +e.pos.toFixed(1), durationMs: Math.round(e.t),
      teams: [0, 1].map((side) => r.seats.filter((s) => s.side === side).map((s) => s.name)), at: new Date().toISOString(),
      stats: Object.fromEntries(r.seats.map((s) => [s.id, e.statsFor(s.id)])) };
    r.history.push(entry);
    r.lastResult = entry;
    // Rated only if every seat is a registered account (no smurfing with guests).
    const allRegistered = r.seats.every((s) => s.userId) && new Set(r.seats.map((s) => s.userId)).size === r.seats.length; // no self-play farming
    const deltas = {};
    if (allRegistered) {
      const teamRating = (side) => { const t = r.seats.filter((s) => s.side === side); return t.reduce((a, s) => a + (s.rating || 1000), 0) / t.length; };
      const [ra, rb] = [teamRating(0), teamRating(1)];
      const scoreA = e.winner === 'draw' ? 0.5 : e.winner === 0 ? 1 : 0;
      const d = Math.round(32 * (scoreA - expected(ra, rb)));
      for (const s of r.seats) deltas[s.id] = s.side === 0 ? d : -d;
    }
    for (const s of r.seats) {
      if (!s.userId) continue;
      const result = e.winner === 'draw' ? 'draw' : e.winner === s.side ? 'win' : 'loss';
      try {
        const opp = r.seats.filter((o) => o.side !== s.side).map((o) => o.name).join(' + ');
        await store.addMatch({ userId: s.userId, mode: 'online-' + r.format, opponent: opp, result, pos: s.side === 0 ? -e.pos : e.pos,
          durationMs: Math.round(e.t), reason: e.reason, stats: e.statsFor(s.id), verified: true, roomCode: r.code, ratingDelta: deltas[s.id] ?? null });
        if (deltas[s.id] != null) {
          const u = await store.user(s.userId);
          const upd = await store.updateUser(s.userId, { rating: Math.max(100, u.rating + deltas[s.id]) });
          s.rating = upd.rating;
        }
      } catch (err) { log('save match failed', err.message); }
    }
    entry.ratingDeltas = deltas;
    for (const s of r.seats) if (s.clientId && !s.connected) freeSeat(s); // left mid-match → seat opens for someone else
    broadcastRoom(r);
  }

  function handleInput(sock, msg) {
    const r = rooms.get(sock.data.room);
    if (!r || !r.engine || r.status !== 'play') return;
    const seat = r.seats.find((s) => s.socketId === sock.id);
    if (!seat) return; // spectators cannot act
    if (!msg || typeof msg !== 'object') return;
    const seq = Number(msg.seq);
    if (!Number.isInteger(seq) || seq <= seat.lastSeq) return; // replayed / duplicated action
    seat.lastSeq = seq;
    const now = Date.now();
    seat.inputs = seat.inputs.filter((t) => now - t < 1000);
    if (seat.inputs.length >= MAX_INPUTS_PER_SEC) { sock.emit('input:rej', { seq, reason: 'rate' }); return; }
    seat.inputs.push(now);
    if (!['hold', 'release', 'burst'].includes(msg.type)) return;
    const res = r.engine.input(seat.id, { type: msg.type });
    if (!res.ok && msg.type !== 'release') sock.emit('input:rej', { seq, reason: res.reason });
  }

  function exportCsv(code, userId) {
    const r = rooms.get(String(code).toUpperCase());
    if (!r) return { error: 'not-found' };
    if (!userId || r.hostUserId !== userId) return { error: 'forbidden' };
    const rows = [['round', 'finished_at', 'left_team', 'right_team', 'winner', 'reason', 'rope_pos', 'duration_s']];
    for (const h of r.history) rows.push([h.round, h.at, h.teams[0].join(' + '), h.teams[1].join(' + '),
      h.winner === 'draw' ? 'draw' : h.winner === 0 ? 'left' : 'right', h.reason, h.pos, (h.durationMs / 1000).toFixed(1)]);
    return { csv: rows.map((row) => row.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n'), title: r.title };
  }

  setInterval(() => {
    const now = Date.now();
    for (const [code, r] of rooms) {
      const anyone = r.seats.some((s) => s.connected) || r.spectators.size;
      if (!anyone && now - r.lastActive > ROOM_IDLE_MS) { clearInterval(r.loop); rooms.delete(code); }
    }
  }, 60000).unref();

  io.on('connection', (sock) => {
    sock.on('room:create', async (opts, ack) => {
      try { const r = await createRoom(sock, opts || {}); const res = await join(sock, r.code); ack?.(res); }
      catch (err) { log(err); ack?.({ error: 'server' }); }
    });
    sock.on('room:join', async (opts, ack) => { try { ack?.(await join(sock, opts?.code, { watch: !!opts?.watch })); } catch (err) { log(err); ack?.({ error: 'server' }); } });
    sock.on('room:ready', (v) => setReady(sock, v !== false));
    sock.on('room:switch', (_, ack) => { const res = switchSide(sock); if (typeof ack === 'function') ack(res); });
    sock.on('room:leave', () => leaveCurrent(sock, true));
    sock.on('input', (msg) => handleInput(sock, msg));
    sock.on('ping:t', (t, ack) => ack?.(t));
    sock.on('disconnect', () => leaveCurrent(sock, false));
  });

  return { rooms, exportCsv, stats: () => ({ rooms: rooms.size }) };
}
