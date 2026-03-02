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

### Files to create/modify

- `js/admin.js` — new `renderQuickAdd()` function + `addQuickMonth()` handler
- No new files needed — fits within existing Admin MonthEnd tab

---

## Phase 2: Investment Analysis

**Status:** Done (v1.3.0) — 2a+2b complete, 2c deferred, 2d removed (redundant)
**Priority:** High — key insight the user needs to optimize their portfolio

**Goal:** Understand how profitable investments are, compare accounts, and spot improvement opportunities.

### Scope

#### 2a. Per-Account Returns Comparison
- Bar or line chart showing per-account returns side by side (monthly and YTD)
- Table view: all accounts in columns, months in rows, returns as values
- Highlight best/worst performers

#### 2b. Growth Decomposition (Contributions vs. Market Returns)
- For each account and for total portfolio:
  - Cumulative contributions over time
  - Cumulative market-driven growth (total value - cumulative contributions)
- Stacked area chart: contributions (bottom) + market growth (top) = total value
- Answer: "How much of my wealth is my savings vs. the market?"

#### 2c. Benchmark Tracking
- New data structure in the data file: `benchmarks` array
  ```json
  {
    "benchmarks": [
      {
        "benchmark_id": "MSCI_WORLD",
        "name": "MSCI World",
        "returns": [
          { "month": "2024-01", "monthly_return_pct": 1.2 }
        ]
      }
    ]
  }
  ```
- Configurable: start with one benchmark, easy to add more
- Manual entry (user types monthly return % alongside account data)
- Renders as dashed line on the returns chart for comparison
- Admin: new Benchmarks tab or section to manage benchmark data

#### 2d. FI Projection Chart
- Wire up existing `FICalculator.projectFuture()` to a line chart
- Show projected path to FI based on current savings rate + expected return
- Display on the FI Progress section or as a separate panel
- Inputs already in config: `expected_return`, `fi_target`

### Files to create/modify

- `js/data/benchmark-calc.js` — new calculator for benchmark return series
- `js/ui/ui-charts.js` — new chart functions for comparison, decomposition, projection
- `js/ui/ui-tables.js` — new table for cross-account returns comparison
- `js/app.js` — wire new calculators + renderers into refresh flow
- `js/admin.js` — benchmark data entry (if separate section)

---

## Phase 3: Milestones & Goal Tracking

**Status:** Done (v1.4.0)
**Priority:** Medium — important for motivation and staying on track

**Goal:** Define time-bound targets at both total and per-goal levels, and track progress against a glide path.

### Scope

#### 3a. Milestone Data Structure
- New array in the data file: `milestones`
  ```json
  {
    "milestones": [
      {
        "milestone_id": "end_2026",
        "name": "End of 2026",
        "target_date": "2026-12",
        "total_target": 220000,
        "sub_targets": [
          { "goal": "emergency_fund", "amount": 40000 },
          { "goal": "house_downpayment", "amount": 80000 },
          { "goal": "fi_networth", "amount": 100000 }
        ]
      }
    ]
  }
  ```

#### 3b. Glide Path Visualization
- Linear interpolation from current value to target date
- Plotted on net worth chart as a dashed target line
- Per-goal glide paths on the Goals detail tab

#### 3c. Status Indicators
- Ahead / On Track / Behind — based on position relative to glide path
- Color-coded badges on the dashboard
- Alert if falling behind (e.g., missed savings for 2+ months)

#### 3d. Per-Goal Milestone Breakdown
- Each milestone shows progress per sub-target independently
- Emergency fund: X of 40k (Y%)
- House: X of 80k (Y%)
- FI net worth: X of 100k (Y%)

### Files to create/modify

- `js/data/milestone-calc.js` — new calculator for glide paths and status
- `js/ui/ui-goals.js` — extend with milestone rendering
- `js/ui/ui-charts.js` — glide path overlay on net worth chart
- `js/admin.js` — milestone editor in Admin (new tab or section within Goals)
- `js/app.js` — wire milestone calculator into refresh flow

