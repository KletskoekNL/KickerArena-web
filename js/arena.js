// The arena: the table with the match being played, sign-up, the next
// match, the queue and the latest results.
import { S, P, me, players, settings, names } from './store.js';
import { esc, avatar, who, ago, waited, pct } from './ui.js';
import { matchWins } from './stats.js';
import { tableSVG } from './table.js';
import { isOnline, rating, modeLabel, gamesLine, tournamentChip, isLater, hhmm, whenMs, whenOptions, substituteFor, canStepOut } from './bits.js';
import { tournamentArenaCard } from './tourney.js';

export function viewArena() {
  const act = S.state.active;
  const onTable = act.find((m) => m.state === 'live') || act[0];
  const waiting = act.filter((m) => m !== onTable);
  return `<div class="arena">
    <div class="a-table">${tableCard(onTable)}${waiting.length ? waitingCard(waiting) : ''}</div>
    <div class="a-side">${joinCard()}${tournamentArenaCard()}${nextCard(!!onTable)}${queueCard()}</div>
    <div class="a-recent">${recentCard()}</div>
  </div>`;
}

function sideHTML(m, t) {
  return `<div class="side ${t === 0 ? 'r' : 'b'}">
    <div class="tname">${t === 0 ? 'Team Zwart' : 'Team Wit'}</div>
    <div class="ppl">${m.teams[t].map((id) => `<span class="who">${avatar(P(id), 's', isOnline(id))}<span><a class="pname" href="#/player/${esc(id)}">${esc(P(id)?.name || '?')}</a></span></span>`).join('')}</div>
  </div>`;
}

// Table mode: corners pointing out to enter, pointing in to leave (Esc and the back button work too).
const FS_ICON = {
  enter: 'M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6',
  exit: 'M9 3v6H3M21 9h-6V3M15 21v-6h6M3 15h6v6',
};
const fsButton = () => `<button class="btn sm ghost fsbtn" data-act="fullscreen" title="${S.ui.fs ? 'Tafelmodus sluiten (Esc)' : 'Tafelmodus (groot scorebord)'}">
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${S.ui.fs ? FS_ICON.exit : FS_ICON.enter}"/></svg></button>`;

function idleTable() {
  return `<section class="card tablecard ${S.ui.fs ? 'fs' : ''}">
    <div class="head"><h2>🏟️ De Tafel</h2><span class="chip">VRIJ</span><div class="spacer"></div>
      ${fsButton()}</div>
    <div class="board">
      <div class="tablewrap">${tableSVG({ match: null, players: players(), idle: true })}</div>
      <div class="idlebox"><div class="big">DE TAFEL IS VRIJ</div><p class="muted">Meld je aan, of leg een wedstrijd vast die jullie al gespeeld hebben.</p>
        <button class="btn" data-act="manual">📝 Gespeelde wedstrijd invoeren</button></div>
    </div></section>`;
}

// A called player asked for a few minutes: the others wait, or go on with
// the next player in line. One press decides for everyone, like the kick-off.
function delayBanner(m, kickoff) {
  const who = esc(P(m.delay.pid)?.name || '?');
  const sub = substituteFor(m);
  const subName = sub ? esc(P(sub.pid)?.name || '?') : '';
  const count = `<span class="count" data-until="${m.delay.until}">${countdown(m.delay.until)}</span>`;
  if (m.delay.pid === S.cfg.me) {
    // The one who asked: back early is one press.
    return `<div class="banner delay"><span>⏳ Je hebt uitstel gevraagd</span> ${count}
      <div class="actions">${readyButton(m)}</div></div>`;
  }
  if (m.delay.wait) {
    return `<div class="banner delay"><span>⏳ Wachten op ${who}</span> ${count}
      <div class="actions">${kickoff}${sub ? `<button class="btn" data-act="replace" data-mid="${m.id}">▶ Toch doorgaan met ${subName}</button>` : ''}</div></div>`;
  }
  return `<div class="banner delay"><span>⏳ ${who} vraagt 5 minuten uitstel</span> ${count}
    ${sub ? '' : '<div class="note">Er staat niemand anders in de rij om in te vallen.</div>'}
    <div class="actions"><button class="btn" data-act="waitFor" data-mid="${m.id}">Wachten op ${who}</button>
      ${sub ? `<button class="btn primary" data-act="replace" data-mid="${m.id}">▶ Doorgaan met ${subName}</button>` : ''}</div></div>`;
}

