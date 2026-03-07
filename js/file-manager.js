// === FILE MANAGER — File I/O + Session Bridge ===
// Shared module for opening/saving files and passing data between pages.
// Supports File System Access API (Chrome) with persistent directory handles,
// and falls back to download for Safari/iOS.

var FileManager = (function() {
  var SESSION_KEY = 'fi_dashboard_session';
  var _handle = null;    // File handle from open (page-local, lost on reload)
  var _dirHandle = null; // Directory handle (persisted in IDB across sessions)

  var hasFileSystemAccess = typeof window.showOpenFilePicker === 'function';

  // --- Per-tab encryption key for sessionStorage ---
  // Random AES-256-GCM key generated once per page load.
  // Lives only in this JS closure — never persisted.
  var _sessionKeyPromise = crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );

  async function _encryptForSession(plaintext) {
    var key = await _sessionKeyPromise;
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var encoded = new TextEncoder().encode(plaintext);
    var ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv }, key, encoded
    );
    // Store as JSON: { iv: base64, ct: base64 }
    return JSON.stringify({
      iv: _bufToBase64(iv),
      ct: _bufToBase64(new Uint8Array(ciphertext))
    });
  }

  async function _decryptFromSession(stored) {
    var key = await _sessionKeyPromise;
    var parsed = JSON.parse(stored);
    var iv = _base64ToBuf(parsed.iv);
    var ct = _base64ToBuf(parsed.ct);
    var plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv }, key, ct
    );
    return new TextDecoder().decode(plaintext);
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

  // --- Open ---

  async function open() {
    if (hasFileSystemAccess) {
      return _openWithHandle();
    }
    return _openWithInput();
  }

  async function _openWithHandle() {
    var pickerOpts = {
      types: [{
        description: 'FI Data Files',
        accept: { 'application/json': ['.fjson', '.json'] }
      }],
      multiple: false
    };
    var handles = await window.showOpenFilePicker(pickerOpts);
    _handle = handles[0];
    var file = await _handle.getFile();
    var text = await file.text();
    return { text: text, filename: file.name };
  }

  function _openWithInput() {
    return new Promise(function(resolve, reject) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.fjson,.json';
      input.style.display = 'none';
      document.body.appendChild(input);

      input.addEventListener('change', function() {
        var file = input.files[0];
        if (!file) {
          document.body.removeChild(input);
          reject(new Error('No file selected'));
          return;
        }
        file.text().then(function(text) {
          document.body.removeChild(input);
          resolve({ text: text, filename: file.name });
        }).catch(function(err) {
          document.body.removeChild(input);
          reject(err);
        });
      });

      // Handle cancel (no reliable event, but input won't fire change)
      input.addEventListener('cancel', function() {
        document.body.removeChild(input);
        reject(new Error('File selection cancelled'));
      });

      input.click();
    });
  }

  // --- Save ---

  async function save(content, filename) {
    // Priority: file handle → directory handle → pick directory → download
    if (_handle) {
      return _writeToHandle(content);
    }
    if (hasFileSystemAccess) {
      // Try directory handle (persisted from previous session)
      if (!_dirHandle) {
        await _restoreDirHandle();
      }
      if (_dirHandle) {
        return _writeToDirHandle(content, filename);
      }
      // No handle at all — pick a directory
      return _pickDirAndWrite(content, filename);
    }
    _download(content, filename);
    return 'download';
  }

  async function _writeToHandle(content) {
    var writable = await _handle.createWritable();
    await writable.write(content);
    await writable.close();
    return 'handle';
  }

  // --- Directory Handle (Chrome persistent save location) ---

  async function _restoreDirHandle() {
    try {
      var handle = await DataCache.loadDirHandle();
      if (!handle) return;
      // Re-verify permission (Chrome may prompt)
      var perm = await handle.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        _dirHandle = handle;
      }
    } catch (e) {
      // IDB unavailable or permission denied — fall through
      _dirHandle = null;
    }
  }

  async function _writeToDirHandle(content, filename) {
    var fileHandle = await _dirHandle.getFileHandle(filename, { create: true });
    var writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return 'directory';
  }

  async function _pickDirAndWrite(content, filename) {
    _dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    // Persist for future sessions
    DataCache.saveDirHandle(_dirHandle).catch(function() {});
    return _writeToDirHandle(content, filename);
  }

  async function setDirectory() {
    _dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await DataCache.saveDirHandle(_dirHandle);
  }

  // --- Export (triggers download for iCloud Drive sync, etc.) ---

  function exportFile(content, filename) {
    _download(content, filename);
  }

  // --- Download helper ---

  function _download(content, filename) {
    var blob = new Blob([content], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // --- Session Bridge (encrypted) ---

  function stashToSession(data) {
    _encryptForSession(JSON.stringify(data)).then(function(encrypted) {
      try {
        sessionStorage.setItem(SESSION_KEY, encrypted);
      } catch (e) {
        // sessionStorage full or unavailable — silently ignore
      }
    }).catch(function() {});
  }

  function loadFromSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      // Return a promise — callers must await
      return _decryptFromSession(raw).then(function(plaintext) {
        return JSON.parse(plaintext);
      }).catch(function() {
        // Decryption failed (key rotated on page reload) — stale data
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      });
    } catch (e) {
      return null;
    }
  }

  function clearSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {
      // ignore
    }
  }

  return {
    open: open,
    save: save,
    export: exportFile,
    setDirectory: setDirectory,
    stashToSession: stashToSession,
    loadFromSession: loadFromSession,
    clearSession: clearSession
  };
})();
