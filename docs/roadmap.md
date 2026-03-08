# Development Roadmap

Living document tracking planned features, priorities, and progress.

---

## Phase 1: Quick Add Monthly Flow

**Status:** Done (v1.1 — commit b3ec56b)
**Priority:** Highest — this is the most frequent workflow (monthly)

**Goal:** Make the monthly review a 2-minute task instead of row-by-row entry.

### Scope

- New "Quick Add Month" section at the top of the Admin MonthEnd tab
- Auto-detect the next month based on latest data in the file
- Pre-fill a grid with ALL accounts — one row per account
- Columns: Account | Last Month's Value (read-only) | End Value (input) | Net Contribution (input) | Notes (input)
- Last month's value shown for reference so user can spot errors
- Single "Add All Rows" button saves everything at once
- Validation: no duplicate month/account pairs, all end values filled, contribution defaults to 0
- After adding, scroll to show the new rows in the existing table below

---

## Phase 2: Investment Analysis

**Status:** Done (v1.3.0) — 2a+2b complete, 2c deferred, 2d removed (redundant)
**Priority:** High — key insight the user needs to optimize their portfolio

**Goal:** Understand how profitable investments are, compare accounts, and spot improvement opportunities.

### Scope

#### 2a. Per-Account Returns Comparison ✓
- Table + bar chart showing per-account returns side by side
- Highlight best/worst performers

#### 2b. Growth Decomposition ✓
- Stacked area chart: contributions (bottom) + market growth (top) = total value
- Answers: "How much of my wealth is my savings vs. the market?"

#### 2c. Benchmark Tracking — deferred
- Manual benchmark return series for comparison

#### 2d. FI Projection Chart — removed
- Redundant with FI progress bar and years-to-FI metric

---

## Phase 3: Milestones & Goal Tracking

**Status:** Done (v1.4.0)
**Priority:** Medium — important for motivation and staying on track

**Goal:** Define time-bound targets at both total and per-goal levels, and track progress against a glide path.

### Scope
- Milestone data structure with sub-targets
- Glide path visualization (linear interpolation to target date)
- Status indicators: Ahead / On Track / Behind
- Per-goal milestone breakdown

---

## Phase 4: House & Mortgage Module

**Status:** Done (v1.5.0)
**Priority:** Lower — needed when house purchase happens

**Goal:** Track down payment progress, mortgage amortization, house equity, and integrate debt into FI calculations.

### Scope
- Mortgage amortization schedule calculator
- Extra payment tracking with strategies (reduce_term, reduce_payment)
- House equity tracking with sparse market valuations
- Net worth integration with mortgage debt + house value
- Actual vs planned payment comparison
- Full mortgage dashboard tab

---

## Phase 5: Zero-Knowledge Cloud Backend

**Status:** Done
**Priority:** High — enables multi-device sync without compromising security

**Goal:** Add Supabase backend with client-side encryption so the server has zero knowledge of financial data.

### Scope
- Dual storage modes: file (.fjson) and DB (Supabase) behind unified StorageManager
- Key derivation: single passphrase + email → auth password (10k PBKDF2) + encryption key (100k PBKDF2)
- Per-record AES-256-GCM encryption/decryption (server sees only opaque hashes + ciphertext)
- Offline resilience: IDB vault_cache for reads, pending_sync queue for writes, auto-flush on reconnect
- Diff-based saves: only changed/deleted records synced
- Deferred vault creation to handle email confirmation RLS
- Per-tab ephemeral AES keys for sessionStorage and IDB cache encryption
- Import .fjson into DB, export .fjson from DB

---

## Phase 6: Emergency Fund Tab

**Status:** Done
**Priority:** Medium — dedicated tracking for emergency fund health

**Goal:** Standalone tab for emergency fund with history, flows, and coverage metrics.

### Scope
- Configurable account roles via `emergency_fund_role` on each account (dedicated/backup/none)
- Status cards: current balance, target, funded %, breakdown by role, months of coverage, surplus/shortfall
- Funding history chart: balance over time vs target line
- Monthly flows table: starting, contributions, withdrawals, market change, ending, vs target
- AccountService integration (no hardcoded account IDs)

---

## Phase 7: Goal Planning & Allocation

**Status:** Done
**Priority:** Medium — answers "how should I allocate my savings each month?"

**Goal:** Priority-based goal funding allocation with account integrity checks.

