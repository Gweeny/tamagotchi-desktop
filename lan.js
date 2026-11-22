// Réseau local, sans serveur : module Node pur (aucune dépendance Electron), testable seul.
//  - Découverte : chaque app annonce { id, pseudo, port } en UDP toutes les 2 s, et écoute les annonces des autres.
//    L'annonce part sur CHAQUE carte réseau (adresse de broadcast du réseau local, ex. 192.168.1.255),
//    car avec plusieurs cartes (Bluetooth, Wi-Fi Direct, VPN…) Windows envoie 255.255.255.255 sur une seule.
//    Quand on reçoit l'annonce d'un ami, on lui répond directement : il suffit qu'un sens passe.
//    En secours, on peut ajouter un ami par son adresse IP : on lui envoie alors l'annonce en direct.
//    Un ami disparaît de la liste après 7 s sans nouvelles.
//  - Messages : chaque app a un petit serveur HTTP ; on lui envoie des POST JSON
//    (/travel, /care, /status, /return, /recall). Les réponses sont en JSON.
// Tout ce qui arrive du réseau est vérifié (taille, forme) avant d'être utilisé.

const dgram = require('dgram');
const os = require('os');
const http = require('http');
const { EventEmitter } = require('events');

const APP = 'tamagotchi-desktop';
const PROTO = 1;
const MAX_BODY = 16 * 1024;
const MAX_ANNOUNCE = 512;
const ROUTES = ['travel', 'care', 'status', 'return', 'recall'];

const isStr = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const isIPv4 = (s) => typeof s === 'string' && IPV4.test(s);

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
  constructor({ id, nick, udpPort = 41234, httpPort = 0, announceMs = 2000, expireMs = 7000, broadcast = '255.255.255.255' }) {
    super();
    this.id = id; this.nick = nick;
    this.udpPort = udpPort; this.httpPort = httpPort;
    this.announceMs = announceMs; this.expireMs = expireMs; this.broadcast = broadcast;
    this.handlers = {};            // route -> async (body, peer) => réponse
    this.peerMap = new Map();      // id -> { id, nick, address, port, lastSeen }
    this.manual = new Set();       // adresses IP d'amis ajoutées à la main
    this.timers = [];
  }

  // Démarre le serveur HTTP puis la découverte
  async start() {
    this.server = http.createServer((req, res) => this._onHttp(req, res));
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.httpPort, '0.0.0.0', resolve);
    });
    this.port = this.server.address().port;

    this.udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.udp.on('message', (msg, rinfo) => this._onAnnounce(msg, rinfo));
    this.udp.on('error', (e) => this.emit('error', e));
    await new Promise((resolve) => this.udp.bind(this.udpPort, resolve));
    this.udp.setBroadcast(true);

    this.announce();
    this.timers.push(setInterval(() => this.announce(), this.announceMs));
    this.timers.push(setInterval(() => this._expire(), 1000));
  }

  stop() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    if (this.udp) { try { this.udp.close(); } catch {} this.udp = null; }
    if (this.server) { this.server.close(); this.server = null; }
  }

  setNick(nick) { this.nick = nick; this.announce(); }

  // Adresses où envoyer l'annonce : broadcast de chaque carte réseau, broadcast général, amis ajoutés à la main
  targets() {
    const set = new Set([this.broadcast]);
    if (this.broadcast === '255.255.255.255') for (const n of localNetworks()) set.add(n.broadcast);
    for (const ip of this.manual) set.add(ip);
    return [...set];
  }

  _message() {
    return Buffer.from(JSON.stringify({ app: APP, v: PROTO, id: this.id, nick: this.nick, port: this.port }));
  }

  announce() {
    if (!this.udp || !this.nick) return;
    const msg = this._message();
    for (const addr of this.targets()) this.udp.send(msg, this.udpPort, addr, () => {});
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

  peers() { return [...this.peerMap.values()].map(({ id, nick }) => ({ id, nick })); }
  peer(id) { return this.peerMap.get(id) || null; }

  _onAnnounce(buf, rinfo) {
    if (buf.length > MAX_ANNOUNCE) return;
    let m;
    try { m = JSON.parse(buf.toString('utf8')); } catch { return; }
    if (!m || m.app !== APP || m.v !== PROTO || m.id === this.id) return;
    if (!isStr(m.id, 64) || !isStr(m.nick, 20) || !Number.isInteger(m.port) || m.port < 1 || m.port > 65535) return;
    const known = this.peerMap.get(m.id);
    const changed = !known || known.nick !== m.nick || known.port !== m.port || known.address !== rinfo.address;
    this.peerMap.set(m.id, { id: m.id, nick: m.nick, address: rinfo.address, port: m.port, lastSeen: Date.now() });
    // Nouvel ami : on lui répond directement, au cas où notre broadcast ne lui parviendrait pas
    if (!known && this.udp && this.nick) this.udp.send(this._message(), this.udpPort, rinfo.address, () => {});
    if (changed) this.emit('peers', this.peers());
  }

  _expire() {
    let changed = false;
    for (const [id, p] of this.peerMap) {
      if (Date.now() - p.lastSeen > this.expireMs) { this.peerMap.delete(id); changed = true; this.emit('peer-lost', id); }
    }
    if (changed) this.emit('peers', this.peers());
  }

  // Envoie un message à un ami ; renvoie sa réponse, ou null s'il ne répond pas
  send(peerId, route, body, timeoutMs = 3000) {
    const p = this.peerMap.get(peerId);
    if (!p || !ROUTES.includes(route)) return Promise.resolve(null);
    const data = Buffer.from(JSON.stringify({ ...body, from: { id: this.id, nick: this.nick } }));
    return new Promise((resolve) => {
      const req = http.request({
        host: p.address, port: p.port, path: '/' + route, method: 'POST', timeout: timeoutMs,
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
      }, (res) => {
        let size = 0; const chunks = [];
        res.on('data', (c) => { size += c.length; if (size <= MAX_BODY) chunks.push(c); });
        res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { resolve(null); } });
      });
      req.on('timeout', () => req.destroy());
      req.on('error', () => resolve(null));
      req.end(data);
    });
  }

  _onHttp(req, res) {
    const reply = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const route = (req.url || '').slice(1);
    if (req.method !== 'POST' || !ROUTES.includes(route) || !this.handlers[route]) return reply(404, { ok: false });
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
      if (!body || typeof body !== 'object' || !body.from || !isStr(body.from.id, 64) || !isStr(body.from.nick, 20)) return reply(400, { ok: false });
      try { reply(200, (await this.handlers[route](body, body.from)) || { ok: false }); }
      catch (e) { this.emit('error', e); reply(500, { ok: false }); }
    });
  }
}

module.exports = { Lan, localNetworks, isIPv4 };
