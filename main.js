const { app, BrowserWindow, ipcMain, screen, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const engine = require('./engine');
const { Lan, isIPv4 } = require('./lan');
const { trayIconPng } = require('./icon');
const updater = require('./updater');
const { updateRepo } = require('./package.json');

// TAMA_SPEED=60 -> 1 minute réelle = 1 heure de jeu (pour tester)
const SPEED = Math.max(1, Number(process.env.TAMA_SPEED) || 1);
// TAMA_PROFILE=b -> une deuxième app indépendante sur le même PC (pour tester les visites)
const PROFILE = /^[a-z0-9]{1,12}$/i.test(process.env.TAMA_PROFILE || '') ? process.env.TAMA_PROFILE : '';
const TICK_MS = 5000;
const SAVE_MS = 60000;
const VISIT_MS = 10 * 60000;      // un invité rentre chez lui au bout de 10 min
const GUEST_POLL_MS = 10000;      // l'hôte demande des nouvelles du chat invité
const SIDES = ['left', 'right', 'none'];
const GUEST_CARE = ['pet', 'feed-kibble', 'feed-treat'];

// Dossier de sauvegarde fixe (il ne dépend pas du nom affiché de l'app)
app.setPath('userData', path.join(app.getPath('appData'), 'tamagotchi-desktop' + (PROFILE ? '-' + PROFILE : '')));
const gotLock = PROFILE || app.requestSingleInstanceLock(); // une seule app à la fois
if (!gotLock) app.quit();

const windows = new Map(); // id de l'écran -> fenêtre transparente
let catDisplayId = null;   // écran où se trouve le chat
let cat = null;            // état du chat (null tant qu'il n'a pas été créé)
// friendSide : côté du PC de l'ami ; friendId : l'ami choisi ; nickname : mon pseudo sur le réseau
let settings = { id: null, nickname: null, friendSide: null, friendId: null, acceptVisits: true, friendIps: [], poufX: 0.82, weatherCity: null, weatherCoords: null };
let tray = null;
let hidden = false;        // fenêtres masquées depuis la zone de notification
let lan = null;
let visit = null;          // mon chat est en visite : { id, peerId, nick, since }
const guests = new Map();  // chats invités chez moi : visitId -> { win, ownerId, ownerNick, view, timer, poll, fails, enter }

// ---------- Fichiers ----------
const dataPath = (f) => path.join(app.getPath('userData'), f);

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(dataPath(file), 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') console.error(`Lecture de ${file} impossible :`, e.message); return null; }
}

// Écriture atomique : fichier temporaire puis renommage, pour ne jamais laisser un fichier à moitié écrit
function writeJson(file, data) {
  try {
    const tmp = dataPath(file) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, dataPath(file));
  } catch (e) {
    console.error(`Écriture de ${file} impossible :`, e.message);
  }
}

function loadCat() {
  const st = readJson('cat.json');
  if (st === null) return null;
  if (engine.isValidState(st)) return st;
  try { fs.renameSync(dataPath('cat.json'), dataPath('cat.json.bad')); } catch {} // on garde le fichier abîmé de côté
  return null;
}
const saveCat = () => { if (cat) writeJson('cat.json', cat); };

function loadSettings() {
  const s = readJson('settings.json') || {};
  if (SIDES.includes(s.friendSide)) settings.friendSide = s.friendSide;
  if (typeof s.nickname === 'string' && s.nickname.trim()) settings.nickname = s.nickname.trim().slice(0, 20);
  if (typeof s.friendId === 'string') settings.friendId = s.friendId;
  if (typeof s.acceptVisits === 'boolean') settings.acceptVisits = s.acceptVisits;
  if (Array.isArray(s.friendIps)) settings.friendIps = s.friendIps.filter(isIPv4).slice(0, 10);
  if (Number.isFinite(s.poufX)) settings.poufX = Math.max(0, Math.min(1, s.poufX));
  if (typeof s.weatherCity === 'string') settings.weatherCity = s.weatherCity.slice(0, 60);
  if (s.weatherCoords && Number.isFinite(s.weatherCoords.lat) && Number.isFinite(s.weatherCoords.lon)) settings.weatherCoords = { lat: s.weatherCoords.lat, lon: s.weatherCoords.lon };
  settings.id = typeof s.id === 'string' && s.id ? s.id : crypto.randomUUID();
  writeJson('settings.json', settings);
}
const saveSettings = () => writeJson('settings.json', settings);

// ---------- État envoyé aux pages ----------
function ageText(st) {
  const days = Math.floor((st.clock - st.born) / 86400000);
  if (days < 1) return "moins d'un jour";
  return days === 1 ? '1 jour' : `${days} jours`;
}

function view() {
  if (!cat) return null;
  const needs = {};
  for (const k of engine.NEEDS) needs[k] = Math.round(cat.needs[k]);
  return {
    name: cat.name,
    color: engine.COLORS[cat.color],
    needs,
    fat: Math.round(cat.fat),
    poops: cat.poops.map(p => ({ x: p.x })),
    personality: cat.personality,
    personalityLabel: cat.personality ? engine.PERSONALITIES[cat.personality].label : null,
    stage: engine.stage(cat),
    weightKg: engine.weightKg(cat),
    bodyLabel: engine.bodyLabel(cat.fat),
    asleep: cat.asleep,
    sick: cat.sick,
    dead: !!cat.dead,
    deathCause: cat.deathCause || null,
    boarding: !!cat.boarding,
    visiting: visit ? { nick: visit.nick } : null,
    expr: engine.expression(cat),
    age: ageText(cat),
    need: engine.needIcon(cat),
    history: cat.history.slice(0, 5)
  };
}

