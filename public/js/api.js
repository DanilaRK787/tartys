import { token, setToken, localHistory, localProgress, markProgress } from './store.js';
import { prehash } from '/shared/pwhash.js';

let me = null; // current user (null = guest)
const listeners = new Set();

export function currentUser() { return me; }
export function onAuth(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function setMe(u) { me = u; listeners.forEach((fn) => fn(me)); }

export async function api(path, { method = 'GET', body, keepalive = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const tok = token(); if (tok) headers.Authorization = 'Bearer ' + tok;
  let res;
  try { res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined, keepalive }); }
  catch { return { ok: false, status: 0, error: 'server' }; }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && tok && path !== '/api/auth/login') { setToken(null); setMe(null); }
  return { ok: res.ok, status: res.status, ...data };
}

export async function restoreSession() {
  if (!token()) return null;
  const r = await api('/api/me');
  if (r.ok) setMe(r.user);
  return me;
}

export async function login(username, password, isRegister) {
  // the plain password is hashed right here and never sent anywhere
  const r = await api(isRegister ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body: { username, password: prehash(username, password) } });
  // Each account keeps only its own progress (from the server). Guest progress stays in this browser for the guest,
  // so a new account on a shared computer never inherits somebody else's cities or challenges.
  if (r.ok) { setToken(r.token); setMe(r.user); }
  return r;
}

export function logout() { setToken(null); setMe(null); }

/** If the paid period has just ended, ask the server again — it switches Pro off and the UI follows. */
export async function refreshIfProEnded() {
  if (me?.pro && me.proUntil && new Date(me.proUntil) <= new Date()) await restoreSession();
}
export function updateMe(u) { setMe(u); }

export async function reportMatch(m, opts = {}) {
  if (!me) return { ok: false, local: true };
  return api('/api/matches', { method: 'POST', body: m, keepalive: !!opts.keepalive });
}

export async function syncProgress(progress) {
  if (!me) return;
  const r = await api('/api/me', { method: 'PUT', body: { progress } });
  if (r.ok) setMe(r.user);
}

/** Progress of whoever is playing right now: the account's (server) or the guest's (this browser). */
export function currentProgress() { return me ? (me.progress || {}) : localProgress(); }

/** Save a progress step for the current player only. Account progress is updated at once (optimistic) and synced. */
export function saveProgress(id, patch) {
  if (!me) { markProgress(id, patch); return; }
  const prev = me.progress?.[id] || {};
  me.progress = { ...(me.progress || {}), [id]: { ...prev, done: !!(prev.done || patch.done), best: Math.max(prev.best || 0, patch.best || 0) } };
  syncProgress({ [id]: patch });
}

/** Local match history is a guest feature; accounts keep history on the server. */
export function saveLocalHistory(record, push) { if (!me) push(record); }

export async function history() {
  if (!me) return { matches: localHistory(), local: true };
  const r = await api('/api/matches?limit=40');
  return { matches: r.matches || [], local: false };
}
