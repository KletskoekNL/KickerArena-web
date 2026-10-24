// Small UI toolkit: escaping, DOM morphing, avatars, toasts, modals, sound, confetti.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);

// ------------------------------------------------------------------ morph
// Patches the live DOM to match freshly rendered HTML so CSS transitions
// (score digits, ball, odds bars) animate and focused inputs survive updates.
function same(a, b) {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType !== 1) return true;
  return a.tagName === b.tagName && (a.getAttribute('data-key') || '') === (b.getAttribute('data-key') || '');
}

function morphNode(a, b) {
  if (a.nodeType !== 1) {
    if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
    return;
  }
  // Kept by the browser or by an animation, not by the render: an opened
  // <details> and the style of [data-anim] elements.
  const own = (name) => (a.tagName === 'DETAILS' && name === 'open') || (name === 'style' && b.hasAttribute('data-anim'));
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name) && !own(name)) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value && !own(name)) a.setAttribute(name, value);
  if (b.hasAttribute('data-static')) return; // content is managed elsewhere (e.g. the live log)
  if (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT') {
    if (document.activeElement !== a && !a._typed) {
      if (a.type === 'checkbox' || a.type === 'radio') a.checked = b.checked;
      else if (a.tagName !== 'SELECT') a.value = b.getAttribute('value') ?? b.value ?? '';
    }
    if (a.tagName !== 'SELECT') return;
  }
  morphChildren(a, b);
  if (a.tagName === 'SELECT' && document.activeElement !== a) {
    const sel = [...b.options].findIndex((o) => o.hasAttribute('selected'));
    if (sel >= 0) a.selectedIndex = sel;
  }
}

// A field someone typed in keeps its value through live updates until its
// form is sent (then the render shows what was saved).
if (typeof document !== 'undefined') {
  document.addEventListener('input', (e) => { if (e.target.form) e.target._typed = true; }, true);
  document.addEventListener('submit', (e) => { for (const el of e.target.elements || []) el._typed = false; }, true);
}

function morphChildren(a, b) {
  const want = [...b.childNodes];
  for (let i = 0; i < want.length; i++) {
    const nb = want[i];
    const na = a.childNodes[i];
    if (na && same(na, nb)) { morphNode(na, nb); continue; }
    const key = nb.nodeType === 1 && nb.getAttribute('data-key');
    let found = null;
    if (key) {
      for (let k = i + 1; k < a.childNodes.length; k++) {
        const c = a.childNodes[k];
        if (c.nodeType === 1 && c.getAttribute('data-key') === key) { found = c; break; }
      }
    }
    if (found) { a.insertBefore(found, na || null); morphNode(found, nb); }
    else a.insertBefore(nb.cloneNode(true), na || null);
  }
  while (a.childNodes.length > want.length) a.removeChild(a.lastChild);
}

export function patch(el, html) {
  const t = document.createElement(el.tagName === 'svg' ? 'div' : el.tagName);
  t.innerHTML = html;
  morphChildren(el, t);
}

