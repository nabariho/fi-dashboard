# Architecture Overview

## Data Flow

### File Mode (original)
```
[.fjson file in iCloud] --> [File API] --> [Crypto.decrypt] --> [Global State]
                                                                     |
                                                         +--- Data Layer ---+
                                                         | AccountService   |
                                                         | DataService      |
                                                         | ReturnsCalculator|
                                                         | NetWorthCalc     |
                                                         | FICalculator     |
                                                         | GoalsCalculator  |
                                                         | BudgetCalculator |
                                                         | MilestoneCalc    |
                                                         | MortgageCalc     |
                                                         | SummaryCalc      |
                                                         | AnomalyCalc      |
                                                         +--------+---------+
                                                                  |
                                                         +--- UI Layer -----+
                                                         | MetricsRenderer  |
                                                         | ChartRenderer    |
                                                         | TableRenderer    |
                                                         | GoalsRenderer    |
                                                         | BudgetRenderer   |
                                                         | MortgageRenderer |
                                                         | SummaryRenderer  |
                                                         +--------+---------+
                                                                  |
                                                              [DOM]
```

### DB Mode (zero-knowledge cloud)
```
[Supabase] --> DbService.fetchAllRecords --> [encrypted blobs]
                                                    |
                              DbCrypto.decryptRecord (each)
                                                    |
                                        reassemble by type
                                                    |
                              { config, accounts, data, ... }
                                                    |
                                                loadData()   <-- same entry point as file mode
                                                    |
                                            [Global State --> UI]
```

### Offline Mode (DB)
```
[IDB vault_cache] --> [encrypted blobs]     (when navigator.onLine === false)
                            |
          DbCrypto.decryptRecord (each)     (passphrase must be in memory)
                            |
                    reassemble by type
                            |
                        loadData()

[Save while offline] --> encrypt records --> IDB pending_sync queue
                                                    |
                          window 'online' event --> flushPendingSync() --> Supabase
```

## Module Map

### Global State (`js/lib/utils.js`)
- `appConfig` -- FI target, withdrawal rate, etc.
- `accountsConfig` -- Account definitions
- `allData` -- MonthEnd rows
- `budgetItems` -- Budget line items
- `Fmt` -- Formatting utilities (currency, percentage, years)

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
- Unlock screen: File API + Crypto --> populate globals --> show dashboard
- Auth screen: Cloud sign-in --> StorageManager.load() --> populate globals
- `refresh*()` functions wire calculators to renderers
- Event binding for tabs, filters, time ranges

### Encryption -- File Mode (`js/crypto.js` + `cli/crypto.mjs`)
- AES-256-GCM with PBKDF2 key derivation (100k iterations)
- Browser uses Web Crypto API, CLI uses Node.js `crypto`
- Same `.fjson` format -- files are interchangeable

### Encryption -- DB Mode (`js/db-crypto.js`)
- Separate crypto module for zero-knowledge database storage
- `deriveAuthPassword`: PBKDF2 (10k iter, email as salt) --> Supabase login password
- `deriveEncryptionKey`: PBKDF2 (100k iter, random salt) --> non-extractable AES-256-GCM key
- `recordHash`: SHA-256 opaque hash for record identity (salted per user)
- `encryptRecord`/`decryptRecord`: AES-256-GCM per-record encrypt/decrypt
- Auth password != encryption key -- compromising auth does not reveal data

### Database Service (`js/db-service.js`)
- Supabase CRUD wrapper -- the only module that touches the Supabase client
- Auth: `signUp` (returns `{user, session}`), `signIn`, `signOut`, `getSession`
- Vault: `getEncSalt`, `upsertVault` (deferred from sign-up to first sign-in)
- Records: `fetchAllRecords`, `upsertRecords`, `deleteRecords`

### Storage Manager (`js/storage-manager.js`)
- Unified interface over file and DB modes
- **Sign-up flow**: generates enc_salt; if no email confirmation, inserts vault immediately; otherwise stashes salt in localStorage for deferred insert on first sign-in
- **Sign-in flow**: authenticates, ensures vault exists (creates from pending salt if needed), derives encryption key
- **Load**: fetches encrypted records from Supabase (online) or IDB vault_cache (offline), decrypts client-side, reassembles into data shape
- **Save**: diff-based -- computes changed/deleted records, encrypts, upserts to Supabase (online) or queues to IDB pending_sync (offline)
- **Flush**: `flushPendingSync()` replays queued operations when back online
- Import/export between .fjson files and DB
- Mode persisted in localStorage (`fi_storage_mode`)