---

## Phase 4: House & Mortgage Module

**Status:** Done (v1.5.0)
**Priority:** Lower — needed when house purchase happens

**Goal:** Track down payment progress, mortgage amortization, house equity, and integrate debt into FI calculations.

### Scope

#### 4a. Down Payment Tracking (partially built)
- Already tracked via goals-calc.js (ARRAS + BANKINTER accounts)
- Enhancement: show progress over time (historical chart)

#### 4b. Mortgage Data & Amortization
- New data structure: `mortgage` object in the data file
  ```json
  {
    "mortgage": {
      "principal": 300000,
      "annual_rate": 0.025,
      "term_years": 25,
      "start_date": "2027-01",
      "extra_payments": []
    }
  }
  ```
- Amortization schedule calculator (monthly breakdown)
- Show: monthly payment, interest vs. principal split, remaining balance
- New Admin tab: Mortgage

#### 4c. House Equity Tracking
- Market value of house (manually updated, e.g., yearly)
- Equity = market value - remaining mortgage balance
- Appreciation tracking over time

#### 4d. Net Worth with Liabilities
- Adjust net worth calculation: assets - liabilities
- Mortgage debt counts against FI target
- FI target effectively becomes: 1,000,000 + remaining mortgage
- Or: net worth includes house equity, FI target stays at 1,000,000

### Files to create/modify

- `js/data/mortgage-calc.js` — new calculator for amortization, equity
- `js/ui/ui-mortgage.js` — new renderer for mortgage tab
- `js/data/networth-calc.js` — extend to include liabilities
- `js/data/fi-calc.js` — adjust FI progress for debt
- `js/admin.js` — mortgage data editor
- `index.html` — new Mortgage tab

---

## Design Principles (applies to all phases)

- **Data/UI separation**: calculators are pure functions, renderers handle DOM only
- **No hardcoded account lists**: use account config flags (`include_networth`, `include_performance`) to drive behavior. Exception: goals-calc.js currently hardcodes account IDs — should be refactored when goals become more flexible
- **Backward compatible data files**: new fields (benchmarks, milestones, mortgage) are optional. Old files without them should load fine with empty defaults
- **Spanish locale**: all numbers formatted with es-ES (Fmt utility)
- **No external dependencies**: beyond Chart.js (CDN)

---

## Completed

- [x] v1.0.0 — Core dashboard (net worth, returns, FI progress, goals, budget)
- [x] Encrypted .fjson with AES-256-GCM
- [x] PWA + IndexedDB cache for offline/cross-device
- [x] IDB-first save flow (working copy in IDB, optional file export)
- [x] Persistent directory handle for Chrome (pick save folder once)
- [x] Auto-export config for Safari/iOS iCloud Drive sync
- [x] Admin CRUD editor (config, accounts, budget, month-end)
- [x] Quick Add Monthly flow (Phase 1) — pre-filled grid for all accounts
- [x] Per-account returns comparison table (Phase 2a)
- [x] Growth decomposition: savings vs market attribution (Phase 2b)
- [ ] Benchmark tracking (Phase 2c) — deferred to future
- [x] FI projection chart (Phase 2d) — removed, redundant with FI progress bar
- [x] Milestone data structure + admin CRUD (Phase 3a)
- [x] Glide path visualization on Goals tab (Phase 3b)
- [x] Status indicators: ahead/on-track/behind (Phase 3c)
- [x] Per-goal milestone breakdown (Phase 3d)
- [x] Mortgage calculator + amortization schedule (Phase 4b)
- [x] House equity tracking with sparse valuations (Phase 4c)
- [x] Net worth integration with mortgage debt + house value (Phase 4d)
- [x] Mortgage dashboard tab: summary cards, balance chart, amortization table (Phase 4)
- [x] Mortgage admin CRUD: parameters, extra payments, actual payments, house valuations (Phase 4)
- [x] Actual vs planned payment comparison (Phase 4)
- [x] Extra payment strategies: reduce term or reduce payment (Phase 4)
