# Phase 9: Unified Goal System & FI Journey

**Status:** In Progress
**Priority:** Highest — fixes conflicting goal status, accounting gaps, and missing forward-looking narrative

**Goal:** Make the dashboard a single coherent financial independence journey: one source of truth for goals, cash flow connected to goal progress, actionable insights, and forward-looking projections.

---

## Problem Statement

The dashboard has three independent goal-tracking systems that don't talk to each other:

| System | Location | Tracks | Source of truth |
|--------|----------|--------|-----------------|
| `goals-calc.js` | Goals Panel (always visible) | EF + House only | Hardcoded account IDs |
| `goal-planner-calc.js` | Planning tab | All goals via priority allocation | Planner config + balances |
| `milestone-calc.js` | Planning tab (bottom) | Arbitrary targets with glide paths | Milestone config + NW |

Emergency Fund can show green in the Goals panel, "At Risk" in Planning, and "Behind" in Milestones — simultaneously. The user has to visit 3-5 places to understand goal health.

Additionally:
- Cash flow doesn't connect to goal progress (money in vs money needed)
- No forward-looking projections ("when will I be FI?")
- `monthly_income` is static config while expenses use trailing actuals — inconsistent
- Budget categories and cashflow categories can diverge silently
- No actionable guidance ("what should I do this month?")

---

## Step 1: Unify Goal System — Single Source of Truth

**Kill `goals-calc.js` as a calculator. Make `goal-planner-calc.js` the single source of truth for ALL goals.**

### 1a. Remove hardcoded account IDs from goals-calc.js

`goals-calc.js` lines 11-13 hardcode `TRADE_REPUBLIC`, `BBVA` for EF and lines 40-44 hardcode `ARRAS`, `BANKINTER` for house. These must go.

**Changes:**
- `goals-calc.js` → DELETE (or gut to a thin adapter that reads from planner output)
- Goals Panel (`ui-goals.js`) → reads from planner `goals` array instead of separate EF/house calculations
- `app.js` `refreshGoals()` → uses planner output to populate the always-visible panel

**Account role migration:**
- Add `goal_role` field to account config: `none | emergency_fund | house_downpayment | retirement | general`
- OR: reuse the existing planner goals `funding_accounts` as the mapping (no new field needed — the planner already knows which accounts belong to which goals)

**Decision:** Use planner goals as the mapping. No new account field needed. The planner's `funding_accounts` per goal is the canonical assignment.

### 1b. Reconcile Emergency Fund tab with planner

`emergency-calc.js` already uses `AccountService.getEmergencyFundRoles()` (good). But its `current` amount may differ from the planner's `current_amount` for the EF goal because they use different calculation paths.

**Changes:**
- `emergency-calc.js` `computeStatus()` → accept optional `plannerGoal` parameter. If provided, use planner's `current_amount` for consistency. Fall back to own calculation if no planner goal exists.
- `app.js` `refreshEmergency()` → pass the EF planner goal if available.

### 1c. Kill milestone as separate concept — merge into planner goals

Milestones are goals with a glide path. The planner already has `target_date`, `target_amount`, `current_amount`, and `projected_completion`. What milestones add is sub-targets and a glide path visualization.

**Changes:**
- Add optional `sub_targets` field to planner goals (same structure as milestone sub-targets)
- `milestone-calc.js` → refactor to compute glide path from a planner goal (input: goal row, output: glide path data)
- Remove standalone milestones admin tab — milestones become a property of planner goals
- `ui-planner.js` → renders glide path inline per goal (expandable row or detail view)

**Migration:** Existing `milestonesData` entries map to planner goals by matching `goal_id`. Admin migration on first load.

### Files changed (Step 1)