### Configuration (`js/config.js`)
- Supabase URL and anon key (safe to expose -- RLS protects data)

### File Manager (`js/file-manager.js`)
- File I/O via File System Access API (Chrome) or input/download fallback (Safari)
- Persistent directory handle in IDB for silent saves on Chrome
- **Session bridge**: `stashToSession`/`loadFromSession` encrypt data with a per-tab AES-256-GCM key before storing in sessionStorage. Key lives only in JS closure -- lost on tab close, making stale data unreadable.

### Cache (`js/data-cache.js`)
- IDB v3 with 4 object stores:
  - `cache`: file-mode session data, encrypted with per-tab AES key (unreadable after tab close)
  - `dir_handles`: Chrome directory handle (no financial data)
  - `vault_cache`: encrypted DB records (server-side AES-256-GCM ciphertext, needs passphrase to decrypt)
  - `pending_sync`: queued offline writes (already encrypted ciphertext)
- No plaintext financial data or passphrases stored in IDB

### Service Worker (`sw.js`)
- Cache version: v8
- Pre-caches app shell + CDN assets (Chart.js, Supabase JS, SheetJS)
- Supabase API calls (`*.supabase.co`) always pass through (never cached)
- CDN: stale-while-revalidate
- Local assets: cache-first

## Security Model

### Zero-Knowledge Guarantee
The server (Supabase) never sees plaintext financial data:

| What server stores | Format |
|-------------------|--------|
| `enc_salt` | Random 16-byte base64 (useless without passphrase) |
| `record_hash` | SHA-256 hex, salted per user (opaque identifier) |
| `iv` | Random 12-byte base64 (per-record nonce) |
| `data` | AES-256-GCM ciphertext (encrypted payload) |

### Key Derivation (from single passphrase)
```
passphrase + email  -->  PBKDF2 (10k iter)  -->  auth password (hex)  -->  sent to Supabase
passphrase + salt   -->  PBKDF2 (100k iter) -->  AES-256-GCM key      -->  never leaves client
```
- Different salts and iteration counts ensure independence
- Supabase further hashes the auth password with bcrypt server-side

### Local Storage Security
| Location | What's stored | Protection |
|----------|--------------|------------|
| Supabase | Hashes + ciphertext | Zero-knowledge, RLS per user |
| IDB `vault_cache` | Server ciphertext | AES-256-GCM (needs passphrase) |
| IDB `pending_sync` | Server ciphertext | AES-256-GCM (needs passphrase) |
| IDB `cache` | Session data | AES-256-GCM with ephemeral per-tab key |
| sessionStorage | Session stash | AES-256-GCM with ephemeral per-tab key |
| localStorage | Mode flag, panel state | No financial data |
| JS heap | Passphrase, CryptoKey | Cleared on tab close |

### What is NOT stored anywhere
- Plaintext passphrase (never persisted -- JS heap only)
- Plaintext financial data at rest (always encrypted)
- Encryption key material (non-extractable CryptoKey in Web Crypto API)

## Database Schema (Supabase)

See `supabase-schema.sql` for the full SQL. Two tables:

- `user_vaults`: `user_id` (PK), `enc_salt` (random 16-byte base64). Row created on first sign-in (deferred from sign-up to avoid RLS issues with email confirmation).
- `vault_records`: `user_id`, `record_hash` (opaque SHA-256 hex), `iv`, `data` (AES-256-GCM ciphertext). Unique on `(user_id, record_hash)`.

RLS policies ensure users can only access their own rows.

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

## Deployment

- **Hosted on**: GitHub Pages at `https://nabariho.github.io/fi-dashboard/`
- **Source**: `main` branch, root directory
- **Backend**: Supabase (free tier), project URL in `js/config.js`
- **Supabase config**: Authentication > URL Configuration > Site URL must be `https://nabariho.github.io/fi-dashboard/`
- **Service worker**: bump `CACHE_NAME` version on every deploy to bust cache
