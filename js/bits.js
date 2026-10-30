// Small view helpers shared by several pages.
import { S } from './store.js';
import { esc, r0 } from './ui.js';

export const LOGO = '<svg viewBox="0 0 100 100"><use href="#logo"/></svg>';
export const isOnline = (id) => S.online.pids.includes(id);
export const rating = (p, mode) => r0(mode === '1v1' ? p.solo : p.duo);
export const modeLabel = (m) => (m === '1v1' ? '1 tegen 1' : '2 tegen 2');

/** The games of a match: goal scores when they were counted, otherwise Zwart/Wit dots (🐌 = crawl). */
export function gamesLine(games) {
  return games.map((g) => {
    const crawl = g.crawl ? '<small title="kruipen!">🐌</small>' : '';
    if (g.score?.length === 2) return `<span class="gs t${g.w}" title="${g.w ? 'Wit' : 'Zwart'} wint">${g.score[0]}-${g.score[1]}</span>${crawl}`;
    return `<i class="tdot t${g.w}" title="${g.w ? 'Wit' : 'Zwart'}${g.crawl ? ' (kruipen!)' : ''}"></i>${crawl}`;
  }).join('');
}

export const tournamentChip = (m) => (m.tid ? `<span class="chip gold" title="Toernooiwedstrijd">🏅 ${esc(S.state?.tournament?.id === m.tid ? S.state.tournament.name : 'toernooi')}</span>` : '');

// ---- playing from a later moment, and asking for a delay
/** The queue entry only joins in from a moment that is still to come. */
export const isLater = (q) => !!q.from && q.from > Date.now();
/** "12:30" for a moment in ms (the same notation the server takes). */
export const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
/** The next two half hours that are at least a few minutes away, today. */
export function whenOptions() {
  const out = [];
  const d = new Date(Date.now() + 5 * 60000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  const today = new Date().getDate();
  for (let i = 0; i < 2 && d.getDate() === today; i++) { out.push(hhmm(d.getTime())); d.setMinutes(d.getMinutes() + 30); }
  return out;
}
/** The next player in line who could step into match m right now. */
export const substituteFor = (m) => S.state.queue.find((q) => !isLater(q) && q.modes.includes(m.mode));
/** A called player may ask for time or step out: not in tournaments, not once a game is played. */
export const canStepOut = (m, pid) => !!pid && m.state === 'called' && !m.tid && !m.games.length && m.teams.flat().includes(pid);
/** Hours after its result was recorded that a match can still be changed or removed (the server's EditHours). */
export const EDIT_HOURS = 2;
/** Whether the apps may still change or remove m; afterwards only the admin app can. */
export const editable = (m) => Date.now() - Math.max(m.created || 0, m.finished || 0) <= EDIT_HOURS * 3600000;
/** "12:30" today as a moment in ms. */
export const whenMs = (at) => { const [h, mi] = at.split(':').map(Number); const d = new Date(); d.setHours(h, mi, 0, 0); return d.getTime(); };

// The brokers the server is on. A server of before 1.9.3 does not tell: its
// version does. null = not known (yet).
const LEGACY = ['test.mosquitto.org', 'mqtt.tyckr.io'];
export function serverBrokers() {
  const st = S.state;
  if (!st) return null;
  if (st.brokers?.length) return st.brokers;
  const v = /^(\d+)\.(\d+)\.(\d+)/.exec(st.version || '');
  if (!v) return null;
  const n = Number(v[1]) * 1e6 + Number(v[2]) * 1e3 + Number(v[3]);
  return n < 1009001 ? [...LEGACY, 'broker.bevywise.com'] : [...LEGACY, 'broker.emqx.io', 'broker.hivemq.com'];
}
/** The connections of this device that actually lead to the server. */
export function sharedBrokers() {
  const srv = serverBrokers();
  return S.conn.brokers.filter((b) => !srv || srv.includes(b.name));
}
