// === CASHFLOW CALCULATOR ===
// Pure functions for actual income/expense analysis.
// Works with cashflowEntries: [{ entry_id, month, type, category, amount, notes }]
// No DOM access.

var CashflowCalculator = {

  // Compute summary for a single month.
  // Returns: { month, totalIncome, totalExpenses, netSavings, savingsRate,
  //            incomeByCategory, expensesByCategory }
  computeMonth: function(entries, month) {
    var monthEntries = (entries || []).filter(function(e) { return e.month === month; });
    var totalIncome = 0;
    var totalExpenses = 0;
    var incomeByCategory = {};
    var expensesByCategory = {};

    for (var i = 0; i < monthEntries.length; i++) {
      var e = monthEntries[i];
      var amt = e.amount || 0;
      if (e.type === 'income') {
        totalIncome += amt;
        incomeByCategory[e.category] = (incomeByCategory[e.category] || 0) + amt;
      } else {
        totalExpenses += amt;
        expensesByCategory[e.category] = (expensesByCategory[e.category] || 0) + amt;
      }
    }

    var netSavings = totalIncome - totalExpenses;
    var savingsRate = totalIncome > 0 ? netSavings / totalIncome : 0;

    return {
      month: month,
      totalIncome: totalIncome,
      totalExpenses: totalExpenses,
      netSavings: netSavings,
      savingsRate: savingsRate,
      incomeByCategory: incomeByCategory,
      expensesByCategory: expensesByCategory
    };
  },

  // Compute summaries for all months that have entries.
  // Returns array sorted by month ascending.
  computeAllMonths: function(entries) {
    var months = this.getMonthsWithActuals(entries);
    var monthsArr = [];
    months.forEach(function(m) { monthsArr.push(m); });
    monthsArr.sort();

    var self = this;
    return monthsArr.map(function(m) { return self.computeMonth(entries, m); });
  },

  // Compare actual entries against budget items for a given month.
  // Returns: { byCategory: { cat: { planned, actual, delta } }, totals: { planned, actual, delta } }
  computePlannedVsActual: function(entries, budgetItems, month) {
    var actual = this.computeMonth(entries, month);
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
      result.byCategory[cat] = { planned: p, actual: a, delta: a - p };
      result.totals.planned += p;
      result.totals.actual += a;
    });

    result.totals.delta = result.totals.actual - result.totals.planned;
    return result;
  },

  // Compute category trends over last N months (from entries).
  // Returns: { categories: [str], months: [str], series: { cat: [amounts] } }
  computeCategoryTrends: function(entries, numMonths) {
    var allMonths = this.computeAllMonths(entries);
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

  // Get Set of months that have actual cashflow entries.
  getMonthsWithActuals: function(entries) {
    var months = new Set();
    (entries || []).forEach(function(e) { months.add(e.month); });
    return months;
  },

  // Generate a slug from a category name (lowercase, spaces to hyphens).
  slugify: function(str) {
    return (str || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  },

  // Build entry_id from components.
  buildEntryId: function(month, type, category) {
    return month + '_' + type + '_' + this.slugify(category);
  }
};