// ------------------------------------------------------------------ format
const rtf = new Intl.RelativeTimeFormat('nl', { numeric: 'auto' });
export function ago(ms) {
  const s = (ms - Date.now()) / 1000;
  const a = Math.abs(s);
  if (a < 45) return 'zojuist';
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (a < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day');
  return new Date(ms).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}
export const clock = (ms) => new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
export const dayLabel = (ms) => {
  const d = new Date(ms); const t = new Date();
  const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'Vandaag';
  if (d.toDateString() === y.toDateString()) return 'Gisteren';
  return d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' });
};
export const waited = (ms) => {
  const m = Math.floor((Date.now() - ms) / 60000);
  return m < 1 ? 'net' : m < 60 ? `${m} min` : `${Math.floor(m / 60)}u ${m % 60}m`;
};
export const pct = (x) => `${Math.round(x * 100)}%`;
export const r0 = (x) => Math.round(x);
export const signed = (x, d = 0) => {
  const v = Number(x.toFixed(d)); // round first, so -0.04 shows as ±0
  return (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(d);
};

// ------------------------------------------------------------------ avatars
// The Android robot, as an icon the size of the text around it. (The robot
// is reproduced or modified from work created and shared by Google and used
// according to terms described in the Creative Commons 3.0 Attribution License.)
export const ANDROID = '<svg class="droid" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.3 10.2 5.6 7.3M16.7 10.2l1.7-2.9" fill="none" stroke="var(--droid, #3ddc84)" stroke-width="1.4" stroke-linecap="round"/><path d="M2.5 18a9.5 9.5 0 0 1 19 0z" fill="var(--droid, #3ddc84)"/><circle cx="7.9" cy="14.1" r="1.05" fill="#fff"/><circle cx="16.1" cy="14.1" r="1.05" fill="#fff"/></svg>';

// The four panes of Windows 11. (Windows is a trademark of Microsoft; the
// panes only say which platform is meant.)
export const WINDOWS = '<svg class="winlogo" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h8.4v8.4H3zM12.6 3H21v8.4h-8.4zM3 12.6h8.4V21H3zM12.6 12.6H21V21h-8.4z" fill="var(--win, #2f9bf0)"/></svg>';

// A globe for a browser on the server's website, and the GitHub mark for the
// web app, which is hosted there. (The mark is a trademark of GitHub; it only
// says where the page comes from.)
export const GLOBE = '<svg class="globe" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#10233a" stroke="#6db6ff" stroke-width="1.4"/><path d="M3 12h18M12 3c-3.2 3-3.2 15 0 18M12 3c3.2 3 3.2 15 0 18M4.6 7.5h14.8M4.6 16.5h14.8" fill="none" stroke="#6db6ff" stroke-width="1.1"/></svg>';
export const GITHUB = '<svg class="ghmark" viewBox="0 0 16 16" aria-hidden="true"><path fill="var(--gh, #f0f3f6)" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';

// Tux, the Linux penguin, drawn the same way. (Tux was created by Larry
// Ewing, lewing@isc.tamu.edu, with The GIMP.)
export const TUX = '<svg class="tux" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.2c-2.7 0-4.4 2-4.4 4.9 0 1.5.2 2.6-.8 4.2C5.3 12.6 4 14.9 4 17.5c0 1.3.5 2.3 1.5 3h13c1-.7 1.5-1.7 1.5-3 0-2.6-1.3-4.9-2.8-7.2-1-1.6-.8-2.7-.8-4.2 0-2.9-1.7-4.9-4.4-4.9z" fill="#17181c" stroke="#aeb6bf" stroke-width=".7" stroke-linejoin="round"/><path d="M12 9.8c-2 0-4 3.6-4 6.9 0 2.3 1.5 3.5 4 3.5s4-1.2 4-3.5c0-3.3-2-6.9-4-6.9z" fill="#f6f4ee"/><ellipse cx="10.3" cy="6.1" rx="1.15" ry="1.55" fill="#fff"/><ellipse cx="13.7" cy="6.1" rx="1.15" ry="1.55" fill="#fff"/><circle cx="10.65" cy="6.35" r=".6" fill="#17181c"/><circle cx="13.35" cy="6.35" r=".6" fill="#17181c"/><path d="M12 7.3c-1.4 0-2.8.9-2.8 1.6 0 .8 1.5 1.6 2.8 1.6s2.8-.8 2.8-1.6c0-.7-1.4-1.6-2.8-1.6z" fill="#f5a524" stroke="#b86e00" stroke-width=".35"/><ellipse cx="7.4" cy="21.3" rx="3.5" ry="1.7" fill="#f5a524" stroke="#b86e00" stroke-width=".35"/><ellipse cx="16.6" cy="21.3" rx="3.5" ry="1.7" fill="#f5a524" stroke="#b86e00" stroke-width=".35"/></svg>';

export const EMOJIS = ['⚽', '🦁', '🐯', '🦊', '🐻', '🐼', '🐨', '🐸', '🐵', '🦄', '🐲', '🦅', '🦈', '🐙', '🐝', '🦖', '🐺', '🦉', '🐧', '🦩', '🐢', '🦔', '🤖', '👽', '👻', '🤠', '😎', '🥷', '🧙', '🦸', '🧛', '🤡', '💀', '👑', '⚡', '🔥', '🚀', '🌟', '💎', '🎯', '🎸', '🍕', '🌶️', '🍀', '🍺', '☕', '🧀', '🌈'];
export const COLORS = ['#e63946', '#f4722b', '#f6b31b', '#8ac926', '#2a9d8f', '#1d9bf0', '#3a56d4', '#7b2cbf', '#c9184a', '#ff70a6', '#6d6875', '#264653', '#b08968', '#4a4e69'];

// An emoji is drawn differently on every system: bigger than its font size
// says, and not in the middle of its line. So the drawing itself is measured
// once, and the emoji is placed in the disc by what is really seen: centred,
// and filling the same part of it everywhere.
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
const FILL = 0.56; // the largest side of the drawing, as a part of the disc
const fits = new Map();
let pen = null;

function fit(em) {
  let f = fits.get(em);
  if (f) return f;
  // Without a measurement: a drawing of 1.2 em, a little below the baseline.
  let box = { l: 0, r: 1.2, up: 0.95, down: 0.25 };
  try {
    pen ||= document.createElement('canvas').getContext('2d');
    pen.font = `700 100px ${EMOJI_FONT}`;
    const m = pen.measureText(em);
    const b = { l: -m.actualBoundingBoxLeft / 100, r: m.actualBoundingBoxRight / 100, up: m.actualBoundingBoxAscent / 100, down: m.actualBoundingBoxDescent / 100 };
    if (b.r - b.l > 0.1 && b.up + b.down > 0.1) box = b;
  } catch { /* keep the estimate */ }
  const size = 100 * FILL / Math.max(box.r - box.l, box.up + box.down);
  f = { size: size.toFixed(1), x: (50 - size * (box.l + box.r) / 2).toFixed(1), y: (50 + size * (box.up - box.down) / 2).toFixed(1) };
  fits.set(em, f);
  return f;
}

/** The inside of an avatar disc: one emoji (or a letter), exactly in the middle. */
export function emojiMark(em) {
  const f = fit(em);
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><text x="${f.x}" y="${f.y}" font-size="${f.size}">${esc(em)}</text></svg>`;
}

export function avatar(p, size = '', online = false) {
  if (!p) return `<span class="av ${size}" style="--pc:#333">${emojiMark('?')}</span>`;
  const em = p.emoji || p.name.slice(0, 1).toUpperCase();
  return `<span class="av ${size}" style="--pc:${esc(p.color || '#2a7')}" title="${esc(p.name)}">${emojiMark(em)}${online ? '<i class="dot"></i>' : ''}</span>`;
}

export function who(p, size = 's', link = true) {
  if (!p) return '<span class="who">?</span>';
  const name = link ? `<a class="pname" href="#/player/${esc(p.id)}">${esc(p.name)}</a>` : `<span class="pname">${esc(p.name)}</span>`;
  return `<span class="who">${avatar(p, size)}<span>${name}</span></span>`;
}

// ------------------------------------------------------------------ toast & modal
export function toast(text, kind = '') {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  box.appendChild(el);
  while (box.children.length > 5) box.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, kind === 'err' ? 5000 : 4000);
}

let modalClose = null;
export function modal(html, onMount) {
  closeModal();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog">${html}</div>`;
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) closeModal(); });
  document.body.appendChild(bg);
  modalClose = () => bg.remove();
  const m = bg.firstChild;
  onMount?.(m);
  m.querySelector('[autofocus]')?.focus();
  return m;
}
/** Copies text; works on plain http pages too (the website on the LAN). */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  const t = document.createElement('textarea');
  t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
  document.body.appendChild(t); t.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* ignore */ }
  t.remove();
  return ok;
}
export function closeModal() { modalClose?.(); modalClose = null; }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); clearFx(); } });

