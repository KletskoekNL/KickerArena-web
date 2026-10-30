// All pages, rendered as HTML strings and morphed into the DOM.
import { S, P, me, players, stats, settings, route, names, isWeb, isHosted, native, tableMoves, calm } from './store.js';
import { esc, avatar, who, ago, clock, dayLabel, pct, r0, signed, ANDROID, TUX, WINDOWS } from './ui.js';
import { BADGES, ranking, settledIn, matchWins, periodsOf, SETTLED } from './stats.js';
import { lineChart, sparkline } from './chart.js';
import { LOGO, isOnline, rating, modeLabel, gamesLine, serverBrokers, sharedBrokers, editable } from './bits.js';
import { viewArena } from './arena.js';
import { viewTournament } from './tourney.js';
import { viewHelp } from './help.js';

// ================================================================ header
export function header() {
  const r = route().name;
  const tabs = [['arena', '⚽', 'Arena'], ['ranking', '🏆', 'Ranglijst'], ['history', '📜', 'Historie'], ['tourney', '🏅', 'Toernooi'], ['fame', '🏛️', 'Hall of Fame'], ['players', '👥', 'Spelers'], ['settings', '⚙️', 'Instellingen'], ['help', '❓', 'Help']];
  // only the brokers the server is on too count: the others lead nowhere
  const mine = sharedBrokers();
  const up = mine.filter((b) => b.up).length;
  const total = mine.length || S.conn.brokers.length || 4;
  const cls = S.conn.server === 'ok' ? 'open' : S.conn.server === 'syncing' ? 'connecting' : 'offline';
  const st = S.conn.server === 'ok' ? `🔒 Live · ${up}/${total} brokers` : !isWeb && native.paired === false ? 'Niet gekoppeld' : S.conn.insecure ? 'Alleen via https' : S.conn.server === 'syncing' ? `Zoekt de server… (${up}/${total})` : isWeb ? 'Server niet bereikbaar' : 'Geen internet?';
  const on = S.online.pids.map(P).filter(Boolean);
  const m = me();
  const setup = !S.state;
  return `<a class="brand" href="#/arena">${LOGO}<div><b>KICKER ARENA</b><small>${esc(S.state ? settings().title : 'Tafelvoetbal competitie')}</small></div></a>
    ${setup ? '' : `<nav class="tabs">${tabs.map(([k, ic, l]) => `<a href="#/${k}" title="${l}" class="${r === k || (r === 'player' && k === 'players') ? 'on' : ''}">${ic}<span>${l}</span></a>`).join('')}</nav>`}
    <div class="spacer"></div>
    ${on.length ? `<div class="online" title="Online: ${esc(on.map((p) => p.name).join(', '))}">${on.slice(0, 7).map((p) => avatar(p, 's', true)).join('')}${on.length > 7 ? `<span class="more">+${on.length - 7}</span>` : ''}</div>` : ''}
    <a class="conn ${cls}" href="#/settings" title="${esc(S.conn.brokers.map((b) => `${b.up ? '✓' : '✗'} ${b.name}`).join('\n'))}"><i></i><span>${st}</span></a>
    ${setup ? '' : m ? `<a class="me-chip" href="#/player/${esc(m.id)}">${avatar(m, 's')}${esc(m.name)}</a>` : `<button class="btn sm" data-act="who">🙋 Wie ben jij?</button>`}`;
}

export function view() {
  if (!S.state) return loading();
  const r = route();
  switch (r.name) {
    case 'ranking': return viewRanking();
    case 'history': return viewHistory();
    case 'player': return viewPlayer(r.arg);
    case 'fame': return viewFame();
    case 'players': return viewPlayers();
    case 'settings': return viewSettings();
    case 'tourney': return viewTournament();
    case 'help': return viewHelp();
    default: return viewArena();
  }
}

export const CONNECT_TIMEOUT = 25000;

function loading() {
  const logo = LOGO.replace('<svg', '<svg class="logo ball-spin"');
  if (!isWeb) {
    // The app: never wait forever without a way out.
    const unpaired = native.paired === false;
    if (S.conn.insecure) {
      // The web app on an address without https: the browser withholds what the encryption needs.
      return `<div class="setup"><div class="box">${logo.replace('ball-spin', '')}<h1>KICKER ARENA</h1><p>De webapp werkt alleen via een beveiligd adres (https).</p>
        <p class="dim" style="font-size:13px">Dit adres begint met <b>http://</b>. Open de webapp via het adres dat met <b>https://</b> begint, of gebruik op het lokale netwerk de website van de server.</p></div></div>`;
    }
    const failed = !unpaired && Date.now() - S.ui.tryStart > CONNECT_TIMEOUT;
    const msg = unpaired ? 'Deze app is nog niet gekoppeld aan een server.'
      : failed ? 'Verbinden met de server is niet gelukt.'
        : S.conn.server === 'offline' ? 'Verbinden met de MQTT-brokers…' : 'Wachten op de KickerArena-server…';
    const hint = unpaired ? 'Vul de koppelcode in die je op de website van de server of in het beheervenster vindt.'
      : failed ? 'Draait KickerArena-Server op de server-pc en heeft die internet? Klopt de koppelcode hieronder? Een verkeerde code geeft nooit verbinding.'
        : '';
    return `<div class="setup"><div class="box">${failed || unpaired ? logo.replace('ball-spin', '') : logo}<h1>KICKER ARENA</h1><p>${msg}</p>
      ${hint ? `<p class="dim" style="font-size:13px">${hint}</p>` : ''}
      ${unpaired ? '' : `<p class="dim" style="font-size:13px">Koppelcode: <b class="code">${esc(native.code || '')}</b></p><div class="brokers">${brokerList()}</div>`}
      <div class="row" style="justify-content:center;gap:10px;margin-top:16px;flex-wrap:wrap">
        ${failed ? '<button class="btn primary" data-act="retry">↻ Opnieuw proberen</button>' : ''}
        <button class="btn ${unpaired ? 'primary' : ''}" data-act="pair">🔗 ${unpaired ? 'Koppelcode invullen' : 'Andere koppelcode'}</button>
        ${isHosted ? '' : `<button class="btn" data-act="quit">${failed || unpaired ? 'Afsluiten' : 'Annuleren en afsluiten'}</button>`}
      </div></div></div>`;
  }
  return `<div class="setup"><div class="box">${logo}<h1>KICKER ARENA</h1><p>Verbinden met de server…</p>
    <div class="brokers">${brokerList()}</div>
    ${S.conn.server === 'syncing' ? '<p class="dim" style="font-size:13px">Draait KickerArena-Server.exe op de server-pc?</p>' : ''}</div></div>`;
}

