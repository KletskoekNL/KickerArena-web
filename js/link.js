import { Bus, BROKERS, randomHex, lanKey } from './bus.js';

// Link for the server's website on the local network: the server itself
// sends the ordered updates over an event stream and takes the commands.
// An app uses it too when it reaches the server straight (see AppLink).
export class LocalLink extends EventTarget {
  /**
   * web: running as the server's website (it can restart and hand out a new token).
   * far: an app's page, on another origin: { base, key, kind } (see AppLink).
   */
  constructor(token, web = false, far = null) {
    super();
    this.token = token;
    this.web = web;
    this.far = far;
    // One session per page, so the server knows who is online in which browser.
    this.sid = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, '0')).join('');
    this.status = { server: 'offline', brokers: [] };
  }

  start() {
    const who = this.far ? `key=${this.far.key}&kind=${encodeURIComponent(this.far.kind)}` : `token=${encodeURIComponent(this.token)}`;
    this.es = new EventSource(`${this.far?.base || ''}/native/events?${who}&sid=${this.sid}`);
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

  stop() { this.es?.close(); }

  async post(path, body) {
    const auth = this.far ? { 'X-Pair-Key': this.far.key } : { 'X-Native-Token': this.token };
    const r = await fetch((this.far?.base || '') + path, { method: 'POST', headers: { ...auth, 'X-Session': this.sid, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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

// The brokers for the Windows and Linux app: first through the app, which
// passes the bytes on over plain MQTT (with TLS, else without), because the
// ports for WebSockets are closed more often; then straight from the page.
export function appBrokers(token) {
  const via = (b, how) => `ws://${location.host}/native/mqtt?broker=${encodeURIComponent(b.name)}&via=${how}&token=${encodeURIComponent(token)}`;
  return BROKERS.map((b) => ({ ...b, urls: [via(b, 'tls'), via(b, 'tcp'), b.url] }));
}

// Link that is the client itself and talks to the server through the MQTT
// brokers: in the web app, and in the Windows and Linux app (the counterpart
// of internal/client in the server's source). Broadcasts carry a number; they
// are applied in order, and a fresh snapshot is asked for when one is missing.
export class BusLink extends EventTarget {
  /** kind: which app this is ("windows", "linux"), shown in the admin app; "" = the web app. */
  constructor(code, brokers = BROKERS, kind = '') {
    super();
    this.code = code;
    this.brokers = brokers;
    this.kind = kind;
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
    if (this.bus || this.opening) return;
    this.stopped = false;
    this.opening = true;
    let bus;
    try { bus = await Bus.open(this.code, this.brokers, () => this.brokersChanged()); } finally { this.opening = false; }
    if (this.stopped) return; // stopped while the key was being made
    this.bus = bus;
    if (this.useful !== undefined) bus.useOnly(this.useful);
    bus.subscribe('s', (m) => this.onBroadcast(m));
    bus.subscribe(`u/${this.cid}`, (m) => this.onDirect(m));
    bus.connect();
    this.timer = setInterval(() => this.tick(), 1000);
    this.prepareBye();
    if (this.listening) return;
    this.listening = true;
    if (typeof document !== 'undefined') {
      // A phone cuts the connections of a page in the background: look at
      // them the moment the page is in front again.
      document.addEventListener('visibilitychange', () => { if (!document.hidden) { this.bus?.kick(); this.tick(); } });
      // The device has a network again (wifi back, out of the tunnel).
      addEventListener('online', () => this.bus?.kick());
      addEventListener('pagehide', () => this.bye());
    }
  }

  /** Says goodbye and lets go of the brokers; start connects again. */
  stop() {
    this.stopped = true;
    this.bye();
    clearInterval(this.timer);
    this.bus?.close();
    this.bus = null;
    this.farewell = null;
    this.synced = false;
    this.status = { server: 'offline', brokers: this.brokers.map((b) => ({ name: b.name, up: false })) };
  }

  // Leaving has to be said at once, so the message is made ahead of time.
  // Each one can be sent only once: the server drops a message it saw before.
  prepareBye() {
    if (!this.bus) return;
    this.bus.seal('c', { k: 'bye', f: this.cid }).then((go) => { this.farewell = go; }).catch(() => {});
  }

  bye() {
    if (!this.farewell) return;
    this.farewell();
    this.farewell = null;
    this.prepareBye(); // the page may come back (the browser's back button)
  }

  /** The brokers the server is on (from its state): the page stays on two of those. */
  useBrokers(names) { this.useful = names; this.bus?.useOnly(names); }

  send(kind, d) {
    if (!this.bus) return;
    // v is always set: a server of before 1.9.3 takes a sender without it for one that can only be reached slowly
    this.bus.publish('c', { k: kind, f: this.cid, b: this.boot || undefined, d, v: true }).catch(() => {});
  }

  // What hello and ping say about this client: who uses it, which app it is,
  // and for the web app where it is hosted (so the server can show others the way).
  who() {
    if (this.kind) return { pid: this.pid, kind: this.kind };
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

// Link of the apps (Windows, Linux, Android): through the brokers, or, when
// the server is on the same network, straight to its website (LocalLink),
// which is quicker and costs no MQTT at all. The server's addresses come
// with its state (webUrls); the last one that worked is tried first at the
// next start. When the straight link breaks (the phone left the office),
// the brokers take over within seconds.
const LAN_TRY = 2000; // ms an address may take to answer
const LAN_AGAIN = 5 * 60000; // on the brokers: look for the server on the network this often
const LAN_LOST = 6000; // straight link down this long: back to the brokers
const LAST_LAN = 'ka.lan';

export class AppLink extends EventTarget {
  constructor(code, brokers, kind) {
    super();
    this.code = code;
    this.kind = kind;
    this.mode = '';
    this.pid = '';
    this.urls = [];
    this.lastTry = 0;
    this.status = { server: 'offline', brokers: [] };
    this.bus = new BusLink(code, brokers, kind);
    this.bus.addEventListener('status', (e) => { if (this.mode === 'bus') this.setStatus(e.detail); });
    this.bus.addEventListener('msg', (e) => {
      if (this.mode !== 'bus') return;
      if (e.detail.t === 'state') this.found(e.detail.d?.webUrls);
      this.dispatchEvent(new CustomEvent('msg', { detail: e.detail }));
    });
  }

  setStatus(st) {
    this.status = st;
    this.dispatchEvent(new CustomEvent('status', { detail: st }));
  }

  async start() {
    if (!this.code) return; // not paired yet
    if (!globalThis.crypto?.subtle) { this.mode = 'bus'; return this.bus.start(); }
    this.key = await lanKey(this.code);
    let last = '';
    try { last = localStorage.getItem(LAST_LAN) || ''; } catch { /* not remembered */ }
    if (!(last && await this.tryLan([last]))) this.toBus();
    if (typeof document !== 'undefined') {
      addEventListener('online', () => { if (this.mode === 'bus') this.tryLan(this.urls); });
      setInterval(() => { if (this.mode === 'bus' && Date.now() - this.lastTry > LAN_AGAIN) this.tryLan(this.urls); }, 30000);
    }
  }

  // The state names the server's addresses: look for it there when they are new.
  found(urls) {
    const list = (urls || []).filter((u) => /^https?:\/\//.test(u));
    const fresh = list.join() !== this.urls.join();
    this.urls = list;
    if (fresh && this.mode === 'bus') this.tryLan(list);
  }

  /** Tries the addresses at once; true when it switched to the first one that answered. */
  async tryLan(urls) {
    if (!urls.length || this.trying || !this.key) return false;
    this.trying = true;
    this.lastTry = Date.now();
    try {
      const base = await Promise.any(urls.map(async (u) => {
        const r = await fetch(`${u}/native/hello?key=${this.key}`, { cache: 'no-store', signal: AbortSignal.timeout(LAN_TRY) });
        if (!r.ok || !(await r.json()).ok) throw new Error('not this one');
        return u;
      }));
      this.toLan(base);
      return true;
    } catch {
      return false;
    } finally {
      this.trying = false;
    }
  }

  toLan(base) {
    if (this.asleep) return;
    try { localStorage.setItem(LAST_LAN, base); } catch { /* not remembered */ }
    if (this.mode === 'lan' && this.lan?.far.base === base) return;
    this.lan?.stop();
    this.bus.stop();
    this.mode = 'lan';
    this.setStatus({ server: 'syncing', brokers: [], direct: base });
    const lan = new LocalLink('', false, { base, key: this.key, kind: this.kind });
    this.lan = lan;
    lan.addEventListener('status', (e) => {
      if (this.lan !== lan) return;
      const ok = e.detail.server === 'ok';
      // EventSource tries again by itself (and reports each failed try);
      // when it is not back in time, the brokers take over.
      if (ok) { clearTimeout(this.lostTimer); this.lostTimer = 0; }
      else if (!this.lostTimer) this.lostTimer = setTimeout(() => { this.lostTimer = 0; if (this.lan === lan) this.toBus(); }, LAN_LOST);
      this.setStatus({ server: ok ? 'ok' : 'syncing', brokers: [], direct: base });
    });
    lan.addEventListener('msg', (e) => { if (this.lan === lan) this.dispatchEvent(new CustomEvent('msg', { detail: e.detail })); });
    lan.start();
  }

  toBus() {
    clearTimeout(this.lostTimer);
    this.lostTimer = 0;
    this.lan?.stop();
    this.lan = null;
    if (this.mode === 'bus') return;
    this.mode = 'bus';
    this.urls = []; // the next state says where the server is: look there once more
    this.setStatus({ server: 'syncing', brokers: [] });
    this.lastTry = Date.now();
    this.bus.start();
  }

  /** The app goes out of sight (Android): no connection kept open meanwhile. */
  sleep() {
    if (this.asleep) return;
    this.asleep = true;
    clearTimeout(this.lostTimer);
    this.lostTimer = 0;
    this.lan?.stop();
    this.lan = null;
    this.bus.stop();
    this.mode = '';
    this.setStatus({ server: 'offline', brokers: [] });
  }

  /** Back in front: the network first (the phone may have come to the office), else the brokers. */
  async wake() {
    if (!this.asleep) return;
    this.asleep = false;
    let last = '';
    try { last = localStorage.getItem(LAST_LAN) || ''; } catch { /* not remembered */ }
    const urls = [...new Set([last, ...this.urls].filter(Boolean))];
    if (!(await this.tryLan(urls)) && !this.asleep && this.mode !== 'lan') this.toBus();
  }

  useBrokers(names) { this.bus.useBrokers(names); }

  cmd(op, a) { return this.mode === 'lan' ? this.lan.cmd(op, a) : this.bus.cmd(op, a); }

  me(pid) {
    this.pid = pid;
    if (this.mode === 'lan') this.lan.me(pid);
    else this.bus.me(pid);
  }

  bye() {
    if (this.mode === 'lan') this.lan.stop();
    else this.bus.bye();
  }
}
