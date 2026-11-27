// Tournament page and the tournament card on the arena.
import { S, P, me } from './store.js';
import { esc, avatar, who, ago } from './ui.js';
import { modeLabel } from './bits.js';

const team = (ids) => (ids?.length ? ids.map((id) => P(id)?.name || '?').join(' & ') : '');
const teamAv = (ids) => (ids || []).map((id) => avatar(P(id), 's')).join('');
const formatLabel = (t) => (t.format === 'rounds' ? `Wisselende teams · ${t.rounds} rondes` : 'Vaste teams · knock-out');
const targetLabel = (t) => (t.target === 1 ? 'wedstrijd = 1 spel' : `best of ${2 * t.target - 1}`);

function canStart(t) {
  const n = t.players.length;
  if (t.mode === '2v2') return t.format === 'knockout' ? n >= 4 && n % 2 === 0 : n >= 4;
  return n >= 2;
}

function startHint(t) {
  const n = t.players.length;
  if (t.mode === '2v2' && n < 4) return `Nog ${4 - n} ${4 - n === 1 ? 'speler' : 'spelers'} nodig`;
  if (t.mode === '2v2' && t.format === 'knockout' && n % 2) return 'Voor vaste 2v2-teams is een even aantal spelers nodig';
  if (n < 2) return 'Nog een tegenstander nodig';
  return '';
}

function roundName(t, r) {
  if (t.format === 'rounds') return `Ronde ${r + 1}`;
  const left = t.plan.length - r;
  return left === 1 ? 'Finale' : left === 2 ? 'Halve finale' : left === 3 ? 'Kwartfinale' : `Ronde ${r + 1}`;
}

/** Slots that can be called now: [round, index, slot]. */
function readySlots(t) {
  const out = [];
  t.plan.forEach((round, r) => round.forEach((sl, i) => {
    if (sl.win < 0 && sl.a?.length && sl.b?.length && !sl.mid) out.push([r, i, sl]);
  }));
  return out;
}

function slotStatus(t, r, i, sl) {
  if (sl.bye) return '<span class="dim">vrije ronde</span>';
  if (sl.win >= 0) return '<span class="up">✓ gespeeld</span>';
  if (sl.mid) {
    const m = S.state.active.find((x) => x.id === sl.mid);
    return m?.state === 'live' ? '<span class="chip live">● speelt nu</span>' : '<span class="chip gold">opgeroepen</span>';
  }
  if (sl.a?.length && sl.b?.length) return `<button class="btn sm primary" data-act="tCall" data-tid="${t.id}" data-r="${r}" data-i="${i}" ${S.ui.busy ? 'disabled' : ''}>📣 Oproepen</button>`;
  return '<span class="dim">wacht op winnaar</span>';
}

function slotBox(t, r, i, sl) {
  const line = (ids, side) => {
    const won = sl.win === side;
    const lost = sl.win === 1 - side;
    return `<div class="tl ${won ? 'won' : ''} ${lost ? 'lost' : ''}"><span class="tdot t${side}"></span>
      <span class="tav">${teamAv(ids)}</span><span class="tn">${ids?.length ? esc(team(ids)) : '<span class="dim">…</span>'}</span>
      <b class="tw">${sl.win >= 0 && !sl.bye ? sl.w[side] : ''}</b></div>`;
  };
  return `<div class="slot ${sl.win >= 0 ? 'done' : ''}" data-key="s-${r}-${i}">${line(sl.a, 0)}${sl.bye ? '' : line(sl.b, 1)}<div class="st">${slotStatus(t, r, i, sl)}</div></div>`;
}

function viewOpen(t) {
  const mine = S.cfg.me && t.players.includes(S.cfg.me);
  return `<section class="card"><h2>📝 Aanmelden <span class="sub">${t.players.length} ${t.players.length === 1 ? 'speler' : 'spelers'}</span></h2>
      <div class="tplayers">${t.players.map((id) => `<span class="tp" data-key="tp-${id}">${who(P(id))}<button class="btn sm ghost" data-act="tLeave" data-tid="${t.id}" data-pid="${id}" title="Afmelden">✕</button></span>`).join('') || '<span class="muted">Nog niemand. Wees de eerste!</span>'}</div>
      <div class="row" style="margin-top:14px">
        ${me() ? (mine ? `<button class="btn" data-act="tLeave" data-tid="${t.id}">Ik doe toch niet mee</button>` : `<button class="btn primary" data-act="tJoin" data-tid="${t.id}">🙋 Ik doe mee!</button>`) : '<button class="btn" data-act="who">Wie ben jij?</button>'}
        <button class="btn" data-act="tAdd" data-tid="${t.id}">+ Spelers toevoegen</button>
        <div class="spacer"></div>
        <span class="muted small">${esc(startHint(t))}</span>
        <button class="btn primary" data-act="tStart" data-tid="${t.id}" ${canStart(t) ? '' : 'disabled'}>🏁 Start toernooi</button>
      </div></section>`;
}

