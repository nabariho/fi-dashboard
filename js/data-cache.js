// === DATA CACHE — IndexedDB Persistent Storage ===
// v4: All stores except dir_handles are encrypted with a per-tab AES key.
// On tab close the key is lost, so cached data requires re-authentication.

var DataCache = (function() {
  var DB_NAME = 'fi_dashboard';
  var DB_VERSION = 3;
  var STORE_NAME = 'cache';
  var DIR_STORE = 'dir_handles';
  var VAULT_STORE = 'vault_cache';
  var SYNC_STORE = 'pending_sync';
  var CACHE_KEY = 'session';
  var DIR_KEY = 'save_dir';
  var VAULT_KEY = 'records';

  // --- Per-tab encryption key (never persisted) ---
  var _cacheKeyPromise = crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );

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
    var key = await _cacheKeyPromise;
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
    var key = await _cacheKeyPromise;
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
          // If it has iv+ct, it's encrypted (v4). Otherwise stale unencrypted data — discard.
          if (!result.iv || !result.ct) {
            resolve(null);
            return;
          }
          _decryptData(result).then(resolve).catch(function() {
            // Key rotated (new tab) — stale cache, discard
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
  // Not encrypted — contains no financial data, just a browser handle.

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
  // These are already AES-256-GCM ciphertext from Supabase — stored as-is.

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
  // Records here are already encrypted ciphertext — stored as-is.

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
    clearPendingSync: clearPendingSync
  };
})();