function brokerList() {
  const list = S.conn.brokers.length ? S.conn.brokers : [{ name: 'test.mosquitto.org' }, { name: 'mqtt.tyckr.io' }, { name: 'broker.emqx.io' }, { name: 'broker.hivemq.com' }];
  const srv = serverBrokers();
  return list.map((b) => {
    const unused = srv && !srv.includes(b.name); // connected or not, the server is not there
    return `<div class="broker ${unused ? 'unused' : b.up ? 'up' : ''}"><i></i>${esc(b.name)}<span>${unused ? 'niet gebruikt door deze server' : b.up ? 'verbonden' : 'niet bereikbaar'}</span></div>`;
  }).join('');
}

// ================================================================ ranking
function formDots(bm) {
  return `<span class="form">${bm.form.slice(-5).map((f) => `<i class="${f}" title="${f === 'w' ? 'gewonnen' : 'verloren'}"></i>`).join('')}</span>`;
}
function streakTxt(n) {
  if (n >= 3) return `<span class="streak" style="color:var(--gold)">🔥 ${n}</span>`;
  if (n > 0) return `<span class="streak up">▲ ${n}</span>`;
  if (n <= -3) return `<span class="streak" style="color:#9cd1ff">🥶 ${-n}</span>`;
  if (n < 0) return `<span class="streak down">▼ ${-n}</span>`;
  return '<span class="dim">–</span>';
}

// Other orders than the rating, for the table only: the place (#) and the
// podium stay those of the rating.
const RSORT = {
  r: ['Rating', (x) => x.r],
  g: ['Spellen', (x) => x.s.byMode[x.mode].g],
  w: ['Gewonnen', (x) => x.s.byMode[x.mode].w],
  l: ['Verloren', (x) => x.s.byMode[x.mode].g - x.s.byMode[x.mode].w],
  pct: ['Winst', (x) => x.s.byMode[x.mode].w / x.s.byMode[x.mode].g],
  mw: ['Wedstrijden gewonnen', (x) => x.s.byMode[x.mode].mw],
  md: ['Wedstrijden gelijk', (x) => x.s.byMode[x.mode].md],
  ml: ['Wedstrijden verloren', (x) => x.s.byMode[x.mode].ml],
  streak: ['Reeks', (x) => x.s.byMode[x.mode].streak],
};

function viewRanking() {
  const mode = S.ui.rank;
  const { P: SP } = stats();
  // Newcomers start on 1000, above half the field: only on the list when asked for (#43).
  const everyone = ranking(players(), SP, mode);
  const list = S.ui.rnew ? everyone : settledIn(everyone, mode);
  const hidden = everyone.length - list.length;
  const by = RSORT[S.ui.rsort] ? S.ui.rsort : 'r';
  const draws = list.some((x) => x.s.byMode[mode].md > 0); // only then a column for G

  const dir = S.ui.rdir === 'up' ? -1 : 1;
  const rows = list.map((x, i) => ({ ...x, i, mode }))
    .sort((a, b) => dir * (RSORT[by][1](b) - RSORT[by][1](a)) || a.i - b.i);
  const th = (k, cls = 'num') => `<th class="${cls} sort ${by === k ? 'on' : ''}" data-act="rsort" data-by="${k}" title="Sorteren op ${RSORT[k][0].toLowerCase()}">${RSORT[k][0]}${by === k ? (dir > 0 ? ' ▼' : ' ▲') : ''}</th>`;
  const half = (k, txt) => `<span class="sort ${by === k ? 'on' : ''}" data-act="rsort" data-by="${k}" title="Sorteren op ${RSORT[k][0].toLowerCase()}">${txt}${by === k ? (dir > 0 ? ' ▼' : ' ▲') : ''}</span>`;
  const pod = (i, cls) => {
    const x = list[i];
    if (!x) return '<div></div>';
    return `<a class="pod ${cls}" href="#/player/${esc(x.p.id)}">${i === 0 ? '<span class="crown">👑</span>' : ''}${avatar(x.p, i === 0 ? 'xl' : 'l')}
      <span class="nm">${esc(x.p.name)}</span><span class="rt">${r0(x.r)}</span><div class="blk">${i + 1}</div></a>`;
  };
  return `<h1 class="page">🏆 Ranglijst <small>Elo-rating · start op 1000 · per gespeeld spel bijgewerkt · uitleg onder Help</small>
      <span style="flex:1"></span><span class="seg"><button class="${mode === '2v2' ? 'on' : ''}" data-act="rank" data-mode="2v2">2 tegen 2</button><button class="${mode === '1v1' ? 'on' : ''}" data-act="rank" data-mode="1v1">1 tegen 1</button></span>
      <span class="seg" title="Nieuw is wie nog geen ${SETTLED} spellen in deze spelvorm speelde"><button class="${S.ui.rnew ? '' : 'on'}" data-act="rnew" data-on="">Zonder nieuwe</button><button class="${S.ui.rnew ? 'on' : ''}" data-act="rnew" data-on="1">Met nieuwe</button></span></h1>
    ${list.length ? `<div class="podium">${pod(1, 'p2')}${pod(0, 'p1')}${pod(2, 'p3')}</div>
    <section class="card"><table class="tbl"><thead><tr><th>#</th><th>Speler</th>${th('r')}<th class="hide-s">Verloop</th>${th('g', 'num hide-s')}<th class="num hide-s">${half('w', 'W')} – ${half('l', 'V')}</th>${th('pct')}<th class="num" title="Hele wedstrijden: gewonnen${draws ? ', gelijk' : ''} en verloren"><span class="hide-s">Wedstrijden</span><span class="only-s">Wedstr.</span><br>${[half('mw', 'W'), ...(draws ? [half('md', 'G')] : []), half('ml', 'V')].join('\u202f–\u202f')}</th><th class="hide-s">Vorm</th>${th('streak', '')}</tr></thead><tbody>
      ${rows.map((x) => {
        const i = x.i;
        const s = x.s; const bm = s.byMode[mode];
        return `<tr class="click ${x.p.id === S.cfg.me ? 'me' : ''}" data-act="goto" data-href="#/player/${esc(x.p.id)}" data-key="rk-${x.p.id}">
          <td class="rank">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
          <td>${who(x.p, 's', false)} ${bm.g < SETTLED ? '<span class="chip" title="Minder dan 10 spellen: rating beweegt nog snel">nieuw</span>' : ''}</td>
          <td class="num rating">${r0(x.r)}</td>
          <td class="hide-s">${sparkline(s.series[mode])}</td>
          <td class="num hide-s">${bm.g}</td>
          <td class="num hide-s">${bm.w} – ${bm.g - bm.w}</td>
          <td class="num">${pct(bm.w / bm.g)}</td>
          <td class="num nowrap rec">${[bm.mw, ...(draws ? [bm.md] : []), bm.ml].join('\u202f–\u202f')}</td>
          <td class="hide-s">${formDots(bm)}</td>
          <td>${streakTxt(bm.streak)}</td></tr>`;
      }).join('')}</tbody></table>
      ${hidden ? `<p class="muted small" style="margin:10px 0 0">${hidden === 1 ? '1 nieuwe speler staat' : `${hidden} nieuwe spelers staan`} er nog niet bij: die ${hidden === 1 ? 'heeft' : 'hebben'} nog geen ${SETTLED} spellen ${modeLabel(mode)} gespeeld. Kies <b>Met nieuwe</b> om iedereen te zien.</p>` : ''}</section>`
    : everyone.length ? `<section class="card"><div class="empty"><span class="big">🐣</span>Nog niemand heeft ${SETTLED} spellen ${modeLabel(mode)} gespeeld. Kies <b>Met nieuwe</b> om iedereen te zien.</div></section>`
    : `<section class="card"><div class="empty"><span class="big">🏆</span>Nog geen ${modeLabel(mode)}-wedstrijden gespeeld. De troon is nog vrij!</div></section>`}`;
}

