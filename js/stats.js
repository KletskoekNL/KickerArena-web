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
  byMode: { '1v1': { g: 0, w: 0, m: 0, streak: 0, best: 0, alt: 0, form: [] }, '2v2': { g: 0, w: 0, m: 0, streak: 0, best: 0, alt: 0, form: [] } },
  series: { '1v1': [], '2v2': [] },
  rating: { '1v1': 1000, '2v2': 1000 }, peak: { '1v1': 1000, '2v2': 1000 },
  giant: false, giants: 0, last: 0,
  comebacks: 0, deciders: 0, early: 0, late: 0, lunch: 0, friday: 0, monday: 0, dayRes: {},
  // since 1.8.0: the less glorious side of the game
  worstStreak: 0, broken: 0, coin: false, nearly: 0, naps: 0, zigzag: 0, delays: 0,
});

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

  for (const m of history) {
    const mode = m.mode;
    const dk = new Date(m.finished).toDateString();
    days[dk] = (days[dk] || 0) + 1;
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
        if (mode === '2v2') {
          const k = [...m.teams[t]].sort().join('+');
          const x = (pairs[k] ??= { ids: [...m.teams[t]].sort(), g: 0, w: 0 });
          x.g++; x.w += win;
        }
      }
    }
    const mw = matchWins(m);
    for (let t = 0; t < 2; t++) {
      const res = mw[t] > mw[1 - t] ? 'w' : mw[t] < mw[1 - t] ? 'l' : 'd';
      const p = t === 0 ? m.winProb : 1 - m.winProb;
      if (res === 'w' && (!rec.upset || p < rec.upset.p)) rec.upset = { p, m, team: t };
      for (const id of m.teams[t]) {
        const s = get(id);
        s.matches++; s.byMode[mode].m++;
        s['m' + res]++;
        if (res === 'w' && mw[1 - t] === 0 && m.games.length > 1) s.sweeps++;
        if (res === 'w' && p < 0.3) { s.giant = true; s.giants++; }
        if (res === 'w' && m.games[0] && m.games[0].w !== t) s.comebacks++;
        if (m.delayed?.includes(id)) s.delays++; // asked for a few minutes, and played
        if (res !== 'd' && m.games.length >= 3) { // decided in the last game, from a level score
          const before = matchWins({ games: m.games.slice(0, -1) });
          if (before[0] === before[1]) res === 'w' ? s.deciders++ : s.nearly++;
        }
        const at = new Date(m.finished), h = at.getHours() + at.getMinutes() / 60, wd = at.getDay();
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
  }
  const dayList = Object.entries(days).sort((a, b) => b[1] - a[1]);
  if (dayList.length) rec.busiestDay = { day: dayList[0][0], n: dayList[0][1] };
  const duos = Object.values(pairs).filter((x) => x.g >= 3).sort((a, b) => b.w / b.g - a.w / a.g || b.g - a.g);
  return { P, rec, duos };
}

const maxDay = (s) => Math.max(0, ...Object.values(s.days));

