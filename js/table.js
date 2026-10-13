// The foosball table, drawn top-down as SVG.
import { esc } from './ui.js';
import { tableMoves } from './store.js';

// Rods from left (Zwart's goal) to right (Wit's goal), like a real table.
const RODS = [
  { team: 0, n: 1, role: 0 }, // zwart keeper
  { team: 0, n: 2, role: 0 }, // zwart defence
  { team: 1, n: 3, role: 1 }, // wit attack
  { team: 0, n: 5, role: 1 }, // zwart midfield
  { team: 1, n: 5, role: 1 }, // wit midfield
  { team: 0, n: 3, role: 1 }, // zwart attack
  { team: 1, n: 2, role: 0 }, // wit defence
  { team: 1, n: 1, role: 0 }, // wit keeper
];
const FY = 60, FH = 460; // field top / height
// Deutscher Meister style: figures molded in solid black and solid white.
// [mid tone, edge, plate fill, plate text]
const TEAM = [['#2a2d32', '#7b828c', '#0b0b0c', '#ffffff'], ['#f6f2ea', '#a39b8b', '#f3efe6', '#111111']];

const ys = (n) => {
  const gap = { 1: 0, 2: 180, 3: 140, 5: 92 }[n];
  return Array.from({ length: n }, (_, i) => FY + FH / 2 + (i - (n - 1) / 2) * gap);
};

function figure(x, y, team, lean) {
  const edge = TEAM[team][1];
  return `<g transform="translate(${x},${y})">
    <ellipse cx="4" cy="6" rx="17" ry="24" fill="rgba(0,0,0,.3)"/>
    <ellipse class="foot" data-anim cx="${lean}" cy="0" rx="11" ry="9" fill="url(#fig${team})" stroke="${edge}" stroke-width="1"/>
    <g class="body" data-anim><rect x="-14" y="-21" width="28" height="42" rx="13" fill="url(#fig${team})" stroke="${edge}" stroke-width="1.2"/>
    <circle cx="0" cy="0" r="9" fill="url(#head${team})" stroke="${edge}" stroke-width="1"/></g>
  </g>`;
}

/**
 * match: active match or null. names: [[label...],[label...]] per team keyed by role.
 * goalFlash: {team} when a goal was just scored (ball goes into the opponents' net).
 */