const catWin = () => windows.get(catDisplayId);
function sendToCat(channel, data) { const w = catWin(); if (w) w.webContents.send(channel, data); }
function broadcast(channel, data) { for (const w of windows.values()) w.webContents.send(channel, data); }
function pushState() {
  if (!cat) return;
  broadcast('state', view());
  if (tray) tray.setToolTip(`${cat.name} — ${cat.dead ? 'au paradis des chats' : visit ? `chez ${visit.nick}` : cat.boarding ? 'en pension' : cat.asleep ? 'dort' : 'clic pour les statistiques'}`);
}

function doAction(action, opts) {
  if (!cat) return null;
  engine.update(cat, Date.now(), SPEED);
  const r = engine.act(cat, action, opts);
  if (r && r.icon) sendToCat('icon', r.icon);
  if (r && r.anim) sendToCat('anim', r.anim);
  pushState();
  return r;
}

// ---------- Jeux ----------
let currentGame = null; // 'ball' | 'wand' | 'solo' | null

function startGame(game) {
  if (currentGame) stopGame();
  showAll();
  const r = doAction('play-start', { game });
  if (!r || !r.ok) return;
  currentGame = game;
  sendToCat('game', game);
}

function stopGame() {
  if (!currentGame) return;
  currentGame = null;
  sendToCat('game', null);
}

// ---------- Mises à jour (GitHub) ----------
let update = null;      // { version, url, name, size } quand une nouvelle version existe
let updating = false;
async function checkUpdate() {
  try {
    update = await updater.checkForUpdate(updateRepo, app.getVersion());
    if (update && tray) tray.setToolTip(`Tamagotchi — nouvelle version ${update.version} disponible`);
  } catch (e) { console.error('Mise à jour :', e.message); }
}
async function installUpdate() {
  if (!update || updating) return;
  updating = true;
  if (tray) tray.setToolTip(`Téléchargement de la version ${update.version}…`);
  try {
    if (await updater.downloadAndInstall(update)) { saveCat(); app.quit(); return; }
  } catch (e) { console.error('Mise à jour :', e.message); }
  updating = false;
  if (tray) tray.setToolTip('La mise à jour a échoué, réessaie plus tard');
}
const updateItems = () => (update ? [{ label: updating ? `Téléchargement de la version ${update.version}…` : `✨ Mettre à jour vers la version ${update.version}`, enabled: !updating, click: installUpdate }, { type: 'separator' }] : []);

// ---------- Météo ----------
// Facultatif : si on a donné sa ville, on demande la météo à Open-Meteo (gratuit, sans clé, sans paquet en plus)
// toutes les 30 min. Seul le nom de la ville (puis ses coordonnées) est envoyé.
let weather = null; // { kind: 'sun' | 'cloud' | 'rain' | 'snow' | 'storm', temp, isDay }
const WEATHER_MS = 30 * 60000;
function weatherKind(code) {
  if (code === 0) return 'sun';
  if (code <= 48) return 'cloud';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'cloud';
}
async function fetchJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function setWeatherCity(city) {
  city = typeof city === 'string' ? city.trim().slice(0, 60) : '';
  if (!city) return;
  try {
    const g = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=fr&name=${encodeURIComponent(city)}`);
    const r = g && g.results && g.results[0];
    if (!r) { sendToCat('icon', 'question'); return; }
    settings.weatherCity = r.name; settings.weatherCoords = { lat: r.latitude, lon: r.longitude };
    saveSettings();
    updateWeather();
  } catch (e) { console.error('Météo :', e.message); sendToCat('icon', 'question'); }
}
async function updateWeather() {
  const c = settings.weatherCoords;
  if (!c) { weather = null; broadcast('weather', null); return; }
  try {
    const d = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,weather_code,is_day`);
    const cur = d && d.current;
    if (!cur) return;
    weather = { kind: weatherKind(Number(cur.weather_code)), temp: Number(cur.temperature_2m), isDay: !!cur.is_day };
    broadcast('weather', weather);
    for (const g of guests.values()) if (!g.win.isDestroyed()) g.win.webContents.send('weather', weather);
  } catch (e) { console.error('Météo :', e.message); }
}
function weatherMenu() {
  return { label: 'Météo', submenu: [
    { label: settings.weatherCity ? `Ma ville : ${settings.weatherCity}${weather ? ` (${Math.round(weather.temp)} °C)` : ''} — changer…` : 'Choisir ma ville…', click: () => { showAll(); sendToCat('ask-city', settings.weatherCity || ''); } },
    ...(settings.weatherCity ? [{ label: 'Désactiver la météo', click: () => { settings.weatherCity = null; settings.weatherCoords = null; saveSettings(); updateWeather(); } }] : [])
  ] };
}

