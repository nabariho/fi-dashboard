// === DB-SERVICE — Supabase Data Access Layer ===
// Only module that touches the Supabase client. Raw CRUD, no crypto logic.

var DbService = (function() {
  var _supabase = null;

  function _ensureInit() {
    if (!_supabase) throw new Error('DbService not initialized. Call DbService.init() first.');
  }

  return {
    // Initialize with Supabase credentials
    init: function(supabaseUrl, supabaseAnonKey) {
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase URL and anon key are required.');
      }
      _supabase = supabase.createClient(supabaseUrl, supabaseAnonKey);
    },

    // Get raw Supabase client (for session listeners, etc.)
    getClient: function() {
      _ensureInit();
      return _supabase;
    },

    // --- Auth ---

    // Sign up a new user. Creates auth user + inserts enc_salt into user_vaults.
    signUp: async function(email, authPassword, encSalt) {
      _ensureInit();
      var result = await _supabase.auth.signUp({
        email: email,
        password: authPassword
      });
      if (result.error) throw result.error;

      var user = result.data.user;
      // Insert enc_salt into user_vaults
      var vaultResult = await _supabase.from('user_vaults').insert({
        user_id: user.id,
        enc_salt: encSalt
      });
      if (vaultResult.error) throw vaultResult.error;

      return user;
    },

    // Sign in an existing user.
    signIn: async function(email, authPassword) {
      _ensureInit();
      var result = await _supabase.auth.signInWithPassword({
        email: email,
        password: authPassword
      });
      if (result.error) throw result.error;
      return result.data;
    },

    // Sign out the current user.
    signOut: async function() {
      _ensureInit();
      var result = await _supabase.auth.signOut();
      if (result.error) throw result.error;
    },

    // Get current session (null if not signed in).
    getSession: async function() {
      _ensureInit();
      var result = await _supabase.auth.getSession();
      if (result.error) throw result.error;
      return result.data.session;
    },

    // --- User Vaults ---

    // Get the enc_salt for a user.
    getEncSalt: async function(userId) {
      _ensureInit();
      var result = await _supabase
        .from('user_vaults')
        .select('enc_salt')
        .eq('user_id', userId)
        .single();
      if (result.error) throw result.error;
      return result.data.enc_salt;
    },

    // --- Vault Records ---

    // Fetch all encrypted records for a user.
    fetchAllRecords: async function(userId) {
      _ensureInit();
      var result = await _supabase
        .from('vault_records')
        .select('record_hash, iv, data, updated_at')
        .eq('user_id', userId);
      if (result.error) throw result.error;
      return result.data;
    },

    // Upsert (insert or update) records. Each record: { record_hash, iv, data }.
    // Uses ON CONFLICT (user_id, record_hash) to update existing.
    upsertRecords: async function(userId, records) {
      _ensureInit();
      if (!records || records.length === 0) return;

      var rows = records.map(function(r) {
        return {
          user_id: userId,
          record_hash: r.record_hash,
          iv: r.iv,
          data: r.data
        };
      });

      var result = await _supabase
        .from('vault_records')
        .upsert(rows, { onConflict: 'user_id,record_hash' });
      if (result.error) throw result.error;
    },

    // Delete records by their hashes.
    deleteRecords: async function(userId, hashes) {
      _ensureInit();
      if (!hashes || hashes.length === 0) return;

      var result = await _supabase
        .from('vault_records')
        .delete()
        .eq('user_id', userId)
        .in('record_hash', hashes);
      if (result.error) throw result.error;
    },

    // --- Connectivity ---

    isOnline: function() {
      return navigator.onLine;
    }
  };
})();