// ================================================================ history
function matchCard(m, opts = {}) {
  const w = matchWins(m);
  const delta = (id) => m.games.reduce((s, g) => s + (g.delta?.[id] || 0), 0);
  // One row per player; the rating change sits in its own column so it lines up.
  const side = (t) => `<div class="tm2 ${t ? 'b' : ''} ${w[t] > w[1 - t] ? 'win' : w[t] < w[1 - t] ? 'lose' : ''}">
    ${m.teams[t].map((id) => {
      const d = delta(id);
      const dl = `<span class="delta ${d >= 0 ? 'up' : 'down'}">${signed(d)}</span>`;
      const nm = `<a class="pname" href="#/player/${esc(id)}">${esc(P(id)?.name || '?')}</a>`;
      return `<div class="prow">${t ? `${dl}${nm}${avatar(P(id), 's')}` : `${avatar(P(id), 's')}${nm}${dl}`}</div>`;
    }).join('')}</div>`;
  const crawl = m.games.some((g) => g.crawl);
  return `<div class="mcard" data-key="m-${m.id}">
    <div class="meta"><b>${clock(m.finished)}</b><span class="row tight"><span class="chip">${m.mode}</span>${m.tid ? '<span class="chip gold" title="Toernooiwedstrijd">🏅</span>' : ''}${m.source === 'manual' ? '<span title="Handmatig ingevoerd">✍️</span>' : ''}${crawl ? '<span title="Er werd gekropen!">🐌</span>' : ''}</span></div>
    ${side(0)}
    <div class="sc"><div class="tot"><span class="tc0">${w[0]}</span> – <span class="tc1">${w[1]}</span></div>
      <div class="gms dots">${gamesLine(m.games)}</div></div>
    ${side(1)}
    ${opts.ops === false || !editable(m) ? '<span></span>' : `<div class="ops"><button class="btn sm ghost" data-act="edit" data-mid="${m.id}" title="Uitslag aanpassen">✏️</button><button class="btn sm ghost" data-act="del" data-mid="${m.id}" title="Verwijderen">🗑️</button></div>`}
  </div>`;
}

function grouped(list, opts) {
  let out = '', day = '';
  for (const m of list) {
    const d = new Date(m.finished).toDateString();
    if (d !== day) { if (day) out += '</div>'; day = d; out += `<div class="day" data-key="day-${d}"><div class="dh">${esc(dayLabel(m.finished))}</div>`; }
    out += matchCard(m, opts);
  }
  return out + (day ? '</div>' : '');
}

