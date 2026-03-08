# Business Requirements Document — FI Dashboard

> **Purpose**: Canonical reference for what the FI Dashboard does, why, and how each feature serves the user's financial independence journey. Written so that any developer (human or AI) can understand the domain, pick up a feature, and build it correctly without re-discovering context.

---

## 1. Product Vision

A personal, privacy-first financial dashboard that tracks progress toward **Financial Independence (FI)** — the point where passive income from investments covers all living expenses, making work optional.

The user is a single individual managing ~10 financial accounts (brokers, cash, savings) across multiple providers, tracking net worth month by month. The dashboard replaces spreadsheets with visualizations, automated calculations, and goal tracking.

### Core Principles

| Principle | Implication |
|-----------|-------------|
| **Privacy first** | Zero-knowledge encryption. No server ever sees plaintext financial data. |
| **Single user** | No multi-user, no sharing, no collaboration features. |
| **Monthly cadence** | Data is entered once per month (month-end balances). Not daily or real-time. |
| **EUR, Spanish locale** | All amounts in EUR. Number formatting uses `es-ES` (comma decimal, dot thousands). |
| **Offline capable** | PWA with service worker. Must work without internet after first load. |
| **No build step** | Vanilla JS, no bundler, no TypeScript. CDN-only dependencies (Chart.js, SheetJS, Supabase). |

---

## 2. User Personas & Workflows

### Monthly Review (primary workflow, ~10 min/month)

