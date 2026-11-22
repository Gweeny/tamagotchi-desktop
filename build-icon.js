// Génère l'icône de l'installateur (build/icon.png, 256x256) à partir du dessin de icon.js.
// Lancé automatiquement par « npm run dist ».
const fs = require('fs');
const path = require('path');
const { trayIconPng } = require('./icon');

fs.mkdirSync(path.join(__dirname, 'build'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'build', 'icon.png'), trayIconPng(256));
console.log('build/icon.png généré');
