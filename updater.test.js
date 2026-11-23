// Lancer avec : npm test
const test = require('node:test');
const assert = require('node:assert');
const { newer, checkForUpdate } = require('./updater');

test('comparaison des versions', () => {
  assert.ok(newer('v0.5.1', '0.5.0'));
  assert.ok(newer('1.0.0', '0.9.9'));
  assert.ok(newer('0.5.10', '0.5.9'));
  assert.ok(!newer('0.5.0', '0.5.0'));
  assert.ok(!newer('v0.4.9', '0.5.0'));
});

test('sans dépôt configuré (ou dépôt invalide), on ne contacte personne', async () => {
  assert.strictEqual(await checkForUpdate('', '0.5.0'), null);
  assert.strictEqual(await checkForUpdate('pas un dépôt', '0.5.0'), null);
  assert.strictEqual(await checkForUpdate('a/b/../../etc', '0.5.0'), null);
});

test('ménage : les installateurs déjà utilisés sont supprimés, pas celui d\'une version plus récente', () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const { cleanup } = require('./updater');
  const old = path.join(os.tmpdir(), 'Tamagotchi-Desktop-Setup-0.0.1.exe');
  const future = path.join(os.tmpdir(), 'Tamagotchi-Desktop-Setup-99.0.0.exe');
  fs.writeFileSync(old, 'x'); fs.writeFileSync(future, 'x');
  cleanup('0.5.4');
  assert.ok(!fs.existsSync(old), 'ancien supprimé');
  assert.ok(fs.existsSync(future), 'version à venir gardée');
  fs.unlinkSync(future);
});
