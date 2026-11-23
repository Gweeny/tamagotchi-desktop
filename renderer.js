// =====================================================================
//  Page d'un écran : physique, comportement, routines visuelles, jeux, affichage.
//  Le chat n'est visible que sur un écran à la fois (here = true).
//  Le chat ne parle pas : il réagit avec des icônes (CAT_ICONS, dans cat-art.js).
// =====================================================================

// ---- Réglages ----
const BASE_W = 150, BASE_H = 107; // taille d'un chat adulte à l'écran (px)
const GRAVITY = 2200;        // px/s²
const BOUNCE = 0.55;         // énergie gardée à chaque rebond
const FLOOR_FRICTION = 0.85;
const AIR_DRAG = 0.999;
const MAX_THROW = 4000;      // vitesse max d'un lancer (px/s)
const WALK = 70, TROT = 180, RUN = 330; // vitesses (px/s, adulte)
const NEED_BUBBLE_MS = 60000;
const LOW = 30;              // en dessous, l'animation du besoin s'affiche
const POUF_W = 160, POUF_H = 59, POUF_LIFT = 22; // le panier (assez grand pour deux), et de combien le chat est surélevé dessus
const SIDE_POSES = ['stand', 'walk', 'run', 'jump', 'crouch', 'stretch', 'lean', 'scratch'];

// Fenêtre d'un chat invité (le chat d'un ami en visite chez moi) ?
const GUEST = new URLSearchParams(location.search).get('guest');

const $ = (id) => document.getElementById(id);
const cat = $('cat');
const svg = () => cat.querySelector('svg');
const bubble = $('bubble'), zzz = $('zzz'), panel = $('panel'), grave = $('grave'), pension = $('pension');
const ballEl = $('ball'), wandEl = $('wand'), toyMouseEl = $('toy-mouse'), hintEl = $('game-hint'), tagEl = $('tag');
const poufEl = $('pouf'), waterEl = $('water'), foodEl = $('food'), treatEl = $('treat'), vetEl = $('vet'), pillEl = $('pill');
const brushEl = $('brush-cursor'), handEl = $('hand-cursor'), poopsEl = $('poops'), fxLayer = $('fx-layer');
// Les objets sont dessinés dans cat-art.js
for (const [el, key] of [[poufEl, 'pouf'], [waterEl, 'water'], [foodEl, 'food'], [treatEl, 'treat'], [vetEl, 'vet'], [pillEl, 'pill'], [brushEl, 'brush'], [handEl, 'hand']]) {
  el.innerHTML = window.CAT_PROPS[key];
}

let W = window.innerWidth, H = window.innerHeight, floorY = H;
let edges = { left: 'wall', right: 'wall' }; // 'screen' | 'friend' | 'wall' | 'home'
let here = false;     // le chat est-il sur cet écran ?
let home = false;     // écran « maison » (pouf, crottes) ?
let K = 1, cw = BASE_W, ch = BASE_H, U = cw / 140; // taille (un chaton est bien plus petit)
const s = { x: 200, y: 0, vx: 0, vy: 0, rot: 0, vrot: 0, dragging: false, onFloor: false, gone: true, faceLeft: false, thrown: false, onPouf: false, travel: false };
let dragOffset = { x: 0, y: 0 };
let samples = [];     // positions récentes de la souris (vitesse des lancers)
const mouse = { x: -1, y: -1, inside: false, lastMove: 0, speed: 0 };
let state = null;     // dernier état reçu du moteur
let setupOpen = false;
const fx = { dizzyUntil: 0, yawning: false, blinking: false, joy: false, wailing: false };
let override = null;  // réaction courte : { pose, face, cls, until }
let activity = { name: 'sit', until: 0 };
let game = null;      // jeu en cours
let care = null;      // séance de caresses ou de brossage
let lastHunt = 0;
let poufX = null;     // position du pouf (px, bord gauche) — seulement sur l'écran du panier
let poufDir = null;   // sinon : de quel côté se trouve l'écran du panier ('left' / 'right')
let napGoal = null;   // il change d'écran pour aller faire la sieste dans son panier
const others = new Map(); // autres chats sur cet écran (visite) : id -> { x, y, cw, ch, faceLeft, pose, asleep, onPouf, t }
const greeted = new Set();
let rig = null;

hideCat();

// =====================================================================
//  Démarrage et messages du processus principal
// =====================================================================
Promise.all([window.desk.getScreen(), window.desk.getState()]).then(([scr, res]) => {
  W = scr.bounds.width; H = scr.bounds.height;
  floorY = scr.workArea.y + scr.workArea.height - scr.bounds.y; // le sol = le haut de la barre des tâches
  edges = scr.edges;
  here = scr.catHere;
  home = !!scr.home;
  poufDir = scr.poufDir || null;
  if (home) placePouf(scr.poufX);
  s.x = W - cw - 150; s.y = floorY - ch;

  if (scr.guest) { // chat invité : il entrera par le bord de l'ami
    applyState(res.state);
    tagEl.textContent = `${state.name} · le chat de ${state.guestOf}`;
    window.desk.guestReady();
    return;
  }
  if (res.setup) openSetup(res);
  else if (res.state) {
    applyState(res.state);
    if (res.askPersonality) openPersonality(res.askPersonality);
    else if (typeof res.askNick === 'string') openNick(res.askNick);
    if (!here) return;
    if (state.dead) showGrave();
    else if (state.visiting) showSign(`🧳 ${state.name} est chez ${state.visiting.nick} · clic droit pour le faire revenir`);
    else if (state.boarding) showPension();
    else { showCat(); icon('heart'); }
  }
});

window.desk.onState(applyState);
window.desk.onIcon((key) => icon(key, 2000));
window.desk.onAnim(playAnim);
window.desk.onGame((name) => (name ? startGame(name) : endGame(false)));
window.desk.onBrush(() => startCare('brush', true));
window.desk.onTogglePanel(togglePanel);
// Le panier a changé d'écran
window.desk.onPoufInfo((info) => {
  home = !!info.home; poufDir = info.poufDir || null;
  if (home) placePouf(info.poufX);
  else { poufX = null; poufEl.style.display = 'none'; poopsEl.replaceChildren(); knownPoops = null; }
  if (home && state && !GUEST) syncPoops(state, state);
  if (s.onPouf && !home) s.onPouf = false;
});
window.desk.onNotice((text) => hint(String(text).slice(0, 120))); // petit message d'interface en haut de l'écran
window.desk.onAskCity((current) => openPrompt({
  title: 'Ta ville (météo)', hint: 'Facultatif. Le nom de la ville est envoyé au service gratuit Open-Meteo pour connaître la météo (pluie, neige, chaleur).',
  placeholder: 'Ex. Lyon', value: current, maxLength: 60, ok: (v) => window.desk.setCity(v)
}));
window.desk.onWeather((wx) => { weather = wx; applySeason(); });
window.desk.getWeather().then((wx) => { weather = wx; applySeason(); });
window.desk.onRescreen((scr) => { // (invité) sa fenêtre a suivi le chat sur un autre écran
  W = scr.bounds.width; H = scr.bounds.height;
  floorY = scr.workArea.y + scr.workArea.height - scr.bounds.y;
  edges = scr.edges;
  others.clear();
});
window.desk.onEdges((e) => { edges = e; });
window.desk.onAskNick((current) => openNick(current));
window.desk.onAskIp(() => openIp());
window.desk.onSetup((opts) => { grave.classList.remove('show'); hideCat(); closePanel(); openSetup(opts); });
window.desk.onOthers((list) => {
  const now = performance.now();
  for (const o of list) others.set(o.id, { ...o, t: now });
});
window.desk.onSocial(({ from, type }) => {
  // On lui court après : il bondit (même s'il était blotti dans le panier) et s'enfuit
  if (type === 'chased' && state && !state.asleep && !state.dead && !game && !care && !override) {
    stopScript(); s.onPouf = false;
    activity = { name: 'flee', from, until: performance.now() + 2600 };
    icon('surprise', 900);
  }
});

// Le chat arrive depuis un autre de mes écrans (ou tombe du ciel quand on le rappelle)
window.desk.onEnter((m) => {
  here = true;
  grave.classList.remove('show'); pension.classList.remove('show');
  s.thrown = false; s.onPouf = false;
  if (m.side === 'top') {
    s.x = W / 2 - cw / 2; s.y = -ch; s.vx = 0; s.vy = 0; s.rot = 0;
  } else {
    s.x = m.side === 'left' ? -cw * 0.6 : W - cw * 0.4;
    s.y = clamp(m.y, 0, floorY - ch);
    const dir = m.side === 'left' ? 1 : -1; // il garde son élan, avec un minimum pour bien entrer
    s.vx = dir * Math.max(Math.abs(m.vx), 250);
    s.vy = m.vy; s.rot = m.rot; s.vrot = s.vx * 0.2;
    activity = { name: 'walk', until: performance.now() + 4000, target: clamp(s.x + dir * 260, 10, W - cw - 10) };
    if (m.nap > 0) setTimeout(() => { if (here && state && !state.asleep && !game && !care) goToBasket(false, m.nap); }, 500); // il continue jusqu'à son panier
  }
  s.onFloor = false;
  showCat();
});
// On l'a rappelé ailleurs : il disparaît d'ici
window.desk.onLeave(() => { endGame(false); endCare(false); stopScript(); here = false; hideCat(); closePanel(); grave.classList.remove('show'); if (pension.classList.contains('show')) hideSign(); });

// Le passage a échoué (écran débranché, personne chez l'ami) : il revient
window.desk.onBounce((side) => {
  s.thrown = false;
  s.x = side === 'right' ? W - cw : 0;
  s.vx = side === 'right' ? -300 : 300;
  here = true;
  showCat();
});

// =====================================================================
//  Taille selon l'âge
// =====================================================================
function setSize(stage) {
  const k = stage === 'kitten' ? 0.58 : 1; // un chaton est tout petit
  if (k === K && cat.style.width) return;
  const bottom = s.y + ch;
  K = k; cw = BASE_W * K; ch = BASE_H * K; U = cw / 140;
  cat.style.width = cw + 'px'; cat.style.height = ch + 'px';
  s.y = bottom - ch;
}
const speedK = () => {
  if (!state) return 1;
  const ageK = state.stage === 'kitten' ? 0.75 : state.stage === 'senior' ? 0.7 : 1;
  const fatK = state.fat > 62 ? 1 - (state.fat - 62) / 90 : 1;
  return ageK * fatK;
};

// =====================================================================
//  Souris
// =====================================================================
for (const node of document.querySelectorAll('.hit')) {
  node.addEventListener('mouseenter', () => window.desk.setClickable(true));
  node.addEventListener('mouseleave', () => { if (!captured()) window.desk.setClickable(false); });
}
// La souris est « prise » par la page (jeu de la ficelle, brosse, main, glisser-déposer…)
const captured = () => s.dragging || setupOpen || ball.held || poufDrag || (game && game.name === 'wand') || (care && care.capture);

cat.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || !state || state.dead || state.boarding || captured()) return;
  s.dragging = true; s.onFloor = false; s.onPouf = false;
  s.vx = s.vy = s.vrot = 0;
  dragOffset = { x: e.clientX - s.x, y: e.clientY - s.y };
  samples = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
  override = null; stopScript();
  if (game && game.name === 'ball' && ball.inMouth) ball.inMouth = false; // il lâche la balle
  if (state.asleep && !GUEST) window.desk.event('grab'); // le réveille (réaction envoyée par le moteur)
  else icon('surprise');
});

