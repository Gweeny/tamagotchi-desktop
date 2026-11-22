// Moteur Tamagotchi : module JS pur (aucune dépendance Electron), testable seul.
// Toutes les jauges vont de 0 (au plus bas) à 100 (au mieux).
// "hunger" = satiété : 100 = repu, 0 = affamé.
// Le chat ne parle pas : ses réactions sont des icônes (clés comme 'heart', 'fish'…).

const NEEDS = ['hunger', 'mood', 'energy', 'clean', 'health'];

// ---- Rythme de soins visé ----
// Nourrir 3x/jour, jouer 2x/jour, litière 1x/jour, vétérinaire 1x/semaine.
// Les jauges baissent vite au-dessus de KNEE, puis très lentement en dessous :
// le chat reste longtemps « au plus mal » avant de mourir, 3 jours après le dernier soin.
const KNEE = 20;
const RATES = {                    // par heure : [au-dessus de KNEE, en dessous]
  hunger: [5, KNEE / 56],          // 100 -> 20 en 16 h, puis 20 -> 0 en 56 h : 72 h au total
  clean: [0.3, 0.1],               // sans crotte, la propreté baisse à peine
  moodAwake: [4, 0.5],             // 100 -> 52 en 12 h
  moodAsleep: [1, 0.2]
};
const ENERGY_AWAKE = -5;           // 14 h éveillé (8 h -> 22 h) : -70
const ENERGY_ASLEEP = 8;           // 10 h de nuit : +80
const HEALTH_DECAY = 0.4;          // par heure : 100 -> 33 en une semaine sans vétérinaire
const HEALTH_LOW_LOSS = 0.3;       // en plus, par heure et par jauge sous KNEE
const KIBBLE = 40;                 // 3 repas de 40 couvrent une journée
// Il fait une crotte par jour (entre 9 h et 19 h). Tant qu'elle est là, ça sent : la propreté baisse vite.
const POOP_SMELL = 2.5;            // propreté perdue par heure et par crotte
const POOP_MAX = 3;
const BRUSH_MOOD_PER_S = 2, BRUSH_CLEAN_PER_S = 1.5; // brossage
const PET_MOOD_PER_S = 1, PET_MAX_S = 15;           // caresses qu'il aime, tant qu'on continue
const PLAY_MOOD_PER_S = 5;         // 20 s de jeu = +100 d'humeur
const SOLO_MOOD_PER_S = 2.5;       // jouer seul rapporte moitié moins
const PLAY_ENERGY_PER_S = 0.75;    // 20 s de jeu = -15 d'énergie
const SLEEP_FROM = 22, SLEEP_TO = 8;
const WOKEN_MINUTES = 15;          // réveillé la nuit, il se rendort au bout de 15 min
const STEP_H = 1 / 60;
const MAX_CATCHUP_H = 24 * 30;
const SICK_BELOW = 30;
const HISTORY_MAX = 5;

// ---- Poids (« fat » : 0 = maigre, 50 = idéal, 100 = obèse) ----
// Un repas normal fait prendre un peu, manger sans faim et les friandises beaucoup ;
// jouer fait perdre. Le maître modèle (3 repas, 2 jeux) reste stable.
const FAT_MEAL = 0.5, FAT_OVEREAT = 3, FAT_TREAT = 1.5;
const FAT_PLAY_PER_S = 0.04, FAT_SOLO_PER_S = 0.02;
const FAT_STARVE_PER_H = 0.3;      // il maigrit quand il a très faim
const FAT_HEALTH_LOSS = 0.15;      // santé perdue par heure si trop gros ou trop maigre

// ---- Croissance : on adopte un chaton ----
const KITTEN_DAYS = 10, SENIOR_DAYS = 90;
const STAGE_ENERGY = { kitten: 1.15, adult: 1, senior: 1.2 }; // les chatons et les vieux chats se fatiguent plus vite

