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