// Les mouvements de souris arrivent même quand les clics traversent la fenêtre (Windows)
let lastMouseT = 0;
window.addEventListener('mousemove', (e) => {
  const now = performance.now();
  const d = Math.hypot(e.clientX - mouse.x, e.clientY - mouse.y);
  mouse.speed = mouse.speed * 0.8 + (d / Math.max((now - lastMouseT) / 1000, 0.008)) * 0.2;
  lastMouseT = now;
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true; mouse.lastMove = now;
  if (poufDrag) { placePouf(null, e.clientX - poufDrag); return; }
  if (!s.dragging && !ball.held) return;
  samples.push({ x: e.clientX, y: e.clientY, t: now });
  samples = samples.filter(p => now - p.t < 80);
  if (s.dragging) { s.x = e.clientX - dragOffset.x; s.y = e.clientY - dragOffset.y; }
  if (ball.held) { ball.x = e.clientX; ball.y = e.clientY; }
});

function throwVelocity() {
  if (samples.length < 2) return { vx: 0, vy: 0 };
  const a = samples[0], b = samples[samples.length - 1];
  const dt = Math.max((b.t - a.t) / 1000, 0.001);
  return { vx: clamp((b.x - a.x) / dt, -MAX_THROW, MAX_THROW), vy: clamp((b.y - a.y) / dt, -MAX_THROW, MAX_THROW) };
}

function release() {
  if (poufDrag) {
    poufDrag = null;
    const side = mouse.x <= 20 ? 'left' : mouse.x >= W - 20 ? 'right' : null; // lâché contre un bord (ou au-delà)
    if (side) window.desk.movePouf(side);
    else window.desk.setPouf((poufX + POUF_W / 2) / W);
    if (!poufEl.matches(':hover')) window.desk.setClickable(false);
    return;
  }
  if (ball.held) releaseBall();
  if (!s.dragging) return;
  s.dragging = false;
  const v = throwVelocity();
  s.vx = v.vx; s.vy = v.vy; s.vrot = s.vx * 0.12;
  s.thrown = true; // seul un lancer peut l'envoyer sur un autre écran
  if (Math.hypot(s.vx, s.vy) > 1500) icon('dizzy', 1200);
  activity = { name: 'sit', until: performance.now() + 3000 };
  if (!cat.matches(':hover') && !panel.matches(':hover')) window.desk.setClickable(false);
}
window.addEventListener('mouseup', release);
// La souris sort de l'écran en tenant le chat : on le lâche avec son élan
document.documentElement.addEventListener('mouseleave', () => { mouse.inside = false; release(); });

for (const node of [cat, grave, pension]) {
  node.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!captured()) window.desk.showMenu(); });
}
// Ficelle, brosse ou main : clic droit ou Échap pour arrêter
document.addEventListener('contextmenu', (e) => {
  if (game && game.name === 'wand') { e.preventDefault(); endGame(true); }
  else if (care && care.capture) { e.preventDefault(); endCare(true); }
});
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (game) endGame(true);
  if (care) endCare(true);
});

// Le pouf se déplace à la souris (glisser-déposer)
let poufDrag = null;
poufEl.addEventListener('mousedown', (e) => { if (e.button === 0) { poufDrag = e.clientX - poufX; e.preventDefault(); } });

