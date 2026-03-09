// === CASHFLOW CALCULATOR ===
// Pure functions for actual income/expense analysis.
// Works with cashflowEntries: [{ entry_id, month, type, category, amount, notes }]
// No DOM access.

var CashflowCalculator = {

  _resolveCategoryName: function(entry, categories) {
    if (entry.category) return entry.category;
    if (!entry.category_id) return 'Other';
    if (typeof CashflowTaxonomyService !== 'undefined') {
      return CashflowTaxonomyService.resolveCategoryName(entry.category_id, categories, entry.category_id);
    }
    return entry.category_id;
  },

  _resolveSubcategoryName: function(entry, subcategories) {
    if (entry.subcategory) return entry.subcategory;
    if (!entry.subcategory_id) return '';
    if (typeof CashflowTaxonomyService !== 'undefined') {
      return CashflowTaxonomyService.resolveSubcategoryName(entry.subcategory_id, subcategories, entry.subcategory_id);
    }
    return entry.subcategory_id;
  },

  // Look up the classification for a category_id ('spending' or 'transfer').
  _resolveClassification: function(entry, categories) {
    if (entry.category_id && categories) {
      for (var i = 0; i < categories.length; i++) {
        if (categories[i].category_id === entry.category_id) {
          return categories[i].classification || 'spending';
        }
      }
    }
    return 'spending';
  },

  // Compute summary for a single month.
  // Returns: { month, totalIncome, totalExpenses, totalTransfers, totalOutflows,
  //            netSavings, savingsRate, incomeByCategory, expensesByCategory,
  //            transfersByCategory, expensesBySubcategory }
  computeMonth: function(entries, month, categories, subcategories) {
    var monthEntries = (entries || []).filter(function(e) { return e.month === month; });
    var totalIncome = 0;
    var totalExpenses = 0;
    var totalTransfers = 0;
    var incomeByCategory = {};
    var expensesByCategory = {};
    var transfersByCategory = {};
    var expensesBySubcategory = {};

    for (var i = 0; i < monthEntries.length; i++) {
      var e = monthEntries[i];
      var amt = e.amount || 0;
      if (e.type === 'income') {
        totalIncome += amt;
        var incomeCategory = this._resolveCategoryName(e, categories);
        incomeByCategory[incomeCategory] = (incomeByCategory[incomeCategory] || 0) + amt;
      } else {
        var classification = this._resolveClassification(e, categories);
        var expenseCategory = this._resolveCategoryName(e, categories);
        var expenseSubcategory = this._resolveSubcategoryName(e, subcategories);

        if (classification === 'transfer') {
          totalTransfers += amt;
          transfersByCategory[expenseCategory] = (transfersByCategory[expenseCategory] || 0) + amt;
        } else {
          totalExpenses += amt;
          expensesByCategory[expenseCategory] = (expensesByCategory[expenseCategory] || 0) + amt;
          if (expenseSubcategory) {
            var subKey = expenseCategory + ' > ' + expenseSubcategory;
            expensesBySubcategory[subKey] = (expensesBySubcategory[subKey] || 0) + amt;
          }
        }
      }
    }

    var totalOutflows = totalExpenses + totalTransfers;
    var netSavings = totalIncome - totalExpenses;
    var savingsRate = totalIncome > 0 ? netSavings / totalIncome : 0;

    return {
      month: month,
      totalIncome: totalIncome,
      totalExpenses: totalExpenses,
      totalTransfers: totalTransfers,
      totalOutflows: totalOutflows,
      netSavings: netSavings,
      savingsRate: savingsRate,
      incomeByCategory: incomeByCategory,
      expensesByCategory: expensesByCategory,
      transfersByCategory: transfersByCategory,
      expensesBySubcategory: expensesBySubcategory
    };
  },

  // Compute summaries for all months that have entries.
  // Returns array sorted by month ascending.
  computeAllMonths: function(entries, categories, subcategories) {
    var months = this.getMonthsWithActuals(entries);
    var monthsArr = [];
    months.forEach(function(m) { monthsArr.push(m); });
    monthsArr.sort();

    var self = this;
    return monthsArr.map(function(m) { return self.computeMonth(entries, m, categories, subcategories); });
  },

  // Compare actual entries against budget items for a given month.
  // Returns: { byCategory: { cat: { planned, actual, delta } }, totals: { planned, actual, delta } }
  computePlannedVsActual: function(entries, budgetItems, month, categories) {
    var actual = this.computeMonth(entries, month, categories);
    var result = { byCategory: {}, totals: { planned: 0, actual: 0, delta: 0 } };

    // Build planned from budget items
    var planned = {};
    (budgetItems || []).forEach(function(b) {
      if (!b.active) return;
      var cat = b.category || 'Other';
      var monthly = BudgetCalculator.toMonthly(b.amount, b.frequency);
      planned[cat] = (planned[cat] || 0) + monthly;
    });

    // Merge all categories from both planned and actual
    var allCats = {};
    Object.keys(planned).forEach(function(c) { allCats[c] = true; });
    Object.keys(actual.expensesByCategory).forEach(function(c) { allCats[c] = true; });

    Object.keys(allCats).forEach(function(cat) {
      var p = planned[cat] || 0;
      var a = actual.expensesByCategory[cat] || 0;
      var delta = a - p;
      // For expenses: under budget is positive, over budget is negative
      var variancePct = p > 0 ? (delta / p * 100) : (a > 0 ? 100 : 0);
      result.byCategory[cat] = {
        planned: p,
        actual: a,
        delta: delta,
        variancePct: variancePct,
        varianceStatus: ValueStatus.signInverse(delta)
      };
      result.totals.planned += p;
      result.totals.actual += a;
    });

    result.totals.delta = result.totals.actual - result.totals.planned;
    result.totals.variancePct = result.totals.planned > 0
      ? (result.totals.delta / result.totals.planned * 100) : 0;
    result.totals.varianceStatus = ValueStatus.signInverse(result.totals.delta);
    return result;
  },

  // Compute category trends over last N months (from entries).
  // Returns: { categories: [str], months: [str], series: { cat: [amounts] } }
  computeCategoryTrends: function(entries, numMonths, categories) {
    var allMonths = this.computeAllMonths(entries, categories);
    var recent = numMonths ? allMonths.slice(-numMonths) : allMonths;
    if (!recent.length) return { categories: [], months: [], series: {} };

    var months = recent.map(function(r) { return r.month; });

    // Collect all expense categories
    var catSet = {};
    recent.forEach(function(r) {
      Object.keys(r.expensesByCategory).forEach(function(c) { catSet[c] = true; });
    });
    var categories = Object.keys(catSet).sort();

    var series = {};
    categories.forEach(function(cat) {
      series[cat] = recent.map(function(r) {
        return r.expensesByCategory[cat] || 0;
      });
    });

    return { categories: categories, months: months, series: series };
  },

  // Compute expense subcategory trends over last N months.
  // Returns: { categories: [str], months: [str], series: { cat: [amounts] } }
  computeSubcategoryTrends: function(entries, numMonths, categories, subcategories) {
    var allMonths = this.computeAllMonths(entries, categories, subcategories);
    var recent = numMonths ? allMonths.slice(-numMonths) : allMonths;
    if (!recent.length) return { categories: [], months: [], series: {} };

    var months = recent.map(function(r) { return r.month; });
    var catSet = {};
    recent.forEach(function(r) {
      Object.keys(r.expensesBySubcategory || {}).forEach(function(c) { catSet[c] = true; });
    });
    var labels = Object.keys(catSet).sort();

    var series = {};
    labels.forEach(function(label) {
      series[label] = recent.map(function(r) {
        return (r.expensesBySubcategory && r.expensesBySubcategory[label]) || 0;
      });
    });

    return { categories: labels, months: months, series: series };
  },

  // Get Set of months that have actual cashflow entries.
  getMonthsWithActuals: function(entries) {
    var months = new Set();
    (entries || []).forEach(function(e) { months.add(e.month); });
    return months;
  },

  // Compute income trend from cashflow entries.
  // Returns { months: [{ month, income }], growthRate: annualized growth rate }
  computeIncomeTrend: function(entries) {
    if (!entries || !entries.length) return { months: [], growthRate: 0 };

    // Aggregate income by month
    var byMonth = {};
    entries.forEach(function(e) {
      if (e.type === 'income') {
        byMonth[e.month] = (byMonth[e.month] || 0) + (e.amount || 0);
      }
    });

    var months = Object.keys(byMonth).sort().map(function(m) {
      return { month: m, income: byMonth[m] };
    });

    // Need at least 6 months to compute meaningful growth rate
    var growthRate = 0;
    if (months.length >= 6) {
      var half = Math.floor(months.length / 2);
      var firstHalf = months.slice(0, half);
      var secondHalf = months.slice(-half);
      var avgFirst = firstHalf.reduce(function(s, m) { return s + m.income; }, 0) / firstHalf.length;
      var avgSecond = secondHalf.reduce(function(s, m) { return s + m.income; }, 0) / secondHalf.length;
      if (avgFirst > 0) {
        // Annualize the growth rate
        var periodMonths = months.length;
        var totalGrowth = avgSecond / avgFirst;
        growthRate = Math.pow(totalGrowth, 12 / periodMonths) - 1;
      }
    }

    return { months: months, growthRate: growthRate };
  },

  // Full detail for a single month: itemized income, expenses, transfers with subcategories.
  // Returns: { month, income: { total, items: [{category, subcategory, amount}] },
  //            expenses: { total, items: [...] }, transfers: { total, items: [...] } }
  computeMonthDetail: function(entries, month, categories, subcategories) {
    var monthEntries = (entries || []).filter(function(e) { return e.month === month; });
    var income = { total: 0, items: [] };
    var expenses = { total: 0, items: [] };
    var transfers = { total: 0, items: [] };

    for (var i = 0; i < monthEntries.length; i++) {
      var e = monthEntries[i];
      var amt = e.amount || 0;
      var cat = this._resolveCategoryName(e, categories);
      var subcat = this._resolveSubcategoryName(e, subcategories);
      var item = { category: cat, subcategory: subcat, amount: amt, notes: e.notes || '' };

      if (e.type === 'income') {
        income.total += amt;
        income.items.push(item);
      } else {
        var classification = this._resolveClassification(e, categories);
        if (classification === 'transfer') {
          transfers.total += amt;
          transfers.items.push(item);
        } else {
          expenses.total += amt;
          expenses.items.push(item);
        }
      }
    }

    // Sort items by amount descending within each group
    var byAmountDesc = function(a, b) { return b.amount - a.amount; };
    income.items.sort(byAmountDesc);
    expenses.items.sort(byAmountDesc);
    transfers.items.sort(byAmountDesc);

    return {
      month: month,
      income: income,
      expenses: expenses,
      transfers: transfers,
      netSavings: income.total - expenses.total,
      savingsRate: income.total > 0 ? (income.total - expenses.total) / income.total : 0
    };
  },

  // Compute actual goal funding for a month from MonthEnd account data.
  // Compares net_contribution to each goal's funding accounts against available savings.
  // Returns: { availableSavings, goals: [{ name, priority, planned, actual, delta, status }],
  //            totalPlanned, totalActual, overdrawn }
  computeGoalFundingReality: function(month, allData, plannerGoals, netSavings) {
    if (!plannerGoals || !plannerGoals.length || !allData) {
      return { availableSavings: netSavings || 0, goals: [], totalPlanned: 0, totalActual: 0, overdrawn: 0 };
    }

    // Get net_contribution by account for this month
    var contribByAccount = {};
    (allData || []).forEach(function(r) {
      if (r.month === month) {
        contribByAccount[r.account_id] = r.net_contribution || 0;
      }
    });

    var goals = [];
    var totalPlanned = 0;
    var totalActual = 0;

    plannerGoals.forEach(function(g) {
      var fundingAccounts = g.funding_accounts || [];
      if (!fundingAccounts.length) return;

      // Sum actual net_contribution across this goal's funding accounts
      var actual = 0;
      fundingAccounts.forEach(function(accId) {
        actual += (contribByAccount[accId] || 0);
      });

      var planned = g.allocated_monthly || 0;
      var delta = actual - planned;

      var status = 'on_track';
      if (actual < 0) {
        status = 'withdrawn'; // money left this goal's accounts
      } else if (planned > 0 && actual < planned * 0.5) {
        status = 'underfunded';
      } else if (actual > planned * 1.5 && planned > 0) {
        status = 'overfunded';
      }

      goals.push({
        goal_id: g.goal_id,
        name: g.name || g.goal_id,
        priority: g.priority || 99,
        planned: planned,
        actual: actual,
        delta: delta,
        status: status,
        funding_accounts: fundingAccounts
      });

      totalPlanned += planned;
      totalActual += actual;
    });

    goals.sort(function(a, b) { return a.priority - b.priority; });

    var available = netSavings || 0;
    var overdrawn = Math.max(0, totalActual - available);

    return {
      availableSavings: available,
      goals: goals,
      totalPlanned: totalPlanned,
      totalActual: totalActual,
      overdrawn: overdrawn
    };
  },

  // Compute trailing goal funding reality across recent months.
  // Returns per-goal average actual vs planned, plus per-month detail.
  // months: array of month strings to analyze (e.g. last 3-6 months with actual data)
  computeGoalFundingHistory: function(months, allData, plannerGoals, cashflowEntries, categories, subcategories) {
    if (!months || !months.length || !plannerGoals || !plannerGoals.length) {
      return { goals: [], months: [], overdrawnMonths: 0 };
    }

    var monthDetails = [];
    months.forEach(function(month) {
      // Compute net savings for this month from cashflow entries
      var monthData = CashflowCalculator.computeMonth(cashflowEntries, month, categories, subcategories);
      var netSavings = monthData.totalIncome - monthData.totalExpenses - monthData.totalTransfers;
      var reality = CashflowCalculator.computeGoalFundingReality(month, allData, plannerGoals, netSavings);
      monthDetails.push({ month: month, reality: reality });
    });

    // Aggregate per goal across months
    var goalTotals = {};
    var overdrawnMonths = 0;

    monthDetails.forEach(function(md) {
      if (md.reality.overdrawn > 0.01) overdrawnMonths++;
      md.reality.goals.forEach(function(g) {
        if (!goalTotals[g.goal_id]) {
          goalTotals[g.goal_id] = {
            goal_id: g.goal_id,
            name: g.name,
            priority: g.priority,
            totalPlanned: 0,
            totalActual: 0,
            monthCount: 0
          };
        }
        goalTotals[g.goal_id].totalPlanned += g.planned;
        goalTotals[g.goal_id].totalActual += g.actual;
        goalTotals[g.goal_id].monthCount++;
      });
    });

    var goalSummaries = Object.keys(goalTotals).map(function(id) {
      var g = goalTotals[id];
      var avgPlanned = g.monthCount > 0 ? g.totalPlanned / g.monthCount : 0;
      var avgActual = g.monthCount > 0 ? g.totalActual / g.monthCount : 0;
      var status = 'on_track';
      if (avgActual < 0) status = 'withdrawn';
      else if (avgPlanned > 0 && avgActual < avgPlanned * 0.5) status = 'underfunded';
      else if (avgActual > avgPlanned * 1.5 && avgPlanned > 0) status = 'overfunded';

      return {
        goal_id: g.goal_id,
        name: g.name,
        priority: g.priority,
        avgPlanned: avgPlanned,
        avgActual: avgActual,
        delta: avgActual - avgPlanned,
        status: status
      };
    });

    goalSummaries.sort(function(a, b) { return a.priority - b.priority; });

    return {
      goals: goalSummaries,
      months: monthDetails,
      overdrawnMonths: overdrawnMonths,
      totalMonths: months.length
    };
  },

  // Compute P&L statement for a single month with nested category→subcategory structure.
  // Returns: { month, income: { total, byCategory }, expenses: { total, byCategory: { cat: { total, subcategories, items } } },
  //            transfers: { total, byCategory }, netSavings, netSavingsStatus, savingsRate, savingsRateStatus }
  computeMonthPnL: function(entries, month, categories, subcategories) {
    var monthEntries = (entries || []).filter(function(e) { return e.month === month; });
    var income = { total: 0, byCategory: {} };
    var expenses = { total: 0, byCategory: {} };
    var transfers = { total: 0, byCategory: {} };

    for (var i = 0; i < monthEntries.length; i++) {
      var e = monthEntries[i];
      var amt = e.amount || 0;
      var cat = this._resolveCategoryName(e, categories);
      var subcat = this._resolveSubcategoryName(e, subcategories);

      if (e.type === 'income') {
        income.total += amt;
        income.byCategory[cat] = (income.byCategory[cat] || 0) + amt;
      } else {
        var classification = this._resolveClassification(e, categories);
        if (classification === 'transfer') {
          transfers.total += amt;
          transfers.byCategory[cat] = (transfers.byCategory[cat] || 0) + amt;
        } else {
          expenses.total += amt;
          if (!expenses.byCategory[cat]) {
            expenses.byCategory[cat] = { total: 0, subcategories: {}, items: [] };
          }
          var catObj = expenses.byCategory[cat];
          catObj.total += amt;
          if (subcat) {
            catObj.subcategories[subcat] = (catObj.subcategories[subcat] || 0) + amt;
          }
          catObj.items.push({ subcategory: subcat, amount: amt, notes: e.notes || '' });
        }
      }
    }

    // Sort items within each expense category by amount desc
    var catKeys = Object.keys(expenses.byCategory);
    for (var j = 0; j < catKeys.length; j++) {
      expenses.byCategory[catKeys[j]].items.sort(function(a, b) { return b.amount - a.amount; });
    }

    var netSavings = Math.round((income.total - expenses.total) * 100) / 100;
    var savingsRate = income.total > 0 ? netSavings / income.total : 0;

    return {
      month: month,
      income: income,
      expenses: expenses,
      transfers: transfers,
      netSavings: netSavings,
      netSavingsStatus: ValueStatus.sign(netSavings),
      savingsRate: savingsRate,
      savingsRateStatus: savingsRate >= 0.30 ? 'positive' : (savingsRate >= 0.15 ? 'neutral' : 'negative')
    };
  },

  // Compare selected month vs prior month with actual data.
  // Returns delta analysis for expense and income categories.
  computeMoMInsights: function(entries, month, categories, subcategories) {
    var allMonths = Array.from(this.getMonthsWithActuals(entries)).sort();
    var idx = allMonths.indexOf(month);
    var hasPriorMonth = idx > 0;
    var priorMonth = hasPriorMonth ? allMonths[idx - 1] : null;

    var currentPnL = this.computeMonthPnL(entries, month, categories, subcategories);
    var priorPnL = hasPriorMonth ? this.computeMonthPnL(entries, priorMonth, categories, subcategories) : null;

    // Top expense categories for current month
    var topExpenseCategories = [];
    var expCats = Object.keys(currentPnL.expenses.byCategory);
    for (var i = 0; i < expCats.length; i++) {
      var catTotal = currentPnL.expenses.byCategory[expCats[i]].total;
      topExpenseCategories.push({
        category: expCats[i],
        amount: catTotal,
        pctOfTotal: currentPnL.expenses.total > 0 ? catTotal / currentPnL.expenses.total : 0
      });
    }
    topExpenseCategories.sort(function(a, b) { return b.amount - a.amount; });
    topExpenseCategories = topExpenseCategories.slice(0, 5);

    if (!hasPriorMonth) {
      return {
        hasPriorMonth: false,
        priorMonth: null,
        expenseChanges: [],
        incomeChanges: [],
        topExpenseCategories: topExpenseCategories,
        totalExpenseChange: null,
        totalIncomeChange: null
      };
    }

    // Build expense delta by category
    var allExpCats = {};
    expCats.forEach(function(c) { allExpCats[c] = true; });
    Object.keys(priorPnL.expenses.byCategory).forEach(function(c) { allExpCats[c] = true; });

    var expenseChanges = [];
    Object.keys(allExpCats).forEach(function(cat) {
      var current = currentPnL.expenses.byCategory[cat] ? currentPnL.expenses.byCategory[cat].total : 0;
      var prior = priorPnL.expenses.byCategory[cat] ? priorPnL.expenses.byCategory[cat].total : 0;
      var delta = current - prior;
      var deltaPct = prior > 0 ? delta / prior : (current > 0 ? 1 : 0);
      expenseChanges.push({
        category: cat, current: current, prior: prior,
        delta: delta, deltaPct: deltaPct,
        deltaStatus: ValueStatus.signInverse(delta)
      });
    });
    expenseChanges.sort(function(a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });

    // Build income delta by category
    var allIncCats = {};
    Object.keys(currentPnL.income.byCategory).forEach(function(c) { allIncCats[c] = true; });
    Object.keys(priorPnL.income.byCategory).forEach(function(c) { allIncCats[c] = true; });

    var incomeChanges = [];
    Object.keys(allIncCats).forEach(function(cat) {
      var current = currentPnL.income.byCategory[cat] || 0;
      var prior = priorPnL.income.byCategory[cat] || 0;
      var delta = current - prior;
      var deltaPct = prior > 0 ? delta / prior : (current > 0 ? 1 : 0);
      incomeChanges.push({
        category: cat, current: current, prior: prior,
        delta: delta, deltaPct: deltaPct,
        deltaStatus: ValueStatus.sign(delta)
      });
    });
    incomeChanges.sort(function(a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });

    // Totals
    var totalExpDelta = currentPnL.expenses.total - priorPnL.expenses.total;
    var totalIncDelta = currentPnL.income.total - priorPnL.income.total;

    return {
      hasPriorMonth: true,
      priorMonth: priorMonth,
      expenseChanges: expenseChanges,
      incomeChanges: incomeChanges,
      topExpenseCategories: topExpenseCategories,
      totalExpenseChange: {
        current: currentPnL.expenses.total,
        prior: priorPnL.expenses.total,
        delta: totalExpDelta,
        deltaPct: priorPnL.expenses.total > 0 ? totalExpDelta / priorPnL.expenses.total : 0,
        deltaStatus: ValueStatus.signInverse(totalExpDelta)
      },
      totalIncomeChange: {
        current: currentPnL.income.total,
        prior: priorPnL.income.total,
        delta: totalIncDelta,
        deltaPct: priorPnL.income.total > 0 ? totalIncDelta / priorPnL.income.total : 0,
        deltaStatus: ValueStatus.sign(totalIncDelta)
      }
    };
  },

  // Compute monthly scorecard: savings rate vs target/avg/prior, narrative sentence.
  // fiSavingsRate: the savings rate needed for FI (from config or derived), as decimal (e.g. 0.50)
  // trailingMonths: how many months to average (default 6)
  computeMonthScorecard: function(entries, month, categories, subcategories, fiSavingsRate, trailingMonths) {
    var pnl = this.computeMonthPnL(entries, month, categories, subcategories);
    var allMonths = this.computeAllMonths(entries, categories, subcategories);
    var n = trailingMonths || 6;

    // Current month index
    var monthIdx = -1;
    for (var i = 0; i < allMonths.length; i++) {
      if (allMonths[i].month === month) { monthIdx = i; break; }
    }

    // Prior month
    var priorSavingsRate = null;
    var savingsRateDeltaPP = null;
    if (monthIdx > 0) {
      priorSavingsRate = allMonths[monthIdx - 1].savingsRate;
      savingsRateDeltaPP = Math.round((pnl.savingsRate - priorSavingsRate) * 10000) / 100; // pp
    }

    // Trailing average
    var trailingStart = Math.max(0, monthIdx - n + 1);
    var trailingSlice = allMonths.slice(trailingStart, monthIdx + 1);
    var avgSavingsRate = 0;
    var avgExpenses = 0;
    if (trailingSlice.length > 0) {
      avgSavingsRate = trailingSlice.reduce(function(s, m) { return s + m.savingsRate; }, 0) / trailingSlice.length;
      avgExpenses = trailingSlice.reduce(function(s, m) { return s + m.totalExpenses; }, 0) / trailingSlice.length;
    }
    var savingsRateVsAvgPP = Math.round((pnl.savingsRate - avgSavingsRate) * 10000) / 100;

    // Expense vs trailing average
    var expenseVsAvgPct = avgExpenses > EPSILON
      ? Math.round((pnl.expenses.total - avgExpenses) / avgExpenses * 10000) / 100
      : 0;

    // Target comparison
    var targetRate = fiSavingsRate || 0;
    var savingsRateVsTargetPP = targetRate > 0
      ? Math.round((pnl.savingsRate - targetRate) * 10000) / 100
      : null;
    var onTarget = targetRate > 0 ? pnl.savingsRate >= targetRate : null;

    // Generate narrative
    var narrative = this._buildScorecardNarrative(pnl, expenseVsAvgPct, savingsRateVsTargetPP, onTarget, trailingSlice.length);

    return {
      month: month,
      income: pnl.income.total,
      expenses: pnl.expenses.total,
      netSavings: pnl.netSavings,
      netSavingsStatus: pnl.netSavingsStatus,
      savingsRate: pnl.savingsRate,
      savingsRateStatus: pnl.savingsRateStatus,
      targetSavingsRate: targetRate,
      savingsRateVsTargetPP: savingsRateVsTargetPP,
      onTarget: onTarget,
      onTargetStatus: onTarget === null ? 'neutral' : (onTarget ? 'positive' : 'negative'),
      priorSavingsRate: priorSavingsRate,
      savingsRateDeltaPP: savingsRateDeltaPP,
      savingsRateDeltaStatus: savingsRateDeltaPP !== null ? ValueStatus.sign(savingsRateDeltaPP) : 'neutral',
      avgSavingsRate: avgSavingsRate,
      savingsRateVsAvgPP: savingsRateVsAvgPP,
      savingsRateVsAvgStatus: ValueStatus.sign(savingsRateVsAvgPP),
      avgExpenses: avgExpenses,
      expenseVsAvgPct: expenseVsAvgPct,
      expenseVsAvgStatus: ValueStatus.signInverse(expenseVsAvgPct),
      narrative: narrative,
      trailingMonthsUsed: trailingSlice.length
    };
  },

  _buildScorecardNarrative: function(pnl, expenseVsAvgPct, vsTargetPP, onTarget, trailingCount) {
    var parts = [];

    // Expense observation
    if (trailingCount >= 2) {
      if (expenseVsAvgPct < -5) {
        parts.push('Expenses ' + Math.abs(expenseVsAvgPct).toFixed(0) + '% below your ' + trailingCount + '-month average.');
      } else if (expenseVsAvgPct > 10) {
        parts.push('Expenses ' + expenseVsAvgPct.toFixed(0) + '% above your ' + trailingCount + '-month average.');
      } else {
        parts.push('Expenses in line with your recent average.');
      }
    }

    // Target comparison
    if (onTarget === true && vsTargetPP !== null && Math.abs(vsTargetPP) >= 1) {
      parts.push('Savings rate exceeds your FI target by ' + Math.abs(vsTargetPP).toFixed(0) + 'pp.');
    } else if (onTarget === true && vsTargetPP !== null) {
      parts.push('Savings rate meets your FI target.');
    } else if (onTarget === false && vsTargetPP !== null) {
      parts.push('Savings rate ' + Math.abs(vsTargetPP).toFixed(0) + 'pp below your FI target.');
    }

    // Overall tone
    if (pnl.savingsRate >= 0.50) {
      parts.unshift('Strong month.');
    } else if (pnl.savingsRate >= 0.30) {
      parts.unshift('Solid month.');
    } else if (pnl.savingsRate >= 0.15) {
      parts.unshift('Moderate month.');
    } else if (pnl.savingsRate > 0) {
      parts.unshift('Tight month.');
    } else {
      parts.unshift('Negative savings this month.');
    }

    return parts.join(' ');
  },

  // Compute trailing average per expense category.
  // Returns: { [category]: { avg, months, current, delta, deltaPct, deltaStatus } }
  computeCategoryAverages: function(entries, month, categories, subcategories, trailingMonths) {
    var allMonths = this.computeAllMonths(entries, categories, subcategories);
    var n = trailingMonths || 6;

    // Find month index
    var monthIdx = -1;
    for (var i = 0; i < allMonths.length; i++) {
      if (allMonths[i].month === month) { monthIdx = i; break; }
    }
    if (monthIdx < 0) return {};

    // Trailing months BEFORE current (exclusive)
    var trailingStart = Math.max(0, monthIdx - n);
    var trailing = allMonths.slice(trailingStart, monthIdx);
    if (!trailing.length) return {};

    var currentMonth = allMonths[monthIdx];

    // Collect all expense categories across trailing + current
    var allCats = {};
    trailing.forEach(function(m) {
      Object.keys(m.expensesByCategory).forEach(function(c) { allCats[c] = true; });
    });
    Object.keys(currentMonth.expensesByCategory).forEach(function(c) { allCats[c] = true; });

    var result = {};
    Object.keys(allCats).forEach(function(cat) {
      var sum = 0;
      var count = 0;
      trailing.forEach(function(m) {
        if (m.expensesByCategory[cat] !== undefined) {
          sum += m.expensesByCategory[cat];
          count++;
        }
      });
      var avg = count > 0 ? Math.round(sum / count * 100) / 100 : 0;
      var current = currentMonth.expensesByCategory[cat] || 0;
      var delta = Math.round((current - avg) * 100) / 100;
      var deltaPct = avg > EPSILON ? Math.round(delta / avg * 10000) / 100 : (current > 0 ? 100 : 0);

      result[cat] = {
        avg: avg,
        months: count,
        current: current,
        delta: delta,
        deltaPct: deltaPct,
        deltaStatus: ValueStatus.signInverse(delta)
      };
    });

    return result;
  },

  // Compute budget vs actual cumulatively from January of the selected month's year
  // through the selected month. Returns same shape as computePlannedVsActual but YTD.
  computeBudgetVsActualYTD: function(entries, budgetItems, month, categories) {
    var year = month.slice(0, 4);
    var monthNum = parseInt(month.slice(5), 10);
    var result = { byCategory: {}, totals: { planned: 0, actual: 0, delta: 0 } };

    // Build monthly planned from budget
    var planned = {};
    (budgetItems || []).forEach(function(b) {
      if (!b.active) return;
      var cat = b.category || 'Other';
      var monthly = BudgetCalculator.toMonthly(b.amount, b.frequency);
      planned[cat] = (planned[cat] || 0) + monthly;
    });

    // Accumulate actuals from Jan to selected month
    var actualByCat = {};
    for (var m = 1; m <= monthNum; m++) {
      var mm = m < 10 ? '0' + m : '' + m;
      var monthStr = year + '-' + mm;
      var monthData = this.computeMonth(entries, monthStr, categories);
      var cats = Object.keys(monthData.expensesByCategory);
      for (var i = 0; i < cats.length; i++) {
        actualByCat[cats[i]] = (actualByCat[cats[i]] || 0) + monthData.expensesByCategory[cats[i]];
      }
    }

    // Planned YTD = monthly * monthNum
    var allCats = {};
    Object.keys(planned).forEach(function(c) { allCats[c] = true; });
    Object.keys(actualByCat).forEach(function(c) { allCats[c] = true; });

    Object.keys(allCats).forEach(function(cat) {
      var p = (planned[cat] || 0) * monthNum;
      var a = actualByCat[cat] || 0;
      var delta = a - p;
      var variancePct = p > EPSILON ? Math.round(delta / p * 10000) / 100 : (a > 0 ? 100 : 0);
      result.byCategory[cat] = {
        planned: Math.round(p * 100) / 100,
        actual: Math.round(a * 100) / 100,
        delta: Math.round(delta * 100) / 100,
        variancePct: variancePct,
        varianceStatus: ValueStatus.signInverse(delta)
      };
      result.totals.planned += p;
      result.totals.actual += a;
    });

    result.totals.planned = Math.round(result.totals.planned * 100) / 100;
    result.totals.actual = Math.round(result.totals.actual * 100) / 100;
    result.totals.delta = Math.round((result.totals.actual - result.totals.planned) * 100) / 100;
    result.totals.variancePct = result.totals.planned > EPSILON
      ? Math.round(result.totals.delta / result.totals.planned * 10000) / 100 : 0;
    result.totals.varianceStatus = ValueStatus.signInverse(result.totals.delta);
    result.monthCount = monthNum;
    result.year = year;
    return result;
  },

  // Compute prioritized, actionable improvement areas.
  // Returns: [{ type, severity, category, title, detail, annualImpact, annualImpactStatus }]
  // Types: 'trending_up', 'new_category', 'budget_buster', 'surplus', 'rate_declining'
  // Severity: 'warning', 'info', 'success'
  computeImprovementAreas: function(entries, month, categories, subcategories, budgetItems, goalPlan, trailingMonths) {
    var areas = [];
    var allMonths = this.computeAllMonths(entries, categories, subcategories);
    var n = trailingMonths || 6;

    // Find month index
    var monthIdx = -1;
    for (var i = 0; i < allMonths.length; i++) {
      if (allMonths[i].month === month) { monthIdx = i; break; }
    }
    if (monthIdx < 0) return areas;

    var current = allMonths[monthIdx];
    var trailingStart = Math.max(0, monthIdx - n);
    var trailing = allMonths.slice(trailingStart, monthIdx);

    // --- 1. Trending expense categories (3-month slope) ---
    if (trailing.length >= 2) {
      var recentN = Math.min(trailing.length, 3);
      var recentSlice = allMonths.slice(Math.max(0, monthIdx - recentN), monthIdx + 1);

      // Collect categories that appear in recent + current
      var catSet = {};
      recentSlice.forEach(function(m) {
        Object.keys(m.expensesByCategory).forEach(function(c) { catSet[c] = true; });
      });

      Object.keys(catSet).forEach(function(cat) {
        var values = recentSlice.map(function(m) { return m.expensesByCategory[cat] || 0; });
        if (values.length < 3) return;

        // Simple: compare first vs last
        var first = values[0];
        var last = values[values.length - 1];
        if (first < EPSILON && last < EPSILON) return;

        var change = last - first;
        var avgBase = (first + last) / 2;
        var changePct = avgBase > EPSILON ? change / avgBase : 0;

        if (changePct > 0.10 && change > 20) { // >10% increase and >20€ absolute
          var annualImpact = Math.round(change * 12 * 100) / 100;
          areas.push({
            type: 'trending_up',
            severity: 'warning',
            category: cat,
            title: cat + ' spending trending up',
            detail: Fmt.currency(first) + ' \u2192 ' + Fmt.currency(last) +
              ' over last ' + values.length + ' months (' + (changePct > 0 ? '+' : '') +
              (changePct * 100).toFixed(0) + '%).',
            annualImpact: annualImpact,
            annualImpactStatus: ValueStatus.signInverse(annualImpact)
          });
        }
      });
    }

    // --- 2. New expense categories (not in prior 3 months) ---
    if (trailing.length >= 1) {
      var priorCats = {};
      var lookback = trailing.slice(-3);
      lookback.forEach(function(m) {
        Object.keys(m.expensesByCategory).forEach(function(c) { priorCats[c] = true; });
      });

      Object.keys(current.expensesByCategory).forEach(function(cat) {
        if (!priorCats[cat] && current.expensesByCategory[cat] > EPSILON) {
          areas.push({
            type: 'new_category',
            severity: 'info',
            category: cat,
            title: 'New: ' + cat,
            detail: Fmt.currency(current.expensesByCategory[cat]) + ' this month. Not seen in prior ' + lookback.length + ' months.',
            annualImpact: Math.round(current.expensesByCategory[cat] * 12 * 100) / 100,
            annualImpactStatus: 'neutral'
          });
        }
      });
    }

    // --- 3. Budget busters (over budget 3+ months in a row) ---
    if (budgetItems && budgetItems.length && trailing.length >= 2) {
      var planned = {};
      budgetItems.forEach(function(b) {
        if (!b.active) return;
        var cat = b.category || 'Other';
        planned[cat] = (planned[cat] || 0) + BudgetCalculator.toMonthly(b.amount, b.frequency);
      });

      var recentForBudget = allMonths.slice(Math.max(0, monthIdx - 2), monthIdx + 1); // last 3 incl current
      Object.keys(planned).forEach(function(cat) {
        var p = planned[cat];
        if (p < EPSILON) return;
        var overCount = 0;
        var totalOver = 0;
        recentForBudget.forEach(function(m) {
          var actual = m.expensesByCategory[cat] || 0;
          if (actual > p + EPSILON) {
            overCount++;
            totalOver += actual - p;
          }
        });
        if (overCount >= 3) {
          var avgOver = Math.round(totalOver / overCount * 100) / 100;
          areas.push({
            type: 'budget_buster',
            severity: 'warning',
            category: cat,
            title: cat + ' over budget ' + overCount + ' months running',
            detail: 'Averaging ' + Fmt.currency(avgOver) + '/mo over the ' +
              Fmt.currency(p) + ' budget. Consider adjusting budget or spending.',
            annualImpact: Math.round(avgOver * 12 * 100) / 100,
            annualImpactStatus: ValueStatus.signInverse(avgOver)
          });
        }
      });
    }

    // --- 4. Unallocated surplus ---
    if (goalPlan && goalPlan.goals && current.netSavings > 0) {
      var totalGoalAlloc = 0;
      goalPlan.goals.forEach(function(g) {
        totalGoalAlloc += (g.allocated_monthly || 0);
      });
      var surplus = Math.round((current.netSavings - totalGoalAlloc) * 100) / 100;
      if (surplus > 50) { // > 50€ unallocated
        areas.push({
          type: 'surplus',
          severity: 'success',
          category: null,
          title: 'Unallocated savings: ' + Fmt.currency(surplus),
          detail: 'You saved more than your goal allocations need. Consider increasing contributions or adding a new goal.',
          annualImpact: Math.round(surplus * 12 * 100) / 100,
          annualImpactStatus: ValueStatus.sign(surplus)
        });
      }
    }

    // --- 5. Savings rate declining trend ---
    if (trailing.length >= 2) {
      var rateSlice = allMonths.slice(Math.max(0, monthIdx - 2), monthIdx + 1);
      if (rateSlice.length >= 3) {
        var allDecreasing = true;
        for (var j = 1; j < rateSlice.length; j++) {
          if (rateSlice[j].savingsRate >= rateSlice[j - 1].savingsRate - 0.005) {
            allDecreasing = false;
            break;
          }
        }
        if (allDecreasing) {
          var rDrop = Math.round((rateSlice[0].savingsRate - rateSlice[rateSlice.length - 1].savingsRate) * 10000) / 100;
          areas.push({
            type: 'rate_declining',
            severity: 'warning',
            category: null,
            title: 'Savings rate declining',
            detail: 'Down ' + rDrop.toFixed(1) + 'pp over ' + rateSlice.length + ' months. Review expense trends.',
            annualImpact: null,
            annualImpactStatus: 'neutral'
          });
        }
      }
    }

    // Sort: warnings first, then info, then success
    var severityOrder = { warning: 1, info: 2, success: 3 };
    areas.sort(function(a, b) {
      return (severityOrder[a.severity] || 9) - (severityOrder[b.severity] || 9);
    });

    return areas;
  },

  // Generate a slug from a category name (lowercase, spaces to hyphens).
  slugify: function(str) {
    return (str || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  },

  // Build entry_id from components.
  buildEntryId: function(month, type, categoryId, subcategoryId) {
    var id = month + '_' + type + '_' + (categoryId || 'uncategorized');
    if (subcategoryId) id += '_' + subcategoryId;
    return id;
  }
};
