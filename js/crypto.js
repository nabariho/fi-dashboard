// === CRYPTO — Browser (Web Crypto API) ===
// AES-256-GCM with PBKDF2 key derivation. Produces/consumes .fjson format.

var Crypto = {
  PBKDF2_ITERATIONS: 100000,
  SALT_BYTES: 16,
  IV_BYTES: 12,

  // Encode string to Uint8Array
  _encode: function(str) {
    return new TextEncoder().encode(str);
  },

  // Decode Uint8Array to string
  _decode: function(buf) {
    return new TextDecoder().decode(buf);
  },

  // Base64 encode Uint8Array
  _toBase64: function(buf) {
    var binary = '';
    var bytes = new Uint8Array(buf);
    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  },

  // Base64 decode to Uint8Array
  _fromBase64: function(b64) {
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  },

  // Derive AES-256 key from passphrase + salt
  deriveKey: async function(passphrase, salt) {
    var keyMaterial = await crypto.subtle.importKey(
      'raw', this._encode(passphrase), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: this.PBKDF2_ITERATIONS, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  },

  // Encrypt: data object → { v, salt, iv, data }
  encrypt: async function(data, passphrase) {
    var salt = crypto.getRandomValues(new Uint8Array(this.SALT_BYTES));
    var iv = crypto.getRandomValues(new Uint8Array(this.IV_BYTES));
    var key = await this.deriveKey(passphrase, salt);
    var plaintext = this._encode(JSON.stringify(data));
    var ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv }, key, plaintext
    );
    return {
      v: 1,
      salt: this._toBase64(salt),
      iv: this._toBase64(iv),
      data: this._toBase64(ciphertext)
    };
  },

  // Decrypt: { v, salt, iv, data } + passphrase → parsed JSON
  decrypt: async function(encrypted, passphrase) {
    var salt = this._fromBase64(encrypted.salt);
    var iv = this._fromBase64(encrypted.iv);
    var ciphertext = this._fromBase64(encrypted.data);
    var key = await this.deriveKey(passphrase, salt);
    var plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv }, key, ciphertext
    );
    return JSON.parse(this._decode(plaintext));
  }
};
