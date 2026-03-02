// === DATA CACHE — IndexedDB Persistent Storage ===
// Caches decrypted data across browser sessions so users don't re-pick the file on every visit.

var DataCache = (function() {
  var DB_NAME = 'fi_dashboard';
  var STORE_NAME = 'cache';
  var CACHE_KEY = 'session';

  function _openDB() {
    return new Promise(function(resolve, reject) {
      var request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = function() {
        var db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
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

  return {
    save: save,
    load: load,
    clear: clear
  };
})();
