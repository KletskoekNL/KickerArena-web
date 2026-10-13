// A virtual game on "DE TAFEL": both teams play the ball towards the other
// team's goal and the figures really kick (forwards, or a back-heel for a
// ball behind them); the ball rolls under the rods, the goal mouths stay closed.
// A goal is only shown after a user enters one (data-gid): then the scoring
// team shoots it into the opponents' net (Zwart scores right, Wit left).
const FIELD = { x0: 44, x1: 956, y0: 44, y1: 536 };
const BR = 14, FR = 18, SLIDE = 24, MAXV = 620, REACH = FR + BR + 10;
const GOAL_Y = 290;
const KICK = 0.34; // seconds of one kick: wind up, strike, recover
const STRIKE = 0.1; // moment the foot hits the ball

const ball = { x: 500, y: 290, vx: 220, vy: 140 };
let mode = 'play'; // play | setup | shot | rest
let modeUntil = 0;
let shot = null;
let lastGid = null;
let svgEl = null;
let rods = [];
let last = 0;
const stuck = { x: 500, t: 0 }; // how long the ball stays around x

// Zwart (0) plays to the right, Wit (1) to the left.
const dirOf = (team) => (team === 0 ? 1 : -1);
const goalX = (team) => (team === 0 ? 972 : 28);

