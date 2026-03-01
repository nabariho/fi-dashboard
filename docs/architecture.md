# Architecture Overview

## Data Flow

```
[.fjson file in iCloud] → [File API] → [Crypto.decrypt] → [Global State]
                                                                ↓
                                                    ┌─── Data Layer ───┐
                                                    │ AccountService   │
                                                    │ DataService      │
                                                    │ ReturnsCalculator│
                                                    │ NetWorthCalc     │
                                                    │ FICalculator     │
                                                    │ GoalsCalculator  │
                                                    │ BudgetCalculator │
                                                    └────────┬─────────┘
                                                             ↓
                                                    ┌─── UI Layer ─────┐
                                                    │ MetricsRenderer  │
                                                    │ ChartRenderer    │
                                                    │ TableRenderer    │
                                                    │ GoalsRenderer    │
                                                    │ BudgetRenderer   │
                                                    └────────┬─────────┘
                                                             ↓
                                                         [DOM]
```

## Module Map

### Global State (`js/lib/utils.js`)
- `appConfig` — FI target, withdrawal rate, etc.
- `accountsConfig` — Account definitions
- `allData` — MonthEnd rows
- `budgetItems` — Budget line items
- `Fmt` — Formatting utilities (currency, percentage, years)

### Data Layer (`js/data/`)
| Module | Responsibility |
|--------|---------------|
| `account-service.js` | Account lookups (name, type, color) |
| `data-service.js` | Filtering, aggregation, time range |
| `returns-calc.js` | Modified Dietz returns, YTD chaining |
| `networth-calc.js` | Net worth aggregation, MoM/YTD changes |
| `fi-calc.js` | FI progress, years to FI, savings rate |
| `goals-calc.js` | Emergency fund & house down payment status |
| `budget-calc.js` | Monthly budget breakdown |

### UI Layer (`js/ui/`)
| Module | Renders |
|--------|---------|
| `ui-metrics.js` | FI progress bar, metric cards |
| `ui-charts.js` | Portfolio & net worth Chart.js charts |
| `ui-tables.js` | Returns grid, NW breakdown table |
| `ui-goals.js` | Goals panel & detail view |
| `ui-budget.js` | Budget overview |

### Orchestration (`js/app.js`)
- Unlock screen: File API + Crypto → populate globals → show dashboard
- `refresh*()` functions wire calculators to renderers
- Event binding for tabs, filters, time ranges

### Encryption (`js/crypto.js` + `cli/crypto.mjs`)
- AES-256-GCM with PBKDF2 key derivation (100k iterations)
- Browser uses Web Crypto API, CLI uses Node.js `crypto`
- Same `.fjson` format — files are interchangeable

## Data Format (`.fjson`)

```json
{
  "v": 1,
  "salt": "<base64>",
  "iv": "<base64>",
  "data": "<base64 ciphertext>"
}
```

Decrypted payload:
```json
{
  "config": { "fi_target": 750000, ... },
  "accounts": [{ "account_id": "...", ... }],
  "data": [{ "month": "2024-01", "account_id": "...", "end_value": 0, "net_contribution": 0 }],
  "budgetItems": [{ "item_id": "...", ... }]
}
```