export function countdown(until) {
  const s = Math.ceil((until - Date.now()) / 1000);
  return s > 0 ? `nog <b>${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</b>` : 'de tijd is om';
}

const readyButton = (m) => `<button class="btn primary" data-act="ready" data-mid="${m.id}">✅ Ik kan toch al</button>`;

// What a called player can do when it does not suit right now.
export function delayButtons(m) {
  // one delay per match for each player, and one request at a time
  const why = m.delayed?.includes(S.cfg.me) ? 'Je hebt voor deze wedstrijd al uitstel gehad' : m.delay ? 'Er loopt al een verzoek om uitstel' : '';
  return `<button class="btn sm" data-act="delay" data-mid="${m.id}" ${why ? `disabled title="${why}"` : ''}>⏳ 5 min uitstel</button>
    <button class="btn sm" data-act="dropLater" data-mid="${m.id}">🕐 Ander tijdstip…</button>
    <button class="btn sm danger outline" data-act="dropOut" data-mid="${m.id}">✖ Ik kan niet</button>`;
}

// "Wanneer?": now, the next two half hours, or a time of your own.
function whenRow(cur) {
  const opts = whenOptions();
  const own = cur && !opts.includes(cur);
  const b = (at, label) => `<button class="${cur === at ? 'on' : ''}" data-act="when" data-at="${at}">${label}</button>`;
  return `<div class="when"><span class="lbl">Wanneer?</span><span class="seg">${b('', 'Nu')}${opts.map((o) => b(o, o)).join('')}<button class="${own ? 'on' : ''}" data-act="when" data-at="other">${own ? esc(cur) : 'Anders…'}</button></span></div>`;
}

