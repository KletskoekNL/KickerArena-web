// Everything derived from the match history: per-player stats, records, badges.
// A game only records who won (g.w: 0 = Zwart, 1 = Wit) and whether the
// losers had to crawl (g.crawl).

// What a player did on one day (for the badges about a single day).
const dayOf = (s, dk) => (s.dayRes[dk] ??= { m: 0, w: 0, gave: false, crawled: false, modes: {} });

const blank = (id) => ({
  id, games: 0, wins: 0, matches: 0, mw: 0, md: 0, ml: 0,
  bestStreak: 0, crawled: 0, crawlsGiven: 0, sweeps: 0,
  color: [{ g: 0, w: 0 }, { g: 0, w: 0 }],
  partners: {}, opps: {}, days: {},
  // 1v1 and 2v2 are separate competitions: each has its own streak and form.
  // bestStreak (badges, Hall of Fame) is the longest one in either of them.
  // alt counts the games in a row that went the other way than the one before.
  byMode: { '1v1': { g: 0, w: 0, m: 0, mw: 0, md: 0, ml: 0, streak: 0, best: 0, alt: 0, form: [] }, '2v2': { g: 0, w: 0, m: 0, mw: 0, md: 0, ml: 0, streak: 0, best: 0, alt: 0, form: [] } },
  series: { '1v1': [], '2v2': [] },
  rating: { '1v1': 1000, '2v2': 1000 }, peak: { '1v1': 1000, '2v2': 1000 },
  giant: false, giants: 0, last: 0,
  comebacks: 0, deciders: 0, early: 0, late: 0, lunch: 0, friday: 0, monday: 0, dayRes: {},
  // since 1.8.0: the less glorious side of the game
  worstStreak: 0, broken: 0, coin: false, nearly: 0, naps: 0, zigzag: 0, delays: 0,
  // since 1.10.0: ever at the top or the bottom of a ranking (badges stay)
  top: { '1v1': false, '2v2': false }, bottom: { '1v1': false, '2v2': false },
});

/** Games in a mode after which a player is no longer new on its ranking. */
export const SETTLED = 10;

const pad = (n) => String(n).padStart(2, '0');
const day = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The week (from its Monday), month and year a moment falls in, in local time. */
export function periodsOf(t) {
  return periodsAt(new Date(t));
}

function periodsAt(d) {
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return { week: day(mon), month: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, year: String(d.getFullYear()) };
}

// The trophies of one period: most games won (the better win rate decides a
// tie), most rating gained and most rating lost, 1v1 and 2v2 together.
// Everyone who shares the best value shares the trophy.
function trophiesOf(bucket) {
  const top = (f) => {
    let v = 0, ids = [];
    for (const [id, x] of Object.entries(bucket)) {
      const y = f(x);
      if (y > v + 1e-9) { v = y; ids = [id]; } else if (ids.length && Math.abs(y - v) <= 1e-9) ids.push(id);
    }
    return ids.length ? { ids, x: bucket[ids[0]] } : null;
  };
  return {
    best: top((x) => (x.w ? x.w + (0.999 * x.w) / x.g : 0)),
    up: top((x) => (x.d >= 0.5 ? x.d : 0)),
    down: top((x) => (x.d <= -0.5 ? -x.d : 0)),
  };
}

export function matchWins(m) {
  const w = [0, 0];
  for (const g of m.games) w[g.w]++;
  return w;
}

