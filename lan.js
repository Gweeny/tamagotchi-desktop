// Réseau local, sans serveur : module Node pur (aucune dépendance Electron), testable seul.
//  - Découverte : chaque app annonce { id, pseudo, port, version } en UDP toutes les 2 s, et écoute les annonces des autres.
//    L'annonce part sur CHAQUE carte réseau (adresse de broadcast du réseau local, ex. 192.168.1.255),
//    car avec plusieurs cartes (Bluetooth, Wi-Fi Direct, VPN…) Windows envoie 255.255.255.255 sur une seule.
//    Quand on reçoit l'annonce d'un ami, on lui répond directement : il suffit qu'un sens passe.
//    Chaque app se présente aussi en HTTP (/_hello) aux amis qu'elle connaît : si l'UDP ne passe que
//    dans un sens (pare-feu, box), les deux apps se voient quand même.
//    En secours, on peut ajouter un ami par son adresse IP : on lui envoie alors l'annonce en direct.
//    Un ami disparaît de la liste après 7 s sans nouvelles.
//  - Messages : chaque app a un petit serveur HTTP ; on lui envoie des POST JSON
//    (/travel, /care, /status, /return, /recall). Les réponses sont en JSON.
//  - Boîte aux lettres : si on n'arrive pas à se connecter chez un ami (son pare-feu bloque l'entrée),
//    le message attend chez nous ; l'ami vient le chercher (/_poll, connexion qui reste ouverte jusqu'à 20 s)
//    et renvoie la réponse (/_answer). Il suffit donc qu'UN des deux PC accepte les connexions.
// Tout ce qui arrive du réseau est vérifié (taille, forme) avant d'être utilisé.

const dgram = require('dgram');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const APP = 'tamagotchi-desktop';
const PROTO = 1;
const MAX_BODY = 16 * 1024;
const MAX_ANNOUNCE = 512;
const POLL_MS = 20000;            // une relève de courrier reste ouverte au plus 20 s
const ROUTES = ['travel', 'care', 'status', 'return', 'recall'];
const INTERNAL = ['_hello', '_poll', '_answer'];
const VER_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

const isStr = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const isIPv4 = (s) => typeof s === 'string' && IPV4.test(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Adresses IPv4 de ce PC sur un vrai réseau (sans les adresses automatiques 169.254.x.x ni la boucle locale)
function localNetworks() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      const ip = a.address.split('.').map(Number), mask = a.netmask.split('.').map(Number);
      out.push({ name, address: a.address, broadcast: ip.map((b, i) => (b | (~mask[i] & 255))).join('.') });
    }
  }
  return out;
}

class Lan extends EventEmitter {
  constructor({ id, nick, ver = '', udpPort = 41234, httpPort = 0, announceMs = 2000, expireMs = 7000, broadcast = '255.255.255.255' }) {
    super();
    this.id = id; this.nick = nick; this.ver = ver;
    this.udpPort = udpPort; this.httpPort = httpPort;
    this.announceMs = announceMs; this.expireMs = expireMs; this.broadcast = broadcast;
    this.handlers = {};            // route -> async (body, peer) => réponse
    this.peerMap = new Map();      // id -> { id, nick, ver, address, port, lastSeen, lastReply }
    this.manual = new Set();       // adresses IP d'amis ajoutées à la main
    this.timers = [];
    this.outbox = new Map();       // id d'ami -> messages qui l'attendent [{ mid, route, body }]
    this.pending = new Map();      // mid -> { peerId, resolve, timer } : réponse attendue
    this.waiting = new Map();      // id d'ami -> { reply, timer } : sa relève de courrier en cours
    this.lastPoll = new Map();     // id d'ami -> dernière fois qu'il est venu relever son courrier
    this.polling = new Set();      // amis chez qui on relève notre courrier
    this.test = { blockDial: new Set(), noUdpIn: false }; // (tests) simuler un pare-feu
  }

