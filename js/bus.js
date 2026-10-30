// The bus in the browser: the same encrypted messages as the apps send
// (see internal/bus in the server's source for the wire format), straight
// from this page to the public MQTT brokers. Used when the page is hosted as
// plain files, without an app or the server's website behind it.
import { Mqtt } from './mqtt.js';

// The brokers of the apps. A browser only gets to a broker through a secure
// WebSocket, so that is the one entrance used here (the Windows and Linux app
// add their own, see appBrokers in link.js).
export const BROKERS = [
  { name: 'test.mosquitto.org', url: 'wss://test.mosquitto.org:8081/mqtt', chunk: 32 << 10 },
  { name: 'mqtt.tyckr.io', url: 'wss://mqtt.tyckr.io:8081/mqtt', chunk: 32 << 10 },
  { name: 'broker.emqx.io', url: 'wss://broker.emqx.io:8084/mqtt', chunk: 32 << 10 },
  { name: 'broker.hivemq.com', url: 'wss://broker.hivemq.com:8884/mqtt', chunk: 32 << 10 },
];

const enc = new TextEncoder();
const dec = new TextDecoder();
const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
export const randomHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));

// ---------------------------------------------------------------- pairing code
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const normalizeCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export function validCode(s) {
  const c = normalizeCode(s);
  return c.length === 12 && [...c].every((ch) => ALPHABET.includes(ch));
}
export function formatCode(s) {
  const c = normalizeCode(s);
  return c.length === 12 ? `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}` : c;
}

async function through(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

export class Bus {
  /** Derives the key and the topic from the pairing code. */
  static async open(code, brokers, onState) {
    const b = new Bus();
    const subtle = crypto.subtle;
    const raw = await subtle.importKey('raw', enc.encode(normalizeCode(code)), 'PBKDF2', false, ['deriveBits']);
    const master = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('KickerArena/v3'), iterations: 100000 }, raw, 256);
    const hk = await subtle.importKey('raw', master, 'HKDF', false, ['deriveBits']);
    const part = (info, n) => subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode(info) }, hk, n * 8);
    b.key = await subtle.importKey('raw', await part('aead', 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
    b.base = hex(new Uint8Array(await part('topic', 10)));
    b.onState = onState || (() => {});
    b.brokers = brokers.map((spec, i) => ({
      spec,
      c: new Mqtt(spec.urls || spec.url, {
        up: () => b.onState(),
        down: () => b.onState(),
        message: (topic, payload) => b.receive(i, topic, payload),
      }),
    }));
    return b;
  }

  constructor() {
    this.subs = new Map();
    this.seen = new Map();
    this.parts = new Map();
    this.chain = Promise.resolve();
  }

  connect() {
    for (const br of this.brokers) br.c.start();
    this.cleaner = setInterval(() => this.clean(), 60000);
  }

  close() {
    clearInterval(this.cleaner);
    for (const br of this.brokers) br.c.close();
  }

  kick() { for (const br of this.brokers) br.c.kick(); }

  status() { return this.brokers.map((br) => ({ name: br.spec.name, up: br.c.up })); }
  online() { return this.brokers.some((br) => br.c.up); }

  /** Registers the handler for a topic (relative to the base). */
  subscribe(topic, fn) {
    const full = `${this.base}/${topic}`;
    this.subs.set(full, fn);
    for (const br of this.brokers) br.c.subscribe(full);
  }

  /** Encrypts the message once and sends it through every connected broker. */
  async publish(topic, m) { (await this.seal(topic, m))(); }

  /**
   * Encrypts a message for later: the function it gives sends it at once,
   * for the moment the page is closed and there is no time left to wait.
   */
  async seal(topic, m) {
    const id = crypto.getRandomValues(new Uint8Array(8));
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const z = await through(enc.encode(JSON.stringify(m)), new CompressionStream('gzip'));
    const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: id }, this.key, z));
    const whole = new Uint8Array(12 + sealed.length);
    whole.set(nonce);
    whole.set(sealed, 12);
    return () => {
      for (const br of this.brokers) {
        for (const f of frames(id, whole, br.spec.chunk)) br.c.publish(`${this.base}/${topic}`, f);
      }
    };
  }

  // Decrypting takes a moment; the chain keeps the messages in the order
  // they came in.
  receive(broker, topic, payload) {
    const p = payload.slice(); // the buffer it points into is reused
    this.chain = this.chain.then(() => this.handle(broker, topic, p)).catch(() => {});
  }

  async handle(broker, topic, p) {
    if (p.length < 15 || p[0] !== 0x4b || p[1] !== 0x41 || p[2] !== 2) return;
    const id = p.subarray(3, 11);
    const key = hex(id);
    const idx = (p[11] << 8) | p[12];
    const n = (p[13] << 8) | p[14];
    const piece = p.subarray(15);
    if (this.seen.has(key) || n === 0 || idx >= n || n > 4096) return;
    let whole = piece;
    if (n > 1) {
      const pk = `${broker}:${key}`;
      let pt = this.parts.get(pk);
      if (!pt) {
        // Someone floods the (public) topic with junk: don't let it eat memory.
        if (this.parts.size >= 256) return;
        pt = { pieces: new Array(n).fill(null), have: 0, size: 0, at: Date.now() };
        this.parts.set(pk, pt);
      }
      if (pt.pieces.length !== n || pt.pieces[idx]) return;
      pt.pieces[idx] = piece;
      pt.size += piece.length;
      if (++pt.have < n) return;
      this.parts.delete(pk);
      whole = new Uint8Array(pt.size);
      let o = 0;
      for (const x of pt.pieces) { whole.set(x, o); o += x.length; }
    }
    if (whole.length < 12 + 16) return;
    let m;
    try {
      const z = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: whole.subarray(0, 12), additionalData: id }, this.key, whole.subarray(12));
      m = JSON.parse(dec.decode(await through(z, new DecompressionStream('gzip'))));
    } catch { return; } // not ours, or tampered with
    if (this.seen.has(key)) return;
    this.seen.set(key, Date.now());
    this.subs.get(topic)?.(m);
  }

  clean() {
    const now = Date.now();
    for (const [k, t] of this.seen) if (now - t > 20 * 60000) this.seen.delete(k);
    for (const [k, p] of this.parts) if (now - p.at > 3 * 60000) this.parts.delete(k);
  }
}

// Splits an encrypted message into MQTT payloads of at most chunk bytes:
// "KA" | version 2 | id (8) | part index (u16) | part count (u16) | piece
function frames(id, whole, chunk) {
  const size = chunk - 15;
  const n = Math.ceil(whole.length / size);
  const out = [];
  for (let i = 0; i < n; i++) {
    const piece = whole.subarray(i * size, Math.min((i + 1) * size, whole.length));
    const f = new Uint8Array(15 + piece.length);
    f.set([0x4b, 0x41, 2]);
    f.set(id, 3);
    f.set([i >> 8, i & 255, n >> 8, n & 255], 11);
    f.set(piece, 15);
    out.push(f);
  }
  return out;
}
