// KickerArena front-end: boot, live link, effects and actions.
import { LocalLink, BusLink } from './link.js';
import { S, P, me, settings, route, cmd, loadCfg, saveCfg, native, isWeb, isHosted, pairHosted, nativeAttention, names, teamName } from './store.js';
import * as U from './ui.js';
import { header, view, CONNECT_TIMEOUT } from './views.js';
import { whoModal, pairModal, playerModal, editModal, manualModal, signupOtherModal, setMe, tournamentModal, tournamentAddModal, qrModal, timeModal } from './modals.js';
import { bindCharts } from './chart.js';
import { matchWins } from './stats.js';
import './sim.js';
import { keepAwake } from './awake.js';
import { countdown, delayButtons } from './arena.js';
import { isLater, whenMs, canStepOut } from './bits.js';

const $top = document.getElementById('top');
const $view = document.getElementById('view');
let askedWho = false;

// ---------------------------------------------------------------- render
let raf = 0;
function render() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    U.patch($top, header());
    U.patch($view, view());
    keepAwake($view.querySelector('.tablecard.fs')); // table mode on screen: keep it on
    document.title = titleBlink.on ? titleBlink.text : S.state ? `${settings().title} · KickerArena` : 'KickerArena';
  });
}
S.render = render;

// ---------------------------------------------------------------- boot
// Shows the "could not connect" screen once the timeout has passed.
function scheduleTimeout() {
  if (isWeb) return;
  setTimeout(() => { if (!S.state) render(); }, CONNECT_TIMEOUT + 300);
}

