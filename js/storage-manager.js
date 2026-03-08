// === STORAGE-MANAGER — Unified Storage Orchestration ===
// Abstracts file vs DB behind a single interface.
// What app.js and admin.js call for load/save operations.

var StorageManager = (function() {

  var _mode = null;           // 'file' or 'db'
  var _cryptoKey = null;      // AES-256-GCM CryptoKey (DB mode only)
  var _encSalt = null;        // base64 enc_salt (DB mode only)
  var _userId = null;         // Supabase user ID (DB mode only)
  var _lastSavedMap = null;   // Record map from last save/load (for diff)
  var _passphrase = null;     // Kept in memory for session re-derive

  var STORAGE_MODE_KEY = 'fi_storage_mode';
  var PENDING_SALT_KEY = 'fi_pending_enc_salt';

  // --- Record Map Helpers ---

  // Split a full data object into individual typed records.
  // Returns a map: { 'type|naturalKey': payload, ... }
  function buildRecordMap(data) {
    var map = {};

    // Config: single record
    if (data.config) {
      map['config|main'] = data.config;
    }

    // Accounts: one record per account
    if (data.accounts) {
      for (var i = 0; i < data.accounts.length; i++) {
        var a = data.accounts[i];
        map['account|' + a.account_id] = a;
      }
    }

    // MonthEnd data: one record per month+account
    if (data.data) {
      for (var j = 0; j < data.data.length; j++) {
        var d = data.data[j];
        map['monthend|' + d.month + '|' + d.account_id] = d;
      }
    }

    // Budget items: one record per item
    if (data.budgetItems) {
      for (var k = 0; k < data.budgetItems.length; k++) {
        var b = data.budgetItems[k];
        map['budget|' + b.item_id] = b;
      }
    }

    // Milestones: one record per milestone
    if (data.milestones) {
      for (var m = 0; m < data.milestones.length; m++) {
        var ms = data.milestones[m];
        map['milestone|' + ms.milestone_id] = ms;
      }
    }

    // Mortgage: single record (optional)
    if (data.mortgage) {
      map['mortgage|main'] = data.mortgage;
    }

    // Planning goals: one record per goal
    if (data.plannerGoals) {
      for (var p = 0; p < data.plannerGoals.length; p++) {
        var g = data.plannerGoals[p];
        map['planner_goal|' + g.goal_id] = g;
      }
    }

    // Cashflow entries: one record per entry
    if (data.cashflowEntries) {
      for (var cf = 0; cf < data.cashflowEntries.length; cf++) {
        var cfe = data.cashflowEntries[cf];
        map['cashflow|' + cfe.entry_id] = cfe;
      }
    }

    return map;
  }

  // Compute diff between previous and current record maps.
  // Returns { upsert: [{ typeKey, type, naturalKey, payload }], delete: [{ type, naturalKey }] }
  function computeDiff(prevMap, currMap) {
    var upsert = [];
    var toDelete = [];

    // Find new or changed records
    var currKeys = Object.keys(currMap);
    for (var i = 0; i < currKeys.length; i++) {
      var k = currKeys[i];
      var currJson = JSON.stringify(currMap[k]);
      if (!prevMap || !prevMap[k] || JSON.stringify(prevMap[k]) !== currJson) {
        var parts = parseTypeKey(k);
        upsert.push({
          typeKey: k,
          type: parts.type,
          naturalKey: parts.naturalKey,
          payload: currMap[k]
        });
      }
    }

    // Find deleted records
    if (prevMap) {
      var prevKeys = Object.keys(prevMap);
      for (var j = 0; j < prevKeys.length; j++) {
        var pk = prevKeys[j];
        if (!currMap[pk]) {
          var dparts = parseTypeKey(pk);
          toDelete.push({ type: dparts.type, naturalKey: dparts.naturalKey });
        }
      }
    }

    return { upsert: upsert, delete: toDelete };
  }

  // Parse 'type|naturalKey' or 'monthend|2024-01|BROKER_A' into { type, naturalKey }
  function parseTypeKey(typeKey) {
    var idx = typeKey.indexOf('|');
    return {
      type: typeKey.substring(0, idx),
      naturalKey: typeKey.substring(idx + 1)
    };
  }

  // Reassemble individual decrypted records into the full data shape.
  function reassembleData(records) {
    var data = {
      config: {},
      accounts: [],
      data: [],
      budgetItems: [],
      milestones: [],
      mortgage: null,
      plannerGoals: [],
      cashflowEntries: []
    };

    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      switch (r.type) {
        case 'config':
          data.config = r.payload;
          break;
        case 'account':
          data.accounts.push(r.payload);
          break;
        case 'monthend':
          data.data.push(r.payload);
          break;
        case 'budget':
          data.budgetItems.push(r.payload);
          break;
        case 'milestone':
          data.milestones.push(r.payload);
          break;
        case 'mortgage':
          data.mortgage = r.payload;
          break;
        case 'planner_goal':
          data.plannerGoals.push(r.payload);
          break;
        case 'cashflow':
          data.cashflowEntries.push(r.payload);
          break;
      }
    }

    // Sort month-end data by month then account
    data.data.sort(function(a, b) {
      if (a.month !== b.month) return a.month < b.month ? -1 : 1;
      return (a.account_id || '').localeCompare(b.account_id || '');
    });
    data.plannerGoals.sort(function(a, b) {
      if ((a.priority || 99) !== (b.priority || 99)) return (a.priority || 99) - (b.priority || 99);
      return (a.goal_id || '').localeCompare(b.goal_id || '');
    });
    data.cashflowEntries.sort(function(a, b) {
      if (a.month !== b.month) return a.month > b.month ? -1 : 1;
      return (a.entry_id || '').localeCompare(b.entry_id || '');
    });

    return data;
  }

  // --- Public API ---

  return {
    // Current storage mode
    get mode() { return _mode; },

    // Initialize storage manager.
    // mode: 'file' or 'db'
    // options: { supabaseUrl, supabaseAnonKey } for DB mode
    init: function(mode, options) {
      _mode = mode || localStorage.getItem(STORAGE_MODE_KEY) || 'file';
      localStorage.setItem(STORAGE_MODE_KEY, _mode);

      if (_mode === 'db') {
        options = options || {};
        var url = options.supabaseUrl || AppConfig.SUPABASE_URL;
        var key = options.supabaseAnonKey || AppConfig.SUPABASE_ANON_KEY;
        if (url && key) {
          DbService.init(url, key);
        }
      }
    },

    // Switch between file and db mode
    setMode: function(mode) {
      _mode = mode;
      localStorage.setItem(STORAGE_MODE_KEY, mode);
    },

    // Get persisted mode from localStorage
    getPersistedMode: function() {
      return localStorage.getItem(STORAGE_MODE_KEY) || 'file';
    },

    // --- Auth (DB mode) ---

    // Sign up. Returns { user, needsConfirmation }.
    // When email confirmation is required, the vault is deferred to first signIn.
    signUp: async function(email, passphrase) {
      var authPwd = await DbCrypto.deriveAuthPassword(passphrase, email);
      var encSalt = DbCrypto.generateSalt();
      var data = await DbService.signUp(email, authPwd);
      var user = data.user;

      if (data.session) {
        // No email confirmation — session exists, insert vault now
        await DbService.upsertVault(user.id, encSalt);
        _encSalt = encSalt;
        _userId = user.id;
        _passphrase = passphrase;
        _cryptoKey = await DbCrypto.deriveEncryptionKey(passphrase, encSalt);
        _lastSavedMap = null;
        // Cache the non-extractable CryptoKey in IDB for cross-page navigation
        DataCache.saveSessionKey('db_encryption', _cryptoKey, {
          purpose: 'db_encryption',
          userId: user.id,
          encSalt: encSalt
        }).catch(function() {});
        this.setMode('db');
      } else {
        // Email confirmation required — stash salt for first signIn
        localStorage.setItem(PENDING_SALT_KEY, encSalt);
      }

      return { user: user, needsConfirmation: !data.session };
    },

    signIn: async function(email, passphrase) {
      var authPwd = await DbCrypto.deriveAuthPassword(passphrase, email);
      var result = await DbService.signIn(email, authPwd);
      var user = result.user;

      _userId = user.id;
      _passphrase = passphrase;

      // Try to get existing vault; if missing, create it from pending salt
      var encSalt;
      try {
        encSalt = await DbService.getEncSalt(user.id);
      } catch (e) {
        // No vault yet — first sign-in after confirmed sign-up
        var pendingSalt = localStorage.getItem(PENDING_SALT_KEY);
        if (!pendingSalt) {
          throw new Error('No encryption salt found. Please sign up again.');
        }
        encSalt = pendingSalt;
        await DbService.upsertVault(user.id, encSalt);
        localStorage.removeItem(PENDING_SALT_KEY);
      }

      _encSalt = encSalt;
      _cryptoKey = await DbCrypto.deriveEncryptionKey(passphrase, encSalt);
      _lastSavedMap = null;

      // Cache the non-extractable CryptoKey in IDB for cross-page navigation
      DataCache.saveSessionKey('db_encryption', _cryptoKey, {
        purpose: 'db_encryption',
        userId: _userId,
        encSalt: _encSalt
      }).catch(function() {});

      this.setMode('db');
      return result;
    },

    signOut: async function() {
      await DbService.signOut();
      _cryptoKey = null;
      _encSalt = null;
      _userId = null;
      _passphrase = null;
      _lastSavedMap = null;
      // Clear cached keys on sign-out
      DataCache.clearAllSessionKeys().catch(function() {});
    },

    // Try to restore an existing Supabase session.
    // Returns session or null. Requires passphrase to re-derive key.
    restoreSession: async function(passphrase) {
      var session = await DbService.getSession();
      if (!session) return null;

      _userId = session.user.id;
      _passphrase = passphrase;
      _encSalt = await DbService.getEncSalt(_userId);
      _cryptoKey = await DbCrypto.deriveEncryptionKey(passphrase, _encSalt);
      _lastSavedMap = null;

      return session;
    },

    // Try to restore DB session from cached CryptoKey in IDB.
    // Returns true if successful (no passphrase needed), false otherwise.
    restoreFromCachedKey: async function() {
      try {
        var entry = await DataCache.loadSessionKey('db_encryption');
        if (!entry || !entry.key || !entry.meta) return false;

        var session = await DbService.getSession();
        if (!session) return false;

        // Verify the cached key matches the current user
        if (entry.meta.userId !== session.user.id) {
          DataCache.clearSessionKey('db_encryption').catch(function() {});
          return false;
        }

        // Verify the key is a usable CryptoKey by doing a test encrypt
        var testIv = crypto.getRandomValues(new Uint8Array(12));
        var testData = new TextEncoder().encode('test');
        await crypto.subtle.encrypt({ name: 'AES-GCM', iv: testIv }, entry.key, testData);

        _userId = session.user.id;
        _encSalt = entry.meta.encSalt;
        _cryptoKey = entry.key;
        _passphrase = null; // Not needed — we have the derived key
        _lastSavedMap = null;

        return true;
      } catch (e) {
        // Key is invalid or lost its CryptoKey type after IDB round-trip
        DataCache.clearSessionKey('db_encryption').catch(function() {});
        return false;
      }
    },

    // Check if we have an active Supabase session (no passphrase needed).
    hasSession: async function() {
      try {
        var session = await DbService.getSession();
        return !!session;
      } catch (e) {
        return false;
      }
    },

    // --- Load ---

    // Load all data. Returns { config, accounts, data, budgetItems, milestones, mortgage }.
    // Falls back to IDB vault cache when offline.
    load: async function() {
      if (_mode !== 'db') {
        throw new Error('StorageManager.load() is only for DB mode. Use file flow for file mode.');
      }

      var encryptedRecords;

      if (DbService.isOnline()) {
        encryptedRecords = await DbService.fetchAllRecords(_userId);
        // Cache for offline use
        DataCache.saveEncrypted(encryptedRecords).catch(function() {});
      } else {
        // Offline — load from IDB vault cache
        var cached = await DataCache.loadEncrypted();
        if (!cached || !cached.records) {
          throw new Error('You are offline and no cached data is available.');
        }
        encryptedRecords = cached.records;
      }

      var decryptedRecords = [];
      for (var i = 0; i < encryptedRecords.length; i++) {
        var rec = encryptedRecords[i];
        var decrypted = await DbCrypto.decryptRecord(_cryptoKey, rec.iv, rec.data);
        decryptedRecords.push(decrypted);
      }

      var data = reassembleData(decryptedRecords);
      _lastSavedMap = buildRecordMap(data);
      return data;
    },

    // --- Save (diff-based) ---

    // Save data to DB. Only upserts changed records and deletes removed ones.
    // Queues to IDB when offline and flushes when back online.
    save: async function(fullDataObject) {
      if (_mode !== 'db') {
        throw new Error('StorageManager.save() is only for DB mode.');
      }

      var currentMap = buildRecordMap(fullDataObject);
      var diff = computeDiff(_lastSavedMap, currentMap);

      // Encrypt changed records
      var encryptedUpserts = [];
      if (diff.upsert.length > 0) {
        for (var i = 0; i < diff.upsert.length; i++) {
          var item = diff.upsert[i];
          var encrypted = await DbCrypto.encryptRecord(
            _cryptoKey, item.type, item.naturalKey, item.payload, _encSalt
          );
          encryptedUpserts.push(encrypted);
        }
      }

      // Compute hashes for deletions
      var deleteHashes = [];
      if (diff.delete.length > 0) {
        for (var j = 0; j < diff.delete.length; j++) {
          var del = diff.delete[j];
          var hash = await DbCrypto.recordHash(del.type, del.naturalKey, _encSalt);
          deleteHashes.push(hash);
        }
      }

      if (DbService.isOnline()) {
        // Online — sync directly
        if (encryptedUpserts.length > 0) {
          await DbService.upsertRecords(_userId, encryptedUpserts);
        }
        if (deleteHashes.length > 0) {
          await DbService.deleteRecords(_userId, deleteHashes);
        }
      } else {
        // Offline — queue for later sync
        if (encryptedUpserts.length > 0) {
          await DataCache.queueSync({ action: 'upsert', userId: _userId, records: encryptedUpserts });
        }
        if (deleteHashes.length > 0) {
          await DataCache.queueSync({ action: 'delete', userId: _userId, hashes: deleteHashes });
        }
      }

      _lastSavedMap = currentMap;

      // Update the vault cache with current state
      DataCache.saveEncrypted(
        await this._getAllEncryptedRecords(currentMap)
      ).catch(function() {});

      return { upserted: diff.upsert.length, deleted: diff.delete.length, offline: !DbService.isOnline() };
    },

    // Re-encrypt all records for vault cache update.
    _getAllEncryptedRecords: async function(recordMap) {
      var keys = Object.keys(recordMap);
      var encrypted = [];
      for (var i = 0; i < keys.length; i++) {
        var parts = parseTypeKey(keys[i]);
        var rec = await DbCrypto.encryptRecord(
          _cryptoKey, parts.type, parts.naturalKey, recordMap[keys[i]], _encSalt
        );
        encrypted.push(rec);
      }
      return encrypted;
    },

    // Flush pending sync operations queued while offline.
    flushPendingSync: async function() {
      if (_mode !== 'db' || !DbService.isOnline()) return { flushed: 0 };

      var pending = await DataCache.getPendingSync();
      if (!pending || pending.length === 0) return { flushed: 0 };

      var flushed = 0;
      for (var i = 0; i < pending.length; i++) {
        var entry = pending[i];
        try {
          if (entry.op.action === 'upsert') {
            await DbService.upsertRecords(entry.op.userId, entry.op.records);
          } else if (entry.op.action === 'delete') {
            await DbService.deleteRecords(entry.op.userId, entry.op.hashes);
          }
          await DataCache.removeSynced(entry.key);
          flushed++;
        } catch (e) {
          // Stop on first failure — will retry next time
          break;
        }
      }
      return { flushed: flushed, remaining: pending.length - flushed };
    },

    // --- Import / Export ---

    // Import from decrypted .fjson data into DB.
    // Takes the already-decrypted data object.
    importFromDecrypted: async function(data) {
      if (_mode !== 'db') {
        throw new Error('Import requires DB mode.');
      }

      var map = buildRecordMap(data);
      var keys = Object.keys(map);
      var encryptedRecords = [];

      for (var i = 0; i < keys.length; i++) {
        var parts = parseTypeKey(keys[i]);
        var encrypted = await DbCrypto.encryptRecord(
          _cryptoKey, parts.type, parts.naturalKey, map[keys[i]], _encSalt
        );
        encryptedRecords.push(encrypted);
      }

      // Batch upsert (Supabase handles in chunks if needed)
      await DbService.upsertRecords(_userId, encryptedRecords);
      _lastSavedMap = map;
    },

    // Export from DB as a plain data object (for .fjson encryption + download).
    exportData: async function() {
      return this.load();
    },

    // --- State accessors (for cache/offline) ---

    getUserId: function() { return _userId; },
    getEncSalt: function() { return _encSalt; },
    getCryptoKey: function() { return _cryptoKey; },
    getPassphrase: function() { return _passphrase; },

    // Set internal state (used when restoring from cache)
    _setState: function(userId, encSalt, cryptoKey, passphrase) {
      _userId = userId;
      _encSalt = encSalt;
      _cryptoKey = cryptoKey;
      _passphrase = passphrase;
    },

    // Expose helpers for testing
    _buildRecordMap: buildRecordMap,
    _computeDiff: computeDiff,
    _reassembleData: reassembleData
  };
})();