// Toutes les robes ont le même style : fur = pelage, light = poitrail, point = teinte foncée de la même robe
// (oreilles, masque, pattes, bout de la queue), mask = intensité de ce masque, eye = iris
const COLORS = {
  siamois: { fur: '#f3e3cc', light: '#fff8ee', point: '#5a3d2e', mask: 0.9, eye: '#6fb6ec', label: 'Siamois' },
  roux:    { fur: '#f6b26e', light: '#fff3e4', point: '#c9662a', mask: 0.6, eye: '#7cc36a', label: 'Roux' },
  gris:    { fur: '#c3c9d3', light: '#f6f8fb', point: '#626b7a', mask: 0.65, eye: '#f2b33d', label: 'Gris' },
  noir:    { fur: '#4f4f5c', light: '#80808f', point: '#1f1f27', mask: 0.7, eye: '#e8c547', label: 'Noir' },
  blanc:   { fur: '#fdfaf5', light: '#ffffff', point: '#d6c7b6', mask: 0.6, eye: '#5aa9e6', label: 'Blanc' },
  creme:   { fur: '#f0d9b2', light: '#fdf6ea', point: '#a87d45', mask: 0.65, eye: '#4fa3a5', label: 'Crème' }
};

// Paliers d'humeur affichée (sur la jauge la plus basse, hors énergie)
//  >= 90 : heureux de fou · >= 70 : heureux · >= 50 : sourit · >= 30 : fait la gueule
//  >= 15 : dramatique · > 0 : mourant (si c'est la faim ou la santé) · 0 : mort
const TIERS = [[90, 'ecstatic'], [70, 'happy'], [50, 'smile'], [30, 'grumpy'], [15, 'dramatic']];

const GAMES = { ball: 'à la balle', wand: 'avec la ficelle', solo: 'tout seul' };

// ---- Personnalité (choisie à l'adoption) ----
// pet : [seuil « il adore », seuil « bof »] (au-delà : il déteste). Les autres valeurs multiplient les règles de base.
const PERSONALITIES = {
  calin:     { label: 'Câlin', emoji: '🥰', desc: 'Adore les caresses et rester près de toi', pet: [0.75, 0.95] },
  joueur:    { label: 'Joueur', emoji: '⚽', desc: "Plein d'énergie, s'ennuie vite, adore jouer", pet: [0.5, 0.8], moodRate: 1.2, playMood: 1.3, crazy: 2 },
  paresseux: { label: 'Paresseux', emoji: '😴', desc: 'Fait la sieste partout, le jeu le fatigue', pet: [0.55, 0.9], energyRate: 0.85, playMood: 0.85, playEnergy: 1.3, crazy: 0.3 },
  gourmand:  { label: 'Gourmand', emoji: '🍗', desc: 'A toujours faim, fond pour les friandises', pet: [0.6, 0.9], hungerRate: 1.15, treatMood: 1.5, fatGain: 1.4 },
  timide:    { label: 'Timide', emoji: '🙈', desc: 'Se méfie au début, adore être brossé', pet: [0.35, 0.7], brushMood: 1.4, crazy: 0.5 }
};
const trait = (st, key) => {
  const p = PERSONALITIES[st.personality] || PERSONALITIES.calin;
  return p[key] === undefined ? 1 : p[key];
};

const clamp = (v) => Math.max(0, Math.min(100, v));
const isNight = (t) => { const h = new Date(t).getHours(); return h >= SLEEP_FROM || h < SLEEP_TO; };
const decay = (v, [fast, slow], h) => v - (v > KNEE ? fast : slow) * h;
const ageDays = (st, t = st.clock) => (t - st.born) / 86400000;

function stage(st, t = st.clock) {
  const d = ageDays(st, t);
  return d < KITTEN_DAYS ? 'kitten' : d < SENIOR_DAYS ? 'adult' : 'senior';
}

