# Financial Independence Dashboard

## Quick start
- **Live**: https://nabariho.github.io/fi-dashboard/
- **Local dev**: `python3 -m http.server` in this directory, open `localhost:8000`
- **DB mode**: Sign in with email + passphrase (Supabase backend)
- **File mode**: Load an encrypted `.fjson` file and enter the passphrase
- For testing, use `data/sample.json` (unencrypted) with the test runner

## Architecture
- Vanilla JS, no build step, no frameworks, no TypeScript
- 3-layer pattern: Data (calculators) -> UI (renderers) -> App (orchestration)
- All calculators are pure functions with no DOM access
- All renderers take processed data and a target element
- Spanish locale (es-ES) for number formatting
- See `docs/architecture.md` for full module map, data flows, and security model

## Storage modes
- **File mode**: encrypted `.fjson` files via File API / iCloud Drive sync
- **DB mode**: Supabase zero-knowledge backend -- all data encrypted client-side with AES-256-GCM before sending to server. Server sees only opaque hashes and ciphertext.
- Both modes produce identical data shapes -- `loadData()` is the shared entry point
- `StorageManager` abstracts the difference; `js/config.js` holds Supabase credentials

## File conventions
- `js/data/*.js` -- pure calculators, no DOM, no side effects
- `js/ui/*.js` -- renderers, DOM only, no data processing
- `js/app.js` -- dashboard orchestration, event binding, init
- `js/admin.js` -- admin page orchestration, CRUD, save flow
- `js/crypto.js` -- file-mode AES-256-GCM encryption/decryption
- `js/db-crypto.js` -- DB-mode crypto: auth password derivation, encryption key derivation, per-record encrypt/decrypt
- `js/db-service.js` -- Supabase CRUD wrapper (only module that touches Supabase client)
- `js/storage-manager.js` -- unified file/DB interface with offline support
- `js/file-manager.js` -- File I/O + encrypted session bridge
- `js/data-cache.js` -- IDB stores (all encrypted at rest)
- `js/config.js` -- Supabase URL + anon key
- `cli/*.mjs` -- Node.js CLI tools (ESM, zero external deps)

## Security rules
- NEVER commit sensitive data (no .fjson files, no real balances)
- NEVER store plaintext financial data or passphrases in any persistent storage (IDB, sessionStorage, localStorage)
- Passphrase lives only in JS heap memory during the active session
- sessionStorage and IDB `cache` store are encrypted with per-tab AES keys (lost on tab close)
- IDB `vault_cache` and `pending_sync` store only server-encrypted ciphertext
- Auth password derivation (10k PBKDF2 iter) is separate from encryption key derivation (100k iter)
- `db-crypto.js` (DB mode) and `crypto.js` (file mode) are never mixed

## Testing
- Open `tests/test-runner.html` in a browser -- tests cover all calculators and crypto
- Open `tests/test-db-crypto.html` for DB crypto unit tests
- When modifying a calculator, run the relevant test file

## CLI
- `node cli/fi-data.mjs <command> --file <path>`
- Commands: init, add-month, edit-config, export, import-sheets
- Always prompts for passphrase via stdin

## Deployment
- GitHub Pages from `main` branch at root
- Bump `CACHE_NAME` in `sw.js` on every deploy
- Hard-refresh (Cmd+Shift+R) to bust old service worker after deploy
- Supabase config: Authentication > URL Configuration > Site URL = `https://nabariho.github.io/fi-dashboard/`

## Key rules
- Keep calculators pure -- if it touches the DOM, it goes in ui/
- No external dependencies beyond Chart.js (loaded from CDN)
- Encrypted file format version is "v": 1 -- bump on breaking changes
- `FileManager.loadFromSession()` returns a Promise (async decryption)
