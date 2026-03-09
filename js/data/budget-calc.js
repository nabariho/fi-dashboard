// === BUDGET CALCULATOR ===
// Computes monthly budget totals from BudgetItems. Pure math, no DOM access.

var BudgetCalculator = {
  // Convert an amount to its monthly equivalent (rounded to 2 decimals for precision)
  toMonthly: function(amount, frequency) {
    switch (frequency) {
      case 'yearly': return Math.round(amount / 12 * 100) / 100;
      case 'quarterly': return Math.round(amount / 4 * 100) / 100;
      case 'monthly':
      default: return amount;
    }
  },

  // Compute full monthly budget breakdown from budget items
  // items: array of { item_id, name, type, amount, frequency, category, active }
  // Returns: { total, fixed, variable, byCategory: { cat: { planned, items: [...] } } }
  computeMonthlyBudget: function(items) {
    var result = { total: 0, fixed: 0, variable: 0, byCategory: {} };

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item.active) continue;

      var monthly = item.type === 'variable'
        ? item.amount
        : this.toMonthly(item.amount, item.frequency);

      var cat = item.category || 'Other';
      if (!result.byCategory[cat]) {
        result.byCategory[cat] = { planned: 0, items: [] };
      }

      result.byCategory[cat].items.push({
        item_id: item.item_id,
        name: item.name,
        type: item.type,
        amount: item.amount,
        frequency: item.frequency,
        monthly: monthly
      });

      result.byCategory[cat].planned += monthly;
      result.total += monthly;

      if (item.type === 'fixed') {
        result.fixed += monthly;
      } else {
        result.variable += monthly;
      }
    }

    // Pre-computed percentages for UI
    result.fixedPct = result.total > 0 ? (result.fixed / result.total * 100) : 0;
    result.variablePct = result.total > 0 ? (result.variable / result.total * 100) : 0;

    return result;
  },

  // Detect budget staleness: returns null if OK, or { avgActual, planned, deviation } if stale.
  // recentActualMonths: array of monthly rows with dataSource==='actual'
  // threshold: deviation ratio (default 0.15 = 15%)
  computeStaleness: function(budgetTotal, recentActualMonths, threshold) {
    threshold = threshold || 0.15;
    if (budgetTotal <= 0 || !recentActualMonths || recentActualMonths.length < 3) return null;
    var avgActual = recentActualMonths.reduce(function(s, r) { return s + r.impliedExpenses; }, 0) / recentActualMonths.length;
    var deviation = Math.abs(avgActual - budgetTotal) / budgetTotal;
    if (deviation <= threshold) return null;
    return { avgActual: avgActual, planned: budgetTotal, deviation: deviation };
  },

  // Compute operating reserve (total monthly budget) for goals calculations
  computeOperatingReserve: function(items) {
    return this.computeMonthlyBudget(items).total;
  }
};
