# Financial Independence Dashboard

## Quick start
- Open `index.html` in a browser (or use `python3 -m http.server` for local dev)
- Load an encrypted `.fjson` data file and enter the passphrase
- For testing, use `data/sample.json` (unencrypted) with the test runner

## Architecture
- Vanilla JS, no build step, no frameworks, no TypeScript
- 3-layer pattern: Data (calculators) → UI (renderers) → App (orchestration)
- All calculators are pure functions with no DOM access
- All renderers take processed data and a target element
- Spanish locale (es-ES) for number formatting

## File conventions
- `js/data/*.js` — pure calculators, no DOM, no side effects
- `js/ui/*.js` — renderers, DOM only, no data processing
- `js/app.js` — orchestration, event binding, init
- `js/crypto.js` — Web Crypto API encryption/decryption
- `cli/*.mjs` — Node.js CLI tools (ESM, zero external deps)

## Testing
- Open `tests/test-runner.html` in a browser
- Tests cover all calculators and crypto round-trips
- When modifying a calculator, run the relevant test file

## CLI
- `node cli/fi-data.mjs <command> --file <path>`
- Commands: init, add-month, edit-config, export, import-sheets
- Always prompts for passphrase via stdin

## Key rules
- NEVER commit sensitive data (no .fjson files, no real balances)
- Keep calculators pure — if it touches the DOM, it goes in ui/
- No external dependencies beyond Chart.js (loaded from CDN)
- Encrypted file format version is "v": 1 — bump on breaking changes