export function computeStats(history, players) {
  const P = {};
  for (const p of players) P[p.id] = blank(p.id);
  const get = (id) => (P[id] ??= blank(id));
  const rec = { busiestDay: null, upset: null, colorWins: [0, 0], totals: { matches: history.length, games: 0, crawls: 0 } };
  const pairs = {};
  const days = {};
  const per = { week: {}, month: {}, year: {} };
  // Who may stand at the top or the bottom of a ranking: no longer new there.
  const settled = { '1v1': [], '2v2': [] };

  for (const m of history) {
    const mode = m.mode;
    // The moment and its day and periods, once per match (dates are slow).
    const at = new Date(m.finished);
    const dk = at.toDateString();
    days[dk] = (days[dk] || 0) + 1;
    const pk = periodsAt(at);
    const played = m.games.length > 0;
    const pw = played && (per.week[pk.week] ??= {}), pm = played && (per.month[pk.month] ??= {}), py = played && (per.year[pk.year] ??= {});
    // A duo is known by its two ids, sorted.
    const duo = played && mode === '2v2' && m.teams.map((t) => {
      const ids = [...t].sort();
      return (pairs[ids.join('+')] ??= { ids, g: 0, w: 0 });
    });
    for (const g of m.games) {
      const w = g.w;
      rec.totals.games++;
      rec.colorWins[w]++;
      if (g.crawl) rec.totals.crawls++;
      for (let t = 0; t < 2; t++) {
        const win = t === w;
        for (const id of m.teams[t]) {
          const s = get(id);
          s.games++; s.wins += win;
          const bm = s.byMode[mode];
          bm.g++; bm.w += win;
          s.color[t].g++; s.color[t].w += win;
          if (win && bm.streak <= -5) s.broken++; // a long losing run ends here
          bm.alt = bm.streak !== 0 && win !== bm.streak > 0 ? bm.alt + 1 : 0; // won after a loss, or lost after a win
          s.zigzag = Math.max(s.zigzag, bm.alt);
          bm.streak = win ? Math.max(bm.streak, 0) + 1 : Math.min(bm.streak, 0) - 1;
          bm.best = Math.max(bm.best, bm.streak);
          s.bestStreak = Math.max(s.bestStreak, bm.best);
          s.worstStreak = Math.min(s.worstStreak, bm.streak);
          if (s.games >= 20 && s.wins * 2 === s.games) s.coin = true;
          bm.form.push(win ? 'w' : 'l');
          if (g.crawl) {
            win ? s.crawlsGiven++ : s.crawled++;
            dayOf(s, dk)[win ? 'gave' : 'crawled'] = true;
          }
          for (const o of m.teams[1 - t]) {
            const x = (s.opps[o] ??= { g: 0, w: 0 });
            x.g++; x.w += win;
          }
          if (mode === '2v2') {
            const mate = m.teams[t].find((x) => x !== id);
            if (mate) { const x = (s.partners[mate] ??= { g: 0, w: 0 }); x.g++; x.w += win; }
          }
          if (g.delta && g.delta[id] != null) s.rating[mode] += g.delta[id];
        }
        if (duo) { duo[t].g++; duo[t].w += win; }
      }
    }
    const mw = matchWins(m);
    const h = at.getHours() + at.getMinutes() / 60, wd = at.getDay();
    for (let t = 0; t < 2; t++) {
      const res = mw[t] > mw[1 - t] ? 'w' : mw[t] < mw[1 - t] ? 'l' : 'd';
      const p = t === 0 ? m.winProb : 1 - m.winProb;
      if (res === 'w' && (!rec.upset || p < rec.upset.p)) rec.upset = { p, m, team: t };
      for (const id of m.teams[t]) {
        const s = get(id);
        // the week, month and year of this match: once per player
        if (played) for (const x of [pw[id] ??= { g: 0, w: 0, d: 0 }, pm[id] ??= { g: 0, w: 0, d: 0 }, py[id] ??= { g: 0, w: 0, d: 0 }]) {
          x.g += m.games.length; x.w += mw[t];
          for (const g of m.games) x.d += g.delta?.[id] || 0;
        }
        const bm = s.byMode[mode], key = res === 'w' ? 'mw' : res === 'l' ? 'ml' : 'md';
        s.matches++; bm.m++;
        s[key]++; bm[key]++;
        if (bm.g >= SETTLED && !settled[mode].includes(s)) settled[mode].push(s);
        if (res === 'w' && mw[1 - t] === 0 && m.games.length > 1) s.sweeps++;
        if (res === 'w' && p < 0.3) { s.giant = true; s.giants++; }
        if (res === 'w' && m.games[0] && m.games[0].w !== t) s.comebacks++;
        if (m.delayed?.includes(id)) s.delays++; // asked for a few minutes, and played
        if (res !== 'd' && m.games.length >= 3) { // decided in the last game, from a level score
          const before = matchWins({ games: m.games.slice(0, -1) });
          if (before[0] === before[1]) res === 'w' ? s.deciders++ : s.nearly++;
        }
        if (h < 9) s.early++;
        if (h >= 18) s.late++;
        if (h >= 12 && h < 13.5) s.lunch++;
        if (wd === 5 && h >= 15) s.friday++;
        if (wd === 1 && h < 10) s.monday++;
        const dr = dayOf(s, dk);
        dr.m++; dr.w += res === 'w';
        dr.modes[mode] = true;
        if (s.last && m.finished - s.last >= 30 * 86400000) s.naps++; // back after a month
        s.days[dk] = (s.days[dk] || 0) + 1;
        s.peak[mode] = Math.max(s.peak[mode], s.rating[mode]);
        s.series[mode].push({ t: m.finished, r: s.rating[mode], mid: m.id });
        s.last = m.finished;
      }
    }
    // Who stands at the top or the bottom of this ranking now keeps that
    // badge. Only players who are no longer new count (else the first match
    // already crowns its winners), and at least four of them.
    const list = settled[mode];
    if (list.length >= 4) {
      let hi = -Infinity, lo = Infinity;
      for (const x of list) { hi = Math.max(hi, x.rating[mode]); lo = Math.min(lo, x.rating[mode]); }
      for (const x of list) {
        if (x.rating[mode] === hi) x.top[mode] = true;
        if (lo < hi && x.rating[mode] === lo) x.bottom[mode] = true;
      }
    }
  }
  const dayList = Object.entries(days).sort((a, b) => b[1] - a[1]);
  if (dayList.length) rec.busiestDay = { day: dayList[0][0], n: dayList[0][1] };
  const duos = Object.values(pairs).filter((x) => x.g >= 3).sort((a, b) => b.w / b.g - a.w / a.g || b.g - a.g);
  // per period, oldest first: { key, best, up, down }
  const trophies = {};
  for (const k of ['week', 'month', 'year']) trophies[k] = Object.keys(per[k]).sort().map((key) => ({ key, ...trophiesOf(per[k][key]) }));
  return { P, rec, duos, trophies };
}

