// Dialogs: identity, player editor, score entry, manual match, sign up others.
import { S, P, players, settings, cmd, saveCfg, names, native, isHosted, pairHosted } from './store.js';
import { esc, avatar, emojiMark, modal, closeModal, EMOJIS, COLORS, toast } from './ui.js';
import { qrSvg } from './qr.js';
import { whenOptions, whenMs } from './bits.js';

const sorted = () => players().filter((p) => !p.retired).sort((a, b) => a.name.localeCompare(b.name));

export async function setMe(id) {
  S.cfg.me = id;
  S.cfg.spectator = !id;
  await saveCfg();
  S.link?.me(id || '');
  S.render();
}

// ---------------------------------------------------------------- identity
export function whoModal() {
  const ps = sorted();
  const m = modal(`<h3>🙋 Wie ben jij?</h3>
    <p class="muted">Kies je speler. Dit onthouden we op dit apparaat.</p>
    <div class="picker">${ps.map((p) => `<button data-pid="${esc(p.id)}">${avatar(p, 'l')}${esc(p.name)}</button>`).join('')}
      <button data-new="1"><span class="av l" style="--pc:#2a4">＋</span>Nieuwe speler</button></div>
    <div class="foot"><button class="btn" data-x="spect">Alleen kijken</button></div>`);
  m.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.pid) { closeModal(); setMe(b.dataset.pid); toast(`Hoi ${P(b.dataset.pid)?.name}! ⚽`, 'gold'); }
    else if (b.dataset.new) playerModal(null, true);
    else if (b.dataset.x === 'spect') { closeModal(); setMe(''); }
  });
}

// ---------------------------------------------------------------- pairing
/** Asks for the server's pairing code (apps and the web app). Remembered after the first time. */
export function pairModal(first) {
  const m = modal(`<h3>🔗 Koppelen met de server</h3>
    <p class="muted">${first ? 'Vul de koppelcode van de server in. Dat hoeft maar één keer: hij wordt onthouden.' : 'Vul de koppelcode van de andere server in. De app verbindt daarna met die server.'}
      Je vindt de code in het beheervenster van de server, en op de website van de server onder <i>Instellingen</i> bij de downloadknop.</p>
    <form class="col">
      <label class="f">Koppelcode <input type="text" name="code" class="code-in" placeholder="XXXX-XXXX-XXXX" maxlength="20" autocomplete="off" autocapitalize="characters" spellcheck="false" autofocus required></label>
      ${native.scan ? '<button type="button" class="btn scanbtn" data-x="scan">📷 Scan QR-code</button><p class="muted small" style="margin:0">De QR-code staat op de website van de server onder <i>Instellingen</i> (knop QR-code bij de koppelcode).</p>' : ''}
      <div class="err"></div>
      <div class="foot"><button type="button" class="btn" data-x="close">${first ? 'Later' : 'Annuleren'}</button><button class="btn primary" type="submit">Koppelen</button></div>
    </form>`);
  const input = m.querySelector('input');
  input.addEventListener('input', () => {
    const raw = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    input.value = raw.replace(/(.{4})(?=.)/g, '$1-');
  });
  m.addEventListener('click', async (e) => {
    if (e.target.closest('[data-x=close]')) closeModal();
    if (!e.target.closest('[data-x=scan]')) return;
    const err = m.querySelector('.err');
    err.textContent = '';
    try {
      const r = await fetch('/native/scan', { method: 'POST', headers: { 'X-Native-Token': native.token } });
      const j = await r.json();
      if (!j.ok) { if (j.err) err.textContent = j.err; return; }
      input.value = j.code;
      m.querySelector('form').requestSubmit(); // a scanned code is complete: pair right away
    } catch { err.textContent = 'Scannen lukte niet. Typ de code dan over.'; }
  });
  m.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = m.querySelector('.err');
    err.textContent = '';
    if (isHosted) {
      if (!pairHosted(input.value)) { err.textContent = 'Dat is geen geldige koppelcode. Hij bestaat uit 12 tekens, bijvoorbeeld ABCD-EFGH-JKLM.'; return; }
      S.link?.bye();
      location.reload();
      return;
    }
    try {
      const r = await fetch('/native/pair', { method: 'POST', headers: { 'X-Native-Token': native.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: input.value }) });
      const j = await r.json();
      if (!j.ok) { err.textContent = j.err || 'Dat lukte niet.'; return; }
      S.link?.bye?.();
      location.reload();
    } catch { err.textContent = 'Dat lukte niet. Probeer het nog eens.'; }
  });
}