// Poids affiché en kg : il grandit de 0,5 à 4 kg pendant ses 10 premiers jours, puis le « fat » module
function weightKg(st) {
  const d = ageDays(st);
  const base = d < KITTEN_DAYS ? 0.5 + 3.5 * (d / KITTEN_DAYS) : 4;
  return Math.round(base * (0.7 + (st.fat / 100) * 0.7) * 10) / 10;
}

function bodyLabel(fat) {
  return fat < 25 ? 'maigre' : fat < 42 ? 'mince' : fat <= 62 ? 'idéal' : fat <= 80 ? 'dodu' : 'obèse';
}

// Prochaine crotte : le lendemain (ou aujourd'hui si c'est encore possible), entre 9 h et 19 h
function nextPoopTime(t, rand = Math.random) {
  const d = new Date(t);
  const at = (day) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + day, 9, 0).getTime() + rand() * 10 * 3.6e6;
  const today = at(0);
  return today > t + 3.6e6 ? today : at(1);
}

function log(st, text, t) {
  st.history.unshift({ t, text });
  if (st.history.length > HISTORY_MAX) st.history.length = HISTORY_MAX;
}

function createCat(name, color, now = Date.now(), personality = null) {
  const st = {
    version: 3,
    name, color,
    born: now,
    lastUpdate: now, // heure réelle de la dernière mise à jour
    clock: now,      // heure du jeu (égale à l'heure réelle, sauf en mode accéléré)
    needs: { hunger: 100, mood: 90, energy: 100, clean: 100, health: 100 },
    fat: 50,
    stage: 'kitten',
    personality: PERSONALITIES[personality] ? personality : null,
    poops: [],               // crottes à ramasser : [{ x }] (position à l'écran, de 0 à 1)
    nextPoopAt: nextPoopTime(now),
    petSeconds: 0,
    asleep: isNight(now),
    nightSleep: isNight(now),
    wokenUntil: 0,
    sick: false,
    dead: false,
    boarding: false,
    history: []
  };
  log(st, `Tu as adopté ${name}, un adorable chaton.`, now);
  return st;
}

function wakeUp(st, t, text) {
  st.asleep = false; st.nightSleep = false;
  if (isNight(t)) st.wokenUntil = t + WOKEN_MINUTES * 60000; // il se rendormira
  if (text) log(st, text, t);
}

