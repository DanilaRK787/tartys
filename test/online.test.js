import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import { io as connect } from 'socket.io-client';

process.env.DATA_FILE = path.join(os.tmpdir(), `tartys-test-${Date.now()}.json`);
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL; else delete process.env.DATABASE_URL;
const { createServer } = await import('../server/index.js');
const { prehash } = await import('../shared/pwhash.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const once = (s, ev) => new Promise((r) => s.once(ev, r));

async function setup() {
  const srv = await createServer();
  await new Promise((r) => srv.server.listen(0, r));
  const url = `http://localhost:${srv.server.address().port}`;
  const api = async (p, body, token) => {
    const res = await fetch(url + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const client = (auth) => connect(url, { auth, transports: ['websocket'], forceNew: true });
  return { srv, url, api, client, close: () => new Promise((r) => { srv.io.close(); srv.server.close(r); }) };
}

test('auth, offline match history and validation', async () => {
  const t = await setup();
  try {
    const login = await t.api('/api/auth/login', { username: 'demo', password: prehash('demo', 'tartys2026') });
    assert.equal(login.status, 200);
    assert.equal((await t.api('/api/auth/login', { username: 'demo', password: 'tartys2026' })).status, 401, 'plain passwords are not accepted');
    assert.equal((await t.api('/api/auth/available?username=demo')).body.available, false);
    assert.equal((await t.api('/api/auth/available?username=fresh_name')).body.available, true);
    const reg = await t.api('/api/auth/register', { username: 'Temp_User', password: prehash('Temp_User', 'secret1') });
    assert.equal(reg.status, 200);
    assert.equal((await t.api('/api/auth/register', { username: 'temp_user', password: prehash('temp_user', 'x1x1x1') })).body.error, 'taken');
    const del = await fetch(t.url + '/api/me', { method: 'DELETE', headers: { Authorization: 'Bearer ' + reg.body.token } });
    assert.equal(del.status, 200);
    assert.equal((await t.api('/api/auth/available?username=Temp_User')).body.available, true, 'deleted account frees the name');
    const tok = login.body.token;
    const before = (await t.api('/api/me', null, tok)).body.summary;
    assert.equal((await t.api('/api/matches', { mode: 'bot-hard', result: 'win', durationMs: 40000 }, tok)).status, 200);
    assert.equal((await t.api('/api/matches', { mode: 'hack', result: 'win', durationMs: 40000 }, tok)).status, 400);
    await new Promise((r) => setTimeout(r, 3100));
    assert.equal((await t.api('/api/matches', { mode: 'journey', opponent: 'Астана', result: 'loss', durationMs: 2000, reason: 'forfeit' }, tok)).status, 200);
    assert.equal((await t.api('/api/matches', { mode: 'bot-hard', result: 'win', durationMs: 5 }, tok)).status, 400);
    const me = await t.api('/api/me', null, tok);
    assert.equal(me.body.summary.wins - before.wins, 1); assert.equal(me.body.summary.losses - before.losses, 1);
    // Pro cosmetics are refused before paying — the client cannot unlock them by itself
    const put = async (body) => (await fetch(t.url + '/api/me', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(body) })).status;
    assert.equal(await put({ settings: { arena: 'bayterek' } }), 403);
    assert.equal(await put({ settings: { outfit: 'chapan' } }), 403);
    const card = (number, extra = {}) => ({ plan: 'org', card: { number, exp: '12/30', cvc: '123', name: 'DANILA AFANASYEV', ...extra } });
    assert.equal((await t.api('/api/pro/checkout', card('4242 4242 4242 4241'), tok)).body.error, 'card-number', 'Luhn check');
    assert.equal((await t.api('/api/pro/checkout', card('4242 4242 4242 4242', { exp: '01/20' }), tok)).body.error, 'card-exp');
    assert.equal((await t.api('/api/pro/checkout', card('4242 4242 4242 4242', { exp: '13/30' }), tok)).body.error, 'card-exp', 'month 13');
    assert.equal((await t.api('/api/pro/checkout', card('4242 4242 4242 4242', { name: 'Данила Афанасьев' }), tok)).body.error, 'card-name', 'Cyrillic name');
    assert.equal((await t.api('/api/pro/checkout', card('4242 4242 4242 4242', { name: 'DANILA' }), tok)).body.error, 'card-name', 'surname required');
    assert.equal((await t.api('/api/pro/checkout', card('4000 0000 0000 0002'), tok)).status, 402);
    const step1 = await t.api('/api/pro/checkout', card('4242 4242 4242 4242'), tok);
    assert.equal(step1.body.action, '3ds');
    const wrong = await t.api('/api/pro/confirm', { paymentId: step1.body.paymentId, code: '000000' }, tok);
    assert.equal(wrong.body.attemptsLeft, 2);
    const ok = await t.api('/api/pro/confirm', { paymentId: step1.body.paymentId, code: '123456' }, tok);
    assert.equal(ok.body.user.pro, true);
    assert.ok(ok.body.user.proSince);
    assert.equal(ok.body.receipt.last4, '4242');
    assert.equal((await t.api('/api/pro/confirm', { paymentId: step1.body.paymentId, code: '123456' }, tok)).status, 409, 'cannot confirm twice');
    assert.equal(await put({ settings: { arena: 'bayterek', outfit: 'chapan' } }), 200);
    // org plan: one-off, active for a month, no next charge
    const meOrg = (await t.api('/api/me', null, tok)).body.user;
    assert.equal(meOrg.nextChargeAt, null); assert.ok(meOrg.proUntil);
    // cancel keeps Pro active until the end of the period
    const c = await t.api('/api/pro/cancel', {}, tok);
    assert.equal(c.body.user.pro, true); assert.equal(c.body.user.subStatus, 'cancelled'); assert.ok(c.body.user.proUntil);
    // when the period is over, Pro switches off by itself and Pro cosmetics are reset
    const u = await t.srv.store.userByName('demo'); await t.srv.store.updateUser(u.id, { pro_until: new Date(Date.now() - 1000).toISOString() });
    const after = (await t.api('/api/me', null, tok)).body.user;
    assert.equal(after.pro, false); assert.equal(after.subStatus, 'expired'); assert.equal(after.settings.arena, 'steppe');
    assert.equal(await put({ settings: { arena: 'bayterek' } }), 403, 'Pro cosmetics locked again after expiry');
  } finally { await t.close(); }
});

test('online room: server-authoritative match, spam limits, forged messages ignored, same result for both', async () => {
  const t = await setup();
  const a = t.client({ clientId: 'client-aaaa-1111', name: 'Aru' });
  const b = t.client({ clientId: 'client-bbbb-2222', name: 'Bek' });
  try {
    const created = await new Promise((r) => a.emit('room:create', { format: '1v1', title: 'hack', theme: 'night' }, r));
    assert.ok(created.room.code);
    assert.equal(created.room.theme, 'steppe'); // guests cannot use organiser themes
    const joined = await new Promise((r) => b.emit('room:join', { code: created.room.code }, r));
    assert.equal(joined.seat, 's1');
    // input before start is ignored
    a.emit('input', { seq: 1, type: 'hold' });
    a.emit('room:ready'); b.emit('room:ready');
    await wait(3300);
    const snaps = { a: null, b: null };
    a.on('game:snap', (s) => (snaps.a = s)); b.on('game:snap', (s) => (snaps.b = s));
    await wait(120);
    assert.equal(snaps.a.phase, 'play');
    assert.equal(snaps.a.players[0].hold, false, 'pre-start hold must not carry over');
    // forged messages: position / winner cannot be set
    a.emit('input', { seq: 2, type: 'win' });
    a.emit('input', { seq: 3, type: 'setPos', value: -100 });
    // replay the same seq many times: counted once
    for (let i = 0; i < 50; i++) a.emit('input', { seq: 4, type: 'burst' });
    // spam 200 bursts with increasing seq: rate limit + cooldown
    for (let i = 5; i < 205; i++) b.emit('input', { seq: i, type: 'burst' });
    await wait(400);
    const bPl = snaps.a.players.find((p) => p.id === 's1');
    assert.ok(bPl.st >= 100 - 28 - 1, 'only one burst paid for, got stamina ' + bPl.st);
    // a holds until exhaustion — no way to hold forever
    a.emit('input', { seq: 300, type: 'hold' });
    await wait(4700);
    const aPl = snaps.a.players.find((p) => p.id === 's0');
    assert.equal(aPl.hold, false);
    assert.ok(aPl.ex > 0 || aPl.st > 0);
    // disconnect → pause, reconnect → resume
    b.disconnect();
    await wait(200);
    const pausedSnap = await once(a, 'game:snap').catch(() => null);
    const b2 = t.client({ clientId: 'client-bbbb-2222', name: 'Bek' });
    const re = await new Promise((r) => b2.emit('room:join', { code: created.room.code }, r));
    assert.equal(re.seat, 's1', 'reconnect takes back the same seat');
    // explicit leave → forfeit, both see same result
    const overA = new Promise((r) => a.on('room:state', (st) => st.status === 'over' && r(st)));
    b2.emit('room:leave');
    const st = await overA;
    assert.equal(st.lastResult.winner, 0);
    assert.equal(st.lastResult.reason, 'forfeit');
    b2.close();
  } finally { a.close(); b.close(); await t.close(); }
});

test('disconnect without return → technical win after timeout is scheduled; spectators cannot act', async () => {
  const t = await setup();
  const a = t.client({ clientId: 'client-cccc-3333' });
  const b = t.client({ clientId: 'client-dddd-4444' });
  const w = t.client({ clientId: 'client-eeee-5555' });
  try {
    const c = await new Promise((r) => a.emit('room:create', { format: '1v1' }, r));
    await new Promise((r) => b.emit('room:join', { code: c.room.code }, r));
    const sp = await new Promise((r) => w.emit('room:join', { code: c.room.code, watch: true }, r));
    assert.equal(sp.seat, null);
    a.emit('room:ready'); b.emit('room:ready');
    await wait(3300);
    let last; a.on('game:snap', (s) => (last = s));
    for (let i = 1; i < 30; i++) w.emit('input', { seq: i, type: 'burst' });
    await wait(300);
    assert.ok(Math.abs(last.pos) < 1, 'spectator inputs ignored');
    const ev = new Promise((r) => a.on('game:event', (evs) => evs.some((e) => e.type === 'disconnected') && r(evs)));
    b.disconnect();
    const evs = await ev;
    assert.ok(evs[0].until > Date.now());
    await wait(200);
    assert.equal(last.paused, true);
  } finally { a.close(); b.close(); w.close(); await t.close(); }
});

test('rated match between registered players updates Elo and history on both accounts', async () => {
  const t = await setup();
  const tok = async (u) => (await t.api('/api/auth/login', { username: u, password: prehash(u, 'tartys2026') })).body.token;
  const [ta, tb] = [await tok('demo'), await tok('demo2')];
  const before = [(await t.api('/api/me', null, ta)).body.user.rating, (await t.api('/api/me', null, tb)).body.user.rating];
  const a = t.client({ clientId: 'client-rate-aaaa', token: ta });
  const b = t.client({ clientId: 'client-rate-bbbb', token: tb });
  try {
    const c = await new Promise((r) => a.emit('room:create', { format: '1v1' }, r));
    await new Promise((r) => b.emit('room:join', { code: c.room.code }, r));
    a.emit('room:ready'); b.emit('room:ready');
    await wait(3400);
    const over = new Promise((r) => a.on('room:state', (st) => st.status === 'over' && r(st)));
    b.emit('room:leave');
    const st = await over;
    assert.equal(st.lastResult.winner, 0);
    await wait(300);
    const after = [(await t.api('/api/me', null, ta)).body.user.rating, (await t.api('/api/me', null, tb)).body.user.rating];
    assert.ok(after[0] > before[0] && after[1] < before[1], JSON.stringify({ before, after }));
    const hist = (await t.api('/api/matches', null, tb)).body.matches[0];
    assert.equal(hist.verified, true); assert.equal(hist.result, 'loss');
  } finally { a.close(); b.close(); await t.close(); }
});
