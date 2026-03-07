// === DB-CRYPTO — Zero-Knowledge Crypto Primitives ===
// Separate from Crypto (which handles .fjson). All Web Crypto API.
// Provides: auth password derivation, encryption key derivation,
// deterministic record hashing, AES-256-GCM encrypt/decrypt per record.

var DbCrypto = {
  ENC_ITERATIONS: 100000,
  AUTH_ITERATIONS: 10000,
  SALT_BYTES: 16,
  IV_BYTES: 12,

  // --- Helpers ---

  _encode: function(str) {
    return new TextEncoder().encode(str);
  },

  _decode: function(buf) {
    return new TextDecoder().decode(buf);
  },

  _toBase64: function(buf) {
    var binary = '';
    var bytes = new Uint8Array(buf);
    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  },

  _fromBase64: function(b64) {
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  },

  _toHex: function(buf) {
    var bytes = new Uint8Array(buf);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  },

  // --- Key Derivation ---

  // Derive auth password from passphrase + email (1 PBKDF2 iteration).
  // Result is a hex string sent to Supabase as the user's password.
  // Intentionally weak derivation: this is NOT the encryption key.
  // Purpose: ensure the raw passphrase never leaves the client.
  deriveAuthPassword: async function(passphrase, email) {
    var salt = this._encode(email.toLowerCase().trim());
    var keyMaterial = await crypto.subtle.importKey(
      'raw', this._encode(passphrase), 'PBKDF2', false, ['deriveBits']
    );
    var bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: salt, iterations: this.AUTH_ITERATIONS, hash: 'SHA-256' },
      keyMaterial,
      256
    );
    return this._toHex(bits);
  },

  // Derive encryption key from passphrase + enc_salt (100k PBKDF2 iterations).
  // Returns a non-extractable CryptoKey for AES-256-GCM.
  deriveEncryptionKey: async function(passphrase, encSaltB64) {
    var salt = this._fromBase64(encSaltB64);
    var keyMaterial = await crypto.subtle.importKey(
      'raw', this._encode(passphrase), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: this.ENC_ITERATIONS, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  },

  // --- Record Hashing ---

  // Deterministic opaque hash for a record's identity.
  // SHA-256(type + '|' + naturalKey + '|' + encSalt)
  // The enc_salt ensures hashes are user-specific (can't correlate across users).
  recordHash: async function(type, naturalKey, encSaltB64) {
    var input = type + '|' + naturalKey + '|' + encSaltB64;
    var hash = await crypto.subtle.digest('SHA-256', this._encode(input));
    return this._toHex(hash);
  },

  // --- Encrypt / Decrypt Records ---

  // Encrypt a single record. Returns { record_hash, iv, data }.
  // The type and naturalKey are encrypted inside the ciphertext.
  encryptRecord: async function(cryptoKey, type, naturalKey, payload, encSaltB64) {
    var iv = crypto.getRandomValues(new Uint8Array(this.IV_BYTES));
    var plaintext = JSON.stringify({ type: type, key: naturalKey, payload: payload });
    var ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv }, cryptoKey, this._encode(plaintext)
    );
    var hash = await this.recordHash(type, naturalKey, encSaltB64);
    return {
      record_hash: hash,
      iv: this._toBase64(iv),
      data: this._toBase64(ciphertext)
    };
  },

  // Decrypt a single record. Returns { type, key, payload }.
  decryptRecord: async function(cryptoKey, ivB64, dataB64) {
    var iv = this._fromBase64(ivB64);
    var ciphertext = this._fromBase64(dataB64);
    var plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv }, cryptoKey, ciphertext
    );
    return JSON.parse(this._decode(plaintext));
  },

  // --- Salt Generation ---

  // Generate a random 16-byte salt, returned as base64.
  // Created once at registration and stored in user_vaults.
  generateSalt: function() {
    var salt = crypto.getRandomValues(new Uint8Array(this.SALT_BYTES));
    return this._toBase64(salt);
  }
};
