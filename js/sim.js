// A virtual game on "DE TAFEL", played the way people play: a rod that gets
// the ball stops it, lines up and passes it to its own next rod or, from the
// attack, shoots at the goal. The other team's rods slide into the line
// between the ball and their goal, and every rod goes for where the ball
// will cross it. A ball that comes from behind and goes forward rolls under
// a rod (the players turn it up), so nobody plays it back to their own goal.
// The goal mouths stay closed: a goal is only shown after a user enters one
// (data-gid); then the scoring team shoots it into the opponents' net
// (Zwart scores right, Wit left).
const FIELD = { x0: 44, x1: 956, y0: 44, y1: 536 };
const BR = 14, FR = 18, MAXV = 900, REACH = FR + BR + 10, HOLD = FR + BR + 2;
const GOAL_Y = 290, MOUTH = [230, 350];
const KICK = 0.34; // seconds of one kick: wind up, strike, recover
const STRIKE = 0.1; // moment the foot hits the ball
const TRAP = 380; // a ball slower than this is stopped by any figure that reaches it
const SEE = 0.12; // seconds before a rod reacts to where the ball goes now
const ROD_V = 200; // how fast a rod slides
const CUSH = 0.32; // seconds a figure takes to catch the ball: it gives a little, then holds it

const ball = { x: 500, y: 290, vx: 200, vy: 120 };
let mode = 'play'; // play | setup | shot | rest
let T = 0; // seconds of play
let modeUntil = 0;
let shot = null;
let lastGid = null;
let svgEl = null;
let rods = [];
let last = 0;
let ctl = null; // the rod that has the ball, lining up its pass or shot
let touch = { x: 0, team: -1, t: -9, to: null }; // who played it last; to: the rod a pass is meant for
const past = []; // the ball over the last moments: the rods see it SEE late
let quiet = 0; // seconds without a rod touching the ball

// Zwart (0) plays to the right, Wit (1) to the left.
const dirOf = (team) => (team === 0 ? 1 : -1);
const goalX = (team) => (team === 0 ? 972 : 28);
const endX = (team) => (team === 0 ? FIELD.x1 : FIELD.x0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);

