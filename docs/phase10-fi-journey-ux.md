# Phase 10: FI Journey UX & Accounting Accuracy

**Status:** Complete (Step 4b/4d deferred — EF merge into Goals + expandable cards)
**Priority:** Highest — transforms the dashboard from a data viewer into an FI journey companion

**Goal:** Reorganize the dashboard around the user's FI journey, fix critical accounting gaps (inflation, taxes), and add the missing features that turn data into actionable guidance.

---

## Problem Statement

The dashboard is organized around **data types** (investments, net worth, budget, cash flow) rather than the **FI journey** (earn → save → invest → grow → achieve goals → reach FI). Key issues:

1. **Accounting is nominal** — inflation is invisible, making every projection optimistic. A €1M target in 12 years requires ~€1.43M in nominal terms at 3% inflation.
2. **No home view** — users land on whatever tab they last visited. The monthly question "How did I do? What's next?" requires visiting 3+ tabs.
3. **Goals are fragmented** — goal info spans Goals panel, Goals tab, Cash Flow tab, and Planning tab.
4. **Budget is disconnected** — shows planned expenses with no link to actuals. A dead-end tab.
5. **Savings rate is invisible** — the single most controllable FI metric has no trend visualization.
6. **Passive income ignores taxes** — €2,500/mo expenses need ~€3,200/mo gross withdrawal in Spain (19-26% capital gains tax).
7. **No journey timeline** — no single visualization showing "you are HERE, goals complete at these dates, FI at this date."

---

## Step 1: Inflation-Adjusted FI Projections

**Impact:** Critical — without this, every projection is wrong.
**Effort:** Low

### 1a. New config parameters

Add to `appConfig`:
- `inflation_rate`: number (default 0.03 = 3%)
- `tax_rate_withdrawals`: number (default 0.20 = 20%, Spanish capital gains midpoint)

### 1b. Real vs nominal FI calculations

Modify `fi-calc.js`:
- `real_return = expected_return - inflation_rate` (Fisher approximation)
- `years_to_fi_real`: compound projection using real return
- `fi_target_nominal(years)`: `fi_target * (1 + inflation_rate)^years` — what the target actually is in future euros
- `passive_income_net`: `passive_income * (1 - tax_rate_withdrawals)` — after-tax monthly income
- Keep existing nominal calculations alongside for comparison

### 1c. Derived FI target validation

Compute `derived_fi_target = (annual_expenses / withdrawal_rate) / (1 - tax_rate_withdrawals)`.
If this diverges >10% from the manual `fi_target`, surface a warning in the FI Progress panel.

### 1d. UI updates

Modify `ui-metrics.js` FI Progress panel:
- Show passive income as "€X/mo (€Y after tax)"
- Show years to FI as "~N years (inflation-adjusted)" — use the real calculation
- Add small text: "Target in today's euros: €1M | In future euros: €1.43M"

### Files changed

| File | Action | Changes |
|------|--------|---------|
| `js/data/fi-calc.js` | EDIT | Add real return, inflation-adjusted projections, tax-aware passive income, derived FI target |
| `js/ui/ui-metrics.js` | EDIT | Show inflation-adjusted years, after-tax passive income, derived target warning |
| `js/app.js` | EDIT | Pass new config params to FI calculator |
| `tests/test-calculators.js` | EDIT | Add inflation + tax tests for FICalculator |

---

## Step 2: Savings Rate Trend

**Impact:** High — the most controllable metric, currently a single number.
**Effort:** Low

### 2a. Compute trailing savings rate series

Modify `savings-capacity-calc.js` or `fi-calc.js`:
- `computeSavingsRateTrend(allData, cashflowEntries, config, numMonths)` → `[{ month, savingsRate, dataSource }]`
- Uses actual data when available, derived otherwise
- Returns last 12 months

### 2b. Sparkline in FI Progress panel

