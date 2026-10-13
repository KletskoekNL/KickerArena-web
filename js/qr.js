// Minimal QR code generator (byte mode, error correction level M, versions 1-6),
// enough for a pairing code or a short URL. Returns an SVG string.

// [total codewords, ec codewords per block, blocks] for level M
const VERSIONS = [null, [26, 10, 1], [44, 16, 1], [70, 26, 1], [100, 18, 2], [134, 24, 2], [172, 16, 4]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];

const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsRemainder(data, n) {
  let gen = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(gen.length + 1).fill(0);
    gen.forEach((g, j) => { next[j] ^= g; next[j + 1] ^= mul(g, EXP[i]); });
    gen = next;
  }
  const rem = new Array(n).fill(0);
  for (const d of data) {
    const f = d ^ rem.shift();
    rem.push(0);
    for (let j = 0; j < n; j++) rem[j] ^= mul(gen[j + 1], f);
  }
  return rem;
}

function codewords(bytes) {
  let v = 1;
  while (v < 6 && (VERSIONS[v][0] - VERSIONS[v][1] * VERSIONS[v][2]) * 8 < 12 + bytes.length * 8) v++;
  const [total, ec, nb] = VERSIONS[v];
  const cap = total - ec * nb;
  if (cap * 8 < 12 + bytes.length * 8) throw new Error('QR: tekst te lang');
  const bits = [];
  const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  put(4, 4); put(bytes.length, 8);
  bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, cap * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let p = 0; data.length < cap; p++) data.push(p % 2 ? 0x11 : 0xec);
  const per = cap / nb; // equal block sizes for all versions in the table
  const blocks = [], ecs = [];
  for (let b = 0; b < nb; b++) { const d = data.slice(b * per, (b + 1) * per); blocks.push(d); ecs.push(rsRemainder(d, ec)); }
  const out = [];
  for (let i = 0; i < per; i++) blocks.forEach((d) => out.push(d[i]));
  for (let i = 0; i < ec; i++) ecs.forEach((e) => out.push(e[i]));
  return { v, out };
}

function build(v, words, mask) {
  const n = 17 + 4 * v;
  const m = Array.from({ length: n }, () => new Array(n).fill(0));
  const fn = Array.from({ length: n }, () => new Array(n).fill(false));
  const set = (x, y, on) => { if (x >= 0 && y >= 0 && x < n && y < n) { m[y][x] = on ? 1 : 0; fn[y][x] = true; } };
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(cx + dx, cy + dy, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(n - 4, 3); finder(3, n - 4);
  for (let i = 0; i < n; i++) { if (!fn[6][i]) set(i, 6, i % 2 === 0); if (!fn[i][6]) set(6, i, i % 2 === 0); }
  const al = ALIGN[v];
  for (const ay of al) for (const ax of al) {
    if ((ax === 6 && ay === 6) || (ax === 6 && ay === n - 7) || (ax === n - 7 && ay === 6)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  // format info (level M = 00)
  const fmtData = (0 << 3) | mask;
  let rem = fmtData;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  const fmt = ((fmtData << 10) | rem) ^ 0x5412;
  const bit = (i) => (fmt >> i) & 1;
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) set(n - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, n - 15 + i, bit(i));
  set(8, n - 8, 1); // dark module
  // data
  const maskFn = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ][mask];
  let k = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j;
      const up = ((right + 1) & 2) === 0;
      const y = up ? n - 1 - vert : vert;
      if (fn[y][x]) continue;
      let b = k < words.length * 8 ? (words[k >> 3] >> (7 - (k & 7))) & 1 : 0;
      k++;
      if (maskFn(x, y)) b ^= 1;
      m[y][x] = b;
    }
  }
  return m;
}

function penalty(m) {
  const n = m.length;
  let p = 0;
  const runs = (get) => {
    for (let a = 0; a < n; a++) {
      let run = 1;
      for (let b = 1; b <= n; b++) {
        if (b < n && get(a, b) === get(a, b - 1)) run++;
        else { if (run >= 5) p += run - 2; run = 1; }
      }
      for (let b = 0; b + 10 < n; b++) {
        const s = Array.from({ length: 11 }, (_, i) => get(a, b + i)).join('');
        if (s === '10111010000' || s === '00001011101') p += 40;
      }
    }
  };
  runs((a, b) => m[a][b]); runs((a, b) => m[b][a]);
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
    const c = m[y][x];
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
  }
  const dark = m.flat().reduce((a, b) => a + b, 0);
  p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
  return p;
}

/** The QR code for text as an SVG (dark modules on white, with quiet zone). */
export function qrSvg(text, size = 220) {
  const { v, out } = codewords([...new TextEncoder().encode(text)]);
  let best, bestP = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const m = build(v, out, mask);
    const p = penalty(m);
    if (p < bestP) { bestP = p; best = m; }
  }
  const n = best.length, q = 4;
  let d = '';
  best.forEach((row, y) => row.forEach((c, x) => { if (c) d += `M${x + q} ${y + q}h1v1h-1z`; }));
  return `<svg class="qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