function measure(svg) {
  svgEl = svg;
  rods = [...svg.querySelectorAll('.rod[data-ys]')].map((el) => {
    const ys = el.dataset.ys.split(',').map(Number);
    // far enough that the figures cover the field between them, not into the walls
    const gap = ys.length > 1 ? ys[1] - ys[0] : 140;
    return {
      el,
      x: Number(el.dataset.x),
      team: Number(el.dataset.team),
      ys,
      slide: Math.min(gap / 2 + 6, ys[0] - FIELD.y0 - FR, FIELD.y1 - FR - ys[ys.length - 1]),
      feet: [...el.querySelectorAll('.foot')],
      bodies: [...el.querySelectorAll('.body')],
      off: Number(/translateY\((-?[\d.]+)px/.exec(el.getAttribute('style') || '')?.[1] || 0),
      kick: -1, // time into the current kick, -1 = none
      hit: false,
      lift: 0, // seconds the rod stays turned up, so the ball rolls underneath
      want: null, // offset the rod is steered to (setup)
      goal: 0, // offset the rod is heading for now
      err: 0, // how far off this rod guesses the line
    };
  });
  // the page was redrawn mid-move: carry on with the new rods
  const same = (r) => rods.find((x) => x.x === r.x);
  for (const old of [shot?.rod, ctl?.r].filter(Boolean)) {
    const r = same(old);
    if (r) Object.assign(r, { off: old.off, want: old.want, kick: old.kick, hit: old.hit, lift: old.lift });
  }
  if (shot) shot.rod = same(shot.rod) || shot.rod;
  if (ctl) { ctl.r = same(ctl.r); if (!ctl.r) ctl = null; }
}

// A goal entered by a user: data-gid is when its flash ends.
function checkGoal(svg) {
  const gid = svg.dataset.gid || null;
  if (gid === lastGid) return;
  lastGid = gid;
  if (gid && Number(gid) > Date.now() + 1000) startSetup(Number(svg.dataset.gteam));
}

// The ball comes back in at the middle, slowly, for a midfield to take.
function respawn() {
  mode = 'play';
  ball.x = 500; ball.y = rnd(150, 430);
  ball.vx = (Math.random() < 0.5 ? 1 : -1) * 160; ball.vy = rnd(-120, 120);
  touch = { x: 0, team: -1, t: T, to: null };
}

const aimSpeed = (tx, ty, speed) => {
  const dx = tx - ball.x, dy = ty - ball.y;
  const d = Math.hypot(dx, dy) || 1;
  ball.vx = (dx / d) * speed; ball.vy = (dy / d) * speed;
};

// The rod offset that brings one of its figures to y, or as close as it gets.
function offTo(r, y) {
  let best = r.off, miss = Infinity;
  for (const fy of r.ys) {
    const o = clamp(y - fy, -r.slide, r.slide);
    const m = Math.abs(fy + o - y);
    if (m < miss - 0.5 || (Math.abs(m - miss) <= 0.5 && Math.abs(o - r.off) < Math.abs(best - r.off))) { miss = m; best = o; }
  }
  return best;
}

// Where the ball crosses x, off the side walls; null when it goes the other way.
function predict(b, x) {
  if (Math.abs(b.vx) < 1) return null;
  const t = (x - b.x) / b.vx;
  if (t < 0) return null;
  const lo = FIELD.y0 + BR, h = FIELD.y1 - BR - lo;
  let y = (b.y + b.vy * t - lo) % (2 * h);
  if (y < 0) y += 2 * h;
  return lo + (y > h ? 2 * h - y : y);
}

// How much room the line from the ball to (tx, ty) leaves past the other
// team's figures in between, where they will be by the time the ball gets there.
function room(team, tx, ty, speed) {
  let min = Infinity;
  const slant = Math.abs(tx - ball.x) / Math.hypot(tx - ball.x, ty - ball.y); // a slanted ball passes closer
  for (const r of rods) {
    if (r.team === team || (r.x - ball.x) * (tx - r.x) <= 0) continue;
    const ly = ball.y + ((ty - ball.y) * (r.x - ball.x)) / (tx - ball.x);
    const reach = ROD_V * (STRIKE + Math.abs(r.x - ball.x) / speed);
    const off = r.off + clamp(r.goal - r.off, -reach, reach);
    for (const fy of r.ys) min = Math.min(min, Math.abs(ly - fy - off) * slant);
  }
  return min;
}

// What the rod with the ball does with it: the attack (and now and then the
// midfield) shoots, the others pass to their own next rod. Of a few lines it
// takes the one with the most room; room says how much that is.
function plan(r) {
  const dir = dirOf(r.team);
  const ahead = rods.filter((x) => x.team === r.team && (x.x - r.x) * dir > 0);
  const next = ahead.reduce((a, b) => (!a || (b.x - a.x) * dir < 0 ? b : a), null);
  const pick = (cands, tx, speed) => {
    const ty = cands.reduce((a, b) => (room(r.team, tx, b, speed) > room(r.team, tx, a, speed) ? b : a));
    return { tx, ty, speed, room: room(r.team, tx, ty, speed) };
  };
  if (!next || (ahead.length === 1 && Math.random() < 0.2)) {
    // a few shots go just wide; the rest are on target and the keeper has to save
    const wide = Math.random() < 0.3;
    const cands = Array.from({ length: 12 }, () => (wide
      ? (Math.random() < 0.5 ? MOUTH[0] - rnd(18, 40) : MOUTH[1] + rnd(18, 40))
      : rnd(MOUTH[0] + 12, MOUTH[1] - 12)));
    return { ...pick(cands, endX(r.team), rnd(720, 880)), to: null };
  }
  const cands = Array.from({ length: 12 }, () => {
    const fy = next.ys[Math.floor(Math.random() * next.ys.length)];
    return clamp(fy + rnd(-next.slide, next.slide), FIELD.y0 + BR + 4, FIELD.y1 - BR - 4);
  });
  return { ...pick(cands, next.x + dir * 40, rnd(470, 640)), to: next.x };
}

const guess = () => { for (const r of rods) r.err = rnd(-18, 18); };

// A rod stops the ball at one of its figures. The figure catches it: the
// ball runs on a little, partly under the figure, which gives way with it,
// and the rod moves along. Before it plays the ball on, the figures on the
// rod tap it to each other a few times (more often the further forward),
// and the rod slides to find an opening.
function take(r, fy) {
  const ahead = rods.filter((x) => x.team === r.team && (x.x - r.x) * dirOf(r.team) > 0).length;
  const most = r.ys.length < 2 ? 0 : [3, 2, 1, 0][ahead] ?? 0;
  ctl = {
    r, fy, t: T, pull: 0, from: { x: ball.x, y: ball.y }, plan: null, side: null,
    taps: Math.floor(rnd(ahead ? 0 : 1, most + 1)),
    wait: T + CUSH + rnd(0.25, 0.5),
    off: r.off, off0: r.off,
    v: { x: ball.vx, y: ball.vy }, // how it came in: the catch gives way along it
  };
  ball.vx = ball.vy = 0;
  quiet = 0;
  guess();
}

// A pass along the rod: the figure pushes the ball sideways, the ball rolls
// and the rod slides back the other way, so the next figure meets it.
function tap() {
  const r = ctl.r, i = r.ys.indexOf(ctl.fy);
  const to = [i - 1, i + 1].filter((j) => j >= 0 && j < r.ys.length);
  const B = r.ys[to[Math.floor(Math.random() * to.length)]];
  const gap = B - ctl.fy, s = Math.sign(gap);
  const offS = r.off;
  const push = clamp(offS + s * 12, -r.slide, r.slide);
  const off1 = clamp(push - gap * rnd(0.35, 0.6), -r.slide, r.slide);
  const yS = ctl.fy + push, y1 = B + off1;
  ctl.side = { t: 0, strike: 0.07, dur: Math.max(0.28, Math.abs(y1 - yS) / rnd(300, 380), Math.abs(off1 - push) / 0.8 / 260), offS, push, off1, y0: ctl.fy + offS, yS, y1, to: B };
}

function control(dt) {
  const r = ctl.r, dir = dirOf(r.team);
  // the catch: the ball comes to the foot, first running on a little (under
  // the figure, the rod giving way sideways), then held in front of it
  ctl.pull = Math.min(1, ctl.pull + dt / CUSH);
  const c = ctl.pull, s = c * c * (3 - 2 * c);
  const give = 0.07 * (1 - Math.exp(-(T - ctl.t) / 0.07)) * (1 - s);
  const gx = clamp(ctl.v.x * dir * give, -30, 12) * dir; // towards the own goal: under the figure
  const gy = clamp(ctl.v.y * give, -30, 30);
  if (c < 1) {
    r.off = clamp(ctl.off0 + gy * 0.8, -r.slide, r.slide);
    if (c + dt / CUSH >= 1) ctl.off = r.off;
  }
  let by = ctl.fy + r.off;
  const sd = ctl.side;
  if (sd) {
    // moveRods leaves this rod alone: it moves with the pass here
    sd.t += dt;
    if (sd.t < sd.strike) {
      r.off = sd.offS + (sd.push - sd.offS) * (sd.t / sd.strike);
      by = sd.y0 + (r.off - sd.offS);
    } else {
      const e = Math.min(1, (sd.t - sd.strike) / sd.dur);
      const q = Math.min(1, e * 1.25); // the rod is there just before the ball
      r.off = sd.push + (sd.off1 - sd.push) * q * q * (3 - 2 * q);
      by = sd.yS + (sd.y1 - sd.yS) * e * (2 - e); // the ball slows down towards the foot
      if (e >= 1) {
        ctl.side = null;
        ctl.fy = sd.to;
        ctl.wait = T + rnd(0.25, 0.5);
        ctl.off = clamp(r.off + rnd(-15, 15), -r.slide, r.slide);
      }
    }
  }
  const fx = r.x + dir * HOLD;
  ball.x = ctl.from.x + (fx - ctl.from.x) * s + gx * (1 - s);
  ball.y = ctl.from.y + (by - ctl.from.y) * s + (gy - gy * 0.8) * (1 - s);
  if (ctl.side || ctl.plan || T < ctl.wait || r.kick >= 0) return release(r);
  if (ctl.taps > 0) { ctl.taps--; tap(); return; }
  const p = plan(r);
  // no way through: tap it on (or slide the ball elsewhere) and look again, for a while
  if (p.room < FR + BR + rnd(-10, 6) && T < ctl.t + 2.5) {
    if (r.ys.length > 1) tap();
    else { ctl.off = rnd(-r.slide, r.slide); ctl.wait = T + rnd(0.2, 0.4); }
    return;
  }
  ctl.plan = p;
  startKick(r);
}

function release(r) {
  if (!ctl.plan || r.kick < STRIKE) return;
  r.hit = true;
  aimSpeed(ctl.plan.tx, ctl.plan.ty + rnd(-25, 25), ctl.plan.speed); // nobody kicks exactly where they aim
  touch = { x: r.x, team: r.team, t: T, to: ctl.plan.to };
  ctl = null;
}

// The scoring team's nearest rod with the ball in front of it lines up a
// figure, the ball rolls to its foot (under the rods in between) and it shoots.
function startSetup(team) {
  const dir = dirOf(team);
  const own = rods.filter((r) => r.team === team);
  if (!own.length) return;
  ctl = null;
  const ahead = own.filter((r) => (ball.x - r.x) * dir > FR);
  const pick = (ahead.length ? ahead : own).reduce((a, b) => (Math.abs(b.x - ball.x) < Math.abs(a.x - ball.x) ? b : a));
  // a ball behind the shooter (only behind its own keeper) first goes under it
  if (!ahead.length) pick.lift = 0.5;
  let fy = pick.ys[0];
  for (const y of pick.ys) if (Math.abs(ball.y - (y + pick.off)) < Math.abs(ball.y - (fy + pick.off))) fy = y;
  const sy = Math.max(FIELD.y0 + 40, Math.min(FIELD.y1 - 40, fy + pick.off));
  pick.want = clamp(sy - fy, -pick.slide, pick.slide);
  shot = { team, rod: pick, from: { x: ball.x, y: ball.y }, to: { x: pick.x + dir * (FR + BR + 2), y: fy + pick.want }, t: 0 };
  mode = 'setup';
}

function startKick(r) {
  if (r.kick < 0) { r.kick = 0; r.hit = false; }
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
  // the rods see the ball a moment late, which leaves room for a good pass
  past.push({ x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, t: T, team: ctl ? ctl.r.team : -1 });
  while (past.length > 1 && past[1].t <= T - SEE) past.shift();
  const seen = past[0], age = T - seen.t;
  const b = { x: seen.x + seen.vx * age, y: seen.y + seen.vy * age, vx: seen.vx, vy: seen.vy };
  for (const r of rods) {
    if (ctl?.r === r && (ctl.side || ctl.pull < 1)) { r.goal = r.off; continue; } // catching, passing along the rod: see control
    let want, v = ROD_V;
    if (r.want != null) want = r.want;
    else if (ctl?.r === r) want = ctl.plan ? r.off : ctl.off; // still while it kicks
    else if (ctl?.plan?.to === r.x) { want = offTo(r, ctl.plan.ty); v = ROD_V * 1.6; } // a team mate knows where the pass goes
    else if (!ctl && touch.to === r.x && touch.team === r.team && predict(ball, r.x) != null) { want = offTo(r, predict(ball, r.x)); v = ROD_V * 1.6; }
    else if (seen.team >= 0) {
      // someone has the ball (as far as they saw)
      const d = dirOf(seen.team);
      if (r.team !== seen.team && (r.x - seen.x) * d > 0) {
        // between the ball and their own goal: into the line to it
        const gx = endX(seen.team);
        want = offTo(r, seen.y + ((GOAL_Y - seen.y) * (r.x - seen.x)) / (gx - seen.x) + r.err);
      } else want = offTo(r, seen.y + r.err);
    } else {
      const p = predict(b, r.x);
      want = offTo(r, p == null ? b.y + r.err : p + r.err * 0.5);
      // a shot at the goal: the keeper always gets there, since a goal only
      // counts when a user enters one
      const real = predict(ball, r.x);
      if (r.ys.length === 1 && real != null && ball.vx * dirOf(r.team) < -500 && real > MOUTH[0] - BR - FR && real < MOUTH[1] + BR + FR) {
        want = offTo(r, real); v = 1400;
      }
    }
    r.goal = want;
    // an ordinary move eases in to where it goes; a save is a jump
    const step = v > ROD_V * 2 ? want - r.off : (want - r.off) * Math.min(1, dt * 8);
    r.off += clamp(step, -v * dt, v * dt);
  }
}

// The ball runs into the figures of one rod.
function meet(r) {
  const dir = dirOf(r.team);
  const sp = Math.hypot(ball.vx, ball.vy);
  const forward = ball.vx * dir > 0;
  // a team mate's pass is taken by the rod it was meant for; any rod stops a
  // slow ball, except the one that just played it
  const pass = touch.to === r.x && touch.team === r.team && forward;
  const fresh = touch.x !== r.x || T - touch.t > 0.35;
  for (const fy of r.ys) {
    const cy = fy + r.off;
    const dx = ball.x - r.x, dy = ball.y - cy;
    const d = Math.hypot(dx, dy);
    const ax = dx * dir; // in front of the figure > 0
    if (fresh && Math.abs(dy) < FR + BR + 6 && ax > -REACH / 2 && ax < REACH && (sp < TRAP || (pass && sp < 800))) { take(r, fy); return true; }
    // from behind and going forward: the rod turns up and lets it pass,
    // unless it is about to stop it
    if (ax <= 0 && forward) {
      if (d < FR + BR + 6 && !pass && sp >= TRAP) r.lift = Math.max(r.lift, 0.15);
      continue;
    }
    // the figures are solid: the ball bounces off
    if (d < FR + BR && d > 0.001) {
      const nx = dx / d, ny = dy / d;
      ball.x = r.x + nx * (FR + BR); ball.y = clamp(cy + ny * (FR + BR), FIELD.y0 + BR, FIELD.y1 - BR);
      const vn = ball.vx * nx + ball.vy * ny;
      if (vn < 0) {
        const e = rnd(0.35, 0.9);
        ball.vx -= (1 + e) * vn * nx; ball.vy -= (1 + e) * vn * ny;
        ball.vy += rnd(-60, 60);
        touch = { x: -1, team: r.team, t: T, to: null }; // a block: this rod may stop the rebound
        quiet = 0;
        guess();
      }
    }
  }
  return false;
}

function step(dt) {
  T += dt;
  stepKicks(dt);
  if (mode === 'rest') {
    ball.vx = ball.vy = 0;
    moveRods(dt);
    if (T > modeUntil) { for (const r of rods) r.want = null; shot = null; respawn(); }
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
      aimSpeed(goalX(shot.team), GOAL_Y + (Math.random() - 0.5) * 60, 760);
    }
    return;
  }
  if (mode === 'shot') {
    moveRods(dt);
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    const into = shot.team === 0 ? ball.x >= goalX(0) : ball.x <= goalX(1);
    if (into) { ball.x = goalX(shot.team); ball.vx = ball.vy = 0; mode = 'rest'; modeUntil = T + 3; }
    return;
  }

  moveRods(dt);
  if (ctl) { control(dt); return; }
  ball.x += ball.vx * dt; ball.y += ball.vy * dt;
  // walls (the goal mouths stay closed while nobody scored)
  if (ball.x < FIELD.x0 + BR) { ball.x = FIELD.x0 + BR; ball.vx = Math.abs(ball.vx) * 0.7; }
  if (ball.x > FIELD.x1 - BR) { ball.x = FIELD.x1 - BR; ball.vx = -Math.abs(ball.vx) * 0.7; }
  if (ball.y < FIELD.y0 + BR) { ball.y = FIELD.y0 + BR; ball.vy = Math.abs(ball.vy) * 0.8; }
  if (ball.y > FIELD.y1 - BR) { ball.y = FIELD.y1 - BR; ball.vy = -Math.abs(ball.vy) * 0.8; }

  for (const r of rods) {
    if (r.lift > 0 || Math.abs(ball.x - r.x) > REACH + 4) continue;
    if (meet(r)) return;
  }
  // nobody gets to it for a while: the nearest rod turns up to let it through
  quiet += dt;
  if (quiet > 2.5 && rods.length) {
    quiet = 0;
    rods.reduce((a, b) => (Math.abs(b.x - ball.x) < Math.abs(a.x - ball.x) ? b : a)).lift = 0.5;
  }
  // a little friction; the table's slope keeps a slow ball rolling, and never
  // straight across, where no rod would reach it
  const f = Math.pow(0.6, dt);
  ball.vx *= f; ball.vy *= f;
  if (Math.abs(ball.vx) < 70) ball.vx = (ball.vx < 0 ? -1 : 1) * 70;
  const sp = Math.hypot(ball.vx, ball.vy);
  const k = sp > MAXV ? MAXV / sp : sp < 100 ? 100 / sp : 1;
  ball.vx *= k; ball.vy *= k;
}

