# Roadmap v2 — Feature Expansion

Living document for the next wave of features, organized into 12 proposals.
Each feature has scope, data needs, files to create/modify, effort estimate, and dependencies.

Effort scale: **S** (1-2 hours) | **M** (3-5 hours) | **L** (6-10 hours) | **XL** (10+ hours)

---

## Feature 1: Monthly Summary — "What Changed?"

**Goal:** On dashboard open, immediately answer: "What happened this month?" without any clicking.

**What the user sees:**
- A collapsible panel between Goals and the tabs (or replacing the first screen)
- One-paragraph natural-language summary:
  > "Net worth grew +3.200 € (+1,8%) in Feb 2026. Market returns contributed +2.100 €, you saved +1.100 €. Emergency fund is fully funded. You're 2 months ahead of your End of 2026 milestone."
- Below the paragraph: 4 compact cards — NW Change | Savings This Month | Best Account | Worst Account
- Delta arrows showing direction vs previous month

**Data needs:**
- Current month vs previous month NW (already in `NetWorthCalculator.computeMoM`)
- Contribution vs market split (need: total contribution this month vs total value change)
- Per-account changes (loop `nwData` last two months)
- Milestone status (already in `MilestoneCalculator`)
- Goal statuses (already in `GoalsCalculator`)

**Files:**
| File | Action | What |
|------|--------|------|
| `js/data/summary-calc.js` | NEW | `computeMonthlySummary(nwData, goals, milestones, mortgage)` → structured summary object |
| `js/ui/ui-summary.js` | NEW | `renderMonthlySummary(summary)` → paragraph + cards |
| `js/app.js` | MODIFY | Add `refreshSummary()`, call in `showDashboard()` |
| `index.html` | MODIFY | Add `#summaryPanel` collapsible div between goals and tabs |
| `css/styles.css` | MODIFY | Summary panel styles |

**Effort:** M

**Dependencies:** None — uses existing calculators.

---

## Feature 2: Savings Rate Trend

**Goal:** Show savings rate over time, compare actual savings vs budget plan, and surface the gap.

**What the user sees:**
- New section in the Investments tab (or a dedicated sub-panel in FI Progress)
- Line chart: trailing savings rate (3M, 6M, 12M rolling windows)
- Overlay: horizontal line at budgeted savings rate (income - expenses from budget)
- Below the chart: "Planned: 1.336 €/mo | Actual (12M avg): 1.102 €/mo | Gap: -234 €/mo"
- Impact callout: "Closing this gap would shave 1.2 years off your FI date"

**Data needs:**
- Monthly contributions per month (already in `allData` aggregated by `DataService`)
- Monthly income (from `appConfig.monthly_income`)
- Monthly budget total (from `BudgetCalculator.computeMonthlyBudget`)
- Per-month savings rate = contributions / income (new calculation)
- Rolling averages (new helper in `data-service.js` or `fi-calc.js`)

**Files:**
| File | Action | What |
|------|--------|------|
| `js/data/fi-calc.js` | MODIFY | Add `savingsRateSeries(monthlyData, income)` → `[{month, rate, contribution}]` |
| `js/data/fi-calc.js` | MODIFY | Add `savingsGapImpact(actualSavings, plannedSavings, currentNW, fiTarget, annualReturn)` |
| `js/ui/ui-metrics.js` | MODIFY | Add `renderSavingsRateTrend(series, planned, gap)` |
| `js/ui/ui-charts.js` | MODIFY | Add `renderSavingsChart(canvasId, series, planned)` |
| `js/app.js` | MODIFY | Wire into FI Progress panel or Investments tab |
| `index.html` | MODIFY | Add chart canvas + container |
| `css/styles.css` | MODIFY | Savings trend styles |

**Effort:** M

**Dependencies:** None.

---

## Feature 3: What-If Scenario Simulator

**Goal:** Interactive panel to explore "what happens if I change X?" — savings rate, return rate, one-off contributions, extra mortgage payments. No data persistence; pure exploration.

**What the user sees:**
- New tab "Simulator" (or a modal/slide-out panel accessible from FI Progress)
- Input sliders/fields:
  - Monthly savings (default: current average)
  - Expected annual return (default: from config)
  - One-off contribution (default: 0)
  - Extra mortgage payment (default: 0, only if mortgage exists)