Add a small sparkline (Chart.js line, ~80x30px) next to the savings rate metric in the FI Progress panel. Green if trending up, red if trending down.

### 2c. Detailed savings rate chart

In the Cash Flow tab, add a savings rate line chart (12 months) showing the trend with a horizontal target line (e.g., 50% savings rate goal — could be a config param or derived from goal requirements).

### Files changed

| File | Action | Changes |
|------|--------|---------|
| `js/data/fi-calc.js` | EDIT | Add `computeSavingsRateTrend()` |
| `js/ui/ui-metrics.js` | EDIT | Savings rate sparkline |
| `js/ui/ui-cashflow.js` | EDIT | Savings rate trend chart |
| `js/app.js` | EDIT | Compute and pass trend data |
| `tests/test-calculators.js` | EDIT | Trend calculation tests |

---

## Step 3: "This Month" Home View

**Impact:** High — transforms the monthly review experience.
**Effort:** Medium

### 3a. New tab: "This Month" (default, first tab)

A single-page monthly review that answers: "How did I do? What changed? What should I focus on?"

**Sections (top to bottom):**

1. **Headline metric**: Net worth change this month (amount + %)
2. **Change attribution**: Compact breakdown — "Savings: +€1,200 | Market: +€800 | Debt paydown: +€400"
3. **Goal progress bars**: Compact horizontal bars for each active goal (current/target), with "this month" delta
4. **Recommended actions** (top 3): Moved from Planning tab — color-coded, actionable
5. **Savings rate sparkline**: Last 6 months, current highlighted
6. **FI impact**: "This month moved you X months closer to FI" or "You're now Y% of the way"
7. **Key numbers grid**: Income, expenses, savings, investment return — 4 compact cards

### 3b. Summary calculator enhancements

Modify `summary-calc.js`:
- `computeMonthImpact()`: How many months closer to FI this month earned
- `computeChangeAttribution()`: Savings vs market vs debt paydown breakdown
- Reuse existing anomaly detection

### 3c. New renderer

New file `js/ui/ui-home.js`:
- `HomeRenderer.render(summaryData, goalPlan, actions, savingsRateTrend, fiImpact)`
- Compact, card-based layout
- Goal bars use same color scheme as Goals tab

### 3d. Navigation update

- "This Month" becomes tab 1 (default on load)
- Existing tabs shift right
- Tab order: This Month | Investments | Net Worth | Goals | Cash Flow | Mortgage

### Files changed

| File | Action | Changes |
|------|--------|---------|
| `js/ui/ui-home.js` | NEW | Home tab renderer |
| `js/data/summary-calc.js` | EDIT | FI impact, change attribution |
| `js/app.js` | EDIT | New `refreshHome()`, default tab logic |
| `index.html` | EDIT | New tab button + content div, script tag |
| `sw.js` | EDIT | Add new file to cache |
| `tests/test-calculators.js` | EDIT | Summary calc new method tests |

---

## Step 4: Unified Goals Tab

**Impact:** High — eliminates fragmentation across 3+ tabs.
**Effort:** Medium

### 4a. Merge Goals + Planning into one dashboard tab

The current split:
- **Goals tab**: EF + house detail, glide paths
- **Planning tab**: funding plan, actions, FI timeline, milestones

Merge into one **"Goals"** tab with sections:

1. **FI Journey Timeline** (visual): Horizontal timeline showing current date, each goal's projected completion, FI date
2. **Goal Cards**: One card per active goal with: progress bar, current/target, monthly allocation, confidence badge, glide path mini-chart, projected completion
3. **Funding Summary**: Total available → total required → surplus/deficit (compact, was the full table)
4. **Account Ledger** (collapsible): Per-account integrity check (for power users)
5. **Recommended Actions** (also shown on This Month tab)

### 4b. Emergency Fund as a goal card

EF is no longer a separate tab — it becomes a goal card with an expandable detail view. The detail shows the existing EF metrics: coverage months, dedicated/backup breakdown, funding history chart.