// Avance la simulation de `h` heures ; t = heure du jeu à la fin du pas
function step(st, h, t) {
  const n = st.needs;

  // Il grandit
  const stg = stage(st, t);
  if (stg !== st.stage) {
    st.stage = stg;
    log(st, stg === 'adult' ? `${st.name} est devenu un chat adulte !` : `${st.name} est maintenant un vieux sage.`, t);
  }

  // Rythme jour/nuit
  const night = isNight(t);
  if (night && !st.asleep && !(st.wokenUntil > t)) {
    st.asleep = true; st.nightSleep = true;
    log(st, `${st.name} s'endort pour la nuit.`, t);
  } else if (!night && st.asleep && st.nightSleep) {
    wakeUp(st, t, `${st.name} se réveille. Bonjour !`);
  }

  // La crotte du jour (il faut être réveillé)
  if (!st.asleep && t >= st.nextPoopAt) {
    if (st.poops.length < POOP_MAX) {
      st.poops.push({ x: Math.round((0.15 + Math.random() * 0.6) * 1000) / 1000 });
      log(st, `${st.name} a fait sa crotte… ça sent !`, t);
    }
    st.nextPoopAt = nextPoopTime(t + 12 * 3.6e6);
  }

  n.hunger = decay(n.hunger, RATES.hunger, h * (n.hunger > KNEE ? trait(st, 'hungerRate') : 1));
  n.clean = decay(n.clean, RATES.clean, h) - POOP_SMELL * st.poops.length * h;
  if (st.asleep) {
    n.energy += ENERGY_ASLEEP * h;
    n.mood = decay(n.mood, RATES.moodAsleep, h);
    if (n.energy >= 100 && !st.nightSleep) wakeUp(st, t, `${st.name} se réveille de sa sieste.`);
  } else {
    n.energy += ENERGY_AWAKE * STAGE_ENERGY[stg] * trait(st, 'energyRate') * h;
    n.mood = decay(n.mood, RATES.moodAwake, h * (n.mood > KNEE ? trait(st, 'moodRate') : 1));
    if (n.energy <= 0) { st.asleep = true; log(st, `${st.name} s'est endormi d'épuisement.`, t); }
  }
  for (const k of ['hunger', 'mood', 'energy', 'clean']) n[k] = clamp(n[k]);

  // Poids : il maigrit quand il a très faim
  if (n.hunger < KNEE) st.fat = clamp(st.fat - FAT_STARVE_PER_H * h);

  // Santé : baisse doucement (vétérinaire 1x/semaine), plus vite si d'autres jauges sont au plus bas
  // ou si son poids est mauvais
  const low = ['hunger', 'mood', 'clean'].filter(k => n[k] < KNEE).length;
  const badWeight = st.fat > 80 || st.fat < 20 ? FAT_HEALTH_LOSS : 0;
  n.health = clamp(n.health - (HEALTH_DECAY + HEALTH_LOW_LOSS * low + badWeight) * h);

  // Mort : faim ou santé à 0
  if (n.hunger <= 0 || n.health <= 0) {
    st.dead = true; st.asleep = false; st.diedAt = t;
    st.deathCause = n.hunger <= 0 ? 'hunger' : 'health';
    log(st, `${st.name} est mort${st.deathCause === 'hunger' ? ' de faim' : ''}…`, t);
    return;
  }

  const wasSick = st.sick;
  st.sick = n.health < SICK_BELOW;
  if (st.sick && !wasSick) log(st, `${st.name} est tombé malade.`, t);
  if (!st.sick && wasSick) log(st, `${st.name} va mieux.`, t);
}

// Rattrape le temps écoulé depuis lastUpdate (y compris app fermée).
// speed > 1 accélère le temps (pratique pour tester).
function update(st, now = Date.now(), speed = 1) {
  if (speed === 1 || !st.clock) st.clock = st.lastUpdate; // en temps normal, l'heure du jeu = l'heure réelle
  const total = Math.min(Math.max(0, (now - st.lastUpdate) / 3.6e6) * speed, MAX_CATCHUP_H);
  st.lastUpdate = now;
  if (st.dead || st.boarding) { st.clock += total * 3.6e6; return st; } // en pension, le temps est figé

  for (let done = 0; done < total && !st.dead; done += STEP_H) {
    const h = Math.min(STEP_H, total - done);
    st.clock += h * 3.6e6;
    step(st, h, Math.round(st.clock));
  }
  if (st.dead) st.clock = st.diedAt;
  return st;
}