export function confirmBox(title, text, okLabel = 'OK', danger = false, noLabel = 'Terug') {
  return new Promise((resolve) => {
    const m = modal(`<h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>
      <div class="foot"><button class="btn" data-x="no">${esc(noLabel)}</button><button class="btn ${danger ? 'red' : 'primary'}" data-x="yes">${esc(okLabel)}</button></div>`);
    m.addEventListener('click', (e) => {
      const x = e.target.closest('[data-x]')?.dataset.x;
      if (!x) return;
      closeModal();
      resolve(x === 'yes');
    });
  });
}

/** A question with several answers; resolves with the chosen value (null = closed). */
export function choiceBox(title, text, options) {
  return new Promise((resolve) => {
    const m = modal(`<h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>
      <div class="choices">${options.map((o, i) => `<button class="btn ${o.cls || ''}" data-i="${i}"><b>${esc(o.label)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</button>`).join('')}</div>
      <div class="foot"><button class="btn" data-i="-1">Terug</button></div>`);
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      closeModal();
      const i = Number(b.dataset.i);
      resolve(i < 0 ? null : options[i].value);
    });
  });
}

// ------------------------------------------------------------------ FX overlays
let fxTimer;
export function fx(html, ms = 2000, cls = '') {
  const box = $('#fx');
  clearTimeout(fxTimer);
  box.innerHTML = html;
  if (cls) { const f = document.createElement('div'); f.className = `flash ${cls}`; box.prepend(f); }
  fxTimer = setTimeout(clearFx, ms);
}
function clearFx() { clearTimeout(fxTimer); const b = $('#fx'); if (b) b.innerHTML = ''; }