function tableCard(m) {
  if (!m) return idleTable();
  const set = settings();
  const goals = set.scoring === 'goals';
  const w = matchWins(m);
  const live = m.live?.length === 2 ? m.live : [0, 0];
  const n = m.games.length + 1; // the game being played now
  const flash = S.goalFlash && S.goalFlash.mid === m.id && Date.now() < S.goalFlash.until ? S.goalFlash : null;
  const busy = S.ui.busy ? 'disabled' : '';
  // Big digits: goals in the current game (goals mode) or games won.
  const big = goals ? live : w;
  const games = m.target
    ? `<span class="g">${gamesLine(m.games) || 'nog geen spel'}</span><span class="g cur">${m.target === 1 ? '1 spel beslist' : `best of ${2 * m.target - 1}`}</span>`
    : Array.from({ length: Math.max(set.gamesPerMatch, m.games.length) }, (_, i) => {
      const g = m.games[i];
      return `<span class="g ${i === m.games.length ? 'cur' : ''}">Spel ${i + 1}${g ? ` ${gamesLine([g])}` : ''}</span>`;
    }).join('');
  const kickoff = `<button class="btn primary" data-act="start" data-mid="${m.id}">🎬 Aftrap!</button>
      ${m.games.length ? '' : `<button class="btn" data-act="swapSides" data-mid="${m.id}">⇄ Kleuren wisselen</button>`}`;
  const banner = m.state !== 'called' ? '' : m.delay ? delayBanner(m, kickoff)
    : `<div class="banner">📣 Opgeroepen ${ago(m.created)}, iedereen aan de stangen?
      <div class="actions">${kickoff}</div>
      ${canStepOut(m, S.cfg.me) ? `<div class="actions only-s">${delayButtons(m)}</div>` : ''}</div>`;
  // Wrap up early: the games played count, the remaining ones are dropped.
  const canStop = m.games.length > 0 && (!m.tid || w[0] !== w[1]);
  const played = m.games.length === 1 ? 'het gespeelde spel telt' : `de ${m.games.length} gespeelde spellen tellen`;
  const controls = goals
    ? `<button class="goalbtn r" data-act="goal" data-mid="${m.id}" data-team="0" ${busy}>GOAL ZWART<small>${esc(names(m.teams[0]))}</small></button>
      <div class="midctl undogoal"><span class="lbl">Goal terug</span>
        <button class="btn sm" data-act="ungoal" data-mid="${m.id}" data-team="0" ${live[0] ? '' : 'disabled'} title="Laatste goal van Zwart terugdraaien">↶ Zwart</button>
        <button class="btn sm" data-act="ungoal" data-mid="${m.id}" data-team="1" ${live[1] ? '' : 'disabled'} title="Laatste goal van Wit terugdraaien">↶ Wit</button>
      </div>
      <button class="goalbtn b" data-act="goal" data-mid="${m.id}" data-team="1" ${busy}>GOAL WIT<small>${esc(names(m.teams[1]))}</small></button>`
    : `<button class="goalbtn r" data-act="win" data-mid="${m.id}" data-team="0" ${busy}>ZWART WINT<small>${esc(names(m.teams[0]))}</small></button>
      <div class="midctl">
        <button class="crawlbtn ${S.ui.crawl ? 'on' : ''}" data-act="toggleCrawl" aria-pressed="${S.ui.crawl ? 'true' : 'false'}" title="Zet aan als de verliezers geen enkele goal maakten: zij moeten onder de tafel door">
          <span class="ic">🐌</span><b>Kruipen</b><small>${S.ui.crawl ? 'AAN: verliezer scoorde 0' : 'verliezer scoorde 0?'}</small></button>
      </div>
      <button class="goalbtn b" data-act="win" data-mid="${m.id}" data-team="1" ${busy}>WIT WINT<small>${esc(names(m.teams[1]))}</small></button>`;
  return `<section class="card tablecard ${S.ui.fs ? 'fs' : ''}" data-key="table-${m.id}">
    <div class="head"><h2>🏟️ De Tafel</h2>
      ${m.state === 'live' ? '<span class="chip live">● LIVE</span>' : '<span class="chip gold">OPGEROEPEN</span>'}
      <span class="chip">${modeLabel(m.mode)}</span>${tournamentChip(m)}
      <span class="muted odds-mini">winkans ${pct(m.winProb)} – ${pct(1 - m.winProb)}</span>
      <div class="spacer"></div>
      ${fsButton()}</div>
    <div class="board">
      <div class="scoreboard">
        ${sideHTML(m, 0)}
        <div><div class="digits"><span class="d r bump" data-key="d0-${big[0]}-${n}">${big[0]}</span><span class="colon">:</span><span class="d b bump" data-key="d1-${big[1]}-${n}">${big[1]}</span></div>
          <div class="gamesline">${games}${goals ? `<span class="g dim">tot ${set.goalsToWin}</span>` : ''}</div></div>
        ${sideHTML(m, 1)}
      </div>
      <div class="tablewrap">${tableSVG({ match: m, players: players(), goalFlash: flash })}</div>
      ${banner}
      <div class="wintitle">${goals ? `Spel ${n}: wie scoort?` : `Wie won spel ${n}?`}</div>
      <div class="controls">${controls}</div>
      <div class="actions">
        <button class="btn sm" data-act="undo" data-mid="${m.id}" ${m.games.length ? '' : 'disabled'} title="Het laatst ingevoerde spel terugdraaien">↶ Vorig spel</button>
        ${canStop ? `<button class="btn sm" data-act="finish" data-mid="${m.id}" title="Geen tijd meer: ${played}, de rest wordt niet gespeeld">✔ Afronden na spel ${m.games.length}</button>` : ''}
        <button class="btn sm danger outline" data-act="cancel" data-mid="${m.id}" title="De hele wedstrijd annuleren">✖ Annuleren</button>
      </div>
    </div></section>`;
}

function waitingCard(list) {
  return `<section class="card"><h2>⏳ Wacht op de tafel</h2><div class="waiting">${list.map((m) => `
    <div class="wm" data-key="w-${m.id}"><span class="chip">${m.mode}</span>${tournamentChip(m)}
      <span class="teamline">${m.teams[0].map((id) => who(P(id))).join('')}</span><b class="vs-mini">vs</b>
      <span class="teamline">${m.teams[1].map((id) => who(P(id))).join('')}</span><div class="spacer"></div>
      <button class="btn sm ghost danger" data-act="cancel" data-mid="${m.id}" title="Annuleren">✖</button></div>`).join('')}</div></section>`;
}