- Live-updating outputs:
  - Years to FI (number + delta vs current)
  - Projected FI date
  - Total interest saved (mortgage, if applicable)
  - Chart: current projection vs modified projection (two lines)
- Preset scenarios: "Aggressive Saver", "Market Downturn", "Early Mortgage Payoff"

**Data needs:**
- Current NW, savings rate, config (already available)
- `FICalculator.projectFuture()` already exists — run it with modified inputs
- `MortgageCalculator.computeSummary()` with modified extra payments

**Files:**
| File | Action | What |
|------|--------|------|
| `js/data/simulator-calc.js` | NEW | `runScenario(params)` → `{yearsToFI, fiDate, projection, mortgageSummary}`. Wraps FI + Mortgage calculators with overridden inputs |
| `js/ui/ui-simulator.js` | NEW | Full simulator UI: input controls, live chart, result cards |
| `js/app.js` | MODIFY | Add `refreshSimulator()`, tab handler |
| `index.html` | MODIFY | Simulator tab button + content div + canvas |
| `css/styles.css` | MODIFY | Simulator styles (sliders, input group, comparison cards) |

**Effort:** L

**Dependencies:** Mortgage module (Phase 4, already done).

---

## Feature 4: Month-over-Month Anomaly Alerts

**Goal:** When viewing data, surface unusual changes — both to catch data entry errors and to provide context on volatile months.

**What the user sees:**
- Alert banner at the top of the Monthly Summary (Feature 1) or on the Quick Add confirmation
- Alerts like:
  - "⚠ INDEXA dropped -12.3% — largest monthly drop in your history"
  - "⚠ BBVA balance is 0.00 — was this intentional?"
  - "⚠ MYINVESTOR contribution of 15.000 € is 5x your average — double check?"
  - "✓ All accounts within normal range"
- In Admin Quick Add: inline warnings next to each row before saving

**Data needs:**
- Per-account historical statistics: mean, stddev of monthly changes and contributions
- Current month vs historical range
- Zero-balance detection

**Files:**
| File | Action | What |
|------|--------|------|
| `js/data/anomaly-calc.js` | NEW | `detectAnomalies(allData, latestMonth)` → `[{account, type, message, severity}]` |
| `js/ui/ui-summary.js` | MODIFY | Add alert banner rendering (or new `ui-alerts.js`) |
| `js/admin.js` | MODIFY | Show inline warnings in Quick Add before save |
| `css/styles.css` | MODIFY | Alert banner styles (warning/info) |

**Effort:** M

**Dependencies:** Best combined with Feature 1 (Monthly Summary) but can stand alone.

---

## Feature 5: Asset Allocation Tracking

**Goal:** Show current allocation (stocks vs cash vs house equity), compare to a target, and suggest rebalancing.

**What the user sees:**
- New section in the Net Worth tab (or its own panel)
- Donut/pie chart: current allocation by asset class (Investments, Cash, House Equity)
- Target allocation bar (configurable, e.g., 80% investments / 20% cash)
- Drift indicator: "You're 5% overweight in cash — consider moving 4.500 € to investments"
- Historical allocation chart: stacked % area over time (how allocation shifted)

**Data needs:**
- Asset class per account (already have `type: Broker|Cash`; need to treat house equity as its own class)
- Target allocation (new config values: `target_allocation_investments`, `target_allocation_cash`, etc.)
- Current values by class (from latest NW row)
- Historical values by class (from all NW rows)

**Files:**
| File | Action | What |
|------|--------|------|
| `js/data/allocation-calc.js` | NEW | `computeAllocation(nwRow, mortgage)` → `{classes: [{name, value, pct}], total}` |
| `js/data/allocation-calc.js` | NEW | `computeDrift(current, target)` → `[{class, currentPct, targetPct, drift, amountToRebalance}]` |
| `js/data/allocation-calc.js` | NEW | `computeHistoricalAllocation(nwData)` → `[{month, investments_pct, cash_pct, house_pct}]` |
| `js/ui/ui-charts.js` | MODIFY | Add `renderAllocationPie(canvasId, allocation)` and `renderAllocationHistory(canvasId, history)` |
| `js/ui/ui-tables.js` or inline | MODIFY | Drift table/cards |
| `js/app.js` | MODIFY | Wire into Net Worth tab |
| `index.html` | MODIFY | Add containers + canvases |
| `css/styles.css` | MODIFY | Allocation section styles |

