// Tiny SVG charts: a rating line with crosshair tooltip, and sparklines.
import { esc } from './ui.js';

function niceTicks(lo, hi, n = 4) {
  const span = hi - lo || 1;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 5, 10].map((k) => k * mag).find((s) => s >= step0);
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(v);
  return ticks;
}

/** points: [{t, r}] in chronological order. One series, so no legend: the card title names it. */
export function lineChart(points, { title = '' } = {}) {
  if (points.length < 2) return '<div class="empty dim chart-empty">📈 Nog te weinig wedstrijden voor een grafiek</div>';
  const W = 640, H = 220, L = 44, R = 12, T = 12, B = 26;
  const all = [{ t: points[0].t, r: 1000 }, ...points];
  const rs = all.map((p) => p.r);
  let lo = Math.min(...rs), hi = Math.max(...rs);
  const pad = Math.max(10, (hi - lo) * 0.12);
  lo -= pad; hi += pad;
  const x = (i) => L + (i / (all.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticks = niceTicks(lo, hi);
  const d = all.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.r).toFixed(1)}`).join('');
  const area = `${d}L${x(all.length - 1).toFixed(1)},${H - B}L${L},${H - B}Z`;
  const fmt = (t) => new Date(t).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  const data = all.map((p, i) => [Math.round(x(i)), Math.round(y(p.r)), Math.round(p.r), i ? fmt(p.t) : 'start']);
  const last = all.length - 1;
  return `<div class="chart" data-pts='${esc(JSON.stringify(data))}' data-w="${W}" aria-label="${esc(title)}">
    <svg viewBox="0 0 ${W} ${H}" role="img">
      <defs><linearGradient id="areaGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc83d" stop-opacity=".22"/><stop offset="1" stop-color="#ffc83d" stop-opacity="0"/></linearGradient></defs>
      <g class="grid">${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>`).join('')}</g>
      <g class="axis">${ticks.map((v) => `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`).join('')}
        <text x="${L}" y="${H - 6}">${fmt(all[0].t)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end">${fmt(all[last].t)}</text></g>
      <path class="area" d="${area}"/>
      <path class="ln" d="${d}"/>
      <circle class="pt" cx="${x(last)}" cy="${y(all[last].r)}" r="4.5"/>
      <g class="hover" style="display:none"><line class="cross" y1="${T}" y2="${H - B}"/><circle class="pt" r="5"/></g>
    </svg><div class="tip" style="display:none"></div></div>`;
}

export function bindCharts(root) {
  root.addEventListener('pointermove', (e) => {
    const c = e.target.closest?.('.chart');
    if (!c) return;
    const pts = JSON.parse(c.dataset.pts);
    const svg = c.querySelector('svg');
    const box = svg.getBoundingClientRect();
    const k = box.width / Number(c.dataset.w);
    const mx = (e.clientX - box.left) / k;
    let best = 0;
    pts.forEach((p, i) => { if (Math.abs(p[0] - mx) < Math.abs(pts[best][0] - mx)) best = i; });
    const p = pts[best];
    const prev = best ? pts[best - 1][2] : p[2];
    const hv = svg.querySelector('.hover');
    hv.style.display = '';
    hv.querySelector('line').setAttribute('x1', p[0]); hv.querySelector('line').setAttribute('x2', p[0]);
    hv.querySelector('circle').setAttribute('cx', p[0]); hv.querySelector('circle').setAttribute('cy', p[1]);
    const tip = c.querySelector('.tip');
    const dlt = p[2] - prev;
    tip.style.display = '';
    tip.style.left = `${p[0] * k}px`; tip.style.top = `${p[1] * k}px`;
    tip.innerHTML = `<b>${p[2]}</b> <span class="${dlt >= 0 ? 'up' : 'down'}">${best ? (dlt >= 0 ? '+' : '') + dlt : ''}</span><br><span class="muted">${esc(p[3])}${best ? ` · wedstrijd ${best}` : ''}</span>`;
  });
  root.addEventListener('pointerleave', (e) => {
    const c = e.target;
    if (!c.classList?.contains('chart')) return;
    c.querySelector('.hover').style.display = 'none';
    c.querySelector('.tip').style.display = 'none';
  }, true);
}

export function sparkline(points, n = 12) {
  const pts = points.slice(-n).map((p) => p.r);
  if (pts.length < 2) return '<svg class="spark"></svg>';
  const lo = Math.min(...pts), hi = Math.max(...pts);
  const W = 90, H = 26;
  const x = (i) => 3 + (i / (pts.length - 1)) * (W - 6);
  const y = (v) => 3 + (1 - (v - lo) / (hi - lo || 1)) * (H - 6);
  const last = pts.length - 1;
  return `<svg class="spark" viewBox="0 0 ${W} ${H}"><polyline points="${pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/><circle cx="${x(last)}" cy="${y(pts[last])}" r="3"/></svg>`;
}
