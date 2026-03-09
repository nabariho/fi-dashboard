// === UI: BUDGET OVERVIEW ===
// Renders budget breakdown grouped by category. No data processing.

var BudgetRenderer = {
  _frequencyLabel: function(type, frequency) {
    if (type === 'variable') return 'monthly (est.)';
    return frequency || 'monthly';
  },

  renderBudgetOverview: function(budget) {
    var el = document.getElementById('budgetDetail');
    if (!el) return;

    var html = '';

    // Summary cards
    html += '<div class="metrics">' +
      '<div class="metric-card">' +
        '<div class="label">Total Monthly Budget</div>' +
        '<div class="value">' + Fmt.currency(budget.total) + '</div>' +
      '</div>' +
      '<div class="metric-card">' +
        '<div class="label">Fixed Expenses</div>' +
        '<div class="value">' + Fmt.currency(budget.fixed) + '</div>' +
        '<div class="sub">' + (budget.fixedPct || 0).toFixed(0) + '% of total</div>' +
      '</div>' +
      '<div class="metric-card">' +
        '<div class="label">Variable Expenses</div>' +
        '<div class="value">' + Fmt.currency(budget.variable) + '</div>' +
        '<div class="sub">' + (budget.variablePct || 0).toFixed(0) + '% of total</div>' +
      '</div>' +
    '</div>';

    // Items table grouped by category
    var categories = Object.keys(budget.byCategory).sort();

    html += '<div class="table-container">' +
      '<div class="table-header-row"><h2>Budget Items by Category</h2></div>' +
      '<table class="budget-table"><thead><tr>' +
        '<th>Item</th><th>Type</th><th class="text-right">Amount</th>' +
        '<th>Frequency</th><th class="text-right">Monthly</th>' +
      '</tr></thead><tbody>';

    for (var c = 0; c < categories.length; c++) {
      var cat = categories[c];
      var group = budget.byCategory[cat];

      // Category header row
      html += '<tr class="budget-category-row"><td colspan="4">' + cat + '</td>' +
        '<td class="text-right">' + Fmt.currency(group.planned) + '</td></tr>';

      // Item rows
      for (var j = 0; j < group.items.length; j++) {
        var item = group.items[j];
        html += '<tr>' +
          '<td class="budget-item-name">' + item.name + '</td>' +
          '<td><span class="budget-type-badge budget-type-' + item.type + '">' + item.type + '</span></td>' +
          '<td class="text-right">' + Fmt.currency(item.amount) + '</td>' +
          '<td>' + this._frequencyLabel(item.type, item.frequency) + '</td>' +
          '<td class="text-right">' + Fmt.currency(item.monthly) + '</td>' +
        '</tr>';
      }
    }

    // Total row
    html += '<tr class="total-row">' +
      '<td colspan="4"><strong>Total Monthly Budget</strong></td>' +
      '<td class="text-right"><strong>' + Fmt.currency(budget.total) + '</strong></td>' +
    '</tr>';

    html += '</tbody></table></div>';

    el.innerHTML = html;
  }
};
