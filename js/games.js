// The dialogs for a result: the editor for "who won game 1, 2, ..." (+
// optional crawl or score), changing a result and entering a played match.
// The apps and the admin app both use them, so they get the players and the
// way to send a command from the caller and take nothing from the store.
import { esc, modal, closeModal } from './ui.js';

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

const teamLine = (names, m, t) => `<div style="font-weight:800"><i class="tdot t${t}"></i>${t ? 'Wit' : 'Zwart'}: <span class="muted">${esc(names(m.teams[t]))}</span></div>`;

/** Changes the games of a played match; send(args) runs match.edit and throws its error. */
export function editDialog(match, names, send) {
  const m = modal(`<h3>✏️ Uitslag aanpassen</h3>
    <form class="col">
      ${teamLine(names, match, 0)}${teamLine(names, match, 1)}
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
      await send({ mid: match.id, games: read() });
      closeModal();
    } catch (err) { m.querySelector('.err').textContent = err.message; }
  });
}

/** Enters a match played without the queue, from the given players (sorted); send(args) runs match.manual. */
export function manualDialog(players, gamesPerMatch, send) {
  let mode = '2v2';
  const opts = () => `<option value="">— kies —</option>${players.map((p) => `<option value="${esc(p.id)}">${esc(p.emoji || '')} ${esc(p.name)}</option>`).join('')}`;
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
  const read = gameEditor(m.querySelector('#games'), Array.from({ length: gamesPerMatch }, () => ({ w: null, crawl: false })));
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
      await send({ mode, teams, games: read(), playedAt: at });
      closeModal();
    } catch (err) { m.querySelector('.err').textContent = err.message; }
  });
}