async function boot() {
  S.cfg = await loadCfg();
  U.sound.on = S.cfg.sound !== false;
  bindCharts(document.body);
  window.addEventListener('hashchange', () => { scrollTo(0, 0); render(); });
  setInterval(render, 30000);
  // Countdowns (a requested delay) tick every second without a full render.
  setInterval(() => {
    for (const el of document.querySelectorAll('[data-until]')) el.innerHTML = countdown(Number(el.dataset.until));
  }, 1000);
  const link = isHosted ? new BusLink(native.code) : new LocalLink(native.token, isWeb);
  S.link = link;
  // The web app: a phone only shows a notification that comes from a service worker.
  if (isHosted && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  link.addEventListener('status', (e) => {
    const was = S.conn.server;
    S.conn = e.detail;
    if (was !== 'ok' && S.conn.server === 'ok' && S.cfg.me) link.me(S.cfg.me);
    render();
  });
  link.addEventListener('msg', (e) => onMsg(e.detail));
  link.start(); // presence is sent once the link reports "ok"
  render();
  scheduleTimeout();
  if (!isWeb && native.paired === false) setTimeout(() => pairModal(true), 200);
}

const STALE = 20000;

function onMsg(m) {
  switch (m.t) {
    case 'state': {
      const d = m.d;
      d.players ||= []; d.queue ||= []; d.active ||= [];
      const first = !S.state;
      S.state = d;
      // The server's data was replaced (import): log out and ask who you are again.
      const epoch = d.epoch || '';
      if (S.cfg.epoch === undefined) { S.cfg.epoch = epoch; saveCfg(); }
      else if (S.cfg.epoch !== epoch) {
        S.cfg.epoch = epoch; S.cfg.me = ''; S.cfg.spectator = false;
        saveCfg();
        S.link?.me('');
        askedWho = true;
        setTimeout(() => { U.closeModal(); U.toast('De gegevens van de server zijn vervangen. Meld je opnieuw aan.', 'gold'); whoModal(); }, 300);
      }
      // The server was updated while this page stayed open (a tablet next to
      // the table): load the new version of the page. At most once a minute,
      // in case something keeps the versions apart.
      if (isWeb && d.version && native.version && d.version !== native.version) {
        const last = Number(sessionStorage.getItem('ka.reloaded') || 0);
        if (Date.now() - last > 60000) {
          sessionStorage.setItem('ka.reloaded', String(Date.now()));
          setTimeout(() => location.reload(), 300);
        }
      }
      // The website moved to another port (changed in the settings): follow it.
      if (isWeb && d.settings.webPort && Number(location.port || 80) !== d.settings.webPort) {
        setTimeout(() => { location.port = String(d.settings.webPort); }, 600);
      }
      if (first && !askedWho && !S.cfg.spectator && !me()) { askedWho = true; setTimeout(whoModal, 300); }
      break;
    }
    case 'history': S.history = m.d || []; S.historyRev = (S.historyRev || 0) + 1; break;
    case 'hist+': S.history.push(m.d); S.historyRev = (S.historyRev || 0) + 1; break;
    case 'online': S.online = m.d; break;
    case 'reload': if (isWeb) setTimeout(() => location.reload(), 300); break; // the server has a new pairing code
    // An app whose page was asleep hands over everything it missed at once:
    // no sounds and popups for what happened a while ago. The state shows it.
    case 'note': if (!(m.at && Date.now() - m.at > STALE)) onNote(m.d); break;
  }
  render();
}

// ---------------------------------------------------------------- live effects
const titleBlink = { on: false, text: '', timer: 0 };
function blinkTitle(text) {
  clearInterval(titleBlink.timer);
  let n = 0;
  titleBlink.text = text;
  titleBlink.timer = setInterval(() => {
    titleBlink.on = !titleBlink.on && n++ < 30 && !document.hasFocus();
    render();
    if (n >= 30 || document.hasFocus()) { clearInterval(titleBlink.timer); titleBlink.on = false; render(); }
  }, 900);
}

function desktopNotify(title, body) {
  if (window.KAndroid) return; // the Android app notifies by itself, also when this page is asleep
  if (!isWeb && !isHosted) { nativeAttention(title, body); return; }
  if (!('Notification' in window) || Notification.permission !== 'granted' || document.hasFocus()) return;
  if (isHosted && 'serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, { body, icon: 'img/icon-192.png', tag: 'ka', renotify: true })).catch(() => {});
    return;
  }
  try { new Notification(title, { body, icon: 'img/logo.svg' }); } catch { /* ignore */ }
}

function shakeTable() {
  const t = document.querySelector('.tablecard');
  if (!t) return;
  t.classList.remove('shake'); void t.offsetWidth; t.classList.add('shake');
}

// Lights up the scoring side of the table for a moment.
function flashTable(n) {
  S.goalFlash = { mid: n.mid, team: n.team, until: Date.now() + 4500 };
  setTimeout(render, 4600);
}

const findMatch = (id) => S.state?.active.find((x) => x.id === id) || S.history.find((x) => x.id === id);

function onNote(n) {
  n.team = n.team === 1 ? 1 : 0;
  const mine = !!S.cfg.me && n.pids?.includes(S.cfg.me);
  const watching = route().name === 'arena';
  const tc = n.team === 1 ? 'b' : 'r';
  switch (n.kind) {
    case 'goal': {
      if (!(watching || mine)) break; // goals only matter at the table
      flashTable(n);
      const m = S.state?.active.find((x) => x.id === n.mid);
      const lv = m?.live?.length === 2 ? `${m.live[0]} - ${m.live[1]}` : '';
      U.fx(`<div class="goalfx ${tc}">GOAL!<small>${U.esc(lv)}</small></div>`, 1700, tc);
      U.sfx.goal();
      shakeTable();
      break;
    }
    case 'champion': {
      // Comes together with the final result of the last match: celebrate after it.
      setTimeout(() => championFx(n), 6500);
      break;
    }
    case 'game': {
      if (!(watching || mine)) { U.toast(n.text); break; }
      flashTable(n);
      const m = findMatch(n.mid);
      const w = m ? matchWins(m) : null;
      U.fx(`<div class="goalfx ${tc}">${teamName(n.team).toUpperCase()}!<small>${U.esc(`wint spel ${m ? m.games.length : ''}${w ? ` · ${w[0]} - ${w[1]}` : ''}`)}</small></div>`, 1900, tc);
      U.sfx.goal();
      shakeTable();
      break;
    }
    case 'crawl': {
      if (!(watching || mine)) { U.toast(n.text); break; }
      flashTable(n);
      const m = findMatch(n.mid);
      const losers = m ? names(m.teams[1 - n.team]) : '';
      U.fx(`<div class="crawlfx"><div class="t">ONDER DE TAFEL!</div><div class="snail">🐌</div><div style="font-size:22px;font-weight:800">${U.esc(losers)} ${losers.includes('&') ? 'moeten' : 'moet'} kruipen!</div></div>`, 4200, 'g');
      U.sfx.goal();
      setTimeout(() => U.sfx.sad(), 900);
      break;
    }
    case 'called': {
      if (mine) {
        const called = S.state?.active.find((x) => x.id === n.mid);
        U.fx(`<div class="callfx"><div style="font-size:60px">📣</div><div class="t">JIJ BENT AAN DE BEURT!</div>
          <div class="s">${U.esc(n.text.replace(/^📣\s*/, ''))}</div><button class="btn primary lg" onclick="document.getElementById('fx').innerHTML=''">Ik kom eraan! ⚽</button>
          ${called && canStepOut(called, S.cfg.me) ? `<div class="cant"><span class="muted small">Komt het niet uit?</span><div class="delaybtns">${delayButtons(called)}</div></div>` : ''}</div>`, 20000, 'g');
        U.sfx.ding();
        blinkTitle('📣 Jij bent aan de beurt!');
        desktopNotify('⚽ Jij bent aan de beurt!', n.text.replace(/^📣\s*/, ''));
      } else {
        U.toast(n.text, 'gold');
        if (watching) U.sfx.whistle();
      }
      break;
    }
    case 'final': {
      const m = S.history.find((x) => x.id === n.mid);
      if (!m || !(watching || mine)) { U.toast(n.text, 'gold'); break; }
      const crawled = m.games[m.games.length - 1]?.crawl;
      setTimeout(() => finalFx(m), crawled ? 4300 : 1700);
      break;
    }
    case 'due': // the moment someone chose to join in has come
      if (!mine) break; // the queue shows it
      U.toast('🕐 Het is zover: je doet nu mee', 'gold');
      U.sfx.ding();
      desktopNotify('🕐 Je doet nu mee', 'Je staat vanaf nu in de rij voor een wedstrijd.');
      break;
    case 'feedback':
      if (mine) U.toast(n.text, n.text.startsWith('✅') ? 'gold' : 'err');
      break;
    case 'join':
      if (watching) U.sfx.click(); // the queue itself shows it
      else U.toast(n.text);
      break;
    default:
      U.toast(n.text);
  }
}

function championFx(n) {
  U.fx(`<div class="finalfx" onclick="document.getElementById('fx').innerHTML=''"><div class="trophy">🏆</div>
    <div class="t" style="color:var(--gold)">KAMPIOEN!</div><div class="lines">${(n.pids || []).map((id) => `<div class="r1"><span class="who">${U.avatar(P(id), 'm')}<b>${U.esc(P(id)?.name || '?')}</b></span><span>👑</span></div>`).join('')}</div>
    <div class="muted">${U.esc(n.text.replace(/^🏆\s*/, ''))}</div><div class="dim" style="font-size:12px;margin-top:10px">klik om te sluiten</div></div>`, 15000, 'g');
  setTimeout(() => U.confetti(['#ffc83d', '#fff1b8', '#0b0b0c', '#ffffff']), 300);
  U.sfx.fanfare();
  setTimeout(() => U.sfx.fanfare(), 900);
}

function finalFx(m) {
  const w = matchWins(m);
  const win = w[0] > w[1] ? 0 : w[1] > w[0] ? 1 : -1;
  const delta = (id) => m.games.reduce((s, g) => s + (g.delta?.[id] || 0), 0);
  const ids = [...m.teams[0], ...m.teams[1]];
  const title = win < 0 ? 'GELIJKSPEL!' : `${teamName(win).toUpperCase()} WINT!`;
  U.fx(`<div class="finalfx" onclick="document.getElementById('fx').innerHTML=''">
    <div class="trophy">${win < 0 ? '🤝' : '🏆'}</div>
    <div class="t"><span style="${win === 0 ? 'background:#0b0b0c;color:#fff;box-shadow:0 0 0 2px #9aa2ad' : win === 1 ? 'background:#f3efe6;color:#111;box-shadow:0 0 30px rgba(255,255,255,.4)' : 'color:var(--gold)'};padding:6px 18px 2px;border-radius:14px;display:inline-block">${title}</span></div>
    <div class="t" style="font-size:40px"><span class="tc0">${w[0]}</span> – <span class="tc1">${w[1]}</span></div>
    <div class="lines">${ids.map((id) => {
      const d = delta(id);
      return `<div class="r1"><span class="who">${U.avatar(P(id), 's')}<b>${U.esc(P(id)?.name || '?')}</b></span><span class="${d >= 0 ? 'up' : 'down'}">${U.signed(d, 1)} rating</span></div>`;
    }).join('')}</div>
    <div class="dim" style="font-size:12px">klik om te sluiten</div></div>`, 9000);
  const colors = win === 0 ? ['#0b0b0c', '#2c2f34', '#9aa2ad', '#ffc83d'] : win === 1 ? ['#ffffff', '#f3efe6', '#d9d4c8', '#ffc83d'] : ['#0b0b0c', '#ffffff', '#ffc83d'];
  U.confetti(colors);
  U.sfx.fanfare();
}

// ---------------------------------------------------------------- actions
// busy blocks the important buttons while a command is on its way.
function busy(p) {
  S.ui.busy = true;
  render();
  p.catch(() => {}).finally(() => { S.ui.busy = false; render(); });
}

const A = {
  who: () => whoModal(),
  pair: () => pairModal(native.paired === false),
  retry: async () => {
    if (!isHosted) await fetch('/native/retry', { method: 'POST', headers: { 'X-Native-Token': native.token } }).catch(() => {});
    location.reload(); // the page attaches to the new connection
  },
  quit: async () => {
    if (!(await U.confirmBox('KickerArena afsluiten?', 'De app wordt gesloten.', 'Afsluiten', true, 'Terug'))) return;
    fetch('/native/quit', { method: 'POST', headers: { 'X-Native-Token': native.token } }).catch(() => {});
    setTimeout(() => window.close(), 700);
  },
  qrCode: () => (isHosted
    ? qrModal('🔗 Meedoen op een ander apparaat', `${location.origin}${location.pathname}#k=${native.code}`, 'Scan deze code met de camera van je telefoon: KickerArena opent dan in de browser en is meteen gekoppeld. De koppelcode zit in de link, dus deel hem alleen met collega\'s.')
    : qrModal('🔗 Koppelcode', native.code, 'Scan deze code met <b>Scan QR-code</b> in de Android-app, of neem hem over in de Windows- of Linux-app. Dat hoeft maar één keer.')),
  unpair: async () => {
    if (!(await U.confirmBox('Koppeling vergeten?', 'Deze browser vergeet de koppelcode. Om weer mee te doen vul je hem opnieuw in.', 'Vergeten', true, 'Terug'))) return;
    S.link?.bye();
    pairHosted('');
    setTimeout(() => location.reload(), 300);
  },
  copyCode: async () => { U.toast((await U.copyText(native.code)) ? 'Koppelcode gekopieerd' : 'Kopiëren lukte niet; selecteer de code zelf', 'gold'); },
  iam: (d) => setMe(d.pid),
  newPlayer: () => playerModal(null),
  editPlayer: (d) => playerModal(P(d.pid)),
  goto: (d) => { location.hash = d.href; },
  join: (d) => {
    if (!me()) return whoModal();
    // changing the game type keeps the moment that was chosen earlier
    const q = S.state.queue.find((x) => x.pid === S.cfg.me);
    const from = q ? (isLater(q) ? q.from : 0) : S.ui.when ? whenMs(S.ui.when) : 0;
    cmd('queue.join', { pid: S.cfg.me, modes: d.mode === 'both' ? ['1v1', '2v2'] : [d.mode], from }).then(() => { S.ui.when = ''; }).catch(() => {});
  },
  // "Wanneer?": now, one of the half hours, or a time of your own.
  when: async (d) => {
    let at = d.at;
    if (at === 'other') {
      at = await timeModal('🕐 Vanaf hoe laat?', 'Tot dan sla je de beurt over. Je houdt je plek in de wachtrij.');
      if (at === null) return;
    }
    const q = S.state.queue.find((x) => x.pid === S.cfg.me);
    if (q) cmd('queue.join', { pid: S.cfg.me, modes: q.modes, from: at ? whenMs(at) : 0 }).catch(() => {});
    else { S.ui.when = at; render(); }
  },
  // Called, but it does not suit right now.
  delay: (d) => cmd('match.delay', { mid: d.mid, pid: S.cfg.me }).catch(() => {}),
  ready: (d) => cmd('match.ready', { mid: d.mid, pid: S.cfg.me }).catch(() => {}),
  dropLater: async (d) => {
    const at = await timeModal('🕐 Vanaf hoe laat kun je wel?', 'De eerstvolgende in de rij valt nu voor je in. Jij houdt je plek in de wachtrij en doet weer mee vanaf dit tijdstip.');
    if (at) cmd('match.drop', { mid: d.mid, pid: S.cfg.me, from: whenMs(at) }).catch(() => {});
  },
  dropOut: async (d) => {
    if (await U.confirmBox('Kun je niet spelen?', 'De eerstvolgende in de rij valt voor je in en jij gaat uit de wachtrij. Staat er niemand in de rij, dan gaat de wedstrijd niet door.', 'Ik kan niet', true)) cmd('match.drop', { mid: d.mid, pid: S.cfg.me }).catch(() => {});
  },
  waitFor: (d) => cmd('match.wait', { mid: d.mid }).catch(() => {}),
  replace: (d) => cmd('match.replace', { mid: d.mid }).catch(() => {}),
  leave: (d) => cmd('queue.leave', { pid: d.pid }).catch(() => {}),
  signupOther: () => signupOtherModal(),
  call: (d) => { if (!S.ui.busy) busy(cmd('match.call', { key: d.key })); },
  start: (d) => cmd('match.start', { mid: d.mid }).then(() => U.sfx.whistle()).catch(() => {}),
  swapSides: (d) => cmd('match.swapSides', { mid: d.mid }).catch(() => {}),
  win: (d, el, e) => {
    if (S.ui.busy) return; // a double tap must not record two games
    const r = el.getBoundingClientRect();
    el.style.setProperty('--x', `${e.clientX - r.left}px`); el.style.setProperty('--y', `${e.clientY - r.top}px`);
    const crawl = !!S.ui.crawl;
    S.ui.crawl = false;
    busy(cmd('match.win', { mid: d.mid, team: Number(d.team), crawl }));
  },
  goal: (d, el, e) => {
    if (S.ui.busy) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--x', `${e.clientX - r.left}px`); el.style.setProperty('--y', `${e.clientY - r.top}px`);
    busy(cmd('match.goal', { mid: d.mid, team: Number(d.team) }));
  },
  ungoal: (d) => cmd('match.goal', { mid: d.mid, team: Number(d.team), delta: -1 }).catch(() => {}),
  finish: async (d) => {
    if (await U.confirmBox('Wedstrijd afronden?', 'De spellen die nog open staan worden niet gespeeld. De uitslag telt met de spellen die al gespeeld zijn.', 'Afronden')) busy(cmd('match.finish', { mid: d.mid }));
  },
  toggleCrawl: () => { S.ui.crawl = !S.ui.crawl; render(); },
  tNew: () => tournamentModal(),
  tJoin: (d) => cmd('tourn.join', { tid: d.tid, pid: d.pid || S.cfg.me }).catch(() => {}),
  tLeave: (d) => cmd('tourn.leave', { tid: d.tid, pid: d.pid || S.cfg.me }).catch(() => {}),
  tAdd: (d) => tournamentAddModal(d.tid),
  tStart: async (d) => {
    if (!(await U.confirmBox('Toernooi starten?', 'Daarna kan niemand zich meer aanmelden en worden de wedstrijden ingedeeld.', 'Starten'))) return;
    try {
      await cmd('tourn.start', { tid: d.tid });
      location.hash = '#/arena'; // the matches are called from the arena
    } catch { /* toast shown */ }
  },
  tCall: (d) => { if (!S.ui.busy) busy(cmd('tourn.call', { tid: d.tid, r: Number(d.r), i: Number(d.i) })); },
  tCancel: async (d) => {
    if (await U.confirmBox('Toernooi stoppen?', 'Gespeelde wedstrijden blijven in de historie staan, de rest vervalt.', 'Stoppen', true, 'Doorgaan')) cmd('tourn.cancel', { tid: d.tid }).catch(() => {});
  },
  undo: async (d) => {
    if (await U.confirmBox('Vorig spel terugdraaien?', 'Het laatst ingevoerde spel van deze wedstrijd wordt weggehaald.', 'Terugdraaien')) cmd('match.undo', { mid: d.mid }).catch(() => {});
  },
  cancel: async (d) => {
    const m = S.state.active.find((x) => x.id === d.mid);
    const w = m ? matchWins(m) : [0, 0];
    if (m?.games.length && !(m.tid && w[0] === w[1])) {
      // Games were played: keep them (and drop the rest), or throw everything away?
      const n = m.games.length;
      const choice = await U.choiceBox('Wedstrijd annuleren?', `Er ${n === 1 ? 'is al 1 spel' : `zijn al ${n} spellen`} gespeeld.`, [
        { value: 'finish', label: `✔ Alleen de open spellen annuleren`, sub: `${n === 1 ? 'Het gespeelde spel telt' : `De ${n} gespeelde spellen tellen`} gewoon mee`, cls: 'primary' },
        { value: 'cancel', label: '✖ Hele wedstrijd annuleren', sub: 'Niets wordt opgeslagen, de spelers gaan terug in de wachtrij', cls: 'danger' },
      ]);
      if (choice === 'finish') busy(cmd('match.finish', { mid: d.mid }));
      if (choice === 'cancel') cmd('match.cancel', { mid: d.mid }).catch(() => {});
      return;
    }
    if (await U.confirmBox('Wedstrijd annuleren?', 'De spelers komen terug op hun oude plek in de wachtrij. Er wordt niets opgeslagen.', 'Annuleren', true, 'Doorspelen')) cmd('match.cancel', { mid: d.mid }).catch(() => {});
  },
  manual: () => manualModal(),
  edit: (d) => editModal(S.history.find((m) => m.id === d.mid)),
  del: async (d) => {
    const m = S.history.find((x) => x.id === d.mid);
    if (await U.confirmBox('Wedstrijd verwijderen?', `${names(m.teams[0])} vs ${names(m.teams[1])} (${matchWins(m).join('-')}). Ratings worden opnieuw berekend.`, 'Verwijderen', true, 'Behouden')) cmd('match.delete', { mid: d.mid }).catch(() => {});
  },
  rank: (d) => { S.ui.rank = d.mode; render(); },
  psort: (d) => { S.cfg.psort = d.by; saveCfg(); render(); },
  more: () => { S.ui.limit += 60; render(); },
  fullscreen: () => {
    S.ui.fs = !S.ui.fs;
    // not in the Android app: its window is the whole screen already
    if (S.ui.fs && !window.KAndroid) document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    render();
  },
  toggleMotion: async (d, el) => { S.cfg.motion = el.checked; await saveCfg(); render(); },
  toggleSound: async (d, el) => { S.cfg.sound = el.checked; U.sound.on = el.checked; await saveCfg(); if (el.checked) U.sfx.ding(); },
  notify: async () => { await Notification.requestPermission(); render(); },
};

document.addEventListener('click', (e) => {
  const jump = e.target.closest('[data-jump]');
  if (jump) { // help: table of contents
    e.preventDefault();
    document.getElementById(jump.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const el = e.target.closest('[data-act]');
  if (!el || el.closest('.modal')) return;
  const fn = A[el.dataset.act];
  if (!fn) return;
  if (el.closest('#fx')) document.getElementById('fx').innerHTML = ''; // a choice in the big "your turn" message closes it
  if (el.tagName !== 'INPUT') e.preventDefault();
  fn(el.dataset, el, e);
});

document.addEventListener('change', (e) => {
  const k = e.target.dataset?.change;
  if (!k) return;
  S.ui[k] = e.target.value;
  S.ui.limit = 60;
  render();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.ui.fs) A.fullscreen();
});

document.addEventListener('submit', async (e) => {
  const f = e.target;
  const kind = f.dataset?.form;
  if (!kind) return;
  e.preventDefault();
  if (kind === 'report') {
    const ua = navigator.userAgent;
    const via = isWeb ? 'website' : isHosted ? 'webapp' : /Android/i.test(ua) ? 'Android-app' : /Linux/i.test(ua) ? 'Linux-app' : 'Windows-app';
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    cmd('feedback', { kind: f.kind.value, title: f.title.value, text: f.text.value, via })
      .then(() => { f.title.value = ''; f.text.value = ''; U.toast('📮 Verstuurd, even geduld…', 'gold'); })
      .catch(() => {})
      .finally(() => { btn.disabled = false; });
    return;
  }
  if (kind === 'settings') {
    cmd('settings.update', { title: f.title.value, gamesPerMatch: Number(f.gamesPerMatch.value), scoring: f.scoring.value, goalsToWin: Number(f.goalsToWin.value) }).then(() => U.toast('Spelregels opgeslagen ✅', 'gold')).catch(() => {});
  }
});

// Unlock audio on the first interaction (browsers block autoplay).
document.addEventListener('pointerdown', () => U.unlockAudio(), { once: true });

boot();

// Leaving the browser's full screen (Esc, swipe, F11) also ends table mode.
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && S.ui.fs) { S.ui.fs = false; render(); }
});
// Android back button: first close table mode or a popup, then navigate back.
window.kaBack = () => {
  if (S.ui.fs) { A.fullscreen(); return true; }
  if (document.querySelector('.modal-bg')) { U.closeModal(); return true; }
  return false;
};