The Emergency Fund tab is removed from the main tab bar but its content is accessible via "View Details" on the EF goal card.

### 4c. FI Journey Timeline visualization

New chart in `ui-charts.js`:
- Horizontal timeline (X = dates from now to FI)
- Markers for each goal's projected completion
- Shaded regions: "on track" (green) vs "at risk" (orange) vs "delayed" (red)
- Current date marker
- FI date marker (prominent)

### 4d. Goal detail expandable cards

Each goal card expands to show:
- Glide path chart (actual vs expected trajectory)
- Monthly funding history (last 6 months)
- Funding accounts and their balances
- Confidence explanation

### Files changed

| File | Action | Changes |
|------|--------|---------|
| `js/ui/ui-goals.js` | REWRITE | Goal cards with expandable detail, EF detail view |
| `js/ui/ui-planner.js` | MERGE into ui-goals.js | Funding summary, account ledger, actions move to unified tab |
| `js/ui/ui-charts.js` | EDIT | Add FI journey timeline chart |
| `js/app.js` | EDIT | Merge `refreshGoalsTab()` + `refreshPlanning()` into unified `refreshGoals()` |
| `index.html` | EDIT | Remove Planning tab, update Goals tab content |
| `js/ui/ui-emergency.js` | EDIT | Adapt for inline display within goal card |

---

## Step 5: Merge Budget into Cash Flow ✅ DONE

**Impact:** Medium — eliminates a dead-end tab.
**Effort:** Low

### 5a. Budget summary as Cash Flow section

Move budget overview into Cash Flow tab as the first section: "Monthly Budget" showing fixed vs variable totals with category breakdown.

### 5b. Budget-vs-actual as primary view

When actual data exists for a month, show budget-vs-actual as the default view (not hidden in a sub-section). This is the most actionable view in Cash Flow.

### 5c. Remove standalone Budget tab

Budget editing remains in Admin. The dashboard Budget tab is removed; its content lives in Cash Flow.

### 5d. Budget staleness alert

If trailing 3-month actual expenses average >15% deviation from budget, show a warning: "Your budget may be outdated — actual expenses averaged €X vs planned €Y."

### Files changed

| File | Action | Changes |
|------|--------|---------|
| `js/ui/ui-cashflow.js` | EDIT | Add budget summary section, promote budget-vs-actual, staleness alert |
| `js/ui/ui-budget.js` | DELETE or GUT | Content moves to Cash Flow |
| `js/app.js` | EDIT | Merge `refreshBudget()` into `refreshCashFlow()` |
| `index.html` | EDIT | Remove Budget tab |

---

## Step 6: Coast FI ✅ DONE

**Impact:** Medium — powerful motivational milestone.
**Effort:** Low

### 6a. New config parameters

Add to `appConfig`:
- `birth_year`: number (e.g., 1993)
- `target_retirement_age`: number (default 55)

### 6b. Coast FI calculation

Add to `fi-calc.js`:
- `coastFI = fi_target / (1 + real_return)^years_to_retirement`
- `coastFI_reached`: boolean (current NW >= coastFI)
- `coastFI_pct`: current NW / coastFI * 100

### 6c. UI integration

In FI Progress panel, when Coast FI is reached:
- Show badge: "Coast FI reached — compound growth alone will reach your target by age [X]"
- If not reached: show Coast FI amount and progress toward it

### Files changed

| File | Action | Changes |
|------|--------|---------|
| `js/data/fi-calc.js` | EDIT | Coast FI calculation |
| `js/ui/ui-metrics.js` | EDIT | Coast FI badge/metric |
| `js/app.js` | EDIT | Pass Coast FI data |
| `tests/test-calculators.js` | EDIT | Coast FI tests |

---

## Step 7: What-If Scenario Planning ✅ DONE

**Impact:** Medium — enables exploration without config changes.
**Effort:** Medium

