// Lancer avec : npm test
const test = require('node:test');
const assert = require('node:assert');
const e = require('./engine');

const H = 3.6e6;
const at = (day, hour, min = 0) => new Date(2026, 0, 5 + day, hour, min).getTime(); // heure locale
const fresh = (t = at(0, 9)) => e.createCat('Test', 'roux', t);
const fill = (st) => Object.assign(st.needs, { hunger: 100, mood: 100, energy: 100, clean: 100, health: 100 });

test('sans soins : la faim tombe vite à 20 (16 h) puis reste basse longtemps', () => {
  const st = fresh();
  e.update(st, at(0, 11));
  assert.ok(Math.abs(st.needs.hunger - 90) < 0.1, `2 h : ${st.needs.hunger}`);
  e.update(st, at(1, 1));
  assert.ok(Math.abs(st.needs.hunger - 20) < 0.2, `16 h : ${st.needs.hunger}`);
  e.update(st, at(2, 9));
  assert.ok(!st.dead && st.needs.hunger > 5, `48 h : ${st.needs.hunger}`);
});

test('sans soins, il meurt de faim au bout de 3 jours (pas avant)', () => {
  const st = fresh();
  e.update(st, at(2, 23));
  assert.ok(!st.dead, `mort trop tôt : ${JSON.stringify(st.needs)}`);
  e.update(st, at(3, 10));
  assert.ok(st.dead);
  assert.strictEqual(st.deathCause, 'hunger');
  assert.ok(Math.abs(st.diedAt - (at(0, 9) + 72 * H)) < 30 * 60000, `mort à ${(st.diedAt - at(0, 9)) / H} h`);
  assert.strictEqual(e.act(st, 'feed-kibble'), null);
});

test('le maître modèle (3 repas, 2 jeux, 1 litière par jour, véto chaque semaine) : chat en forme pendant 2 semaines', () => {
  const st = fresh(at(0, 8));
  let worst = 100;
  for (let day = 0; day < 14; day++) {
    for (let hour = 8; hour <= 21; hour++) {
      e.update(st, at(day, hour));
      if ([8, 13, 19].includes(hour)) e.act(st, 'feed-kibble');
      if ([12, 18].includes(hour)) { e.act(st, 'play-start'); for (let s = 0; s < 20; s++) e.act(st, 'play-tick'); }
      if (hour === 20) e.act(st, 'clean');
      if (hour === 10 && day % 7 === 6) e.act(st, 'heal');
      for (const k of ['hunger', 'mood', 'clean', 'health']) worst = Math.min(worst, st.needs[k]);
    }
  }
  e.update(st, at(14, 8));
  assert.ok(!st.dead && !st.sick);
  assert.ok(worst >= 30, `une jauge est descendue à ${worst.toFixed(1)}`);
});

test('sans vétérinaire, il tombe malade au bout d\'environ une semaine', () => {
  // On garde les autres jauges pleines : seule la santé baisse
  const st2 = fresh(at(0, 8));
  let sickAt = null;
  for (let h = 1; h <= 9 * 24 && sickAt === null; h++) {
    e.update(st2, at(0, 8) + h * H);
    Object.assign(st2.needs, { hunger: 100, mood: 100, clean: 100 });
    if (st2.sick) sickAt = h;
  }
  assert.ok(sickAt > 6.5 * 24 && sickAt < 8 * 24, `malade après ${sickAt} h`);
});

test('jouer 20 s : +100 d\'humeur et -15 d\'énergie ; seul, moitié moins', () => {
  const st = fresh(); fill(st); st.needs.mood = 0;
  assert.ok(e.act(st, 'play-start').ok);
  for (let i = 0; i < 20; i++) e.act(st, 'play-tick');
  assert.strictEqual(st.needs.mood, 100);
  assert.strictEqual(st.needs.energy, 85);
  st.needs.mood = 0;
  for (let i = 0; i < 20; i++) e.act(st, 'play-tick', { solo: true });
  assert.strictEqual(st.needs.mood, 50);
});

test('trop fatigué, il refuse de jouer ; épuisé, il arrête', () => {
  const st = fresh(); st.needs.energy = 8;
  assert.strictEqual(e.act(st, 'play-start').ok, false);
  st.needs.energy = 5.5;
  assert.strictEqual(e.act(st, 'play-tick').ok, false);
});