// =====================================================================
//  Boucle principale
// =====================================================================
let last = performance.now();
let lastPos = 0;
function tick(now) {
  // Le chat n'est pas sur cet écran (et rien ne bouge ici) : on tourne au ralenti pour économiser le processeur
  if (s.gone && !game && !care && !treat.visible && !poufDrag) { last = now; setTimeout(() => requestAnimationFrame(tick), 250); return; }
  const dt = Math.min((now - last) / 1000, 0.033);
  last = now;
  const x0 = s.x;

  for (const [id, o] of others) if (now - o.t > 1200) others.delete(id);
  if (game) updateGame(dt, now);
  if (care) updateCare(dt, now);
  if (!s.dragging && !s.gone) {
    think(now);
    physics(dt);
  }
  draw(now, dt, Math.abs(s.x - x0));
  updateTreat(dt);
  // Position partagée avec les autres chats de l'écran (visites)
  if (here && !s.gone && now - lastPos > 200) {
    lastPos = now;
    window.desk.pos({ x: s.x, y: s.y, cw, ch, faceLeft: s.faceLeft, pose: shownPose, asleep: !!(state && state.asleep), onPouf: s.onPouf,
      pouf: home && !GUEST && poufX !== null ? { x: poufX, w: POUF_W } : null });
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

const groundY = () => floorY - (s.onPouf ? POUF_LIFT * (0.6 + 0.4 * K) : 0);

function physics(dt) {
  s.vy += GRAVITY * dt;
  s.vx *= AIR_DRAG; s.vy *= AIR_DRAG;
  s.x += s.vx * dt; s.y += s.vy * dt;
  s.rot += s.vrot * dt;

  const g = groundY();
  if (s.y + ch >= g) {
    s.y = g - ch;
    if (!s.onFloor && s.vy > 250) flash('squash', 130); // il s'écrase un peu en atterrissant
    if (Math.abs(s.vy) > 300) {
      s.vy = -s.vy * BOUNCE;
      if (Math.abs(s.vy) > 900) dizzy();
    } else {
      s.vy = 0; s.onFloor = true;
      if (Math.abs(s.vx) < 150) s.thrown = false;
    }
    if (!isMoving()) s.vx *= FLOOR_FRICTION;
    s.vrot *= 0.6;
  } else {
    s.onFloor = false;
  }
  if (s.y < 0) { s.y = 0; s.vy = -s.vy * BOUNCE; }

  sideEdge('left');
  sideEdge('right');
  if (s.onFloor) s.rot *= 0.8;
  if (Math.abs(s.vx) > 15 && !override && !(activity.name === 'crazy' && performance.now() < activity.spinUntil) && !(care && care.mode === 'love')) s.faceLeft = s.vx < 0;
}

const now2 = () => performance.now();
const isMoving = () => ['walk', 'run', 'chase', 'flee', 'hunt', 'crazy'].includes(activity.name) || (activity.name === 'script' && activity.steps[activity.i] && ('walk' in activity.steps[activity.i] || 'exit' in activity.steps[activity.i]));

// Petit saut (avec étirement au décollage)
function hop(vy, vx) {
  if (!s.onFloor) return;
  flash('stretch', 140);
  const k = Math.sqrt(speedK());
  s.vy = -vy * k; s.vx = vx; s.onFloor = false; s.onPouf = false;
}

// Bords gauche/droite : autre écran, ami, retour chez lui (invité) ou mur
function sideEdge(side) {
  const out = side === 'left' ? s.x < 0 : s.x + cw > W;
  if (!out) return;
  // Pendant un jeu ou quand il se promène tout seul, les bords sont des murs : seul un lancer le fait changer d'écran
  let kind = !game && (s.thrown || s.travel) ? edges[side] : 'wall';
  if (s.travel && !s.thrown && kind !== 'screen') kind = 'wall'; // il va à son panier : jamais chez un ami
  if (kind === 'screen' || kind === 'friend' || kind === 'home') {
    const gone = side === 'left' ? s.x + cw < 0 : s.x > W;
    if (gone) handOff(side, kind);
    return;
  }
  const speed = Math.abs(s.vx);
  s.x = side === 'left' ? 0 : W - cw;
  s.vx = (side === 'left' ? 1 : -1) * speed * BOUNCE;
  s.vrot = -s.vrot * 0.5;
  if (isMoving() && activity.name !== 'script' && activity.name !== 'crazy') activity.until = 0;
}

function handOff(side, kind) {
  s.travel = false;
  // Parti chez l'ami : cette fenêtre reste « la sienne » (elle affiche la pancarte, et il reviendra ici)
  here = kind === 'friend';
  window.desk.exit({ side, y: s.y, vx: s.vx, vy: s.vy, rot: s.rot, nap: napGoal || 0 });
  napGoal = null;
  stopScript(); // le trajet est fini ici (s'il revient, il repart de zéro)
  hideCat();
  closePanel();
}

// =====================================================================
//  Comportement : calme par défaut, routines visuelles, vie à deux
// =====================================================================
const canSocialize = () => state && !state.asleep && !state.dead && !game && !care && !override && activity.name !== 'script';

function think(now) {
  if (!state || state.dead || state.boarding || override || game || (care && care.mode !== 'love')) return;

  if (s.onPouf && Math.abs(s.vx) > 5) s.onPouf = false; // il descend du panier
  if (activity.name === 'script') { runScript(now); return; }

  // Endormi : il va dormir sur son pouf (ou contre un autre chat qui dort)
  if (state.asleep) {
    if (activity.name !== 'sleep') goToSleep(now);
    else {
      s.vx = 0;
      // Pendant la sieste (pas la nuit), il se réveille à moitié toutes les 20 min
      if (state.nightSleep) napStirAt = 0;
      else if (!napStirAt) napStirAt = now + STIR_EVERY;
      else if (now >= napStirAt) { napStirAt = 0; stirDuringNap(); }
    }
    return;
  }
  napStirAt = 0;
  if (activity.name === 'sleep') { s.onPouf = false; activity = { name: 'stretch', until: now + 1600 }; pulse('yawning', 1400); }
  if (care && care.mode === 'love') { followHand(now); return; }
  if (!s.onFloor) return;

  // Un nouveau chat arrive : il va le saluer tout de suite
  if (canSocialize()) {
    for (const [id, o] of others) if (!greeted.has(id)) { greeted.add(id); greet(id, o); return; }
  }

  // Chasse au curseur (rare) : la souris bouge vite près de lui alors qu'il est tranquille
  const tier = state.expr.tier;
  if (['sit', 'loaf'].includes(activity.name) && ['ecstatic', 'happy'].includes(tier) && state.personality !== 'timide' && mouse.inside
      && now - mouse.lastMove < 300 && mouse.speed > 400 && now - lastHunt > 180000) {
    const dx = mouse.x - (s.x + cw / 2);
    if (Math.abs(dx) < 300 && mouse.y > floorY - 260) {
      activity = { name: 'hunt', phase: 'stalk', until: now + 1300 };
      s.faceLeft = dx < 0; s.vx = 0; lastHunt = now;
      return;
    }
  }

  switch (activity.name) {
    case 'hunt':
      s.vx = 0;
      if (now > activity.until) { // bond !
        const dx = mouse.x - (s.x + cw / 2);
        hop(clamp(540 + (floorY - mouse.y) * 0.5, 500, 850), clamp(dx * 1.8, -420, 420));
        activity = { name: 'sit', until: now + 6000 };
      }
      return;
    case 'crazy': crazyTick(now); return;
    case 'chase': case 'flee': {
      const o = others.get(activity.id || activity.from);
      if (!o || now > activity.until) { if (o) cuddle(); else nextActivity(now); return; } // puis retour au panier, ensemble
      const ox = o.x + o.cw / 2, me = s.x + cw / 2;
      const dir = activity.name === 'chase' ? Math.sign(ox - me) : -Math.sign(ox - me) || 1;
      s.vx = dir * RUN * 0.85 * speedK();
      if (activity.name === 'chase' && Math.abs(ox - me) < (cw + o.cw) * 0.35) { // rattrapé : petit bond joueur
        hop(420, dir * 160); activity = { name: 'chase', id: activity.id, until: now + 900 }; // petit bond, puis retour au panier
      }
      return;
    }
  }

  if (activity.name === 'walk' || activity.name === 'run') {
    const dx = activity.target - s.x;
    if (Math.abs(dx) < 6 || now > activity.until) { s.vx *= 0.3; nextActivity(now); return; }
    const base = activity.name === 'run' ? RUN : WALK;
    s.vx = Math.sign(dx) * base * speedK() * (tier === 'dramatic' ? 0.6 : 1);
    return;
  }
  if (now > activity.until) nextActivity(now);
}

function nextActivity(now) {
  const n = state.needs, tier = state.expr.tier;
  const rand = (a, b) => a + Math.random() * (b - a);
  if (maybeBeg(now)) return;

  // Un autre chat est là : on le salue d'abord, puis on joue ou on se blottit contre lui
  if (canSocialize() || activity.name === 'sit' || activity.name === 'loaf') {
    for (const [id, o] of others) {
      if (!greeted.has(id)) { greeted.add(id); greet(id, o); return; }
    }
  }

  // Calme par défaut : surtout assis, couché ou à faire sa toilette ; on marche de temps en temps
  const w = {
    ecstatic: { sit: 4, loaf: 2, groom: 1.5, walk: 1.4, roll: 0.6, knead: 0.5, stretch: 0.4 },
    happy: { sit: 5, loaf: 3, groom: 2, walk: 1.2, roll: 0.3, knead: 0.5, stretch: 0.4 },
    smile: { sit: 5, loaf: 4, groom: 1.5, walk: 1, stretch: 0.3 },
    grumpy: { sit: 6, loaf: 3, walk: 0.4 },
    dramatic: { loaf: 6, sit: 2, walk: 0.3 },
    dying: { loaf: 1 }
  }[tier] || { sit: 1 };
  if (others.size && n.energy > 30 && ['ecstatic', 'happy', 'smile', 'grumpy'].includes(tier)) w.chase = 1.5;
  if (others.size) { w.cuddle = 4; if (w.walk) w.walk *= 0.4; if (w.crazy) w.crazy *= 0.5; }
  // Son quart d'heure de folie : 30 s à courir et sauter partout, au plus une fois par heure
  if (crazyAllowed() && n.energy > 40 && ['ecstatic', 'happy', 'smile'].includes(tier)) w.crazy = 0.5;
  if (n.energy < LOW) { w.loaf = (w.loaf || 0) + 4; if (w.chase) w.chase *= 0.15; }
  if (state.stage === 'kitten') { if (w.crazy) w.crazy *= 1.6; if (w.roll) w.roll *= 1.6; }
  if (state.stage === 'senior') { w.loaf = (w.loaf || 0) + 2; if (w.crazy) w.crazy *= 0.3; }
  if (state.fat > 75 && w.crazy) w.crazy *= 0.4;
  applyPersonality(w);
  if (n.energy < 60) w.nap = 1; // un peu fatigué : petite sieste dans son panier
  if (raining()) { w.nap = 4; if (w.walk) w.walk *= 0.5; }
  if (hot()) { w.loaf = (w.loaf || 0) + 3; if (w.walk) w.walk *= 0.6; if (w.crazy) w.crazy *= 0.3; }

  const name = weighted(w);
  const target = () => clamp(s.x + rand(-280, 280), 10, W - cw - 10);
  switch (name) {
    case 'walk': activity = { name, target: target(), until: now + 12000 }; break;
    case 'crazy': startCrazy(now); break;
    case 'nap': if (raining() && Math.random() < 0.5) icon('rain', 1600); goToBasket(false, rand(60000, 120000)); break;
    case 'approach': // (câlin) il vient s'asseoir près de toi
      if (mouse.inside && now - mouse.lastMove < 20000) { activity = { name: 'walk', target: clamp(mouse.x - cw / 2 + (mouse.x > catCenter() ? -60 : 60), 0, W - cw), until: now + 10000 }; break; }
      activity = { name: 'sit', until: now + rand(15000, 30000) }; break;
    case 'chase': { const id = [...others.keys()][0]; activity = { name, id, until: now + 3500 }; window.desk.social(id, 'chased'); break; }
    case 'cuddle': cuddle(); break;
    case 'roll': activity = { name, until: now + rand(3000, 5000) }; break;
    case 'knead': if (!restInBasket('knead', rand(5000, 9000))) activity = { name, until: now + rand(5000, 9000) }; break;
    case 'stretch': activity = { name, until: now + 1600 }; pulse('yawning', 1400); break;
    case 'groom': activity = { name, until: now + rand(5000, 9000) }; break;
    case 'loaf': if (!restInBasket('loaf', rand(30000, 90000))) activity = { name, until: now + rand(30000, 90000) }; break;
    default: activity = { name: 'sit', until: now + rand(15000, 45000) };
  }
}

function weighted(w) {
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [k, v] of Object.entries(w)) { if ((r -= v) < 0) return k; }
  return Object.keys(w)[0];
}

// ---- Saisons et météo ----
let weather = null; // { kind, temp, isDay } ou null (pas de ville choisie)
function season() { const m = new Date().getMonth(); return m < 2 || m === 11 ? 'winter' : m < 5 ? 'spring' : m < 8 ? 'summer' : 'autumn'; }
const raining = () => weather && (weather.kind === 'rain' || weather.kind === 'storm');
const hot = () => weather && weather.temp >= 27;
function applySeason() {
  const sn = season();
  const cold = weather ? weather.temp < 5 : sn === 'winter';
  cat.classList.toggle('winter', cold || (sn === 'winter' && !(weather && weather.temp > 15)));
  cat.classList.toggle('spring', sn === 'spring');
  cat.classList.toggle('hot', !!hot());
}
applySeason();
// Feuilles en automne, flocons quand il neige, de temps en temps autour du chat
setInterval(() => {
  if (!here || s.gone || !state || document.hidden) return;
  const snow = weather && weather.kind === 'snow';
  if (snow || (season() === 'autumn' && Math.random() < 0.08)) {
    const f = document.createElement('div');
    f.className = 'fall';
    f.innerHTML = window.CAT_PROPS[snow ? 'flake' : 'leaf'];
    f.style.left = (catCenter() + (Math.random() - 0.5) * 300) + 'px';
    f.style.top = (s.y - 200 - Math.random() * 100) + 'px';
    f.style.setProperty('--dy', (300 + Math.random() * 60) + 'px');
    f.style.setProperty('--dx', ((Math.random() - 0.5) * 120) + 'px');
    f.style.setProperty('--t', (snow ? 6 : 5) + 's');
    fxLayer.append(f);
    setTimeout(() => f.remove(), 6500);
  }
}, 1500);

// ---- Il réclame : à manger (il va à son coin repas et tapote sa gamelle vide), ou à jouer ----
let lastBeg = -Infinity, begBowlTimer = null;
const mealSpot = () => clamp(poufX !== null ? poufX - 80 : W * 0.3, 60, W - 60); // à côté du pouf
function hideBegBowl() { clearTimeout(begBowlTimer); if (foodEl.classList.contains('beg')) foodEl.classList.remove('show', 'beg', 'empty'); }
function maybeBeg(now) {
  if (now - lastBeg < 90000 || state.asleep || others.size) return false;
  const n = state.needs;
  const hungry = n.hunger < (state.personality === 'gourmand' ? 50 : 30);
  if (hungry && home) {
    lastBeg = now;
    const bx = mealSpot();
    const side = catCenter() < bx ? -1 : 1;
    const tap = () => [
      { pose: 'swat', ms: 700, face: { eyes: 'open', mouth: 'o' }, onStart: () => icon('fish', 1300) },
      { pose: 'sit', ms: 1600, face: { eyes: 'open', mouth: 'smile' } }
    ];
    script([
      { walk: bx + side * (cw * 0.35 + 22) - cw / 2 },
      { fn: () => {
        foodEl.classList.add('show', 'empty', 'beg'); placeProp(foodEl, bx); // sa gamelle vide
        clearTimeout(begBowlTimer); begBowlTimer = setTimeout(hideBegBowl, 90000);
        s.faceLeft = side > 0;
      } },
      ...tap(), ...tap(), ...tap(),
      { pose: 'sit', ms: 15000, face: { eyes: 'open', mouth: 'smile' } }
    ]);
    return true;
  }
  if (n.mood < 40 && n.energy > 30 && mouse.inside && now - mouse.lastMove < 30000) {
    lastBeg = now;
    script([
      { walk: mouse.x - cw / 2 + (mouse.x > catCenter() ? -50 : 50) },
      { pose: 'sit', ms: 1800, onStart: () => icon('ball', 1600), face: { eyes: 'open', mouth: 'o' } },
      { pose: 'sit', ms: 1800, onStart: () => icon('ball', 1600), face: { eyes: 'open', mouth: 'o' } }
    ]);
    return true;
  }
  return false;
}

// ---- Le caractère change ses habitudes ----
function applyPersonality(w) {
  switch (state.personality) {
    case 'calin': w.approach = 1.2; if (w.cuddle) w.cuddle *= 1.5; break;      // vient s'asseoir près de toi
    case 'joueur': if (w.crazy) w.crazy *= 2; if (w.walk) w.walk *= 1.4; if (w.roll) w.roll *= 1.5; break;
    case 'paresseux': w.loaf = (w.loaf || 0) + 4; if (w.walk) w.walk *= 0.5; if (w.crazy) w.crazy *= 0.3; break;
    case 'timide': if (w.walk) w.walk *= 0.7; if (w.chase) w.chase *= 0.5; break;
  }
}

// ---- Le quart d'heure de folie (au plus une fois par heure, mémorisé pour toutes les fenêtres) ----
const CRAZY_MS = 30000, CRAZY_EVERY = 3600000;
function lastCrazy() { try { return Number(localStorage.getItem('lastCrazy')) || 0; } catch { return 0; } }
function crazyAllowed() { return Date.now() - lastCrazy() > CRAZY_EVERY; }
function startCrazy(now) {
  try { localStorage.setItem('lastCrazy', String(Date.now())); } catch {}
  activity = { name: 'crazy', until: now + CRAZY_MS, target: null, spinUntil: 0, nextFlip: 0, pauseUntil: 0, t: now };
  renderLook();
}
// Comme un vrai chat : il démarre en trombe, freine en dérapant avant de faire demi-tour,
// s'arrête net (aux aguets) puis repart, bondit dans le sens de sa course, court après sa queue.
function crazyTick(now) {
  const a = activity;
  const dt = Math.min((now - a.t) / 1000, 0.05); a.t = now;
  if (now > a.until) { activity = { name: 'loaf', until: now + 60000 }; pulse('yawning', 1400); renderLook(); return; } // épuisé : il se couche
  if (!s.onFloor) return;
  if (now < a.spinUntil) { // il court après sa queue (il se retourne sans cesse)
    s.vx *= 0.8;
    if (now > a.nextFlip) { s.faceLeft = !s.faceLeft; a.nextFlip = now + 260; }
    return;
  }
  if (now < a.pauseUntil) { s.vx *= Math.exp(-dt * 10); return; } // arrêt net, aux aguets
  const top = RUN * 1.3 * speedK();
  if (a.target === null || Math.abs(a.target - (s.x + cw / 2)) < 30) {
    const r = Math.random();
    if (r < 0.14) { a.spinUntil = now + 1100; a.target = null; return; }
    if (r < 0.32) { a.pauseUntil = now + 300 + Math.random() * 700; a.target = null; return; }
    // nouvelle cible, plutôt loin (il traverse l'écran)
    const far = s.x + cw / 2 < W / 2 ? W * (0.6 + Math.random() * 0.35) : W * (0.05 + Math.random() * 0.35);
    a.target = clamp(far, cw / 2, W - cw / 2);
  }
  const dir = Math.sign(a.target - (s.x + cw / 2));
  const want = dir * top;
  // Accélère vite, freine encore plus vite (dérapage) quand il change de sens
  const turning = Math.sign(s.vx) !== dir && Math.abs(s.vx) > 30;
  s.vx += (want - s.vx) * (1 - Math.exp(-dt * (turning ? 9 : 4)));
  // Bond en pleine course, dans le même sens
  if (!turning && Math.abs(s.vx) > top * 0.7 && Math.random() < dt * 0.9) hop(420 + Math.random() * 300, s.vx * 1.15);
}

// Saluer un autre chat : il va à côté de lui, se tourne vers lui, petit bisou de nez
function greet(id, o) {
  const side = (s.x + cw / 2) < (o.x + o.cw / 2) ? -1 : 1;
  const x = clamp(o.x + o.cw / 2 + side * (o.cw * 0.45 + cw * 0.45) - cw / 2, 0, W - cw);
  script([
    { walk: x },
    { fn: () => { s.faceLeft = side > 0; } },
    { pose: 'sit', ms: 1800, face: { eyes: 'joy', mouth: 'smile' }, cls: ['love'], onStart: () => icon('heart', 1500) }
  ]);
}

// Le panier : le mien (écran maison) ou celui de l'autre chat (je suis invité chez lui)
function sharedPouf() {
  if (home && !GUEST && poufX !== null) return { x: poufX, w: POUF_W };
  for (const o of others.values()) if (o.pouf) return o.pouf;
  return null;
}
// Place dans le panier quand on est deux : le chat de la maison à gauche, l'invité à droite, tournés l'un vers l'autre
function poufSlot(p) { return clamp(p.x + p.w / 2 + (GUEST ? 1 : -1) * p.w * 0.18 - cw / 2, 0, W - cw); }

// Se blottir contre l'autre chat, dans le panier (ou à côté de lui s'il n'y a pas de panier)
function cuddle() {
  const rand = (a, b) => a + Math.random() * (b - a);
  const p = sharedPouf();
  const o = [...others.values()][0];
  if (!p && !o) { activity = { name: 'loaf', until: performance.now() + 30000 }; return; }
  let x, faceLeft;
  if (p && others.size) { x = poufSlot(p); faceLeft = !!GUEST; }
  else {
    const side = (s.x + cw / 2) < (o.x + o.cw / 2) ? -1 : 1;
    x = clamp(o.x + o.cw / 2 + side * (o.cw * 0.32 + cw * 0.32) - cw / 2, 0, W - cw); faceLeft = side > 0;
  }
  script([
    { walk: x },
    { fn: () => { if (p) s.onPouf = true; s.faceLeft = faceLeft; } },
    { pose: 'knead', ms: 2200, cls: ['purr'], face: { eyes: 'joy' } },
    { pose: 'loaf', ms: rand(35000, 70000), cls: ['purr'], face: { eyes: 'closed' } }
  ]);
}

// Aller au panier pour dormir (nuit) ou faire la sieste : blotti contre l'autre chat s'il y en a un.
// Si le panier est sur un autre de mes écrans, il y va à pied en passant d'un écran à l'autre.
function goToBasket(sleep, napMs) {
  const p = sharedPouf();
  const done = sleep
    ? [{ fn: () => { activity = { name: 'sleep' }; } }]
    : [{ pose: 'loaf', ms: napMs, face: { eyes: 'closed' }, cls: ['purr'] }];
  if (p) {
    const x = others.size ? poufSlot(p) : p.x + p.w / 2 - cw / 2;
    script([
      { walk: x, slow: sleep },
      { fn: () => { s.onPouf = true; if (others.size) s.faceLeft = !!GUEST; } },
      { pose: 'knead', ms: 1600, face: { eyes: 'closed' }, cls: ['purr'] },
      ...done
    ]);
    return;
  }
  if (poufDir && !GUEST) { // le panier est sur un autre écran : il y va (en baillant)
    const dir = poufDir === 'left' ? -1 : 1;
    napGoal = sleep ? null : napMs; // à l'arrivée, il continuera jusqu'à son panier
    script([{ exit: dir }]);
    return;
  }
  // Pas de panier ici (invité sans panier à portée) : contre l'autre chat s'il dort, sinon sur place
  const sleeper = [...others.values()].find(o => o.asleep);
  if (!sleeper) { if (sleep) activity = { name: 'sleep' }; else script(done); return; }
  const x = clamp(sleeper.x + (sleeper.x > s.x ? -1 : 1) * sleeper.cw * 0.55, 0, W - cw);
  script([{ walk: x, slow: true }, ...done]);
}
function goToSleep() { goToBasket(true); }

// Petit réveil pendant la sieste : il s'étire, fait quelques pas, puis retourne se coucher dans son panier
// (s'il est à 100 % d'énergie, le moteur l'a déjà réveillé pour de bon)
const STIR_EVERY = 20 * 60000;
let napStirAt = 0;
function stirDuringNap() {
  const rand = (a, b) => a + Math.random() * (b - a);
  const sleepy = { eyes: 'open', lids: 'tired', mouth: 'smile' };
  const dir = s.x + cw / 2 < W / 2 ? 1 : -1;
  const x = clamp(s.x + dir * rand(70, 150) * K, 0, W - cw);
  script([
    { pose: 'stretch', ms: 1800, face: { eyes: 'closed', mouth: 'yawn' } },
    { walk: x, slow: true, face: sleepy },
    { pose: 'sit', ms: rand(2500, 5000), face: sleepy },
    { fn: () => { if (state.asleep) goToSleep(); else activity = { name: 'stretch', until: performance.now() + 1600 }; } }
  ]);
}

// Se coucher ou pétrir : dans son panier s'il est sur cet écran (sinon là où il est)
function restInBasket(pose, ms) {
  const p = sharedPouf();
  if (state.expr.tier === 'dying') return false;
  if (!p) {
    // Son panier est sur un autre de mes écrans : il y va pour se reposer (pas quand un ami est là)
    if (pose === 'loaf' && poufDir && !GUEST && !others.size) { goToBasket(false, ms); return true; }
    return false;
  }
  const x = others.size ? poufSlot(p) : p.x + p.w / 2 - cw / 2;
  script([
    { walk: x },
    { fn: () => { s.onPouf = true; if (others.size) s.faceLeft = !!GUEST; } },
    { pose, ms }
  ]);
  return true;
}

// ---- Scripts : petites séquences d'actions (marcher jusqu'ici, faire ça pendant tant de temps…) ----
function script(steps) { activity = { name: 'script', steps, i: 0, t0: performance.now(), started: false }; }
function stopScript() {
  if (activity.name !== 'script') return;
  const st = activity.steps[activity.i];
  if (st && st.onEnd) st.onEnd();
  for (const step of activity.steps.slice(activity.i)) if (step.cleanup) step.cleanup();
  activity = { name: 'sit', until: performance.now() + 5000 };
}
function runScript(now) {
  const a = activity, st = a.steps[a.i];
  if (!st) { activity = { name: 'sit', until: now + 8000 }; renderLook(); return; }
  if (!a.started) { a.started = true; a.t0 = now; if (st.onStart) st.onStart(); renderLook(); }
  const next = () => { if (st.onEnd) st.onEnd(); a.i++; a.started = false; };
  if ('fn' in st) { st.fn(); if (activity === a) next(); return; }
  if ('exit' in st) { // traverser vers l'écran voisin (le processus principal le fait passer)
    if (edges[st.exit < 0 ? 'left' : 'right'] !== 'screen') { s.travel = false; napGoal = null; stopScript(); return; } // l'écran a disparu
    if (!s.onFloor) return;
    s.onPouf = false; s.travel = true;
    s.vx = st.exit * WALK * 0.8 * speedK(); s.faceLeft = st.exit < 0;
    return;
  }
  if ('walk' in st) {
    if (!s.onFloor) return;
    const dx = clamp(st.walk, 0, W - cw) - s.x; // jamais au-delà des bords de l'écran
    if (Math.abs(dx) < 5) { s.vx = 0; next(); return; }
    s.vx = Math.sign(dx) * WALK * (st.slow ? 0.6 : 1) * speedK();
    return;
  }
  s.vx = 0;
  if (st.until ? st.until() : now - a.t0 >= st.ms) next();
}
const scriptStep = () => (activity.name === 'script' && activity.started ? activity.steps[activity.i] : null);

// Quelle pose afficher maintenant ?
function currentPose() {
  if (!state) return 'sit';
  if (state.dead) return 'sit';
  if (override && override.pose) return override.pose;
  if (s.dragging || !s.onFloor) return 'jump';
  if (care) return care.pose || 'sit';
  const st = scriptStep();
  if (st) return 'walk' in st || 'exit' in st ? 'walk' : st.pose || 'sit';
  if (state.asleep) return activity.name === 'sleep' ? 'sleep' : 'walk';
  if (game && game.pose) return game.pose;
  if (state.expr.tier === 'dying') return 'loaf';
  switch (activity.name) {
    case 'walk': return 'walk';
    case 'run': case 'chase': case 'flee': return 'run';
    case 'crazy': return now2() < activity.spinUntil ? 'stand' : Math.abs(s.vx) > 30 ? 'run' : 'crouch';
    case 'hunt': return 'crouch';
    case 'spin': return 'stand';
    case 'groom': case 'roll': case 'knead': case 'stretch': case 'loaf': return activity.name;
    case 'nap': return 'loaf';
    default: return Math.abs(s.vx) > 40 ? 'stand' : 'sit';
  }
}

let shownPose = '';
function setPose(p) {
  if (p === shownPose) return;
  cat.classList.remove('pose-' + shownPose);
  cat.classList.add('pose-' + p);
  shownPose = p;
}

// Point du dessin (unités SVG) -> px à l'écran, selon l'orientation
function toPx(ux, uy) {
  return { x: s.x + (s.faceLeft ? 140 - ux : ux) * U, y: s.y + uy * (ch / 100) };
}
const headUnits = () => {
  if (SIDE_POSES.includes(shownPose)) return { x: 101, y: 30 };
  if (['loaf', 'sleep', 'knead'].includes(shownPose)) return { x: 90, y: 62 };
  if (shownPose === 'roll') return { x: 52, y: 66 };
  if (['eat', 'drink'].includes(shownPose)) return { x: 70, y: 54 };
  return { x: 70, y: 40 };
};
function mouthPoint() { const h = headUnits(); return toPx(h.x, h.y + 14); }
const catCenter = () => s.x + cw / 2;
const overCat = (x, y) => x > s.x + cw * 0.15 && x < s.x + cw * 0.85 && y > s.y + ch * 0.1 && y < s.y + ch;

// =====================================================================
//  Affichage
// =====================================================================
let look = { lx: 0, ly: 0, tilt: 0 };
function draw(now, dt, moved) {
  setPose(currentPose());
  cat.classList.toggle('face-left', s.faceLeft);
  cat.classList.toggle('falling', s.vy > 0);
  if (override && now > override.until) { override = null; renderLook(); }

  // Pattes articulées (corps de profil)
  if (!rig && svg()) rig = new window.CatRig(svg());
  let bob = 0;
  if (rig) {
    const rp = shownPose === 'jump' ? (s.vy > 0 ? 'fall' : 'jump')
      : ['walk', 'run', 'crouch', 'stretch', 'roll', 'scratch'].includes(shownPose) ? shownPose : 'stand';
    bob = rig.update(dt, rp, moved / U) * U;
    cat.style.setProperty('--ext', rig.ext.toFixed(3));
  }
  cat.style.left = s.x + 'px';
  cat.style.top = s.y + 'px';
  const el = svg(); if (el) el.style.transform = `translateY(${bob.toFixed(2)}px) rotate(${s.rot}deg)`;
  const h = headUnits();
  const zp = toPx(h.x + 16, h.y - 22);
  zzz.style.left = zp.x + 'px'; zzz.style.top = zp.y + 'px';
  placeBubble();
  if (GUEST) { tagEl.style.display = s.gone ? 'none' : 'block'; tagEl.style.left = (s.x + cw / 2 - tagEl.offsetWidth / 2) + 'px'; tagEl.style.top = (s.y + ch + 2) + 'px'; }
  drawGame();
  drawCare();
  updateLook(now);
}

// Les yeux (et un peu la tête) suivent ce qui l'intéresse : la souris, la balle, la friandise, l'autre chat…
function updateLook(now) {
  if (s.gone || !state) return;
  const h = headUnits();
  const c = toPx(h.x, h.y);
  let target = { lx: 0, ly: 0, tilt: 0 };
  let tx = null, ty = null;
  const st = scriptStep();
  if (treat.visible) { tx = treat.x; ty = treat.y; }
  else if (game && game.name === 'ball' && ball.visible) { tx = ball.x; ty = ball.y; }
  else if (game && game.name === 'wand') { tx = toy.x; ty = toy.y; }
  else if (game && game.name === 'solo') { tx = mouseToy.x + 15; ty = mouseToy.y; }
  else if (care) { tx = mouse.x; ty = mouse.y; }
  else if (st && st.lookAt) { [tx, ty] = st.lookAt(); }
  else if (mouse.inside && now - mouse.lastMove < 4000) { tx = mouse.x; ty = mouse.y; }
  if (tx !== null) {
    const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / 120);
    target.lx = (dx / d) * 2.3 * k * (s.faceLeft ? -1 : 1); // le dessin est retourné quand il regarde à gauche
    target.ly = (dy / d) * 2.1 * k;
    target.tilt = d < 600 ? clamp(dx / 60, -8, 8) * (s.faceLeft ? -1 : 1) : 0;
    if (care && care.mode === 'love' && d < 220) target.tilt = clamp(dx / 18, -16, 16) * (s.faceLeft ? -1 : 1); // il tend la tête vers la main
  }
  if (['sleep', 'roll', 'groom', 'eat', 'drink'].includes(shownPose)) target = { lx: 0, ly: 0, tilt: 0 };
  look.lx += (target.lx - look.lx) * 0.2; look.ly += (target.ly - look.ly) * 0.2; look.tilt += (target.tilt - look.tilt) * 0.1;
  cat.style.setProperty('--lx', look.lx.toFixed(2));
  cat.style.setProperty('--ly', look.ly.toFixed(2));
  cat.style.setProperty('--tilt', look.tilt.toFixed(2));
}