// Applique un soin. Renvoie { icon, anim, ok } (ou null) :
//   icon = icône de réaction, anim = animation à jouer, ok = false si l'action est refusée.
function act(st, action, opts = {}) {
  if (st.dead) return null;
  const t = Math.round(st.clock);
  const n = st.needs;
  const name = st.name;
  const rand = opts.rand || Math.random;

  if (st.boarding) {
    if (action !== 'unboard') return null;
    st.boarding = false;
    n.hunger = 100; n.clean = 100; n.energy = 100; n.health = 100; n.mood = 85;
    st.sick = false;
    log(st, `${name} est rentré de la pension.`, t);
    return { icon: 'heart' };
  }

  // N'importe quelle action le réveille (sauf « Dormir », qui l'endort justement)
  let woken = false;
  if (st.asleep && action !== 'sleep' && action !== 'board') {
    wakeUp(st, t, `${name} a été réveillé.`);
    woken = true;
  }

  switch (action) {
    case 'feed-kibble':
      if (n.hunger > 95) return { icon: 'nope', ok: false };
      st.fat = clamp(st.fat + (n.hunger > 70 ? FAT_OVEREAT : FAT_MEAL) * trait(st, 'fatGain')); // manger sans faim fait grossir
      n.hunger = clamp(n.hunger + KIBBLE); n.clean = clamp(n.clean - 2);
      log(st, `Tu as donné des croquettes à ${name}.`, t);
      return { icon: 'yum', anim: 'eat' };
    case 'feed-treat':
      st.fat = clamp(st.fat + (FAT_TREAT + (n.hunger > 80 ? 1 : 0)) * trait(st, 'fatGain'));
      n.mood = clamp(n.mood + 12 * trait(st, 'treatMood')); n.hunger = clamp(n.hunger + 5);
      log(st, `Tu as donné une friandise à ${name}.`, t);
      return { icon: 'heart', anim: 'treat' };
    case 'play-start':
      if (n.energy < 10) return { icon: 'moon', ok: false };
      log(st, `Tu joues avec ${name} ${GAMES[opts.game] || ''}.`.replace(' .', '.'), t);
      return { icon: woken ? 'surprise' : 'note', ok: true };
    case 'play-tick': { // 1 seconde de jeu : humeur +, énergie -, poids -
      n.mood = clamp(n.mood + (opts.solo ? SOLO_MOOD_PER_S : PLAY_MOOD_PER_S) * trait(st, 'playMood'));
      n.energy = clamp(n.energy - PLAY_ENERGY_PER_S * trait(st, 'playEnergy'));
      st.fat = clamp(st.fat - (opts.solo ? FAT_SOLO_PER_S : FAT_PLAY_PER_S));
      if (n.energy < 5) return { icon: 'sweat', ok: false };
      return { ok: true };
    }
    case 'pet': { // il aime… ou pas
      st.petSeconds = 0;
      const r = rand();
      const [love, meh] = st.personality === 'timide' && n.mood > 70 ? [0.6, 0.9] : trait(st, 'pet');
      log(st, `Tu as caressé ${name}.`, t);
      if (r < love) { n.mood = clamp(n.mood + 12); return { icon: 'heart', anim: 'love' }; }
      if (r < meh) { n.mood = clamp(n.mood + 3); return { icon: 'meh', anim: 'meh' }; }
      n.mood = clamp(n.mood - 6);
      return { icon: 'angry', anim: 'hate' };
    }
    case 'clean': { // opts.index : ramasser une seule crotte (clic dessus) ; sinon tout nettoyer
      if (Number.isInteger(opts.index)) {
        if (!st.poops[opts.index]) return null;
        st.poops.splice(opts.index, 1);
        n.clean = st.poops.length ? clamp(n.clean + 25) : 100;
        log(st, 'Tu as ramassé une crotte.', t);
        return { icon: 'sparkle', anim: 'clean' };
      }
      if (n.clean > 95 && !st.poops.length) return { icon: 'nope', ok: false };
      st.poops = []; n.clean = 100;
      log(st, 'Tu as tout nettoyé.', t);
      return { icon: 'sparkle', anim: 'clean' };
    }
    case 'set-personality':
      if (st.personality || !PERSONALITIES[opts.personality]) return null;
      st.personality = opts.personality;
      log(st, `${name} est un chat ${PERSONALITIES[opts.personality].label.toLowerCase()}.`, t);
      return { icon: 'heart' };
    case 'brush-start':
      log(st, `Tu brosses ${name}.`, t);
      return { icon: 'heart', ok: true };
    case 'brush-tick': // 1 seconde de brosse sur son pelage
      n.mood = clamp(n.mood + BRUSH_MOOD_PER_S * trait(st, 'brushMood')); n.clean = clamp(n.clean + BRUSH_CLEAN_PER_S);
      return { ok: true };
    case 'pet-tick': // 1 seconde de caresse qu'il aime (au plus 15 s par séance)
      if (st.petSeconds >= PET_MAX_S) return { ok: false };
      st.petSeconds++; n.mood = clamp(n.mood + PET_MOOD_PER_S);
      return { ok: true };
    case 'sleep':
      if (st.asleep) { wakeUp(st, t, `Tu as réveillé ${name}.`); return { icon: 'surprise' }; }
      st.asleep = true; st.nightSleep = isNight(t);
      log(st, `${name} fait une sieste.`, t);
      return { icon: 'moon' };
    case 'heal':
      if (n.health > 90) return { icon: 'nope', ok: false };
      n.health = 100;
      st.sick = false;
      log(st, `Tu as emmené ${name} chez le vétérinaire.`, t);
      return { icon: 'sparkle', anim: 'heal' };
    case 'board':
      st.boarding = true; st.asleep = false; st.nightSleep = false;
      log(st, `${name} part en pension.`, t);
      return { icon: 'heart' };
    case 'hit': // choc violent contre le sol
      n.mood = clamp(n.mood - 5);
      return null;
    case 'grab': // on l'attrape à la souris
      if (woken) { n.mood = clamp(n.mood - 3); return { icon: 'angry' }; }
      return null;
    default:
      return null;
  }
}