const maxDay = (s) => Math.max(0, ...Object.values(s.days));

export const BADGES = [
  { id: 'debut', ic: '🐣', name: 'Debutant', desc: 'Eerste spel gespeeld', val: (s) => s.games, goal: 1 },
  { id: 'ten', ic: '🎟️', name: 'Vaste klant', desc: '10 wedstrijden gespeeld (hele wedstrijden, niet losse spellen)', val: (s) => s.matches, goal: 10 },
  { id: 'cent', ic: '💯', name: 'Centurion', desc: '100 spellen gespeeld (losse spellen, niet hele wedstrijden)', val: (s) => s.games, goal: 100 },
  { id: 'hat', ic: '🎩', name: 'Hattrick', desc: '3 spellen op rij gewonnen', val: (s) => s.bestStreak, goal: 3 },
  { id: 'fire', ic: '🔥', name: 'On Fire', desc: '5 spellen op rij gewonnen', val: (s) => s.bestStreak, goal: 5 },
  { id: 'train', ic: '🚂', name: 'Onstuitbaar', desc: '10 spellen op rij gewonnen', val: (s) => s.bestStreak, goal: 10 },
  { id: 'sweep', ic: '🧽', name: 'Stofzuiger', desc: '10 wedstrijden zonder spelverlies gewonnen', val: (s) => s.sweeps, goal: 10 },
  { id: 'broom', ic: '🧹', name: 'Bezemwagen', desc: 'Iemand onder de tafel laten kruipen', val: (s) => s.crawlsGiven, goal: 1 },
  { id: 'snail', ic: '🐌', name: 'Kruiper', desc: 'Zelf onder de tafel gekropen', val: (s) => s.crawled, goal: 1 },
  { id: 'giant', ic: '🗡️', name: 'Reuzendoder', desc: 'Gewonnen met minder dan 30% winkans', test: (s) => s.giant },
  { id: 'allround', ic: '☯️', name: 'Allrounder', desc: '10 spellen gewonnen als Zwart én als Wit', val: (s) => Math.min(s.color[0].w, s.color[1].w), goal: 10 },
  { id: 'marathon', ic: '🏃', name: 'Marathon', desc: '5 wedstrijden op één dag', val: (s) => maxDay(s), goal: 5 },
  { id: 'social', ic: '🤝', name: 'Teamspeler', desc: 'Met 5 verschillende partners gespeeld', val: (s) => Object.keys(s.partners).length, goal: 5 },
  { id: 'duel', ic: '🥊', name: 'Duellist', desc: '10 spellen 1 tegen 1 gewonnen', val: (s) => s.byMode['1v1'].w, goal: 10 },
  { id: 'king', ic: '👑', name: 'Koning van de tafel', desc: 'Nummer 1 geweest op de 2v2-ranglijst, toen je niet meer nieuw was', test: (s, c) => s.top['2v2'] || c.king.has(s.id) },
  { id: 'champ', ic: '🏅', name: 'Toernooikampioen', desc: 'Een toernooi gewonnen', test: (s, c) => !!c.champs?.has(s.id) },
  // since 1.5.0
  { id: 'firstwin', ic: '🎉', name: 'Eerste zege', desc: 'Je eerste wedstrijd gewonnen', val: (s) => s.mw, goal: 1 },
  { id: 'w10', ic: '✅', name: 'Winnaar', desc: '10 spellen gewonnen', val: (s) => s.wins, goal: 10 },
  { id: 'w50', ic: '⭐', name: 'Sterspeler', desc: '50 spellen gewonnen', val: (s) => s.wins, goal: 50 },
  { id: 'w100', ic: '🌟', name: 'Superster', desc: '100 spellen gewonnen', val: (s) => s.wins, goal: 100 },
  { id: 'g50', ic: '🎯', name: 'Halve centurion', desc: '50 spellen gespeeld (losse spellen, niet hele wedstrijden)', val: (s) => s.games, goal: 50 },
  { id: 'g250', ic: '🛋️', name: 'Tafelmeubel', desc: '250 spellen gespeeld (losse spellen, niet hele wedstrijden)', val: (s) => s.games, goal: 250 },
  { id: 'g500', ic: '🗿', name: 'Monument', desc: '500 spellen gespeeld (losse spellen, niet hele wedstrijden)', val: (s) => s.games, goal: 500 },
  { id: 'm50', ic: '📅', name: 'Stamgast', desc: '50 wedstrijden gespeeld (hele wedstrijden, niet losse spellen)', val: (s) => s.matches, goal: 50 },
  { id: 'm100', ic: '🧱', name: 'Inventaris', desc: '100 wedstrijden gespeeld (hele wedstrijden, niet losse spellen)', val: (s) => s.matches, goal: 100 },
  { id: 'rocket', ic: '🚀', name: 'Raket', desc: '15 spellen op rij gewonnen', val: (s) => s.bestStreak, goal: 15 },
  { id: 'clean', ic: '🧼', name: 'Schoon gewonnen', desc: 'Een wedstrijd gewonnen zonder één spel te verliezen', val: (s) => s.sweeps, goal: 1 },
  { id: 'storm', ic: '🌪️', name: 'Wervelwind', desc: '25 wedstrijden zonder spelverlies gewonnen', val: (s) => s.sweeps, goal: 25 },
  { id: 'tunnel', ic: '🚇', name: 'Tunnelbouwer', desc: '5 keer iemand onder de tafel laten kruipen', val: (s) => s.crawlsGiven, goal: 5 },
  { id: 'mole', ic: '🕳️', name: 'Mollenvanger', desc: '20 keer iemand onder de tafel laten kruipen', val: (s) => s.crawlsGiven, goal: 20 },
  { id: 'caveman', ic: '🪨', name: 'Holbewoner', desc: '5 keer zelf onder de tafel gekropen', val: (s) => s.crawled, goal: 5 },
  { id: 'david', ic: '🏹', name: 'David', desc: '3 keer gewonnen met minder dan 30% winkans', val: (s) => s.giants, goal: 3 },
  { id: 'comeback', ic: '🔄', name: 'Comeback', desc: 'Een wedstrijd gewonnen na verlies van het eerste spel', val: (s) => s.comebacks, goal: 1 },
  { id: 'tough', ic: '💪', name: 'Taaie', desc: '5 comebacks', val: (s) => s.comebacks, goal: 5 },
  { id: 'ice', ic: '🧊', name: 'IJskoud', desc: 'Het beslissende spel gewonnen bij een gelijke stand', val: (s) => s.deciders, goal: 1 },
  { id: 'early', ic: '🌅', name: 'Vroege vogel', desc: 'Een wedstrijd gespeeld vóór 9:00', val: (s) => s.early, goal: 1 },
  { id: 'owl', ic: '🦉', name: 'Nachtuil', desc: 'Een wedstrijd gespeeld na 18:00', val: (s) => s.late, goal: 1 },
  { id: 'lunch', ic: '🥪', name: 'Lunchpauze', desc: '10 wedstrijden tussen 12:00 en 13:30', val: (s) => s.lunch, goal: 10 },
  { id: 'friday', ic: '🍻', name: 'Vrijdagmiddag', desc: 'Een wedstrijd op vrijdag na 15:00', val: (s) => s.friday, goal: 1 },
  { id: 'monday', ic: '☕', name: 'Maandagstarter', desc: 'Een wedstrijd op maandag vóór 10:00', val: (s) => s.monday, goal: 1 },
  { id: 'days10', ic: '🗓️', name: 'Trouwe bezoeker', desc: 'Op 10 verschillende dagen gespeeld', val: (s) => Object.keys(s.days).length, goal: 10 },
  { id: 'days50', ic: '🏠', name: 'Tweede thuis', desc: 'Op 50 verschillende dagen gespeeld', val: (s) => Object.keys(s.days).length, goal: 50 },
  { id: 'ultra', ic: '🦵', name: 'Ultraloper', desc: '10 wedstrijden op één dag', val: (s) => maxDay(s), goal: 10 },
  { id: 'perfect', ic: '✨', name: 'Perfecte dag', desc: 'Minstens 3 wedstrijden op een dag, allemaal gewonnen', test: (s) => Object.values(s.dayRes).some((d) => d.m >= 3 && d.w === d.m) },
  { id: 'travel', ic: '🌍', name: 'Wereldreiziger', desc: 'Tegen 10 verschillende spelers gespeeld', val: (s) => Object.keys(s.opps).length, goal: 10 },
  { id: 'network', ic: '🎭', name: 'Netwerker', desc: 'Met 10 verschillende partners gespeeld', val: (s) => Object.keys(s.partners).length, goal: 10 },
  { id: 'loyal', ic: '💍', name: 'Trouw duo', desc: '25 spellen met dezelfde partner', val: (s) => Math.max(0, ...Object.values(s.partners).map((x) => x.g)), goal: 25 },
  { id: 'r1100', ic: '📈', name: 'Klimmer', desc: 'Een rating van 1100 gehaald', val: (s) => Math.max(s.peak['1v1'], s.peak['2v2']), goal: 1100 },
  { id: 'dark', ic: '⚫', name: 'Duistere kant', desc: '25 spellen gewonnen als Zwart', val: (s) => s.color[0].w, goal: 25 },
  { id: 'white', ic: '⚪', name: 'Witte ridder', desc: '25 spellen gewonnen als Wit', val: (s) => s.color[1].w, goal: 25 },
  // since 1.8.0: for those who do not always win, and a few for fun
  { id: 'pech', ic: '🍀', name: 'Pechvogel', desc: '5 spellen op rij verloren', val: (s) => -s.worstStreak, goal: 5 },
  { id: 'atlast', ic: '🥳', name: 'Eindelijk!', desc: 'Een reeks van 5 verloren spellen doorbroken met een zege', val: (s) => s.broken, goal: 1 },
  { id: 'lantern', ic: '💎', name: 'Bodemschat', desc: 'Onderaan geweest op de 2v2-ranglijst, toen je niet meer nieuw was: daar liggen de pareltjes', test: (s, c) => s.bottom['2v2'] || c.lantern.has(s.id) },
  { id: 'grit', ic: '🧗', name: 'Doorzetter', desc: '25 spellen verloren, en nog steeds van de partij', val: (s) => s.games - s.wins, goal: 25 },
  { id: 'spar', ic: '🥋', name: 'Sparringpartner', desc: '100 spellen verloren: iemand moet het doen', val: (s) => s.games - s.wins, goal: 100 },
  { id: 'nearly', ic: '🥈', name: 'Net niet', desc: '3 wedstrijden verloren in het beslissende spel', val: (s) => s.nearly, goal: 3 },
  { id: 'carpet', ic: '🧶', name: 'Tapijtkenner', desc: '10 keer zelf onder de tafel gekropen', val: (s) => s.crawled, goal: 10 },
  { id: 'bogey', ic: '🧟', name: 'Boeman', desc: '10 spellen verloren van dezelfde tegenstander', val: (s) => Math.max(0, ...Object.values(s.opps).map((x) => x.g - x.w)), goal: 10 },
  { id: 'fav', ic: '🍬', name: 'Lievelingsprooi', desc: '10 spellen gewonnen van dezelfde tegenstander', val: (s) => Math.max(0, ...Object.values(s.opps).map((x) => x.w)), goal: 10 },
  { id: 'polder', ic: '🌷', name: 'Polderaar', desc: '10 wedstrijden gelijkgespeeld', val: (s) => s.md, goal: 10 },
  { id: 'coin', ic: '⚖️', name: 'Muntje', desc: 'Precies de helft gewonnen na minstens 20 spellen', test: (s) => s.coin },
  { id: 'twoface', ic: '🃏', name: 'Twee gezichten', desc: 'Op één dag iemand laten kruipen én zelf gekropen', test: (s) => Object.values(s.dayRes).some((d) => d.gave && d.crawled) },
  { id: 'chameleon', ic: '🦎', name: 'Kameleon', desc: 'Op één dag 1 tegen 1 én 2 tegen 2 gespeeld', test: (s) => Object.values(s.dayRes).some((d) => d.modes['1v1'] && d.modes['2v2']) },
  { id: 'nap', ic: '💤', name: 'Winterslaap', desc: 'Weer gespeeld na 30 dagen stilte', val: (s) => s.naps, goal: 1 },
  { id: 'zigzag', ic: '🎢', name: 'Achtbaan', desc: '8 spellen lang om en om gewonnen en verloren', val: (s) => (s.games ? s.zigzag + 1 : 0), goal: 8 },
  { id: 'moment', ic: '⏰', name: 'Momentje!', desc: '3 keer uitstel gevraagd en toch gespeeld', val: (s) => s.delays, goal: 3 },
  // since 1.10.0: the 1v1 side of the ranking badges
  { id: 'duelking', ic: '🤺', name: 'Duelkoning', desc: 'Nummer 1 geweest op de 1v1-ranglijst, toen je niet meer nieuw was', test: (s, c) => s.top['1v1'] || c.duelking.has(s.id) },
  { id: 'diver', ic: '🐚', name: 'Parelduiker', desc: 'Onderaan geweest op de 1v1-ranglijst, toen je niet meer nieuw was', test: (s, c) => s.bottom['1v1'] || c.diver.has(s.id) },
];
// A badge with a goal is reached once its value gets there; the value also
// shows how far someone is.
for (const b of BADGES) b.test ??= (s) => b.val(s) >= b.goal;

export function ranking(players, P, mode) {
  return players
    .filter((p) => !p.retired && P[p.id]?.byMode[mode].g > 0)
    .map((p) => ({ p, s: P[p.id], r: mode === '1v1' ? p.solo : p.duo }))
    .sort((a, b) => b.r - a.r);
}