### 7a. Interactive "What If" panel

Accessible from a button on the FI Progress panel or the Goals tab. Opens a modal/overlay with sliders:

- Monthly savings: ±€500 from current
- Expected return: 3%-10% slider
- Monthly income: ±€1000 from current
- Inflation rate: 1%-5% slider

### 7b. Real-time impact calculation

As sliders move, instantly recalculate:
- Years to FI (nominal and real)
- Per-goal projected completion dates
- Savings rate
- Coast FI status

Uses `fi-calc.js` functions with overridden parameters (no persistence).

### 7c. Scenario comparison

Show "Current" vs "What If" side by side:
- "Save €200 more/mo → FI 3 years earlier (2039 vs 2042)"
- "7% return instead of 5% → FI 5 years earlier"

### Files changed

| File | Action | Changes |
|------|--------|---------|
| `js/ui/ui-whatif.js` | NEW | What-if modal renderer with sliders |
| `js/data/fi-calc.js` | EDIT | Parameterized projection function (accept overrides) |
| `js/app.js` | EDIT | What-if button binding, modal lifecycle |
| `index.html` | EDIT | Modal HTML, script tag |
| `sw.js` | EDIT | Add new file to cache |

---

## Step 8: Income Growth & Tax-Aware Planning ✅ DONE

**Impact:** Medium — more realistic projections.
**Effort:** Low

### 8a. Track income over time

Derive income trend from cashflow entries (Salary category over months). Compute:
- `income_growth_rate`: annualized growth from trailing data
- `income_trend`: array of monthly income values

### 8b. Income growth in FI projections

Modify `fi-calc.js` years-to-FI calculation:
- Option to use `income_growth_rate` in projection (savings increase as income grows, assuming expense ratio stays constant)
- Shows more optimistic FI date for users with growing income

### 8c. Tax-aware FI target

Already partially covered in Step 1 (`tax_rate_withdrawals`). Additionally:
- Show "Required portfolio at FI" = `annual_expenses / (withdrawal_rate * (1 - tax_rate))` in the FI panel
- If this differs from manual `fi_target`, surface it

### Files changed

| File | Action | Changes |
|------|--------|---------|
| `js/data/fi-calc.js` | EDIT | Income growth projection, tax-aware target |
| `js/data/cashflow-calc.js` | EDIT | `computeIncomeTrend()` for growth rate |
| `js/ui/ui-metrics.js` | EDIT | Tax-aware FI info |
| `tests/test-calculators.js` | EDIT | Income growth + tax tests |

---

## Step 9: Year-over-Year Review ✅ DONE

**Impact:** Medium — strategic patterns emerge at yearly scale.
**Effort:** Medium

### 9a. Annual aggregation calculator

New function in `summary-calc.js` or new `annual-calc.js`:
- Per year: total NW change, total saved, total market returns, savings rate, goal completions
- Year-over-year delta for each metric

### 9b. Year in Review view

Accessible from a filter/dropdown on the This Month tab (or a dedicated sub-view):
- Year vs prior year comparison cards
- Annual NW growth chart
- Annual savings vs market returns (stacked)
- Goals achieved during the year
- Expense category comparison YoY

### Files changed

| File | Action | Changes |
|------|--------|---------|
| `js/data/summary-calc.js` | EDIT | Annual aggregation |
| `js/ui/ui-home.js` | EDIT | Year review view (or new renderer) |
| `js/app.js` | EDIT | Year review data flow |

---

## Step 10: Tab Restructure (Final) ✅ DONE

After all steps above, the final tab structure:

| Tab | Content | Replaces |
|-----|---------|----------|
| **This Month** | Monthly review, actions, FI impact | (new, default) |
| **Investments** | Portfolio performance, returns, comparison | (unchanged) |
| **Net Worth** | Assets, liabilities, composition | (unchanged) |
| **Goals** | Unified: timeline, goal cards, funding, EF detail, ledger | Goals + Planning + Emergency Fund |
| **Cash Flow** | Income/expenses, budget vs actual, trends, savings rate | Cash Flow + Budget |
| **Mortgage** | Amortization, equity, payments | (unchanged, conditional) |

