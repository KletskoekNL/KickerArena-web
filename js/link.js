import { Bus, BROKERS, randomHex } from './bus.js';

// Link to the KickerArena client process on this PC. That process talks to
// the server through the MQTT brokers; here we only see ordered updates.
export class LocalLink extends EventTarget {
  /** web: running as the server's website (it can restart and hand out a new token). */
  constructor(token, web = false) {
    super();
    this.token = token;
    this.web = web;
    // One session per page, so the server knows who is online in which browser.
    this.sid = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, '0')).join('');
    this.status = { server: 'offline', brokers: [] };
  }

  start() {
    this.es = new EventSource(`/native/events?token=${encodeURIComponent(this.token)}&sid=${this.sid}`);
    this.es.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'status') {
        this.status = m.d;
        this.dispatchEvent(new CustomEvent('status', { detail: m.d }));
      } else {
        this.dispatchEvent(new CustomEvent('msg', { detail: m }));
      }
    };
    // Connection lost: EventSource retries by itself. When it gives up (the
    // server restarted and no longer knows this page's token), wait until the
    // server answers again and reload: that also picks up a new version.
    this.es.onerror = () => {
      this.status = { server: 'offline', brokers: [] };
      this.dispatchEvent(new CustomEvent('status', { detail: this.status }));
      if (this.web && this.es.readyState === EventSource.CLOSED) this.waitAndReload();
    };
  }

  waitAndReload() {
    if (this.reloading) return;
    this.reloading = true;
    const poll = async () => {
      try {
        const r = await fetch(location.pathname, { cache: 'no-store' });
        if (r.ok) { location.reload(); return; }
      } catch { /* not back yet */ }
      setTimeout(poll, 3000);
    };
    setTimeout(poll, 1500);
  }

  async post(path, body) {
    const r = await fetch(path, { method: 'POST', headers: { 'X-Native-Token': this.token, 'X-Session': this.sid, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.headers.get('Content-Type')?.includes('json') ? r.json() : null;
  }

  async cmd(op, a = {}) {
    let res;
    try { res = await this.post('/native/cmd', { op, a }); } catch { throw new Error('KickerArena reageert niet'); }
    if (!res?.ok) throw new Error(res?.err || 'Er ging iets mis');
    return res.v;
  }

  me(pid) { this.post('/native/me', { pid }).catch(() => {}); }
}

// Link for a page that is hosted as plain files: the page itself is the
// client and talks to the server through the MQTT brokers (the counterpart of
// internal/client in the server's source). Broadcasts carry a number; they
// are applied in order, and a fresh snapshot is asked for when one is missing.
export class BusLink extends EventTarget {
  constructor(code, brokers = BROKERS) {
    super();
    this.code = code;
    this.brokers = brokers;
    this.cid = randomHex(8);
    this.pid = '';
    this.seq = 0;
    this.pending = new Map();
    this.waiting = new Map(); // commands without an answer yet: how to send each again
    this.status = { server: 'offline', brokers: brokers.map((b) => ({ name: b.name, up: false })) };
    this.boot = '';
    this.synced = false;
    this.next = 0;
    this.known = 0;
    this.buf = new Map();
    this.gapSince = 0;
    this.lastServer = 0;
    this.lastHello = 0;
    this.lastPing = Date.now();
  }

  async start() {
    if (!this.code) return; // not paired yet
    if (!globalThis.crypto?.subtle) {
      // Not over https: the browser does not offer the encryption.
      this.status = { ...this.status, insecure: true };
      this.dispatchEvent(new CustomEvent('status', { detail: this.status }));
      return;
    }
    const bus = await Bus.open(this.code, this.brokers, () => this.brokersChanged());
    this.bus = bus;
    bus.subscribe('s', (m) => this.onBroadcast(m));
    bus.subscribe(`u/${this.cid}`, (m) => this.onDirect(m));
    bus.connect();
    this.timer = setInterval(() => this.tick(), 1000);
    if (typeof document !== 'undefined') {
      // A phone cuts the connections of a page in the background: look at
      // them the moment the page is in front again.
      document.addEventListener('visibilitychange', () => { if (!document.hidden) { this.bus?.kick(); this.tick(); } });
      // The device has a network again (wifi back, out of the tunnel).
      addEventListener('online', () => this.bus?.kick());
      addEventListener('pagehide', () => this.bye());
    }
    this.prepareBye();
  }

  // Leaving has to be said at once, so the message is made ahead of time.
  // Each one can be sent only once: the server drops a message it saw before.
  prepareBye() {
    this.bus.seal('c', { k: 'bye', f: this.cid }).then((go) => { this.farewell = go; }).catch(() => {});
  }

  bye() {
    if (!this.farewell) return;
    this.farewell();
    this.farewell = null;
    this.prepareBye(); // the page may come back (the browser's back button)
  }

  send(kind, d) {
    if (!this.bus) return;
    // v is always set: a server of before 1.9.3 takes a sender without it for one that can only be reached slowly
    this.bus.publish('c', { k: kind, f: this.cid, b: this.boot || undefined, d, v: true }).catch(() => {});
  }

  // What hello and ping say about this client: who uses it, that it is the
  // web app, and where it is hosted (so the server can show others the way).
  who() {
    const w = { pid: this.pid, kind: 'webapp' };
    if (typeof location !== 'undefined' && location.protocol === 'https:') w.url = location.origin + location.pathname;
    return w;
  }

  me(pid) {
    this.pid = pid;
    this.send('ping', this.who());
  }

  tick() {
    if (!this.bus) return;
    const now = Date.now();
    const online = this.bus.online();
    // Missing broadcast that no broker delivered within 3s: resync.
    if (this.synced && (this.buf.size > 0 || this.known >= this.next)) {
      if (!this.gapSince) this.gapSince = now;
      else if (now - this.gapSince > 3000) this.synced = false;
    } else this.gapSince = 0;
    if (this.synced && now - this.lastServer > 70000) this.synced = false; // server silent: it may have restarted elsewhere
    this.updateStatus();
    if (online && !this.synced && now - this.lastHello > 4000) {
      this.lastHello = now;
      this.send('hello', this.who());
    }
    if (online && now - this.lastPing > 60000) {
      this.lastPing = now;
      this.send('ping', this.who());
    }
  }

  updateStatus(always = false) {
    const st = this.synced ? 'ok' : this.bus.online() ? 'syncing' : 'offline';
    if (st === this.status.server && !always) return;
    this.status = { server: st, brokers: this.bus.status() };
    this.dispatchEvent(new CustomEvent('status', { detail: this.status }));
  }

  // A broker connected or dropped: the server hears about it right away.
  brokersChanged() {
    const online = this.bus.online();
    if (online && this.cut && this.synced) {
      // Back after being cut off completely: what was missed is unknown, and
      // waiting for the next heartbeat to find out takes long. Ask for it all.
      this.synced = false;
      this.lastHello = 0;
    }
    this.cut = !online;
    this.updateStatus(true);
    if (!online) return;
    if (this.synced) this.send('ping', this.who());
    else this.tick();
    for (const resend of this.waiting.values()) resend(); // commands that were on their way
  }

  onDirect(m) {
    if (m.k === 'ack') {
      const done = this.pending.get(m.d?.id);
      if (done) done(m.d);
      return;
    }
    if (m.k !== 'snap' || !Array.isArray(m.d)) return;
    const rev = m.r || 0;
    const boot = m.b || '';
    if (this.synced && boot === this.boot && rev < this.next - 1) return; // an old snapshot that arrived late
    this.boot = boot;
    this.next = rev + 1;
    this.known = rev;
    this.synced = true;
    this.lastServer = Date.now();
    this.gapSince = 0;
    this.apply(m.d);
    for (const r of this.buf.keys()) if (r < this.next) this.buf.delete(r);
    this.drain();
    this.updateStatus();
  }

  onBroadcast(m) {
    const rev = m.r || 0;
    const boot = m.b || '';
    this.lastServer = Date.now();
    if (boot !== this.boot && this.boot && (this.synced || this.known > 0)) {
      // The server restarted: forget the old numbering, get a fresh snapshot.
      this.synced = false;
      this.known = 0;
      this.buf.clear();
    }
    if (rev > this.known && boot === this.boot) this.known = rev;
    if (m.k === 'hb') { this.updateStatus(); return; }
    if (m.k !== 'multi') return;
    if (!this.synced) {
      if (boot === this.boot || !this.boot) this.buf.set(rev, m); // keep it: the snapshot may be older
      return;
    }
    if (rev < this.next) return;
    this.buf.set(rev, m);
    this.drain();
  }

  drain() {
    for (let m; (m = this.buf.get(this.next)); ) {
      this.buf.delete(this.next);
      this.next++;
      if (Array.isArray(m.d)) this.apply(m.d);
    }
  }

  apply(items) {
    for (const it of items) this.dispatchEvent(new CustomEvent('msg', { detail: { t: it.k, d: it.d } }));
  }

  /**
   * Sends a command and waits for the server's answer. The message is
   * repeated a few times in case every broker lost it; the server runs each
   * command id only once.
   */
  async cmd(op, a = {}) {
    // Just back from a gap: the fresh snapshot is moments away, so don't
    // turn the user down for tapping a little early.
    for (let i = 0; !this.synced && this.bus?.online() && i < 40; i++) await new Promise((r) => setTimeout(r, 100));
    if (!this.synced) throw new Error('geen verbinding met de server');
    const id = ++this.seq; // unique per client id, and that is new on every page load
    const msg = { id, op, a, pid: this.pid };
    const ack = await new Promise((resolve, reject) => {
      const started = Date.now();
      let attempt = 0;
      let timer = 0;
      const again = () => {
        const left = 15000 - (Date.now() - started);
        if (left <= 0) {
          this.pending.delete(id);
          this.waiting.delete(id);
          this.synced = false; // something is off: fetch a fresh snapshot
          reject(new Error('de server reageert niet'));
          return;
        }
        this.send('cmd', msg);
        timer = setTimeout(again, Math.min((3 + attempt++ * 2) * 1000, left));
      };
      this.pending.set(id, (d) => { clearTimeout(timer); this.pending.delete(id); this.waiting.delete(id); resolve(d); });
      this.waiting.set(id, () => this.send('cmd', msg));
      again();
    });
    if (ack.stale) this.synced = false; // the server restarted: fetch a fresh snapshot
    if (!ack.ok) throw new Error(ack.err || 'Er ging iets mis');
    return ack.v;
  }
}