| File | Action | Changes |
|------|--------|---------|
| `js/data/goals-calc.js` | DELETE or GUT | Remove hardcoded EF/house calculations |
| `js/ui/ui-goals.js` | REWRITE | Read from planner output instead of goals-calc |
| `js/data/emergency-calc.js` | EDIT | Accept optional planner goal for consistency |
| `js/data/milestone-calc.js` | REFACTOR | Compute glide path from planner goal row |
| `js/data/goal-rules-service.js` | EDIT | Add sub_targets support to goal evaluation |
| `js/ui/ui-planner.js` | EDIT | Render milestones/glide paths inline per goal |
| `js/app.js` | EDIT | Wire Goals panel + EF tab to planner output |
| `js/admin.js` | EDIT | Merge milestones into planner goals admin |
| `js/storage-manager.js` | EDIT | Migration for milestone → planner_goal merge |

---

## Step 2: Connect Cash Flow to Goal Progress

**Show the real money journey: income → expenses → what's left → where it went → goal impact.**

### 2a. Use actual income from cashflow entries

Currently `monthlyIncome` is a static config value. Cash flow entries already track income by category (Salary, Bonus, Other).

**Changes:**
- `app.js` `refreshGoalsTab()` and `refreshCashFlow()` → compute trailing income average from cashflow entries when available, same pattern as the expenses fix already done
- Fall back to `appConfig.monthly_income` when no cashflow data exists
- `goal-rules-service.js` → no change needed (already receives `monthlyIncome` as parameter)

### 2b. Show actual vs planned goal funding in Planning tab

Currently Goal Funding Reality only appears in the Cash Flow month-detail modal. It should be prominent in the Planning tab.

**Changes:**
- `goal-rules-service.js` or new `goal-funding-reality-calc.js` → compute actual funding per goal from MonthEnd `net_contribution` data for the trailing N months
- `ui-planner.js` → add "Actual Funding" section showing per-goal: planned/mo vs actual trailing average, with status (on_track, overfunded, underfunded, withdrawn)
- Show clear alert when total actual funding > available savings (drawing from reserves)

### 2c. Strict category alignment between budget and cashflow

Budget items use `category`. Cashflow entries use `category_id` referencing `cashflowCategories`. These can diverge.

**Changes:**
- `budget-calc.js` → reference `cashflowCategories` for category names (single taxonomy)
- Admin budget tab → category field uses same datalist as cashflow entries
- Validation on save: warn if budget category doesn't match any cashflow category

### Files changed (Step 2)

| File | Action | Changes |
|------|--------|---------|
| `js/app.js` | EDIT | Trailing income from cashflow entries |
| `js/ui/ui-planner.js` | EDIT | Actual vs planned funding section |
| `js/data/cashflow-calc.js` | EDIT | Add `computeGoalFundingHistory()` for trailing months |
| `js/data/budget-calc.js` | EDIT | Use cashflow taxonomy for categories |
| `js/admin.js` | EDIT | Shared category datalist, validation |

---

## Step 3: Actionable Insights

**Answer "what should I do this month?" instead of just showing numbers.**

### 3a. Next Actions engine

New pure calculator: `js/data/actions-calc.js`

Analyzes the full planner output + cashflow + account balances and generates prioritized suggestions:

- **Rebalance**: "Move €2,000 from BBVA to BANKINTER — house goal is underfunded while EF is overfunded"
- **Expense alert**: "Expenses increased 15% over 3 months (€2,100 → €2,415). Review variable spending."
- **Budget deficit**: "Reduce expenses by €300/mo or extend retirement target to 2056 to fund all goals"
- **Surplus allocation**: "€500/mo unallocated. Consider adding to emergency fund (lowest priority unfunded goal)"
- **Goal achieved**: "Emergency Fund target reached! Consider redirecting €400/mo to house down payment"

### 3b. Surface in Planning tab

`ui-planner.js` → new "Recommended Actions" section at the top of the Planning tab, before the goal table. Color-coded by urgency (red = budget deficit, yellow = rebalance, green = surplus allocation).

### Files changed (Step 3)

| File | Action | Changes |
|------|--------|---------|
| `js/data/actions-calc.js` | NEW | Pure action recommendation engine |
| `js/ui/ui-planner.js` | EDIT | Render actions section |
| `js/app.js` | EDIT | Compute and pass actions to renderer |
| `index.html` | EDIT | Add script tag for actions-calc.js |
| `sw.js` | EDIT | Add to cache manifest |

---

## Step 4: Forward-Looking Projections