export function tableSVG({ match, players, goalFlash, idle }) {
  const P = (id) => players.find((p) => p.id === id);
  const played = match?.games.length || 0;
  // A little life: rods sit at slightly different heights after every game.
  const seed = match ? played * 11 + match.id.charCodeAt(0) : 0;
  const off = (i) => (((seed + i * 37) % 9) - 4) * 9;

  let ball = 'translate(500px, 290px)';
  if (goalFlash) ball = goalFlash.team === 0 ? 'translate(968px, 290px)' : 'translate(32px, 290px)';
  else if (match) ball = `translate(${380 + ((seed * 53) % 240)}px, ${170 + ((seed * 31) % 240)}px)`;

  // Rods run underneath the cabinet walls: grip on the owner's side, a bare
  // end with a rubber cap on the other side (non-telescopic rods).
  const rods = RODS.map((r, i) => {
    const x = 106 + i * 112.6;
    const figs = ys(r.n).map((y) => figure(x, y, r.team, r.team === 0 ? 3 : -3)).join('');
    const grip = r.team === 0
      ? `<rect x="${x - 13}" y="608" width="26" height="62" rx="12" fill="url(#grip)" stroke="#6b4320" stroke-width="1"/>
         <rect x="${x - 13}" y="660" width="26" height="10" rx="5" fill="${TEAM[0][2]}" stroke="${TEAM[0][1]}" stroke-width="1"/>
         <rect x="${x - 7}" y="-38" width="14" height="12" rx="4" fill="#1b1b1b"/>`
      : `<rect x="${x - 13}" y="-90" width="26" height="62" rx="12" fill="url(#grip)" stroke="#6b4320" stroke-width="1"/>
         <rect x="${x - 13}" y="-90" width="26" height="10" rx="5" fill="${TEAM[1][2]}" stroke="${TEAM[1][1]}" stroke-width="1"/>
         <rect x="${x - 7}" y="604" width="14" height="12" rx="4" fill="#1b1b1b"/>`;
    const [y1, y2] = r.team === 0 ? [-30, 672] : [-90, 616];
    return `<g class="rod" data-anim data-x="${x}" data-team="${r.team}" data-ys="${ys(r.n).join(',')}" style="transform: translateY(${off(i)}px)">
      <rect x="${x - 4}" y="${y1}" width="8" height="${y2 - y1}" rx="4" fill="url(#steel)"/>
      ${grip}${figs}</g>`;
  }).join('');
  const bushings = RODS.map((_, i) => {
    const x = 106 + i * 112.6;
    return `<rect x="${x - 10}" y="-3" width="20" height="7" rx="3" fill="url(#bush)"/><rect x="${x - 10}" y="576" width="20" height="7" rx="3" fill="url(#bush)"/>`;
  }).join('');

  // One name plate per team.
  let tags = '';
  if (match) {
    for (let t = 0; t < 2; t++) {
      const label = match.teams[t].map((id) => `${P(id)?.emoji || ''} ${P(id)?.name || '?'}`.trim()).join('  &  ');
      const w = Math.max(160, label.length * 12.5 + 50);
      const [x, y] = t === 0 ? [300, 706] : [700, -116];
      tags += `<g class="tag" transform="translate(${x},${y})">
        <rect x="${-w / 2}" y="-22" width="${w}" height="44" rx="22" style="fill:${TEAM[t][2]}" stroke="${TEAM[t][1]}" stroke-width="2"/>
        <text text-anchor="middle" y="8" style="fill:${TEAM[t][3]}">${esc(label)}</text></g>`;
    }
  }

  const ring = 'M34,0 H966 A34,34 0 0 1 1000,34 V546 A34,34 0 0 1 966,580 H34 A34,34 0 0 1 0,546 V34 A34,34 0 0 1 34,0 Z M44,44 V536 H956 V44 Z';
  const sim = tableMoves();
  const gattr = goalFlash ? ` data-gid="${goalFlash.until}" data-gteam="${goalFlash.team}"` : '';
  return `<svg class="tablesvg ${idle ? 'idle' : ''}${sim ? ' sim' : ''}"${gattr} viewBox="0 -135 1000 870" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9a6234"/><stop offset=".5" stop-color="#7a4a24"/><stop offset="1" stop-color="#4a2a12"/></linearGradient>
    <pattern id="grain" width="120" height="14" patternUnits="userSpaceOnUse"><path d="M0,7 Q30,2 60,7 T120,7" stroke="rgba(0,0,0,.18)" fill="none" stroke-width="2"/></pattern>
    <linearGradient id="steel" x1="0" x2="1"><stop offset="0" stop-color="#6d7377"/><stop offset=".45" stop-color="#f4f7f8"/><stop offset="1" stop-color="#5b6164"/></linearGradient>
    <linearGradient id="bush" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#e9edf0"/><stop offset="1" stop-color="#6f777d"/></linearGradient>
    <linearGradient id="grip" x1="0" x2="1"><stop offset="0" stop-color="#9c6431"/><stop offset=".45" stop-color="#e4b27a"/><stop offset="1" stop-color="#8a5526"/></linearGradient>
    <linearGradient id="fig0" x1="0" x2="1"><stop offset="0" stop-color="#050506"/><stop offset=".42" stop-color="#4b5058"/><stop offset=".6" stop-color="#1c1e22"/><stop offset="1" stop-color="#050506"/></linearGradient>
    <linearGradient id="fig1" x1="0" x2="1"><stop offset="0" stop-color="#cfc8b8"/><stop offset=".42" stop-color="#ffffff"/><stop offset=".6" stop-color="#f1ece2"/><stop offset="1" stop-color="#c7bfae"/></linearGradient>
    <radialGradient id="head0" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#5a606a"/><stop offset="1" stop-color="#08090a"/></radialGradient>
    <radialGradient id="head1" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d6cfc0"/></radialGradient>
    <radialGradient id="ballg" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff6dc"/><stop offset=".6" stop-color="#e7cf9b"/><stop offset="1" stop-color="#a88a52"/></radialGradient>
    <radialGradient id="light" cx=".5" cy=".45" r=".7"><stop offset="0" stop-color="rgba(255,255,230,.18)"/><stop offset="1" stop-color="rgba(0,0,0,.35)"/></radialGradient>
    <linearGradient id="brass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6dc8e"/><stop offset=".5" stop-color="#c99a3b"/><stop offset="1" stop-color="#8d6519"/></linearGradient>
    <linearGradient id="net" x1="0" x2="1"><stop offset="0" stop-color="#050505"/><stop offset="1" stop-color="#1d1d1d"/></linearGradient>
  </defs>
  <rect x="40" y="40" width="920" height="500" fill="#0e3b1d"/>
  <g>${Array.from({ length: 10 }, (_, i) => `<rect x="${44 + i * 91.2}" y="44" width="91.2" height="492" fill="${i % 2 ? '#1f8a40' : '#1a7a38'}"/>`).join('')}</g>
  <g fill="none" stroke="rgba(255,255,255,.75)" stroke-width="3">
    <rect x="62" y="62" width="876" height="456"/>
    <line x1="500" y1="62" x2="500" y2="518"/>
    <circle cx="500" cy="290" r="70"/>
    <rect x="62" y="170" width="120" height="240"/><rect x="818" y="170" width="120" height="240"/>
    <rect x="62" y="225" width="50" height="130"/><rect x="888" y="225" width="50" height="130"/>
    <path d="M182,250 a45,45 0 0,1 0,80"/><path d="M818,250 a45,45 0 0,0 0,80"/>
  </g>
  <circle cx="500" cy="290" r="5" fill="rgba(255,255,255,.85)"/>
  <g fill="#14592b" opacity=".9">
    <path d="M44,44 h40 l-40,40z"/><path d="M956,44 h-40 l40,40z"/><path d="M44,536 h40 l-40,-40z"/><path d="M956,536 h-40 l40,-40z"/>
  </g>
  <rect x="44" y="44" width="912" height="492" fill="url(#light)"/>
  <g class="ball" data-anim style="transform: ${ball}"><circle r="15" cx="3" cy="5" fill="rgba(0,0,0,.35)"/><circle r="14" fill="url(#ballg)"/></g>
  ${rods}
  <path d="${ring}" fill="url(#wood)" fill-rule="evenodd"/>
  <path d="${ring}" fill="url(#grain)" fill-rule="evenodd"/>
  <rect x="6" y="6" width="988" height="568" rx="30" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="2"/>
  <rect x="44" y="44" width="912" height="492" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="5"/>
  ${bushings}
  <rect x="14" y="230" width="34" height="120" rx="6" fill="url(#net)" stroke="#2a1708" stroke-width="3"/>
  <rect x="952" y="230" width="34" height="120" rx="6" fill="url(#net)" stroke="#2a1708" stroke-width="3"/>
  ${[5, 540].map((y) => `<g transform="translate(500,${y})">
    <rect x="-42" y="0" width="84" height="35" rx="5" fill="url(#brass)" stroke="#5c3d0c" stroke-width="1.5"/>
    <circle cx="-37" cy="17.5" r="1.6" fill="#5c3d0c"/><circle cx="37" cy="17.5" r="1.6" fill="#5c3d0c"/>
    <g style="font: 14px Bebas, Impact, sans-serif; letter-spacing: 1.2px" fill="#3b2606" text-anchor="middle">
      <text y="16">DEUTSCHER</text><text y="31">MEISTER</text></g></g>`).join('')}
  <g class="ball top" data-anim style="transform: ${ball}${goalFlash ? '' : '; display: none'}"><circle r="15" cx="3" cy="5" fill="rgba(0,0,0,.35)"/><circle r="14" fill="url(#ballg)"/></g>
  ${tags}
  </svg>`;
}
