// Icône de l'app : petite tête de chat kawaii dessinée en code (pas de fichier image à fournir),
// encodée en PNG. Utilisée pour la zone de notification et pour l'installateur (build-icon.js).
const zlib = require('zlib');

function trayIconPng(size = 32) {
  const SS = 4; // sur-échantillonnage pour lisser les bords
  const rgba = Buffer.alloc(size * size * 4);
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const C = { fur: hex('#f3e3cc'), point: hex('#5a3d2e'), mask: hex('#a07c64'), eye: hex('#4f9fe0'), pupil: hex('#17131c'), white: [255, 255, 255], nose: hex('#6e4a50'), edge: hex('#8a6a55') };
  const inEll = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const inTri = (x, y, a, b, c) => {
    const s = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
    const d1 = s([x, y], a, b), d2 = s([x, y], b, c), d3 = s([x, y], c, a);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  const colorAt = (x, y) => { // du dessus vers le dessous
    for (const ex of [0.35, 0.65]) {
      if (inEll(x, y, ex + 0.03, 0.535, 0.028, 0.028)) return C.white;
      if (inEll(x, y, ex, 0.565, 0.045, 0.06)) return C.pupil;
      if (inEll(x, y, ex, 0.56, 0.095, 0.1)) return C.eye;
    }
    if (inEll(x, y, 0.5, 0.69, 0.035, 0.025)) return C.nose;
    if (inEll(x, y, 0.5, 0.72, 0.2, 0.15)) return C.mask;
    if (inEll(x, y, 0.5, 0.6, 0.44, 0.36)) return inEll(x, y, 0.5, 0.6, 0.405, 0.325) ? C.fur : C.edge;
    if (inTri(x, y, [0.08, 0.5], [0.16, 0.03], [0.48, 0.3])) return C.point;
    if (inTri(x, y, [0.92, 0.5], [0.84, 0.03], [0.52, 0.3])) return C.point;
    return null;
  };
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const c = colorAt((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size);
      if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
    }
    const i = (py * size + px) * 4;
    if (a) { rgba[i] = r / a; rgba[i + 1] = g / a; rgba[i + 2] = b / a; rgba[i + 3] = (255 * a) / (SS * SS); }
  }
  // Encodage PNG minimal (RGBA 8 bits, sans filtre)
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = { trayIconPng };
