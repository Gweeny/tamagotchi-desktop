// Dessin du chat (SVG) et icônes de réaction, partagés par index.html et preview.html.
// Style « sticker kawaii » : dégradés doux, masque et extrémités foncés (siamois), grands yeux brillants.
// Trois corps selon la pose (assis, de profil, couché) et une seule tête, déplacée par le CSS.
// Le visage est piloté par data-eyes / data-lids / data-brows / data-mouth sur l'élément .cat.
(() => {
  // Patte articulée en 3 segments : hanche (ou épaule) -> genou (ou coude) -> cheville (ou poignet) -> patte.
  // Chaque articulation est un <g data-j="…"> dont rig.js calcule la rotation à chaque image
  // (data-x / data-y = position de l'articulation dans le segment parent).
  const leg = (id, x, y, hind) => {
    const upper = hind
      ? 'M-7.6 -9 C-8.4 2 -6.2 8 -4.6 11 L4.6 11 C6.2 8 8.4 2 7.6 -9 Z'  // cuisse dodue
      : 'M-5.8 -9 C-6.2 3 -5.2 8 -4.2 11 L4.2 11 C5.2 8 6.2 3 5.8 -9 Z';  // bras
    const lower = hind
      ? 'M-4.4 -1.5 C-4.1 4 -3.6 8 -3.4 10.5 L3.4 10.5 C3.6 8 4.1 4 4.4 -1.5 Z'
      : 'M-4.1 -1.5 C-3.9 4 -3.5 8 -3.3 10.5 L3.3 10.5 C3.5 8 3.9 4 4.1 -1.5 Z';
    return `<g data-j="${id}-hip" data-x="${x}" data-y="${y}" transform="translate(${x} ${y})">
      <path class="fur" d="${upper}"/>
      <g data-j="${id}-knee" data-x="0" data-y="11" transform="translate(0 11)">
        <circle class="fur" cx="0" cy="0" r="${hind ? 4.4 : 4.1}"/>
        <path class="fur" d="${lower}"/><path fill="url(#g-legpt)" d="${lower}"/>
        <g data-j="${id}-ankle" data-x="0" data-y="10.5" transform="translate(0 10.5)">
          <ellipse class="paw edge" cx="1.2" cy="1.4" rx="${hind ? 5.8 : 5.4}" ry="2.8"/>
        </g>
      </g>
    </g>`;
  };
  // Queue : pelage + extrémité foncée (dégradé le long de la queue) + léger contour
  const tail = (cls, d, id, x1, y1, x2, y2, w = 7) => `
    <linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">
      <stop offset=".25" class="pt" style="stop-opacity:0"/><stop offset="1" class="pt"/>
    </linearGradient>
    <g class="tail ${cls}">
      <path d="${d}" fill="none" class="edge-s" stroke-width="${w + 1.4}" stroke-linecap="round"/>
      <path d="${d}" fill="none" class="fur-s" stroke-width="${w}" stroke-linecap="round"/>
      <path d="${d}" fill="none" stroke="url(#${id})" stroke-width="${w}" stroke-linecap="round"/>
    </g>`;

  const SVG = `
<svg viewBox="0 0 140 100" overflow="visible">
  <defs>
    <radialGradient id="g-body" cx="42%" cy="28%" r="78%">
      <stop offset="0" class="fl"/><stop offset=".6" class="fu"/><stop offset="1" class="fu"/>
    </radialGradient>
    <radialGradient id="g-head" cx="50%" cy="40%" r="62%">
      <stop offset="0" class="fl"/><stop offset=".72" class="fu"/><stop offset="1" class="fu"/>
    </radialGradient>
    <linearGradient id="g-shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset=".45" stop-color="#3a2418" stop-opacity="0"/><stop offset="1" stop-color="#3a2418" stop-opacity=".18"/>
    </linearGradient>
    <!-- masque siamois : foncé sur le museau, s'estompe vers le front -->
    <radialGradient id="g-mask" cx="50%" cy="72%" r="46%">
      <stop offset="0" class="mk"/><stop offset=".5" class="mk2"/><stop offset="1" class="pt" style="stop-opacity:0"/>
    </radialGradient>
    <linearGradient id="g-ear" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" class="pt"/><stop offset=".85" class="pt" style="stop-opacity:.15"/><stop offset="1" class="pt" style="stop-opacity:0"/>
    </linearGradient>
    <linearGradient id="g-legpt" x1="0" y1="0" x2="0" y2="1">
      <stop offset=".25" class="pt" style="stop-opacity:0"/><stop offset="1" class="mk"/>
    </linearGradient>
    <radialGradient id="g-iris" cx="50%" cy="72%" r="70%">
      <stop offset="0" class="eh"/><stop offset=".55" class="ey"/><stop offset="1" stop-color="#1f2a44"/>
    </radialGradient>
    <radialGradient id="g-shadow"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <clipPath id="clip-eyes"><ellipse cx="59.5" cy="41" rx="7.3" ry="7.8"/><ellipse cx="80.5" cy="41" rx="7.3" ry="7.8"/></clipPath>
  </defs>

  <ellipse class="shadow" cx="70" cy="96.5" rx="34" ry="4.5" fill="url(#g-shadow)"/>

  <g class="flip"><g class="fx"><g class="breath">

    <!-- ===== Corps assis (de face) ===== -->
    <g class="body-sit">
      <ellipse class="fur edge" cx="52" cy="85" rx="10.5" ry="10"/>
      <ellipse class="fur edge" cx="88" cy="85" rx="10.5" ry="10"/>
      <path fill="url(#g-body)" class="edge" d="M50 96 C44 84 47 66 58 58.5 C63 55.5 77 55.5 82 58.5 C93 66 96 84 90 96 Z"/>
      <path fill="url(#g-shade)" d="M50 96 C44 84 47 66 58 58.5 C63 55.5 77 55.5 82 58.5 C93 66 96 84 90 96 Z"/>
      <path class="light" d="M56.5 58 C59.5 62.5 60.5 67 62.8 65 C63.4 70.2 66 73.4 67.6 70.2 C68.2 74.4 71.8 74.4 72.4 70.2 C74 73.4 76.6 70.2 77.2 65 C79.5 67 80.5 62.5 83.5 58 C76 61.5 64 61.5 56.5 58 Z"/>
      <g><path class="fur" d="M59.6 71 C58.8 80 58.6 88 58.8 94.6 L69.4 94.6 C69.4 88 69.6 80 69.8 72 Z"/>
        <path fill="url(#g-legpt)" d="M59.6 71 C58.8 80 58.6 88 58.8 94.6 L69.4 94.6 C69.4 88 69.6 80 69.8 72 Z"/>
        <ellipse class="paw edge" cx="64.1" cy="94.8" rx="5.8" ry="2.8"/></g>
      <g class="paw-r"><path class="fur" d="M80.4 71 C81.2 80 81.4 88 81.2 94.6 L70.6 94.6 C70.6 88 70.4 80 70.2 72 Z"/>
        <path fill="url(#g-legpt)" d="M80.4 71 C81.2 80 81.4 88 81.2 94.6 L70.6 94.6 C70.6 88 70.4 80 70.2 72 Z"/>
        <ellipse class="paw edge" cx="75.9" cy="94.8" rx="5.8" ry="2.8"/></g>
      <path d="M70 76 C70 84 70 89 70 94" stroke="rgba(70,45,30,.2)" stroke-width=".8" fill="none"/>
      ${tail('tail-sit', 'M90 90.5 C99 94.5 96.5 99.2 82 99 C70 98.8 60 98.2 51.5 96.4', 'g-tail-sit', 92, 92, 50, 97)}
      <g class="groom-paw"><path class="fur edge" d="M74 80 C73.5 72 72 66 69 60 L75 57.5 C78.6 63 80.4 71 81 79 Z"/>
        <ellipse class="paw edge" cx="71.8" cy="58.6" rx="4.4" ry="3.4"/></g>
    </g>

    <!-- ===== Corps de profil (marche, course, saut, étirement, sur le dos) ===== -->
    <g class="body-side">
      ${tail('tail-side', 'M42 60 C29 58 25 45 29 34 C31 28 37 26.5 39.5 30', 'g-tail-side', 42, 60, 36, 28, 6.6)}
      <g class="far">${leg('rh', 54, 71.5, true)}${leg('rf', 86, 71.5, false)}</g>
      <path fill="url(#g-body)" class="edge" d="M40 63 C40 53 52 49 68 49 C84 49 97 53 97 64 C97 74 86 79 68 79 C52 79 40 74 40 63 Z"/>
      <path fill="url(#g-shade)" d="M40 63 C40 53 52 49 68 49 C84 49 97 53 97 64 C97 74 86 79 68 79 C52 79 40 74 40 63 Z"/>
      <path class="light" d="M50 74 C60 79.5 80 79.5 90 73.5 C82 77 58 77.5 50 74 Z"/>
      <ellipse class="light" cx="91" cy="63" rx="6" ry="9"/>
      ${leg('lh', 47, 71.5, true)}${leg('lf', 91, 71.5, false)}
    </g>

    <!-- ===== Corps couché (dort, pétrit, mourant) ===== -->
    <g class="body-loaf">
      <path fill="url(#g-body)" class="edge" d="M40 96.4 C36 83 48 73 70 73 C92 73 104 83 100 96.4 Z"/>
      <path fill="url(#g-shade)" d="M40 96.4 C36 83 48 73 70 73 C92 73 104 83 100 96.4 Z"/>
      <ellipse class="paw edge knead knead-a" cx="82" cy="95.2" rx="5" ry="2.6"/>
      <ellipse class="paw edge knead knead-b" cx="92" cy="95.2" rx="5" ry="2.6"/>
      ${tail('tail-loaf', 'M43 93.6 C52 99.6 84 99.6 99 93.2', 'g-tail-loaf', 43, 94, 100, 93)}
    </g>

    <g class="dirt" fill="#7a5638" opacity=".5">
      <ellipse cx="58" cy="84" rx="3.2" ry="2"/><ellipse cx="82" cy="80" rx="2.4" ry="1.6"/><ellipse cx="70" cy="90" rx="2" ry="1.3"/>
    </g>

    <!-- ===== Tête (de face, quelle que soit la pose) ===== -->
    <g class="head"><g class="head-look"><g class="head-inner">
      <g class="ear ear-l">
        <path class="fur edge" d="M43 31 C40 19 41.5 7 46 1.5 C53.5 5 60.5 11.5 63 17 Z"/>
        <path fill="url(#g-ear)" d="M43 31 C40 19 41.5 7 46 1.5 C53.5 5 60.5 11.5 63 17 Z"/>
        <path class="ear-in" d="M46.5 26 C45 18 45.8 11 48 7.5 C52.5 10 56.5 14 58.5 17.5 Z"/>
        <path class="tuft" d="M48.5 22 l3.4 -4.4 M49.8 25.4 l4.6 -3.8 M48 18.6 l2.6 -4"/>
      </g>
      <g class="ear ear-r">
        <path class="fur edge" d="M97 31 C100 19 98.5 7 94 1.5 C86.5 5 79.5 11.5 77 17 Z"/>
        <path fill="url(#g-ear)" d="M97 31 C100 19 98.5 7 94 1.5 C86.5 5 79.5 11.5 77 17 Z"/>
        <path class="ear-in" d="M93.5 26 C95 18 94.2 11 92 7.5 C87.5 10 83.5 14 81.5 17.5 Z"/>
        <path class="tuft" d="M91.5 22 l-3.4 -4.4 M90.2 25.4 l-4.6 -3.8 M92 18.6 l-2.6 -4"/>
      </g>
      <path fill="url(#g-head)" class="edge" d="M70 16 C87 16 100.5 26.5 100.5 41 C100.5 46 99.4 49.6 97.6 52.4 L101.4 55 L96.2 56.8 L98.6 60 L91.6 60.2 C86 64.2 78.6 65.8 70 65.8 C61.4 65.8 54 64.2 48.4 60.2 L41.4 60 L43.8 56.8 L38.6 55 L42.4 52.4 C40.6 49.6 39.5 46 39.5 41 C39.5 26.5 53 16 70 16 Z"/>
      <path fill="url(#g-mask)" d="M70 16 C87 16 100.5 26.5 100.5 41 C100.5 53 87 65.8 70 65.8 C53 65.8 39.5 53 39.5 41 C39.5 26.5 53 16 70 16 Z"/>
      <!-- saisons : bonnet (hiver ou froid), fleur (printemps) -->
      <g class="bonnet">
        <path d="M49.5 28 C50.5 11.5 89.5 11.5 90.5 28 C82 24.5 58 24.5 49.5 28 Z" fill="#e57373"/>
        <path d="M56 26 C57 17 60 14 63 13 M70 25 V12.5 M84 26 C83 17 80 14 77 13" stroke="#c94f4f" stroke-width="1.2" fill="none" opacity=".7"/>
        <path d="M48.5 28.5 C58 24 82 24 91.5 28.5 L91.5 32.5 C82 28 58 28 48.5 32.5 Z" fill="#fff4f0" stroke="#e8c9c0" stroke-width=".6"/>
        <circle cx="70" cy="10.5" r="4.6" fill="#fff4f0" stroke="#e8c9c0" stroke-width=".6"/>
      </g>
      <g class="flower" transform="translate(52 21)">
        <circle cx="0" cy="-2.6" r="2.2" fill="#ffb3c7"/><circle cx="2.5" cy="-.8" r="2.2" fill="#ffb3c7"/><circle cx="1.6" cy="2.2" r="2.2" fill="#ffb3c7"/>
        <circle cx="-1.6" cy="2.2" r="2.2" fill="#ffb3c7"/><circle cx="-2.5" cy="-.8" r="2.2" fill="#ffb3c7"/><circle r="1.6" fill="#ffd54f"/>
      </g>
      <path class="muzzle mouth-all" d="M70 50 C66 47.8 61.6 49 61.8 52.8 C62 56 66.6 57 70 55 C73.4 57 78 56 78.2 52.8 C78.4 49 74 47.8 70 50 Z"/>
      <ellipse class="blush" cx="50.5" cy="53" rx="5.4" ry="3"/>
      <ellipse class="blush" cx="89.5" cy="53" rx="5.4" ry="3"/>
      <ellipse class="dirt" cx="84" cy="26" rx="2.2" ry="1.5" fill="#7a5638" opacity=".5"/>

      <!-- yeux : très grands, iris dégradé, pupille qui suit la souris, reflets -->
      <g class="eyes-all">
      <g class="eyes-open">
        <ellipse cx="59.5" cy="41" rx="7.3" ry="7.8" fill="url(#g-iris)"/>
        <ellipse cx="80.5" cy="41" rx="7.3" ry="7.8" fill="url(#g-iris)"/>
        <g clip-path="url(#clip-eyes)"><g class="look">
          <ellipse class="pupil" cx="59.5" cy="41.6" rx="4" ry="5.2" fill="#17131c"/>
          <ellipse class="pupil" cx="80.5" cy="41.6" rx="4" ry="5.2" fill="#17131c"/>
          <circle cx="62.4" cy="37.8" r="2.7" fill="#fff"/><circle cx="83.4" cy="37.8" r="2.7" fill="#fff"/>
          <circle cx="57" cy="44.6" r="1.3" fill="#fff" opacity=".95"/><circle cx="78" cy="44.6" r="1.3" fill="#fff" opacity=".95"/>
          <circle cx="62.6" cy="44" r=".7" fill="#fff" opacity=".8"/><circle cx="83.6" cy="44" r=".7" fill="#fff" opacity=".8"/>
          <path d="M56.6 37 l.5 1.3 l1.3 .5 l-1.3 .5 l-.5 1.3 l-.5 -1.3 l-1.3 -.5 l1.3 -.5 Z M77.6 37 l.5 1.3 l1.3 .5 l-1.3 .5 l-.5 1.3 l-.5 -1.3 l-1.3 -.5 l1.3 -.5 Z" fill="#fff" opacity=".85"/>
        </g></g>
        <ellipse cx="59.5" cy="41" rx="7.3" ry="7.8" fill="none" stroke="#1d1820" stroke-width=".8" opacity=".7"/>
        <ellipse cx="80.5" cy="41" rx="7.3" ry="7.8" fill="none" stroke="#1d1820" stroke-width=".8" opacity=".7"/>
        <path class="lash" stroke-width="1.5" d="M52.2 40.4 Q53.6 33.2 60.6 33.2 M52.4 39.6 L50.2 37.6 M87.8 40.4 Q86.4 33.2 79.4 33.2 M87.6 39.6 L89.8 37.6"/>
      </g>
      <g class="lids-tired" clip-path="url(#clip-eyes)"><rect class="lid" x="50" y="32" width="40" height="8.8"/></g>
      <path class="lids-tired lash" d="M52.4 40.8 H66.6 M73.4 40.8 H87.6"/>
      <g class="lids-grumpy" clip-path="url(#clip-eyes)"><path class="lid" d="M51 32 H68 V42 L51 38.8 Z M72 42 L89 38.8 V32 H72 Z"/></g>
      <path class="lids-grumpy lash" d="M52.3 38.9 L66.8 41.8 M73.2 41.8 L87.7 38.9"/>
      <g class="lids-dying" clip-path="url(#clip-eyes)"><path class="lid" d="M51 32 H68 V40.8 L51 43.4 Z M72 40.8 L89 43.4 V32 H72 Z"/></g>
      <path class="lids-dying lash" d="M52.3 43.3 L66.8 40.9 M73.2 40.9 L87.7 43.3"/>
      <path class="eyes-closed lash" d="M52.4 41.5 Q59.5 46.5 66.6 41.5 M73.4 41.5 Q80.5 46.5 87.6 41.5"/>
      <path class="eyes-joy lash" stroke-width="1.8" d="M52.4 43.8 Q59.5 36.4 66.6 43.8 M73.4 43.8 Q80.5 36.4 87.6 43.8"/>
      <path class="eyes-x lash" d="M56 37.5 L63 44.5 M63 37.5 L56 44.5 M77 37.5 L84 44.5 M84 37.5 L77 44.5"/>
      <path class="brows-angry lash" d="M52.5 31.6 L64.5 34.6 M87.5 31.6 L75.5 34.6"/>
      <path class="brows-sad lash" d="M53 34.6 L64.5 30.8 M87 34.6 L75.5 30.8"/>
      <g class="tears">
        <path class="tear" d="M55 47.5 C53.5 51.5 54 54.5 55.2 55.5 C56.5 54.5 56.8 51.5 55 47.5 Z"/>
        <path class="tear t2" d="M85 47.5 C86.5 51.5 86 54.5 84.8 55.5 C83.5 54.5 83.2 51.5 85 47.5 Z"/>
      </g>
      </g>

      <!-- nez et bouches (petits) -->
      <g class="mouth-all">
      <path class="nose" d="M67.8 49 Q70 48.2 72.2 49 Q71.1 51.2 70 51.5 Q68.9 51.2 67.8 49 Z"/>
      <path class="m-smile mouth" d="M70 51.5 V52.4 M70 52.4 Q68.6 54.4 66.8 53.3 M70 52.4 Q71.4 54.4 73.2 53.3"/>
      <path class="m-big" fill="#b4475f" stroke="#2b211c" stroke-width=".8" stroke-linejoin="round" d="M66.3 52.4 Q70 53.6 73.7 52.4 Q73 57.6 70 57.8 Q67 57.6 66.3 52.4 Z"/>
      <ellipse class="m-big" cx="70" cy="56.3" rx="2.2" ry="1.3" fill="#f48aa0"/>
      <path class="m-flat mouth" d="M70 51.5 V52.5 M67.4 53.6 Q70 52.8 72.6 53.6"/>
      <path class="m-sad mouth" d="M70 51.5 V52.4 M67.2 54.8 Q70 52.3 72.8 54.8"/>
      <ellipse class="m-o" cx="70" cy="54.2" rx="1.7" ry="2" fill="#8a2f45" stroke="#2b211c" stroke-width=".7"/>
      <path class="m-wail" fill="#8a2f45" stroke="#2b211c" stroke-width=".8" d="M67.4 55.6 Q70 51.4 72.6 55.6 Q72.2 57.8 70 57.8 Q67.8 57.8 67.4 55.6 Z"/>
      <path class="m-hiss" fill="#8a2f45" stroke="#2b211c" stroke-width=".8" d="M66.6 52.6 Q70 51.4 73.4 52.6 L72.2 57 Q70 58.2 67.8 57 Z M67.6 52.8 l.8 1.8 l.8 -1.6 M72.4 52.8 l-.8 1.8 l-.8 -1.6"/>
      <ellipse class="m-yawn" cx="70" cy="55" rx="2.8" ry="3.6" fill="#8a2f45" stroke="#2b211c" stroke-width=".8"/>
      <ellipse class="tongue" cx="71.2" cy="54.2" rx="1.7" ry="2.1" fill="#f48aa0" stroke="#2b211c" stroke-width=".5"/>
      <g class="thermo">
        <path d="M72 53 L84 58.5" stroke="#2b211c" stroke-width="3.4" stroke-linecap="round"/>
        <path d="M72 53 L84 58.5" stroke="#f4f4f4" stroke-width="1.9" stroke-linecap="round"/>
        <circle cx="85" cy="59" r="2.2" fill="#e53935" stroke="#2b211c" stroke-width=".7"/>
      </g>
      </g>
      <g class="whisker">
        <path d="M62.5 52.5 L46 50.5 M62.5 54 L47 55.8 M62.5 55.5 L48.5 59.5"/>
        <path d="M77.5 52.5 L94 50.5 M77.5 54 L93 55.8 M77.5 55.5 L91.5 59.5"/>
      </g>

      <!-- au-dessus de la tête -->
      <ellipse class="halo" cx="70" cy="-3" rx="13" ry="3.2" fill="none" stroke="#ffd54f" stroke-width="2.4"/>
      <g class="stink" fill="none" stroke="#9ccc65" stroke-width="2.2" stroke-linecap="round">
        <path d="M34 34 q-3 -4 0 -8 q3 -4 0 -8"/><path d="M106 34 q-3 -4 0 -8 q3 -4 0 -8"/><path d="M110 60 q-3 -4 0 -8 q3 -4 0 -8"/>
      </g>
      <g class="flies">
        ${[['', -1], [' f2', 5]].map(([c, y]) => `<g class="fly${c}"><g transform="translate(70 ${y})">
          <ellipse class="wing" cx="-1.4" cy="-1.6" rx="1.3" ry="2" fill="#fff" stroke="#555" stroke-width=".4"/>
          <ellipse class="wing" cx="1.4" cy="-1.6" rx="1.3" ry="2" fill="#fff" stroke="#555" stroke-width=".4"/>
          <circle r="1.5" fill="#333"/></g></g>`).join('')}
      </g>
      <g class="hearts" fill="#ff6f91">
        <path class="heart" d="M38 24 c-2 -3 -6 -1 -4 2 l4 4 l4 -4 c2 -3 -2 -5 -4 -2 Z"/>
        <path class="heart h2" d="M104 18 c-2 -3 -6 -1 -4 2 l4 4 l4 -4 c2 -3 -2 -5 -4 -2 Z"/>
        <path class="heart h3" d="M108 40 c-1.5 -2.2 -4.5 -.8 -3 1.5 l3 3 l3 -3 c1.5 -2.3 -1.5 -3.7 -3 -1.5 Z"/>
      </g>
    </g></g></g>
  </g></g></g>
</svg>`;


  // ---- Objets autour du chat (dessinés en SVG, posés au sol ou suivant la souris) ----
  const PROPS = {
    pouf: `<svg viewBox="0 0 120 44" width="120" height="44">
      <ellipse cx="60" cy="38" rx="56" ry="6" fill="#000" opacity=".12"/>
      <path d="M6 30 C4 16 20 8 60 8 C100 8 116 16 114 30 C112 40 94 42 60 42 C26 42 8 40 6 30 Z" fill="#f7b8c8"/>
      <path d="M14 27 C14 18 30 14 60 14 C90 14 106 18 106 27 C104 33 88 35 60 35 C32 35 16 33 14 27 Z" fill="#ffd9e3"/>
      <path d="M22 25 C30 21 44 20 60 20 C76 20 90 21 98 25" stroke="#f7b8c8" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".7"/>
      <circle cx="24" cy="34" r="1.6" fill="#fff" opacity=".7"/><circle cx="96" cy="34" r="1.6" fill="#fff" opacity=".7"/>
    </svg>`,
    water: `<svg viewBox="0 0 44 20" width="44" height="20">
      <ellipse cx="22" cy="17.5" rx="20" ry="2.5" fill="#000" opacity=".12"/>
      <path d="M2 6 H42 L38 18 H6 Z" fill="#8ec5f0" stroke="#5b9bd5" stroke-width="1"/>
      <ellipse class="level" cx="22" cy="6.4" rx="18.5" ry="2.6" fill="#cfeaff"/>
      <path class="ripple" d="M12 6.6 Q16 5.4 20 6.6 M24 6.4 Q28 5.2 32 6.4" stroke="#fff" stroke-width=".9" fill="none" opacity=".9"/>
      <path d="M8 12 h28" stroke="#fff" stroke-width="1.1" stroke-dasharray="1.5 2.5" opacity=".8"/>
    </svg>`,
    food: `<svg viewBox="0 0 44 20" width="44" height="20">
      <ellipse cx="22" cy="17.5" rx="20" ry="2.5" fill="#000" opacity=".12"/>
      <path d="M2 6 H42 L38 18 H6 Z" fill="#f6a5b8" stroke="#d77d93" stroke-width="1"/>
      <g class="kibble">${[[11, 5.6], [16, 4.6], [21, 5.4], [26, 4.4], [31, 5.5], [14, 6.8], [19, 6.4], [24, 6.9], [29, 6.6], [34, 6.8]]
        .map(([x, y], i) => `<ellipse class="k k${i}" cx="${x}" cy="${y}" rx="2.4" ry="1.6" fill="${i % 2 ? '#a8713e' : '#c28a52'}"/>`).join('')}</g>
      <path d="M8 12 h28" stroke="#fff" stroke-width="1.1" stroke-dasharray="1.5 2.5" opacity=".8"/>
    </svg>`,
    poop: `<svg viewBox="0 0 30 30" width="30" height="30">
      <g class="stinkp" fill="none" stroke="#9ccc65" stroke-width="1.6" stroke-linecap="round">
        <path d="M9 10 q-2 -3 0 -5 q2 -2 0 -4"/><path d="M15 8 q-2 -3 0 -5 q2 -2 0 -4"/><path d="M21 10 q-2 -3 0 -5 q2 -2 0 -4"/>
      </g>
      <ellipse cx="15" cy="27.5" rx="11" ry="2" fill="#000" opacity=".15"/>
      <path d="M5 26 C3 22 7 20 10 20 C8 17 11 14 14 15 C14 12 18 11 19 14 C22 14 23 17 21 19 C25 19 27 23 25 26 Z" fill="#8a5a34" stroke="#6b4426" stroke-width=".8"/>
      <path d="M9 22 Q12 21 14 22 M14 18 Q16 17 18 18" stroke="#a87448" stroke-width="1" fill="none"/>
      <circle cx="12" cy="23.5" r=".9" fill="#2b1d16"/><circle cx="17" cy="23.5" r=".9" fill="#2b1d16"/>
    </svg>`,
    treat: `<svg viewBox="0 0 24 14" width="24" height="14">
      <path d="M2 7 C6 1 14 1 18 7 C14 13 6 13 2 7 Z" fill="#e8a25c" stroke="#b9743a" stroke-width=".8"/>
      <path d="M17 7 L23 2.5 V11.5 Z" fill="#d98c45" stroke="#b9743a" stroke-width=".8"/><circle cx="6" cy="6" r="1" fill="#5a3a20"/>
    </svg>`,
    brush: `<svg viewBox="0 0 64 40" width="64" height="40">
      <rect x="30" y="16" width="32" height="8" rx="4" fill="#c98b5a" stroke="#9a6438" stroke-width="1" transform="rotate(-20 46 20)"/>
      <rect x="4" y="8" width="30" height="16" rx="5" fill="#f7b8c8" stroke="#d77d93" stroke-width="1"/>
      <g stroke="#7a6a64" stroke-width="1.3" stroke-linecap="round">${Array.from({ length: 9 }, (_, i) => `<path d="M${7 + i * 3} 24 v7"/>`).join('')}</g>
    </svg>`,
    hand: `<svg viewBox="0 0 48 48" width="48" height="48">
      <path d="M10 30 C8 22 10 16 14 16 C15 11 19 10 21 13 C22 8 27 8 28 12 C30 9 34 10 34 15 L35 24 C38 21 42 22 41 26 C38 32 34 40 26 42 C17 44 12 38 10 30 Z" fill="#ffd9c2" stroke="#d9a283" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M21 13 L22 24 M28 12 L28 24 M14 16 L16 25" stroke="#d9a283" stroke-width="1" fill="none" stroke-linecap="round"/>
    </svg>`,
    vet: `<svg viewBox="0 0 40 30" width="40" height="30">
      <ellipse cx="20" cy="28" rx="18" ry="2" fill="#000" opacity=".12"/>
      <path d="M14 8 V5 Q14 3 16 3 H24 Q26 3 26 5 V8" stroke="#8a8f99" stroke-width="2" fill="none"/>
      <rect x="3" y="8" width="34" height="19" rx="4" fill="#fff" stroke="#c9ccd3" stroke-width="1"/>
      <path d="M20 12 V23 M14.5 17.5 H25.5" stroke="#e53935" stroke-width="4" stroke-linecap="round"/>
    </svg>`,
    pill: `<svg viewBox="0 0 16 8" width="16" height="8"><rect x="1" y="1" width="14" height="6" rx="3" fill="#fff" stroke="#c9ccd3" stroke-width=".8"/><path d="M8 1 V7" stroke="#c9ccd3" stroke-width=".8"/><rect x="1" y="1" width="7" height="6" rx="3" fill="#ff8fa8"/></svg>`,
    leaf: `<svg viewBox="0 0 16 16" width="16" height="16"><path d="M2 14 C2 6 8 2 14 2 C14 8 10 14 2 14 Z" fill="#e8913a"/><path d="M2 14 L11 5" stroke="#b9652a" stroke-width="1"/></svg>`,
    flake: `<svg viewBox="0 0 12 12" width="12" height="12"><path d="M6 1 V11 M1.7 3.5 L10.3 8.5 M1.7 8.5 L10.3 3.5" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/></svg>`,
    tuft: `<svg viewBox="0 0 12 10" width="12" height="10"><path d="M1 6 C3 2 6 7 8 3 C9 6 11 5 11 8 C7 9 4 10 1 6 Z" class="tuft-fill"/></svg>`
  };

  // ---- Icônes de réaction (le chat ne parle pas) ----
  const I = (inner) => `<svg viewBox="0 0 24 24" width="24" height="24">${inner}</svg>`;
  const heartPath = 'M12 20.5 C6 16 2.5 12.6 2.5 8.6 C2.5 5.8 4.6 3.8 7.2 3.8 C9.2 3.8 10.9 5 12 6.8 C13.1 5 14.8 3.8 16.8 3.8 C19.4 3.8 21.5 5.8 21.5 8.6 C21.5 12.6 18 16 12 20.5 Z';
  const ICONS = {
    heart: I(`<path d="${heartPath}" fill="#ff6f91"/><circle cx="7.5" cy="8" r="1.6" fill="#fff" opacity=".7"/>`),
    broken: I(`<path d="${heartPath}" fill="#9aa3b5"/><path d="M12 6.8 L10 10.5 L13.2 12.5 L11 16.5" stroke="#fff" stroke-width="1.6" fill="none" stroke-linejoin="round"/>`),
    note: I(`<path d="M9 17.5 V5.5 L19 3.5 V15.5" stroke="#7e57c2" stroke-width="2" fill="none"/><ellipse cx="7" cy="17.8" rx="3" ry="2.3" fill="#7e57c2"/><ellipse cx="17" cy="15.8" rx="3" ry="2.3" fill="#7e57c2"/>`),
    fish: I(`<path d="M3 12 C7 6 14 6 18 12 C14 18 7 18 3 12 Z" fill="#6fb6ec"/><path d="M17 12 L22 7.5 V16.5 Z" fill="#4f95cf"/><circle cx="7.5" cy="11" r="1.2" fill="#1d2a44"/>`),
    yum: I(`<path d="M4 9 H20 L17.5 18 H6.5 Z" fill="#f6a5b8"/><ellipse cx="12" cy="9" rx="8" ry="2" fill="#9b6a3c"/><path d="M8 5 l1 -2 M12 4.5 l0 -2.5 M16 5 l-1 -2" stroke="#ffb74d" stroke-width="1.5" stroke-linecap="round"/>`),
    litter: I(`<path d="M3 13 H21 L19 20 H5 Z" fill="#c9a46c"/><path d="M9 10 q-2 -3 0 -5 q2 -2 0 -4 M15 10 q-2 -3 0 -5 q2 -2 0 -4" stroke="#9ccc65" stroke-width="1.6" fill="none" stroke-linecap="round"/>`),
    ball: I(`<circle cx="12" cy="12" r="8" fill="#e53935"/><path d="M4.5 10 C9 12.5 15 12.5 19.5 10" stroke="#fff" stroke-width="1.6" fill="none"/><circle cx="9" cy="8" r="1.6" fill="#fff" opacity=".6"/>`),
    moon: I(`<path d="M15 3 A9 9 0 1 0 21 15 A7 7 0 1 1 15 3 Z" fill="#ffd54f"/><circle cx="19" cy="5" r="1" fill="#ffd54f"/>`),
    sweat: I(`<path d="M12 3 C8 9 6 12 6 15 A6 6 0 0 0 18 15 C18 12 16 9 12 3 Z" fill="#8fd3ff"/><ellipse cx="9.5" cy="14" rx="1.3" ry="2.2" fill="#fff" opacity=".7"/>`),
    sick: I(`<path d="M6 18 L15 6" stroke="#2b211c" stroke-width="4.6" stroke-linecap="round"/><path d="M6 18 L15 6" stroke="#f4f4f4" stroke-width="2.6" stroke-linecap="round"/><circle cx="5.4" cy="18.8" r="3" fill="#e53935"/>`),
    angry: I(`<path d="M12 3 V9 M12 15 V21 M3 12 H9 M15 12 H21" stroke="#e53935" stroke-width="3" stroke-linecap="round"/><path d="M8 8 L10 10 M16 8 L14 10 M8 16 L10 14 M16 16 L14 14" stroke="#e53935" stroke-width="2" stroke-linecap="round"/>`),
    surprise: I(`<path d="M12 3 V14" stroke="#ff7043" stroke-width="3.4" stroke-linecap="round"/><circle cx="12" cy="19.5" r="2" fill="#ff7043"/>`),
    meh: I(`<circle cx="6" cy="12" r="2" fill="#8d8d99"/><circle cx="12" cy="12" r="2" fill="#8d8d99"/><circle cx="18" cy="12" r="2" fill="#8d8d99"/>`),
    nope: I(`<circle cx="12" cy="12" r="8.5" fill="none" stroke="#e57373" stroke-width="2.4"/><path d="M6 18 L18 6" stroke="#e57373" stroke-width="2.4"/>`),
    sparkle: I(`<path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" fill="#ffd54f"/><circle cx="19" cy="5" r="1.4" fill="#ffd54f"/>`),
    dizzy: I(`<path d="M12 12 m0 -1 a1 1 0 1 1 -1 1 a3 3 0 1 1 3 3 a5 5 0 1 1 -5 -5 a7 7 0 1 1 7 7" stroke="#7e57c2" stroke-width="1.8" fill="none" stroke-linecap="round"/>`),
    rain: I(`<path d="M6 13 A4.5 4.5 0 0 1 8 4.6 A6 6 0 0 1 19 7 A3.6 3.6 0 0 1 18.5 14 Z" fill="#9fb3c8"/><path d="M8 17 l-1 3 M12.5 17 l-1 3 M17 17 l-1 3" stroke="#5aa9e6" stroke-width="1.8" stroke-linecap="round"/>`),
    question: I(`<path d="M8 8 A4 4 0 1 1 13.5 11.6 C12.4 12.3 12 13 12 14.5" stroke="#5c6bc0" stroke-width="2.6" fill="none" stroke-linecap="round"/><circle cx="12" cy="19.5" r="1.8" fill="#5c6bc0"/>`)
  };

  // Robe -> variables CSS du dessin
  const lighten = (hex, k) => {
    const n = parseInt(hex.slice(1), 16);
    const mix = (c) => Math.round(c + (255 - c) * k);
    return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
  };
  const luminance = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255; };
  function applyCatColors(el, c) {
    const vars = {
      '--fur': c.fur, '--fur-light': c.light, '--point': c.point, '--mask': c.mask,
      '--eye': c.eye, '--eye-hi': lighten(c.eye, 0.6),
      '--paw': c.point,
      '--muzzle-o': (1 - c.mask).toFixed(2),
      '--nose': c.mask >= 0.8 ? '#6e4a50' : '#e98ea0',
      '--whisker': c.mask >= 0.8 || luminance(c.fur) < 0.45 ? '#ffffff' : 'rgba(58,45,38,.5)'
    };
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  }

  // Chaque chat de la page reçoit ses propres identifiants de dégradés (sinon ils partageraient les couleurs du premier)
  let instances = 0;
  const uniqueSvg = () => { const n = ++instances; return SVG.replace(/(id="|url\(#)((?:g|clip)-[a-z-]+)/g, `$1$2-${n}`); };

  window.CAT_SVG = SVG;
  window.catSvg = uniqueSvg;
  window.CAT_ICONS = ICONS;
  window.CAT_PROPS = PROPS;
  window.applyCatColors = applyCatColors;
  for (const el of document.querySelectorAll('.cat')) el.innerHTML = uniqueSvg();
})();