function showCat() {
  s.gone = false;
  cat.style.display = 'block';
  renderLook();
}
function hideCat() {
  s.gone = true;
  cat.style.display = 'none';
  zzz.style.display = 'none';
  bubble.style.display = 'none';
  if (!setupOpen) window.desk.setClickable(false);
}

// ---- État du chat -> apparence ----
let lastNeed = null, lastNeedAt = 0;
let knownPoops = null; // crottes déjà montrées

function applyState(st) {
  if (!st) return;
  const prev = state;
  state = st;
  window.applyCatColors(cat, st.color);
  cat.style.setProperty('--fatx', (0.8 + st.fat * 0.004).toFixed(3)); // 50 -> 1, 100 -> 1,2
  setSize(st.stage);
  cat.classList.toggle('kitten', st.stage === 'kitten');
  cat.classList.toggle('senior', st.stage === 'senior');
  for (const t of document.querySelectorAll('.tuft-fill')) t.style.fill = st.color.fur;
  renderLook();
  if (panel.style.display === 'block') renderPanel();
  if (home && !GUEST) syncPoops(st, prev);
  if (!here) return;

  if (st.dead && !(prev && prev.dead)) { endGame(true); endCare(false); if (!s.gone) die(); else showGrave(); return; }
  if (st.visiting && !(prev && prev.visiting)) { endGame(false); endCare(false); hideCat(); closePanel(); showSign(`🧳 ${st.name} est chez ${st.visiting.nick} · clic droit pour le faire revenir`); return; }
  if (!st.visiting && prev && prev.visiting) hideSign();
  if (st.boarding && !(prev && prev.boarding)) { endGame(true); endCare(false); leaveForPension(); return; }
  if (!st.boarding && prev && prev.boarding) { backFromPension(); return; }
  if (st.dead || st.boarding || st.visiting) return;
  if (st.asleep && game) endGame(true);
  if (st.asleep && care) endCare(true);

  // Icône de besoin : tout de suite si c'est un nouveau besoin, sinon de temps en temps
  const now = Date.now();
  if (!game && !care && st.need && (st.need !== lastNeed || now - lastNeedAt > NEED_BUBBLE_MS)) {
    icon(st.need, 2500);
    lastNeedAt = now;
  }
  lastNeed = st.need;
}