Reduced from 7 tabs to 5-6 (mortgage conditional). Organized around the journey, not data types.

---

## Implementation Order

Steps are ordered by dependency and impact:

1. ~~**Step 1** (Inflation + taxes)~~ — **DONE**. Added `inflation_rate`, `tax_rate_withdrawals` config params. FI calc: `realReturn`, `yearsToFIReal`, `passiveIncomeNet`, `derivedFITarget`, `fiTargetNominal`. UI: inflation-adjusted years, after-tax passive income, derived target warning, nominal future target display. 5 new tests.
2. ~~**Step 2** (Savings rate trend)~~ — **DONE**. Added `savingsRateTrend()` to FICalculator. Sparkline in FI Progress panel (green if trending up, red if down). 2 new tests.
3. ~~**Step 3** (This Month home)~~ — **DONE**. New "This Month" tab (default, first tab). Shows NW change headline, attribution (savings vs market), goal progress bars, recommended actions (top 3), key numbers (FI impact, progress, savings, market returns, savings rate). New `ui-home.js` renderer + CSS. `computeFIImpact()` in SummaryCalculator. 3 new tests.
4. ~~**Step 4** (Unified Goals)~~ — **PARTIAL**. Added FI Journey Timeline visualization to Goals tab (visual bar with goal completion markers + FI date). EF merge into Goals (4b) and expandable goal cards (4d) deferred for separate iteration.
5. ~~**Step 5** (Merge Budget into Cash Flow)~~ — **DONE**. Budget summary + budget-vs-actual table rendered inline in Cash Flow tab. Budget staleness alert (>15% deviation). Standalone Budget tab removed. `expensesByCategory` passed through hybrid monthly data.
6. ~~**Step 6** (Coast FI)~~ — **DONE**. `coastFI()` and `coastFIAnalysis()` in fi-calc.js. Coast FI stat in FI Progress panel (reached badge or progress %). 3 new tests.
7. ~~**Step 7** (What-if scenarios)~~ — **DONE**. New `ui-whatif.js` modal with 4 sliders (savings, return, inflation, income). Real-time comparison table (current vs what-if) with FI date, savings rate, Coast FI. Insight text summarizes impact.
8. ~~**Step 8** (Income growth + tax planning)~~ — **DONE**. `computeIncomeTrend()` in cashflow-calc.js derives annualized growth rate. `yearsToFIWithGrowth()` in fi-calc.js. Income growth note in FI Progress. Growth rate passed to What-If. 4 new tests.
9. ~~**Step 9** (Year-over-year review)~~ — **DONE**. `computeAnnualSummaries()` in summary-calc.js. Year-over-Year comparison table in This Month tab (NW, savings, market, income, expenses). 1 new test.
10. ~~**Step 10** (Final tab restructure)~~ — **DONE**. Tab order: This Month, Investments, Net Worth, Goals, Cash Flow, Emergency Fund, Mortgage. EF kept as separate tab (merge into Goals deferred to Step 4b).

Steps 1-2 can be implemented independently. Steps 3-5 involve tab restructuring and should be done in sequence. Steps 6-9 are independent of each other.

---

## Verification

After each step:
1. All existing tests pass in `tests/test-runner.html`
2. New tests added for new/modified calculators
3. Manual verification on local server
4. Documentation updated (CLAUDE.md, architecture.md, business-requirements.md)

After full implementation:
- Opening the dashboard immediately answers "How am I doing?"
- Goals are in one place with consistent status
- FI projections account for inflation and taxes
- The savings rate trend is visible and motivating
- Actions tell the user what to do, not just what happened
- Budget and actuals are compared in the same view
