// Squelette des pattes (corps de profil) : chaque patte a 3 articulations
// (hanche/épaule, genou/coude, cheville/poignet) dont on calcule l'angle à chaque image.
//  - La marche et le galop suivent la distance réellement parcourue : les pattes ne glissent pas au sol.
//  - Les autres poses (debout, saut, chute, accroupi, étirement, sur le dos, gratter) sont des postures.
//  - On passe d'une posture à l'autre en douceur (interpolation des angles).
// Convention : angle positif = la patte part vers l'arrière (le chat regarde à droite dans le dessin).
(() => {
  const LEGS = ['lf', 'rf', 'lh', 'rh'];           // avant proche, avant loin, arrière proche, arrière loin
  const isHind = (l) => l[1] === 'h';

  // Postures fixes : [hanche, genou, cheville]
  const STAND = { front: [0, 0, 0], hind: [-16, 34, -18] };
  const POSES = {
    stand: STAND,
    jump: { front: [-72, -8, 10], hind: [62, 8, 22] },      // tendu : l'avant vers l'avant, l'arrière vers l'arrière
    fall: { front: [-38, 12, -8], hind: [18, 30, -6] },     // pattes prêtes à se poser
    crouch: { front: [30, -62, 30], hind: [-44, 80, -36] }, // ramassé, prêt à bondir
    stretch: { front: [-74, 0, 14], hind: [8, 22, -10] },   // avant allongé, derrière en l'air
    roll: { front: [-20, 30, 0], hind: [10, 40, -10] }      // sur le dos (on ajoute un pédalage)
  };

  // Décalage de phase de chaque patte : marche (pas diagonal) et galop
  const GAIT = {
    walk: { lh: 0, lf: 0.25, rh: 0.5, rf: 0.75, amp: 22, stance: 0.62, stride: 34 },
    // Galop : les deux pattes arrière poussent presque ensemble, puis les deux avant ; grandes foulées
    run: { lh: 0, rh: 0.1, lf: 0.5, rf: 0.6, amp: 46, stance: 0.36, stride: 82 }
  };

  const ease = (u) => u * u * (3 - 2 * u);
  const lerp = (a, b, u) => a + (b - a) * u;

  // Angles d'une patte à la phase p (0..1) d'un cycle de marche ou de galop
  function gaitAngles(leg, p, g) {
    const A = g.amp, hind = isHind(leg);
    const base = hind ? STAND.hind : STAND.front;
    if (p < g.stance) { // appui : la patte est au sol et pousse vers l'arrière
      const u = p / g.stance;
      return hind ? [base[0] + lerp(-A, A, u), base[1] + u * 8, base[2] - u * 12] : [lerp(-A, A, u), 0, -u * 6];
    }
    const u = ease((p - g.stance) / (1 - g.stance)); // levée : la patte se plie et revient vers l'avant
    const lift = Math.sin(Math.PI * u);
    return hind
      ? [base[0] + lerp(A, -A, u), base[1] + lift * 44, base[2] + lift * 30]
      : [lerp(A, -A, u), lift * 58, lift * 28];
  }

  class CatRig {
    constructor(svgRoot) {
      this.joints = {};
      for (const el of svgRoot.querySelectorAll('[data-j]')) {
        this.joints[el.dataset.j] = { el, x: +el.dataset.x, y: +el.dataset.y, a: 0 };
      }
      this.phase = 0;     // avancement du cycle de marche
      this.t = 0;
      this.ext = 0;       // galop : -1 = ramassé (dos rond, pattes sous lui), +1 = allongé (pattes tendues)
    }

    // pose : 'stand' | 'walk' | 'run' | 'jump' | 'fall' | 'crouch' | 'stretch' | 'roll' | 'scratch'
    // dist : distance parcourue depuis la dernière image (px, dans l'échelle du dessin)
    update(dt, pose, dist) {
      this.t += dt;
      const g = GAIT[pose];
      if (g) this.phase = (this.phase + dist / g.stride) % 1;
      const k = 1 - Math.exp(-dt * (g ? 30 : 12)); // en marche on suit vite, sinon on glisse en douceur

      for (const leg of LEGS) {
        let target;
        if (g) target = gaitAngles(leg, (this.phase + g[leg]) % 1, g);
        else if (pose === 'scratch' && isHind(leg)) { // il gratte le sol après la crotte
          const w = Math.sin(this.t * 22 + (leg === 'rh' ? Math.PI : 0));
          target = [20 + w * 32, 30 + w * 20, -10];
        } else if (pose === 'roll') { // pédale, les pattes en l'air
          const w = Math.sin(this.t * 7 + LEGS.indexOf(leg) * 1.6);
          const b = POSES.roll[isHind(leg) ? 'hind' : 'front'];
          target = [b[0] + w * 18, b[1] + w * 12, b[2]];
        } else {
          const b = (POSES[pose] || STAND)[isHind(leg) ? 'hind' : 'front'];
          target = b;
        }
        ['hip', 'knee', 'ankle'].forEach((name, i) => {
          const j = this.joints[`${leg}-${name}`];
          if (!j) return;
          j.a += (target[i] - j.a) * k;
          j.el.setAttribute('transform', `translate(${j.x} ${j.y}) rotate(${j.a.toFixed(2)})`);
        });
      }
      // Au galop, le dos se ramasse puis s'allonge à chaque foulée, comme un vrai chat :
      // allongé quand les pattes arrière ont fini de pousser et que l'avant se tend vers l'avant.
      const goal = pose === 'run' ? Math.cos(2 * Math.PI * (this.phase - 0.46)) : 0;
      this.ext += (goal - this.ext) * (1 - Math.exp(-dt * (pose === 'run' ? 45 : 8)));
      if (pose === 'run') return -(this.ext + 1) * 1.8; // le corps monte pendant la phase allongée (suspension)
      // Petit balancement du corps en marchant (deux fois par cycle)
      return g ? Math.sin(this.phase * Math.PI * 4) * 0.8 : 0;
    }
  }

  window.CatRig = CatRig;
})();