// ------------------------------------------------------------------ sound
// Everything is synthesised with WebAudio: no audio files needed.
let ac;
export const sound = { on: true };
export function unlockAudio() { ctx(); }
function ctx() {
  if (!sound.on) return null;
  ac ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
function tone(c, freq, start, dur, type = 'sine', gain = 0.2, slideTo) {
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, start + dur);
  o.connect(g).connect(c.destination);
  o.start(start); o.stop(start + dur + 0.05);
}
function noise(c, start, dur, gain = 0.25, freq = 900) {
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.6;
  const g = c.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.25);
  g.gain.setValueAtTime(gain, start + dur * 0.5);
  g.gain.exponentialRampToValueAtTime(0.001, start + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(start);
}
export const sfx = {
  click() { const c = ctx(); if (c) tone(c, 900, c.currentTime, 0.05, 'square', 0.05); },
  goal() {
    const c = ctx(); if (!c) return; const t = c.currentTime;
    tone(c, 180, t, 0.08, 'square', 0.25, 90); // the ball hitting the back of the goal
    noise(c, t + 0.05, 2.2, 0.35, 700); // crowd roar
    noise(c, t + 0.1, 2.0, 0.2, 1800);
    [0, 0.18].forEach((d) => { tone(c, 466, t + 0.15 + d, 0.5, 'sawtooth', 0.09); tone(c, 587, t + 0.15 + d, 0.5, 'sawtooth', 0.07); });
  },
  whistle() {
    const c = ctx(); if (!c) return; const t = c.currentTime;
    [0, 0.32, 0.64].forEach((d, i) => {
      const o = c.createOscillator(); const g = c.createGain(); const lfo = c.createOscillator(); const lg = c.createGain();
      o.frequency.value = 2900; lfo.frequency.value = 38; lg.gain.value = 140;
      lfo.connect(lg).connect(o.frequency);
      const len = i === 2 ? 0.7 : 0.22;
      g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.09, t + d + 0.02); g.gain.setValueAtTime(0.09, t + d + len - 0.04); g.gain.linearRampToValueAtTime(0, t + d + len);
      o.connect(g).connect(c.destination); o.start(t + d); lfo.start(t + d); o.stop(t + d + len); lfo.stop(t + d + len);
    });
  },
  ding() {
    const c = ctx(); if (!c) return; const t = c.currentTime;
    [[784, 0], [988, 0.14], [1175, 0.28], [1568, 0.42]].forEach(([f, d]) => tone(c, f, t + d, 0.6, 'triangle', 0.18));
  },
  fanfare() {
    const c = ctx(); if (!c) return; const t = c.currentTime;
    [[523, 0, 0.18], [659, 0.18, 0.18], [784, 0.36, 0.18], [1047, 0.54, 0.7]].forEach(([f, d, l]) => { tone(c, f, t + d, l, 'sawtooth', 0.08); tone(c, f / 2, t + d, l, 'triangle', 0.12); });
  },
  sad() {
    const c = ctx(); if (!c) return; const t = c.currentTime;
    [[392, 0, 0.45], [370, 0.5, 0.45], [349, 1.0, 0.45], [330, 1.5, 1.2]].forEach(([f, d, l]) => tone(c, f, t + d, l, 'sawtooth', 0.09, d === 1.5 ? 300 : undefined));
  },
};

// ------------------------------------------------------------------ confetti
export function confetti(colors = ['#ffc83d', '#0b0b0c', '#ffffff', '#9aa2ad'], n = 180) {
  const cv = $('#confetti');
  const g = cv.getContext('2d');
  cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio;
  g.scale(devicePixelRatio, devicePixelRatio);
  const parts = Array.from({ length: n }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 200, y: innerHeight * 0.45,
    vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 18 - 6,
    w: 6 + Math.random() * 8, h: 4 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const t0 = performance.now();
  (function frame(t) {
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.42; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c;
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2))); g.restore();
    }
    if (t - t0 < 4500) requestAnimationFrame(frame); else g.clearRect(0, 0, innerWidth, innerHeight);
  })(t0);
}