// ---------------------------------------------------------------- QR code
export function qrModal(title, text, note) {
  const m = modal(`<h3>${title}</h3>
    <div class="qrbox">${qrSvg(text, 240)}<code class="code ${text.length > 20 ? 'long' : ''}">${esc(text)}</code></div>
    ${note ? `<p class="muted small">${note}</p>` : ''}
    <div class="foot"><button class="btn" data-x="close">Sluiten</button></div>`);
  m.addEventListener('click', (e) => { if (e.target.closest('[data-x=close]')) closeModal(); });
}

// ---------------------------------------------------------------- player editor
export function playerModal(p, becomeMe = false) {
  let emoji = p?.emoji || EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  let color = p?.color || COLORS[Math.floor(Math.random() * COLORS.length)];
  const m = modal(`<h3>${p ? '✏️ Speler bewerken' : '➕ Nieuwe speler'}</h3>
    <form class="col">
      <div class="row"><span class="av xl" id="pv" style="--pc:${esc(color)}">${emojiMark(emoji)}</span>
        <label class="f" style="flex:1">Naam <input type="text" name="name" maxlength="24" value="${esc(p?.name || '')}" autofocus required></label></div>
      <label class="f">Avatar</label>
      <div class="emojis">${EMOJIS.map((e) => `<button type="button" data-emoji="${e}" class="${e === emoji ? 'on' : ''}">${e}</button>`).join('')}</div>
      <label class="f">Shirtkleur</label>
      <div class="colors">${COLORS.map((c) => `<button type="button" data-color="${c}" style="background:${c}" class="${c === color ? 'on' : ''}"></button>`).join('')}</div>
      ${p ? `<label class="row" style="cursor:pointer"><input type="checkbox" name="retired" ${p.retired ? 'checked' : ''}> Gestopt (verbergen in ranglijst en kiezers)</label>` : ''}
      <div class="err"></div>
      <div class="foot"><button type="button" class="btn" data-x="close">Annuleren</button><button class="btn primary" type="submit">${p ? 'Opslaan' : 'Toevoegen'}</button></div>
    </form>`);
  const pv = m.querySelector('#pv');
  m.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.emoji) { emoji = b.dataset.emoji; pv.innerHTML = emojiMark(emoji); m.querySelectorAll('[data-emoji]').forEach((x) => x.classList.toggle('on', x === b)); }
    if (b.dataset.color) { color = b.dataset.color; pv.style.setProperty('--pc', color); m.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('on', x === b)); }
    if (b.dataset.x === 'close') closeModal();
  });
  m.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const name = f.name.value.trim();
    try {
      if (p) {
        await cmd('player.update', { id: p.id, name, emoji, color, retired: !!f.retired?.checked }, true);
        closeModal();
      } else {
        const id = await cmd('player.add', { name, emoji, color }, true);
        closeModal();
        if (becomeMe || !S.cfg.me) await setMe(id);
      }
    } catch (err) { m.querySelector('.err').textContent = err.message; }
  });
}