// Yeux, bouche, sourcils et classes d'animation selon le palier d'humeur
function renderLook() {
  if (!state) return;
  const n = state.needs;
  const tier = state.expr.tier;
  const awake = !state.asleep && !state.dead;
  const c = cat.classList;
  const st = scriptStep();

  for (const t of ['ecstatic', 'happy', 'smile', 'grumpy', 'dramatic', 'dying']) c.toggle('tier-' + t, awake && tier === t);
  c.toggle('sick', state.sick && !state.dead);
  c.toggle('dirty', n.clean < LOW && !state.dead);
  c.toggle('big-pupils', awake && (tier === 'dramatic' || !!game || ['hunt', 'flee', 'crazy'].includes(activity.name)));
  c.toggle('zoomies', awake && activity.name === 'crazy');
  const extra = (override && override.cls) || (st && st.cls) || (care && care.cls) || (activity.name === 'knead' ? ['purr'] : []);
  for (const k of ['love', 'purr', 'lick']) c.toggle(k, extra.includes(k));

  let eyes = 'open', lids = 'none', brows = 'none', mouth = 'smile';
  if (state.dead || Date.now() < fx.dizzyUntil) { eyes = 'x'; mouth = 'sad'; }
  else if (state.asleep) { eyes = 'closed'; }
  else if (fx.yawning) { eyes = 'closed'; mouth = 'yawn'; }
  else {
    switch (tier) {
      case 'ecstatic': eyes = 'joy'; mouth = 'big'; break;
      case 'happy': eyes = fx.joy ? 'joy' : 'open'; break;
      case 'smile': break;
      case 'grumpy': lids = 'grumpy'; brows = 'angry'; mouth = 'flat'; break;
      case 'dramatic': brows = 'sad'; mouth = fx.wailing ? 'wail' : 'sad'; break;
      case 'dying': lids = 'dying'; brows = 'sad'; mouth = 'sad'; break;
    }
    if ((game || activity.name === 'hunt') && tier !== 'dying') { eyes = 'open'; lids = 'none'; brows = 'none'; mouth = game && game.happy ? 'big' : 'o'; }
    if (activity.name === 'knead' || activity.name === 'roll') { eyes = 'joy'; mouth = activity.name === 'roll' ? 'big' : 'smile'; }
    if (activity.name === 'nap') { eyes = 'closed'; mouth = 'smile'; }
    if (activity.name === 'crazy') { eyes = 'open'; lids = 'none'; brows = 'none'; mouth = 'smile'; }
    if (state.sick && tier !== 'dying') { brows = 'sad'; if (mouth === 'smile' || mouth === 'big') mouth = 'flat'; }
    if (n.energy < LOW && lids === 'none' && eyes === 'open' && !game) lids = 'tired';
    if (fx.blinking && eyes === 'open') eyes = 'closed';
  }
  const face = (override && override.face) || (st && st.face) || (care && care.face);
  if (face && !state.dead) ({ eyes, lids, brows, mouth } = { eyes, lids, brows, mouth, ...face });
  Object.assign(cat.dataset, { eyes, lids, brows, mouth });

  show(zzz, state.asleep && !s.gone && activity.name === 'sleep', 'block');
  cat.title = GUEST ? `${state.name}, le chat de ${state.guestOf}` : `${state.name} — clic droit pour s'en occuper`;
}

// =====================================================================
//  Routines visuelles (repas, friandise, véto, crotte, nettoyage)
// =====================================================================
function playAnim(name) {
  if (!here || s.gone || !state) return;
  const now = performance.now();
  stopScript();
  switch (name) {
    case 'eat': return mealScript();
    case 'treat': return treatScript();
    case 'heal': return healScript();
    case 'clean': return scoopPoops();
    case 'love': case 'meh': case 'hate': return startPet(name);
  }
}

function placeProp(el, centerX) {
  el.style.transform = `scale(${(0.65 + 0.35 * K).toFixed(2)})`; // gamelles à la taille du chat
  el.style.left = (centerX - el.offsetWidth / 2) + 'px';
  el.style.top = (floorY - el.offsetHeight + 2) + 'px';
}

// Repas : il boit d'abord, puis il mange
function mealScript() {
  const gap = 55 * K + 20;
  hideBegBowl();
  const c = clamp(home ? mealSpot() : catCenter(), cw / 2 + gap, W - cw / 2 - gap);
  const wx = c - gap, fx2 = c + gap;
  for (const [el, x] of [[waterEl, wx], [foodEl, fx2]]) { el.classList.remove('empty', 'busy'); el.classList.add('show'); placeProp(el, x); }
  const hide = () => { waterEl.classList.remove('show', 'busy'); foodEl.classList.remove('show', 'busy'); };
  script([
    { walk: wx - cw / 2 },
    { pose: 'drink', ms: 2600, face: { eyes: 'closed', mouth: 'smile' }, onStart: () => waterEl.classList.add('busy'), onEnd: () => waterEl.classList.add('empty') },
    { walk: fx2 - cw / 2 },
    { pose: 'eat', ms: 3200, face: { eyes: 'closed', mouth: 'smile' }, onStart: () => foodEl.classList.add('busy'), onEnd: () => foodEl.classList.add('empty') },
    { pose: 'sit', ms: 1200, cls: ['lick'], face: { eyes: 'joy' } },
    { fn: hide, cleanup: hide }
  ]);
}

// Friandise : elle tombe du ciel, il la guette, la rattrape et la croque
const treat = { x: 0, y: 0, vy: 0, visible: false };
function treatScript() {
  const m = mouthPoint();
  Object.assign(treat, { x: m.x + (s.faceLeft ? -10 : 10), y: Math.max(10, s.y - 160), vy: 0, visible: true });
  const hide = () => { treat.visible = false; treatEl.style.display = 'none'; };
  script([
    { pose: 'beg', until: () => treat.y >= mouthPoint().y - 24, face: { eyes: 'open', mouth: 'o' }, lookAt: () => [treat.x, treat.y] },
    { fn: () => { hop(320, 0); hide(); } },
    { pose: 'eat', ms: 1600, face: { eyes: 'closed', mouth: 'smile' } },
    { pose: 'sit', ms: 1000, cls: ['lick', 'love'], face: { eyes: 'joy' }, cleanup: hide }
  ]);
}
function updateTreat(dt) {
  if (!treat.visible) return;
  treat.vy += 600 * dt; treat.y += treat.vy * dt;
  treatEl.style.display = 'block';
  treatEl.style.left = (treat.x - 12) + 'px'; treatEl.style.top = (treat.y - 7) + 'px';
}

// Véto : la trousse apparaît, il avale le cachet (grimace), puis ça va mieux
function healScript() {
  const kx = clamp(catCenter() + (s.faceLeft ? -1 : 1) * (cw * 0.6 + 20), 30, W - 30);
  vetEl.classList.add('show'); placeProp(vetEl, kx);
  const m = mouthPoint();
  pillEl.style.setProperty('--fx', (kx - m.x) + 'px');
  pillEl.style.setProperty('--fy', (floorY - 20 - m.y) + 'px');
  pillEl.style.left = (m.x - 8) + 'px'; pillEl.style.top = (m.y - 4) + 'px';
  const hide = () => { vetEl.classList.remove('show'); pillEl.classList.remove('fly'); };
  script([
    { pose: 'sit', ms: 700, face: { eyes: 'open', mouth: 'o' }, lookAt: () => [kx, floorY - 20] },
    { pose: 'sit', ms: 600, onStart: () => pillEl.classList.add('fly'), face: { eyes: 'open', mouth: 'o' } },
    { pose: 'sit', ms: 1100, face: { eyes: 'closed', mouth: 'flat', brows: 'angry' }, cls: ['lick'] },
    { pose: 'sit', ms: 1400, face: { eyes: 'joy', mouth: 'smile' }, cls: ['love'] },
    { fn: hide, cleanup: hide }
  ]);
}

