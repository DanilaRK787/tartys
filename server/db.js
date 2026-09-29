// Storage layer. Uses PostgreSQL when DATABASE_URL is set (production),
// otherwise a small JSON-file store (local development, zero setup).
import fs from 'fs';
import path from 'path';
import pg from 'pg';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  pass_hash TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 1000,
  pro BOOLEAN NOT NULL DEFAULT FALSE,
  pro_plan TEXT,
  pro_since TIMESTAMPTZ,
  skin TEXT NOT NULL DEFAULT 'classic',
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS matches (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  opponent TEXT,
  result TEXT NOT NULL,
  pos REAL,
  duration_ms INTEGER,
  reason TEXT,
  stats JSONB,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  room_code TEXT,
  rating_delta INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS matches_user_idx ON matches(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KZT',
  status TEXT NOT NULL,
  test BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS last4 TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pro_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pro_cancelled BOOLEAN NOT NULL DEFAULT FALSE;
-- explicit subscription status: none | active | cancelled (paid period still running) | expired
ALTER TABLE users ADD COLUMN IF NOT EXISTS sub_status TEXT NOT NULL DEFAULT 'none';
UPDATE users SET sub_status = CASE WHEN pro AND pro_cancelled THEN 'cancelled' WHEN pro THEN 'active' ELSE sub_status END WHERE sub_status = 'none' AND pro;
-- nicknames are unique regardless of letter case ("Demo" and "demo" are the same player)
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username));`;

// Subscription model:
//  - "player": monthly, renews on the activation day each month until cancelled; after cancelling it stays active
//    until the end of the paid month (pro_until) and then switches off by itself;
//  - "org": one-off payment, active for one month (pro_until), never renews.
export function nextCharge(u) {
  if (!u.pro || u.pro_plan !== 'player' || !u.pro_since || u.sub_status !== 'active') return null;
  const d = new Date(u.pro_since); const now = new Date();
  while (d <= now) d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}
const publicUser = (u) => u && ({
  id: u.id, username: u.username, rating: u.rating, pro: !!u.pro, proPlan: u.pro_plan || null,
  proSince: u.pro_since ? new Date(u.pro_since).toISOString() : null, nextChargeAt: nextCharge(u),
  subStatus: u.sub_status || (u.pro ? 'active' : 'none'), proCancelled: u.sub_status === 'cancelled', proUntil: u.pro_until ? new Date(u.pro_until).toISOString() : null,
  skin: u.skin || 'classic', progress: u.progress || {}, settings: u.settings || {}, createdAt: u.created_at
});

function summarize(rows) {
  const s = { played: 0, wins: 0, losses: 0, draws: 0, online: 0, bestStreak: 0, streak: 0, byMode: {} };
  // rows newest → oldest; compute current streak and best streak chronologically
  let run = 0;
  for (const m of [...rows].reverse()) {
    s.played++;
    s[m.result === 'win' ? 'wins' : m.result === 'loss' ? 'losses' : 'draws']++;
    if (m.verified) s.online++;
    const b = (s.byMode[m.mode] ||= { played: 0, wins: 0 });
    b.played++; if (m.result === 'win') b.wins++;
    run = m.result === 'win' ? run + 1 : 0;
    s.bestStreak = Math.max(s.bestStreak, run);
  }
  s.streak = run;
  return s;
}

class PgStore {
  constructor(url) {
    // Internal hosts (Render private network, localhost) have no dots → plain TCP; public hosts (Neon, Supabase…) → TLS.
    let host = '';
    try { host = new URL(url).hostname; } catch { /* keep default */ }
    const useSsl = process.env.PGSSL ? process.env.PGSSL !== 'disable' : host.includes('.') && !/^(localhost|127\.0\.0\.1)$/.test(host);
    this.pool = new pg.Pool({ connectionString: url, ssl: useSsl ? { rejectUnauthorized: false } : false, max: 5 });
  }
  async init() { await this.pool.query(SCHEMA); }
  async q(sql, params) { return (await this.pool.query(sql, params)).rows; }
  async createUser(username, passHash) {
    if (await this.userByName(username)) { const e = new Error('duplicate'); e.code = '23505'; throw e; }
    const [u] = await this.q('INSERT INTO users(username, pass_hash) VALUES($1,$2) RETURNING *', [username, passHash]);
    return u;
  }
  async userByName(name) { return (await this.q('SELECT * FROM users WHERE lower(username)=lower($1)', [name]))[0] || null; }
  async user(id) { return (await this.q('SELECT * FROM users WHERE id=$1', [id]))[0] || null; }
  async updateUser(id, patch) {
    const cols = Object.keys(patch); if (!cols.length) return this.user(id);
    const sets = cols.map((c, i) => `${c}=$${i + 2}`).join(',');
    const vals = cols.map((c) => (typeof patch[c] === 'object' && patch[c] !== null && !(patch[c] instanceof Date) ? JSON.stringify(patch[c]) : patch[c]));
    return (await this.q(`UPDATE users SET ${sets} WHERE id=$1 RETURNING *`, [id, ...vals]))[0];
  }
  async addMatch(m) {
    await this.q(`INSERT INTO matches(user_id, mode, opponent, result, pos, duration_ms, reason, stats, verified, room_code, rating_delta)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [m.userId, m.mode, m.opponent, m.result, m.pos, m.durationMs, m.reason, JSON.stringify(m.stats || {}), !!m.verified, m.roomCode || null, m.ratingDelta ?? null]);
  }
  async matches(userId, limit = 30) {
    return this.q('SELECT * FROM matches WHERE user_id=$1 ORDER BY created_at DESC, id DESC LIMIT $2', [userId, limit]);
  }
  async summary(userId) { return summarize(await this.q('SELECT result, mode, verified FROM matches WHERE user_id=$1 ORDER BY created_at DESC, id DESC', [userId])); }
  async lastMatchAt(userId) {
    const r = await this.q('SELECT created_at FROM matches WHERE user_id=$1 AND verified=false ORDER BY created_at DESC LIMIT 1', [userId]);
    return r[0] ? new Date(r[0].created_at).getTime() : 0;
  }
  async leaderboard(limit = 20) {
    return this.q(`SELECT u.id, u.username, u.rating, u.pro, u.skin,
        COUNT(m.*) FILTER (WHERE m.verified) AS online,
        COUNT(m.*) FILTER (WHERE m.result='win') AS wins,
        COUNT(m.*) AS played
      FROM users u LEFT JOIN matches m ON m.user_id=u.id
      GROUP BY u.id HAVING COUNT(m.*) > 0
      ORDER BY (COUNT(m.*) FILTER (WHERE m.verified) > 0) DESC, u.rating DESC, wins DESC LIMIT $1`, [limit]);
  }
  async addPayment(p) {
    return (await this.q('INSERT INTO payments(user_id, plan, amount, status, test, brand, last4) VALUES($1,$2,$3,$4,TRUE,$5,$6) RETURNING *', [p.userId, p.plan, p.amount, p.status, p.brand || null, p.last4 || null]))[0];
  }
  async payment(id) { return (await this.q('SELECT * FROM payments WHERE id=$1', [id]))[0] || null; }
  async updatePayment(id, patch) {
    const cols = Object.keys(patch); const sets = cols.map((c, i) => `${c}=$${i + 2}`).join(',');
    return (await this.q(`UPDATE payments SET ${sets} WHERE id=$1 RETURNING *`, [id, ...cols.map((c) => patch[c])]))[0];
  }
  async payments(userId) { return this.q('SELECT id, plan, amount, currency, status, brand, last4, created_at FROM payments WHERE user_id=$1 ORDER BY created_at DESC, id DESC', [userId]); }
  async deleteUser(id) { await this.q('DELETE FROM users WHERE id=$1', [id]); }
}