function recentCard() {
  const h = S.history.slice(-8).reverse();
  return `<section class="card"><h2>📜 Laatste uitslagen <a class="sub" href="#/history">alles →</a></h2>
    ${h.length ? `<div class="recent">${h.map(resultRow).join('')}</div>` : '<div class="empty"><span class="big">🥅</span>Nog geen wedstrijden gespeeld. Wie wint de eerste?</div>'}</section>`;
}

function resultRow(m) {
  const w = matchWins(m);
  const cls = (t) => (w[t] > w[1 - t] ? 'w' : w[t] < w[1 - t] ? 'l' : '');
  return `<div class="res" data-key="r-${m.id}">
    <span class="tm">${ago(m.finished)}${m.tid ? ' · 🏅' : ''}</span>
    <span class="teamline ${cls(0)}">${m.teams[0].map((id) => who(P(id))).join('')}</span>
    <span class="s"><span class="tot"><span class="tc0">${w[0]}</span>-<span class="tc1">${w[1]}</span></span><span class="dots">${gamesLine(m.games)}</span></span>
    <span class="teamline right ${cls(1)}">${m.teams[1].map((id) => who(P(id))).join('')}</span></div>`;
}

function joinCard() {
  const m = me();
  if (!m) {
    return `<section class="card joinbox"><h2>🙋 Doe mee</h2><p class="muted">Kies eerst wie je bent, dan kun je je aanmelden.</p>
      <div class="row"><button class="btn primary" data-act="who">Wie ben jij?</button><div class="spacer"></div><button class="btn sm" data-act="signupOther">+ Iemand anders</button></div></section>`;
  }
  const busy = S.state.active.find((x) => x.teams.flat().includes(m.id));
  const qi = S.state.queue.findIndex((q) => q.pid === m.id);
  const q = S.state.queue[qi];
  const cur = q ? (q.modes.length === 2 ? 'both' : q.modes[0]) : '';
  if (busy) {
    const asked = busy.delay?.pid === m.id;
    return `<section class="card joinbox"><h2>🎯 Jij speelt!</h2><p class="muted">${asked ? `Je hebt uitstel gevraagd tot ${hhmm(busy.delay.until)}.` : busy.state === 'called' ? 'Je bent opgeroepen. Snel naar de tafel!' : 'Je staat aan de tafel. Succes!'}</p>
      ${asked ? `<div class="delaybtns">${readyButton(busy)}</div>` : ''}
      ${canStepOut(busy, m.id) ? `<div class="delaybtns">${delayButtons(busy)}</div>` : ''}
      <div class="row" style="margin-top:10px"><div class="spacer"></div><button class="btn sm" data-act="signupOther">+ Iemand anders aanmelden</button></div></section>`;
  }
  const btn = (k, title, sub) => `<button class="modebtn ${cur === k ? 'on' : ''}" data-act="join" data-mode="${k}"><b>${title}</b><small>${sub}</small></button>`;
  const late = q && isLater(q);
  if (!q && S.ui.when && whenMs(S.ui.when) <= Date.now()) S.ui.when = ''; // the chosen moment has passed
  const when = q ? (late ? hhmm(q.from) : '') : S.ui.when;
  const place = S.state.queue.filter((x, i) => i < qi && !isLater(x)).length + 1;
  const head = !q ? '⚽ Doe mee'
    : late ? `🕐 Je doet mee vanaf ${hhmm(q.from)}<span class="sub">je houdt je plek</span>`
      : `✅ Je staat #${place}<span class="sub">${waited(Math.max(q.since, q.from || 0))} aan het wachten</span>`;
  return `<section class="card joinbox"><h2>${head}</h2>
    <div class="modes">${btn('1v1', '1 vs 1', 'duel')}${btn('2v2', '2 vs 2', 'met maatje')}${btn('both', 'Beide', 'maakt niet uit')}</div>
    ${whenRow(when)}
    <div class="row" style="margin-top:10px">
      ${q ? `<button class="btn sm danger" data-act="leave" data-pid="${m.id}">Afmelden</button>` : '<span class="muted small">Kies een spelvorm om je aan te melden</span>'}
      <div class="spacer"></div><button class="btn sm" data-act="signupOther">+ Iemand anders</button></div></section>`;
}