// Top-down, a kick is the rod rotating: the foot swings back, then forward
// past the ball, and the body is foreshortened while it turns.
function kickPose(r) {
  const dir = dirOf(r.team);
  // turned up: the figures lie flat, feet pointing backwards
  if (r.lift > 0) return { foot: `translateX(${-dir * 16}px)`, body: `translateX(${-dir * 6}px) scaleX(0.5)` };
  // catching the ball: the figure gives way a little and comes back
  if (ctl?.r === r && ctl.pull < 1 && r.kick < 0) {
    const a = Math.sin(Math.PI * ctl.pull);
    return { foot: `translateX(${(-dir * 9 * a).toFixed(1)}px)`, body: `translateX(${(-dir * 3 * a).toFixed(1)}px) scaleX(${(1 - 0.15 * a).toFixed(2)})` };
  }
  if (r.kick < 0) return { foot: '', body: '' };
  const t = r.kick;
  let swing, turn;
  if (t < STRIKE) { const p = t / STRIKE; swing = -10 * p; turn = 0.25 * p; }
  else if (t < STRIKE + 0.08) { const p = (t - STRIKE) / 0.08; swing = -10 + 32 * p; turn = 0.25 + 0.2 * p; }
  else { const p = (t - STRIKE - 0.08) / (KICK - STRIKE - 0.08); swing = 22 * (1 - p); turn = 0.45 * (1 - p); }
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
  step(dt);
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