function measure(svg) {
  svgEl = svg;
  rods = [...svg.querySelectorAll('.rod[data-ys]')].map((el) => ({
    el,
    x: Number(el.dataset.x),
    team: Number(el.dataset.team),
    ys: el.dataset.ys.split(',').map(Number),
    feet: [...el.querySelectorAll('.foot')],
    bodies: [...el.querySelectorAll('.body')],
    off: Number(/translateY\((-?[\d.]+)px/.exec(el.getAttribute('style') || '')?.[1] || 0),
    kick: -1, // time into the current kick, -1 = none
    hit: false,
    heel: false,
    lift: 0, // seconds the rod stays turned up, so the ball rolls underneath
    want: null, // y the rod is steered to (setup)
  }));
  // the page was redrawn mid-shot: carry on with the new rod
  if (shot) {
    const r = rods.find((x) => x.x === shot.rod.x);
    if (r) { r.want = shot.rod.want; r.kick = shot.rod.kick; r.hit = shot.rod.hit; r.lift = shot.rod.lift; shot.rod = r; }
  }
}

// A goal entered by a user: data-gid is when its flash ends.
function checkGoal(svg) {
  const gid = svg.dataset.gid || null;
  if (gid === lastGid) return;
  lastGid = gid;
  if (gid && Number(gid) > Date.now() + 1000) startSetup(Number(svg.dataset.gteam));
}

function respawn() {
  mode = 'play';
  ball.x = 500; ball.y = 290;
  const dir = Math.random() < 0.5 ? 1 : -1;
  ball.vx = dir * 240; ball.vy = (Math.random() - 0.5) * 260;
}

const aimSpeed = (tx, ty, speed) => {
  const dx = tx - ball.x, dy = ty - ball.y;
  const d = Math.hypot(dx, dy) || 1;
  ball.vx = (dx / d) * speed; ball.vy = (dy / d) * speed;
};

// The scoring team's nearest rod with the ball in front of it lines up a
// figure, the ball rolls to its foot (under the rods in between) and it shoots.
function startSetup(team) {
  const dir = dirOf(team);
  const own = rods.filter((r) => r.team === team);
  if (!own.length) return;
  const ahead = own.filter((r) => (ball.x - r.x) * dir > FR);
  const pick = (ahead.length ? ahead : own).reduce((a, b) => (Math.abs(b.x - ball.x) < Math.abs(a.x - ball.x) ? b : a));
  // a ball behind the shooter (only behind its own keeper) first goes under it
  if (!ahead.length) pick.lift = 0.5;
  let fy = pick.ys[0];
  for (const y of pick.ys) if (Math.abs(ball.y - (y + pick.off)) < Math.abs(ball.y - (fy + pick.off))) fy = y;
  const sy = Math.max(FIELD.y0 + 40, Math.min(FIELD.y1 - 40, fy + pick.off));
  pick.want = Math.max(-SLIDE, Math.min(SLIDE, sy - fy));
  shot = { team, rod: pick, from: { x: ball.x, y: ball.y }, to: { x: pick.x + dir * (FR + BR + 2), y: fy + pick.want }, t: 0 };
  mode = 'setup';
}

// heel: a kick backwards, for a ball that lies behind the figure
function startKick(r, heel = false) {
  if (r.kick < 0) { r.kick = 0; r.hit = false; r.heel = heel; }
}

function stepKicks(dt) {
  for (const r of rods) {
    r.lift = Math.max(0, r.lift - dt);
    if (r.kick < 0) continue;
    r.kick += dt;
    if (r.kick > KICK) r.kick = -1;
  }
}

function moveRods(dt) {
  for (const r of rods) {
    let want = 0;
    if (r.want != null) want = r.want;
    else if (Math.abs(ball.x - r.x) < 220) {
      let best = r.ys[0];
      for (const y of r.ys) if (Math.abs(ball.y - (y + r.off)) < Math.abs(ball.y - (best + r.off))) best = y;
      want = Math.max(-SLIDE, Math.min(SLIDE, ball.y - best));
    }
    const dv = Math.max(-190 * dt, Math.min(190 * dt, want - r.off));
    r.off += dv;
  }
}

function step(dt, now) {
  stepKicks(dt);
  if (mode === 'rest') {
    ball.vx = ball.vy = 0;
    moveRods(dt);
    if (now > modeUntil) { for (const r of rods) r.want = null; shot = null; respawn(); }
    return;
  }
  if (mode === 'setup') {
    // the ball rolls in front of the shooter, then the rod kicks
    shot.t += dt / 0.45;
    const e = Math.min(1, shot.t), s = e * e * (3 - 2 * e);
    ball.x = shot.from.x + (shot.to.x - shot.from.x) * s;
    ball.y = shot.from.y + (shot.to.y - shot.from.y) * s;
    moveRods(dt);
    if (e >= 1 && shot.rod.kick < 0) startKick(shot.rod);
    if (shot.rod.kick >= STRIKE) {
      shot.rod.hit = true;
      mode = 'shot';
      aimSpeed(goalX(shot.team), GOAL_Y + (Math.random() - 0.5) * 60, 820);
    }
    return;
  }
  if (mode === 'shot') {
    moveRods(dt);
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    const into = shot.team === 0 ? ball.x >= goalX(0) : ball.x <= goalX(1);
    if (into) { ball.x = goalX(shot.team); ball.vx = ball.vy = 0; mode = 'rest'; modeUntil = now + 3000; }
    return;
  }

  moveRods(dt);
  ball.x += ball.vx * dt; ball.y += ball.vy * dt;
  // walls (the goal mouths stay closed while nobody scored)
  if (ball.x < FIELD.x0 + BR) { ball.x = FIELD.x0 + BR; ball.vx = Math.abs(ball.vx) * 0.8; }
  if (ball.x > FIELD.x1 - BR) { ball.x = FIELD.x1 - BR; ball.vx = -Math.abs(ball.vx) * 0.8; }
  if (ball.y < FIELD.y0 + BR) { ball.y = FIELD.y0 + BR; ball.vy = Math.abs(ball.vy); }
  if (ball.y > FIELD.y1 - BR) { ball.y = FIELD.y1 - BR; ball.vy = -Math.abs(ball.vy); }

  if (Math.abs(ball.x - stuck.x) > 60) { stuck.x = ball.x; stuck.t = 0; }
  stuck.t += dt;
  // a ball behind a figure only gets a back-heel when it hangs around there,
  // or when it is trapped between a keeper and the end wall
  const slow = Math.hypot(ball.vx, ball.vy) < 260 || stuck.t > 0.5 || ball.x < rods[0]?.x || ball.x > rods[rods.length - 1]?.x;
  for (const r of rods) {
    const dir = dirOf(r.team);
    if (r.lift > 0 || Math.abs(ball.x - r.x) > REACH + 4) continue;
    for (const fy of r.ys) {
      const cy = fy + r.off;
      const dx = ball.x - r.x, dy = ball.y - cy;
      const d = Math.hypot(dx, dy);
      const inFront = dx * dir > -4;
      // ball within reach in front of the figure: wind up and kick it forward;
      // a slow ball behind it gets a back-heel
      if (d < REACH && r.kick < 0 && (inFront || slow)) startKick(r, !inFront);
      if (r.kick >= STRIKE && !r.hit && d < REACH + 6 && inFront !== r.heel) {
        r.hit = true;
        stuck.t = 0;
        if (!r.heel) {
          // aim somewhere at the opponents' goal end (passes and shots)
          aimSpeed(goalX(r.team), GOAL_Y + (Math.random() - 0.5) * 300, 430 + Math.random() * 190);
        } else {
          // back-heel: diagonally backwards; off the end wall it comes back,
          // so the rod turns up and lets it roll underneath
          ball.vx = -dir * (300 + Math.random() * 120);
          ball.vy = (dy >= 0 ? 1 : -1) * (160 + Math.random() * 160);
          const wall = dir > 0 ? FIELD.x0 : FIELD.x1;
          if (Math.abs(ball.x - wall) < 120) r.lift = 0.75;
        }
      }
      // the figures are solid: block the ball
      if (d < FR + BR && d > 0.001) {
        const nx = dx / d, ny = dy / d;
        ball.x = r.x + nx * (FR + BR); ball.y = cy + ny * (FR + BR);
        const vn = ball.vx * nx + ball.vy * ny;
        if (vn < 0) { ball.vx -= 1.7 * vn * nx; ball.vy -= 1.7 * vn * ny; }
      }
    }
  }
  // still hanging around one spot: the nearest rod turns up to let it through
  if (stuck.t > 1.6 && rods.length) {
    stuck.t = 0;
    rods.reduce((a, b) => (Math.abs(b.x - ball.x) < Math.abs(a.x - ball.x) ? b : a)).lift = 0.6;
  }
  // a little friction, and never let the ball die
  const f = Math.pow(0.55, dt);
  ball.vx *= f; ball.vy *= f;
  const sp = Math.hypot(ball.vx, ball.vy);
  if (sp > MAXV) { ball.vx *= MAXV / sp; ball.vy *= MAXV / sp; }
  if (sp < 110) {
    if (sp < 1) { ball.vx = 110; ball.vy = 0; } else { ball.vx *= 110 / sp; ball.vy *= 110 / sp; }
  }
}

// Top-down, a kick is the rod rotating: the foot swings back, then forward
// past the ball, and the body is foreshortened while it turns.
function kickPose(r) {
  const dir = dirOf(r.team);
  // turned up: the figures lie flat, feet pointing backwards
  if (r.lift > 0) return { foot: `translateX(${-dir * 16}px)`, body: `translateX(${-dir * 6}px) scaleX(0.5)` };
  if (r.kick < 0) return { foot: '', body: '' };
  const t = r.kick;
  let swing, turn;
  if (t < STRIKE) { const p = t / STRIKE; swing = -10 * p; turn = 0.25 * p; }
  else if (t < STRIKE + 0.08) { const p = (t - STRIKE) / 0.08; swing = -10 + 32 * p; turn = 0.25 + 0.2 * p; }
  else { const p = (t - STRIKE - 0.08) / (KICK - STRIKE - 0.08); swing = 22 * (1 - p); turn = 0.45 * (1 - p); }
  if (r.heel) swing = -swing;
  return {
    foot: `translateX(${(dir * swing).toFixed(1)}px)`,
    body: `translateX(${(dir * swing * 0.3).toFixed(1)}px) scaleX(${(1 - turn).toFixed(2)})`,
  };
}

function frame(t) {
  const svg = document.querySelector('.tablesvg.sim');
  if (!svg) { last = 0; setTimeout(() => requestAnimationFrame(frame), 400); return; } // no table on this page
  requestAnimationFrame(frame);
  if (svg !== svgEl || !rods[0]?.el.isConnected) measure(svg);
  checkGoal(svg);
  const dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016;
  last = t;
  step(dt, t);
  // the ball rolls under the rods; once in a goal it shows above the cabinet
  const pos = `translate(${ball.x.toFixed(1)}px, ${ball.y.toFixed(1)}px)`;
  const inGoal = ball.x < FIELD.x0 || ball.x > FIELD.x1;
  for (const b of svg.querySelectorAll('.ball')) {
    b.style.transform = pos;
    if (b.classList.contains('top')) b.style.display = inGoal ? '' : 'none';
  }
  for (const r of rods) {
    r.el.style.transform = `translateY(${r.off.toFixed(1)}px)`;
    const pose = kickPose(r);
    for (const f of r.feet) f.style.transform = pose.foot;
    for (const bd of r.bodies) bd.style.transform = pose.body;
  }
}

// Runs whenever a table that wants to move is on the page (class "sim",
// see table.js).
requestAnimationFrame(frame);