// ---- Crottes : affichées sur l'écran maison ; il va les faire sous nos yeux ----
const pendingPoops = new Set();
function syncPoops(st, prev) {
  const n = st.poops.length;
  if (knownPoops === null) knownPoops = n; // au démarrage : on les montre directement
  if (n > knownPoops && here && !s.gone && !st.asleep && prev) {
    for (let i = knownPoops; i < n; i++) pendingPoops.add(i);
    poopScript(st.poops[n - 1].x * W, n - 1);
  }
  knownPoops = n;
  renderPoops(st.poops);
}
function renderPoops(list) {
  while (poopsEl.children.length > list.length) poopsEl.lastChild.remove();
  list.forEach((p, i) => {
    let el = poopsEl.children[i];
    if (!el) {
      el = document.createElement('div');
      el.className = 'poop hit';
      el.innerHTML = window.CAT_PROPS.poop;
      el.title = 'Clic pour ramasser';
      el.addEventListener('mouseenter', () => window.desk.setClickable(true));
      el.addEventListener('mouseleave', () => { if (!captured()) window.desk.setClickable(false); });
      el.addEventListener('click', () => { el.classList.add('scooped'); window.desk.cleanPoop([...poopsEl.children].indexOf(el)); });
      poopsEl.append(el);
    }
    el.classList.toggle('pending', pendingPoops.has(i));
    el.style.left = (clamp(p.x * W, 20, W - 20) - 15) + 'px';
    el.style.top = (floorY - 30) + 'px';
  });
}
function poopScript(px, index) {
  const x = clamp(px - cw / 2, 0, W - cw);
  const dir = x > W / 2 ? -1 : 1; // il repart vers le côté où il y a de la place
  const reveal = () => { pendingPoops.delete(index); if (state) renderPoops(state.poops); };
  script([
    { walk: x },
    { pose: 'squat', ms: 2400, face: { eyes: 'closed', mouth: 'flat', brows: 'angry' } },
    { fn: reveal, cleanup: reveal },
    { walk: x + dir * 55 * K },                                  // un pas en avant…
    { fn: () => { s.faceLeft = dir < 0; } },                     // …le derrière tourné vers la crotte
    { pose: 'scratch', ms: 1100, face: { eyes: 'open', mouth: 'smile' } },
    { walk: x + dir * 200 }
  ]);
}
function scoopPoops() {
  for (const el of poopsEl.children) el.classList.add('scooped');
  sparkleAt(catCenter(), s.y);
}

// =====================================================================
//  Caresses et brossage interactifs
// =====================================================================
// Caresser en passant la souris sur lui, doucement, sans cliquer
let strokeTime = 0, lastStrokeCheck = 0, lastAutoPet = -Infinity;
function strokeCheck(now) {
  const dt = (now - lastStrokeCheck) / 1000; lastStrokeCheck = now;
  const stroking = mouse.inside && now - mouse.lastMove < 150 && mouse.speed > 40 && mouse.speed < 2500 && overCat(mouse.x, mouse.y);
  strokeTime = stroking ? strokeTime + dt : Math.max(0, strokeTime - dt * 0.7);
  return stroking;
}

function startPet(kind) {
  const now = performance.now();
  const viaHand = !care || care.kind !== 'pet-hover';
  endCare(false);
  if (kind === 'love') {
    care = { kind: 'pet', mode: 'love', capture: viaHand, until: now + 15000, lastStroke: now, tickAt: now + 1000, cls: ['love', 'purr'], face: { eyes: 'closed', mouth: 'smile' }, pose: 'sit' };
  } else if (kind === 'meh') {
    care = { kind: 'pet', mode: 'meh', capture: false, until: now + 1800, face: { eyes: 'open', lids: 'tired', mouth: 'flat' }, pose: 'sit' };
    look.tilt = -12;
  } else {
    care = { kind: 'pet', mode: 'hate', capture: false, until: now + 1500, face: { eyes: 'open', brows: 'angry', mouth: 'hiss' }, pose: 'swat' };
    s.vy = -300; s.vx = (s.faceLeft ? 1 : -1) * 150; s.onFloor = false; // bond en arrière
  }
  if (care.capture) { document.body.classList.add('hand-mode'); window.desk.setClickable(true); window.desk.focus(); hint('Caresse-le avec la souris · clic droit ou Échap pour arrêter'); }
  renderLook();
}

// Brosser : la souris devient une brosse
function startCare(kind) {
  if (!here || s.gone || !state || state.dead) return;
  endCare(false); stopScript();
  const now = performance.now();
  care = { kind: 'brush', mode: 'brush', capture: true, until: now + 40000, lastStroke: now, tickAt: now + 1000, pose: 'sit', face: null, cls: [] };
  document.body.classList.add('brush-mode');
  window.desk.setClickable(true); window.desk.focus();
  hint('Brosse-le en passant la brosse sur son pelage · clic droit ou Échap pour arrêter');
  renderLook();
}

function endCare(notify) {
  if (!care) return;
  const kind = care.kind;
  care = null;
  document.body.classList.remove('hand-mode', 'brush-mode');
  hint(null);
  if (!setupOpen) window.desk.setClickable(false);
  if (kind === 'brush' && notify !== null) window.desk.brushEnd();
  if (activity.name !== 'script') activity = { name: 'sit', until: performance.now() + 8000 };
  renderLook();
}

function updateCare(dt, now) {
  const stroking = strokeCheck(now);
  if (care.mode === 'meh' || care.mode === 'hate') {
    if (now > care.until) {
      endCare(false);
      if (s.onFloor) activity = { name: 'walk', target: clamp(s.x + (mouse.x < catCenter() ? 1 : -1) * 180, 10, W - cw - 10), until: now + 6000 };
    }
    return;
  }
  if (stroking) care.lastStroke = now;
  const contact = now - care.lastStroke < 400;
  if (care.mode === 'love') {
    care.pose = contact ? (Math.abs(mouse.x - catCenter()) > cw * 0.2 ? 'lean' : 'sit') : 'sit';
    care.cls = contact ? ['love', 'purr'] : ['purr'];
    if (contact && now > care.tickAt) { care.tickAt = now + 1000; window.desk.petTick(); }
    if (now - care.lastStroke > 3500 || now > care.until) endCare(false);
  } else if (care.mode === 'brush') {
    care.pose = contact ? 'lean' : 'sit';
    care.cls = contact ? ['purr'] : [];
    care.face = contact ? { eyes: 'closed', mouth: 'smile' } : null;
    if (contact) {
      if (Math.random() < dt * 9) tuft(mouse.x, mouse.y);
      if (now > care.tickAt) { care.tickAt = now + 1000; window.desk.brushTick(); }
    }
    if (now - care.lastStroke > 8000 || now > care.until) endCare(true);
  }
  renderLook();
}

// Il va chercher la caresse : il suit la main et se tourne vers elle
function followHand(now) {
  if (!s.onFloor) return;
  const dx = mouse.x - catCenter();
  if (Math.abs(dx) > cw * 0.45 && Math.abs(dx) < 320 && mouse.y > s.y - 150) {
    s.vx = Math.sign(dx) * WALK * 0.7 * speedK(); s.faceLeft = dx < 0;
    care.pose = 'walk';
  } else { s.vx = 0; if (Math.abs(dx) > 8) s.faceLeft = dx < 0; }
}

// Toutes les 100 ms : caresse « au passage » de la souris (sans menu)
setInterval(() => {
  if (!state || s.gone || !here || state.dead || state.asleep || game || care || captured()) { strokeCheck(performance.now()); return; }
  strokeCheck(performance.now());
  if (strokeTime > 1.2 && performance.now() - lastAutoPet > 20000) {
    lastAutoPet = performance.now(); strokeTime = 0;
    care = { kind: 'pet-hover', mode: 'wait', capture: false, until: performance.now() + 2000 };
    window.desk.petStart(); // le moteur décide s'il aime (réponse : animation love / meh / hate)
  }
}, 100);

function drawCare() {
  const brush = care && care.kind === 'brush', hand = care && care.capture && care.kind === 'pet';
  brushEl.style.display = brush && mouse.inside ? 'block' : 'none';
  handEl.style.display = hand && mouse.inside ? 'block' : 'none';
  if (brush) { brushEl.style.left = (mouse.x - 20) + 'px'; brushEl.style.top = (mouse.y - 30) + 'px'; brushEl.style.transform = `rotate(${clamp(mouse.speed / 60, 0, 1) * Math.sin(performance.now() / 90) * 12}deg)`; }
  if (hand) { handEl.style.left = (mouse.x - 22) + 'px'; handEl.style.top = (mouse.y - 30) + 'px'; }
  if (care && care.mode === 'wait' && performance.now() > care.until) care = null;
}

// Petites touffes de poils qui s'envolent pendant le brossage
function tuft(x, y) {
  const el = document.createElement('div');
  el.className = 'tuft';
  el.innerHTML = window.CAT_PROPS.tuft;
  el.querySelector('.tuft-fill').style.fill = state.color.fur;
  el.style.left = (x - 6 + (Math.random() - 0.5) * 20) + 'px'; el.style.top = (y - 5) + 'px';
  el.style.setProperty('--dx', ((Math.random() - 0.5) * 60) + 'px');
  fxLayer.append(el);
  setTimeout(() => el.remove(), 1200);
}
function sparkleAt(x, y) {
  const el = document.createElement('div');
  el.className = 'sparkle-fx';
  el.innerHTML = window.CAT_ICONS.sparkle;
  el.style.left = (x - 12) + 'px'; el.style.top = (y - 12) + 'px';
  fxLayer.append(el);
  setTimeout(() => el.remove(), 900);
}

// =====================================================================
//  Petites animations régulières (moins souvent : il est calme)
// =====================================================================
let beat = 0;
setInterval(() => {
  if (!state || s.gone || state.dead || state.boarding || s.dragging) return;
  beat++;
  if (state.asleep) { if (beat % 11 === 0) flash(Math.random() < 0.5 ? 'twitch-l' : 'twitch-r', 700); return; }
  const n = state.needs, tier = state.expr.tier;

  if (beat % 4 === 0 && Math.random() < 0.75) pulse('blinking', 140);
  if (Math.random() < 0.06) flash(Math.random() < 0.5 ? 'twitch-l' : 'twitch-r', 700); // oreille qui frémit
  if (game || care || activity.name === 'script') return;
  if (n.energy < LOW && beat % 12 === 0) pulse('yawning', 1600);
  if (n.hunger < LOW && beat % 9 === 0) flash('lick', 1200);
  if (n.hunger < LOW && beat % 15 === 4) flash('rumble', 600);

  switch (tier) {
    case 'ecstatic': if (beat % 45 === 0) icon(Math.random() < 0.5 ? 'heart' : 'note', 1600); break;
    case 'happy': if (beat % 9 === 0) pulse('joy', 900); break;
    case 'grumpy': if (beat % 45 === 0) icon('angry', 1400); break;
    case 'dramatic':
      if (beat % 8 === 0) pulse('wailing', 1800);
      if (beat % 30 === 0 && !override) { // il s'effondre théâtralement
        override = { pose: 'loaf', face: { eyes: 'closed', brows: 'sad', mouth: 'wail' }, until: performance.now() + 2600 };
        s.vx = 0; renderLook(); icon('broken', 2400);
      }
      break;
    case 'dying': if (beat % 30 === 0) icon('broken', 2400); break;
  }
}, 1000);

function pulse(flag, ms) {
  fx[flag] = true; renderLook();
  setTimeout(() => { fx[flag] = false; renderLook(); }, ms);
}
function flash(cls, ms) {
  cat.classList.add(cls);
  setTimeout(() => cat.classList.remove(cls), ms);
}

