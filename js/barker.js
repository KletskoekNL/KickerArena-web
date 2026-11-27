// The barker: a fairground caller who announces what happens at the table,
// by name, with a little fairground music around it (#54). One device next
// to the table turns it on (Settings → You); the others stay quiet.
//
// The music is made here, in the browser: no recordings, so nothing to
// license and nothing to download. The voice is the device's own: the
// browser's, or in the Android app the phone's (its WebView cannot speak).
import { S, P } from './store.js';
import { audioCtx } from './ui.js';

export const barkerOn = () => !!S.cfg.barker;

// ------------------------------------------------------------------ music

const N = (n) => 440 * Math.pow(2, (n - 69) / 12); // midi note -> Hz

// A reedy organ pipe: a few detuned waves through a soft filter.
function organ(c, t, note, len, vol = 0.12) {
  const g = c.createGain(), f = c.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 2600;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.015);
  g.gain.setValueAtTime(vol, t + len * 0.8);
  g.gain.linearRampToValueAtTime(0, t + len);
  for (const [type, mul, det] of [['sawtooth', 1, -6], ['square', 1, 6], ['triangle', 2, 0]]) {
    const o = c.createOscillator();
    o.type = type; o.frequency.value = N(note) * mul; o.detune.value = det;
    o.connect(f); o.start(t); o.stop(t + len + 0.05);
  }
  f.connect(g).connect(c.destination);
}
function bell(c, t, note, vol = 0.1) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine'; o.frequency.value = N(note) * 2;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.7);
}
function drum(c, t, vol = 0.5) {
  const o = c.createOscillator(), g = c.createGain();
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.25);
}
function roll(c, t, len) { for (let x = 0; x < len; x += 0.05) drum(c, t + x, 0.12 + 0.3 * x / len); }
function trombone(c, t, note, len) {
  const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
  o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 900;
  o.frequency.setValueAtTime(N(note), t); o.frequency.linearRampToValueAtTime(N(note) * 0.94, t + len);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.05); g.gain.linearRampToValueAtTime(0, t + len);
  o.connect(f).connect(g).connect(c.destination); o.start(t); o.stop(t + len + 0.05);
}

// Each tune returns how long it takes, in seconds: the caller speaks after it.
const tunes = {
  join(c, t) { // a cheerful little ding-dong: it happens often, so short
    bell(c, t, 79, 0.12); bell(c, t + 0.14, 84, 0.12);
    organ(c, t + 0.28, 72, 0.12, 0.09); organ(c, t + 0.4, 76, 0.12, 0.09); organ(c, t + 0.52, 79, 0.3, 0.09);
    return 0.9;
  },
  call(c, t) { // drum roll, a hit, two notes
    roll(c, t, 1.2); drum(c, t + 1.25, 0.8);
    organ(c, t + 1.3, 67, 0.15); organ(c, t + 1.45, 72, 0.5);
    return 1.5;
  },
  kickoff(c, t) {
    drum(c, t, 0.6); drum(c, t + 0.25, 0.6);
    [67, 72, 76].forEach((n, i) => organ(c, t + 0.5 + i * 0.12, n, 0.14));
    return 1.0;
  },
  goal(c, t) {
    drum(c, t); drum(c, t + 0.12); drum(c, t + 0.24, 0.7);
    [72, 76, 79, 84].forEach((n, i) => organ(c, t + 0.36 + i * 0.09, n, 0.12));
    return 0.9;
  },
  game(c, t) { // a short bit of the fair tune
    [67, 72, 76, 79, 84].forEach((n, i) => organ(c, t + i * 0.13, n, 0.12));
    for (let i = 0; i < 5; i++) bell(c, t + 0.7 + i * 0.05, 84 + i * 2);
    return 1.2;
  },
  crawl(c, t) {
    trombone(c, t, 58, 0.45); trombone(c, t + 0.5, 57, 0.45); trombone(c, t + 1.0, 56, 0.45); trombone(c, t + 1.5, 55, 1.1);
    return 2.7;
  },
  win(c, t) { // the whole fair tune: oompah bass, a bell run and a chord
    const b = 0.16;
    const tune = [67, 72, 76, 79, 76, 72, 74, 77, 81, 79, 77, 74, 76, 79, 84];
    tune.forEach((n, i) => organ(c, t + i * b, n, b * 0.95));
    [48, 55, 52, 55, 50, 55, 53, 55, 48, 55, 52, 55, 48].forEach((n, i) => organ(c, t + i * b * 1.15, n, b * 0.6, 0.08));
    const end = t + tune.length * b;
    for (let i = 0; i < 8; i++) bell(c, end + i * 0.05, 84 + i * 2);
    [72, 76, 79].forEach((n) => organ(c, end + 0.45, n, 0.7));
    return tune.length * b + 1.2;
  },
};