export const BADGES = [
  { id: 'debut', ic: '🐣', name: 'Debutant', desc: 'Eerste spel gespeeld', test: (s) => s.games >= 1 },
  { id: 'ten', ic: '🎟️', name: 'Vaste klant', desc: '10 wedstrijden gespeeld', test: (s) => s.matches >= 10 },
  { id: 'cent', ic: '💯', name: 'Centurion', desc: '100 spellen gespeeld', test: (s) => s.games >= 100 },
  { id: 'hat', ic: '🎩', name: 'Hattrick', desc: '3 spellen op rij gewonnen', test: (s) => s.bestStreak >= 3 },
  { id: 'fire', ic: '🔥', name: 'On Fire', desc: '5 spellen op rij gewonnen', test: (s) => s.bestStreak >= 5 },
  { id: 'train', ic: '🚂', name: 'Onstuitbaar', desc: '10 spellen op rij gewonnen', test: (s) => s.bestStreak >= 10 },
  { id: 'sweep', ic: '🧽', name: 'Bezemklant', desc: '10 wedstrijden zonder spelverlies gewonnen', test: (s) => s.sweeps >= 10 },
  { id: 'broom', ic: '🧹', name: 'Bezemwagen', desc: 'Iemand onder de tafel laten kruipen', test: (s) => s.crawlsGiven >= 1 },
  { id: 'snail', ic: '🐌', name: 'Kruiper', desc: 'Zelf onder de tafel gekropen', test: (s) => s.crawled >= 1 },
  { id: 'giant', ic: '🗡️', name: 'Reuzendoder', desc: 'Gewonnen met minder dan 30% winkans', test: (s) => s.giant },
  { id: 'allround', ic: '☯️', name: 'Allrounder', desc: '10 spellen gewonnen als Zwart én als Wit', test: (s) => s.color[0].w >= 10 && s.color[1].w >= 10 },
  { id: 'marathon', ic: '🏃', name: 'Marathon', desc: '5 wedstrijden op één dag', test: (s) => maxDay(s) >= 5 },
  { id: 'social', ic: '🤝', name: 'Teamspeler', desc: 'Met 5 verschillende partners gespeeld', test: (s) => Object.keys(s.partners).length >= 5 },
  { id: 'duel', ic: '🥊', name: 'Duellist', desc: '10 spellen 1 tegen 1 gewonnen', test: (s) => s.byMode['1v1'].w >= 10 },
  { id: 'king', ic: '👑', name: 'Koning van de tafel', desc: 'Nummer 1 op de 2v2-ranglijst', test: (s, c) => c.king === s.id },
  { id: 'champ', ic: '🏅', name: 'Toernooikampioen', desc: 'Een toernooi gewonnen', test: (s, c) => !!c.champs?.has(s.id) },
  // since 1.5.0
  { id: 'firstwin', ic: '🎉', name: 'Eerste zege', desc: 'Je eerste wedstrijd gewonnen', test: (s) => s.mw >= 1 },
  { id: 'w10', ic: '✅', name: 'Winnaar', desc: '10 spellen gewonnen', test: (s) => s.wins >= 10 },
  { id: 'w50', ic: '⭐', name: 'Sterspeler', desc: '50 spellen gewonnen', test: (s) => s.wins >= 50 },
  { id: 'w100', ic: '🌟', name: 'Superster', desc: '100 spellen gewonnen', test: (s) => s.wins >= 100 },
  { id: 'g50', ic: '🎯', name: 'Halve centurion', desc: '50 spellen gespeeld', test: (s) => s.games >= 50 },
  { id: 'g250', ic: '🛋️', name: 'Tafelmeubel', desc: '250 spellen gespeeld', test: (s) => s.games >= 250 },
  { id: 'g500', ic: '🗿', name: 'Monument', desc: '500 spellen gespeeld', test: (s) => s.games >= 500 },
  { id: 'm50', ic: '📅', name: 'Stamgast', desc: '50 wedstrijden gespeeld', test: (s) => s.matches >= 50 },
  { id: 'm100', ic: '🧱', name: 'Inventaris', desc: '100 wedstrijden gespeeld', test: (s) => s.matches >= 100 },
  { id: 'rocket', ic: '🚀', name: 'Raket', desc: '15 spellen op rij gewonnen', test: (s) => s.bestStreak >= 15 },
  { id: 'clean', ic: '🧼', name: 'Schoon gewonnen', desc: 'Een wedstrijd gewonnen zonder één spel te verliezen', test: (s) => s.sweeps >= 1 },
  { id: 'storm', ic: '🌪️', name: 'Wervelwind', desc: '25 wedstrijden zonder spelverlies gewonnen', test: (s) => s.sweeps >= 25 },
  { id: 'tunnel', ic: '🚇', name: 'Tunnelbouwer', desc: '5 keer iemand onder de tafel laten kruipen', test: (s) => s.crawlsGiven >= 5 },
  { id: 'mole', ic: '🕳️', name: 'Mollenvanger', desc: '20 keer iemand onder de tafel laten kruipen', test: (s) => s.crawlsGiven >= 20 },
  { id: 'caveman', ic: '🪨', name: 'Holbewoner', desc: '5 keer zelf onder de tafel gekropen', test: (s) => s.crawled >= 5 },
  { id: 'david', ic: '🏹', name: 'David', desc: '3 keer gewonnen met minder dan 30% winkans', test: (s) => s.giants >= 3 },
  { id: 'comeback', ic: '🔄', name: 'Comeback', desc: 'Een wedstrijd gewonnen na verlies van het eerste spel', test: (s) => s.comebacks >= 1 },
  { id: 'tough', ic: '💪', name: 'Taaie', desc: '5 comebacks', test: (s) => s.comebacks >= 5 },
  { id: 'ice', ic: '🧊', name: 'IJskoud', desc: 'Het beslissende spel gewonnen bij een gelijke stand', test: (s) => s.deciders >= 1 },
  { id: 'early', ic: '🌅', name: 'Vroege vogel', desc: 'Een wedstrijd gespeeld vóór 9:00', test: (s) => s.early >= 1 },
  { id: 'owl', ic: '🦉', name: 'Nachtuil', desc: 'Een wedstrijd gespeeld na 18:00', test: (s) => s.late >= 1 },
  { id: 'lunch', ic: '🥪', name: 'Lunchpauze', desc: '10 wedstrijden tussen 12:00 en 13:30', test: (s) => s.lunch >= 10 },
  { id: 'friday', ic: '🍻', name: 'Vrijdagmiddag', desc: 'Een wedstrijd op vrijdag na 15:00', test: (s) => s.friday >= 1 },
  { id: 'monday', ic: '☕', name: 'Maandagstarter', desc: 'Een wedstrijd op maandag vóór 10:00', test: (s) => s.monday >= 1 },
  { id: 'days10', ic: '🗓️', name: 'Trouwe bezoeker', desc: 'Op 10 verschillende dagen gespeeld', test: (s) => Object.keys(s.days).length >= 10 },
  { id: 'days50', ic: '🏠', name: 'Tweede thuis', desc: 'Op 50 verschillende dagen gespeeld', test: (s) => Object.keys(s.days).length >= 50 },
  { id: 'ultra', ic: '🦵', name: 'Ultraloper', desc: '10 wedstrijden op één dag', test: (s) => maxDay(s) >= 10 },
  { id: 'perfect', ic: '✨', name: 'Perfecte dag', desc: 'Minstens 3 wedstrijden op een dag, allemaal gewonnen', test: (s) => Object.values(s.dayRes).some((d) => d.m >= 3 && d.w === d.m) },
  { id: 'travel', ic: '🌍', name: 'Wereldreiziger', desc: 'Tegen 10 verschillende spelers gespeeld', test: (s) => Object.keys(s.opps).length >= 10 },
  { id: 'network', ic: '🎭', name: 'Netwerker', desc: 'Met 10 verschillende partners gespeeld', test: (s) => Object.keys(s.partners).length >= 10 },
  { id: 'loyal', ic: '💍', name: 'Trouw duo', desc: '25 spellen met dezelfde partner', test: (s) => Object.values(s.partners).some((x) => x.g >= 25) },
  { id: 'r1100', ic: '📈', name: 'Klimmer', desc: 'Een rating van 1100 gehaald', test: (s) => Math.max(s.peak['1v1'], s.peak['2v2']) >= 1100 },
  { id: 'dark', ic: '⚫', name: 'Duistere kant', desc: '25 spellen gewonnen als Zwart', test: (s) => s.color[0].w >= 25 },
  { id: 'white', ic: '⚪', name: 'Witte ridder', desc: '25 spellen gewonnen als Wit', test: (s) => s.color[1].w >= 25 },
  // since 1.8.0: for those who do not always win, and a few for fun
  { id: 'pech', ic: '🍀', name: 'Pechvogel', desc: '5 spellen op rij verloren', test: (s) => s.worstStreak <= -5 },
  { id: 'atlast', ic: '🥳', name: 'Eindelijk!', desc: 'Een reeks van 5 verloren spellen doorbroken met een zege', test: (s) => s.broken >= 1 },
  { id: 'lantern', ic: '💎', name: 'Bodemschat', desc: 'Onderaan de 2v2-ranglijst: daar liggen de pareltjes', test: (s, c) => !!c.lantern && c.lantern === s.id },
  { id: 'grit', ic: '🧗', name: 'Doorzetter', desc: '25 spellen verloren, en nog steeds van de partij', test: (s) => s.games - s.wins >= 25 },
  { id: 'spar', ic: '🥋', name: 'Sparringpartner', desc: '100 spellen verloren: iemand moet het doen', test: (s) => s.games - s.wins >= 100 },
  { id: 'nearly', ic: '🥈', name: 'Net niet', desc: '3 wedstrijden verloren in het beslissende spel', test: (s) => s.nearly >= 3 },
  { id: 'carpet', ic: '🧶', name: 'Tapijtkenner', desc: '10 keer zelf onder de tafel gekropen', test: (s) => s.crawled >= 10 },
  { id: 'bogey', ic: '🧟', name: 'Boeman', desc: '10 spellen verloren van dezelfde tegenstander', test: (s) => Object.values(s.opps).some((x) => x.g - x.w >= 10) },
  { id: 'fav', ic: '🍬', name: 'Lievelingsprooi', desc: '10 spellen gewonnen van dezelfde tegenstander', test: (s) => Object.values(s.opps).some((x) => x.w >= 10) },
  { id: 'polder', ic: '🌷', name: 'Polderaar', desc: '10 wedstrijden gelijkgespeeld', test: (s) => s.md >= 10 },
  { id: 'coin', ic: '⚖️', name: 'Muntje', desc: 'Precies de helft gewonnen na minstens 20 spellen', test: (s) => s.coin },
  { id: 'twoface', ic: '🃏', name: 'Twee gezichten', desc: 'Op één dag iemand laten kruipen én zelf gekropen', test: (s) => Object.values(s.dayRes).some((d) => d.gave && d.crawled) },
  { id: 'chameleon', ic: '🦎', name: 'Kameleon', desc: 'Op één dag 1 tegen 1 én 2 tegen 2 gespeeld', test: (s) => Object.values(s.dayRes).some((d) => d.modes['1v1'] && d.modes['2v2']) },
  { id: 'nap', ic: '💤', name: 'Winterslaap', desc: 'Weer gespeeld na 30 dagen stilte', test: (s) => s.naps >= 1 },
  { id: 'zigzag', ic: '🎢', name: 'Achtbaan', desc: '8 spellen lang om en om gewonnen en verloren', test: (s) => s.zigzag >= 7 },
  { id: 'moment', ic: '⏰', name: 'Momentje!', desc: '3 keer uitstel gevraagd en toch gespeeld', test: (s) => s.delays >= 3 },
];

export function ranking(players, P, mode) {
  return players
    .filter((p) => !p.retired && P[p.id]?.byMode[mode].g > 0)
    .map((p) => ({ p, s: P[p.id], r: mode === '1v1' ? p.solo : p.duo }))
    .sort((a, b) => b.r - a.r);
}