// =====================================================================
//  Pouf
// =====================================================================
function placePouf(ratio, x) {
  if (!home || GUEST) return;
  poufX = x !== undefined ? clamp(x, 0, W - POUF_W) : clamp((Number.isFinite(ratio) ? ratio : 0.82) * W - POUF_W / 2, 0, W - POUF_W);
  if (x !== undefined && (x < 0 || x > W - POUF_W)) poufEl.classList.add('leaving'); else poufEl.classList.remove('leaving');
  poufEl.style.display = 'block';
  poufEl.style.left = poufX + 'px';
  poufEl.style.top = (floorY - POUF_H + 5) + 'px';
}

// =====================================================================
//  Jeux
// =====================================================================
const ball = { x: 0, y: 0, vx: 0, vy: 0, r: 11, held: false, inMouth: false, visible: false };
const toy = { x: 0, y: 0, px: 0, py: 0, speed: 0 };      // jouet au bout de la ficelle
const mouseToy = { x: 0, y: 0, vx: 0, vy: 0 };           // souris jouet (jeu solo)
const ROPE = 120;

function startGame(name) {
  if (!here || s.gone || !state) return;
  endGame(false); endCare(false); stopScript();
  override = null; s.onPouf = false;
  game = { name, phase: 'wait', since: performance.now(), lastAction: performance.now(), pose: null, happy: false, engaged: false, catchUntil: 0 };
  const mp = mouthPoint();
  if (name === 'ball') {
    Object.assign(ball, { x: mp.x + (s.faceLeft ? -40 : 40), y: floorY - ball.r, vx: 0, vy: 0, held: false, inMouth: false, visible: true });
    hint('Attrape la balle et lance-la ! · Clic droit sur le chat pour arrêter');
  } else if (name === 'wand') {
    document.body.classList.add('wand-mode');
    window.desk.setClickable(true); // la souris devient la ficelle (clic droit ou Échap pour arrêter)
    window.desk.focus();
    const px = mouse.inside ? mouse.x : W / 2, py = mouse.inside ? mouse.y : floorY - 300;
    Object.assign(toy, { x: px, y: py + ROPE, px, py: py + ROPE, speed: 0 });
    mouse.lastMove = performance.now();
    hint('Bouge la souris : il attrape le jouet ! · Clic droit ou Échap pour arrêter');
  } else {
    Object.assign(mouseToy, { x: s.x + (s.faceLeft ? -30 : cw + 10), y: floorY - 18, vx: (s.faceLeft ? -1 : 1) * 250, vy: -200 });
    game.duration = 20000;
  }
  renderLook();
}

function endGame(notify) {
  if (!game) return;
  const name = game.name;
  game = null;
  ball.visible = false; ball.held = false; ball.inMouth = false;
  ballEl.style.display = 'none'; wandEl.style.display = 'none'; toyMouseEl.style.display = 'none';
  document.body.classList.remove('wand-mode');
  hint(null);
  if (!setupOpen) window.desk.setClickable(false);
  activity = { name: 'sit', until: performance.now() + 8000 };
  if (notify) window.desk.gameEnded();
  if (name === 'solo') icon('heart', 1600);
  renderLook();
}

// Une seconde de jeu effectif = une seconde de « play-tick » envoyée au moteur
setInterval(() => { if (game && game.engaged && !s.gone) window.desk.playTick(); }, 1000);

// Le chat court vers x ; renvoie true quand il y est
function runTo(x, speed = RUN) {
  const dx = x - catCenter();
  if (Math.abs(dx) < 14 * K + 4) { if (s.onFloor) s.vx *= 0.5; return true; }
  if (s.onFloor) { s.vx = Math.sign(dx) * speed * speedK(); s.faceLeft = dx < 0; }
  game.pose = speed >= TROT ? 'run' : 'walk';
  return false;
}

function jumpTo(x, y) {
  if (!s.onFloor) return;
  const dx = x - catCenter();
  hop(clamp(Math.sqrt(2 * GRAVITY * Math.max(40, floorY - y - ch * 0.4)), 420, 1000), clamp(dx * 2.2, -450, 450));
}

function updateGame(dt, now) {
  if (!game) return;
  if (s.gone || state.asleep) { endGame(true); return; }
  game.engaged = false; game.pose = null; game.happy = false;
  if (game.name === 'ball') updateBall(dt, now);
  else if (game.name === 'wand') updateWand(dt, now);
  else updateSolo(dt, now);
}

// ---- Balle : je la lance, il va la chercher et me la rapporte ----
function updateBall(dt, now) {
  if (ball.inMouth) {
    const m = mouthPoint(); ball.x = m.x + (s.faceLeft ? -4 : 4); ball.y = m.y + 4; ball.vx = ball.vy = 0;
  } else if (!ball.held) {
    ball.vy += GRAVITY * 0.8 * dt;
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    if (ball.y + ball.r > floorY) { ball.y = floorY - ball.r; ball.vy = Math.abs(ball.vy) > 120 ? -ball.vy * 0.62 : 0; ball.vx *= 0.985; }
    if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy = Math.abs(ball.vy) * 0.6; }
    if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx = Math.abs(ball.vx) * 0.7; }
    if (ball.x + ball.r > W) { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx) * 0.7; }
  }

  const catX = catCenter();
  const ballMoving = Math.hypot(ball.vx, ball.vy) > 30;
  if (ball.held) { game.phase = 'wait'; game.pose = 'crouch'; s.faceLeft = ball.x < catX; game.lastAction = now; return; }

  if (game.phase === 'wait') {
    game.pose = 'sit';
    if (!ball.inMouth && game.thrown) { game.thrown = false; game.phase = 'chase'; } // seulement après un vrai lancer
    else if (now - game.lastAction > 25000) { icon('meh', 1600); endGame(true); }
    return;
  }
  if (game.phase === 'chase') {
    game.engaged = true; game.happy = true;
    const m = mouthPoint();
    if (Math.hypot(m.x - ball.x, m.y - ball.y) < 26 + 6 * K) { // attrapée !
      ball.inMouth = true; game.phase = 'return';
      icon('sparkle', 900);
      return;
    }
    const arrived = runTo(ball.x);
    if (s.onFloor && ball.y < s.y + 20 && Math.abs(ball.x - catX) < 90 && ball.y > s.y - 240) jumpTo(ball.x, ball.y);
    else if (arrived && s.onFloor && !ballMoving) { ball.inMouth = true; game.phase = 'return'; }
    return;
  }
  if (game.phase === 'return') { // il la rapporte là où je l'ai lancée
    game.engaged = true; game.happy = true;
    const home2 = clamp(game.home ?? catX, cw / 2 + 10, W - cw / 2 - 10);
    if (runTo(home2, TROT) && s.onFloor) {
      ball.inMouth = false; game.phase = 'wait'; game.lastAction = now;
      ball.x += s.faceLeft ? -25 : 25; ball.y = floorY - ball.r;
      icon('note', 1200);
    }
  }
}

ballEl.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || !game || game.name !== 'ball') return;
  e.stopPropagation();
  ball.held = true; ball.inMouth = false;
  samples = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
});
function releaseBall() {
  ball.held = false;
  const v = throwVelocity();
  ball.vx = v.vx * 0.8; ball.vy = v.vy * 0.8;
  if (game) { game.home = ball.x; game.thrown = true; game.lastAction = performance.now(); }
  if (!ballEl.matches(':hover')) window.desk.setClickable(false);
}

// ---- Ficelle : la souris tient une canne, le jouet pend au bout ----
function updateWand(dt, now) {
  const nx = toy.x + (toy.x - toy.px) * 0.985;
  const ny = toy.y + (toy.y - toy.py) * 0.985 + 1500 * dt * dt;
  toy.px = toy.x; toy.py = toy.y; toy.x = nx; toy.y = ny;
  const ax = mouse.x, ay = mouse.y;
  const d = Math.hypot(toy.x - ax, toy.y - ay);
  if (d > ROPE) { toy.x = ax + (toy.x - ax) * ROPE / d; toy.y = ay + (toy.y - ay) * ROPE / d; }
  if (toy.y > floorY - 4) toy.y = floorY - 4;
  toy.speed = toy.speed * 0.9 + (Math.hypot(toy.x - toy.px, toy.y - toy.py) / Math.max(dt, 0.001)) * 0.1;

  if (now - mouse.lastMove > 30000) { icon('question', 1600); endGame(true); return; }
  if (!mouse.inside) { game.pose = 'sit'; return; }

  const catX = catCenter();
  if (now < game.catchUntil) { // il tient le jouet entre ses pattes
    const m = mouthPoint(); toy.x = toy.px = m.x; toy.y = toy.py = m.y + 8;
    game.pose = 'crouch'; game.engaged = true; game.happy = true;
    return;
  }
  const m = mouthPoint();
  if (Math.hypot(m.x - toy.x, m.y - toy.y) < 26 + 6 * K) {
    game.catchUntil = now + 900;
    icon('sparkle', 900);
    return;
  }
  if (toy.speed > 60) {
    game.engaged = true; game.happy = true;
    s.faceLeft = toy.x < catX;
    const near = Math.abs(toy.x - catX) < 110;
    if (near && s.onFloor && toy.y < s.y + 30 && toy.y > s.y - 260) jumpTo(toy.x, toy.y);
    else if (!near) runTo(toy.x, toy.speed > 600 ? RUN : TROT);
    else game.pose = 'crouch';
  } else {
    s.faceLeft = toy.x < catX; // il guette, le derrière se trémousse
    if (s.onFloor) s.vx *= 0.7;
    game.pose = 'crouch';
  }
}

// ---- Seul : il joue avec une souris en peluche pendant 20 s ----
function updateSolo(dt, now) {
  game.engaged = true; game.happy = true;
  if (now - game.since > game.duration) { endGame(true); return; }
  mouseToy.vy += GRAVITY * 0.8 * dt;
  mouseToy.x += mouseToy.vx * dt; mouseToy.y += mouseToy.vy * dt;
  if (mouseToy.y > floorY - 18) { mouseToy.y = floorY - 18; mouseToy.vy = -mouseToy.vy * 0.35; mouseToy.vx *= 0.96; }
  if (mouseToy.x < 0) { mouseToy.x = 0; mouseToy.vx = Math.abs(mouseToy.vx); }
  if (mouseToy.x > W - 30) { mouseToy.x = W - 30; mouseToy.vx = -Math.abs(mouseToy.vx); }

  const target = mouseToy.x + 15;
  const catX = catCenter();
  if (Math.abs(target - catX) < 40 + 15 * K && s.onFloor) {
    if (Math.random() < 0.35) jumpTo(target, floorY - 60);
    const dir = Math.random() < 0.75 ? (s.faceLeft ? -1 : 1) : (s.faceLeft ? 1 : -1);
    mouseToy.vx = dir * (180 + Math.random() * 320); mouseToy.vy = -(80 + Math.random() * 280); // coup de patte
  } else {
    runTo(target, Math.abs(target - catX) > 250 ? RUN : TROT);
  }
}

function drawGame() {
  const g = game;
  ballEl.style.display = g && g.name === 'ball' && ball.visible ? 'block' : 'none';
  if (g && g.name === 'ball') { ballEl.style.left = (ball.x - ball.r) + 'px'; ballEl.style.top = (ball.y - ball.r) + 'px'; }

  const wand = g && g.name === 'wand' && mouse.inside;
  wandEl.style.display = wand ? 'block' : 'none';
  if (wand) {
    $('wand-stick').setAttribute('d', `M${mouse.x + 46} ${mouse.y - 70} L${mouse.x} ${mouse.y}`);
    const sag = Math.max(0, ROPE - Math.hypot(toy.x - mouse.x, toy.y - mouse.y)) * 0.6;
    $('wand-string').setAttribute('d', `M${mouse.x} ${mouse.y} Q${(mouse.x + toy.x) / 2} ${(mouse.y + toy.y) / 2 + sag} ${toy.x} ${toy.y}`);
    const angle = Math.atan2(toy.x - mouse.x, toy.y - mouse.y) * -180 / Math.PI;
    $('wand-toy').setAttribute('transform', `translate(${toy.x} ${toy.y}) rotate(${angle})`);
  }

  toyMouseEl.style.display = g && g.name === 'solo' ? 'block' : 'none';
  if (g && g.name === 'solo') {
    toyMouseEl.style.left = mouseToy.x + 'px'; toyMouseEl.style.top = mouseToy.y + 'px';
    toyMouseEl.style.transform = mouseToy.vx < 0 ? 'scaleX(-1)' : '';
  }
}