class FileStore {
  constructor(file) { this.file = file; }
  async init() {
    try { this.d = JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch { this.d = { users: [], matches: [], payments: [], seq: 1 }; }
  }
  save() {
    clearTimeout(this.t);
    this.t = setTimeout(() => { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.d)); }, 100);
  }
  id() { return this.d.seq++; }
  async createUser(username, passHash) {
    if (await this.userByName(username)) { const e = new Error('duplicate'); e.code = '23505'; throw e; }
    const u = { id: this.id(), username, pass_hash: passHash, rating: 1000, pro: false, pro_plan: null, pro_until: null, pro_cancelled: false, sub_status: 'none', skin: 'classic', progress: {}, settings: {}, created_at: new Date().toISOString() };
    this.d.users.push(u); this.save(); return u;
  }
  async userByName(name) { return this.d.users.find((u) => u.username.toLowerCase() === String(name).toLowerCase()) || null; }
  async user(id) { return this.d.users.find((u) => u.id === id) || null; }
  async updateUser(id, patch) { const u = this.d.users.find((x) => x.id === id); Object.assign(u, patch); this.save(); return u; }
  async addMatch(m) {
    this.d.matches.push({ id: this.id(), user_id: m.userId, mode: m.mode, opponent: m.opponent, result: m.result, pos: m.pos, duration_ms: m.durationMs,
      reason: m.reason, stats: m.stats || {}, verified: !!m.verified, room_code: m.roomCode || null, rating_delta: m.ratingDelta ?? null, created_at: new Date().toISOString() });
    this.save();
  }
  async matches(userId, limit = 30) { return this.d.matches.filter((m) => m.user_id === userId).sort((a, b) => b.id - a.id).slice(0, limit); }
  async summary(userId) { return summarize(await this.matches(userId, 1e9)); }
  async lastMatchAt(userId) { const m = (await this.matches(userId, 1e9)).find((x) => !x.verified); return m ? new Date(m.created_at).getTime() : 0; }
  async leaderboard(limit = 20) {
    return this.d.users.map((u) => {
      const ms = this.d.matches.filter((m) => m.user_id === u.id);
      return { id: u.id, username: u.username, rating: u.rating, pro: u.pro, skin: u.skin, online: ms.filter((m) => m.verified).length, wins: ms.filter((m) => m.result === 'win').length, played: ms.length };
    }).filter((r) => r.played > 0).sort((a, b) => (b.online > 0) - (a.online > 0) || b.rating - a.rating || b.wins - a.wins).slice(0, limit);
  }
  async addPayment(p) { const r = { id: this.id(), user_id: p.userId, plan: p.plan, amount: p.amount, status: p.status, brand: p.brand || null, last4: p.last4 || null, attempts: 0, test: true, created_at: new Date().toISOString() }; this.d.payments.push(r); this.save(); return r; }
  async payment(id) { return this.d.payments.find((p) => p.id === id) || null; }
  async updatePayment(id, patch) { const p = await this.payment(id); Object.assign(p, patch); this.save(); return p; }
  async payments(userId) { return this.d.payments.filter((p) => p.user_id === userId).reverse(); }
  async deleteUser(id) {
    this.d.users = this.d.users.filter((u) => u.id !== id);
    this.d.matches = this.d.matches.filter((m) => m.user_id !== id);
    this.d.payments = this.d.payments.filter((p) => p.user_id !== id);
    this.save();
  }
}

export async function openStore() {
  const store = process.env.DATABASE_URL
    ? new PgStore(process.env.DATABASE_URL)
    : new FileStore(process.env.DATA_FILE || path.resolve('data/dev-db.json'));
  await store.init();
  // Any read of a user first switches off a Pro period that has ended (cancelled monthly plan or one-off organiser plan).
  const expire = async (u) => {
    if (u && !u.sub_status) u.sub_status = u.pro ? (u.pro_cancelled ? 'cancelled' : 'active') : 'none';
    if (u && u.pro && u.pro_until && new Date(u.pro_until) <= new Date()) {
      const settings = { ...(u.settings || {}), outfit: 'team', arena: 'steppe' };
      return store.updateUser(u.id, { pro: false, pro_plan: null, pro_until: null, pro_cancelled: false, sub_status: 'expired', skin: ['classic', 'steppe'].includes(u.skin) ? u.skin : 'classic', settings });
    }
    return u;
  };
  const rawUser = store.user.bind(store), rawByName = store.userByName.bind(store);
  store.user = async (id) => expire(await rawUser(id));
  store.userByName = async (n) => expire(await rawByName(n));
  store.kind = process.env.DATABASE_URL ? 'postgres' : 'file';
  return store;
}

export { publicUser };
