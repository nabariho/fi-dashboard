// === BUDGET CALCULATOR ===
// Computes monthly budget totals from BudgetItems. Pure math, no DOM access.

var BudgetCalculator = {
  // Convert an amount to its monthly equivalent
  toMonthly: function(amount, frequency) {
    switch (frequency) {
      case 'yearly': return amount / 12;
      case 'quarterly': return amount / 4;
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

    return result;
  },

  // Compute operating reserve (total monthly budget) for goals calculations
  computeOperatingReserve: function(items) {
    return this.computeMonthlyBudget(items).total;
  }
};
