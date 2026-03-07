// === DATA CACHE — IndexedDB Persistent Storage ===
// v5: Added session_keys store for non-extractable CryptoKey persistence.
// Keys survive page navigation but expire after TTL (30 minutes).

var DataCache = (function() {
  var DB_NAME = 'fi_dashboard';
  var DB_VERSION = 4;
  var STORE_NAME = 'cache';
  var DIR_STORE = 'dir_handles';
  var VAULT_STORE = 'vault_cache';
  var SYNC_STORE = 'pending_sync';
  var KEYS_STORE = 'session_keys';
  var CACHE_KEY = 'session';
  var DIR_KEY = 'save_dir';
  var VAULT_KEY = 'records';

  var SESSION_KEY_TTL = 30 * 60 * 1000; // 30 minutes

  // --- Per-session encryption key (shared across page navigations) ---
  // On first load: generate a new key and store in IDB.
  // On subsequent loads (same session): retrieve from IDB.
  var _sessionKeyPromise = null;

  function _getOrCreateSessionKey() {
    if (_sessionKeyPromise) return _sessionKeyPromise;
    _sessionKeyPromise = _loadSessionKeyFromIDB('session_aes').then(function(entry) {
      if (entry && entry.key) return entry.key;
      // No valid key — generate a new one
      return crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
      ).then(function(key) {
        // Store in IDB for cross-page use
        _saveSessionKeyToIDB('session_aes', key, { purpose: 'session_encryption' }).catch(function() {});
        return key;
      });
    }).catch(function() {
      // IDB unavailable — fall back to ephemeral key
      return crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
      );
    });
    return _sessionKeyPromise;
  }

  // Low-level IDB helpers for session_keys (used before _openDB is safe to call
  // in a chain, and also exposed publicly)

  function _saveSessionKeyToIDB(id, cryptoKey, meta) {
    return _openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(KEYS_STORE, 'readwrite');
        tx.objectStore(KEYS_STORE).put({
          key: cryptoKey,
          createdAt: Date.now(),
          meta: meta || {}
        }, id);
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  }

  function _loadSessionKeyFromIDB(id) {
    return _openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(KEYS_STORE, 'readonly');
        var request = tx.objectStore(KEYS_STORE).get(id);
        request.onsuccess = function() {
          var result = request.result;
          if (!result || !result.key) { resolve(null); return; }
          // Check TTL
          if (Date.now() - result.createdAt > SESSION_KEY_TTL) {
            // Expired — delete and return null
            _deleteSessionKeyFromIDB(id).catch(function() {});
            resolve(null);
            return;
          }
          resolve(result);
        };
        request.onerror = function() { reject(request.error); };
      });
    });
  }

  function _deleteSessionKeyFromIDB(id) {
    return _openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(KEYS_STORE, 'readwrite');
        tx.objectStore(KEYS_STORE).delete(id);
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  }

  function _bufToBase64(buf) {
    var binary = '';
    var bytes = new Uint8Array(buf);
    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function _base64ToBuf(b64) {
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  async function _encryptData(data) {
    var key = await _getOrCreateSessionKey();
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var plaintext = new TextEncoder().encode(JSON.stringify(data));
    var ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv }, key, plaintext
    );
    return {
      iv: _bufToBase64(iv),
      ct: _bufToBase64(new Uint8Array(ciphertext))
    };
  }

  async function _decryptData(encrypted) {
    var key = await _getOrCreateSessionKey();
    var iv = _base64ToBuf(encrypted.iv);
    var ct = _base64ToBuf(encrypted.ct);
    var plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv }, key, ct
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  }

  function _openDB() {
    return new Promise(function(resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function(e) {
        var db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
        if (!db.objectStoreNames.contains(DIR_STORE)) {
          db.createObjectStore(DIR_STORE);
        }
        if (!db.objectStoreNames.contains(VAULT_STORE)) {
          db.createObjectStore(VAULT_STORE);
        }
        if (!db.objectStoreNames.contains(SYNC_STORE)) {
          db.createObjectStore(SYNC_STORE, { autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(KEYS_STORE)) {
          db.createObjectStore(KEYS_STORE);
        }
      };
      request.onsuccess = function() { resolve(request.result); };
      request.onerror = function() { reject(request.error); };
    });
  }

  // --- File-mode cache (encrypted at rest) ---

  function save(data) {
    return _encryptData({
      decryptedData: data.decryptedData,
      wasEncrypted: data.wasEncrypted,
      originalFileText: data.originalFileText,
      filename: data.filename,
      storageMode: data.storageMode || 'file',
      cachedAt: Date.now()
    }).then(function(encrypted) {
      return _openDB().then(function(db) {
        return new Promise(function(resolve, reject) {
          var tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).put(encrypted, CACHE_KEY);
          tx.oncomplete = function() { resolve(); };
          tx.onerror = function() { reject(tx.error); };
        });
      });
    });
  }

  function load() {
    return _openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readonly');
        var request = tx.objectStore(STORE_NAME).get(CACHE_KEY);
        request.onsuccess = function() {
          var result = request.result;
          if (!result) { resolve(null); return; }
          // If it has iv+ct, it's encrypted (v4+). Otherwise stale unencrypted data — discard.
          if (!result.iv || !result.ct) {
            resolve(null);
            return;
          }
          _decryptData(result).then(resolve).catch(function() {
            // Key expired or rotated — stale cache, discard
            resolve(null);
          });
        };
        request.onerror = function() { reject(request.error); };
      });
    });
  }

  function clear() {
    return _openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(CACHE_KEY);
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  }

  // --- Directory Handle Persistence (Chrome File System Access API) ---

  function saveDirHandle(handle) {
    return _openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(DIR_STORE, 'readwrite');
        tx.objectStore(DIR_STORE).put(handle, DIR_KEY);
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  }

  function loadDirHandle() {
    return _openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(DIR_STORE, 'readonly');
        var request = tx.objectStore(DIR_STORE).get(DIR_KEY);
        request.onsuccess = function() { resolve(request.result || null); };
        request.onerror = function() { reject(request.error); };
      });
    });
  }

  // --- Vault Cache (encrypted DB records for offline) ---

  function saveEncrypted(records) {
    var entry = {
      records: records,
      cachedAt: Date.now()
    };
    return _openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(VAULT_STORE, 'readwrite');
        tx.objectStore(VAULT_STORE).put(entry, VAULT_KEY);
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  }

  function loadEncrypted() {
    return _openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(VAULT_STORE, 'readonly');
        var request = tx.objectStore(VAULT_STORE).get(VAULT_KEY);
        request.onsuccess = function() { resolve(request.result || null); };
        request.onerror = function() { reject(request.error); };
      });
    });
  }

  function clearEncrypted() {
    return _openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(VAULT_STORE, 'readwrite');
        tx.objectStore(VAULT_STORE).delete(VAULT_KEY);
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  }

  // --- Pending Sync Queue (offline writes) ---

  function queueSync(op) {
    var entry = {
      op: op,
      queuedAt: Date.now()
    };
    return _openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(SYNC_STORE, 'readwrite');
        tx.objectStore(SYNC_STORE).add(entry);
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  }

  function getPendingSync() {
    return _openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(SYNC_STORE, 'readonly');
        var store = tx.objectStore(SYNC_STORE);
        var results = [];
        var cursorReq = store.openCursor();
        cursorReq.onsuccess = function() {
          var cursor = cursorReq.result;
          if (cursor) {
            results.push({ key: cursor.key, op: cursor.value.op, queuedAt: cursor.value.queuedAt });
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        cursorReq.onerror = function() { reject(cursorReq.error); };
      });
    });
  }

  function removeSynced(key) {
    return _openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(SYNC_STORE, 'readwrite');
        tx.objectStore(SYNC_STORE).delete(key);
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  }

  function clearPendingSync() {
    return _openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(SYNC_STORE, 'readwrite');
        tx.objectStore(SYNC_STORE).clear();
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  }

  // --- Session Keys (non-extractable CryptoKey persistence) ---

  function saveSessionKey(id, cryptoKey, meta) {
    return _saveSessionKeyToIDB(id, cryptoKey, meta);
  }

  function loadSessionKey(id) {
    return _loadSessionKeyFromIDB(id);
  }

  function clearSessionKey(id) {
    return _deleteSessionKeyFromIDB(id);
  }

  function clearAllSessionKeys() {
    return _openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(KEYS_STORE, 'readwrite');
        tx.objectStore(KEYS_STORE).clear();
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  }

  return {
    save: save,
    load: load,
    clear: clear,
    saveDirHandle: saveDirHandle,
    loadDirHandle: loadDirHandle,
    saveEncrypted: saveEncrypted,
    loadEncrypted: loadEncrypted,
    clearEncrypted: clearEncrypted,
    queueSync: queueSync,
    getPendingSync: getPendingSync,
    removeSynced: removeSynced,
    clearPendingSync: clearPendingSync,
    saveSessionKey: saveSessionKey,
    loadSessionKey: loadSessionKey,
    clearSessionKey: clearSessionKey,
    clearAllSessionKeys: clearAllSessionKeys
  };
})();
