// === CASH FLOW RENDERER ===
// Renders Cash Flow tab with month selector, inline P&L, expandable expenses,
// budget vs actual, waterfall, category trends, history table, savings rate trend.
// No modals — all detail is inline, driven by selected month.

var CashFlowRenderer = {
  _waterfallChart: null,
  _trendChart: null,
  _categoryTrendsChart: null,

  // Main render entry point. Receives a single renderData object from app.js.
  render: function(renderData) {
    var el = document.getElementById('cashflowContent');
    if (!el) return;

    var monthlyData = renderData.monthlyData || [];
    var pnl = renderData.pnl;
    var budgetVsActual = renderData.budgetVsActual;
    var insights = renderData.insights;
    var waterfall = renderData.waterfall;
    var categoryTrends = renderData.categoryTrends;
    var budgetSummary = renderData.budgetSummary;
    var budgetStale = renderData.budgetStale;
    var selectedMonth = renderData.selectedMonth;
    var months = renderData.months || [];

    if (!months.length) {
      if (budgetSummary) {
        el.innerHTML = this._renderBudgetOnlySection(budgetSummary) +
          '<div class="empty-state-panel"><div class="empty-state-icon">&#128200;</div>' +
          '<div class="empty-state-title">No cash flow data yet</div>' +
          '<div class="empty-state-desc">Import actual income and expense data via Admin &gt; Cash Flow to see your cash flow analysis and budget-vs-actual comparison.</div></div>';
        return;
      }
      el.innerHTML =
        '<div class="empty-state-panel"><div class="empty-state-icon">&#128200;</div>' +
        '<div class="empty-state-title">No cash flow data</div>' +
        '<div class="empty-state-desc">Import actual income and expense data via Admin &gt; Cash Flow to see your cash flow analysis.</div></div>';
      return;
    }

    var html = '';

    // --- Budget staleness alert ---
    if (budgetStale) {
      html += '<div class="cf-budget-stale-alert">' +
        '<strong>Budget may be outdated</strong> — actual expenses averaged ' +
        Fmt.currency(budgetStale.avgActual) + '/mo vs planned ' +
        Fmt.currency(budgetStale.planned) + '/mo (' +
        (budgetStale.deviation * 100).toFixed(0) + '% deviation). ' +
        'Consider updating your budget in Admin.' +
      '</div>';
    }

    // --- Month Selector ---
    html += this._renderMonthSelector(months, selectedMonth);

    // --- P&L Statement ---
    if (pnl) {
      html += this._renderPnL(pnl);
    }

    // --- Income Breakdown ---
    if (pnl && pnl.income.total > 0) {
      html += this._renderIncomeBreakdown(pnl);
    }

    // --- Expense Breakdown (expandable) ---
    if (pnl && pnl.expenses.total > 0) {
      html += this._renderExpenseBreakdown(pnl);
    }

    // --- Budget vs Actual (for selected month) ---
    if (budgetVsActual) {
      html += this._renderBudgetVsActual(budgetVsActual, selectedMonth);
    }

    // --- Waterfall Chart ---
    if (waterfall) {
      html += '<div class="chart-container">' +
        '<div class="chart-header"><h2>Money Flow (' + selectedMonth + ')</h2></div>' +
        '<canvas id="waterfallChart"></canvas>' +
      '</div>';
    }

    // --- Insights (MoM changes + top spending) ---
    if (insights) {
      html += this._renderInsights(insights);
    }

    // --- Category Expense Trends (cross-month) ---
    if (categoryTrends && categoryTrends.months.length > 1) {
      html += '<div class="chart-container">' +
        '<div class="chart-header"><h2>Expense Trends (Last 12 Months)</h2></div>' +
        '<canvas id="categoryTrendsChart"></canvas>' +
      '</div>';
    }

    // --- Monthly Cash Flow History (clickable rows) ---
    html += this._renderHistoryTable(monthlyData, selectedMonth);

    // --- Savings Rate Trend ---
    if (monthlyData.length > 1) {
      html += '<div class="chart-container">' +
        '<div class="chart-header"><h2>Savings Rate Trend</h2></div>' +
        '<canvas id="savingsRateTrendChart"></canvas>' +
      '</div>';
    }

    el.innerHTML = html;

    // Render charts after DOM is set
    if (waterfall) this._renderWaterfallChart(waterfall);
    if (categoryTrends && categoryTrends.months.length > 1) this._renderCategoryTrendsChart(categoryTrends);
    if (monthlyData.length > 1) this._renderSavingsRateTrend(monthlyData);

    // Bind expandable expense rows
    this._bindExpenseExpand();

    // Bind history row clicks
    this._bindHistoryRowClicks();
  },

  // --- Month Selector ---
  _renderMonthSelector: function(months, selectedMonth) {
    var html = '<div class="cf-month-selector">';
    html += '<button class="cf-month-nav-btn" id="cfMonthPrev" title="Previous month">&#9664;</button>';
    html += '<select id="cfMonthSelect">';
    for (var i = months.length - 1; i >= 0; i--) {
      var sel = months[i] === selectedMonth ? ' selected' : '';
      html += '<option value="' + months[i] + '"' + sel + '>' + this._formatMonthName(months[i]) + '</option>';
    }
    html += '</select>';
    html += '<button class="cf-month-nav-btn" id="cfMonthNext" title="Next month">&#9654;</button>';
    html += '</div>';

    // Bind after render via setTimeout (DOM not yet available)
    var self = this;
    setTimeout(function() {
      var select = document.getElementById('cfMonthSelect');
      var prev = document.getElementById('cfMonthPrev');
      var next = document.getElementById('cfMonthNext');
      if (select) {
        select.addEventListener('change', function() {
          if (window.onCashflowMonthChange) window.onCashflowMonthChange(this.value);
        });
      }
      if (prev) {
        prev.addEventListener('click', function() {
          var idx = months.indexOf(selectedMonth);
          if (idx > 0 && window.onCashflowMonthChange) window.onCashflowMonthChange(months[idx - 1]);
        });
      }
      if (next) {
        next.addEventListener('click', function() {
          var idx = months.indexOf(selectedMonth);
          if (idx < months.length - 1 && window.onCashflowMonthChange) window.onCashflowMonthChange(months[idx + 1]);
        });
      }
    }, 0);

    return html;
  },

  // --- P&L Statement ---
  _renderPnL: function(pnl) {
    var netCls = pnl.netSavingsStatus === 'positive' ? 'cf-summary-positive' :
      (pnl.netSavingsStatus === 'negative' ? 'cf-summary-negative' : '');
    var ratePct = (pnl.savingsRate * 100).toFixed(1);

    var html = '<div class="cf-pnl">' +
      this._summaryItem('Income', pnl.income.total, 'cf-summary-income') +
      '<div class="cf-summary-arrow">&minus;</div>' +
      this._summaryItem('Expenses', pnl.expenses.total, 'cf-summary-expenses') +
      '<div class="cf-summary-arrow">=</div>' +
      this._summaryItem('Net Savings', pnl.netSavings, netCls,
        ' (' + ratePct + '%)');

    if (pnl.transfers.total > 0) {
      html += '<div class="cf-summary-divider"></div>' +
        this._summaryItem('Transfers', pnl.transfers.total, 'cf-summary-transfers');
    }

    html += '</div>';
    return html;
  },

  _summaryItem: function(label, value, cls, suffix) {
    return '<div class="cf-summary-item ' + (cls || '') + '">' +
      '<div class="cf-summary-label">' + label + '</div>' +
      '<div class="cf-summary-value">' + Fmt.currency(value) + (suffix || '') + '</div>' +
    '</div>';
  },

  // --- Income Breakdown ---
  _renderIncomeBreakdown: function(pnl) {
    var cats = Object.keys(pnl.income.byCategory).sort(function(a, b) {
      return pnl.income.byCategory[b] - pnl.income.byCategory[a];
    });

    var html = '<div class="table-container"><div class="table-header-row"><h2>Income Breakdown</h2></div>' +
      '<div class="nw-table-scroll"><table class="returns-table"><thead><tr>' +
      '<th>Category</th><th class="text-right">Amount</th><th class="text-right">% of Total</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < cats.length; i++) {
      var amt = pnl.income.byCategory[cats[i]];
      var pct = pnl.income.total > 0 ? (amt / pnl.income.total * 100).toFixed(1) : '0.0';
      html += '<tr><td>' + cats[i] + '</td>' +
        '<td class="text-right">' + Fmt.currency(amt) + '</td>' +
        '<td class="text-right">' + pct + '%</td></tr>';
    }

    html += '<tr class="table-total-row"><td>Total</td>' +
      '<td class="text-right">' + Fmt.currency(pnl.income.total) + '</td>' +
      '<td class="text-right">100%</td></tr>';

    html += '</tbody></table></div></div>';
    return html;
  },

  // --- Expense Breakdown (expandable subcategories) ---
  _renderExpenseBreakdown: function(pnl) {
    var catKeys = Object.keys(pnl.expenses.byCategory).sort(function(a, b) {
      return pnl.expenses.byCategory[b].total - pnl.expenses.byCategory[a].total;
    });

    var html = '<div class="table-container"><div class="table-header-row"><h2>Expense Breakdown</h2></div>' +
      '<div class="nw-table-scroll"><table class="returns-table"><thead><tr>' +
      '<th>Category</th><th class="text-right">Amount</th><th class="text-right">% of Total</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < catKeys.length; i++) {
      var cat = catKeys[i];
      var catObj = pnl.expenses.byCategory[cat];
      var pct = pnl.expenses.total > 0 ? (catObj.total / pnl.expenses.total * 100).toFixed(1) : '0.0';
      var hasSubcats = Object.keys(catObj.subcategories).length > 0 || catObj.items.length > 1;
      var chevron = hasSubcats ? '<span class="cf-cat-chevron">&#9654;</span>' : '<span style="display:inline-block;width:16px"></span>';

      html += '<tr class="' + (hasSubcats ? 'cf-cat-row' : '') + '" data-category="' + cat + '">' +
        '<td>' + chevron + cat + '</td>' +
        '<td class="text-right">' + Fmt.currency(catObj.total) + '</td>' +
        '<td class="text-right">' + pct + '%</td></tr>';

      // Subcategory rows (hidden by default)
      if (hasSubcats) {
        for (var j = 0; j < catObj.items.length; j++) {
          var item = catObj.items[j];
          var subLabel = item.subcategory || '(no subcategory)';
          var notesHtml = item.notes ? ' <span class="cf-subcat-notes">' + item.notes + '</span>' : '';
          html += '<tr class="cf-subcat-row" data-parent="' + cat + '">' +
            '<td>' + subLabel + notesHtml + '</td>' +
            '<td class="text-right">' + Fmt.currency(item.amount) + '</td>' +
            '<td class="text-right"></td></tr>';
        }
      }
    }

    html += '<tr class="table-total-row"><td><span style="display:inline-block;width:16px"></span>Total</td>' +
      '<td class="text-right">' + Fmt.currency(pnl.expenses.total) + '</td>' +
      '<td class="text-right">100%</td></tr>';

    html += '</tbody></table></div></div>';
    return html;
  },

  // --- Bind expandable expense row clicks ---
  _bindExpenseExpand: function() {
    var rows = document.querySelectorAll('.cf-cat-row');
    for (var i = 0; i < rows.length; i++) {
      rows[i].addEventListener('click', function() {
        var cat = this.getAttribute('data-category');
        var isExpanded = this.classList.contains('expanded');
        this.classList.toggle('expanded');
        var subRows = document.querySelectorAll('.cf-subcat-row[data-parent="' + cat + '"]');
        for (var j = 0; j < subRows.length; j++) {
          if (isExpanded) {
            subRows[j].classList.remove('visible');
          } else {
            subRows[j].classList.add('visible');
          }
        }
      });
    }
  },

  // --- Budget vs Actual (for selected month) ---
  _renderBudgetVsActual: function(bva, selectedMonth) {
    if (!bva || !bva.byCategory) return '';
    var cats = Object.keys(bva.byCategory).sort();
    if (!cats.length) return '';

    var html = '<div class="table-container"><div class="table-header-row">' +
      '<h2>Budget vs Actual (' + selectedMonth + ')</h2></div>' +
      '<div class="nw-table-scroll"><table class="returns-table"><thead><tr>' +
      '<th>Category</th><th class="text-right">Planned</th>' +
      '<th class="text-right">Actual</th><th class="text-right">Delta</th>' +
      '<th class="text-right">%</th></tr></thead><tbody>';

    for (var i = 0; i < cats.length; i++) {
      var c = bva.byCategory[cats[i]];
      html += '<tr><td>' + cats[i] + '</td>' +
        '<td class="text-right">' + Fmt.currency(c.planned) + '</td>' +
        '<td class="text-right">' + Fmt.currency(c.actual) + '</td>' +
        '<td class="text-right ' + c.varianceStatus + '">' +
          (c.delta >= 0 ? '+' : '') + Fmt.currency(c.delta) + '</td>' +
        '<td class="text-right ' + c.varianceStatus + '">' +
          (c.variancePct >= 0 ? '+' : '') + c.variancePct.toFixed(0) + '%</td></tr>';
    }

    // Totals
    var t = bva.totals;
    html += '<tr class="table-total-row">' +
      '<td>Total</td>' +
      '<td class="text-right">' + Fmt.currency(t.planned) + '</td>' +
      '<td class="text-right">' + Fmt.currency(t.actual) + '</td>' +
      '<td class="text-right ' + t.varianceStatus + '">' +
        (t.delta >= 0 ? '+' : '') + Fmt.currency(t.delta) + '</td>' +
      '<td class="text-right ' + t.varianceStatus + '">' +
        (t.variancePct >= 0 ? '+' : '') + t.variancePct.toFixed(0) + '%</td></tr>';

    html += '</tbody></table></div></div>';
    return html;
  },

  // --- Insights (Top Spending + MoM Changes) ---
  _renderInsights: function(insights) {
    if (!insights) return '';

    var html = '<div class="cf-insights">';

    // Top Spending
    if (insights.topExpenseCategories && insights.topExpenseCategories.length) {
      html += '<div class="cf-insight-card"><h3>Top Spending Categories</h3>';
      for (var i = 0; i < insights.topExpenseCategories.length; i++) {
        var tc = insights.topExpenseCategories[i];
        html += '<div class="cf-insight-item">' +
          '<span>' + tc.category + '</span>' +
          '<span>' + Fmt.currency(tc.amount) + ' (' + (tc.pctOfTotal * 100).toFixed(0) + '%)</span>' +
        '</div>';
      }
      html += '</div>';
    }

    // Month-over-Month Changes
    if (insights.hasPriorMonth && insights.expenseChanges.length) {
      html += '<div class="cf-insight-card"><h3>Month-over-Month Changes</h3>';
      var changes = insights.expenseChanges.slice(0, 5);
      for (var j = 0; j < changes.length; j++) {
        var ch = changes[j];
        var arrow = ch.delta > 0 ? '&#9650;' : (ch.delta < 0 ? '&#9660;' : '&#8212;');
        html += '<div class="cf-insight-item">' +
          '<span>' + ch.category + '</span>' +
          '<span class="' + ch.deltaStatus + '">' + arrow + ' ' +
            (ch.delta >= 0 ? '+' : '') + Fmt.currency(ch.delta) + '</span>' +
        '</div>';
      }
      html += '</div>';
    } else if (!insights.hasPriorMonth) {
      html += '<div class="cf-insight-card"><h3>Month-over-Month Changes</h3>' +
        '<p class="text-secondary">No prior month for comparison</p></div>';
    }

    html += '</div>';
    return html;
  },

  // --- History Table ---
  _renderHistoryTable: function(monthlyData, selectedMonth) {
    if (!monthlyData.length) return '';

    var html = '<div class="table-container"><div class="table-header-row"><h2>Monthly Cash Flow</h2></div>' +
      '<div class="nw-table-scroll"><table class="returns-table"><thead><tr>' +
      '<th>Month</th><th class="text-right">Income</th>' +
      '<th class="text-right">Expenses</th><th class="text-right">Transfers</th>' +
      '<th class="text-right">Net Savings</th><th class="text-right">Rate</th>' +
      '</tr></thead><tbody>';

    for (var i = monthlyData.length - 1; i >= 0; i--) {
      var r = monthlyData[i];
      var transfers = r.totalTransfers || 0;
      var isSelected = r.month === selectedMonth ? ' style="background:rgba(26,115,232,0.08)"' : '';

      html += '<tr class="cf-row-clickable" data-month="' + r.month + '"' + isSelected + '>' +
        '<td>' + r.month + '</td>' +
        '<td class="text-right">' + Fmt.currency(r.income) + '</td>' +
        '<td class="text-right">' + Fmt.currency(r.expenses) + '</td>' +
        '<td class="text-right">' + (transfers > 0 ? Fmt.currency(transfers) : '-') + '</td>' +
        '<td class="text-right ' + r.savingsRateStatus + '">' +
          Fmt.currency(r.totalContributions) + '</td>' +
        '<td class="text-right ' + r.savingsRateStatus + '">' + Fmt.pct(r.savingsRate * 100) + '</td>' +
      '</tr>';
    }

    // Trailing average row
    if (monthlyData.length > 1) {
      var n = Math.min(monthlyData.length, 6);
      var recent = monthlyData.slice(-n);
      var avgIncome = recent.reduce(function(s, r) { return s + r.income; }, 0) / n;
      var avgExp = recent.reduce(function(s, r) { return s + r.expenses; }, 0) / n;
      var avgTransfers = recent.reduce(function(s, r) { return s + (r.totalTransfers || 0); }, 0) / n;
      var avgSavings = recent.reduce(function(s, r) { return s + r.totalContributions; }, 0) / n;
      var avgRate = avgIncome > 0 ? (avgIncome - avgExp) / avgIncome * 100 : 0;
      html += '<tr class="table-total-row">' +
        '<td>' + n + '-mo avg</td>' +
        '<td class="text-right">' + Fmt.currency(avgIncome) + '</td>' +
        '<td class="text-right">' + Fmt.currency(avgExp) + '</td>' +
        '<td class="text-right">' + (avgTransfers > 0 ? Fmt.currency(avgTransfers) : '-') + '</td>' +
        '<td class="text-right">' + Fmt.currency(avgSavings) + '</td>' +
        '<td class="text-right">' + Fmt.pct(avgRate) + '</td>' +
      '</tr>';
    }

    html += '</tbody></table></div></div>';
    return html;
  },

  // --- Bind history row clicks (change month) ---
  _bindHistoryRowClicks: function() {
    var rows = document.querySelectorAll('.cf-row-clickable');
    for (var i = 0; i < rows.length; i++) {
      rows[i].addEventListener('click', function() {
        var month = this.getAttribute('data-month');
        if (window.onCashflowMonthChange) window.onCashflowMonthChange(month);
      });
    }
  },

  // --- Budget-only section (no actuals yet) ---
  _renderBudgetOnlySection: function(budgetSummary) {
    var html = '<div class="table-container"><div class="table-header-row"><h2>Monthly Budget</h2></div>';
    html += '<div class="metrics">';
    html += this._metricCard('Total Budget', Fmt.currency(budgetSummary.total), '');
    html += this._metricCard('Fixed', Fmt.currency(budgetSummary.fixed), '');
    html += this._metricCard('Variable', Fmt.currency(budgetSummary.variable), '');
    html += '</div>';

    html += '<div class="nw-table-scroll"><table class="returns-table"><thead><tr>' +
      '<th>Category</th><th class="text-right">Fixed</th>' +
      '<th class="text-right">Variable</th><th class="text-right">Total</th>' +
      '</tr></thead><tbody>';

    var cats = Object.keys(budgetSummary.byCategory).sort();
    for (var i = 0; i < cats.length; i++) {
      var cat = cats[i];
      var catData = budgetSummary.byCategory[cat];
      var fixedAmt = 0;
      var varAmt = 0;
      for (var j = 0; j < catData.items.length; j++) {
        if (catData.items[j].type === 'fixed') fixedAmt += catData.items[j].monthly;
        else varAmt += catData.items[j].monthly;
      }
      html += '<tr><td>' + cat + '</td>' +
        '<td class="text-right">' + (fixedAmt > 0 ? Fmt.currency(fixedAmt) : '-') + '</td>' +
        '<td class="text-right">' + (varAmt > 0 ? Fmt.currency(varAmt) : '-') + '</td>' +
        '<td class="text-right">' + Fmt.currency(catData.planned) + '</td></tr>';
    }

    html += '</tbody></table></div></div>';
    return html;
  },

  _metricCard: function(label, value, cls) {
    return '<div class="metric-card"><div class="label">' + label + '</div>' +
      '<div class="value ' + (cls || '') + '">' + value + '</div></div>';
  },

  // --- Waterfall Chart ---
  _renderWaterfallChart: function(waterfall) {
    var canvas = document.getElementById('waterfallChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (this._waterfallChart) this._waterfallChart.destroy();

    var labels = ['Income'];
    var values = [waterfall.income];
    var colors = ['#1a73e8'];

    labels.push('Expenses');
    values.push(-waterfall.actualExpenses);
    colors.push('#d93025');

    if (waterfall.goalAllocations) {
      waterfall.goalAllocations.forEach(function(g) {
        labels.push(g.name);
        values.push(-g.allocated);
        colors.push('#e8710a');
      });
    }

    if (waterfall.unallocated > 0) {
      labels.push('Unallocated');
      values.push(-waterfall.unallocated);
      colors.push('#9334e6');
    }

    var bases = [0];
    var heights = [waterfall.income];
    var running = waterfall.income;
    for (var i = 1; i < values.length; i++) {
      running += values[i];
      bases.push(running);
      heights.push(-values[i]);
    }

    this._waterfallChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Base', data: bases, backgroundColor: 'transparent', borderWidth: 0, barPercentage: 0.6 },
          { label: 'Amount', data: heights, backgroundColor: colors, borderWidth: 0, barPercentage: 0.6 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(ctx) {
                if (ctx.datasetIndex === 0) return null;
                return Fmt.currency(ctx.raw);
              }
            }
          }
        },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, ticks: { callback: function(v) { return Fmt.currency(v); } } }
        }
      }
    });
  },

  // --- Category Trends Stacked Bar Chart ---
  _renderCategoryTrendsChart: function(trends) {
    var canvas = document.getElementById('categoryTrendsChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (this._categoryTrendsChart) this._categoryTrendsChart.destroy();

    var palette = [
      '#1a73e8', '#d93025', '#0d904f', '#e8710a', '#9334e6',
      '#00897b', '#c2185b', '#5c6bc0', '#fb8c00', '#43a047'
    ];

    var datasets = [];
    for (var i = 0; i < trends.categories.length; i++) {
      var cat = trends.categories[i];
      datasets.push({
        label: cat,
        data: trends.series[cat],
        backgroundColor: palette[i % palette.length],
        borderWidth: 0
      });
    }

    this._categoryTrendsChart = new Chart(canvas, {
      type: 'bar',
      data: { labels: trends.months, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: function(ctx) { return ctx.dataset.label + ': ' + Fmt.currency(ctx.raw); }
            }
          }
        },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, ticks: { callback: function(v) { return Fmt.currency(v); } } }
        }
      }
    });
  },

  // --- Savings Rate Trend ---
  _renderSavingsRateTrend: function(actualData) {
    var canvas = document.getElementById('savingsRateTrendChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (this._trendChart) this._trendChart.destroy();

    var labels = actualData.map(function(r) { return r.month; });
    var data = actualData.map(function(r) { return r.savingsRate * 100; });

    var statusColors = { positive: '#0d904f', neutral: '#e8710a', negative: '#d93025' };
    var pointColors = actualData.map(function(r) {
      return statusColors[r.savingsRateStatus] || '#e8710a';
    });

    this._trendChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Savings Rate',
          data: data,
          borderColor: '#1a73e8',
          backgroundColor: 'rgba(26,115,232,0.08)',
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: pointColors,
          tension: 0.25
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(ctx) { return 'Savings Rate: ' + ctx.raw.toFixed(1) + '%'; }
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            ticks: { callback: function(v) { return v + '%'; } },
            suggestedMin: 0,
            suggestedMax: 100
          }
        }
      }
    });
  },

  _formatMonthName: function(monthStr) {
    var parts = monthStr.split('-');
    var monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return monthNames[parseInt(parts[1], 10) - 1] + ' ' + parts[0];
  }
};
