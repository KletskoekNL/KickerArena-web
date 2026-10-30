// Shared application state and helpers.
import { computeStats } from './stats.js';
import { toast } from './ui.js';
import { normalizeCode, validCode, formatCode } from './bus.js';

// Injected by the desktop client (KickerArena.exe), or by the server's
// website on the local network (web: true). Without it the page is hosted
// somewhere as plain files (the web app): it talks to the brokers itself and
// keeps the pairing code in this browser.
export const isHosted = !window.KA_NATIVE;

function stored(key) {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}

function hostedNative() {
  // A link that ends in #k=<pairing code> pairs right away. The part after
  // the # never leaves the browser.
  const m = /^#k=([A-Za-z0-9-]+)$/.exec(location.hash);
  if (m) {
    if (validCode(m[1])) pairHosted(m[1]);
    history.replaceState(null, '', location.pathname + location.search);
  }
  const code = stored('ka.code');
  return { token: '', hosted: true, paired: !!code, code: formatCode(code), version: window.KA_PAGES?.version || 'dev' };
}

/** Remembers the pairing code in this browser ('' forgets it); false when it is not a code. */
export function pairHosted(code) {
  if (code && !validCode(code)) return false;
  try {
    if (code) localStorage.setItem('ka.code', normalizeCode(code));
    else localStorage.removeItem('ka.code');
  } catch { return false; }
  return true;
}

export const native = window.KA_NATIVE || hostedNative();
export const isWeb = !!native.web;
// The page is the client itself and talks to the brokers: the web app, and
// the Windows and Linux app (which only pass the bytes on, see link.js).
export const viaBus = isHosted || !!native.bus;
// Settings of this device live in the browser instead of in a file of the app.
const inBrowser = isWeb || isHosted;

export const S = {
  cfg: {},
  link: null,
  conn: { server: 'offline', brokers: [] },
  state: null,
  history: [],
  online: { pids: [], n: 0 },
  ui: { rank: '2v2', hp: '', hm: '', limit: 60, fs: false, when: '', tryStart: Date.now() },
  goalFlash: null,
  render: () => {},
};

// The device asks for less motion. On Windows that is also the case on a
// server or over remote desktop, where nobody chose it: so the moving table
// follows it by default, and the user can decide otherwise in the settings.
export const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const tableMoves = () => S.cfg.motion ?? !calm;

let statsCache = null;
let statsKey = '';
export function stats() {
  const key = `${S.history.length}:${S.historyRev || 0}:${players().length}`;
  if (!statsCache || key !== statsKey) {
    statsCache = computeStats(S.history, players());
    statsKey = key;
  }
  return statsCache;
}

export const players = () => S.state?.players || [];
export const P = (id) => players().find((p) => p.id === id);
export const me = () => P(S.cfg.me);
export const settings = () => S.state?.settings || { goalsToWin: 10, gamesPerMatch: 2, title: 'KickerArena' };
export const teamName = (t) => (t === 0 ? 'Zwart' : 'Wit');
export const names = (ids) => ids.map((id) => P(id)?.name || '?').join(' & ');

export function route() {
  const [name = 'arena', arg = ''] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: name || 'arena', arg: decodeURIComponent(arg) };
}

export async function cmd(op, a = {}, quiet = false) {
  if (!S.link) throw new Error('Geen verbinding');
  try {
    return await S.link.cmd(op, a);
  } catch (e) {
    if (!quiet) toast(e.message, 'err');
    throw e;
  }
}

// ---------------------------------------------------------------- config
// Desktop app: stored in KickerArena.json next to the exe.
// Website and web app: stored in this browser.
export async function loadCfg() {
  if (inBrowser) {
    try { return JSON.parse(localStorage.getItem('ka.cfg')) || {}; } catch { return {}; }
  }
  try {
    const r = await fetch('/native/config', { headers: { 'X-Native-Token': native.token } });
    return (await r.json()) || {};
  } catch { return {}; }
}

export async function saveCfg() {
  if (inBrowser) {
    try { localStorage.setItem('ka.cfg', JSON.stringify(S.cfg)); } catch { /* private window: not remembered */ }
    return;
  }
  await fetch('/native/config', { method: 'POST', headers: { 'X-Native-Token': native.token, 'Content-Type': 'application/json' }, body: JSON.stringify(S.cfg) }).catch(() => {});
}

export function nativeAttention(title, body) {
  fetch('/native/attention', { method: 'POST', headers: { 'X-Native-Token': native.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ title, body }) }).catch(() => {});
}
