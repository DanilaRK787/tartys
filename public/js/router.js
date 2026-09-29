const routes = [];
let cleanup = null;
// Normal pages the user visited (matches are NOT stored): "← Back" walks this list,
// so it can never drop the player back into a finished match or out of the site.
const trail = [];
let currentPathOnly = null;
let enteredFromApp = false; // was the current match opened from another page of the app?
const isMatchRoute = (path) => /^\/(play\/|tutorial$|room\/)/.test(path);

export function route(pattern, handler) { routes.push([pattern, handler]); }

/**
 * Navigate inside the app. Leaving a match screen REPLACES it in the browser history,
 * so the browser's own Back button does not restart a match that is already over.
 */
export function go(hash, { replace = false } = {}) {
  if (location.hash === hash) { render(); return; }
  const leavingMatch = currentPathOnly && isMatchRoute(currentPathOnly);
  // Match → the same page we came from (e.g. map → match → map): just step back, no duplicate entry.
  if (leavingMatch && hash === '#' + trail[trail.length - 1] && history.length > 1 && enteredFromApp) { history.back(); return; }
  if (replace || leavingMatch) {
    location.replace(location.pathname + location.search + hash);
  } else location.hash = hash;
}

export function currentPath() { return (location.hash || '#/').slice(1); }

export function render() {
  const full = currentPath();
  const [path, qs] = full.split('?');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  if (!isMatchRoute(path) && trail[trail.length - 1] !== path) trail.push(path);
  if (trail.length > 30) trail.shift();
  enteredFromApp = isMatchRoute(path) && currentPathOnly !== null && !isMatchRoute(currentPathOnly) ? true : isMatchRoute(path) ? enteredFromApp : false;
  currentPathOnly = path;
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  for (const [pattern, handler] of routes) {
    const m = path.match(pattern);
    if (m) { cleanup = handler({ params, match: m }) || null; window.scrollTo(0, 0); return; }
  }
  location.hash = '#/';
}

/** In-app "← Back": previous normal page (never a match); otherwise a sensible parent page. */
export function back(fallback = '#/') {
  while (trail.length && trail[trail.length - 1] === currentPathOnly) trail.pop();
  const target = trail.pop();
  go(target ? '#' + target : fallback, { replace: true });
}

export function startRouter() { window.addEventListener('hashchange', render); render(); }
