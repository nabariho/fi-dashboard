// === CASH FLOW RENDERER ===
// Renders monthly cash flow overview with drill-down modals.
// Only shows months with actual cashflow entries (no derived data).
// Layout: metric cards → waterfall → monthly table (clickable) → savings rate trend
// Modal: full month detail (income, expenses, transfers, goal funding reality)

var CashFlowRenderer = {
  _waterfallChart: null,
  _trendChart: null,
  _modalData: null,

  // Store references for modal drill-down
  setModalData: function(data) {
    this._modalData = data;
  },

  render: function(waterfall, monthlyData, achievability, trailingMonths, goalPlan, budgetSummary, budgetStale) {
    var el = document.getElementById('cashflowContent');
    if (!el) return;

    // Filter to actual-only months
    var actualData = (monthlyData || []).filter(function(r) { return r.dataSource === 'actual'; });

    if (!actualData.length) {
      // Even without actual data, show budget summary if available
      if (budgetSummary) {
        el.innerHTML = this._renderBudgetSection(budgetSummary, null) +
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
    var latest = actualData[actualData.length - 1];

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

    // --- Metric cards: latest actual month ---
    html += '<div class="metrics">';
    html += this._metricCard('Monthly Income', Fmt.currency(latest.income), '');
    html += this._metricCard('Expenses', Fmt.currency(latest.impliedExpenses), '');
    html += this._metricCard('Net Savings', Fmt.currency(latest.totalContributions),
      latest.totalContributions >= 0 ? 'positive' : 'negative');
    var rateVal = latest.savingsRate * 100;
    var rateClass = rateVal >= 30 ? 'positive' : (rateVal >= 15 ? '' : 'negative');
    html += this._metricCard('Savings Rate', Fmt.pct(rateVal), rateClass);
    html += '</div>';

    // --- Budget Summary + Budget vs Actual ---
    if (budgetSummary) {
      html += this._renderBudgetSection(budgetSummary, latest);
    }

    // --- Waterfall chart ---
    html += '<div class="chart-container">' +
      '<div class="chart-header"><h2>Money Flow (' + latest.month + ')</h2></div>' +
      '<canvas id="waterfallChart"></canvas>' +
    '</div>';

    // --- Monthly Cash Flow table (clickable rows) ---
    html += '<div class="table-container"><div class="table-header-row"><h2>Monthly Cash Flow</h2></div>' +
      '<div class="nw-table-scroll"><table class="returns-table"><thead><tr>' +
      '<th>Month</th><th class="text-right">Income</th>' +
      '<th class="text-right">Expenses</th><th class="text-right">Transfers</th>' +
      '<th class="text-right">Net Savings</th><th class="text-right">Rate</th>' +
      '</tr></thead><tbody>';

    for (var i = actualData.length - 1; i >= 0; i--) {
      var r = actualData[i];
      var rate = r.savingsRate * 100;
      var rc = rate >= 30 ? 'positive' : (rate >= 15 ? '' : 'negative');
      var transfers = r.totalTransfers || 0;

      html += '<tr class="cf-row-clickable" data-month="' + r.month + '">' +
        '<td>' + r.month + '</td>' +
        '<td class="text-right">' + Fmt.currency(r.income) + '</td>' +
        '<td class="text-right">' + Fmt.currency(r.impliedExpenses) + '</td>' +
        '<td class="text-right">' + (transfers > 0 ? Fmt.currency(transfers) : '-') + '</td>' +
        '<td class="text-right ' + (r.totalContributions >= 0 ? 'positive' : 'negative') + '">' +
          Fmt.currency(r.totalContributions) + '</td>' +
        '<td class="text-right ' + rc + '">' + Fmt.pct(rate) + '</td>' +
      '</tr>';
    }

    // Trailing average row
    if (actualData.length > 1) {
      var n = Math.min(actualData.length, trailingMonths || 6);
      var recent = actualData.slice(-n);
      var avgIncome = recent.reduce(function(s, r) { return s + r.income; }, 0) / n;
      var avgExp = recent.reduce(function(s, r) { return s + r.impliedExpenses; }, 0) / n;
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

    // --- Savings Rate Trend (simple line) ---
    if (actualData.length > 1) {
      html += '<div class="chart-container">' +
        '<div class="chart-header"><h2>Savings Rate Trend</h2></div>' +
        '<canvas id="savingsRateTrendChart"></canvas>' +
      '</div>';
    }

    el.innerHTML = html;

    // Render charts
    this._renderWaterfallChart(waterfall);
    if (actualData.length > 1) {
      this._renderSavingsRateTrend(actualData);
    }

    // Bind click handlers for modal drill-down
    this._bindRowClicks(goalPlan);
  },

  // --- Budget Summary + Budget-vs-Actual Section ---
  _renderBudgetSection: function(budgetSummary, latestActual) {
    var html = '<div class="table-container"><div class="table-header-row"><h2>Monthly Budget</h2></div>';

    // Summary cards row
    html += '<div class="metrics">';
    html += this._metricCard('Total Budget', Fmt.currency(budgetSummary.total), '');
    html += this._metricCard('Fixed', Fmt.currency(budgetSummary.fixed), '');
    html += this._metricCard('Variable', Fmt.currency(budgetSummary.variable), '');
    if (latestActual) {
      var actualExp = latestActual.impliedExpenses || 0;
      var delta = actualExp - budgetSummary.total;
      var deltaClass = delta <= 0 ? 'positive' : 'negative';
      html += this._metricCard('Actual (' + latestActual.month + ')', Fmt.currency(actualExp), deltaClass);
    }
    html += '</div>';

    // Budget-vs-actual table by category (when actual data available)
    if (latestActual && latestActual.expensesByCategory) {
      html += this._renderBudgetVsActual(budgetSummary, latestActual);
    } else {
      // Budget-only category breakdown
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

      html += '</tbody></table></div>';
    }

    html += '</div>';
    return html;
  },

  _renderBudgetVsActual: function(budgetSummary, latestActual) {
    var expByCat = latestActual.expensesByCategory || {};

    // Collect all categories from both budget and actuals
    var allCats = {};
    var cats = Object.keys(budgetSummary.byCategory);
    for (var i = 0; i < cats.length; i++) allCats[cats[i]] = true;
    var actualCats = Object.keys(expByCat);
    for (var j = 0; j < actualCats.length; j++) allCats[actualCats[j]] = true;

    var sortedCats = Object.keys(allCats).sort();

    var html = '<div class="nw-table-scroll"><table class="returns-table"><thead><tr>' +
      '<th>Category</th><th class="text-right">Planned</th>' +
      '<th class="text-right">Actual</th><th class="text-right">Delta</th>' +
      '<th class="text-right">%</th>' +
      '</tr></thead><tbody>';

    var totalPlanned = 0;
    var totalActual = 0;

    for (var k = 0; k < sortedCats.length; k++) {
      var cat = sortedCats[k];
      var planned = budgetSummary.byCategory[cat] ? budgetSummary.byCategory[cat].planned : 0;
      var actual = expByCat[cat] || 0;
      var delta = actual - planned;
      var pct = planned > 0 ? (delta / planned * 100) : (actual > 0 ? 100 : 0);
      var deltaClass = delta <= 0 ? 'positive' : 'negative';

      totalPlanned += planned;
      totalActual += actual;

      html += '<tr><td>' + cat + '</td>' +
        '<td class="text-right">' + Fmt.currency(planned) + '</td>' +
        '<td class="text-right">' + Fmt.currency(actual) + '</td>' +
        '<td class="text-right ' + deltaClass + '">' +
          (delta >= 0 ? '+' : '') + Fmt.currency(delta) + '</td>' +
        '<td class="text-right ' + deltaClass + '">' +
          (pct >= 0 ? '+' : '') + pct.toFixed(0) + '%</td>' +
      '</tr>';
    }

    // Totals row
    var totalDelta = totalActual - totalPlanned;
    var totalDeltaClass = totalDelta <= 0 ? 'positive' : 'negative';
    var totalPct = totalPlanned > 0 ? (totalDelta / totalPlanned * 100) : 0;

    html += '<tr class="table-total-row">' +
      '<td>Total</td>' +
      '<td class="text-right">' + Fmt.currency(totalPlanned) + '</td>' +
      '<td class="text-right">' + Fmt.currency(totalActual) + '</td>' +
      '<td class="text-right ' + totalDeltaClass + '">' +
        (totalDelta >= 0 ? '+' : '') + Fmt.currency(totalDelta) + '</td>' +
      '<td class="text-right ' + totalDeltaClass + '">' +
        (totalPct >= 0 ? '+' : '') + totalPct.toFixed(0) + '%</td>' +
    '</tr>';

    html += '</tbody></table></div>';
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

    waterfall.goalAllocations.forEach(function(g) {
      labels.push(g.name);
      values.push(-g.allocated);
      colors.push('#e8710a');
    });

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

  // --- Savings Rate Trend (line only) ---
  _renderSavingsRateTrend: function(actualData) {
    var canvas = document.getElementById('savingsRateTrendChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (this._trendChart) this._trendChart.destroy();

    var labels = actualData.map(function(r) { return r.month; });
    var data = actualData.map(function(r) { return r.savingsRate * 100; });

    var pointColors = data.map(function(v) {
      return v >= 30 ? '#0d904f' : (v >= 15 ? '#e8710a' : '#d93025');
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

  // --- Row Click → Modal ---
  _bindRowClicks: function(goalPlan) {
    var self = this;
    var rows = document.querySelectorAll('.cf-row-clickable');
    for (var i = 0; i < rows.length; i++) {
      rows[i].addEventListener('click', function() {
        var month = this.getAttribute('data-month');
        self._openMonthModal(month, goalPlan);
      });
    }
  },

  _openMonthModal: function(month, goalPlan) {
    var md = this._modalData;
    if (!md || typeof CashflowCalculator === 'undefined') return;

    var detail = CashflowCalculator.computeMonthDetail(
      md.cashflowEntries, month, md.categories, md.subcategories
    );

    // Compute goal funding reality
    var goalFunding = null;
    if (goalPlan && goalPlan.goals && goalPlan.goals.length && md.allData) {
      goalFunding = CashflowCalculator.computeGoalFundingReality(
        month, md.allData, goalPlan.goals, detail.netSavings
      );
    }

    // Build modal HTML
    var html = '<div class="cf-modal-overlay" id="cfModalOverlay">' +
      '<div class="cf-modal">' +
        '<div class="cf-modal-header">' +
          '<h2>' + this._formatMonthName(month) + ' — Cash Flow Detail</h2>' +
          '<button class="cf-modal-close" id="cfModalClose">&times;</button>' +
        '</div>' +
        '<div class="cf-modal-body">';

    // Summary bar
    html += this._renderSummaryBar(detail, goalFunding);

    // Sections grid
    html += '<div class="cf-modal-grid">';

    // Income section
    html += '<div class="cf-modal-section">' +
      '<h3>Income</h3>' +
      this._renderDetailTable(detail.income.items, false) +
      '<div class="cf-section-total">Total: ' + Fmt.currency(detail.income.total) + '</div>' +
    '</div>';

    // Expenses section
    html += '<div class="cf-modal-section">' +
      '<h3>Expenses</h3>' +
      this._renderDetailTable(detail.expenses.items, true) +
      '<div class="cf-section-total">Total: ' + Fmt.currency(detail.expenses.total) + '</div>' +
    '</div>';

    // Transfers section
    if (detail.transfers.total > 0) {
      html += '<div class="cf-modal-section">' +
        '<h3>Transfers</h3>' +
        this._renderDetailTable(detail.transfers.items, true) +
        '<div class="cf-section-total">Total: ' + Fmt.currency(detail.transfers.total) + '</div>' +
      '</div>';
    }

    // Goal Funding Reality section
    if (goalFunding && goalFunding.goals.length) {
      html += this._renderGoalFundingSection(goalFunding);
    }

    html += '</div>'; // cf-modal-grid
    html += '</div>'; // cf-modal-body
    html += '</div>'; // cf-modal
    html += '</div>'; // cf-modal-overlay

    // Inject modal
    var existing = document.getElementById('cfModalOverlay');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', html);

    // Bind close
    var overlay = document.getElementById('cfModalOverlay');
    document.getElementById('cfModalClose').addEventListener('click', function() {
      overlay.remove();
    });
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });
    var escHandler = function(e) {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  },

  _renderSummaryBar: function(detail, goalFunding) {
    var netSavings = detail.netSavings;
    var rate = detail.savingsRate * 100;

    var html = '<div class="cf-modal-summary">' +
      this._summaryItem('Income', detail.income.total, 'cf-summary-income') +
      '<div class="cf-summary-arrow">&minus;</div>' +
      this._summaryItem('Expenses', detail.expenses.total, 'cf-summary-expenses') +
      '<div class="cf-summary-arrow">=</div>' +
      this._summaryItem('Net Savings', netSavings, netSavings >= 0 ? 'cf-summary-positive' : 'cf-summary-negative',
        ' (' + Fmt.pct(rate) + ')');

    if (detail.transfers.total > 0) {
      html += '<div class="cf-summary-divider"></div>' +
        this._summaryItem('Transfers', detail.transfers.total, 'cf-summary-transfers');
    }

    // Overdrawn warning
    if (goalFunding && goalFunding.overdrawn > 0) {
      html += '<div class="cf-summary-divider"></div>' +
        '<div class="cf-summary-item cf-summary-warning">' +
          '<div class="cf-summary-label">Goal Overdraw</div>' +
          '<div class="cf-summary-value">' + Fmt.currency(goalFunding.overdrawn) + '</div>' +
        '</div>';
    }

    html += '</div>';
    return html;
  },

  _summaryItem: function(label, value, cls, suffix) {
    return '<div class="cf-summary-item ' + cls + '">' +
      '<div class="cf-summary-label">' + label + '</div>' +
      '<div class="cf-summary-value">' + Fmt.currency(value) + (suffix || '') + '</div>' +
    '</div>';
  },

  _renderGoalFundingSection: function(gf) {
    var html = '<div class="cf-modal-section cf-modal-section-wide">' +
      '<h3>Goal Funding Reality</h3>';

    // Explanation
    if (gf.overdrawn > 0) {
      html += '<div class="cf-funding-alert cf-funding-alert-warning">' +
        'You moved ' + Fmt.currency(gf.totalActual) + ' to goal accounts but only saved ' +
        Fmt.currency(gf.availableSavings) + ' this month. The extra ' +
        Fmt.currency(gf.overdrawn) + ' came from other reserves.' +
      '</div>';
    } else if (gf.totalActual > 0 && gf.availableSavings > gf.totalActual) {
      html += '<div class="cf-funding-alert cf-funding-alert-ok">' +
        'Saved ' + Fmt.currency(gf.availableSavings) + ', allocated ' +
        Fmt.currency(gf.totalActual) + ' to goals. ' +
        Fmt.currency(gf.availableSavings - gf.totalActual) + ' unallocated.' +
      '</div>';
    }

    // Goal table
    html += '<table class="cf-detail-table"><thead><tr>' +
      '<th>Goal</th><th>P</th>' +
      '<th class="text-right">Planned/mo</th>' +
      '<th class="text-right">Actual</th>' +
      '<th class="text-right">Delta</th>' +
      '<th>Status</th>' +
    '</tr></thead><tbody>';

    gf.goals.forEach(function(g) {
      var deltaClass = '';
      var statusLabel = '';
      var statusClass = '';

      if (g.status === 'withdrawn') {
        deltaClass = 'negative';
        statusLabel = 'Withdrawn';
        statusClass = 'negative';
      } else if (g.status === 'underfunded') {
        deltaClass = 'negative';
        statusLabel = 'Underfunded';
        statusClass = 'negative';
      } else if (g.status === 'overfunded') {
        deltaClass = 'positive';
        statusLabel = 'Overfunded';
        statusClass = '';
      } else {
        statusLabel = 'On track';
        statusClass = 'positive';
      }

      html += '<tr>' +
        '<td>' + g.name + '</td>' +
        '<td>P' + g.priority + '</td>' +
        '<td class="text-right">' + Fmt.currency(g.planned) + '</td>' +
        '<td class="text-right">' + Fmt.currency(g.actual) + '</td>' +
        '<td class="text-right ' + deltaClass + '">' +
          (g.delta >= 0 ? '+' : '') + Fmt.currency(g.delta) + '</td>' +
        '<td class="' + statusClass + '">' + statusLabel + '</td>' +
      '</tr>';
    });

    // Totals row
    var totalDelta = gf.totalActual - gf.totalPlanned;
    html += '<tr class="table-total-row">' +
      '<td colspan="2">Total</td>' +
      '<td class="text-right">' + Fmt.currency(gf.totalPlanned) + '</td>' +
      '<td class="text-right">' + Fmt.currency(gf.totalActual) + '</td>' +
      '<td class="text-right">' + (totalDelta >= 0 ? '+' : '') + Fmt.currency(totalDelta) + '</td>' +
      '<td></td>' +
    '</tr>';

    html += '</tbody></table></div>';
    return html;
  },

  _renderDetailTable: function(items, showSubcategory) {
    if (!items.length) return '<p class="text-secondary">No entries</p>';

    var html = '<table class="cf-detail-table"><thead><tr>' +
      '<th>Category</th>';
    if (showSubcategory) html += '<th>Subcategory</th>';
    html += '<th class="text-right">Amount</th></tr></thead><tbody>';

    items.forEach(function(item) {
      html += '<tr><td>' + item.category + '</td>';
      if (showSubcategory) html += '<td>' + (item.subcategory || '-') + '</td>';
      html += '<td class="text-right">' + Fmt.currency(item.amount) + '</td></tr>';
    });

    html += '</tbody></table>';
    return html;
  },

  _formatMonthName: function(monthStr) {
    var parts = monthStr.split('-');
    var monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return monthNames[parseInt(parts[1], 10) - 1] + ' ' + parts[0];
  }
};
