# Architecture Overview

## Data Flow

### File Mode (original)
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
                                                    │ MilestoneCalc    │
                                                    │ MortgageCalc     │
                                                    └────────┬─────────┘
                                                             ↓
                                                    ┌─── UI Layer ─────┐
                                                    │ MetricsRenderer  │
                                                    │ ChartRenderer    │
                                                    │ TableRenderer    │
                                                    │ GoalsRenderer    │
                                                    │ BudgetRenderer   │
                                                    │ MortgageRenderer │
                                                    └────────┬─────────┘
                                                             ↓
                                                         [DOM]
```

### DB Mode (zero-knowledge cloud)
```
[Supabase] → DbService.fetchAllRecords → [encrypted blobs]
                                                │
                          DbCrypto.decryptRecord (each)
                                                │
                                    reassemble by type
                                                │
                          { config, accounts, data, ... }
                                                │
                                            loadData()     ← same entry point as file mode
                                                │
                                        [Global State → UI]
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
| `milestone-calc.js` | Milestone progress, glide path, status |
| `mortgage-calc.js` | Amortization schedule, equity, actual vs planned |
| `summary-calc.js` | Monthly summary: NW change, attribution, narrative |
| `anomaly-calc.js` | Anomaly detection: unusual changes, zero balances |

### UI Layer (`js/ui/`)
| Module | Renders |
|--------|---------|
| `ui-metrics.js` | FI progress bar, metric cards |
| `ui-charts.js` | Portfolio & net worth Chart.js charts |
| `ui-tables.js` | Returns grid, NW breakdown table |
| `ui-goals.js` | Goals panel & detail view |
| `ui-budget.js` | Budget overview |
| `ui-mortgage.js` | Mortgage dashboard: cards, chart, amort table, equity |
| `ui-summary.js` | Monthly summary panel: narrative, cards, anomaly alerts |

### Orchestration (`js/app.js`)
- Unlock screen: File API + Crypto → populate globals → show dashboard
- Auth screen: Cloud sign-in → StorageManager.load() → populate globals
- `refresh*()` functions wire calculators to renderers
- Event binding for tabs, filters, time ranges

### Encryption — File Mode (`js/crypto.js` + `cli/crypto.mjs`)
- AES-256-GCM with PBKDF2 key derivation (100k iterations)
- Browser uses Web Crypto API, CLI uses Node.js `crypto`
- Same `.fjson` format — files are interchangeable

### Encryption — DB Mode (`js/db-crypto.js`)
- Separate crypto module for zero-knowledge database storage
- `deriveAuthPassword`: PBKDF2 (1 iter, email as salt) → Supabase login password
- `deriveEncryptionKey`: PBKDF2 (100k iter, random salt) → non-extractable AES-256-GCM key
- `recordHash`: SHA-256 opaque hash for record identity
- `encryptRecord`/`decryptRecord`: AES-256-GCM per-record encrypt/decrypt
- Auth password ≠ encryption key — compromising auth does not reveal data

### Database Service (`js/db-service.js`)
- Supabase CRUD wrapper — the only module that touches the Supabase client
- Auth (signUp, signIn, signOut, getSession), vault (getEncSalt), records (fetch, upsert, delete)

### Storage Manager (`js/storage-manager.js`)
- Unified interface over file and DB modes
- Diff-based save: compares current vs last-saved record map, upserts only changes
- Import/export between .fjson files and DB
- Mode persisted in localStorage (`fi_storage_mode`)

### Configuration (`js/config.js`)
- Supabase URL and anon key (safe to expose — RLS protects data)

### Cache (`js/data-cache.js`)
- IDB v3: `cache` (file mode), `dir_handles`, `vault_cache` (encrypted DB records), `pending_sync`
- No plaintext passphrase stored in IDB

## Database Schema (Supabase)

See `supabase-schema.sql` for the full SQL. Two tables:

- `user_vaults`: `user_id` (PK), `enc_salt` (random 16-byte base64)
- `vault_records`: `user_id`, `record_hash` (opaque SHA-256 hex), `iv`, `data` (AES-256-GCM ciphertext)

RLS policies ensure users can only access their own rows. The server never sees plaintext.

### Record types stored in DB
| type | natural_key | example |
|------|-------------|---------|
| `config` | `main` | Single config record |
| `account` | `BROKER_A` | One per account |
| `monthend` | `2024-01\|BROKER_A` | One per month+account |
| `budget` | `rent` | One per budget item |
| `milestone` | `end_2026` | One per milestone |
| `mortgage` | `main` | 0 or 1 |

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
  "budgetItems": [{ "item_id": "...", ... }],
  "milestones": [{ "milestone_id": "...", "target_date": "YYYY-MM", "total_target": 0, "sub_targets": [] }],
  "mortgage": {
    "principal": 250000, "annual_rate": 0.0275, "term_years": 30, "start_date": "2026-04",
    "extra_payments": [{ "date": "YYYY-MM", "amount": 5000, "strategy": "reduce_term" }],
    "actual_payments": [{ "month": "YYYY-MM", "amount": 1020, "principal_paid": 447, "interest_paid": 573, "notes": "" }],
    "house_valuations": [{ "date": "YYYY-MM", "market_value": 310000 }]
  }
}
```