function nextCard(tableBusy) {
  const n = S.state.next;
  if (!n?.mode) {
    const later = S.state.queue.filter(isLater).slice(0, 3).map((q) => `${q.pid === S.cfg.me ? 'Jij doet' : `${esc(P(q.pid)?.name || '?')} doet`} mee vanaf ${hhmm(q.from)}`);
    return `<section class="card"><h2>🔮 Volgende partij</h2><div class="empty compact">🧩 ${esc(n?.reason || 'Nog niemand in de wachtrij')}</div>
      ${later.length ? `<p class="muted small later-note">${later.join(' · ')}</p>` : ''}</section>`;
  }
  const team = (t) => `<div class="t ${t ? 'b' : 'r'}">${n.teams[t].map((id) => `<span class="who">${avatar(P(id), 's', isOnline(id))}<span><b>${esc(P(id)?.name)}</b> <small class="muted">${rating(P(id) || {}, n.mode)}</small></span></span>`).join('')}</div>`;
  return `<section class="card"><h2>🔮 Volgende partij <span class="sub">${modeLabel(n.mode)}</span></h2>
    <div class="versus">${team(0)}<div class="vs">VS</div>${team(1)}</div>
    <div class="odds"><div class="bar"><i class="r" style="width:${n.winProb * 100}%"></i><i class="b" style="width:${(1 - n.winProb) * 100}%"></i></div>
      <div class="lbl"><span><i class="tdot t0"></i>Zwart ${pct(n.winProb)}</span><span class="dim">winkans per spel</span><span>${pct(1 - n.winProb)} Wit<i class="tdot t1"></i></span></div></div>
    ${n.nudged ? `<p class="muted small nudge">⚖️ Het team met de kleinste winkans speelt met ${n.winProb < 0.5 ? 'Zwart' : 'Wit'}: die kleur wint aan deze tafel het vaakst.</p>` : ''}
    <button class="btn primary block" ${S.ui.busy ? 'disabled' : ''} data-act="call" data-key="${esc(n.mode + ':' + n.teams[0].join(',') + '|' + n.teams[1].join(','))}">${tableBusy ? '📣 Oproepen (wacht op tafel)' : '📣 Naar de tafel!'}</button></section>`;
}

function queueCard() {
  const q = S.state.queue;
  const pick = new Set(S.state.next?.mode ? S.state.next.teams.flat() : []);
  let nr = 0;
  return `<section class="card"><h2>🧍 Wachtrij <span class="sub">${q.length} ${q.length === 1 ? 'speler' : 'spelers'}</span></h2>
    ${q.length ? `<div class="queue">${q.map((e) => {
      const p = P(e.pid);
      if (!p) return '';
      // players who join in later keep their place, but are skipped (and not numbered) until then
      const late = isLater(e);
      if (!late) nr++;
      return `<div class="qrow ${e.pid === S.cfg.me ? 'me' : ''} ${pick.has(e.pid) ? 'pick' : ''} ${late ? 'later' : ''}" data-key="q-${e.pid}">
        <span class="n ${late ? 'clock' : ''}">${late ? '🕐' : nr}</span>${avatar(p, 's', isOnline(p.id))}
        <span class="qn"><a class="pname" href="#/player/${esc(p.id)}">${esc(p.name)}</a> ${e.modes.map((m) => `<span class="chip">${m}</span>`).join(' ')}<br><span class="rt">${late ? `<b class="from">vanaf ${hhmm(e.from)}</b>` : `⏱ ${waited(Math.max(e.since, e.from || 0))}`} · ${e.modes.includes('2v2') ? rating(p, '2v2') : rating(p, '1v1')}</span></span>
        <button class="btn sm ghost" data-act="leave" data-pid="${p.id}" title="Uit de wachtrij halen">✕</button></div>`;
    }).join('')}</div>` : '<div class="empty compact">🪑 Niemand in de rij. Tijd voor een potje?</div>'}</section>`;
}
