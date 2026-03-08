# Financial Independence Dashboard

## Quick start
- **Live**: https://nabariho.github.io/fi-dashboard/
- **Local dev**: `python3 -m http.server` in this directory, open `localhost:8000`
- **DB mode**: Sign in with email + passphrase (Supabase backend)
- **File mode**: Load an encrypted `.fjson` file and enter the passphrase
- For testing, use `data/sample.json` (unencrypted) with the test runner
- **Business requirements**: See `docs/business-requirements.md` for full feature specs, data model, and calculation details

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
- Record types: `config`, `account`, `monthend`, `budget`, `cashflow`, `milestone`, `mortgage`, `planner_goal`

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
- `js/data-export.js` -- XLSX export with multi-sheet structure
- `js/config.js` -- Supabase URL + anon key
- `cli/*.mjs` -- Node.js CLI tools (ESM, zero external deps)

## Dashboard tabs (7)
1. **Investments** -- portfolio chart, returns table (% or EUR), per-account comparison
2. **Net Worth** -- stacked chart, monthly breakdown table with MoM deltas
3. **Emergency Fund** -- status cards, funding history chart, monthly flows table
4. **Goals** -- emergency fund + house down payment detail, milestones with glide paths
5. **Budget** -- monthly breakdown by category (fixed/variable)
6. **Mortgage** -- amortization schedule, equity, actual vs planned payments
7. **Cash Flow** -- hybrid actual/derived analysis, planned-vs-actual, category trends, goal achievability

## Always-visible panels (collapsible, above tabs)
- **FI Progress** -- progress bar, passive income, years to FI, savings rate
- **Financial Goals** -- emergency fund + house down payment quick status
- **Monthly Summary** -- auto-generated narrative, anomaly alerts, metric cards

## Data layer modules
| Module | Purpose |
|--------|---------|
| `account-service.js` | Account lookups, classification, emergency fund role queries |
| `data-service.js` | Filtering, aggregation, time range |
| `returns-calc.js` | Modified Dietz returns, YTD chaining, per-account comparison |
| `networth-calc.js` | Net worth aggregation with mortgage debt/equity |
| `fi-calc.js` | FI progress, years to FI, passive income, savings rate |
| `goals-calc.js` | Goal status adapter: reads from unified planner output |
| `emergency-calc.js` | Emergency fund history, flows, coverage metrics |
| `budget-calc.js` | Monthly budget breakdown, operating reserve |
| `cashflow-calc.js` | Actual income/expense analysis, planned-vs-actual, category trends |
| `savings-capacity-calc.js` | Derived savings capacity, hybrid actual/derived, waterfall, achievability |
| `milestone-calc.js` | Glide path computation from planner goals (legacy milestone compat) |
| `mortgage-calc.js` | Amortization schedule, equity, actual vs planned |
| `summary-calc.js` | Monthly summary narrative, attribution |
| `anomaly-calc.js` | Anomaly detection (unusual changes, zero balances) |
| `goal-planner-calc.js` | Goal planning orchestration |
| `goal-rules-service.js` | Goal normalization, validation, funding evaluation |
| `goal-accounting-service.js` | Source-of-funds integrity, oversubscription detection |
| `goal-allocation-service.js` | Priority-based funding allocation |
| `actions-calc.js` | Recommended actions engine (rebalance, expense alerts, surplus) |

## UI layer modules
| Module | Renders |
|--------|---------|
| `ui-metrics.js` | FI progress bar, investment/NW metric cards |
| `ui-charts.js` | Portfolio, net worth, FI projection charts |
| `ui-tables.js` | Returns grid, NW breakdown, account comparison |
| `ui-goals.js` | Goals panel (all planner goals, generic, no hardcoded IDs) |
| `ui-budget.js` | Budget overview |
| `ui-mortgage.js` | Mortgage dashboard (cards, chart, amort table, equity) |
| `ui-emergency.js` | Emergency fund tab (status cards, chart, flow table) |
| `ui-summary.js` | Monthly summary (narrative, cards, anomaly alerts) |
| `ui-cashflow.js` | Cash flow tab (waterfall, trends, planned-vs-actual, category trends) |
| `ui-planner.js` | Goal funding plan, actual vs planned, actions, FI timeline, milestones |

## Admin page tabs (in order)
- **Config** -- key-value editor (fi_target, withdrawal_rate, etc.)
- **Accounts** -- account CRUD with emergency_fund_role and cashflow_role
- **Budget** -- budget item CRUD (fixed/variable, frequency, category with cashflow taxonomy datalist)
- **Cash Flow** -- Quick Add Month (from budget categories), single entry add, inline edit, month filter
- **Planning** -- goal funding CRUD (priority, target_date, funding_accounts). Glide paths computed from planner goals (milestones merged)
- **MonthEnd** -- Quick Add grid + monthly data table
- **Mortgage** -- mortgage parameters, extra payments, actual payments, valuations

## Cash Flow system
- **Cashflow entries**: `{ entry_id, month, type, category, amount, notes }` -- actual income/expenses
- **entry_id format**: `YYYY-MM_type_slug(category)` e.g. `2026-03_expense_housing`
- **Hybrid mode**: `SavingsCapacityCalculator.computeMonthlyHybrid()` overrides derived data with actuals
- **dataSource flag**: each monthly row has `dataSource: 'actual' | 'derived'`
- **Planned vs Actual**: compares budget items against expense entries by category
- **Category trends**: stacked bar chart of expense categories over time
- **Script load order**: `cashflow-calc.js` must load before `savings-capacity-calc.js`

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
- CashflowCalculator has 8 tests covering computeMonth, computeAllMonths, plannedVsActual, categoryTrends, slugify

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
- No external dependencies beyond Chart.js, SheetJS, Supabase JS (loaded from CDN)
- Encrypted file format version is "v": 1 -- bump on breaking changes
- `FileManager.loadFromSession()` returns a Promise (async decryption)
- Account emergency fund roles are configured per-account via `emergency_fund_role` field (none/dedicated/backup)
- New data types must be added to: StorageManager (buildRecordMap + reassembleData), loadData/loadAdminData, save data object, XLSX export, sw.js cache
- See `docs/business-requirements.md` for detailed feature specs and calculation formulas

## Documentation index
- `docs/business-requirements.md` -- Full feature specs, data model, calculations, testing requirements
- `docs/architecture.md` -- Module map, data flows, security model, DB schema
- `docs/roadmap.md` -- Development phases (all complete except benchmark tracking)
- `docs/enhancement_candidates.md` -- Known gaps and future improvements
- `docs/data-export.md` -- XLSX export structure and migration guide