test('croquettes = faim ; friandise = humeur et un peu de faim', () => {
  const st = fresh(); Object.assign(st.needs, { hunger: 10, mood: 10 });
  e.act(st, 'feed-kibble');
  assert.deepStrictEqual([st.needs.hunger, st.needs.mood], [50, 10]);
  e.act(st, 'feed-treat');
  assert.deepStrictEqual([st.needs.hunger, st.needs.mood], [55, 22]);
});

test('caresses : il adore, bof, ou déteste (chat joueur : 50 % / 30 % / 20 %)', () => {
  const st = fresh(); st.needs.mood = 50; st.personality = 'joueur';
  assert.strictEqual(e.act(st, 'pet', { rand: () => 0.1 }).anim, 'love'); assert.strictEqual(st.needs.mood, 62);
  assert.strictEqual(e.act(st, 'pet', { rand: () => 0.6 }).anim, 'meh');  assert.strictEqual(st.needs.mood, 65);
  assert.strictEqual(e.act(st, 'pet', { rand: () => 0.9 }).anim, 'hate'); assert.strictEqual(st.needs.mood, 59);
});

test('n\'importe quelle action le réveille (la nuit, il se rendort ensuite)', () => {
  for (const action of ['feed-kibble', 'feed-treat', 'pet', 'clean', 'heal', 'play-start', 'grab']) {
    const st = fresh(at(0, 23));
    st.needs.hunger = 50; st.needs.clean = 50; st.needs.health = 50;
    assert.ok(st.asleep, action);
    e.act(st, action);
    assert.ok(!st.asleep, `${action} ne l'a pas réveillé`);
    e.update(st, at(0, 23, 30));
    assert.ok(st.asleep, `${action} : il ne s'est pas rendormi`);
  }
});

test('il dort de 22 h à 8 h', () => {
  const st = fresh(at(0, 20));
  assert.ok(!st.asleep);
  e.update(st, at(0, 22, 5));
  assert.ok(st.asleep, 'endormi à 22 h');
  e.update(st, at(1, 7, 55));
  assert.ok(st.asleep, 'toujours endormi à 8 h moins 5');
  e.update(st, at(1, 8, 5));
  assert.ok(!st.asleep, 'réveillé à 8 h');
});

test('une journée normale (adulte) : l\'énergie tient jusqu\'au soir et remonte la nuit', () => {
  const st = fresh(at(0, 8));
  st.born -= 20 * 24 * H; st.stage = 'adult'; // un chat adulte (le chaton se fatigue plus vite)
  e.update(st, at(0, 21, 50));
  assert.ok(st.needs.energy > 25 && st.needs.energy < 40, `soir : ${st.needs.energy}`);
  e.update(st, at(1, 8, 10));
  assert.ok(st.needs.energy > 95, `matin : ${st.needs.energy}`);
});

test('paliers d\'expression', () => {
  const st = fresh();
  const tier = (v, k = 'mood') => { fill(st); st.needs[k] = v; return e.expression(st).tier; };
  assert.strictEqual(tier(100), 'ecstatic');
  assert.strictEqual(tier(80), 'happy');
  assert.strictEqual(tier(60), 'smile');
  assert.strictEqual(tier(40), 'grumpy');
  assert.strictEqual(tier(20), 'dramatic');
  assert.strictEqual(tier(10), 'dramatic');
  assert.strictEqual(tier(10, 'hunger'), 'dying');
  assert.strictEqual(tier(10, 'health'), 'dying');
});

test('en pension, le temps est figé, et il rentre en pleine forme', () => {
  const st = fresh();
  st.needs.hunger = 40;
  e.act(st, 'board');
  e.update(st, at(10, 9));
  assert.ok(!st.dead);
  assert.strictEqual(st.needs.hunger, 40);
  assert.strictEqual(e.act(st, 'feed-kibble'), null, 'pas de soins pendant la pension');
  e.act(st, 'unboard');
  assert.strictEqual(st.needs.hunger, 100);
  assert.ok(!st.boarding);
});

test('mode accéléré : la nuit finit par arriver', () => {
  const st = fresh(at(0, 9));
  for (let i = 1; i <= 14 * 12; i++) e.update(st, at(0, 9) + i * 5000, 60);
  assert.ok(st.asleep);
});

