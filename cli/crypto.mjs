// === CRYPTO — CLI (Node.js crypto module) ===
// AES-256-GCM with PBKDF2 key derivation. Same algorithm and format as js/crypto.js.

import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'node:crypto';

const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;
const AUTH_TAG_BYTES = 16;

export function deriveKey(passphrase, salt) {
  return pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_BYTES, 'sha256');
}

export function encrypt(data, passphrase) {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Web Crypto API appends the auth tag to the ciphertext, so we do the same
  const ciphertext = Buffer.concat([encrypted, authTag]);

  return {
    v: 1,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    data: ciphertext.toString('base64')
  };
}

export function decrypt(encryptedObj, passphrase) {
  const salt = Buffer.from(encryptedObj.salt, 'base64');
  const iv = Buffer.from(encryptedObj.iv, 'base64');
  const ciphertext = Buffer.from(encryptedObj.data, 'base64');
  const key = deriveKey(passphrase, salt);

  // Split ciphertext and auth tag (last 16 bytes)
  const encrypted = ciphertext.subarray(0, ciphertext.length - AUTH_TAG_BYTES);
  const authTag = ciphertext.subarray(ciphertext.length - AUTH_TAG_BYTES);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}
