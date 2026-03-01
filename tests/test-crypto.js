// === Crypto Tests ===

describe('Crypto', function() {
  it('encrypt then decrypt returns original data', async function() {
    var original = {
      config: { fi_target: 1000000 },
      accounts: [{ account_id: 'TEST', account_name: 'Test' }],
      data: [{ month: '2024-01', account_id: 'TEST', end_value: 50000, net_contribution: 1000 }],
      budgetItems: []
    };
    var passphrase = 'test-passphrase-123';

    var encrypted = await Crypto.encrypt(original, passphrase);

    // Verify encrypted format
    assertEqual(encrypted.v, 1);
    assert(typeof encrypted.salt === 'string', 'salt should be string');
    assert(typeof encrypted.iv === 'string', 'iv should be string');
    assert(typeof encrypted.data === 'string', 'data should be string');

    // Decrypt and verify
    var decrypted = await Crypto.decrypt(encrypted, passphrase);
    assertEqual(decrypted.config.fi_target, 1000000);
    assertEqual(decrypted.accounts[0].account_id, 'TEST');
    assertEqual(decrypted.data[0].end_value, 50000);
  });

  it('wrong passphrase throws error', async function() {
    var original = { test: 'data' };
    var encrypted = await Crypto.encrypt(original, 'correct-password');

    var threw = false;
    try {
      await Crypto.decrypt(encrypted, 'wrong-password');
    } catch (e) {
      threw = true;
    }
    assert(threw, 'Should throw on wrong passphrase');
  });

  it('each encryption produces different salt and iv', async function() {
    var data = { test: true };
    var enc1 = await Crypto.encrypt(data, 'pass');
    var enc2 = await Crypto.encrypt(data, 'pass');
    assert(enc1.salt !== enc2.salt, 'Salts should differ');
    assert(enc1.iv !== enc2.iv, 'IVs should differ');
  });
});