// ------------------------------------------------------------------ voice

const android = () => window.KAndroid?.speak ? window.KAndroid : null;

function speak(text) {
  if (android()) { android().speak(text); return; }
  if (!window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'nl-NL'; u.rate = 1.15; u.pitch = 1.35; // high and a little fast, like at the fair
  const v = speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith('nl'));
  if (v) u.voice = v;
  speechSynthesis.speak(u); // after whatever is still being said
}
window.speechSynthesis?.getVoices(); // the list fills in later; ask early

// A team as it is spoken: "Anna en Bram".
const said = (ids) => {
  const n = (ids || []).map((id) => P(id)?.name || '').filter(Boolean);
  return n.length > 1 ? n.slice(0, -1).join(', ') + ' en ' + n[n.length - 1] : n[0] || '';
};

// play: a tune and then words, unless a later announcement for the same
// match takes over before it starts (a won game that also ends the match).
let pending = null;
function play(tune, text, mid = '', wait = 0) {
  if (pending && mid && pending.mid === mid) clearTimeout(pending.timer);
  const go = () => {
    pending = null;
    const c = audioCtx();
    const len = c && tunes[tune] ? tunes[tune](c, c.currentTime + 0.05) : 0;
    if (text) setTimeout(() => speak(text), len * 1000);
  };
  if (wait) pending = { mid, timer: setTimeout(go, wait) };
  else go();
}

// ------------------------------------------------------------------ events

// say picks one of the lines for a moment, never the same one twice in a
// row: the barker should not sound like a tape.
const last = {};
function say(key, lines) {
  let i = Math.floor(Math.random() * lines.length);
  if (lines.length > 1 && i === last[key]) i = (i + 1) % lines.length;
  last[key] = i;
  return lines[i];
}
// The verb with the team: "Anna doet", "Anna en Bram doen".
const many = (ids) => (ids || []).length > 1;
const v = (ids, one, more) => (many(ids) ? more : one);