// ---------- Brossage ----------
let brushing = 0; // fin du brossage autorisé (sécurité : 60 s au plus)
function startBrush() {
  showAll();
  stopGame();
  const r = doAction('brush-start');
  if (!r || !r.ok) return;
  brushing = Date.now() + 60000;
  sendToCat('brush');
}

// ---------- Écrans ----------
// Les écrans sont rangés en une rangée logique, quelle que soit leur disposition dans Windows
// (côte à côte ou l'un sur l'autre) : l'ami est d'un côté de l'écran principal, mes autres
// écrans sont de l'autre côté (à droite par défaut, à gauche si l'ami est à droite).
function screenChain() {
  const primary = screen.getPrimaryDisplay();
  const others = screen.getAllDisplays().filter(d => d.id !== primary.id)
    .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
  return settings.friendSide === 'right' ? [...others.reverse(), primary] : [primary, ...others];
}

// Pour chaque bord gauche/droite d'un écran : un autre de mes écrans ('screen'),
// le PC de l'ami ('friend'), ou un mur ('wall').
// Dès qu'un ami est en ligne, tous les bords extérieurs mènent chez lui : un mauvais réglage
// du côté de l'ami (ex. « gauche » au lieu de « droite ») ne peut plus empêcher la visite.
function edgesOf(d) {
  const chain = screenChain();
  const i = chain.findIndex(o => o.id === d.id);
  const friendOnline = !!(lan && lan.peers().length);
  const kind = (j) => chain[j] ? { type: 'screen', to: chain[j].id } : { type: friendOnline ? 'friend' : 'wall' };
  return { left: kind(i - 1), right: kind(i + 1) };
}
function sendEdges() {
  for (const d of screen.getAllDisplays()) {
    const w = windows.get(d.id);
    if (w) w.webContents.send('edges', screenInfo(d).edges);
  }
}

function screenInfo(d) {
  const e = edgesOf(d);
  return {
    bounds: d.bounds, workArea: d.workArea,
    edges: { left: e.left.type, right: e.right.type },
    catHere: d.id === catDisplayId,
    home: d.id === screen.getPrimaryDisplay().id,
    poufX: settings.poufX
  };
}

