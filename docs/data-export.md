# Data Export — Migration Guide

## Overview

The FI Dashboard can export all data as a plaintext `.xlsx` workbook for backup, migration to another database, or analysis in spreadsheet software. The export contains **no encryption** — it produces a standard Excel file that any tool can read.

## How to Export

### From the Dashboard
1. Open the dashboard (sign in if using Cloud mode)
2. Click the hamburger menu (top-right)
3. Click **"Export Data (.xlsx)"**
4. The file `fi-dashboard-export.xlsx` downloads automatically

### From the Admin Page
1. Open the Admin page
2. Click **"Export .xlsx"** in the header bar
3. The file downloads automatically

Both methods export the same data — use whichever page you're already on.

## XLSX Structure

The exported workbook contains up to 7 sheets:

### Sheet 1: Config

Key-value pairs for dashboard configuration.

| Column | Description |
|--------|-------------|
| `key` | Parameter name (e.g. `fi_target`, `withdrawal_rate`) |
| `value` | Numeric value |
| `description` | Human-readable explanation |

**Example rows:**

| key | value | description |
|-----|-------|-------------|
| fi_target | 1000000 | Financial Independence target (EUR) |
| withdrawal_rate | 0.04 | Safe withdrawal rate (4% = 0.04) |
| expected_return | 0.05 | Expected annual return for projections |
| monthly_income | 3500 | Monthly net income after taxes (EUR) |
| emergency_fund_target | 40000 | Target amount for emergency fund reserve (EUR) |

### Sheet 2: Accounts

Account definitions. One row per account.

| Column | Type | Description |
|--------|------|-------------|
| `account_id` | string | Unique identifier (e.g. `INDEXA`, `BBVA`) |
| `account_name` | string | Display name |
| `type` | string | `Broker` or `Cash` |
| `currency` | string | Currency code (e.g. `EUR`) |
| `include_networth` | boolean | Include in net worth calculations |
| `include_performance` | boolean | Include in investment performance calculations |
| `emergency_fund_role` | string | `none`, `dedicated`, or `backup` — role in emergency fund |

### Sheet 3: MonthEnd

Month-end balances — the core financial data. One row per account per month.

| Column | Type | Description |
|--------|------|-------------|
| `month` | string | Month in `YYYY-MM` format |
| `account_id` | string | References Accounts sheet |
| `end_value` | number | Balance at end of month (EUR) |
| `net_contribution` | number | Money added/withdrawn during month (EUR) |
| `notes` | string | Optional notes |

Sorted by month ascending, then account_id alphabetically.

### Sheet 4: Budget

Monthly budget line items. One row per item.

| Column | Type | Description |
|--------|------|-------------|
| `item_id` | string | Unique identifier (e.g. `rent`, `groceries`) |
| `name` | string | Display name |
| `type` | string | `fixed` or `variable` |
| `amount` | number | Amount in EUR |
| `frequency` | string | `monthly`, `quarterly`, or `yearly` |
| `category` | string | Category grouping (e.g. `Housing`, `Food`) |
| `active` | boolean | Whether this item is currently active |

### Sheet 5: Planner

Goal funding plan. One row per funding goal.

| Column | Type | Description |
|--------|------|-------------|
| `goal_id` | string | Unique identifier (e.g. `emergency_fund`) |
| `name` | string | Display name |
| `target_amount` | number | Target amount (EUR) |
| `current_amount` | number | Manual current amount override (EUR) |
| `target_date` | string | Target date in `YYYY-MM` format |
| `priority` | number | Priority (1 = highest) |
| `active` | boolean | Whether this goal is active |
| `track_current_from_accounts` | boolean | Auto-track current value from funding accounts |
| `funding_accounts_csv` | string | Comma-separated account IDs that fund this goal |

### Sheet 6: Milestones

Milestone targets with sub-targets. Flattened — one row per sub-target, with milestone fields repeated.

| Column | Type | Description |
|--------|------|-------------|
| `milestone_id` | string | Unique identifier (e.g. `end_2026`) |
| `name` | string | Milestone display name |
| `target_date` | string | Target date in `YYYY-MM` format |
| `total_target` | number | Total target amount (EUR) |
| `sub_goal` | string | Sub-target goal type (e.g. `FI Net Worth`, `Emergency Fund`) |
| `sub_amount` | number | Sub-target amount (EUR) |

### Sheet 7: Mortgage (optional)

Only present if mortgage data exists. Contains 4 sections separated by headers:

**Section A — Mortgage Parameters:**

| key | value |
|-----|-------|
| principal | 250000 |
| annual_rate | 0.0275 |
| term_years | 30 |
| start_date | 2026-04 |

**Section B — Extra Payments:**

| date | amount | strategy |
|------|--------|----------|
| 2027-01 | 5000 | reduce_term |

**Section C — Actual Payments:**

| month | amount | principal_paid | interest_paid | notes |
|-------|--------|---------------|---------------|-------|
| 2026-04 | 1020 | 447 | 573 | |

**Section D — House Valuations:**

| date | market_value |
|------|-------------|
| 2026-06 | 310000 |

## Importing into Another System

### Into Google Sheets
1. Open Google Sheets → File → Import → Upload the `.xlsx`
2. Choose "Replace spreadsheet" or "Insert new sheets"
3. Each sheet imports as a separate tab

### Into a New Database
1. Open the `.xlsx` in any spreadsheet tool
2. Export each sheet as CSV individually
3. Import CSVs into your database tables:
   - `Config` → key-value settings table
   - `Accounts` → accounts table
   - `MonthEnd` → the main data table (largest)
   - `Budget` → budget items table
   - `Planner` → goals/funding table
   - `Milestones` → milestones table (flatten sub-targets as needed)
   - `Mortgage` → parse the 4 sections into separate tables

### Into Python/pandas
```python
import pandas as pd

xlsx = pd.ExcelFile('fi-dashboard-export.xlsx')
config = pd.read_excel(xlsx, 'Config')
accounts = pd.read_excel(xlsx, 'Accounts')
monthend = pd.read_excel(xlsx, 'MonthEnd')
budget = pd.read_excel(xlsx, 'Budget')
planner = pd.read_excel(xlsx, 'Planner')
milestones = pd.read_excel(xlsx, 'Milestones')
# mortgage = pd.read_excel(xlsx, 'Mortgage')  # if present
```

### Back into FI Dashboard
The `.xlsx` export is one-way (for migration/backup). To restore data into the FI Dashboard, use the encrypted `.fjson` export instead (Admin → Export .fjson in Cloud mode, or the file-based flow).

## Data Integrity Notes

- All monetary values are in EUR
- Months use `YYYY-MM` format (e.g. `2024-01` for January 2024)
- Boolean columns export as `TRUE`/`FALSE`
- Empty/missing values export as blank cells
- MonthEnd rows are sorted chronologically
- The export is a point-in-time snapshot — it does not auto-sync