**"At current pace, when will I reach each goal? When will I be FI?"**

### 4a. Per-goal projection with confidence

Enhance `goal-rules-service.js` to compute:
- `projected_completion` (already exists) — based on allocated_monthly
- `projected_completion_required` — based on required_monthly (best case if budget allows)
- `on_track_probability` — simple heuristic: if trailing 3-month actual funding >= required, high confidence

### 4b. FI projection timeline

Enhance `fi-calc.js` to compute:
- `years_to_fi` (already exists) — based on savings rate + assumed return
- `fi_date` — concrete month/year
- `fi_date_if_save_more(extra)` — "save €200 more → FI 3 years earlier"
- Uses actual trailing savings rate (not budget-based)

### 4c. Planning tab projection summary

`ui-planner.js` → new "FI Timeline" section:
- "At current pace: FI by March 2042"
- Per-goal: "Emergency Fund: complete by Aug 2026 | House: complete by Dec 2028"
- Sensitivity: "Save €200 more/mo → FI by Jan 2039 (3 years earlier)"

### Files changed (Step 4)

| File | Action | Changes |
|------|--------|---------|
| `js/data/goal-rules-service.js` | EDIT | Add projection confidence |
| `js/data/fi-calc.js` | EDIT | FI date, sensitivity analysis |
| `js/ui/ui-planner.js` | EDIT | FI Timeline section |
| `js/app.js` | EDIT | Pass projection data to renderer |

---

## Step 5: Data Integrity Cleanup

**Fix known accounting bugs and data model gaps.**

### 5a. Cashflow entry ID collision fix

Current: `2026-03_expense_housing` — two entries with same category in same month collide.

**Fix:** Include subcategory in ID always. If still duplicate, append sequential suffix: `2026-03_expense_housing_rent`, `2026-03_expense_housing_utilities`.

### 5b. Negative net worth handling

If mortgage debt > assets, net worth is negative. `fi-calc.js` should handle this:
- FI progress: show "Debt Repayment Phase" instead of negative percentage
- Years to FI: compute from net-worth breakeven point, then growth phase

### 5c. Goal config validation on save

Admin > Planning → before saving a goal:
- Check if `target_amount / months_left > available_for_goals` → warn "impossible at current savings"
- Check if `funding_accounts` exist and are active
- Check for duplicate `funding_accounts` across goals (oversubscription preview)

### 5d. Modified Dietz first-month edge case

`returns-calc.js` first month formula inflates returns by ~2x due to 0.5 weight assumption. Add a `first_month` flag and note in the UI that first-month returns are approximate.

### Files changed (Step 5)

| File | Action | Changes |
|------|--------|---------|
| `js/data/cashflow-normalization-service.js` | EDIT | Fix ID collision |
| `js/data/fi-calc.js` | EDIT | Handle negative NW |
| `js/admin.js` | EDIT | Goal validation on save |
| `js/data/returns-calc.js` | EDIT | First-month flag |
| `js/ui/ui-tables.js` | EDIT | First-month indicator |

---

## Implementation Order

Steps are ordered by dependency and impact:

1. **Step 1** (Unify goals) — foundational, everything else builds on it
2. **Step 2** (Connect cashflow) — uses unified goal system
3. **Step 5** (Data integrity) — can be done in parallel with Steps 3-4
4. **Step 3** (Actionable insights) — requires unified goals + cashflow connection
5. **Step 4** (Projections) — requires all the above for accurate forecasting

Within each step, sub-items (a, b, c) are ordered by dependency.

---

## Verification

After each step:
1. All existing tests pass in `tests/test-runner.html`
2. New tests added for new/modified calculators
3. Manual verification: open dashboard, check all tabs render correctly
4. Check no conflicting goal status across panels/tabs
5. Verify account ledger integrity matches between Planning tab and Emergency Fund tab

After full implementation:
- Single goal status per goal, consistent everywhere
- Cash Flow → Planning → Goals panel all tell the same story
- "What should I do?" is answered in the Planning tab
- FI timeline projection is visible and based on real data
- No hardcoded account IDs anywhere in the codebase