function makeWindow(d, query) {
  const win = new BrowserWindow({
    ...d.bounds,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  // Windows peut ajuster la taille au DPI de l'écran : on réimpose les bounds
  win.setBounds(d.bounds);
  win.setAlwaysOnTop(true, 'screen-saver');
  // Les clics passent à travers la fenêtre, sauf quand la souris est sur le chat
  win.setIgnoreMouseEvents(true, { forward: true });
  win.displayId = d.id;
  win.loadFile('index.html', query ? { query } : undefined);
  win.once('ready-to-show', () => { if (!hidden) win.showInactive(); }); // ne vole pas le focus
  return win;
}

// (Re)crée une fenêtre par écran ; le chat repart sur l'écran principal
function buildWindows() {
  // On crée les nouvelles fenêtres avant de fermer les anciennes, sinon l'app se croirait fermée
  const old = [...windows.values()];
  windows.clear();
  catDisplayId = screen.getPrimaryDisplay().id;
  for (const d of screen.getAllDisplays()) windows.set(d.id, makeWindow(d));
  for (const w of old) w.destroy();
}

const displayOf = (sender) => {
  const w = BrowserWindow.fromWebContents(sender);
  return w && screen.getAllDisplays().find(d => d.id === w.displayId);
};
// La fenêtre qui a envoyé ce message affiche-t-elle un chat invité ?
const guestOf = (sender) => {
  for (const [id, g] of guests) if (!g.win.isDestroyed() && g.win.webContents === sender) return { id, g };
  return null;
};

function showAll() {
  if (!hidden) return;
  hidden = false;
  for (const w of windows.values()) w.showInactive();
}
function toggleHidden() {
  hidden = !hidden;
  for (const w of windows.values()) (hidden ? w.hide() : w.showInactive());
  if (hidden) stopGame();
}

// Fait venir le chat sur l'écran principal (il tombe du ciel). S'il est en visite, il rentre.
function recallCat() {
  showAll();
  if (visit) {
    if (lan) lan.send(visit.peerId, 'recall', { visitId: visit.id }); // on prévient l'ami, sans attendre
    endVisit();
  }
  const primary = screen.getPrimaryDisplay();
  if (catDisplayId !== primary.id) { const old = catWin(); if (old) old.webContents.send('leave'); }
  stopGame();
  catDisplayId = primary.id;
  sendToCat('enter', { side: 'top' });
}

// =====================================================================
//  Visites chez un ami (réseau local)
// =====================================================================
// Ce qu'on envoie de notre chat : de quoi le dessiner, rien de plus (vie privée)
function guestPayload() {
  const v = view();
  return { name: v.name, color: cat.color, needs: v.needs, fat: v.fat, stage: v.stage, tier: v.expr.tier, asleep: v.asleep, sick: v.sick };
}

// Ce qu'on accepte d'un ami : on revérifie tout, et on reconstruit un état d'affichage
const TIERS = ['ecstatic', 'happy', 'smile', 'grumpy', 'dramatic', 'dying'];
function sanitizeGuest(c, ownerNick) {
  if (!c || typeof c !== 'object' || typeof c.name !== 'string' || !engine.COLORS[c.color]) return null;
  const num = (v) => Math.max(0, Math.min(100, Number.isFinite(v) ? v : 50));
  const needs = {};
  for (const k of engine.NEEDS) needs[k] = Math.round(num(c.needs && c.needs[k]));
  const fat = num(c.fat);
  return {
    name: c.name.trim().slice(0, 20) || 'Chat', color: engine.COLORS[c.color], needs, fat,
    stage: ['kitten', 'adult', 'senior'].includes(c.stage) ? c.stage : 'adult',
    weightKg: 0, bodyLabel: engine.bodyLabel(fat),
    asleep: false, sick: !!c.sick, dead: false, boarding: false, visiting: null,
    expr: { tier: TIERS.includes(c.tier) ? c.tier : 'smile' },
    age: '', need: null, history: [], guestOf: ownerNick
  };
}

// L'ami vers qui part le chat : celui qu'on a choisi s'il est en ligne, sinon le premier trouvé
function friendPeer() {
  if (!lan) return null;
  const peers = lan.peers();
  return peers.find(p => p.id === settings.friendId) || peers[0] || null;
}

// Mon chat sort par le bord de l'ami
async function startVisit(sender, msg) {
  const peer = cat && !cat.dead && !cat.boarding ? friendPeer() : null;
  const bounce = () => { sender.send('bounce', msg.side); sender.send('icon', 'question'); };
  if (!peer) return bounce(); // personne en ligne : il rebondit, il n'est jamais perdu
  const visitId = crypto.randomUUID();
  const d = displayOf(sender);
  const r = await lan.send(peer.id, 'travel', {
    visitId, cat: guestPayload(),
    y: d ? msg.y / d.bounds.height : 0.5, vx: msg.vx, vy: msg.vy
  });
  if (!r || !r.ok) return bounce();
  visit = { id: visitId, peerId: peer.id, nick: peer.nick, since: Date.now() };
  stopGame();
  cat.history.unshift({ t: Date.now(), text: `${cat.name} est parti chez ${peer.nick}.` });
  pushState();
}

// Fin de visite (il rentre, ou l'ami a disparu) ; le retour à l'écran est géré par l'appelant
function endVisit() {
  if (!visit) return;
  if (cat) cat.history.unshift({ t: Date.now(), text: `${cat.name} est rentré de chez ${visit.nick}.` });
  visit = null;
  pushState();
}

// --- Côté hôte : un chat arrive chez moi ---
function openGuest(visitId, ownerId, ownerNick, catView, enter) {
  const primary = screen.getPrimaryDisplay();
  const win = makeWindow(primary, { guest: visitId });
  const g = { win, ownerId, ownerNick, view: catView, enter, fails: 0, displayId: primary.id };
  // Il rentre chez lui au bout de 10 min, et on prend régulièrement de ses nouvelles
  g.timer = setTimeout(() => sendGuestHome(visitId), VISIT_MS);
  g.poll = setInterval(async () => {
    const r = await lan.send(ownerId, 'status', { visitId });
    if (!r || !r.ok) { if (++g.fails >= 3 || (r && r.ok === false)) closeGuest(visitId); return; }
    g.fails = 0;
    const v = sanitizeGuest(r.cat, ownerNick);
    if (v) { g.view = v; if (!win.isDestroyed()) win.webContents.send('state', v); }
  }, GUEST_POLL_MS);
  win.on('closed', () => closeGuest(visitId));
  guests.set(visitId, g);
}

const guestDisplay = (g) => screen.getAllDisplays().find(d => d.id === g.displayId) || screen.getPrimaryDisplay();
function guestScreenInfo(g) {
  const d = guestDisplay(g), e = edgesOf(d);
  const map = (t) => (t.type === 'friend' ? 'home' : t.type); // bord « ami » = retour chez son propriétaire
  return { bounds: d.bounds, workArea: d.workArea, catHere: true, guest: true, home: false, edges: { left: map(e.left), right: map(e.right) } };
}

function closeGuest(visitId) {
  const g = guests.get(visitId);
  if (!g) return;
  guests.delete(visitId);
  clearTimeout(g.timer); clearInterval(g.poll);
  if (!g.win.isDestroyed()) g.win.destroy();
}

async function sendGuestHome(visitId, msg = {}) {
  const g = guests.get(visitId);
  if (!g) return;
  closeGuest(visitId);
  await lan.send(g.ownerId, 'return', { visitId, y: Number.isFinite(msg.y) ? msg.y : 0.5, vx: msg.vx || 0, vy: msg.vy || 0 });
}

async function guestCare(visitId, action) {
  const g = guests.get(visitId);
  if (!g || !GUEST_CARE.includes(action)) return;
  const r = await lan.send(g.ownerId, 'care', { visitId, action });
  if (!r || !r.ok || g.win.isDestroyed()) return;
  if (typeof r.icon === 'string') g.win.webContents.send('icon', r.icon);
  if (typeof r.anim === 'string') g.win.webContents.send('anim', r.anim);
  const v = sanitizeGuest(r.cat, g.ownerNick);
  if (v) { g.view = v; g.win.webContents.send('state', v); }
}

// Pseudo par défaut tant qu'on n'en a pas choisi : le nom de l'ordinateur (sinon l'app ne s'annoncerait pas)
const myNick = () => settings.nickname || os.hostname().slice(0, 20) || 'Ami';

function startLan() {
  lan = new Lan({ id: settings.id, nick: myNick() });
  for (const ip of settings.friendIps) lan.addManual(ip);
  lan.on('error', (e) => console.error('Réseau :', e.message));

  // Un ami m'envoie son chat
  lan.handlers.travel = async (body, from) => {
    if (!settings.acceptVisits || typeof body.visitId !== 'string' || body.visitId.length > 64) return { ok: false };
    const v = sanitizeGuest(body.cat, from.nick);
    if (!v) return { ok: false };
    for (const [id, g] of guests) if (g.ownerId === from.id) closeGuest(id); // un seul chat par ami
    const num = (x, d) => (Number.isFinite(x) ? x : d);
    // Il entre par mon bord « ami » (ou, à défaut, le côté opposé à sa sortie)
    const side = settings.friendSide === 'left' || settings.friendSide === 'right' ? settings.friendSide : (num(body.vx, 0) > 0 ? 'left' : 'right');
    openGuest(body.visitId, from.id, from.nick, v, { side, y: Math.max(0, Math.min(1, num(body.y, 0.5))), vx: num(body.vx, 0), vy: num(body.vy, 0) });
    return { ok: true };
  };
  // Mon chat est chez un ami : on applique ses soins, on donne de ses nouvelles, il rentre
  const myVisit = (body, from) => visit && cat && body.visitId === visit.id && from.id === visit.peerId;
  lan.handlers.care = async (body, from) => {
    if (!myVisit(body, from) || !GUEST_CARE.includes(body.action)) return { ok: false };
    const r = engine.act(cat, body.action) || {};
    pushState();
    return { ok: true, icon: r.icon || null, anim: r.anim || null, cat: guestPayload() };
  };
  lan.handlers.status = async (body, from) => (myVisit(body, from) && !cat.dead ? { ok: true, cat: guestPayload() } : { ok: false });
  lan.handlers.return = async (body, from) => {
    if (!myVisit(body, from)) return { ok: false };
    endVisit();
    showAll();
    // Il revient par le bord de l'ami, avec son élan
    const d = screen.getPrimaryDisplay();
    catDisplayId = d.id;
    const num = (x, def) => (Number.isFinite(x) ? x : def);
    sendToCat('enter', { side: settings.friendSide === 'right' ? 'right' : 'left', y: Math.max(0, Math.min(1, num(body.y, 0.5))) * d.bounds.height, vx: -num(body.vx, 0), vy: num(body.vy, 0), rot: 0 });
    return { ok: true };
  };
  // Le propriétaire rappelle son chat
  lan.handlers.recall = async (body, from) => {
    const g = guests.get(body.visitId);
    if (!g || g.ownerId !== from.id) return { ok: false };
    closeGuest(body.visitId);
    return { ok: true };
  };
  // Mon ami a disparu (app fermée, réseau coupé) pendant la visite : mon chat rentre
  lan.on('peer-lost', (id) => { if (visit && visit.peerId === id) recallCat(); });
  lan.on('peers', sendEdges); // un ami arrive ou part : les bords changent

  lan.start().catch((e) => { console.error('Réseau indisponible :', e.message); lan = null; });
}

// =====================================================================
//  Menus (clic droit sur le chat et zone de notification)
// =====================================================================
function setFriendSide(side) {
  settings.friendSide = side;
  saveSettings();
  for (const d of screen.getAllDisplays()) {
    const w = windows.get(d.id);
    if (w) w.webContents.send('edges', screenInfo(d).edges);
  }
}

function friendMenu() {
  const peers = lan ? lan.peers() : [];
  const chosen = friendPeer();
  return { label: 'Ami', submenu: [
    { label: `Mon pseudo : ${myNick()} — changer…`, click: () => { showAll(); sendToCat('ask-nick', settings.nickname || ''); } },
    { label: `Mon adresse : ${lan && lan.addresses().length ? lan.addresses().join(', ') : 'aucun réseau'}`, enabled: false },
    { type: 'separator' },
    { label: 'Son PC est à gauche', type: 'radio', checked: settings.friendSide === 'left', click: () => setFriendSide('left') },
    { label: 'Son PC est à droite', type: 'radio', checked: settings.friendSide === 'right', click: () => setFriendSide('right') },
    { label: "Pas d'ami pour l'instant", type: 'radio', checked: settings.friendSide === 'none', click: () => setFriendSide('none') },
    { type: 'separator' },
    ...(peers.length
      ? peers.map(p => ({ label: `${p.nick} (en ligne)`, type: 'radio', checked: chosen && chosen.id === p.id, click: () => { settings.friendId = p.id; saveSettings(); } }))
      : [{ label: lan ? 'Personne en ligne sur le réseau' : 'Réseau indisponible', enabled: false }]),
    { label: 'Ajouter un ami par son adresse IP…', click: () => { showAll(); sendToCat('ask-ip'); } },
    ...(settings.friendIps.length ? [{ label: `Oublier les adresses ajoutées (${settings.friendIps.join(', ')})`, click: () => { for (const ip of settings.friendIps) lan && lan.removeManual(ip); settings.friendIps = []; saveSettings(); } }] : []),
    { type: 'separator' },
    { label: 'Accepter les visites', type: 'checkbox', checked: settings.acceptVisits, click: (item) => { settings.acceptVisits = item.checked; saveSettings(); } }
  ] };
}

function adoptNew() {
  // On garde le souvenir de l'ancien chat dans un fichier à part
  try { fs.renameSync(dataPath('cat.json'), dataPath(`cat-${cat.name}-${Date.now()}.json`)); } catch {}
  cat = null;
  showAll();
  sendToCat('setup', { colors: engine.COLORS, personalities: engine.PERSONALITIES, friendSide: settings.friendSide });
}

const toggleStats = () => { showAll(); sendToCat('toggle-panel'); };
const act = (a) => () => { showAll(); doAction(a); };

function menuTemplate(fromTray) {
  return [...updateItems(), ...menuItems(fromTray)];
}
function menuItems(fromTray) {
  const quit = { label: 'Quitter', click: () => app.quit() };
  const trayExtra = fromTray ? [{ label: hidden ? 'Afficher' : 'Masquer', click: toggleHidden }] : [];
  if (!cat) return [friendMenu(), ...trayExtra, { type: 'separator' }, quit];
  if (cat.dead) return [{ label: 'Adopter un nouveau chaton', click: adoptNew }, friendMenu(), ...trayExtra, { type: 'separator' }, quit];
  if (visit) return [
    { label: `Faire revenir ${cat.name} (chez ${visit.nick})`, click: recallCat },
    { label: 'Statistiques', click: toggleStats }, friendMenu(), ...trayExtra, { type: 'separator' }, quit
  ];
  if (cat.boarding) return [
    { label: `Récupérer ${cat.name}`, click: act('unboard') }, friendMenu(), ...trayExtra, { type: 'separator' }, quit
  ];
  return [
    { label: 'Nourrir', submenu: [
      { label: 'Croquettes', click: act('feed-kibble') },
      { label: 'Friandise', click: act('feed-treat') }
    ] },
    currentGame
      ? { label: 'Arrêter de jouer', click: stopGame }
      : { label: 'Jouer', submenu: [
        { label: 'À la balle', click: () => startGame('ball') },
        { label: 'Avec la ficelle', click: () => startGame('wand') },
        { label: 'Le laisser jouer tout seul', click: () => startGame('solo') }
      ] },
    { label: 'Caresser', click: act('pet') },
    { label: 'Brosser', click: startBrush },
    { label: cat.poops.length ? `Ramasser les crottes (${cat.poops.length})` : 'Nettoyer la litière', click: act('clean') },
    { label: cat.asleep ? 'Réveiller' : 'Dormir', click: act('sleep') },
    { label: 'Soigner (vétérinaire)', click: act('heal') },
    { type: 'separator' },
    { label: 'Statistiques', click: toggleStats },
    ...(fromTray ? [{ label: `Faire venir ${cat.name} ici`, click: recallCat }] : []),
    { label: 'Mettre en pension', click: act('board') },
    friendMenu(),
    weatherMenu(),
    ...trayExtra,
    { type: 'separator' },
    quit
  ];
}

// Menu d'un chat invité (chez moi)
function guestMenu(visitId) {
  const g = guests.get(visitId);
  if (!g) return [];
  return [
    { label: `${g.view.name}, le chat de ${g.ownerNick}`, enabled: false },
    { type: 'separator' },
    { label: 'Caresser', click: () => guestCare(visitId, 'pet') },
    { label: 'Donner des croquettes', click: () => guestCare(visitId, 'feed-kibble') },
    { label: 'Donner une friandise', click: () => guestCare(visitId, 'feed-treat') },
    { type: 'separator' },
    { label: `Le renvoyer chez ${g.ownerNick}`, click: () => sendGuestHome(visitId) }
  ];
}

// ---------- Icône de la zone de notification ----------
function createTray() {
  tray = new Tray(nativeImage.createFromBuffer(trayIconPng(32), { scaleFactor: 2 }));
  tray.setToolTip('Tamagotchi');
  tray.on('click', () => (cat ? toggleStats() : showAll()));
  tray.on('right-click', () => tray.popUpContextMenu(Menu.buildFromTemplate(menuTemplate(true))));
}

// ---------- IPC (les entrées des pages sont vérifiées) ----------
ipcMain.on('set-clickable', (e, clickable) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  if (clickable) win.setIgnoreMouseEvents(false);
  else win.setIgnoreMouseEvents(true, { forward: true });
});

ipcMain.handle('get-screen', (e) => {
  const guest = guestOf(e.sender);
  if (guest) return guestScreenInfo(guest.g);
  const d = displayOf(e.sender);
  return d ? screenInfo(d) : null;
});

ipcMain.handle('get-state', (e) => {
  const guest = guestOf(e.sender);
  if (guest) return { setup: false, state: guest.g.view };
  const d = displayOf(e.sender);
  const here = d && d.id === catDisplayId;
  if (!cat) return { setup: here, colors: engine.COLORS, personalities: engine.PERSONALITIES, friendSide: settings.friendSide };
  return { setup: false, state: view(), askNick: here && !settings.nickname ? '' : null,
    askPersonality: here && !cat.personality && !cat.dead ? engine.PERSONALITIES : null };
});

ipcMain.handle('setup', (_e, name, color, friendSide, personality) => {
  if (cat) return view();
  name = typeof name === 'string' ? name.trim().slice(0, 20) : '';
  if (!name || !engine.COLORS[color] || !SIDES.includes(friendSide) || !engine.PERSONALITIES[personality]) return null;
  cat = engine.createCat(name, color, Date.now(), personality);
  saveCat();
  setFriendSide(friendSide);
  pushState();
  if (!settings.nickname) setTimeout(() => sendToCat('ask-nick', ''), 3000);
  return view();
});

ipcMain.on('set-city', (e, city) => { if (!guestOf(e.sender)) setWeatherCity(city); });
ipcMain.handle('get-weather', () => weather);

ipcMain.on('set-personality', (e, personality) => {
  if (guestOf(e.sender) || !cat || cat.personality) return;
  doAction('set-personality', { personality });
});

ipcMain.on('set-nick', (_e, nick) => {
  nick = typeof nick === 'string' ? nick.trim().slice(0, 20) : '';
  if (!nick) return;
  settings.nickname = nick;
  saveSettings();
  if (lan) lan.setNick(nick);
});

// Ami ajouté à la main par son adresse IP (quand le réseau bloque la découverte automatique)
ipcMain.on('add-friend-ip', (_e, ip) => {
  ip = typeof ip === 'string' ? ip.trim() : '';
  if (!isIPv4(ip) || settings.friendIps.includes(ip)) return;
  settings.friendIps = [...settings.friendIps, ip].slice(-10);
  saveSettings();
  if (lan) lan.addManual(ip);
});

// La page invitée est prête : le chat de l'ami entre par mon bord « ami »
ipcMain.on('guest-ready', (e) => {
  const guest = guestOf(e.sender);
  if (!guest) return;
  const d = guestDisplay(guest.g), en = guest.g.enter;
  e.sender.send('enter', { side: en.side, y: en.y * d.bounds.height, vx: en.side === 'left' ? Math.abs(en.vx) : -Math.abs(en.vx), vy: en.vy, rot: 0 });
  e.sender.send('icon', 'heart');
});

// Le chat sort par un bord : un autre de mes écrans, chez l'ami, ou (invité) retour chez lui
ipcMain.on('exit', (e, msg) => {
  if (!msg || !['left', 'right'].includes(msg.side)) return;
  const num = (v) => (Number.isFinite(v) ? v : 0);
  const guest = guestOf(e.sender);
  if (guest) {
    const g = guest.g, d = guestDisplay(g);
    const edge = edgesOf(d)[msg.side];
    const target = edge.type === 'screen' && screen.getAllDisplays().find(o => o.id === edge.to);
    if (target) { // il passe sur mon autre écran : sa fenêtre le suit (une seule fenêtre par invité)
      g.displayId = target.id;
      g.win.setBounds(target.bounds);
      e.sender.send('rescreen', guestScreenInfo(g));
      e.sender.send('enter', { side: msg.side === 'right' ? 'left' : 'right', y: (num(msg.y) / d.bounds.height) * target.bounds.height, vx: num(msg.vx), vy: num(msg.vy), rot: num(msg.rot) });
      return;
    }
    if (edge.type === 'wall') { e.sender.send('bounce', msg.side); return; }
    sendGuestHome(guest.id, { y: num(msg.y) / d.bounds.height, vx: num(msg.vx), vy: num(msg.vy) });
    return;
  }
  const d = displayOf(e.sender);
  if (!d || d.id !== catDisplayId) return;
  const edge = edgesOf(d)[msg.side];
  if (edge.type === 'friend') { startVisit(e.sender, { side: msg.side, y: num(msg.y), vx: num(msg.vx), vy: num(msg.vy) }); return; }
  const target = edge.type === 'screen' && screen.getAllDisplays().find(o => o.id === edge.to);
  const win = target && windows.get(target.id);
  if (!win) { e.sender.send('bounce', msg.side); return; }
  catDisplayId = target.id;
  win.webContents.send('enter', {
    side: msg.side === 'right' ? 'left' : 'right',
    // même hauteur relative (les écrans n'ont pas forcément la même taille ni la même position)
    y: (num(msg.y) / d.bounds.height) * target.bounds.height,
    vx: num(msg.vx), vy: num(msg.vy), rot: num(msg.rot)
  });
});

// Événements de la page (physique) : seuls ceux-ci sont acceptés (pas pour un invité)
ipcMain.on('cat-event', (e, ev) => {
  if (guestOf(e.sender)) return;
  if (ev === 'hit' || ev === 'grab') doAction(ev);
});

// Une seconde de jeu effectif (le chat court après la balle, le jouet…)
let lastTick = 0;
ipcMain.on('play-tick', () => {
  if (!currentGame || Date.now() - lastTick < 900) return; // au plus une par seconde
  lastTick = Date.now();
  const r = doAction('play-tick', { solo: currentGame === 'solo' });
  if (r && r.ok === false) stopGame(); // épuisé
});
// La page a terminé le jeu d'elle-même (Échap, inactivité, partie solo finie)
ipcMain.on('game-ended', () => { currentGame = null; });

// Caresses « au passage » de la souris : le moteur décide s'il aime (chez un ami : c'est le propriétaire qui décide)
let lastPetStart = 0, lastPetTick = 0, lastBrushTick = 0;
ipcMain.on('pet-start', (e) => {
  if (Date.now() - lastPetStart < 5000) return;
  lastPetStart = Date.now();
  const guest = guestOf(e.sender);
  if (guest) { guestCare(guest.id, 'pet'); return; }
  doAction('pet');
});
ipcMain.on('pet-tick', (e) => {
  if (guestOf(e.sender) || Date.now() - lastPetTick < 900) return;
  lastPetTick = Date.now();
  doAction('pet-tick');
});
ipcMain.on('brush-tick', (e) => {
  if (guestOf(e.sender) || Date.now() > brushing || Date.now() - lastBrushTick < 900) return;
  lastBrushTick = Date.now();
  doAction('brush-tick');
});
ipcMain.on('brush-end', () => { brushing = 0; });
ipcMain.on('clean-poop', (e, index) => {
  if (guestOf(e.sender) || !cat || !Number.isInteger(index)) return;
  doAction('clean', { index });
});
ipcMain.on('set-pouf', (e, ratio) => {
  if (guestOf(e.sender) || !Number.isFinite(ratio)) return;
  settings.poufX = Math.max(0, Math.min(1, ratio));
  saveSettings();
});

// Chats sur le même écran (mon chat + les chats invités) : chacun envoie sa position,
// on la transmet aux autres pour qu'ils puissent jouer et se blottir ensemble
function allMates() {
  const mates = [];
  const host = catWin();
  if (host && cat && !visit) mates.push({ id: 'host', wc: host.webContents, displayId: catDisplayId });
  for (const [id, g] of guests) if (!g.win.isDestroyed()) mates.push({ id, wc: g.win.webContents, displayId: g.displayId });
  return mates;
}
const mateOf = (sender) => allMates().find(x => x.wc === sender) || null;
const screenMates = (displayId) => allMates().filter(m => m.displayId === displayId);
const mateId = (sender) => { const m = mateOf(sender); return m ? m.id : null; };
ipcMain.on('pos', (e, p) => {
  if (!guests.size || !p) return;
  const me = mateOf(e.sender);
  if (!me || ![p.x, p.y, p.cw, p.ch].every(Number.isFinite)) return;
  const pos = { id: me.id, x: p.x, y: p.y, cw: p.cw, ch: p.ch, faceLeft: !!p.faceLeft, pose: String(p.pose).slice(0, 12), asleep: !!p.asleep, onPouf: !!p.onPouf };
  for (const m of screenMates(me.displayId)) if (m.id !== me.id) m.wc.send('others', [pos]);
});
ipcMain.on('social', (e, to, type) => {
  const me = mateOf(e.sender);
  const from = me && me.id;
  if (!from || type !== 'chased') return;
  const target = screenMates(me.displayId).find(m => m.id === to);
  if (target) target.wc.send('social', { from, type });
});

ipcMain.on('cat-menu', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  const guest = guestOf(e.sender);
  if (guest) { Menu.buildFromTemplate(guestMenu(guest.id)).popup({ window: win }); return; }
  if (cat) Menu.buildFromTemplate(menuTemplate(false)).popup({ window: win });
});
ipcMain.on('focus', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.focus(); });
ipcMain.on('quit', () => app.quit());

