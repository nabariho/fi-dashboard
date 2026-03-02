// === FILE MANAGER — File I/O + Session Bridge ===
// Shared module for opening/saving files and passing data between pages.
// Supports File System Access API (Chrome) with persistent directory handles,
// and falls back to download for Safari/iOS.

var FileManager = (function() {
  var SESSION_KEY = 'fi_dashboard_session';
  var _handle = null;    // File handle from open (page-local, lost on reload)
  var _dirHandle = null; // Directory handle (persisted in IDB across sessions)

  var hasFileSystemAccess = typeof window.showOpenFilePicker === 'function';

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

  // --- Session Bridge ---

  function stashToSession(data) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } catch (e) {
      // sessionStorage full or unavailable — silently ignore
    }
  }

  function loadFromSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
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