// ---------------------------------------------------------------- games
// Editor for "who won game 1, 2, ..." (+ optional crawl), used by the
// manual-entry and edit dialogs.
function gameEditor(box, games) {
  // A score (optional) decides the winner and the crawl by itself.
  const fromScore = (g) => {
    const [a, b] = g.score || [];
    if (Number.isInteger(a) && Number.isInteger(b) && a !== b) { g.w = a > b ? 0 : 1; g.crawl = Math.min(a, b) === 0; }
  };
  const draw = () => {
    box.innerHTML = `<div class="gamerows">${games.map((g, i) => `<div class="gamerow" data-i="${i}">
        <span class="gl">SPEL ${i + 1}</span>
        <div class="pick2"><button type="button" data-w="0" class="t0 ${g.w === 0 ? 'on' : ''}">Zwart wint</button><button type="button" data-w="1" class="t1 ${g.w === 1 ? 'on' : ''}">Wit wint</button></div>
        <span class="score-in" title="Score (mag leeg blijven)"><input type="number" min="0" max="99" data-s="0" value="${g.score?.[0] ?? ''}" placeholder="–"><b>-</b><input type="number" min="0" max="99" data-s="1" value="${g.score?.[1] ?? ''}" placeholder="–"></span>
        <button type="button" class="snailchk ${g.crawl ? 'on' : ''}" data-crawl title="Verliezers scoorden niet: kruipen!">🐌</button>
        <button type="button" class="btn sm ghost" data-del title="Spel weghalen" ${games.length > 1 ? '' : 'disabled'}>✕</button></div>`).join('')}</div>
      <div class="row" style="margin-top:8px"><button type="button" class="btn sm" data-add ${games.length >= 9 ? 'disabled' : ''}>+ Spel</button>
      <span class="dim small">Score invullen mag, hoeft niet · 🐌 = de verliezers scoorden niet</span></div>`;
  };
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const i = Number(b.closest('.gamerow')?.dataset.i);
    if (b.dataset.w) { games[i].w = Number(b.dataset.w); games[i].score = null; }
    else if ('crawl' in b.dataset) { games[i].crawl = !games[i].crawl; games[i].score = null; }
    else if ('del' in b.dataset) games.splice(i, 1);
    else if ('add' in b.dataset) games.push({ w: null, crawl: false });
    draw();
  });
  box.addEventListener('change', (e) => {
    const inp = e.target.closest('[data-s]');
    if (!inp) return;
    const g = games[Number(inp.closest('.gamerow').dataset.i)];
    g.score ||= [null, null];
    g.score[Number(inp.dataset.s)] = inp.value === '' ? null : Number(inp.value);
    fromScore(g);
    draw();
  });
  draw();
  return () => games.map((g, i) => {
    const sc = g.score;
    if (sc && Number.isInteger(sc[0]) && Number.isInteger(sc[1])) {
      if (sc[0] === sc[1]) throw new Error(`Spel ${i + 1} kan niet gelijk eindigen`);
      return { score: [sc[0], sc[1]] };
    }
    if (g.w !== 0 && g.w !== 1) throw new Error(`Kies bij spel ${i + 1} wie er won`);
    return { w: g.w, crawl: !!g.crawl };
  });
}

const teamLine = (m, t) => `<div style="font-weight:800"><i class="tdot t${t}"></i>${t ? 'Wit' : 'Zwart'}: <span class="muted">${esc(names(m.teams[t]))}</span></div>`;

export function editModal(match) {
  const m = modal(`<h3>✏️ Uitslag aanpassen</h3>
    <form class="col">
      ${teamLine(match, 0)}${teamLine(match, 1)}
      <div id="games"></div>
      <p class="muted" style="font-size:12px">Ratings van alle latere wedstrijden worden automatisch opnieuw berekend.</p>
      <div class="err"></div>
      <div class="foot"><button type="button" class="btn" data-x="close">Annuleren</button><button class="btn primary" type="submit">✅ Opslaan</button></div>
    </form>`);
  const read = gameEditor(m.querySelector('#games'), match.games.map((g) => ({ w: g.w, crawl: !!g.crawl, score: g.score ? [...g.score] : null })));
  m.querySelector('[data-x=close]').onclick = closeModal;
  m.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await cmd('match.edit', { mid: match.id, games: read() }, true);
      closeModal();
    } catch (err) { m.querySelector('.err').textContent = err.message; }
  });
}