// Palier d'expression : sur la jauge la plus basse (l'énergie a ses propres animations)
function expression(st) {
  if (st.dead) return { tier: 'dead', cause: st.deathCause };
  const n = st.needs;
  let cause = 'hunger';
  for (const k of ['mood', 'clean', 'health']) if (n[k] < n[cause]) cause = k;
  const v = n[cause];
  for (const [min, tier] of TIERS) if (v >= min) return { tier, cause };
  return { tier: cause === 'hunger' || cause === 'health' ? 'dying' : 'dramatic', cause };
}

// Le besoin le plus urgent, sous forme d'icône (ou null si tout va bien)
function needIcon(st) {
  const n = st.needs;
  if (st.asleep || st.dead || st.boarding) return null;
  if (n.hunger < 15 || n.health < 15) return 'broken';
  if (st.sick) return 'sick';
  if (n.hunger < 30) return 'fish';
  if (st.poops.length || n.clean < 30) return 'litter';
  if (n.mood < 30) return 'ball';
  if (n.energy < 20) return 'moon';
  return null;
}

// Vérifie qu'un état chargé depuis le disque a la bonne forme (et migre les anciennes versions)
function isValidState(st) {
  if (!st || typeof st !== 'object') return false;
  if (st.version === 1 && st.needs && Array.isArray(st.history)) {
    // Nouvelles règles (3 jours, jour/nuit) : on repart sur de bonnes bases pour ne pas le tuer à l'ouverture
    Object.assign(st, { version: 2, clock: st.lastUpdate, boarding: false, nightSleep: false, wokenUntil: 0, dead: false, asleep: false, sick: false });
    st.needs = { hunger: 100, mood: 90, energy: 100, clean: 100, health: 100 };
    log(st, `${st.name} découvre les nouvelles règles et repart en pleine forme.`, st.lastUpdate);
  }
  if (st.version === 2) { st.version = 3; st.fat = 50; st.stage = stage(st); }
  if (Array.isArray(st.history) && st.history.length > HISTORY_MAX) st.history.length = HISTORY_MAX;
  if (st.personality === undefined) st.personality = null; // à choisir (on le demandera)
  if (st.version === 3 && !Array.isArray(st.poops)) { st.poops = []; st.nextPoopAt = nextPoopTime(st.lastUpdate); st.petSeconds = 0; }
  return st.version === 3
    && typeof st.name === 'string' && !!COLORS[st.color]
    && Number.isFinite(st.born) && Number.isFinite(st.lastUpdate) && Number.isFinite(st.fat)
    && Array.isArray(st.poops) && st.poops.length <= POOP_MAX && Number.isFinite(st.nextPoopAt)
    && st.needs && NEEDS.every(k => Number.isFinite(st.needs[k]))
    && Array.isArray(st.history);
}

module.exports = {
  NEEDS, COLORS, GAMES, PERSONALITIES, createCat, update, act, expression, needIcon, isValidState, isNight,
  stage, weightKg, bodyLabel
};