function viewKnockout(t) {
  return `<section class="card"><h2>🗺️ Schema</h2>
      <div class="bracket">${t.plan.map((round, r) => `<div class="bround"><div class="bh">${roundName(t, r)}</div>
        ${round.map((sl, i) => slotBox(t, r, i, sl)).join('')}</div>`).join('')}
        <div class="bround"><div class="bh">Winnaar</div><div class="slot champ">${t.winner?.length ? `<div class="tl won">🏆 <span class="tav">${teamAv(t.winner)}</span><span class="tn">${esc(team(t.winner))}</span></div>` : '<div class="tl"><span class="dim">🏆 …</span></div>'}</div></div>
      </div></section>
    ${t.teams?.length && t.mode === '2v2' ? `<section class="card"><h2>👥 Teams <span class="sub">sterkste speler met de zwakste</span></h2>
      <div class="tteams">${t.teams.map((tm, k) => `<div class="tteam"><span class="n">${k + 1}</span><span class="tav">${teamAv(tm)}</span><span>${esc(team(tm))}</span></div>`).join('')}</div></section>` : ''}`;
}

function viewRounds(t) {
  const r = t.plan.length - 1;
  const sit = t.sit?.[r] || [];
  return `<div class="two">
    <section class="card"><h2>🎲 ${roundName(t, r)} van ${t.rounds}</h2>
      <div class="rslots">${t.plan[r].map((sl, i) => slotBox(t, r, i, sl)).join('')}</div>
      ${sit.length ? `<p class="muted small">Zit deze ronde uit: ${esc(team(sit))}</p>` : ''}
      ${r > 0 ? `<details class="prev"><summary class="muted">Eerdere rondes</summary>${t.plan.slice(0, r).map((round, k) => `<div class="bh">${roundName(t, k)}</div><div class="rslots">${round.map((sl, i) => slotBox(t, k, i, sl)).join('')}</div>`).reverse().join('')}</details>` : ''}
    </section>
    <section class="card"><h2>📊 Stand</h2>
      <table class="tbl"><thead><tr><th>#</th><th>Speler</th><th class="num">Gespeeld</th><th class="num">Punten</th><th class="num">Saldo</th><th class="num hide-s">Rating</th></tr></thead><tbody>
      ${(t.table || []).map((s, k) => `<tr data-key="st-${s.pid}" class="${s.pid === S.cfg.me ? 'me' : ''}"><td class="rank">${k + 1}</td><td>${who(P(s.pid))}</td><td class="num">${s.played}</td><td class="num rating">${s.points}</td><td class="num">${s.diff > 0 ? '+' : ''}${s.diff}</td><td class="num hide-s ${s.elo > 0 ? 'up' : s.elo < 0 ? 'down' : 'dim'}">${s.elo > 0 ? '+' : ''}${s.elo}</td></tr>`).join('')}
      </tbody></table>
      <p class="muted small">Een gewonnen wedstrijd is een punt. Bij gelijke stand telt het saldo van gewonnen spellen, dan de gewonnen rating.</p>
    </section></div>`;
}

const medal = (place) => ({ 1: '🥇', 2: '🥈', 3: '🥉' }[place] || `${place}.`);

/** The final ranking of a finished tournament. */
function resultList(t) {
  if (!t.result?.length) return '';
  return `<div class="tresult">${t.result.map((r) => `<div class="tr ${r.ids.includes(S.cfg.me) ? 'me' : ''} ${r.place <= 3 ? `p${r.place}` : ''}">
      <span class="pl">${medal(r.place)}</span><span class="teamline">${r.ids.map((id) => who(P(id))).join('')}</span><span class="muted small">${esc(r.note || '')}</span></div>`).join('')}</div>`;
}