**Effort:** M

**Dependencies:** Mortgage module (for house equity class).

---

## Feature 6: Tax Year Summary

**Goal:** Generate a yearly summary for Spanish IRPF tax filing — total contributions, per-account flows, and key numbers.

**What the user sees:**
- New section in the Goals tab or its own tab
- Year selector dropdown (default: previous completed year)
- Summary cards: Total Contributed | Total Withdrawn | Net Contributions | NW Start → End | Growth
- Per-account table: Account | Start Value | End Value | Contributions | Withdrawals | Net Flow
- "Copy to clipboard" button for pasting into a spreadsheet
- Notes about what to report (informational, not tax advice)

**Data needs:**
- Per-account, per-month contributions for the selected year (already in `allData`)
- Withdrawals = negative contributions (sign convention already in data)
- Start-of-year and end-of-year balances per account

**Files:**
| File | Action | What |
|------|--------|------|
| `js/data/tax-calc.js` | NEW | `computeYearSummary(allData, accountsConfig, year)` → `{total, perAccount: [...], startNW, endNW}` |
| `js/ui/ui-tax.js` | NEW | `renderTaxSummary(summary, year)` — cards + table + copy button |
| `js/app.js` | MODIFY | Add to Goals tab or new tab, year selector handler |
| `index.html` | MODIFY | Container div, year selector |
| `css/styles.css` | MODIFY | Tax summary styles |

**Effort:** M

**Dependencies:** None.

---

## Feature 7: Recurring Transactions / Auto-Fill

**Goal:** Speed up monthly data entry by pre-filling expected values based on historical patterns.

