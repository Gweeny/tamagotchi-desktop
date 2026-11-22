// Lancer avec : npm test (deux « PC » simulés dans le même processus, sur la machine locale)
const test = require('node:test');
const assert = require('node:assert');
const { Lan } = require('./lan');

const UDP = 41299; // port de test, différent du vrai
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function until(cond, ms = 4000) {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) return false; await wait(50); }
  return true;
}

test('deux apps se trouvent sur le réseau local et échangent des messages', async (t) => {
  const sam = new Lan({ id: 'sam', nick: 'Sam', udpPort: UDP, announceMs: 200, expireMs: 1200 });
  const lea = new Lan({ id: 'lea', nick: 'Léa', udpPort: UDP, announceMs: 200, expireMs: 1200 });
  t.after(() => { sam.stop(); lea.stop(); });
  await sam.start(); await lea.start();

  assert.ok(await until(() => sam.peers().some(p => p.id === 'lea') && lea.peers().some(p => p.id === 'sam')), 'découverte');
  assert.strictEqual(sam.peer('lea').nick, 'Léa');

  // Léa reçoit le chat de Sam
  let received = null;
  lea.handlers.travel = async (body, from) => { received = { body, from }; return { ok: true }; };
  const r = await sam.send('lea', 'travel', { visitId: 'v1', cat: { name: 'Matou' } });
  assert.deepStrictEqual(r, { ok: true });
  assert.strictEqual(received.from.nick, 'Sam');
  assert.strictEqual(received.body.cat.name, 'Matou');

  // Route inconnue ou sans handler : refusée proprement
  assert.strictEqual(await sam.send('lea', 'hack', {}), null);
  assert.deepStrictEqual(await lea.send('sam', 'care', { visitId: 'v1' }), { ok: false });

  // Léa ferme son app : Sam ne la voit plus
  lea.stop();
  assert.ok(await until(() => !sam.peers().some(p => p.id === 'lea')), 'disparition');
  assert.strictEqual(await sam.send('lea', 'status', {}), null);
});

test('les annonces et messages mal formés sont ignorés', async (t) => {
  const sam = new Lan({ id: 'sam2', nick: 'Sam', udpPort: UDP + 1, announceMs: 200 });
  t.after(() => sam.stop());
  await sam.start();
  for (const bad of ['pas du json', JSON.stringify({ app: 'autre', v: 1, id: 'x', nick: 'X', port: 1 }),
    JSON.stringify({ app: 'tamagotchi-desktop', v: 1, id: 'x', nick: 'un pseudo beaucoup trop long pour être accepté', port: 1 }),
    'x'.repeat(2000)]) {
    sam._onAnnounce(Buffer.from(bad), { address: '127.0.0.1' });
  }
  assert.strictEqual(sam.peers().length, 0);

  // Corps HTTP trop gros ou sans expéditeur
  sam.handlers.travel = async () => ({ ok: true });
  const post = (body) => fetch(`http://127.0.0.1:${sam.port}/travel`, { method: 'POST', body }).then(r => r.status);
  assert.strictEqual(await post('{}'), 400);
  assert.strictEqual(await post('x'.repeat(20000)).catch(() => 413), 413);
});

test("l'annonce part sur chaque carte réseau, et on peut ajouter un ami par son adresse IP", () => {
  const { localNetworks, isIPv4 } = require('./lan');
  const lan = new Lan({ id: 'x', nick: 'X' });
  const t = lan.targets();
  assert.ok(t.includes('255.255.255.255'));
  for (const n of localNetworks()) {
    assert.ok(t.includes(n.broadcast), n.name);
    assert.ok(!n.address.startsWith('169.254.'), 'pas les adresses automatiques');
  }
  assert.ok(lan.addManual('192.168.1.42'));
  assert.ok(lan.targets().includes('192.168.1.42'));
  for (const bad of ['192.168.1', '999.1.1.1', 'localhost', '1.2.3.4; rm', '']) assert.ok(!isIPv4(bad), bad);
  assert.ok(!lan.addManual('pas une ip'));
});