function lastResult() {
  const t = (S.state.tournaments || [])[0];
  if (!t || Date.now() - t.finished > 3 * 86400000) return '';
  const mine = t.result?.find((r) => r.ids.includes(S.cfg.me));
  return `<section class="card"><h2>🏁 Eindstand: ${esc(t.name)} <span class="sub">${ago(t.finished)}</span></h2>
    ${mine ? `<p class="mine">Jij bent <b>${mine.place === 1 ? 'kampioen! 🏆' : `${mine.place}e geworden`}</b>${mine.place > 1 && t.result.filter((r) => r.place === mine.place).length > 1 ? ' (gedeeld)' : ''}</p>` : ''}
    ${resultList(t)}</section>`;
}

function pastList() {
  const list = S.state.tournaments || [];
  if (!list.length) return '';
  return `<section class="card"><h2>🏛️ Eerdere toernooien <span class="sub">klik voor de eindstand</span></h2><div class="tpasts">${list.map((t) => `<details class="tpast" data-key="pt-${t.id}">
      <summary><span><b>${esc(t.name)}</b><br><span class="muted small">${t.format === 'rounds' ? 'wisselende teams' : 'vaste teams'} · ${modeLabel(t.mode)} · ${t.players} spelers · ${ago(t.finished)}</span></span>
      <span class="teamline right">🏆 ${t.winner.map((id) => who(P(id))).join('')}</span></summary>${resultList(t)}</details>`).join('')}</div></section>`;
}

export function viewTournament() {
  const t = S.state.tournament;
  if (!t) {
    return `<h1 class="page">🏅 Toernooi</h1>
      <section class="card thero"><div class="big">🏆</div><div><h2>Organiseer een toernooi</h2>
        <p class="muted">Kies vaste teams (knock-out, tot er één team over is) of wisselende teams (een aantal rondes met steeds andere partners). KickerArena deelt alles eerlijk in en roept de wedstrijden op.</p>
        <button class="btn primary lg" data-act="tNew">🏅 Nieuw toernooi</button></div></section>
      ${lastResult()}${pastList()}`;
  }
  const body = t.state === 'open' ? viewOpen(t) : t.format === 'rounds' ? viewRounds(t) : viewKnockout(t);
  return `<h1 class="page">🏅 ${esc(t.name)} <small>${formatLabel(t)} · ${modeLabel(t.mode)} · ${targetLabel(t)}</small>
      <span class="spacer"></span><button class="btn ghost danger" data-act="tCancel" data-tid="${t.id}">✖ Toernooi stoppen</button></h1>
    ${body}${pastList()}`;
}

/** The tournament on the arena: sign up, or the next match to call. */
export function tournamentArenaCard() {
  const t = S.state.tournament;
  if (!t) return '';
  if (t.state === 'open') {
    const mine = S.cfg.me && t.players.includes(S.cfg.me);
    return `<section class="card tcard"><h2>🏅 ${esc(t.name)} <a class="sub" href="#/tourney">bekijken →</a></h2>
      <p class="muted small">Aanmelden is open · ${t.players.length} ${t.players.length === 1 ? 'deelnemer' : 'deelnemers'}</p>
      ${me() ? `<button class="btn ${mine ? '' : 'primary'} block" data-act="${mine ? 'tLeave' : 'tJoin'}" data-tid="${t.id}">${mine ? '✓ Je doet mee (afmelden)' : '🙋 Ik doe mee!'}</button>` : ''}</section>`;
  }
  const ready = readySlots(t);
  const playing = t.plan.flat().some((sl) => sl.mid && sl.win < 0);
  const next = ready[0];
  return `<section class="card tcard"><h2>🏅 ${esc(t.name)} <a class="sub" href="#/tourney">schema →</a></h2>
    ${next ? `<div class="tnext"><span class="muted small">${roundName(t, next[0])}</span>
        <div class="tl"><span class="tdot t0"></span><span class="tav">${teamAv(next[2].a)}</span><span class="tn">${esc(team(next[2].a))}</span></div>
        <div class="tl"><span class="tdot t1"></span><span class="tav">${teamAv(next[2].b)}</span><span class="tn">${esc(team(next[2].b))}</span></div></div>
      <button class="btn primary block" data-act="tCall" data-tid="${t.id}" data-r="${next[0]}" data-i="${next[1]}" ${S.ui.busy ? 'disabled' : ''}>📣 ${playing ? 'Oproepen (wacht op tafel)' : 'Naar de tafel!'}</button>`
    : `<p class="muted small">${playing ? 'De toernooiwedstrijd wordt gespeeld…' : 'Wacht op de volgende ronde…'}</p>`}</section>`;
}
