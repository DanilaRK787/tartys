import http from 'http';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import express from 'express';
import { Server } from 'socket.io';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { openStore, publicUser, nextCharge } from './db.js';
import { createRoomHub } from './rooms.js';
import { ROPES, OUTFITS, ARENAS, allowed } from '../shared/cosmetics.js';
import { prehash, PREHASH_RE } from '../shared/pwhash.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 3000);
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const log = (...a) => console.log(new Date().toISOString(), ...a);

export const PLANS = {
  player: { amount: 990, title: 'TARTYS Pro' },
  org: { amount: 4990, title: 'TARTYS Организатор' }
};
const OFFLINE_MODES = /^(bot-(easy|normal|hard)|atlas-(easy|normal|hard)|duel|team-bot|series-(win|loss)|challenge-[a-z-]+|journey|tutorial)$/;
const NAME_RE = /^[\p{L}\p{N}_.-]{3,20}$/u;

export async function createServer() {
  const store = await openStore();
  log('storage:', store.kind);

  // Test accounts for reviewers
  for (const [name, pass] of [['demo', 'tartys2026'], ['demo2', 'tartys2026']]) {
    // stored as bcrypt(prehash) — exactly what a browser sends after hashing the password
    const existing = await store.userByName(name);
    if (!existing) await store.createUser(name, await bcrypt.hash(prehash(name, pass), 10));
    // databases created before browser-side hashing: bring the test accounts to the current password format
    else if (!(await bcrypt.compare(prehash(name, pass), existing.pass_hash))) await store.updateUser(existing.id, { pass_hash: await bcrypt.hash(prehash(name, pass), 10) });
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });

  const sign = (u) => jwt.sign({ uid: u.id }, SECRET, { expiresIn: '30d' });
  const readToken = (t) => { try { return jwt.verify(t, SECRET).uid; } catch { return null; } };
  const auth = (required) => async (req, res, next) => {
    const h = req.headers.authorization || '';
    const uid = h.startsWith('Bearer ') ? readToken(h.slice(7)) : null;
    req.user = uid ? await store.user(uid) : null;
    if (required && !req.user) return res.status(401).json({ error: 'auth' });
    next();
  };
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  // Simple in-memory rate limit for auth endpoints
  const hits = new Map();
  const limit = (key, max, windowMs) => {
    const now = Date.now(); const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    arr.push(now); hits.set(key, arr); return arr.length <= max;
  };

  app.get('/api/health', (req, res) => res.json({ ok: true, storage: store.kind, ...hub.stats() }));

  app.post('/api/auth/register', wrap(async (req, res) => {
    if (!limit('reg:' + req.ip, 10, 3600e3)) return res.status(429).json({ error: 'rate' });
    const { username, password } = req.body || {};
    if (!NAME_RE.test(username || '')) return res.status(400).json({ error: 'username' });
    // The browser sends SHA-256 of the password (length is checked there); the server never sees the plain text.
    if (typeof password !== 'string' || !PREHASH_RE.test(password)) return res.status(400).json({ error: 'password' });
    try {
      const u = await store.createUser(username, await bcrypt.hash(password, 10));
      res.json({ token: sign(u), user: publicUser(u) });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'taken' });
      throw err;
    }
  }));

  app.get('/api/auth/available', wrap(async (req, res) => {
    if (!limit('avail:' + req.ip, 60, 60e3)) return res.status(429).json({ error: 'rate' });
    const name = String(req.query.username || '');
    if (!NAME_RE.test(name)) return res.json({ valid: false, available: false });
    res.json({ valid: true, available: !(await store.userByName(name)) });
  }));

  app.post('/api/auth/login', wrap(async (req, res) => {
    if (!limit('login:' + req.ip, 20, 600e3)) return res.status(429).json({ error: 'rate' });
    const { username, password } = req.body || {};
    const u = await store.userByName(String(username || ''));
    if (!u || typeof password !== 'string' || !PREHASH_RE.test(password) || !(await bcrypt.compare(password, u.pass_hash))) return res.status(401).json({ error: 'credentials' });
    res.json({ token: sign(u), user: publicUser(u) });
  }));

  // Right to be forgotten: removes the account, its matches and test payments.
  app.delete('/api/me', auth(true), wrap(async (req, res) => {
    await store.deleteUser(req.user.id);
    res.json({ ok: true });
  }));

  app.get('/api/me', auth(true), wrap(async (req, res) => {
    res.json({ user: publicUser(req.user), summary: await store.summary(req.user.id), payments: await store.payments(req.user.id) });
  }));

  app.put('/api/me', auth(true), wrap(async (req, res) => {
    const patch = {};
    const { skin, progress, settings } = req.body || {};
    if (skin) {
      if (!allowed(ROPES, skin, req.user.pro)) return res.status(403).json({ error: 'pro-required' });
      patch.skin = skin;
    }
    if (progress && typeof progress === 'object') {
      const merged = { ...(req.user.progress || {}) };
      for (const [k, v] of Object.entries(progress).slice(0, 30)) {
        if (!/^[a-z-]{2,30}$/.test(k) || typeof v !== 'object') continue;
        const prev = merged[k] || {};
        merged[k] = { done: !!(prev.done || v.done), best: Math.max(Number(prev.best) || 0, Number(v.best) || 0), at: v.done && !prev.done ? new Date().toISOString() : prev.at || null };
      }
      patch.progress = merged;
    }
    if (settings && typeof settings === 'object') {
      // Pro cosmetics are checked here, so editing the page or the URL cannot unlock them.
      if (settings.outfit !== undefined && !allowed(OUTFITS, settings.outfit, req.user.pro)) return res.status(403).json({ error: 'pro-required' });
      if (settings.arena !== undefined && !allowed(ARENAS, settings.arena, req.user.pro)) return res.status(403).json({ error: 'pro-required' });
      patch.settings = { ...(req.user.settings || {}), ...Object.fromEntries(Object.entries(settings).slice(0, 12).map(([k, v]) => [k.slice(0, 20), typeof v === 'string' ? v.slice(0, 20) : !!v])) };
    }
    const u = await store.updateUser(req.user.id, patch);
    res.json({ user: publicUser(u) });
  }));

  app.post('/api/matches', auth(true), wrap(async (req, res) => {
    const m = req.body || {};
    if (!OFFLINE_MODES.test(m.mode || '')) return res.status(400).json({ error: 'mode' });
    if (!['win', 'loss', 'draw'].includes(m.result)) return res.status(400).json({ error: 'result' });
    const durationMs = Math.round(Number(m.durationMs));
    if (!(durationMs >= 1000 && durationMs <= 120000)) return res.status(400).json({ error: 'duration' });
    if (Date.now() - (await store.lastMatchAt(req.user.id)) < 3000) return res.status(429).json({ error: 'rate' });
    const stats = {};
    for (const k of ['holdMs', 'bursts', 'charged', 'perfect', 'blocked', 'synced', 'exhausts', 'answers', 'correct']) stats[k] = Math.max(0, Math.min(1e6, Number(m.stats?.[k]) || 0));
    await store.addMatch({ userId: req.user.id, mode: m.mode, opponent: String(m.opponent || '').slice(0, 40), result: m.result,
      pos: Math.max(-100, Math.min(100, Number(m.pos) || 0)), durationMs, reason: ['line', 'time', 'forfeit'].includes(m.reason) ? m.reason : null, stats, verified: false });
    res.json({ ok: true, summary: await store.summary(req.user.id) });
  }));

  app.get('/api/matches', auth(true), wrap(async (req, res) => {
    const rows = await store.matches(req.user.id, Math.min(100, Number(req.query.limit) || 30));
    res.json({ matches: rows.map((m) => ({ id: m.id, mode: m.mode, opponent: m.opponent, result: m.result, pos: m.pos, durationMs: m.duration_ms,
      reason: m.reason, stats: m.stats, verified: m.verified, roomCode: m.room_code, ratingDelta: m.rating_delta, createdAt: m.created_at })) });
  }));

  app.get('/api/leaderboard', wrap(async (req, res) => {
    const rows = await store.leaderboard(30);
    res.json({ rows: rows.map((r) => ({ username: r.username, rating: r.rating, pro: !!r.pro, skin: r.skin, wins: Number(r.wins), played: Number(r.played), online: Number(r.online) })) });
  }));

  // Monetisation demo — TEST MODE ONLY. No real card data is stored or charged.
  // ——— Payments: TEST MODE ONLY. Only test cards are accepted, nothing is charged, no card data is stored
  // (just brand + last 4 digits for the receipt). Flow mirrors a real acquirer: card check → 3-D Secure SMS code → result.
  const TEST_CARDS = { '4242424242424242': 'ok', '5555555555554444': 'ok', '4000000000000002': 'insufficient', '4000000000009995': 'blocked' };
  const OTP = '123456';
  const luhn = (num) => { let sum = 0; for (let i = 0; i < num.length; i++) { let d = +num[num.length - 1 - i]; if (i % 2) { d *= 2; if (d > 9) d -= 9; } sum += d; } return sum % 10 === 0; };
  const brandOf = (num) => (/^4/.test(num) ? 'Visa' : /^(5[1-5]|2[2-7])/.test(num) ? 'Mastercard' : 'Card');

  app.post('/api/pro/checkout', auth(true), wrap(async (req, res) => {
    const { plan, card } = req.body || {};
    if (!PLANS[plan]) return res.status(400).json({ error: 'plan' });
    const num = String(card?.number || '').replace(/\s+/g, '');
    if (!/^\d{16}$/.test(num) || !luhn(num)) return res.status(400).json({ error: 'card-number' });
    const m = /^(\d{2})\/(\d{2})$/.exec(card?.exp || '');
    const now = new Date();
    if (!m || +m[1] < 1 || +m[1] > 12 || new Date(2000 + +m[2], +m[1], 1) <= now || +m[2] > (now.getFullYear() % 100) + 15) return res.status(400).json({ error: 'card-exp' });
    if (!/^\d{3}$/.test(card?.cvc || '')) return res.status(400).json({ error: 'card-cvc' });
    if (!/^[A-Z]{2,}(?:[ -][A-Z]{2,})+$/.test(String(card?.name || '').trim())) return res.status(400).json({ error: 'card-name' }); // Latin, as embossed on the card
    const verdict = TEST_CARDS[num];
    if (!verdict) return res.status(400).json({ error: 'test-only' });
    const base = { userId: req.user.id, plan, amount: PLANS[plan].amount, brand: brandOf(num), last4: num.slice(-4) };
    if (verdict !== 'ok') {
      await store.addPayment({ ...base, status: 'declined' });
      return res.status(402).json({ error: verdict === 'insufficient' ? 'insufficient' : 'blocked' });
    }
    const p = await store.addPayment({ ...base, status: 'requires_action' });
    res.json({ paymentId: p.id, action: '3ds', phone: '+7 7•• ••• •• 42', amount: base.amount, brand: base.brand, last4: base.last4 });
  }));

  app.post('/api/pro/confirm', auth(true), wrap(async (req, res) => {
    const p = await store.payment(Number(req.body?.paymentId));
    if (!p || p.user_id !== req.user.id) return res.status(404).json({ error: 'payment' });
    if (p.status !== 'requires_action') return res.status(409).json({ error: 'state' });
    if (String(req.body?.code || '') !== OTP) {
      const attempts = (p.attempts || 0) + 1;
      await store.updatePayment(p.id, { attempts, status: attempts >= 3 ? 'failed' : 'requires_action' });
      return res.status(400).json({ error: attempts >= 3 ? 'otp-locked' : 'otp', attemptsLeft: Math.max(0, 3 - attempts) });
    }
    await store.updatePayment(p.id, { status: 'succeeded' });
    const now = new Date(); const month = new Date(now); month.setMonth(month.getMonth() + 1);
    const plan = p.plan === 'org' || (req.user.pro && req.user.pro_plan === 'org') ? 'org' : 'player';
    // monthly plan renews (no end date); organiser plan is one-off for one month
    const u = await store.updateUser(req.user.id, { pro: true, pro_plan: plan, pro_since: now.toISOString(), pro_cancelled: false, sub_status: 'active', pro_until: plan === 'org' ? month.toISOString() : null });
    res.json({ user: publicUser(u), receipt: { id: 'TRS-' + String(p.id).padStart(6, '0'), plan: p.plan, amount: p.amount, currency: 'KZT', brand: p.brand, last4: p.last4, at: new Date().toISOString(), test: true } });
  }));

  // Cancel = no further charges; Pro stays active until the end of the period already paid for.
  app.post('/api/pro/cancel', auth(true), wrap(async (req, res) => {
    const u0 = req.user;
    if (!u0.pro) return res.status(409).json({ error: 'not-pro' });
    const until = u0.pro_plan === 'player' ? nextCharge(u0) : u0.pro_until;
    const u = await store.updateUser(u0.id, { pro_cancelled: true, sub_status: 'cancelled', pro_until: until ? new Date(until).toISOString() : new Date().toISOString() });
    res.json({ user: publicUser(u) });
  }));

  // TEST MODE helper: "fast-forward" to the end of a paid period that will not renew, to see Pro switch off.
  app.post('/api/pro/test-expire', auth(true), wrap(async (req, res) => {
    const u0 = req.user;
    if (!u0.pro || !(u0.sub_status === 'cancelled' || u0.pro_plan === 'org')) return res.status(409).json({ error: 'state' });
    await store.updateUser(u0.id, { pro_until: new Date(Date.now() - 1000).toISOString() });
    const u = await store.user(u0.id); // reading the user applies the expiry
    res.json({ user: publicUser(u) });
  }));

  // Changed your mind before the period ended? Renewal is switched back on.
  app.post('/api/pro/resume', auth(true), wrap(async (req, res) => {
    const u0 = req.user;
    if (!u0.pro || u0.sub_status !== 'cancelled' || u0.pro_plan !== 'player') return res.status(409).json({ error: 'state' });
    const u = await store.updateUser(u0.id, { pro_cancelled: false, sub_status: 'active', pro_until: null });
    res.json({ user: publicUser(u) });
  }));

  app.get('/api/rooms/:code/results.csv', auth(true), (req, res) => {
    const out = hub.exportCsv(req.params.code, req.user.id);
    if (out.error) return res.status(out.error === 'forbidden' ? 403 : 404).json(out);
    if (req.user.pro_plan !== 'org') return res.status(403).json({ error: 'org-required' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tartys-${req.params.code}.csv"`);
    res.send('﻿' + out.csv);
  });

  app.use('/shared', express.static(path.join(ROOT, 'shared'), { maxAge: '5m' }));
  app.use(express.static(path.join(ROOT, 'public'), { maxAge: '5m', extensions: ['html'] }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'not-found' }));
  app.use((err, req, res, next) => { log('error', err); res.status(500).json({ error: 'server' }); });

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: false }, maxHttpBufferSize: 4096 });
  io.use(async (sock, next) => {
    const a = sock.handshake.auth || {};
    sock.data.clientId = typeof a.clientId === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(a.clientId) ? a.clientId : crypto.randomUUID();
    sock.data.userId = a.token ? readToken(a.token) : null;
    sock.data.name = typeof a.name === 'string' && a.name.trim() ? a.name.trim().slice(0, 20) : null;
    next();
  });
  const hub = createRoomHub(io, store, log);
  return { app, server, io, store, hub };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server } = await createServer();
  server.listen(PORT, () => log(`TARTYS listening on http://localhost:${PORT}`));
  // Render's free plan puts a service to sleep after 15 minutes without incoming requests.
  // The server pings its own public address every 10 minutes, so it never falls asleep
  // (one always-on service fits into Render's 750 free hours per month). Disable with KEEP_ALIVE=off.
  const publicUrl = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL; // Render sets RENDER_EXTERNAL_URL itself
  if (publicUrl && process.env.KEEP_ALIVE !== 'off') {
    setInterval(() => fetch(publicUrl + '/api/health').catch(() => {}), 10 * 60 * 1000).unref();
    log('keep-alive: pinging', publicUrl, 'every 10 min');
  }
}
