// === DATA CACHE — IndexedDB Persistent Storage ===
// Caches decrypted data across browser sessions so users don't re-pick the file on every visit.
// Also persists directory handles for File System Access API (Chrome).

var DataCache = (function() {
  var DB_NAME = 'fi_dashboard';
  var DB_VERSION = 2;
  var STORE_NAME = 'cache';
  var DIR_STORE = 'dir_handles';
  var CACHE_KEY = 'session';
  var DIR_KEY = 'save_dir';

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
      };
      request.onsuccess = function() { resolve(request.result); };
      request.onerror = function() { reject(request.error); };
    });
  }

  function save(data) {
    var record = {
      decryptedData: data.decryptedData,
      passphrase: data.passphrase,
      wasEncrypted: data.wasEncrypted,
      originalFileText: data.originalFileText,
      filename: data.filename,
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

  return {
    save: save,
    load: load,
    clear: clear,
    saveDirHandle: saveDirHandle,
    loadDirHandle: loadDirHandle
  };
})();