// ---------- Démarrage ----------
app.whenReady().then(() => {
  if (!gotLock) return;
  loadSettings();
  cat = loadCat();
  if (cat) engine.update(cat, Date.now(), SPEED); // rattrapage du temps app fermée

  setInterval(() => {
    if (!cat) return;
    engine.update(cat, Date.now(), SPEED);
    pushState();
  }, TICK_MS);
  setInterval(saveCat, SAVE_MS);

  // Écran branché, débranché ou déplacé : on refait les fenêtres
  let rebuildTimer;
  const rebuild = () => { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(buildWindows, 500); };
  screen.on('display-added', rebuild);
  screen.on('display-removed', rebuild);
  screen.on('display-metrics-changed', (_e, _d, changed) => { if (changed.includes('bounds')) rebuild(); });

  createTray();
  startLan();
  updateWeather();
  setInterval(updateWeather, WEATHER_MS);
  setTimeout(checkUpdate, 15000);                 // nouvelle version ? au démarrage puis toutes les 6 h
  setInterval(checkUpdate, 6 * 3600000);
  // Petit délai : sous Linux, la transparence a parfois besoin que le compositeur soit prêt
  setTimeout(buildWindows, process.platform === 'linux' ? 300 : 0);
});

// On relance l'app alors qu'elle tourne déjà : on fait venir le chat
app.on('second-instance', () => { if (cat) recallCat(); else showAll(); });

app.on('before-quit', () => {
  if (cat) engine.update(cat, Date.now(), SPEED);
  saveCat();
  // Les chats invités rentrent chez eux (on prévient sans attendre)
  for (const id of [...guests.keys()]) sendGuestHome(id);
  if (lan) lan.stop();
});
// Les fenêtres peuvent être masquées : l'app ne s'arrête que par « Quitter »
app.on('window-all-closed', () => { if (!tray) app.quit(); });