  // Démarre le serveur HTTP puis la découverte
  async start() {
    this.stopped = false;
    this.server = http.createServer((req, res) => this._onHttp(req, res));
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.httpPort, '0.0.0.0', resolve);
    });
    this.port = this.server.address().port;

    this.udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.udp.on('message', (msg, rinfo) => this._onAnnounce(msg, rinfo));
    await new Promise((resolve, reject) => {
      this.udp.once('error', reject);
      this.udp.bind(this.udpPort, () => { this.udp.removeListener('error', reject); resolve(); });
    });
    this.udp.on('error', (e) => this.emit('error', e));
    this.udp.setBroadcast(true);

    this.announce();
    this.timers.push(setInterval(() => this.announce(), this.announceMs));
    this.timers.push(setInterval(() => this._expire(), 1000));
  }

  stop() {
    this.stopped = true;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    for (const w of this.waiting.values()) { clearTimeout(w.timer); w.reply(200, { msgs: [] }); }
    this.waiting.clear();
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.resolve(null); }
    this.pending.clear();
    this.outbox.clear();
    this.polling.clear();
    if (this.udp) { try { this.udp.close(); } catch {} this.udp = null; }
    if (this.server) {
      this.server.close();
      if (this.server.closeAllConnections) this.server.closeAllConnections();
      this.server = null;
    }
  }

  setNick(nick) { this.nick = nick; this.announce(); }

  // Adresses où envoyer l'annonce : broadcast de chaque carte réseau, broadcast général, amis ajoutés à la main
  targets() {
    const set = new Set([this.broadcast]);
    if (this.broadcast === '255.255.255.255') for (const n of localNetworks()) set.add(n.broadcast);
    for (const ip of this.manual) set.add(ip);
    return [...set];
  }

  _message(reply = false) {
    return Buffer.from(JSON.stringify({ app: APP, v: PROTO, id: this.id, nick: this.nick, port: this.port, ver: this.ver, ...(reply ? { r: 1 } : {}) }));
  }

  announce() {
    if (!this.udp || !this.nick) return;
    const msg = this._message();
    for (const addr of this.targets()) this.udp.send(msg, this.udpPort, addr, () => {});
    // On se présente aussi en HTTP à chaque ami connu (au cas où notre UDP ne lui parviendrait pas)
    for (const p of this.peerMap.values()) this._hello(p);
  }

  // Ajoute un ami par son adresse IP (secours quand le broadcast ne passe pas)
  addManual(ip) {
    if (!isIPv4(ip)) return false;
    this.manual.add(ip);
    this.announce();
    return true;
  }
  removeManual(ip) { this.manual.delete(ip); }

  // Mes adresses sur le réseau local (à donner à un ami)
  addresses() { return localNetworks().map(n => n.address); }

  peers() { return [...this.peerMap.values()].map(({ id, nick, ver }) => ({ id, nick, ver })); }
  peer(id) { return this.peerMap.get(id) || null; }

  _validPeerMsg(m) {
    return !!m && m.id !== this.id && isStr(m.id, 64) && isStr(m.nick, 20) && Number.isInteger(m.port) && m.port >= 1 && m.port <= 65535;
  }

  // Un ami donne de ses nouvelles (annonce UDP ou présentation HTTP) : on le note
  _seen(m, address) {
    const known = this.peerMap.get(m.id);
    const ver = typeof m.ver === 'string' && VER_RE.test(m.ver) ? m.ver : (known ? known.ver : '');
    const changed = !known || known.nick !== m.nick || known.port !== m.port || known.address !== address || known.ver !== ver;
    const entry = { id: m.id, nick: m.nick, ver, address, port: m.port, lastSeen: Date.now(), lastReply: known ? known.lastReply : 0 };
    this.peerMap.set(m.id, entry);
    if (!known) this._startPolling(m.id);
    if (changed) this.emit('peers', this.peers());
    return entry;
  }

  _onAnnounce(buf, rinfo) {
    if (this.test.noUdpIn || buf.length > MAX_ANNOUNCE) return;
    let m;
    try { m = JSON.parse(buf.toString('utf8')); } catch { return; }
    if (!m || m.app !== APP || m.v !== PROTO || !this._validPeerMsg(m)) return;
    const entry = this._seen(m, rinfo.address);
    // On lui répond directement (au plus une fois par période) : il suffit qu'un sens passe.
    // Jamais de réponse à une réponse (sinon ça ping-pongerait sans fin).
    if (!m.r && this.udp && this.nick && Date.now() - entry.lastReply >= this.announceMs) {
      entry.lastReply = Date.now();
      this.udp.send(this._message(true), this.udpPort, rinfo.address, () => {});
    }
  }

  _expire() {
    let changed = false;
    for (const [id, p] of this.peerMap) {
      if (Date.now() - p.lastSeen <= this.expireMs) continue;
      this.peerMap.delete(id); changed = true;
      this.polling.delete(id); this.outbox.delete(id); this.lastPoll.delete(id);
      this.emit('peer-lost', id);
    }
    if (changed) this.emit('peers', this.peers());
  }

  // Requête HTTP vers un ami. Renvoie { ok, data, connected } (connected : on a pu le joindre)
  _post(p, path, obj, timeoutMs, maxBody = MAX_BODY) {
    if (this.test.blockDial.has(p.id) || this.test.blockDial.has('*')) return Promise.resolve({ ok: false, connected: false });
    const data = Buffer.from(JSON.stringify({ ...obj, from: { id: this.id, nick: this.nick } }));
    return new Promise((resolve) => {
      let connected = false, done = false;
      const finish = (r) => { if (!done) { done = true; resolve(r); } };
      const req = http.request({
        host: p.address, port: p.port, path, method: 'POST', timeout: timeoutMs,
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
      }, (res) => {
        let size = 0; const chunks = [];
        res.on('data', (c) => { size += c.length; if (size <= maxBody) chunks.push(c); });
        res.on('end', () => {
          if (size > maxBody) return finish({ ok: false, connected: true });
          try { finish({ ok: true, connected: true, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
          catch { finish({ ok: false, connected: true }); }
        });
        res.on('error', () => finish({ ok: false, connected: true }));
      });
      req.on('socket', (sock) => {
        if (!sock.connecting) connected = true;
        else sock.once('connect', () => { connected = true; });
      });
      req.on('timeout', () => req.destroy());
      req.on('error', () => finish({ ok: false, connected }));
      req.end(data);
    });
  }

  async _hello(p) {
    if (this.stopped || !this.nick) return;
    const r = await this._post(p, '/_hello', { port: this.port, ver: this.ver }, 3000);
    const m = r.ok && r.data;
    const q = this.peerMap.get(p.id);
    if (m && m.ok && m.id === p.id && q) q.lastSeen = Date.now();
  }

  // On relève notre courrier chez un ami, tant qu'il est dans la liste
  _startPolling(id) {
    if (this.polling.has(id) || this.stopped) return;
    this.polling.add(id);
    (async () => {
      while (this.polling.has(id) && !this.stopped) {
        const p = this.peerMap.get(id);
        if (!p) break;
        const r = await this._post(p, '/_poll', {}, POLL_MS + 5000, MAX_BODY * 8);
        if (this.stopped) break;
        const msgs = r.ok && r.data && Array.isArray(r.data.msgs) ? r.data.msgs.slice(0, 20) : null;
        if (!msgs) { await sleep(3000); continue; }
        const q = this.peerMap.get(id);
        if (q) q.lastSeen = Date.now();
        for (const m of msgs) this._deliver(id, m);
      }
      this.polling.delete(id);
    })();
  }

  // Un message arrivé par la boîte aux lettres : traité comme s'il était arrivé directement
  async _deliver(peerId, m) {
    const p = this.peerMap.get(peerId);
    if (!p || !m || !isStr(m.mid, 64) || !ROUTES.includes(m.route) || !m.body || typeof m.body !== 'object') return;
    const from = { id: p.id, nick: p.nick };
    let result = { ok: false };
    try { if (this.handlers[m.route]) result = (await this.handlers[m.route]({ ...m.body, from }, from)) || { ok: false }; }
    catch (e) { this.emit('error', e); }
    const q = this.peerMap.get(peerId);
    if (q) await this._post(q, '/_answer', { mid: m.mid, result }, 3000);
  }

  // Envoie un message à un ami ; renvoie sa réponse, ou null s'il ne répond pas.
  // Si on n'arrive pas à se connecter chez lui, le message passe par la boîte aux lettres.
  async send(peerId, route, body, timeoutMs = 3000) {
    const p = this.peerMap.get(peerId);
    if (!p || !ROUTES.includes(route)) return null;
    const r = await this._post(p, '/' + route, body, timeoutMs);
    if (r.ok) return r.data;
    if (r.connected) return null; // il a reçu la demande sans répondre : on ne la renvoie pas (pas de doublon)
    // Vient-il relever son courrier chez nous ? Sinon, inutile d'attendre.
    if (!this.waiting.has(peerId) && Date.now() - (this.lastPoll.get(peerId) || 0) > POLL_MS + 10000) return null;
    return new Promise((resolve) => {
      const mid = crypto.randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(mid);
        const box = this.outbox.get(peerId);
        if (box) this.outbox.set(peerId, box.filter(x => x.mid !== mid));
        resolve(null);
      }, timeoutMs + 4000);
      this.pending.set(mid, { peerId, resolve, timer });
      const box = this.outbox.get(peerId) || [];
      box.push({ mid, route, body });
      this.outbox.set(peerId, box.slice(-20));
      this._flush(peerId);
    });
  }

  // Donne son courrier à un ami qui attend
  _flush(peerId) {
    const w = this.waiting.get(peerId), box = this.outbox.get(peerId);
    if (!w || !box || !box.length) return;
    this.waiting.delete(peerId);
    this.outbox.delete(peerId);
    clearTimeout(w.timer);
    w.reply(200, { msgs: box });
  }

  _onHttp(req, res) {
    const reply = (code, obj) => {
      if (res.headersSent || res.destroyed) return;
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    const route = (req.url || '').slice(1);
    const internal = INTERNAL.includes(route);
    if (req.method !== 'POST' || (!internal && (!ROUTES.includes(route) || !this.handlers[route]))) return reply(404, { ok: false });
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reply(413, { ok: false }); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', async () => {
      if (size > MAX_BODY) return;
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reply(400, { ok: false }); }
      if (!body || typeof body !== 'object' || !body.from || !isStr(body.from.id, 64) || !isStr(body.from.nick, 20) || body.from.id === this.id) return reply(400, { ok: false });
      if (internal) return this._internal(route, body, req, reply);
      try { reply(200, (await this.handlers[route](body, body.from)) || { ok: false }); }
      catch (e) { this.emit('error', e); reply(500, { ok: false }); }
    });
  }

  _internal(route, body, req, reply) {
    const id = body.from.id;
    if (route === '_hello') {
      const address = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
      const m = { id, nick: body.from.nick, port: body.port, ver: body.ver };
      if (!this._validPeerMsg(m) || !isIPv4(address)) return reply(400, { ok: false });
      this._seen(m, address);
      return reply(200, { ok: true, id: this.id, nick: this.nick, port: this.port, ver: this.ver });
    }
    const p = this.peerMap.get(id);
    if (!p) return reply(200, route === '_poll' ? { msgs: [] } : { ok: false }); // inconnu : rien pour lui
    p.lastSeen = Date.now();
    if (route === '_poll') {
      this.lastPoll.set(id, Date.now());
      const old = this.waiting.get(id);
      if (old) { clearTimeout(old.timer); old.reply(200, { msgs: [] }); }
      const w = { reply, timer: null };
      w.timer = setTimeout(() => { if (this.waiting.get(id) === w) this.waiting.delete(id); reply(200, { msgs: [] }); }, POLL_MS);
      this.waiting.set(id, w);
      req.socket.once('close', () => { if (this.waiting.get(id) === w) { clearTimeout(w.timer); this.waiting.delete(id); } });
      this._flush(id);
      return;
    }
    // _answer : la réponse à un message passé par la boîte aux lettres
    const pend = typeof body.mid === 'string' ? this.pending.get(body.mid) : null;
    if (!pend || pend.peerId !== id) return reply(200, { ok: false });
    this.pending.delete(body.mid);
    clearTimeout(pend.timer);
    pend.resolve(body.result && typeof body.result === 'object' ? body.result : null);
    reply(200, { ok: true });
  }
}

module.exports = { Lan, localNetworks, isIPv4 };