function hint(text) {
  hintEl.textContent = text || '';
  hintEl.style.display = text ? 'block' : 'none';
  if (text) setTimeout(() => { if (hintEl.textContent === text) hintEl.style.display = 'none'; }, 6000);
}

// =====================================================================
//  Mort, pension, visite
// =====================================================================
function die() {
  s.dragging = false;
  closePanel();
  icon('broken', 2000);
  cat.classList.add('ghost');
  s.gone = true; // la physique s'arrête
  setTimeout(() => { cat.classList.remove('ghost'); hideCat(); showGrave(); }, 3500);
}

function showGrave() {
  $('g-name').textContent = state.name;
  $('g-age').textContent = state.age;
  grave.style.left = clamp(s.x + cw / 2 - 45, 0, W - 90) + 'px';
  grave.style.top = (floorY - 100) + 'px';
  grave.title = 'Clic droit : adopter un nouveau chaton';
  grave.classList.add('show');
}

function leaveForPension() {
  closePanel();
  if (s.gone) { showPension(); return; }
  s.dragging = false;
  cat.classList.add('leaving');
  s.gone = true;
  setTimeout(() => { cat.classList.remove('leaving'); hideCat(); showPension(); }, 1200);
}

function showPension() { showSign(`🏡 ${state.name} est en pension · clic droit pour le récupérer`); }
function hideSign() { pension.classList.remove('show'); window.desk.setClickable(false); }
function showSign(text) {
  pension.textContent = text;
  pension.classList.add('show');
  pension.style.left = clamp(s.x + cw / 2 - pension.offsetWidth / 2, 8, W - pension.offsetWidth - 8) + 'px';
  pension.style.top = (floorY - pension.offsetHeight - 8) + 'px';
}

function backFromPension() {
  pension.classList.remove('show');
  window.desk.setClickable(false);
  s.x = clamp(s.x, 0, W - cw); s.y = -ch; s.vx = 0; s.vy = 0; s.rot = 0; // il retombe du ciel
  showCat();
  icon('heart', 2500);
}

// =====================================================================
//  Panneau de statistiques (texte d'interface, pas le chat qui parle)
// =====================================================================
const GAUGES = [['hunger', 'Faim'], ['mood', 'Humeur'], ['energy', 'Énergie'], ['clean', 'Propreté'], ['health', 'Santé']];
const TIER_LABEL = {
  ecstatic: '😻 Heureux de fou', happy: '😺 Heureux', smile: '🙂 Ça va', grumpy: '😾 Fait la gueule',
  dramatic: '😿 Fait un drame', dying: '🥀 Au plus mal'
};
const STAGE_LABEL = { kitten: 'chaton', adult: 'adulte', senior: 'senior' };

function togglePanel() {
  if (panel.style.display === 'block') { closePanel(); return; }
  renderPanel();
  panel.style.display = 'block';
  const pw = panel.offsetWidth, ph = panel.offsetHeight;
  panel.style.left = clamp(s.x + cw / 2 - pw / 2, 8, W - pw - 8) + 'px';
  panel.style.top = clamp(s.y - ph - 30, 8, floorY - ph - 8) + 'px';
}

function closePanel() {
  if (panel.style.display !== 'block') return;
  panel.style.display = 'none';
  window.desk.setClickable(false);
}
panel.querySelector('.close').addEventListener('click', closePanel);

function renderPanel() {
  if (!state) return;
  $('p-name').textContent = state.name;
  $('p-age').textContent = `${STAGE_LABEL[state.stage] || ''}${state.personalityLabel ? ' ' + state.personalityLabel.toLowerCase() : ''} · ${state.age} · ${String(state.weightKg).replace('.', ',')} kg (${state.bodyLabel})`;
  $('gauges').replaceChildren(...GAUGES.map(([key, label]) => {
    const v = state.needs[key];
    const row = el('div', 'gauge'), bar = el('div', 'bar'), fill = el('div');
    fill.style.width = v + '%';
    fill.style.background = v > 50 ? '#5bb974' : v > 20 ? '#f2a65e' : '#e05a5a';
    bar.append(fill);
    row.append(el('span', '', label), bar, el('span', 'val', String(v)));
    return row;
  }));
  $('status').textContent =
    state.dead ? '🪦 Mort' :
    state.boarding ? '🏡 En pension' :
    state.asleep ? '💤 Dort' :
    (state.sick ? '🤒 Malade · ' : '') + TIER_LABEL[state.expr.tier] + (state.poops && state.poops.length ? ` · 💩 ×${state.poops.length}` : '');
  $('history').replaceChildren(...state.history.map(h => {
    const li = el('li');
    li.append(el('time', '', new Date(h.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })), document.createTextNode(h.text));
    return li;
  }));
}

// =====================================================================
//  Adoption : nom, robe, côté de l'ami
// =====================================================================
function openSetup({ colors, personalities, friendSide }) {
  setupOpen = true;
  $('setup').classList.remove('perso-only');
  $('setup').querySelector('h2').textContent = 'Un chaton arrive !';
  $('adopt').textContent = 'Adopter';
  let chosen = Object.keys(colors)[0];
  let side = friendSide || null;
  let perso = null;
  const input = $('name'), btn = $('adopt'), sw = $('swatches');
  const refresh = () => { btn.disabled = !input.value.trim() || !side || !perso; };
  buildPersos(personalities, (k) => { perso = k; refresh(); });

  sw.replaceChildren(...Object.entries(colors).map(([key, c]) => {
    const d = el('div', 'swatch' + (key === chosen ? ' selected' : ''));
    d.style.background = `radial-gradient(circle at 50% 60%, ${c.point} 0 30%, ${c.fur} 70%)`;
    d.title = c.label;
    d.onclick = () => { chosen = key; sw.querySelectorAll('.swatch').forEach(x => x.classList.toggle('selected', x === d)); };
    return d;
  }));

  const sideButtons = [...$('sides').querySelectorAll('button')];
  for (const b of sideButtons) {
    b.classList.toggle('selected', b.dataset.side === side);
    b.onclick = () => { side = b.dataset.side; sideButtons.forEach(x => x.classList.toggle('selected', x === b)); refresh(); };
  }

  input.value = '';
  input.oninput = refresh;
  input.onkeydown = (e) => { if (e.key === 'Enter' && !btn.disabled) btn.click(); };
  refresh();

  btn.onclick = async () => {
    btn.disabled = true;
    const st = await window.desk.setup(input.value, chosen, side, perso);
    if (!st) { refresh(); return; }
    $('setup').style.display = 'none';
    setupOpen = false;
    window.desk.setClickable(false);
    state = null;
    here = true;
    applyState(st);
    s.x = W / 2 - cw / 2; s.y = -ch; s.vx = 0; s.vy = 0; s.rot = 0; // il tombe du ciel
    showCat();
    icon('heart', 2500);
  };

  $('setup').style.display = 'block';
  window.desk.setClickable(true);
  window.desk.focus();
  input.focus();
}

// Boutons de caractère (adoption, ou chat déjà adopté qui n'en a pas encore)
function buildPersos(personalities, onPick) {
  const box = $('persos'), desc = $('perso-desc');
  desc.innerHTML = '&nbsp;';
  box.replaceChildren(...Object.entries(personalities).map(([key, p]) => {
    const b = el('button', '', `${p.emoji} ${p.label}`);
    b.title = p.desc;
    b.onclick = () => { box.querySelectorAll('button').forEach(x => x.classList.toggle('selected', x === b)); desc.textContent = p.desc; onPick(key); };
    return b;
  }));
}
function openPersonality(personalities) {
  setupOpen = true;
  const card = $('setup'), btn = $('adopt');
  card.classList.add('perso-only');
  card.querySelector('h2').textContent = `Quel est le caractère de ${state ? state.name : 'ton chat'} ?`;
  btn.textContent = 'Choisir'; btn.disabled = true;
  let perso = null;
  buildPersos(personalities, (k) => { perso = k; btn.disabled = false; });
  btn.onclick = () => {
    if (!perso) return;
    window.desk.setPersonality(perso);
    card.style.display = 'none'; card.classList.remove('perso-only');
    setupOpen = false; window.desk.setClickable(false);
  };
  card.style.display = 'block';
  window.desk.setClickable(true);
}

// Petite fenêtre de saisie : pseudo visible par les amis, ou adresse IP d'un ami
function openNick(current) {
  openPrompt({
    title: 'Ton pseudo', hint: 'Tes amis sur le même réseau le verront quand ton chat leur rendra visite.',
    placeholder: 'Ex. Sam', value: current, maxLength: 20, ok: (v) => window.desk.setNick(v)
  });
}
function openIp() {
  openPrompt({
    title: 'Adresse de ton ami', hint: "Si vous ne vous voyez pas automatiquement : ton ami lit son adresse dans clic droit > Ami > « Mon adresse », et tu la tapes ici (ex. 192.168.1.42).",
    placeholder: '192.168.1.42', value: '', maxLength: 15,
    valid: (v) => /^\d{1,3}(\.\d{1,3}){3}$/.test(v), ok: (v) => window.desk.addFriendIp(v)
  });
}
function openPrompt({ title, hint: hintText, placeholder, value, maxLength, valid = (v) => !!v, ok: onOk }) {
  const card = $('nick-card'), input = $('nick'), ok = $('nick-ok'), later = $('nick-later');
  card.querySelector('h2').textContent = title;
  card.querySelector('.hint').textContent = hintText;
  input.placeholder = placeholder; input.maxLength = maxLength; input.value = value || '';
  const close = () => { card.style.display = 'none'; setupOpen = false; window.desk.setClickable(false); };
  const refresh = () => { ok.disabled = !valid(input.value.trim()); };
  input.oninput = refresh; refresh();
  ok.onclick = () => { onOk(input.value.trim()); close(); };
  later.onclick = close;
  input.onkeydown = (e) => { if (e.key === 'Enter' && !ok.disabled) ok.click(); if (e.key === 'Escape') close(); };
  card.style.display = 'block';
  setupOpen = true;
  window.desk.setClickable(true);
  window.desk.focus();
  input.focus();
}

// =====================================================================
//  Petits effets et utilitaires
// =====================================================================
function dizzy() {
  fx.dizzyUntil = Date.now() + 1500;
  if (!GUEST) window.desk.event('hit'); // un choc violent fait baisser l'humeur
  icon('dizzy', 1400);
  renderLook();
  setTimeout(renderLook, 1550);
}

// Bulle avec une icône (le chat ne parle pas)
let bubbleTimer;
function icon(key, ms = 1500) {
  const svgIcon = window.CAT_ICONS[key];
  const animating = cat.classList.contains('ghost') || cat.classList.contains('leaving');
  if (!svgIcon || !here || (s.gone && !animating)) return; // seulement sur l'écran du chat
  bubble.innerHTML = svgIcon;
  bubble.style.display = 'block';
  bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { bubble.style.display = 'none'; }, ms);
}
function placeBubble() {
  const h = headUnits();
  const p = toPx(h.x, h.y - 30);
  bubble.style.left = clamp(p.x - 17, 4, W - 38) + 'px';
  bubble.style.top = Math.max(4, p.y - 34) + 'px';
}

function el(tag, cls = '', text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function show(node, on, display = 'inline') { node.style.display = on ? display : 'none'; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