test('une sauvegarde v1 est migrée, une sauvegarde abîmée est refusée', () => {
  const v1 = { version: 1, name: 'Matou', color: 'creme', born: 1, lastUpdate: 2, needs: { hunger: 1, mood: 1, energy: 1, clean: 1, health: 1 }, history: [] };
  assert.ok(e.isValidState(v1));
  assert.strictEqual(v1.version, 3);
  assert.strictEqual(v1.fat, 50);
  assert.ok(!e.isValidState({ version: 3, name: 'x' }));
  assert.ok(!e.isValidState(null));
});

test('poids : manger sans faim et les friandises font grossir, jouer fait maigrir', () => {
  const st = fresh(); st.needs.hunger = 80;
  e.act(st, 'feed-kibble');                       // il n'avait pas faim
  assert.strictEqual(st.fat, 53);
  e.act(st, 'feed-treat');
  assert.strictEqual(st.fat, 55.5);
  for (let i = 0; i < 50; i++) e.act(st, 'play-tick');
  assert.ok(Math.abs(st.fat - 53.5) < 1e-9, `après le jeu : ${st.fat}`);
  st.fat = 90;
  assert.strictEqual(e.bodyLabel(st.fat), 'obèse');
});

test('poids : le maître modèle garde un poids idéal ; sans jeux et avec des friandises, il grossit', () => {
  const run = (play, treats) => {
    const st = fresh(at(0, 8));
    for (let day = 0; day < 14; day++) {
      for (let hour = 8; hour <= 21; hour++) {
        e.update(st, at(day, hour));
        if ([8, 13, 19].includes(hour)) e.act(st, 'feed-kibble');
        if (treats && [10, 16].includes(hour)) e.act(st, 'feed-treat');
        if (play && [12, 18].includes(hour)) { e.act(st, 'play-start'); for (let s = 0; s < 20; s++) e.act(st, 'play-tick'); }
        if (hour === 20) e.act(st, 'clean');
        if (hour === 10 && day % 7 === 6) e.act(st, 'heal');
      }
    }
    return st;
  };
  const good = run(true, false);
  assert.strictEqual(e.bodyLabel(good.fat), 'idéal', `maître modèle : ${good.fat}`);
  const lazy = run(false, true);
  assert.ok(lazy.fat > 80, `sans jeux + friandises : ${lazy.fat}`);
});

test('on adopte un chaton, qui devient adulte à 10 jours puis senior à 90 jours', () => {
  const st = fresh(at(0, 9));
  assert.strictEqual(st.stage, 'kitten');
  assert.ok(e.weightKg(st) < 1);
  for (let d = 1; d <= 11; d++) { e.update(st, at(d, 9)); Object.assign(st.needs, { hunger: 100, mood: 100, clean: 100, health: 100 }); }
  assert.strictEqual(st.stage, 'adult');
  assert.ok(st.history.some(h => h.text.includes('adulte')));
  assert.strictEqual(e.stage(st, at(0, 9) + 91 * 24 * H), 'senior');
});

test('les réactions sont des icônes, jamais du texte', () => {
  const st = fresh(); st.needs.hunger = 50;
  for (const a of ['feed-kibble', 'feed-treat', 'play-start', 'pet', 'clean', 'sleep', 'heal']) {
    const r = e.act(st, a);
    if (r && r.icon) assert.match(r.icon, /^[a-z]+$/, a);
  }
  st.asleep = false; st.needs.hunger = 20;
  assert.strictEqual(e.needIcon(st), 'fish');
});

test('une crotte par jour, entre 9 h et 19 h ; elle sent, et on la ramasse', () => {
  const st = fresh(at(0, 8));
  e.update(st, at(0, 21));
  assert.strictEqual(st.poops.length, 1, 'une crotte dans la journée');
  assert.ok(st.poops[0].x > 0 && st.poops[0].x < 1);
  assert.ok(st.history.some(h => h.text.includes('crotte')));
  const before = st.needs.clean;
  e.update(st, at(0, 21) + 4 * H); // 4 h avec la crotte (il dort : elle sent quand même)
  assert.ok(before - st.needs.clean > 9, `ça sent : ${before} -> ${st.needs.clean}`);
  st.needs.hunger = 100; // (il a aussi faim : la faim passerait avant)
  assert.strictEqual(e.needIcon(Object.assign(st, { asleep: false })), 'litter');
  const r = e.act(st, 'clean', { index: 0 });
  assert.strictEqual(r.anim, 'clean');
  assert.strictEqual(st.poops.length, 0);
  assert.strictEqual(st.needs.clean, 100);
  e.update(st, at(1, 21));
  assert.strictEqual(st.poops.length, 1, 'une seule par jour');
});