// announce says what a note from the server is about. m is its match,
// when there is one.
export function announce(n, m) {
  const teams = m?.teams || [[], []];
  const w = n.team === 1 ? 1 : 0;
  const A = said(teams[0]), B = said(teams[1]);
  switch (n.kind) {
    case 'join': {
      const who = said(n.pids);
      if (!who) return;
      // For later ("…, vanaf 14:30"), or for a tournament ("… doet mee aan …").
      const at = n.text?.match(/vanaf (\d{1,2}):(\d{2})/);
      const cup = n.text?.match(/doet mee aan (.+)$/);
      if (cup) {
        play('join', say('cup', [
          `${who} doet mee aan het toernooi ${cup[1]}!`,
          `Nog een deelnemer voor ${cup[1]}: ${who}!`,
          `Het toernooi ${cup[1]} krijgt er een kanshebber bij: ${who}!`,
          `Inschrijving binnen! ${who} gaat voor de beker in ${cup[1]}!`,
          `${who} waagt een gooi naar de titel in ${cup[1]}!`,
        ]));
      } else if (at) {
        const when = `${Number(at[1])} uur${at[2] === '00' ? '' : ' ' + Number(at[2])}`;
        play('join', say('later', [
          `${who} komt erbij om ${when}! Hou je klaar!`,
          `Noteer het maar: ${who} doet mee vanaf ${when}!`,
          `Om ${when} staat ${who} klaar. Wie durft?`,
          `Afspraak is afspraak: om ${when} komt ${who} spelen!`,
          `Zet je wekker maar: ${who}, om ${when}!`,
          `Nog even geduld, mensen! Om ${when} stapt ${who} in de ring!`,
          `${who} reserveert alvast een plekje, vanaf ${when}!`,
        ]));
      } else {
        play('join', say('join', [
          `Kom erbij, kom erbij! ${who} doet mee!`,
          `Daar is ${who}! Wie volgt?`,
          `${who} staat in de rij. Wie durft?`,
          `Een nieuwe uitdager: ${who}!`,
          `Hoor wie we daar hebben: ${who}!`,
          `Welkom, welkom! ${who} meldt zich aan de kassa!`,
          `${who} heeft een kaartje gekocht! Wie speelt er mee?`,
          `Applaus voor de nieuwe deelnemer: ${who}!`,
          `Nog plaats zat! ${who} staat al klaar!`,
          `${who} heeft er zin in! Wie neemt de handschoen op?`,
        ]));
      }
      return;
    }
    case 'due': { // the moment someone chose to join in has come
      const who = said(n.pids);
      if (who) play('join', say('due', [
        `Het is zover: ${who} doet nu mee!`,
        `${who} is er klaar voor! Wie neemt het op?`,
        `Tijd is om! ${who} staat in de rij!`,
        `Daar is ${who}, precies op tijd!`,
        `De klok heeft geslagen: ${who} speelt mee!`,
      ]));
      return;
    }
    case 'called':
      play('call', say('call', [
        `Dames en heren, aan de tafel: ${A} tegen ${B}!`,
        `Komt dat zien! Aan de tafel: ${A} tegen ${B}!`,
        `Opgelet! Nu aan de beurt: ${A} tegen ${B}!`,
        `Naar voren, naar voren! ${A} tegen ${B}!`,
        `Het moment is daar: ${A} tegen ${B}! Wie wint er een prijs?`,
        `Rollen maar! ${A} neemt het op tegen ${B}!`,
        `De tafel wacht op ${A} en ${B}! Kom op, kom op!`,
        `Pak je plek, ${A}! En ${B}: aan de andere kant!`,
      ]));
      return;
    case 'goal': {
      const sc = n.text?.match(/(\d+)\s*-\s*(\d+)/);
      const who = said(teams[w]);
      const score = sc ? ` ${sc[1]}, ${sc[2]}!` : '';
      play('goal', say('goal', [
        `Goal! ${who}!${score}`,
        `Raak! ${who}!${score}`,
        `Daar gaat ie! ${who} ${v(teams[w], 'scoort', 'scoren')}!${score}`,
        `Hij zit! ${who}!${score}`,
        `In het mandje! Punt voor ${who}!${score}`,
        `Wat een knal van ${who}!${score}`,
        `Tsjak! Daar ligt ie! ${who}!${score}`,
        `Prijs! ${who} ${v(teams[w], 'heeft', 'hebben')} weer raak geschoten!${score}`,
        `Onhoudbaar! ${who}!${score}`,
        `Kijk die bal gaan! ${who}!${score}`,
      ]));
      return;
    }
    case 'game': {
      // The deciding game comes with the end of the match: that one speaks then.
      const who = said(teams[w]);
      play('game', say('game', [
        `Spel voor ${who}!`,
        `${who} ${v(teams[w], 'pakt', 'pakken')} het spel!`,
        `En dat spel is voor ${who}!`,
        `Weer een spelletje binnen voor ${who}!`,
        `${who} ${v(teams[w], 'gaat', 'gaan')} met dit potje naar huis!`,
        `Potje gewonnen! Een rondje applaus voor ${who}!`,
        `Daar is het spel! ${who}!`,
      ]), n.mid, 1500);
      return;
    }
    case 'crawl': {
      const who = said(teams[1 - w]);
      const crawl = [
        `Oei oei oei! ${who}, onder de tafel door!`,
        `Nul goals? Dan weet je het: kruipen, ${who}!`,
        `Op de knieën, ${who}! Onder de tafel!`,
        `Dat wordt kruipen! ${who}, de vloer op!`,
        `Helemaal niks gescoord? Hup, ${who}, kruipen maar!`,
        `Pijnlijk, pijnlijk! ${who} ${v(teams[1 - w], 'moet', 'moeten')} onder de tafel door!`,
        `Iedereen kijken! ${who} ${v(teams[1 - w], 'gaat', 'gaan')} kruipen!`,
      ];
      play('crawl', say('crawl', crawl), n.mid, 1500);
      return;
    }
    case 'final': {
      const wins = m?.games ? m.games.reduce((a, g) => (a[g.w]++, a), [0, 0]) : null;
      const win = wins ? (wins[0] > wins[1] ? 0 : wins[1] > wins[0] ? 1 : -1) : -1;
      const crawled = m?.games?.[m.games.length - 1]?.crawl;
      const who = win < 0 ? '' : said(teams[win]);
      const text = win < 0
        ? say('draw', [
          'Gelijkspel! Iedereen een winnaar!',
          'Gelijk! Daar moet een revanche komen!',
          'Niemand de baas vandaag! Gelijkspel!',
          'Gelijk opgedeeld! Volgende keer beslissen, hè!',
        ])
        : say('final', [
          `Alweer een winnaar! ${who}!`,
          `En wéér een winnaar! Applaus voor ${who}!`,
          `Hebbes! Alweer een winnaar: ${who}!`,
          `Prijs, prijs, prijs! ${who} ${v(teams[win], 'gaat', 'gaan')} met de hoofdprijs naar huis!`,
          `Wie wint er hier? ${who}! Alweer een winnaar!`,
          `Kassa! De wedstrijd is voor ${who}!`,
          `De grote beer is voor ${who}! Alweer een winnaar!`,
          `Een daverend applaus voor de winnaar${many(teams[win]) ? 's' : ''}: ${who}!`,
          `Met vlag en wimpel! ${who} ${v(teams[win], 'wint', 'winnen')} de wedstrijd!`,
        ]);
      if (crawled) { // first the crawl of shame, then the winners
        const loser = said(teams[1 - win]);
        play('crawl', say('crawl', [`Oei oei oei! ${loser}, onder de tafel door!`, `Op de knieën, ${loser}! Onder de tafel!`, `Dat wordt kruipen! ${loser}, de vloer op!`]), n.mid);
        setTimeout(() => play('win', text), 6000);
      } else play('win', text, n.mid);
      return;
    }
    case 'champion': {
      const who = said(n.pids);
      setTimeout(() => play('win', say('champ', [
        `Dames en heren, de kampioen: ${who}!`,
        `Hij is binnen! De beker gaat naar ${who}!`,
        `Een staande ovatie voor de kampioen: ${who}!`,
        `Het toernooi is beslist! Proficiat, ${who}!`,
      ])), 9000); // after the final result
      return;
    }
    case 'info':
      if (n.text?.startsWith('🎬')) play('kickoff', say('kickoff', [
        `Aftrap! ${A} tegen ${B}!`,
        `Daar gaan we! ${A} tegen ${B}!`,
        `Het spel is begonnen! ${A} tegen ${B}!`,
        `Bal is in het spel! ${A} tegen ${B}!`,
        `De draaimolen draait! ${A} tegen ${B}!`,
        `Kaartjes zijn geknipt, de bal rolt! ${A} tegen ${B}!`,
        `Spelen maar! Veel plezier, ${A} en ${B}!`,
      ]));
      return;
  }
}

// test lets the settings page show what it sounds like.
export function test() {
  const me = S.cfg.me ? [S.cfg.me] : [];
  const name = said(me) || 'Kermis Klaas';
  play('win', `Alweer een winnaar! ${name}!`);
}
