// === DATA CACHE — IndexedDB Persistent Storage ===
// v3: Adds vault_cache (encrypted DB records) and pending_sync stores.
// Removes plaintext passphrase from file-mode cache.

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

  // --- File-mode cache (decrypted data, no passphrase) ---

  function save(data) {
    var record = {
      decryptedData: data.decryptedData,
      // v3: no longer store passphrase in IDB
      wasEncrypted: data.wasEncrypted,
      originalFileText: data.originalFileText,
      filename: data.filename,
      storageMode: data.storageMode || 'file',
      cachedAt: Date.now()
    };
    return _openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(record, CACHE_KEY);
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { reject(tx.error); };
      });
    });
  }

  function load() {
    return _openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readonly');
        var request = tx.objectStore(STORE_NAME).get(CACHE_KEY);
        request.onsuccess = function() { resolve(request.result || null); };
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

  // Save encrypted records from DB for offline access.
  // records: array of { record_hash, iv, data, updated_at }
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

  // Load cached encrypted records.
  // Returns { records, cachedAt } or null.
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

  // Queue an operation for later sync.
  // op: { action: 'upsert'|'delete', records: [...] }
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

  // Get all pending sync operations. Returns array of { key, op, queuedAt }.
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

  // Remove a synced operation by key.
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

  // Clear all pending sync.
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