function viewHistory() {
  const { hp, hm, limit } = S.ui;
  let list = S.history.slice().reverse();
  if (hp) list = list.filter((m) => m.teams.flat().includes(hp));
  if (hm) list = list.filter((m) => m.mode === hm);
  const shown = list.slice(0, limit);
  const ps = players().slice().sort((a, b) => a.name.localeCompare(b.name));
  return `<h1 class="page">📜 Historie <small>${list.length} wedstrijden</small><span style="flex:1"></span>
      <button class="btn primary" data-act="manual">📝 Wedstrijd invoeren</button></h1>
    <div class="row" style="margin-bottom:16px">
      <select data-change="hp" style="max-width:240px"><option value="">Alle spelers</option>${ps.map((p) => `<option value="${esc(p.id)}" ${hp === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      <select data-change="hm" style="max-width:180px"><option value="">Alle spelvormen</option><option value="2v2" ${hm === '2v2' ? 'selected' : ''}>2 tegen 2</option><option value="1v1" ${hm === '1v1' ? 'selected' : ''}>1 tegen 1</option></select>
    </div>
    ${shown.length ? grouped(shown) : '<section class="card"><div class="empty"><span class="big">📭</span>Geen wedstrijden gevonden.</div></section>'}
    ${list.length > limit ? '<div class="row" style="justify-content:center"><button class="btn" data-act="more">Meer laden</button></div>' : ''}`;
}

// ================================================================ player
function viewPlayer(id) {
  const p = P(id);
  if (!p) return '<section class="card"><div class="empty"><span class="big">🤷</span>Speler niet gevonden.</div></section>';
  const { P: SP } = stats();
  const s = SP[id];
  const list2 = ranking(players(), SP, '2v2'), list1 = ranking(players(), SP, '1v1');
  // the place among the players who are no longer new, as on the ranking
  const place = (list, mode) => {
    if (!list.some((x) => x.p.id === id)) return '';
    const i = settledIn(list, mode).findIndex((x) => x.p.id === id);
    return i >= 0 ? ` · #${i + 1}` : ' · nieuw';
  };
  // The badges for the top and the bottom of a ranking (stats.js also keeps
  // them for who stood there before): who shares the rating shares the
  // badge. Like there, only players who are no longer new count, and at
  // least four of them.
  const ends = (all, mode) => {
    const list = all.filter((x) => x.s.byMode[mode].g >= SETTLED);
    if (list.length < 4) return [new Set(), new Set()];
    const at = (r) => new Set(list.filter((x) => x.r === r).map((x) => x.p.id));
    return [at(list[0].r), list.at(-1).r < list[0].r ? at(list.at(-1).r) : new Set()];
  };
  const [king, lantern] = ends(list2, '2v2'), [duelking, diver] = ends(list1, '1v1');
  const champs = new Set((S.state.tournaments || []).flatMap((t) => t.winner));
  const ctx = { king, lantern, duelking, diver, champs };
  // the badges someone has come first, then the ones still to get
  const has = BADGES.map((b) => b.test(s, ctx));
  const got = BADGES.filter((_, i) => has[i]), todo = BADGES.filter((_, i) => !has[i]);
  const badge = (b, on) => `<div class="badge ${on ? '' : 'off'}"><span class="ic">${b.ic}</span><div><b>${b.name}</b><small>${b.desc}</small>${!on && b.goal > 1 ? `<small class="prog">${Math.max(0, Math.floor(b.val(s)))} / ${b.goal}</small>` : ''}</div></div>`;
  const cabinet = trophyCabinet(id);
  const titles = (S.state.tournaments || []).filter((t) => t.winner.includes(id)).length;
  const rel = (map, min = 1) => Object.entries(map).map(([k, x]) => ({ p: P(k), ...x })).filter((x) => x.p && x.g >= min);
  const partners = rel(s.partners).sort((a, b) => b.g - a.g);
  const opps = rel(s.opps).sort((a, b) => b.g - a.g);
  const best = rel(s.partners, 2).sort((a, b) => b.w / b.g - a.w / a.g || b.g - a.g)[0];
  const nemesis = rel(s.opps, 3).sort((a, b) => a.w / a.g - b.w / b.g || b.g - a.g)[0];
  const victim = rel(s.opps, 3).sort((a, b) => b.w / b.g - a.w / a.g || b.g - a.g)[0];
  const recent = S.history.filter((m) => m.teams.flat().includes(id)).slice(-8).reverse();
  const peaks = ['2v2', '1v1'].map((mo) => s.settledPeak[mo]).filter((v) => v !== null);
  const tile = (k, v, sub = '') => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${sub}</div></div>`;
  const relRow = (x) => `<div class="r1">${who(x.p)}<span class="muted">${x.g} spellen</span><b class="${x.w / x.g >= 0.5 ? 'up' : 'down'}">${pct(x.w / x.g)}</b></div>`;
  return `<section class="card"><div class="prof-head">${avatar(p, 'xl', isOnline(p.id))}
      <div style="flex:1;min-width:220px"><h1>${esc(p.name)}</h1>
        <div class="row" style="margin-top:8px">
          <span class="chip gold">2v2 · ${rating(p, '2v2')}${place(list2, '2v2')}</span>
          <span class="chip">1v1 · ${rating(p, '1v1')}${place(list1, '1v1')}</span>
          ${s.last ? `<span class="muted" style="font-size:13px">laatst gespeeld ${ago(s.last)}</span>` : ''}
        </div></div>
      <div class="col">${p.id === S.cfg.me ? '<span class="chip gold">Dit ben jij</span>' : `<button class="btn sm" data-act="iam" data-pid="${p.id}">🙋 Dit ben ik</button>`}
        <button class="btn sm" data-act="editPlayer" data-pid="${p.id}">✏️ Bewerken</button></div></div></section>
    <div class="tiles" style="margin:20px 0">
      ${tile('Wedstrijden', s.matches, `${s.mw}W · ${s.md}G · ${s.ml}V`)}
      ${tile('Spellen gewonnen', s.games ? pct(s.wins / s.games) : '–', `${s.wins} van ${s.games}`)}
      ${tile('Zonder spelverlies', s.sweeps, 'wedstrijden gewonnen met alle spellen')}
      ${['2v2', '1v1'].filter((mo) => s.byMode[mo].g).map((mo) => tile(`Reeks ${mo}`, streakTxt(s.byMode[mo].streak) || '–', `record: ${s.byMode[mo].best} op rij`)).join('')}
      ${peaks.length ? tile('Piek rating', r0(Math.max(...peaks)), '2v2 / 1v1') : tile('Piek rating', 'nog nieuw', `telt vanaf ${SETTLED} spellen`)}
      ${tile('<i class="tdot t0"></i>Als Zwart', s.color[0].g ? pct(s.color[0].w / s.color[0].g) : '–', `${s.color[0].w} van ${s.color[0].g} spellen gewonnen`)}
      ${tile('<i class="tdot t1"></i>Als Wit', s.color[1].g ? pct(s.color[1].w / s.color[1].g) : '–', `${s.color[1].w} van ${s.color[1].g} spellen gewonnen`)}
      ${tile('Kruipen', `${s.crawlsGiven} <small>/</small> ${s.crawled}`, '🧹 laten kruipen · 🐌 zelf gekropen')}
      ${titles ? tile('Toernooien', `🏅 ${titles}`, titles === 1 ? 'keer gewonnen' : 'keer gewonnen') : ''}
    </div>
    <div class="two">
      <section class="card"><h2>📈 Rating 2 tegen 2</h2>${lineChart(s.series['2v2'], { title: 'Rating 2 tegen 2' })}</section>
      <section class="card"><h2>📈 Rating 1 tegen 1</h2>${lineChart(s.series['1v1'], { title: 'Rating 1 tegen 1' })}</section>
    </div>
    <div class="two" style="margin-top:20px">
      <section class="card"><h2>🤝 Maatjes</h2>
        ${best ? `<p>Beste maatje: ${who(best.p)} <b class="up">${pct(best.w / best.g)}</b> <span class="muted">in ${best.g} spellen</span></p>` : ''}
        <div class="rel">${partners.slice(0, 8).map(relRow).join('') || '<div class="empty dim">Nog geen 2v2 gespeeld</div>'}</div></section>
      <section class="card"><h2>⚔️ Tegenstanders</h2>
        ${nemesis && nemesis.w / nemesis.g < 0.5 ? `<p>😈 Nemesis: ${who(nemesis.p)} <span class="muted">wint ${pct(1 - nemesis.w / nemesis.g)} van jullie spellen</span></p>` : ''}
        ${victim && victim.w / victim.g > 0.5 ? `<p>🍖 Favoriete prooi: ${who(victim.p)} <span class="muted">${pct(victim.w / victim.g)} gewonnen</span></p>` : ''}
        <div class="rel">${opps.slice(0, 8).map(relRow).join('') || '<div class="empty dim">Nog geen tegenstanders</div>'}</div></section>
    </div>
    <section class="card" style="margin-top:20px"><h2>🏆 Trofeeën <span class="sub">speler, stijger en daler van een week, maand of jaar</span></h2>
      ${cabinet.length ? `<div class="row">${cabinet.map((c) => `<span class="chip gold">${c}</span>`).join('')}</div>` : '<div class="empty dim">Nog geen trofeeën. Win de meeste spellen van een week, of stijg het hardst.</div>'}</section>
    <section class="card" style="margin-top:20px"><h2>🎖️ Badges <span class="sub">${got.length} / ${BADGES.length}</span></h2>
      <div class="badges">${got.map((b) => badge(b, true)).join('')}${todo.map((b) => badge(b, false)).join('')}</div></section>
    <h2 class="h2" style="margin-top:26px">🕒 Recente wedstrijden</h2>
    ${recent.length ? recent.map((m) => matchCard(m, { ops: false })).join('') : '<div class="empty">Nog geen wedstrijden.</div>'}`;
}

// ================================================================ hall of fame
// Trophies go to a period once it is over; the running one only shows who leads.
const TROPHY = { best: ['🏆', 'Speler'], up: ['📈', 'Stijger'], down: ['📉', 'Daler'] };
const PERIOD = { week: ['week', 'de week'], month: ['maand', 'de maand'], year: ['jaar', 'het jaar'] };

function trophyCabinet(id) {
  const { trophies } = stats();
  const now = periodsOf(Date.now());
  const out = [];
  for (const k of ['week', 'month', 'year']) {
    for (const t of Object.keys(TROPHY)) {
      const n = trophies[k].filter((e) => e.key < now[k] && e[t]?.ids.includes(id)).length;
      if (n) out.push(`${TROPHY[t][0]} ${n}× ${TROPHY[t][1].toLowerCase()} van ${PERIOD[k][1]}`);
    }
  }
  return out;
}

// The period just before the running one.
function previous(k, now) {
  const [y, m, d] = now[k].split('-').map(Number);
  if (k === 'week') return periodsOf(new Date(y, m - 1, d - 7)).week;
  if (k === 'month') return periodsOf(new Date(y, m - 2, 1)).month;
  return String(y - 1);
}

// "Vorige week" when it is the one just before, otherwise the period itself.
function periodName(k, key, now) {
  if (key === previous(k, now)) return { week: 'Vorige week', month: 'Vorige maand', year: 'Vorig jaar' }[k];
  const [y, m, d] = key.split('-').map(Number);
  if (k === 'week') return `Week van ${new Date(y, m - 1, d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}`;
  if (k === 'month') return new Date(y, m - 1, 1).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
  return key;
}

function trophyCards(all) {
  const { trophies } = stats();
  const now = periodsOf(Date.now());
  const ids = (e) => all(e.ids.filter((x) => P(x)).map((x) => P(x).name));
  const val = { best: (x) => `${x.w} gewonnen`, up: (x) => signed(x.d), down: (x) => signed(x.d) };
  return ['week', 'month', 'year'].map((k) => {
    const cur = trophies[k].find((e) => e.key === now[k]);
    const prev = trophies[k].filter((e) => e.key < now[k]).at(-1);
    const lines = Object.entries(TROPHY).map(([t, [ic, nm]]) => `<div class="trow"><span class="ic">${ic}</span><span class="k">${nm}</span>${cur?.[t] ? `<b>${ids(cur[t])}</b><span class="muted">${val[t](cur[t].x)}</span>` : '<span class="dim">–</span>'}</div>`).join('');
    const past = prev && Object.entries(TROPHY).filter(([t]) => prev[t]).map(([t, [ic]]) => `${ic} ${ids(prev[t])}`).join(' · ');
    return `<section class="card trophy"><h2>${{ week: 'Deze week', month: 'Deze maand', year: 'Dit jaar' }[k]}</h2>${lines}
      ${past ? `<div class="prev"><span class="muted">${periodName(k, prev.key, now)}:</span> ${past}</div>` : ''}</section>`;
  }).join('');
}

function viewFame() {
  const { P: SP, rec, duos } = stats();
  // A record shared by several players names them all.
  const all = (ns) => (ns.sort((a, b) => a.localeCompare(b)), ns.length > 1 ? `${ns.slice(0, -1).map(esc).join(', ')} en ${esc(ns.at(-1))}` : esc(ns[0] || ''));
  const top = (mode) => {
    const list = settledIn(ranking(players(), SP, mode), mode);
    return list[0] && { r: list[0].r, who: all(list.filter((x) => x.r === list[0].r).map((x) => x.p.name)) };
  };
  const best = (fn) => {
    const v = Math.max(0, ...Object.values(SP).filter((s) => P(s.id)).map(fn));
    return { v, who: all(Object.values(SP).filter((s) => P(s.id) && v && fn(s) === v).map((s) => P(s.id).name)) };
  };
  const streak = best((s) => s.bestStreak);
  const broom = best((s) => s.crawlsGiven);
  const snail = best((s) => s.crawled);
  const busy = best((s) => s.games);
  const card = (ic, k, v, sub) => `<div class="record"><span class="ic">${ic}</span><div class="k">${k}</div><div class="v">${v}</div><div class="s">${sub}</div></div>`;
  const teamTxt = (m, t) => esc(names(m.teams[t]));
  const recs = [];
  const k2 = top('2v2'), k1 = top('1v1');
  if (k2) recs.push(card('👑', 'Koning van de tafel (2v2)', k2.who, `rating ${r0(k2.r)}`));
  if (k1) recs.push(card('🥊', 'Duelkampioen (1v1)', k1.who, `rating ${r0(k1.r)}`));
  if (streak.v) recs.push(card('🔥', 'Langste winstreak', `${streak.v} op rij`, streak.who));
  if (rec.upset && rec.upset.p < 0.5) recs.push(card('🗡️', 'Grootste verrassing', `${pct(rec.upset.p)} winkans`, `${teamTxt(rec.upset.m, rec.upset.team)} wonnen toch · ${ago(rec.upset.m.finished)}`));
  const cw = rec.colorWins;
  if (cw[0] + cw[1] >= 10) {
    const z = cw[0] / (cw[0] + cw[1]);
    recs.push(card('☯️', 'Sterkste kleur', z >= 0.5 ? `Zwart ${pct(z)}` : `Wit ${pct(1 - z)}`, `van alle ${cw[0] + cw[1]} spellen gewonnen`));
  }
  if (broom.v) recs.push(card('🧹', 'Bezemwagen', `${broom.v}× laten kruipen`, broom.who));
  if (snail.v) recs.push(card('🐌', 'Vaakst gekropen', `${snail.v}× onder de tafel`, snail.who));
  if (busy.v) recs.push(card('🏃', 'Tafelvreter', `${busy.v} spellen`, busy.who));
  if (rec.busiestDay) recs.push(card('📅', 'Drukste dag', `${rec.busiestDay.n} wedstrijden`, new Date(rec.busiestDay.day).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })));
  const lastT = (S.state.tournaments || [])[0];
  if (lastT) recs.unshift(card('🏅', 'Laatste toernooiwinnaar', esc(names(lastT.winner)), `${esc(lastT.name)} · ${ago(lastT.finished)}`));
  const t = rec.totals;
  const crawls = [];
  for (const m of S.history.slice().reverse()) {
    for (const g of m.games) {
      if (g.crawl) crawls.push({ m, g, loser: 1 - g.w });
    }
    if (crawls.length >= 8) break;
  }
  return `<h1 class="page">🏛️ Hall of Fame <small>records, legendes en schandpaal</small></h1>
    <div class="tiles" style="margin-bottom:20px">
      <div class="tile"><div class="k">Wedstrijden</div><div class="v">${t.matches}</div></div>
      <div class="tile"><div class="k">Spellen</div><div class="v">${t.games}</div></div>
      <div class="tile"><div class="k">Spelers</div><div class="v">${players().filter((p) => !p.retired).length}</div></div>
      <div class="tile"><div class="k">Keer gekropen</div><div class="v">${t.crawls} 🐌</div></div>
    </div>
    ${recs.length ? `<div class="records">${recs.join('')}</div>` : '<section class="card"><div class="empty"><span class="big">🏛️</span>Nog geen records. Speel de eerste wedstrijd en schrijf geschiedenis!</div></section>'}
    ${S.history.length ? `<h2 class="h2" style="margin-top:26px">🏆 Trofeeën <span class="sub">wie wint de meeste spellen, en wie stijgt of daalt het hardst</span></h2><div class="trophies">${trophyCards(all)}</div>` : ''}
    <div class="two" style="margin-top:20px">
      <section class="card"><h2>💞 Gouden duo's <span class="sub">min. 3 spellen samen</span></h2>
        ${duos.length ? `<table class="tbl"><tbody>${duos.slice(0, 10).map((d, i) => `<tr><td class="rank">${i + 1}</td><td><span class="teamline">${d.ids.map((id) => who(P(id))).join('')}</span></td><td class="num">${d.g} spellen</td><td class="num"><b class="${d.w / d.g >= 0.5 ? 'up' : 'down'}">${pct(d.w / d.g)}</b></td></tr>`).join('')}</tbody></table>` : '<div class="empty dim">Nog geen duo met 3 spellen samen.</div>'}</section>
      <section class="card"><h2>🐌 De Kruiphoek <span class="sub">wie moest er onder de tafel door</span></h2>
        ${crawls.length ? `<div class="rel">${crawls.slice(0, 8).map((c) => `<div class="r1 crawl"><span class="teamline">${c.m.teams[c.loser].map((id) => who(P(id))).join('')}</span><span><i class="tdot t${c.loser}"></i></span><span class="muted">${ago(c.m.finished)}</span></div>`).join('')}</div>` : '<div class="empty dim">Nog niemand onder de tafel gekropen. Nog niet…</div>'}</section>
    </div>`;
}

// ================================================================ players
function viewPlayers() {
  const byOnline = S.cfg.psort === 'online';
  const ps = players().slice().sort((a, b) => (byOnline && isOnline(b.id) - isOnline(a.id)) || a.name.localeCompare(b.name));
  const active = ps.filter((p) => !p.retired);
  const retired = ps.filter((p) => p.retired);
  const card = (p) => `<a class="pcard ${p.retired ? 'retired' : ''}" href="#/player/${esc(p.id)}" data-key="pc-${p.id}">${avatar(p, 'm', isOnline(p.id))}
      <div><div class="nm">${esc(p.name)} ${p.id === S.cfg.me ? '<span class="chip gold">jij</span>' : ''}</div>
      <div class="rt">2v2 ${rating(p, '2v2')} · 1v1 ${rating(p, '1v1')}</div></div></a>`;
  return `<h1 class="page">👥 Spelers <small>${active.length} in de selectie</small><span style="flex:1"></span>
      <span class="seg" title="Sorteren"><button class="${byOnline ? '' : 'on'}" data-act="psort" data-by="name">Op naam</button><button class="${byOnline ? 'on' : ''}" data-act="psort" data-by="online">Online eerst</button></span>
      <button class="btn primary" data-act="newPlayer">+ Nieuwe speler</button></h1>
    ${ps.length ? '' : '<section class="card"><div class="empty"><span class="big">👥</span>Nog geen spelers. Voeg de eerste toe!</div></section>'}
    ${active.length ? `<div class="pgrid">${active.map(card).join('')}</div>` : ''}
    ${retired.length ? `<h2 class="sub-h">Gestopt <small>${retired.length}</small></h2><div class="pgrid">${retired.map(card).join('')}</div>` : ''}`;
}

// ================================================================ settings
// Players and devices differ: someone can be on a phone and a pc at once, and
// a browser where nobody has been chosen yet is a device without a player.
function onlineLine() {
  const ps = S.online.pids.map(P).filter(Boolean).length;
  return `${ps} ${ps === 1 ? 'speler' : 'spelers'} online · ${S.online.n} ${S.online.n === 1 ? 'apparaat' : 'apparaten'}`;
}

function aboutVersions() {
  const app = native.version || 'dev';
  const srv = S.state?.version || '?';
  if (isWeb) return `<div>Versie <b>${esc(srv)}</b> <span class="muted">(webversie van de server)</span></div>`;
  if (isHosted) return `<div>Webapp <b>${esc(app)}</b> · server <b>${esc(srv)}</b></div>`;
  return `<div>App <b>${esc(app)}</b> · server <b>${esc(srv)}</b></div>
    ${srv !== '?' && app !== srv ? '<div class="lock" style="border-color:rgba(255,200,61,.4);background:rgba(255,200,61,.08)"><span>⚠️</span><span>De app en de server hebben een andere versie. Werkt iets niet zoals verwacht? Gebruik overal dezelfde versie.</span></div>' : ''}`;
}

function viewSettings() {
  const set = settings();
  const m = me();
  const notif = 'Notification' in window && window.isSecureContext;
  const deb = native.deb || {}; // Linux packages on offer, size per architecture
  const hasDeb = !!(deb.amd64 || deb.arm64);
  const mb = (n) => Math.max(1, Math.round(n / 1048576));
  return `<h1 class="page">⚙️ Instellingen</h1>
    <div class="two">
      <section class="card"><h2>🙋 Jij</h2>
        <div class="col">
          <div class="row">${m ? who(m, 'm', false) : '<span class="muted">Je hebt nog niet gekozen wie je bent.</span>'}<div style="flex:1"></div><button class="btn sm" data-act="who">${m ? 'Wisselen' : 'Kiezen'}</button>${m ? `<button class="btn sm ghost" data-act="editPlayer" data-pid="${m.id}">✏️</button>` : ''}</div>
          <label class="checkrow"><input type="checkbox" data-act="toggleSound" ${S.cfg.sound !== false ? 'checked' : ''}> Geluidseffecten (goal, fluitje, fanfare)</label>
          <label class="checkrow"><input type="checkbox" data-act="toggleMotion" ${tableMoves() ? 'checked' : ''}> Bewegende tafel (de poppetjes spelen een potje)</label>
          ${calm && S.cfg.motion === undefined ? '<p class="muted" style="font-size:13px;margin:0">De tafel staat stil omdat dit apparaat om minder beweging vraagt (in Windows: <i>Animatie-effecten</i> uit, wat ook op een server of via extern bureaublad zo is). Vink hierboven aan om hem toch te laten bewegen.</p>' : ''}
          ${isWeb || isHosted ? `<p class="muted" style="font-size:13px">${isWeb ? '🌐 Dit is de webversie van de server. Wie je bent en het geluid worden in deze browser onthouden.' : '🌐 Dit is de webapp. Wie je bent, het geluid en de koppelcode worden in deze browser onthouden. Een melding krijg je alleen zolang deze pagina open is.'}</p>${notif ? `<button class="btn sm" data-act="notify">🔔 ${isWeb ? 'Bureaubladmeldingen' : 'Meldingen'} ${Notification.permission === 'granted' ? 'staan aan ✓' : 'aanzetten'}</button>` : isHosted ? '<p class="muted" style="font-size:13px">📱 Op een iPhone of iPad: zet KickerArena eerst op je beginscherm (Deel → <i>Zet op beginscherm</i>) en open hem daar; dan kun je hier meldingen aanzetten.</p>' : ''}`
            : '<p class="muted" style="font-size:13px">🔔 Als je wordt opgeroepen knippert KickerArena in de taakbalk en krijg je een Windows-melding.</p>'}
        </div></section>
      <section class="card"><h2>ℹ️ Over KickerArena</h2>
        <div class="col" style="font-size:14px">
          ${aboutVersions()}
          <div class="muted">Tafelvoetbalcompetitie in Deutscher Meister-stijl · Zwart tegen Wit ⚽</div>
        </div></section>
      <section class="card"><h2>📏 Spelregels <span class="sub">geldt voor iedereen</span></h2>
        <form data-form="settings" class="col">
          <label class="f">Naam van de competitie <input type="text" name="title" value="${esc(set.title)}" maxlength="24"></label>
          <label class="f">Spellen per wedstrijd <input type="number" name="gamesPerMatch" min="1" max="9" value="${set.gamesPerMatch}" class="num-in"></label>
          <div class="f"><span>Uitslag bijhouden</span>
            <label class="radio"><input type="radio" name="scoring" value="games" ${set.scoring !== 'goals' ? 'checked' : ''}> Per spel wie er won <span class="muted">(met 🐌 voor kruipen)</span></label>
            <label class="radio"><input type="radio" name="scoring" value="goals" ${set.scoring === 'goals' ? 'checked' : ''}> Goals live meetellen, spel is uit bij
              <input type="number" name="goalsToWin" min="1" max="99" value="${set.goalsToWin}" class="num-in inline"> goals</label>
          </div>
          <div><button class="btn primary" type="submit">Opslaan</button></div>
        </form></section>
      <section class="card"><h2>🌐 Website</h2>
        <div class="col">
          <p class="muted small">De server biedt KickerArena ook aan als website op het lokale netwerk, voor browsers en telefoons:</p>
          <div class="urls">${(S.state.webUrls || []).filter((u) => !u.includes('localhost')).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`).join('') || '<span class="muted">De website staat uit.</span>'}</div>
          ${S.state.webApp ? `<p class="muted small">En als webapp op internet, ook buiten het kantoor en op een iPhone. Je hebt er de koppelcode voor nodig:</p>
          <div class="urls"><a href="${esc(S.state.webApp)}" target="_blank" rel="noopener">${esc(S.state.webApp)}</a></div>` : ''}</div></section>
      ${isWeb && (native.download || native.apk || hasDeb) ? `<section class="card span2 dlcard"><div class="dlicon">📲</div><div><h2>KickerArena-app downloaden</h2>
        <p class="muted">Met de app krijg je een melding als je aan de beurt bent, en hij werkt ook buiten het kantoor (via internet).</p>
        <div class="dlbtns">
          ${native.download ? `<a class="btn primary" href="/download/KickerArena.zip" download>${WINDOWS} Windows <span class="muted small">(zip, ${Math.round(native.download / 1048576)} MB)</span></a>` : ''}
          ${native.apk ? `<a class="btn primary" href="/download/KickerArena.apk" download>${ANDROID} Android <span class="muted small">(apk, ${Math.max(1, Math.round(native.apk / 1048576))} MB)</span></a>` : ''}
          ${deb.amd64 ? `<a class="btn primary" href="/download/kickerarena_amd64.deb" download>${TUX} Linux <span class="muted small">(deb, ${mb(deb.amd64)} MB)</span></a>` : ''}
          ${deb.arm64 ? `<a class="btn primary" href="/download/kickerarena_arm64.deb" download>${TUX} Linux ARM <span class="muted small">(deb, ${mb(deb.arm64)} MB)</span></a>` : ''}
          <span class="muted small">versie ${esc(native.version || '')}</span></div>
        ${native.download ? `<p class="muted small"><b>Windows:</b> geen installatie nodig. Pak de zip uit in een eigen map en start <b>KickerArena.exe</b>; de koppelcode zit al in de zip (<b>KickerArena.koppelcode</b>, laat dat bestand naast de exe staan). Zegt Windows <i>"Windows heeft uw pc beschermd"</i>? De app is niet digitaal ondertekend: klik op <b>Meer info</b> → <b>Toch uitvoeren</b>, of klik vóór het uitpakken met rechts op de zip → <b>Eigenschappen</b> → <b>Blokkering opheffen</b>. Ontbreekt die knop, dan heeft je IT-afdeling dat geblokkeerd; gebruik dan gewoon deze website.</p>` : ''}
        ${native.apk ? `<p class="muted small"><b>Android:</b> download de apk op je telefoon en open hem; sta één keer toe dat je browser apps mag installeren (<i>onbekende bronnen</i>). Bij de eerste start scan je de QR-code hieronder, of typ je de koppelcode over.</p>` : ''}
        ${hasDeb ? `<p class="muted small"><b>Linux:</b> voor Debian 12 en nieuwer, Ubuntu 22.04 en nieuwer en Raspberry Pi OS (de gewone download is voor pc's, <i>Linux ARM</i> voor 64-bit ARM zoals de Raspberry Pi). Open het gedownloade bestand om het te installeren, of typ in een terminal <code>sudo apt install ./kickerarena_amd64.deb</code>. Start daarna <b>KickerArena</b> uit het programmamenu en typ bij de eerste start de koppelcode hieronder over.</p>` : ''}
        <div class="codebox"><span class="muted small">Koppelcode van deze server:</span>
          <span class="row"><code class="code">${esc(native.code || '')}</code><button class="btn small" data-act="copyCode">Kopieer</button><button class="btn small" data-act="qrCode">QR-code</button></span></div></div></section>` : ''}
      <section class="card span2"><h2>📡 Verbinding</h2>
        <div class="col" style="font-size:14px">
          <div>Server: <b>${isWeb ? `webversie op ${esc(location.host)} ✓` : S.conn.server === 'ok' ? 'verbonden ✓' : S.conn.server === 'syncing' ? 'niet gevonden, draait KickerArena-Server.exe?' : 'geen broker bereikbaar'}</b> · ${onlineLine()}</div>
          ${isWeb ? '<div class="muted" style="font-size:13px">Deze pagina praat direct met de server op het lokale netwerk. De desktop-apps verbinden via de brokers hieronder:</div>' : ''}
          <div>Koppelcode: <b class="code">${esc(native.code || 'nog niet ingevuld')}</b> ${isWeb ? '<button class="btn small" data-act="copyCode">Kopieer</button>' : '<button class="btn small" data-act="pair">Wijzigen</button>'}${native.code ? ' <button class="btn small" data-act="qrCode">QR-code</button>' : ''}${isHosted && native.code ? ' <button class="btn small" data-act="unpair">Vergeten</button>' : ''}</div>
          <div class="brokers">${brokerList()}</div>
          <div class="lock"><span>🔐</span><span>Alle berichten gaan tegelijk via vier publieke MQTT-brokers; zolang er één werkt, werkt KickerArena. Elk bericht is versleuteld met AES-256-GCM. De sleutel en de (anonieme) naam van het kanaal worden uit de koppelcode berekend: wie de code niet heeft, ziet alleen onleesbare data, en servers met een andere code komen elkaar niet tegen. Er zijn geen open poorten nodig, alleen uitgaand internet.</span></div>
        </div></section>
    </div>`;
}
