// A small MQTT 3.1.1 client over a WebSocket, with just what the bus needs:
// connect with a clean session, subscribe and publish at QoS 1, keep-alive
// and reconnecting. A message that is on its way when the connection drops
// is lost; the layers above repeat what matters.
//
// A broker can have several ways in (the apps first pass the bytes on over
// plain MQTT, see cmd/kickerarena/relay.go): one that does not connect makes
// it try the next one right away; a working one is kept.
const enc = new TextEncoder();
const dec = new TextDecoder();

const KEEPALIVE = 30; // seconds, as announced to the broker
// A lost connection is tried again almost at once, then slower and slower.
const FIRST_WAIT = 300;
const MAX_WAIT = 15000;

function str(s) {
  const b = enc.encode(s);
  return [b.length >> 8, b.length & 255, ...b];
}

function packet(head, ...parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const len = [];
  let x = n;
  do {
    let d = x % 128;
    x = Math.floor(x / 128);
    if (x > 0) d |= 128;
    len.push(d);
  } while (x > 0);
  const out = new Uint8Array(1 + len.length + n);
  out[0] = head;
  out.set(len, 1);
  let o = 1 + len.length;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export class Mqtt {
  /** on: { up(), down(), message(topic, payload) } */
  constructor(url, on) {
    this.urls = [].concat(url);
    this.at = 0; // the way in that is tried now
    this.on = on;
    this.up = false;
    this.topics = new Set();
    this.buf = new Uint8Array(0);
    this.pid = 0;
    this.wait = FIRST_WAIT;
    this.closed = false;
  }

  start() { this.connect(); }

  connect() {
    clearTimeout(this.retry);
    if (this.closed) return;
    let ws;
    try { ws = new WebSocket(this.urls[this.at], 'mqtt'); } catch { this.lost(); return; }
    this.ws = ws;
    ws.binaryType = 'arraybuffer';
    this.buf = new Uint8Array(0);
    this.lastIn = this.born = Date.now();
    // No answer at all within 6 seconds: try again.
    this.giveUp = setTimeout(() => { if (!this.up) this.drop(ws); }, 6000);
    ws.onopen = () => {
      const id = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, '0')).join('');
      ws.send(packet(0x10, str('MQTT'), [4, 0x02, KEEPALIVE >> 8, KEEPALIVE & 255], str(id)));
    };
    ws.onmessage = (ev) => { if (ws === this.ws) this.feed(new Uint8Array(ev.data)); };
    ws.onclose = () => { if (ws === this.ws) this.lost(); };
    // Not getting through at all: on to the next try at once (not every
    // engine reports the close that should follow).
    ws.onerror = () => { if (ws === this.ws && !this.up) this.drop(ws); };
  }

  // Lets go of a connection without waiting for it to close: closing a dead
  // one can take the browser a long time.
  drop(ws = this.ws) {
    if (!ws || ws !== this.ws) return;
    try { ws.close(); } catch { /* gone already */ }
    this.lost();
  }

  lost() {
    const wasUp = this.up;
    clearTimeout(this.giveUp);
    clearTimeout(this.pong);
    clearInterval(this.pinger);
    this.ws = null;
    if (this.up) {
      this.up = false;
      // Only a connection that held for a while earns a quick new try: a
      // broker that keeps hanging up is not to be hammered.
      if (Date.now() - this.born > 10000) this.wait = FIRST_WAIT;
      this.on.down();
    }
    // It did not get through this way: the next one at once. Only after all
    // of them failed it waits a while.
    if (!wasUp && this.urls.length > 1) {
      this.at = (this.at + 1) % this.urls.length;
      if (this.at !== 0 && !this.closed) { this.retry = setTimeout(() => this.connect(), 50); return; }
    }
    this.again();
  }

  again() {
    if (this.closed) return;
    this.retry = setTimeout(() => this.connect(), this.wait * (0.75 + Math.random() / 2));
    this.wait = Math.min(this.wait * 2, MAX_WAIT);
  }

  /** Checks the connection right now, e.g. when the page comes back to the front. */
  kick() {
    if (this.closed) return;
    this.wait = FIRST_WAIT;
    if (!this.ws) this.connect();
    else if (this.up) this.ping();
    else if (Date.now() - this.born > 3000) this.drop(); // hanging while connecting
  }

  // The broker answers a ping right away. No sign of life within 5 seconds:
  // the connection is dead, however open it looks.
  ping() {
    const ws = this.ws;
    const at = Date.now();
    if (!this.raw(new Uint8Array([0xc0, 0]))) { this.drop(ws); return; }
    clearTimeout(this.pong);
    this.pong = setTimeout(() => { if (this.lastIn < at) this.drop(ws); }, 5000);
  }

  close() {
    this.closed = true;
    clearTimeout(this.retry);
    clearTimeout(this.giveUp);
    clearTimeout(this.pong);
    clearInterval(this.pinger);
    const ws = this.ws;
    this.ws = null;
    this.up = false;
    if (ws) {
      try { if (ws.readyState === 1) ws.send(new Uint8Array([0xe0, 0])); } catch { /* closing anyway */ }
      ws.close();
    }
  }

  raw(bytes) {
    try { this.ws.send(bytes); return true; } catch { return false; }
  }

  nextId() {
    this.pid = this.pid % 65535 + 1;
    return [this.pid >> 8, this.pid & 255];
  }

  subscribe(topic) {
    this.topics.add(topic);
    if (this.up) this.raw(packet(0x82, this.nextId(), str(topic), [1]));
  }

  /** Sends one payload; false when there is no connection. */
  publish(topic, payload) {
    if (!this.up) return false;
    return this.raw(packet(0x32, str(topic), this.nextId(), payload));
  }

  // A WebSocket frame holds any part of the MQTT stream: collect the bytes
  // and take out every complete packet.
  feed(bytes) {
    this.lastIn = Date.now();
    if (this.buf.length) {
      const b = new Uint8Array(this.buf.length + bytes.length);
      b.set(this.buf);
      b.set(bytes, this.buf.length);
      this.buf = b;
    } else this.buf = bytes;
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      let len = 0, i = 1, shift = 0;
      for (;;) {
        if (i >= b.length) return;
        const d = b[i++];
        len += (d & 127) << shift;
        shift += 7;
        if (!(d & 128)) break;
        if (shift > 21) { this.drop(); return; }
      }
      if (b.length < i + len) return;
      this.buf = b.subarray(i + len);
      this.handle(b[0], b.subarray(i, i + len));
    }
  }

  handle(head, body) {
    switch (head >> 4) {
      case 2: // CONNACK
        if (body[1] !== 0) { this.drop(); return; }
        clearTimeout(this.giveUp);
        this.up = true;
        for (const t of this.topics) this.raw(packet(0x82, this.nextId(), str(t), [1]));
        this.pinger = setInterval(() => this.ping(), KEEPALIVE * 500);
        this.on.up();
        break;
      case 3: { // PUBLISH
        const qos = (head >> 1) & 3;
        const tl = (body[0] << 8) | body[1];
        const topic = dec.decode(body.subarray(2, 2 + tl));
        let o = 2 + tl;
        if (qos > 0) {
          this.raw(new Uint8Array([0x40, 2, body[o], body[o + 1]]));
          o += 2;
        }
        this.on.message(topic, body.subarray(o));
        break;
      }
      // SUBACK, PUBACK and PINGRESP only show that the broker is alive.
    }
  }
}
