// Mises à jour depuis GitHub (sans paquet en plus) :
//  - on demande à GitHub la dernière version publiée (« Release ») du dépôt indiqué dans package.json (updateRepo) ;
//  - si elle est plus récente, on propose « Mettre à jour » ; un clic télécharge l'installateur (.exe joint à la Release),
//    le lance, et ferme l'app : l'installateur remplace l'ancienne version et relance le chat (sauvegarde conservée).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const REPO_RE = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const ALLOWED_HOSTS = ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'];

// « 1.2.10 » > « 1.2.9 »
function newer(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number), pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
}

async function checkForUpdate(repo, currentVersion) {
  if (!REPO_RE.test(repo || '')) return null; // dépôt pas encore configuré
  const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { 'User-Agent': 'tamagotchi-desktop', Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) return null;
  const rel = await r.json();
  if (!rel || !newer(rel.tag_name, currentVersion)) return null;
  const asset = (rel.assets || []).find(a => /\.exe$/i.test(a.name) && a.size > 1e6 && a.size < 500e6);
  if (!asset) return null;
  const url = new URL(asset.browser_download_url);
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.includes(url.hostname)) return null;
  return { version: String(rel.tag_name).replace(/^v/, ''), url: url.href, name: asset.name, size: asset.size };
}

// Télécharge l'installateur dans le dossier temporaire puis le lance ; renvoie true si c'est parti
async function downloadAndInstall(update) {
  const r = await fetch(update.url, { headers: { 'User-Agent': 'tamagotchi-desktop' }, redirect: 'follow', signal: AbortSignal.timeout(10 * 60000) });
  const final = new URL(r.url);
  if (!r.ok || !ALLOWED_HOSTS.includes(final.hostname)) return false;
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length !== update.size) return false; // téléchargement incomplet
  const file = path.join(os.tmpdir(), `Tamagotchi-Desktop-Setup-${update.version.replace(/[^0-9.]/g, '')}.exe`);
  fs.writeFileSync(file, buf);
  spawn(file, [], { detached: true, stdio: 'ignore' }).unref();
  return true;
}

module.exports = { checkForUpdate, downloadAndInstall, newer };