1. Open Admin page
2. Go to **MonthEnd** tab → **Quick Add Month**
3. Enter end-of-month balances for all accounts (pre-filled grid with last month's values as reference)
4. Go to **Cash Flow** tab → **Quick Add Month**
5. Enter actual income (salary, bonus) and expenses by category (housing, food, transport, etc.)
6. Save → navigate to Dashboard
7. Review: FI Progress panel, Cash Flow tab (planned vs actual), Net Worth tab, Monthly Summary

### Periodic Review (quarterly/yearly)

- Check **Goals** tab: are milestones on track? Adjust priorities in Admin > Planning
- Review **Investments** tab: per-account returns comparison
- Update **Budget** items if spending patterns changed
- Export XLSX for offline analysis or tax preparation

### Account Changes (rare)

- Add/remove accounts in Admin > Accounts
- Configure account roles: net worth inclusion, performance tracking, emergency fund role, cashflow role

---

## 3. Data Model

### 3.1 Core Entities

#### Config (singleton)
Key-value pairs driving all calculations.

| Key | Type | Example | Purpose |
|-----|------|---------|---------|
| `fi_target` | number | 1000000 | Net worth needed for FI (excluding house) |
| `withdrawal_rate` | number | 0.04 | Safe withdrawal rate (4%) |
| `expected_return` | number | 0.05 | Expected annual return for projections |
| `monthly_income` | number | 3500 | Monthly net income (for derived savings rate) |
| `emergency_fund_target` | number | 40000 | Emergency fund target amount |
| `house_downpayment_target` | number | 80000 | House down payment goal |
| `auto_export` | number | 1 | Auto-download .fjson on save (Safari workaround) |

#### Accounts
One record per financial account.

| Field | Type | Values | Purpose |
|-------|------|--------|---------|
| `account_id` | string | `INDEXA`, `BBVA` | Unique identifier (uppercase convention) |
| `account_name` | string | | Display name |
| `type` | string | `Broker`, `Cash` | Classification |
| `currency` | string | `EUR` | Always EUR currently |
| `include_networth` | boolean | | Include in net worth total |
| `include_performance` | boolean | | Include in investment returns (Modified Dietz) |
| `emergency_fund_role` | string | `none`, `dedicated`, `backup` | Emergency fund participation |
| `cashflow_role` | string | `none`, `savings`, `transactional` | Cash flow analysis classification |

**Business rules:**
- Performance accounts are always Broker-type
- Emergency fund roles drive the Emergency Fund tab (no hardcoded account lists)
- Cashflow roles drive the derived savings capacity analysis (savings = money saved, transactional = bills/expenses)

#### MonthEnd (the core data)
One record per account per month. This is the raw data from which everything is computed.

| Field | Type | Example |
|-------|------|---------|
| `month` | string | `2026-03` (YYYY-MM) |
| `account_id` | string | `INDEXA` |
| `end_value` | number | 45230.50 |
| `net_contribution` | number | 500 |
| `notes` | string | (optional) |

**Business rules:**
- Every account gets a row every month (no skipping)
- `end_value` = balance at month end
- `net_contribution` = money deposited minus money withdrawn during the month (excludes market returns)
- Monthly return = `(end_value - prev_end_value - net_contribution) / (prev_end_value + 0.5 * net_contribution)` (Modified Dietz)

#### Budget Items
Planned monthly expenses, used for budget-vs-actual comparison and operating reserve.

| Field | Type | Values |
|-------|------|--------|
| `item_id` | string | `rent`, `groceries` |
| `name` | string | Display name |
| `type` | string | `fixed`, `variable` |
| `amount` | number | Amount in native frequency |
| `frequency` | string | `monthly`, `quarterly`, `yearly` |
| `category` | string | `Housing`, `Food`, etc. |
| `active` | boolean | Whether to include in calculations |

**Business rules:**
- Fixed items are prorated to monthly (`yearly / 12`, `quarterly / 4`)
- Variable items are already monthly amounts
- Categories are shared with cashflow entries for planned-vs-actual comparison

#### Cashflow Entries
Actual monthly income and expenses by category. Entered during monthly review.

| Field | Type | Example |
|-------|------|---------|
| `entry_id` | string | `2026-03_expense_housing` |
| `month` | string | `2026-03` |
| `type` | string | `income` or `expense` |
| `category` | string | `Salary`, `Housing`, `Food` |
| `amount` | number | Always positive |
| `notes` | string | (optional) |

**Business rules:**
- `entry_id` format: `{month}_{type}_{slug(category)}` — auto-generated, unique
- ~10-15 entries per month (manageable)
- Expense categories reuse budget item categories for planned-vs-actual comparison
- Income categories: Salary, Bonus, Other (extensible via free-text with datalist)
- Category normalization: trim + title-case for consistency
- Amounts are always positive regardless of type

**StorageManager record key:** `cashflow|{entry_id}`

#### Planner Goals
Priority-based funding goals with target dates and account assignments.

| Field | Type | Example |
|-------|------|---------|
| `goal_id` | string | `emergency_fund` |
| `name` | string | `Emergency Fund` |
| `target_amount` | number | 40000 |
| `current_amount` | number | 0 (manual override) |
| `target_date` | string | `2027-06` |
| `priority` | number | 1 (highest) |
| `active` | boolean | |
| `track_current_from_accounts` | boolean | Auto-track from funding accounts |
| `funding_accounts` | string[] | `["BANKINTER", "BBVA"]` |

#### Milestones
Time-bound targets with sub-goals for tracking progress against a glide path.

| Field | Type |
|-------|------|
| `milestone_id` | string |
| `name` | string |
| `target_date` | string (YYYY-MM) |
| `total_target` | number |
| `sub_targets` | `[{ goal: string, amount: number }]` |

#### Mortgage (optional, singleton)
Full mortgage tracking with amortization, extra payments, and house equity.

| Section | Fields |
|---------|--------|
| Parameters | `principal`, `annual_rate`, `term_years`, `start_date` |
| Extra payments | `[{ date, amount, strategy }]` — strategy: `reduce_term` or `reduce_payment` |
| Actual payments | `[{ month, amount, principal_paid, interest_paid, notes }]` |
| House valuations | `[{ date, market_value }]` — sparse, interpolated |

### 3.2 Storage

Two modes behind unified `StorageManager`:

| Mode | Mechanism | Encryption |
|------|-----------|------------|
| **File** | `.fjson` files via File API / iCloud Drive | AES-256-GCM, PBKDF2 100k iterations |
| **DB** | Supabase (PostgreSQL) | Per-record AES-256-GCM, zero-knowledge |

Both produce identical data shapes. `loadData()` is the shared entry point.

**Record types in DB:**

| Type | Natural Key | Granularity |
|------|-------------|-------------|
| `config` | `main` | Singleton |
| `account` | `{account_id}` | One per account |
| `monthend` | `{month}\|{account_id}` | One per month+account |
| `budget` | `{item_id}` | One per budget item |
| `cashflow` | `{entry_id}` | One per cashflow entry |
| `milestone` | `{milestone_id}` | One per milestone |
| `mortgage` | `main` | 0 or 1 |
| `planner_goal` | `{goal_id}` | One per goal |

---

## 4. Feature Specifications

### 4.1 Always-Visible Panels (collapsible)

#### FI Progress Panel
**Purpose:** At-a-glance FI status — the single most important number.

- Progress bar: current NW / FI target (percentage)
- Passive income: `investments * withdrawal_rate / 12`
- Years to FI: compound growth projection using expected return + average monthly savings
- Savings rate: last 12 months of net contributions / (12 * monthly income)
- Expense coverage: passive income vs monthly budget total

#### Financial Goals Panel
**Purpose:** Quick status on the two active goals.

- Emergency Fund: current / target, funded %
- House Down Payment: current / target, funded %

#### Monthly Summary Panel
**Purpose:** Auto-generated narrative about the latest month.

- NW change (absolute + %), attribution (savings vs market)
- Anomaly alerts (unusual balance changes, zero balances, missing accounts)
- Milestone proximity alerts

### 4.2 Investments Tab
**Purpose:** Understand investment performance.

- Portfolio chart: end value over time overlaid with cumulative contributions
- Returns table: monthly return %, YTD %, groupable by year, toggle EUR/% view
- Per-account comparison: side-by-side returns for all performance accounts
- Time range filter: 6mo, 1yr, 3yr, all

**Key calculation:** Modified Dietz method for monthly returns, chained for YTD (reset each January).

### 4.3 Net Worth Tab
**Purpose:** Track total wealth over time.

- Stacked area chart: each account as a layer, mortgage debt shown as negative
- Monthly breakdown table: per-account values with MoM deltas (absolute + %)
- Time range filter: 6mo, 1yr, 3yr, all
- Includes house equity and mortgage balance when mortgage data exists

### 4.4 Emergency Fund Tab
**Purpose:** Dedicated emergency fund health monitoring.

- Status cards: current balance, target, funded %, months of coverage, surplus/shortfall
- Breakdown by role (dedicated vs backup)
- Funding history chart: balance over time with target line
- Monthly flows table: starting balance → contributions → withdrawals → market change → ending → vs target

### 4.5 Goals Tab
**Purpose:** Unified view of goal funding + milestones.

- **Funding Plan:** priority-ordered table with: funding accounts, source balance, required/mo, allocated/mo, shortfall, projected completion
- **Account Ledger:** per-account integrity check — balance, manual claims, tracked claims, total claimed, unassigned
- **Milestones:** progress cards with glide path (linear interpolation to target date), status (Ahead/On Track/Behind)

### 4.6 Budget Tab
**Purpose:** Monthly expense breakdown for reference.

- Summary cards: total, fixed, variable
- Category-grouped table: each budget item with monthly amount

### 4.7 Mortgage Tab
**Purpose:** Full mortgage dashboard (appears when mortgage data configured).

- Summary cards: monthly payment, remaining balance, total interest, payoff date
- Balance chart: principal remaining + equity over time
- Amortization table: month-by-month principal/interest/balance breakdown
- Actual vs planned comparison: highlight payment deviations
- Extra payment impact analysis

### 4.8 Cash Flow Tab
**Purpose:** Understand where money goes each month. Bridge between planned budget and actual spending.

#### Data Sources (Hybrid Model)
The Cash Flow tab operates in **hybrid mode**:

| Source | When used | What it provides |
|--------|-----------|-----------------|
| **Derived** (default) | All months | Income = config `monthly_income`; Expenses = `income - net_contributions`; Savings rate = `net_contributions / income` |
| **Actual** (cashflow entries) | Months with entries | Income = sum of income entries; Expenses = sum of expense entries; Savings rate = `(income - expenses) / income` |

For months with actual cashflow entries, the actual data overrides derived data. The monthly table shows a **Source** column indicator (`Actual` in green, `Derived` in grey) so the user can see which months have real data.

#### Sections

1. **Metrics row:** Monthly income, actual expenses (trailing avg), actual savings (trailing avg), budget vs actual gap
2. **Payroll Distribution (waterfall chart):** Income → Expenses → Goal allocations → Unallocated
3. **Savings Trend (bar + line chart):** Net contributions + implied expenses (bars), savings rate (line, right axis)
4. **Goal Achievability table:** Per-goal confidence score, projected months, assessment message
5. **Planned vs Actual (bar chart + table):** Side-by-side comparison of budget vs actual expenses by category. Only appears when actual cashflow data exists for at least one month. Shows delta per category (positive = overspent, negative = underspent).
6. **Expense Category Trends (stacked bar chart):** Actual expense categories over time. Only appears when 2+ months of actual data exist. Helps spot improvement areas.
7. **Monthly Cash Flow table:** Month-by-month breakdown with source indicator, income, contributions, savings/transactional split, expenses, savings rate

#### Planned vs Actual Logic
- **Planned** amounts come from active Budget Items, prorated to monthly
- **Actual** amounts come from expense-type Cashflow Entries for the selected month
- Categories are matched by name (budget item `category` = cashflow entry `category`)
- Categories that appear in only one source still show (with 0 for the missing side)
- Delta = actual - planned (positive = overspent)

### 4.9 Admin Page

#### Admin Tabs (in order)
1. **Config** — key-value parameter editor
2. **Accounts** — account CRUD with all role fields
3. **Budget** — budget item CRUD (type, amount, frequency, category, active)
4. **Cash Flow** — income/expense entry management
5. **Planning** — planner goal CRUD (priority, target_date, funding_accounts)
6. **Milestones** — milestone CRUD with sub-targets
7. **MonthEnd** — Quick Add Month grid + historical data table
8. **Mortgage** — mortgage parameters, extra payments, actual payments, valuations

#### Cash Flow Admin (detailed)

**Quick Add Month:**
1. User selects a month (defaults to current)
2. Clicks "Generate Rows" → pre-populated grid:
   - Income rows: Salary, Bonus, Other (with empty amount inputs)
   - Expense rows: one per active budget category (showing planned amount as reference)
3. User fills in actual amounts
4. Clicks "Save Non-Zero Entries" → only rows with amount > 0 are saved
5. Duplicate `entry_id` check prevents overwriting existing entries

**Single Entry Add:**
- Manual form: month, type (income/expense), category (with datalist from budget + income categories), amount, notes
- Category normalization: trim + title-case
- Duplicate `entry_id` validation

**Historical Table:**
- Month filter dropdown
- Inline editing: category (with entry_id regeneration), amount, notes
- Delete per entry with confirmation

**Validation rules:**
- Month must be YYYY-MM format
- Amount must be > 0
- Type must be `income` or `expense`
- Category must not be empty
- No duplicate `entry_id` values

---

## 5. Calculation Specifications

### 5.1 Modified Dietz Monthly Return
```
return = (end_value - prev_end_value - net_contribution) / (prev_end_value + 0.5 * net_contribution)
```
- Assumes contributions occur mid-month (weight = 0.5)
- First month: `return = (end_value - net_contribution) / (0.5 * net_contribution)`

### 5.2 YTD Return
Chained monthly returns: `YTD = (1 + r_jan) * (1 + r_feb) * ... * (1 + r_current) - 1`
Reset to 0 each January.

### 5.3 FI Progress
```
progress = current_networth / fi_target
passive_income = investments * withdrawal_rate / 12
years_to_fi = compound growth projection(current, avg_monthly_savings, expected_return, fi_target)
savings_rate = last_12mo_contributions / (12 * monthly_income)
```

### 5.4 Savings Capacity (Derived)
```
implied_expenses = monthly_income - sum(all_net_contributions)
savings_rate = sum(all_net_contributions) / monthly_income
```

### 5.5 Savings Capacity (Actual — from Cashflow Entries)
```
total_income = sum(income entries for month)
total_expenses = sum(expense entries for month)
net_savings = total_income - total_expenses
savings_rate = net_savings / total_income
```

### 5.6 Hybrid Override
When actual cashflow entries exist for a month, the hybrid calculator:
- Replaces `income` with actual total income
- Replaces `impliedExpenses` with actual total expenses
- Replaces `totalContributions` with actual net savings
- Replaces `savingsRate` with actual savings rate
- Sets `dataSource = 'actual'` (vs `'derived'` for months without entries)
- Preserves `savingsContributions` and `transactionalContributions` from derived data (account-level detail not available from cashflow entries)

### 5.7 Planned vs Actual
```
For each budget category:
  planned = sum(active budget items in category, prorated to monthly)
  actual = sum(expense cashflow entries in category for the month)
  delta = actual - planned  (positive = overspent)
```

### 5.8 Goal Funding Allocation
Priority-based proportional allocation:
1. Sort goals by priority (P1 first)
2. Available budget = monthly_income - monthly_expenses
3. Allocate to each goal up to `required_monthly` amount
4. If budget exhausted, lower-priority goals get partial or no allocation
5. Oversubscription detection: flag when same account funds multiple goals

---

## 6. Data Export

XLSX workbook with sheets: Config, Accounts, MonthEnd, Budget, CashFlow, Planner, Milestones, Mortgage.

**CashFlow sheet columns:** `entry_id`, `month`, `type`, `category`, `amount`, `notes`
- Sorted by month ascending, then entry_id alphabetically
- Only present when cashflow entries exist

See `docs/data-export.md` for full schema of all sheets.

---

## 7. Testing Requirements

All calculator modules have unit tests in `tests/test-calculators.js`, run via `tests/test-runner.html` in a browser.

### CashflowCalculator Tests
| Test | Validates |
|------|-----------|
| `computeMonth aggregates income and expenses` | Correct totals, category breakdown, savings rate |
| `computeMonth returns zeros for empty month` | Graceful handling of no data |
| `computeAllMonths returns summaries for all months` | Multi-month aggregation, correct ordering |
| `getMonthsWithActuals returns correct set` | Set construction from entries |
| `slugify produces valid slugs` | Category-to-slug transformation |
| `buildEntryId generates correct format` | Entry ID construction |
| `computePlannedVsActual compares budget to actuals` | Per-category planned/actual/delta |
| `computeCategoryTrends tracks categories over time` | Multi-month category series |

**When adding new cashflow features**, always add corresponding tests. Run the full test suite to verify no regressions.

---

## 8. File Inventory

### New files (Cashflow feature)
| File | Layer | Purpose |
|------|-------|---------|
| `js/data/cashflow-calc.js` | Data | Pure calculator: month summary, planned-vs-actual, category trends |

### Modified files (Cashflow feature)
| File | What changed |
|------|-------------|
| `js/storage-manager.js` | Added `cashflow` record type to `buildRecordMap()`, `reassembleData()` |
| `js/app.js` | Added `cashflowEntries` global, `loadData()` field, hybrid `refreshCashFlow()`, export data |
| `js/data/savings-capacity-calc.js` | Added `computeMonthlyHybrid()` with dataSource flag |
| `js/admin.js` | AdminState field, Cash Flow admin tab, Quick Add, CRUD, validation |
| `admin.html` | Cash Flow tab button + content div |
| `js/ui/ui-cashflow.js` | Source indicator column, planned-vs-actual chart+table, category trends chart |
| `js/data-export.js` | CashFlow XLSX sheet |
| `index.html` | Script tag for `cashflow-calc.js` |
| `sw.js` | Cache version bump, new file in asset list |
| `tests/test-runner.html` | Script tag for `cashflow-calc.js` |
| `tests/test-calculators.js` | 8 CashflowCalculator tests |

---

## 9. Architecture Constraints

These constraints apply to ALL future development:

1. **Pure calculators**: `js/data/*.js` must never touch the DOM. They take inputs, return outputs.
2. **Pure renderers**: `js/ui/*.js` take processed data and render to DOM. No data processing logic.
3. **Orchestration in app.js**: `refresh*()` functions wire calculators to renderers.
4. **Admin CRUD in admin.js**: All admin tab rendering, validation, and save logic lives here.
5. **StorageManager for persistence**: All new data types need `buildRecordMap` + `reassembleData` entries.
6. **Backward compatibility**: New fields must have fallback defaults (`data.cashflowEntries || []`). Old files without them load fine.
7. **No build step**: All JS is loaded via `<script>` tags in dependency order. No modules, no imports.
8. **Script load order matters**: Calculator dependencies must load before their consumers (e.g., `cashflow-calc.js` before `savings-capacity-calc.js` because hybrid uses `CashflowCalculator`).
9. **Service worker**: Bump `CACHE_NAME` and add new files to `SHELL_ASSETS` on every deploy.
10. **Tests**: Every calculator gets tests. Run `tests/test-runner.html` before deploying.

---

## 10. Future Enhancements (related to Cash Flow)

### 10a. Income Tracking Over Time
Currently income categories are simple (Salary, Bonus, Other). Future: track income changes over time (raises, job changes) to show income growth trend.

### 10b. Expense Category Granularity
Budget categories are flat. Could add sub-categories (e.g., Housing > Rent, Housing > Utilities) for more detailed analysis.

### 10c. Recurring Entry Templates
Instead of Quick Add generating from budget categories every month, allow saving "templates" of common monthly entries that auto-fill amounts from previous months.

### 10d. Cash Flow Impact on FI Projections
Use actual income/expense data (when available) instead of config `monthly_income` for more accurate FI projections and years-to-FI calculations.

### 10e. YoY Category Comparison
Show year-over-year comparison of expense categories to spot inflation or lifestyle creep.

See `docs/enhancement_candidates.md` for the full list of non-cashflow enhancements.