// ---------------------------------------------------------------- manual match
export function manualModal() {
  let mode = '2v2';
  const opts = () => `<option value="">— kies —</option>${sorted().map((p) => `<option value="${esc(p.id)}">${esc(p.emoji || '')} ${esc(p.name)}</option>`).join('')}`;
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const m = modal(`<h3>📝 Gespeelde wedstrijd invoeren</h3>
    <form class="col">
      <div class="seg" style="align-self:flex-start"><button type="button" data-mode="2v2" class="on">2 tegen 2</button><button type="button" data-mode="1v1">1 tegen 1</button></div>
      <div class="slots">
        <div class="t r"><b><i class="tdot t0"></i>Team Zwart</b><select name="r0">${opts()}</select><select name="r1">${opts()}</select></div>
        <div class="t b"><b><i class="tdot t1"></i>Team Wit</b><select name="b0">${opts()}</select><select name="b1">${opts()}</select></div>
      </div>
      <div id="games"></div>
      <label class="f">Gespeeld op <input type="datetime-local" name="at" value="${now}"></label>
      <div class="err"></div>
      <div class="foot"><button type="button" class="btn" data-x="close">Annuleren</button><button class="btn primary" type="submit">Opslaan</button></div>
    </form>`);
  const f = m.querySelector('form');
  const read = gameEditor(m.querySelector('#games'), Array.from({ length: settings().gamesPerMatch }, () => ({ w: null, crawl: false })));
  m.querySelector('[data-x=close]').onclick = closeModal;
  m.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    m.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b));
    f.r1.style.display = f.b1.style.display = mode === '1v1' ? 'none' : '';
  }));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const pick = (k) => (mode === '1v1' ? [f[k + '0'].value] : [f[k + '0'].value, f[k + '1'].value]);
      const teams = [pick('r'), pick('b')];
      if (teams.flat().some((x) => !x)) throw new Error('Kies alle spelers');
      const at = f.at.value ? new Date(f.at.value).getTime() : 0;
      await cmd('match.manual', { mode, teams, games: read(), playedAt: at }, true);
      closeModal();
      toast('Wedstrijd opgeslagen ✅', 'gold');
    } catch (err) { m.querySelector('.err').textContent = err.message; }
  });
}

