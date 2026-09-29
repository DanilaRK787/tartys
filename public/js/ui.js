import { lang } from './i18n.js';
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
/**
 * "← …" link at the top of a page.
 *  mode 'up'   — always goes to the fixed parent page (label says where);
 *  mode 'prev' — for detour pages (Pro, Login): back to where the user came from, else the fallback.
 */
export function backButton(target = '#/', label = '', mode = 'up') {
  return `<button class="back-btn" data-back="${target}" data-mode="${mode}">← <span>${label}</span></button>`;
}
export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }
let toastTimer;
export function notify(text, kind = '') {
  let el = document.getElementById('global-toast');
  if (!el) { el = document.createElement('div'); el.id = 'global-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.className = kind; el.textContent = text; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}
const LOCALES = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-GB' };
export function fmtDate(iso, withTime = true) {
  try {
    return new Date(iso).toLocaleString(LOCALES[lang()] || 'ru-RU', withTime ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return ''; }
}

/**
 * In-app confirmation (replaces the browser's confirm()). Resolves true/false.
 * Closes on the Cancel button, Esc or a click outside the window.
 */
export function confirmDialog({ title, text = '', ok = 'OK', cancel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'confirm-dialog';
    dlg.innerHTML = `<form method="dialog" class="confirm-box"><h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}
      <div class="row"><button class="btn ghost" value="no" type="button" data-no>${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" value="yes" data-yes>${esc(ok)}</button></div></form>`;
    document.body.appendChild(dlg);
    let done = false;
    const finish = (v) => { if (done) return; done = true; dlg.close(); dlg.remove(); resolve(v); };
    dlg.querySelector('[data-yes]').addEventListener('click', (e) => { e.preventDefault(); finish(true); });
    dlg.querySelector('[data-no]').addEventListener('click', () => finish(false));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(false); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) finish(false); }); // click on the dimmed backdrop
    dlg.showModal();
    dlg.querySelector('[data-no]').focus();
  });
}