**What the user sees:**
- In Quick Add Month, each account row shows:
  - Last month's value (already exists)
  - **Predicted value** (last month + average monthly change)
  - **Predicted contribution** (average of last 3 months' contributions)
- "Auto-fill predictions" button fills all empty fields with predictions
- User overrides any field that differs
- Visual indicator: light blue background on auto-filled cells (clears on edit)

**Data needs:**
- Last 3-6 months of per-account changes and contributions (already in `allData`)
- Simple average prediction (not sophisticated — just recent trend)

**Files:**
| File | Action | What |
|------|--------|------|
| `js/admin.js` | MODIFY | Add prediction calculation in `renderMonthEnd()`, auto-fill button, prediction display |
| `css/admin.css` | MODIFY | Auto-filled cell indicator styles |

**Effort:** S

**Dependencies:** None. Pure admin enhancement.

---

## Feature 8: Net Worth by Asset Type Over Time

**Goal:** Replace or supplement the per-account NW stacked chart with an asset-class view: Investments vs Cash vs House Equity vs Mortgage Debt.

**What the user sees:**
- Toggle on the NW chart: "By Account" (current) | "By Asset Class"
- Asset class view: stacked area with 3-4 bands:
  - Investments (brokers) — blue
  - Cash (bank) — green
  - House Equity (market value - mortgage) — purple (only if mortgage exists)
- Net total line on top
- Mortgage debt shown as negative area below zero (optional, or just excluded and equity shown as net)

**Data needs:**
- Already computed in `NetWorthCalculator.compute()` — `row.investments`, `row.bank`, `row.house_equity`
- Just need to reshape for the chart

**Files:**
| File | Action | What |
|------|--------|------|
| `js/ui/ui-charts.js` | MODIFY | Add `renderNetWorthByClass(canvasId, legendId, data)` |
| `js/app.js` | MODIFY | Toggle handler, pass class-level data to chart |
| `index.html` | MODIFY | Add toggle buttons to NW chart header |
| `css/styles.css` | MODIFY | Toggle styles (reuse `.view-toggle`) |

**Effort:** S

**Dependencies:** Mortgage module (for house equity data, gracefully absent if no mortgage).

---

## Feature 9: Multi-Currency Support

**Goal:** Handle accounts in different currencies (USD, GBP) with manual monthly FX rates.

**What the user sees:**
- Accounts config: currency field already exists (e.g., `"EUR"`, `"USD"`)
- New data field: `fx_rates` in the data file — monthly exchange rates to EUR
  ```json
  "fx_rates": [
    { "month": "2026-01", "currency": "USD", "rate_to_eur": 0.92 }
  ]
  ```
- In Quick Add: non-EUR accounts show a "Rate to EUR" input field
- All NW/returns calculations convert to EUR using the month's FX rate
- Display: account values shown in native currency with EUR equivalent

**Data needs:**
- FX rate table (new data structure)
- Conversion logic in `NetWorthCalculator.compute()` and `ReturnsCalculator.compute()`

**Files:**
| File | Action | What |
|------|--------|------|
| `js/data/fx-service.js` | NEW | `convert(amount, currency, month, fxRates)`, `getRate(currency, month, fxRates)` |
| `js/data/networth-calc.js` | MODIFY | Apply FX conversion before summing |
| `js/data/returns-calc.js` | MODIFY | Convert values before computing returns |
| `js/admin.js` | MODIFY | FX rates section (or inline in Quick Add), new admin tab or section |
| `js/app.js` | MODIFY | Pass `fxRates` to calculators |
| `admin.html` | MODIFY | FX rates editor |

**Effort:** L

**Dependencies:** None, but touches core calculation paths — higher risk.

---

## Feature 10: Monthly Notes / Journal

**Goal:** Attach a note to each month explaining significant events, visible as context on charts and tables.

**What the user sees:**
- In Admin Quick Add: a "Month Notes" textarea at the top (one note per month, not per account)
- On the dashboard NW chart: small dot markers on months that have notes; hover shows the note
- On the NW breakdown table: notes column or expandable row
- On the Monthly Summary (Feature 1): current month's note displayed prominently

**Data needs:**
- New data structure: `month_notes` array
  ```json
  "month_notes": [
    { "month": "2026-03", "note": "Paid arras deposit for apartment" }
  ]
  ```

**Files:**
| File | Action | What |
|------|--------|------|
| `js/admin.js` | MODIFY | Add notes textarea to Quick Add, notes CRUD |
| `js/ui/ui-charts.js` | MODIFY | Add annotation plugin or point markers for noted months |
| `js/ui/ui-tables.js` | MODIFY | Show notes in NW breakdown |
| `js/app.js` | MODIFY | Pass notes data to renderers |
| `index.html` | MODIFY | (minor — tooltip styling if needed) |

**Effort:** M

**Dependencies:** None. Enhanced by Feature 1 (Monthly Summary).

---

## Feature 11: Printable Annual Report

**Goal:** Generate a clean, printable summary of the year — suitable for personal records or sharing with a partner/advisor.

**What the user sees:**
- Button in the hamburger menu: "Annual Report"
- Opens a new page (or print-optimized view) with:
  - Year title + date range
  - Key metrics: Start NW → End NW, Growth %, Savings Rate, Passive Income
  - NW evolution chart (static image or print-friendly)
  - Monthly returns grid
  - Goal progress summary
  - Milestone status
  - Account-by-account breakdown table
  - Mortgage summary (if applicable)
- "Print" button (triggers `window.print()`)
- Clean, minimal CSS with `@media print` rules

**Files:**
| File | Action | What |
|------|--------|------|
| `report.html` | NEW | Standalone page with print-optimized layout |
| `js/report.js` | NEW | Loads data, computes yearly stats, renders static HTML |
| `css/report.css` | NEW | Print-first CSS (`@media print`, page breaks, no interactive elements) |
| `index.html` | MODIFY | Add "Annual Report" link to hamburger menu |

**Effort:** L

**Dependencies:** None, but benefits from Features 6 (Tax Summary) and 2 (Savings Rate).

---

## Feature 12: Mobile-Optimized Quick Add

**Goal:** Streamlined input flow for entering monthly data on a phone — minimal tapping, large touch targets.

**What the user sees:**
- When Admin is opened on mobile (< 480px), Quick Add transforms:
  - One account at a time (card-based flow, not a table)
  - Large input fields, big "Next" button
  - Swipe or tap to advance to next account
  - Running total shown at bottom: "3 of 6 accounts entered"
  - Last month's value displayed prominently for reference
  - "Done" button at the end saves all
- Progress indicator at top (dots or bar)
- Auto-focus on the end value input for each card

**Data needs:**
- Same data as current Quick Add — just different UI for small screens

**Files:**
| File | Action | What |
|------|--------|------|
| `js/admin.js` | MODIFY | Add mobile detection, `renderMobileQuickAdd()` with card-by-card flow |
| `css/admin.css` | MODIFY | Mobile card styles, swipe animations, progress indicator |
| `admin.html` | MODIFY | (minor — container for mobile flow) |

**Effort:** M

**Dependencies:** None.

---

## Priority Matrix

| # | Feature | Effort | Impact | Frequency of Use | Risk |
|---|---------|--------|--------|-------------------|------|
| 1 | Monthly Summary | M | **High** | Every open | Low |
| 2 | Savings Rate Trend | M | **High** | Weekly | Low |
| 3 | What-If Simulator | L | **High** | Monthly decisions | Low |
| 4 | Anomaly Alerts | M | **High** | Monthly entry | Low |
| 7 | Auto-Fill Quick Add | S | **Medium** | Monthly entry | Low |
| 8 | NW by Asset Class | S | **Medium** | Weekly | Low |
| 5 | Asset Allocation | M | **Medium** | Monthly | Low |
| 10 | Monthly Notes | M | **Medium** | Monthly entry | Low |
| 6 | Tax Year Summary | M | **Medium** | Yearly | Low |
| 12 | Mobile Quick Add | M | **Medium** | Monthly entry | Low |
| 11 | Annual Report | L | **Low** | Yearly | Low |
| 9 | Multi-Currency | L | **Low** | Setup once | **Medium** (core calc changes) |

---

## Suggested Implementation Waves

### Wave A — "Make opening the app rewarding" (Effort: ~M+M+S = 8-12h)
1. **Feature 1: Monthly Summary** — instant value on every open
2. **Feature 4: Anomaly Alerts** — catches errors and gives context
3. **Feature 7: Auto-Fill Quick Add** — fastest monthly workflow

### Wave B — "Understand your trajectory" (Effort: ~M+S+M = 8-12h)
4. **Feature 2: Savings Rate Trend** — plan vs reality gap
5. **Feature 8: NW by Asset Class** — see the big picture
6. **Feature 5: Asset Allocation** — rebalancing awareness

### Wave C — "Plan and decide" (Effort: ~L = 6-10h)
7. **Feature 3: What-If Simulator** — explore decisions before committing

### Wave D — "Record and reflect" (Effort: ~M+M+M = 9-15h)
8. **Feature 10: Monthly Notes** — context preservation
9. **Feature 6: Tax Year Summary** — annual tax convenience
10. **Feature 12: Mobile Quick Add** — mobile-first entry

### Wave E — "Polish and expand" (Effort: ~L+L = 12-20h)
11. **Feature 11: Annual Report** — yearly reflection
12. **Feature 9: Multi-Currency** — international accounts

---

## File Impact Summary

| File | Features that touch it |
|------|----------------------|
| `js/app.js` | 1, 2, 3, 5, 8, 9, 10 |
| `js/admin.js` | 4, 7, 9, 10, 12 |
| `index.html` | 1, 2, 3, 5, 8 |
| `css/styles.css` | 1, 2, 3, 4, 5, 6, 8 |
| `js/data/fi-calc.js` | 2 |
| `js/data/networth-calc.js` | 9 |
| `js/ui/ui-charts.js` | 2, 5, 8, 10 |
| `js/ui/ui-metrics.js` | 2 |
| `js/ui/ui-tables.js` | 10 |

**New files per wave:**
- Wave A: `summary-calc.js`, `ui-summary.js`, `anomaly-calc.js` (3 files)
- Wave B: `allocation-calc.js` (1 file)
- Wave C: `simulator-calc.js`, `ui-simulator.js` (2 files)
- Wave D: `tax-calc.js`, `ui-tax.js` (2 files)
- Wave E: `report.html`, `report.js`, `report.css`, `fx-service.js` (4 files)