// ---------------------------------------------------------------- a time today
/** Asks for a time later today. Resolves to "HH:MM", or null when cancelled. */
export function timeModal(title, text) {
  return new Promise((resolve) => {
    const d = new Date(Date.now() + 30 * 60000);
    const start = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes() - (d.getMinutes() % 5)).padStart(2, '0')}`;
    const m = modal(`<h3>${title}</h3>
      <p class="muted">${text}</p>
      <form class="col"><div class="row" style="align-items:center"><input type="time" name="at" value="${start}" required class="time-in" autofocus><span class="muted small">vandaag</span></div>
        <div class="err"></div>
        <div class="foot"><button type="button" class="btn" data-x="close">Annuleren</button><button class="btn primary" type="submit">Kiezen</button></div></form>`);
    let done = false;
    const finish = (v) => { if (done) return; done = true; closeModal(); resolve(v); };
    m.querySelector('[data-x]').addEventListener('click', () => finish(null));
    m.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const at = e.target.at.value;
      if (!/^\d\d:\d\d$/.test(at) || whenMs(at) <= Date.now()) { m.querySelector('.err').textContent = 'Kies een tijdstip later vandaag.'; return; }
      finish(at);
    });
    // closed with Esc or a click next to it
    new MutationObserver((_, o) => { if (!m.isConnected) { o.disconnect(); finish(null); } }).observe(document.body, { childList: true });
  });
}

// ---------------------------------------------------------------- sign up someone else
export function signupOtherModal() {
  const MODES = { '2v2': ['2v2'], '1v1': ['1v1'], both: ['1v1', '2v2'] };
  const m = modal('');
  let at = ''; // "" = now, or HH:MM later today
  let custom = false; // typing a time of one's own
  const whenRow = () => {
    const opts = whenOptions();
    const own = at && !opts.includes(at);
    return `<div class="when" style="margin-top:14px"><span class="lbl">Wanneer?</span><span class="seg"><button data-at="" class="${at || custom ? '' : 'on'}">Nu</button>${opts.map((o) => `<button data-at="${o}" class="${at === o ? 'on' : ''}">${o}</button>`).join('')}<button data-other class="${own || custom ? 'on' : ''}">${own ? at : 'Anders…'}</button></span>
      ${custom ? '<input type="time" class="time-in sm" title="Een tijdstip later vandaag" autofocus>' : ''}</div>`;
  };
  const stepMode = () => {
    m.innerHTML = `<h3>➕ Iemand aanmelden</h3>
      <p class="muted">Stap 1: welke spelvorm?</p>
      <div class="choice" style="grid-template-columns:repeat(3,1fr)"><button data-mode="2v2"><b>2 tegen 2</b><small>met maatje</small></button><button data-mode="1v1"><b>1 tegen 1</b><small>duel</small></button><button data-mode="both"><b>Beide</b><small>maakt niet uit</small></button></div>
      ${whenRow()}
      <div class="foot"><button class="btn" data-x="close">Sluiten</button></div>`;
  };
  const stepPlayers = (mode, added = 0) => {
    const inQ = new Set(S.state.queue.map((q) => q.pid));
    const busy = new Set(S.state.active.flatMap((x) => x.teams.flat()));
    const ps = sorted().filter((p) => !inQ.has(p.id) && !busy.has(p.id));
    const label = { '2v2': '2 tegen 2', '1v1': '1 tegen 1', both: 'beide' }[mode];
    m.innerHTML = `<h3>➕ Iemand aanmelden</h3>
      <p class="muted">Stap 2: wie meld je aan voor <b>${label}</b>${at ? `, vanaf <b>${at}</b>` : ''}? Handig voor collega's zonder app, of die net de gang op liepen.${added ? ` <b>${added} aangemeld.</b>` : ''}</p>
      <div class="picker">${ps.map((p) => `<button data-pid="${esc(p.id)}">${avatar(p, 'l')}${esc(p.name)}</button>`).join('') || '<span class="muted">Iedereen staat al in de rij of speelt.</span>'}</div>
      <div class="foot"><button class="btn" data-x="back">← Andere spelvorm</button><button class="btn primary" data-x="close">Klaar</button></div>`;
    m.dataset.mode = mode; m.dataset.added = added;
  };
  stepMode();
  m.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.x === 'close') return closeModal();
    if (b.dataset.x === 'back') return stepMode();
    if (b.dataset.other !== undefined) { custom = true; at = ''; stepMode(); m.querySelector('.time-in')?.focus(); return; }
    if (b.dataset.at !== undefined) { at = b.dataset.at; custom = false; return stepMode(); }
    if (b.dataset.mode) return stepPlayers(b.dataset.mode);
    if (b.dataset.pid) {
      try {
        await cmd('queue.join', { pid: b.dataset.pid, modes: MODES[m.dataset.mode], from: at ? whenMs(at) : 0 });
        b.remove();
        m.dataset.added = Number(m.dataset.added) + 1;
      } catch { /* toast shown */ }
    }
  });
  m.addEventListener('change', (e) => {
    if (!e.target.matches('.time-in')) return;
    if (!e.target.value) return;
    if (whenMs(e.target.value) <= Date.now()) { toast('Kies een tijdstip later vandaag', 'err'); return; }
    at = e.target.value; custom = false;
    stepMode();
  });
}

// ---------------------------------------------------------------- tournaments
export function tournamentModal() {
  let format = 'knockout', mode = '2v2', target = 1;
  const m = modal(`<h3>🏅 Nieuw toernooi</h3>
    <form class="col">
      <label class="f">Naam <input type="text" name="name" maxlength="24" placeholder="Vrijdagmiddagbeker" autofocus></label>
      <div class="f"><span>Soort</span>
        <div class="choice" data-g="format">
          <button type="button" data-v="knockout" class="on"><b>Vaste teams</b><small>knock-out: wie verliest ligt eruit, tot er één team over is</small></button>
          <button type="button" data-v="rounds"><b>Wisselende teams</b><small>rondes met steeds andere partners; de meeste overwinningen wint</small></button>
        </div></div>
      <div class="row">
        <div class="f"><span>Spelvorm</span><span class="seg" data-g="mode"><button type="button" data-v="2v2" class="on">2 tegen 2</button><button type="button" data-v="1v1">1 tegen 1</button></span></div>
        <div class="f"><span>Wedstrijdlengte</span><span class="seg" data-g="target"><button type="button" data-v="1" class="on">1 spel</button><button type="button" data-v="2">Best of 3</button><button type="button" data-v="3">Best of 5</button></span></div>
      </div>
      <p class="muted small" id="tlen">In een toernooi heeft elke wedstrijd een winnaar nodig (geen 1-1). Bij <b>1 spel</b> beslist één spel; bij <b>best of 3</b> speel je door tot een team 2 spellen heeft gewonnen (dus 2 of 3 spellen); bij <b>best of 5</b> tot 3 gewonnen spellen.</p>
      <label class="f" id="rounds" style="display:none">Aantal rondes <input type="number" name="rounds" min="1" max="15" value="4" class="num-in"></label>
      <p class="muted small" id="hint">Teams worden eerlijk samengesteld: de sterkste speler met de zwakste. De favorieten komen elkaar pas laat tegen.</p>
      <div class="err"></div>
      <div class="foot"><button type="button" class="btn" data-x="close">Annuleren</button><button class="btn primary" type="submit">Aanmaken</button></div>
    </form>`);
  const f = m.querySelector('form');
  m.querySelector('[data-x=close]').onclick = closeModal;
  m.querySelectorAll('[data-g] button').forEach((b) => b.addEventListener('click', () => {
    const g = b.closest('[data-g]').dataset.g;
    b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    if (g === 'format') format = b.dataset.v;
    if (g === 'mode') mode = b.dataset.v;
    if (g === 'target') target = Number(b.dataset.v);
    m.querySelector('#rounds').style.display = format === 'rounds' ? '' : 'none';
    m.querySelector('#hint').textContent = format === 'rounds'
      ? 'Elke ronde worden nieuwe wedstrijden ingedeeld met spelers met een vergelijkbare stand, en zo weinig mogelijk dezelfde partner. Wie uitzit, wisselt eerlijk.'
      : 'Teams worden eerlijk samengesteld: de sterkste speler met de zwakste. De favorieten komen elkaar pas laat tegen.';
  }));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await cmd('tourn.create', { name: f.name.value, format, mode, target, rounds: Number(f.rounds.value) }, true);
      closeModal();
      location.hash = '#/tourney';
    } catch (err) { m.querySelector('.err').textContent = err.message; }
  });
}

export function tournamentAddModal(tid) {
  const t = S.state.tournament;
  const ps = sorted().filter((p) => !t?.players.includes(p.id));
  const m = modal(`<h3>➕ Spelers toevoegen</h3>
    <div class="picker">${ps.map((p) => `<button data-pid="${esc(p.id)}">${avatar(p, 'l')}${esc(p.name)}</button>`).join('') || '<span class="muted">Iedereen doet al mee.</span>'}</div>
    <div class="foot"><button class="btn" data-x="close">Klaar</button></div>`);
  m.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.x) return closeModal();
    try { await cmd('tourn.join', { tid, pid: b.dataset.pid }); b.remove(); } catch { /* toast shown */ }
  });
}