### Scope
- Planner goals data structure: goal_id, name, target_amount, priority, target_date, funding_accounts, track_current_from_accounts
- Priority-based proportional allocation of available monthly budget
- Account oversubscription detection (same account funding multiple goals)
- Source-of-funds integrity checks
- Goal funding plan table: priority, funding accounts, source balance, required/mo, allocated/mo, shortfall, projected completion
- Account ledger integrity table: balance, manual/tracked claims, total claimed, unassigned
- Admin CRUD for planner goals
- XLSX export includes Planner sheet

---

## Phase 8: Monthly Income & Expense Tracking

**Status:** Done
**Priority:** High — provides real data to replace derived proxies

**Goal:** Track actual monthly income and expenses by category, build historical view for spotting improvement areas, and feed real data into Cash Flow tab.

### Scope
- Cashflow entries data structure: `{ entry_id, month, type, category, amount, notes }`
- `CashflowCalculator` pure functions: month summary, planned-vs-actual, category trends
- Hybrid mode in `SavingsCapacityCalculator`: override derived data with actuals where available
- Admin Cash Flow tab: Quick Add Month (pre-populated from budget categories + income), single entry add, inline edit, month filter
- Dashboard Cash Flow tab enhancements: data source indicator (actual/derived), planned-vs-actual bar chart + table, category trends stacked bar chart
- StorageManager integration: `cashflow` record type for DB mode
- XLSX export includes CashFlow sheet
- 8 unit tests for CashflowCalculator

---

## Phase 9: Unified Goal System & FI Journey

**Status:** Done
**Priority:** Highest — fixes conflicting goal status, accounting gaps, and missing narrative

**Goal:** Unify three competing goal systems into one source of truth, connect cash flow to goal progress, add actionable insights, and forward-looking projections. Full plan in `docs/phase9-unified-goal-system.md`.

### Scope

#### 9a. Unify Goal System — Single Source of Truth
- Kill `goals-calc.js` hardcoded calculations, make planner the single source
- Goals Panel reads from planner output
- Merge milestones into planner goals (glide paths become a goal property)
- Reconcile Emergency Fund tab with planner

#### 9b. Connect Cash Flow to Goal Progress
- Use actual trailing income from cashflow entries (not static config)
- Show actual vs planned goal funding in Planning tab
- Strict category alignment between budget and cashflow

#### 9c. Actionable Insights
- Next Actions engine: rebalance, expense alerts, budget deficit, surplus allocation
- Surface in Planning tab with color-coded urgency

#### 9d. Forward-Looking Projections
- Per-goal projection with confidence
- FI projection timeline with sensitivity analysis
- Planning tab "FI Timeline" section

#### 9e. Data Integrity Cleanup
- Fix cashflow entry ID collisions
- Handle negative net worth
- Goal config validation on save
- Modified Dietz first-month edge case

---

## Design Principles (applies to all phases)

- **Data/UI separation**: calculators are pure functions, renderers handle DOM only
- **No hardcoded account lists**: use account config flags (`include_networth`, `include_performance`, `emergency_fund_role`) to drive behavior
- **Backward compatible data files**: new fields are optional. Old files without them load fine with empty defaults
- **Spanish locale**: all numbers formatted with es-ES (Fmt utility)
- **No external dependencies**: beyond Chart.js, SheetJS, Supabase JS (all CDN)

---

## Completed

- [x] v1.0.0 — Core dashboard (net worth, returns, FI progress, goals, budget)
- [x] Encrypted .fjson with AES-256-GCM
- [x] PWA + IndexedDB cache for offline/cross-device
- [x] IDB-first save flow (working copy in IDB, optional file export)
- [x] Persistent directory handle for Chrome (pick save folder once)
- [x] Auto-export config for Safari/iOS iCloud Drive sync
- [x] Admin CRUD editor (config, accounts, budget, month-end)
- [x] Quick Add Monthly flow (Phase 1)
- [x] Per-account returns comparison (Phase 2a)
- [x] Growth decomposition: savings vs market (Phase 2b)
- [ ] Benchmark tracking (Phase 2c) — deferred
- [x] Milestone data + admin CRUD + glide paths + status (Phase 3)
- [x] Mortgage calculator, amortization, equity, actual vs planned (Phase 4)
- [x] Zero-knowledge Supabase backend with offline support (Phase 5)
- [x] Emergency Fund tab with configurable account roles (Phase 6)
- [x] Goal planning & priority allocation (Phase 7)
- [x] XLSX export with all data types
- [x] Monthly summary with auto-generated narrative
- [x] Anomaly detection for data validation
- [x] Monthly income & expense tracking with planned-vs-actual (Phase 8)
