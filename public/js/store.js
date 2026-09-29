// Local persistence: settings, guest history, challenge progress, auth token.
// Every access is wrapped: private mode / blocked storage must never break the game.
const KEY = 'tartys:v2:';
function read(k, fallback) { try { const v = localStorage.getItem(KEY + k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } }
function write(k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch { /* storage unavailable */ } }

const DEFAULTS = { lang: (navigator.language || 'ru').startsWith('kk') ? 'kk' : 'ru',
  level: 'normal', sound: true, atlas: false, name: '', tutorialSeen: false, lastMode: 'bot', vibrate: true };
let cache = { ...DEFAULTS, ...read('settings', {}) };

export function settings() { return cache; }
export function saveSettings(patch) { cache = { ...cache, ...patch }; write('settings', cache); return cache; }

// Per-tab identity: survives reloads of the same tab (so a dropped player gets the seat back),
// but two tabs of one browser are two different players — handy for testing rooms on one computer.
export function clientId() {
  const gen = () => (crypto.randomUUID ? crypto.randomUUID() : 'c' + Math.random().toString(36).slice(2) + Date.now().toString(36));
  try {
    let id = sessionStorage.getItem(KEY + 'tabId');
    if (!id) { id = gen(); sessionStorage.setItem(KEY + 'tabId', id); }
    return id;
  } catch {
    if (!window.__tartysTabId) window.__tartysTabId = gen();
    return window.__tartysTabId;
  }
}

export function localHistory() { return read('history', []); }
export function pushLocalHistory(m) { const h = localHistory(); h.unshift({ ...m, createdAt: new Date().toISOString() }); write('history', h.slice(0, 60)); }

export function localProgress() { return read('progress', {}); }
export function markProgress(id, patch) {
  const p = localProgress(); const prev = p[id] || {};
  p[id] = { done: !!(prev.done || patch.done), best: Math.max(prev.best || 0, patch.best || 0) };
  write('progress', p); return p[id];
}

export function token() { return read('token', null); }
export function setToken(tok) { write('token', tok); }