test('sans ramasser, les crottes s\'accumulent (3 au plus) et la propreté s\'effondre', () => {
  const st = fresh(at(0, 8));
  for (let d = 0; d < 4; d++) { e.update(st, at(d, 22)); Object.assign(st.needs, { hunger: 100, mood: 100 }); }
  assert.strictEqual(st.poops.length, 3);
  assert.ok(st.needs.clean < 20, `propreté : ${st.needs.clean}`);
});

test('brosser : humeur et propreté montent', () => {
  const st = fresh(); Object.assign(st.needs, { mood: 40, clean: 40 });
  e.act(st, 'brush-start');
  for (let i = 0; i < 10; i++) e.act(st, 'brush-tick');
  assert.deepStrictEqual([st.needs.mood, st.needs.clean], [60, 55]);
});

test('caresses qu\'il aime : l\'humeur monte tant qu\'on continue, 15 s au plus par séance', () => {
  const st = fresh(); st.needs.mood = 20;
  e.act(st, 'pet', { rand: () => 0.1 }); // il adore : +12
  for (let i = 0; i < 30; i++) e.act(st, 'pet-tick');
  assert.strictEqual(st.needs.mood, 20 + 12 + 15);
  e.act(st, 'pet', { rand: () => 0.1 });
  assert.strictEqual(e.act(st, 'pet-tick').ok, true, 'nouvelle séance');
});

test('personnalité : choisie une seule fois, et elle change les besoins et les réactions', () => {
  const st = e.createCat('P', 'roux', at(0, 9), 'gourmand');
  assert.strictEqual(st.personality, 'gourmand');
  assert.strictEqual(e.act(st, 'set-personality', { personality: 'calin' }), null, 'on ne change pas');
  const base = fresh(at(0, 9));
  e.update(st, at(0, 13)); e.update(base, at(0, 13));
  assert.ok(st.needs.hunger < base.needs.hunger, 'le gourmand a faim plus vite');
  // Le câlin adore les caresses bien plus souvent que le timide
  const count = (perso) => { const c = e.createCat('C', 'roux', at(0, 9), perso); c.needs.mood = 50; let love = 0;
    for (let i = 0; i < 100; i++) { c.needs.mood = 50; if (e.act(c, 'pet', { rand: () => i / 100 }).anim === 'love') love++; } return love; };
  assert.strictEqual(count('calin'), 75);
  assert.strictEqual(count('timide'), 35);
  // Un ancien chat sans personnalité peut la choisir
  const old = fresh(); old.personality = null;
  assert.ok(e.act(old, 'set-personality', { personality: 'joueur' }));
  assert.strictEqual(old.personality, 'joueur');
  assert.strictEqual(old.history.length <= 5, true, 'historique limité à 5');
});

test('sommeil : la nuit il récupère 100 en 8 h, en sieste 20 par heure', () => {
  const st = fresh(at(0, 22, 1));
  fill(st); st.needs.energy = 0;
  e.update(st, at(0, 22, 1));
  assert.ok(st.asleep && st.nightSleep);
  e.update(st, at(1, 2, 1));
  assert.ok(Math.abs(st.needs.energy - 50) < 1, `4 h de nuit : ${st.needs.energy}`);
  e.update(st, at(1, 6, 1));
  assert.ok(st.needs.energy >= 99.5, `8 h de nuit : ${st.needs.energy}`);

  const nap = fresh(at(0, 12));
  fill(nap); nap.needs.energy = 30;
  e.act(nap, 'sleep');
  assert.ok(nap.asleep && !nap.nightSleep);
  e.update(nap, at(0, 14));
  assert.ok(Math.abs(nap.needs.energy - 70) < 1 && nap.asleep, `2 h de sieste : ${nap.needs.energy}`);
  e.update(nap, at(0, 16));
  assert.ok(!nap.asleep, 'réveillé quand il est à 100');
});
