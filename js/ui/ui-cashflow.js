// === CASH FLOW RENDERER ===
// Renders monthly cash flow overview with drill-down modals.
// Layout: metric cards → waterfall → monthly table (clickable) → savings rate trend
// Modal: full month detail (income, expenses, transfers, goal allocations)

var CashFlowRenderer = {
  _waterfallChart: null,
  _trendChart: null,
  _modalData: null, // { cashflowEntries, categories, subcategories, goalPlan }

  // Store references for modal drill-down
  setModalData: function(data) {
    this._modalData = data;
  },

  render: function(waterfall, monthlyData, achievability, trailingMonths, goalPlan) {
    var el = document.getElementById('cashflowContent');
    if (!el) return;

    if (!monthlyData || !monthlyData.length) {
      el.innerHTML =
        '<div class="empty-state-panel"><div class="empty-state-icon">&#128200;</div>' +
        '<div class="empty-state-title">No cash flow data</div>' +
        '<div class="empty-state-desc">Add month-end data and configure account roles (savings/transactional) in Admin to see cash flow analysis.</div></div>';
      return;
    }

    var html = '';
    var latest = monthlyData[monthlyData.length - 1];

    // --- Metric cards: latest month snapshot ---
    html += '<div class="metrics">';
    html += this._metricCard('Monthly Income', Fmt.currency(latest.income), '');
    html += this._metricCard('Expenses', Fmt.currency(latest.impliedExpenses), '');
    html += this._metricCard('Net Savings', Fmt.currency(latest.totalContributions),
      latest.totalContributions >= 0 ? 'positive' : 'negative');
    var rateVal = latest.savingsRate * 100;
    var rateClass = rateVal >= 30 ? 'positive' : (rateVal >= 15 ? '' : 'negative');
    html += this._metricCard('Savings Rate', Fmt.pct(rateVal), rateClass);
    html += '</div>';

    // --- Waterfall chart ---
    html += '<div class="chart-container">' +
      '<div class="chart-header"><h2>Money Flow (' + latest.month + ')</h2></div>' +
      '<canvas id="waterfallChart"></canvas>' +
    '</div>';

    // --- Monthly Cash Flow table (clickable rows) ---
    html += '<div class="table-container"><div class="table-header-row"><h2>Monthly Cash Flow</h2></div>' +
      '<div class="nw-table-scroll"><table class="returns-table"><thead><tr>' +
      '<th>Month</th><th style="text-align:right">Income</th>' +
      '<th style="text-align:right">Expenses</th><th style="text-align:right">Transfers</th>' +
      '<th style="text-align:right">Goal Funding</th>' +
      '<th style="text-align:right">Net Savings</th><th style="text-align:right">Rate</th>' +
      '</tr></thead><tbody>';

    // Goal allocations per goal (same for all months — based on current plan)
    var totalGoalFunding = 0;
    if (goalPlan && goalPlan.goals) {
      goalPlan.goals.forEach(function(g) {
        totalGoalFunding += (g.allocated_monthly || 0);
      });
    }

    var displayed = monthlyData.slice(-24);
    for (var i = displayed.length - 1; i >= 0; i--) {
      var r = displayed[i];
      var rate = r.savingsRate * 100;
      var rc = rate >= 30 ? 'positive' : (rate >= 15 ? '' : 'negative');
      var transfers = r.totalTransfers || 0;
      var hasActual = r.dataSource === 'actual';
      var clickAttr = hasActual ? ' class="cf-row-clickable" data-month="' + r.month + '"' : '';
      var cursor = hasActual ? 'cursor:pointer;' : '';

      html += '<tr' + clickAttr + ' style="' + cursor + '">' +
        '<td>' + r.month +
          (hasActual ? ' <span style="color:#0d904f;font-size:10px;" title="Actual data">&#9679;</span>' : '') +
        '</td>' +
        '<td style="text-align:right">' + Fmt.currency(r.income) + '</td>' +
        '<td style="text-align:right">' + Fmt.currency(r.impliedExpenses) + '</td>' +
        '<td style="text-align:right">' + (transfers > 0 ? Fmt.currency(transfers) : '-') + '</td>' +
        '<td style="text-align:right">' + (totalGoalFunding > 0 ? Fmt.currency(totalGoalFunding) : '-') + '</td>' +
        '<td style="text-align:right" class="' + (r.totalContributions >= 0 ? 'positive' : 'negative') + '">' +
          Fmt.currency(r.totalContributions) + '</td>' +
        '<td style="text-align:right" class="' + rc + '">' + Fmt.pct(rate) + '</td>' +
      '</tr>';
    }

    // Trailing average row
    if (displayed.length > 1) {
      var n = Math.min(displayed.length, trailingMonths || 6);
      var recent = displayed.slice(-n);
      var avgIncome = recent.reduce(function(s, r) { return s + r.income; }, 0) / n;
      var avgExp = recent.reduce(function(s, r) { return s + r.impliedExpenses; }, 0) / n;
      var avgTransfers = recent.reduce(function(s, r) { return s + (r.totalTransfers || 0); }, 0) / n;
      var avgSavings = recent.reduce(function(s, r) { return s + r.totalContributions; }, 0) / n;
      var avgRate = avgIncome > 0 ? (avgIncome - avgExp) / avgIncome * 100 : 0;
      html += '<tr style="font-weight:600;border-top:2px solid var(--border);">' +
        '<td>' + n + '-mo avg</td>' +
        '<td style="text-align:right">' + Fmt.currency(avgIncome) + '</td>' +
        '<td style="text-align:right">' + Fmt.currency(avgExp) + '</td>' +
        '<td style="text-align:right">' + (avgTransfers > 0 ? Fmt.currency(avgTransfers) : '-') + '</td>' +
        '<td style="text-align:right">' + (totalGoalFunding > 0 ? Fmt.currency(totalGoalFunding) : '-') + '</td>' +
        '<td style="text-align:right">' + Fmt.currency(avgSavings) + '</td>' +
        '<td style="text-align:right">' + Fmt.pct(avgRate) + '</td>' +
      '</tr>';
    }

    html += '</tbody></table></div></div>';

    // --- Savings Rate Trend (simple line) ---
    html += '<div class="chart-container">' +
      '<div class="chart-header"><h2>Savings Rate Trend</h2></div>' +
      '<canvas id="savingsRateTrendChart"></canvas>' +
    '</div>';

    el.innerHTML = html;

    // Render charts
    this._renderWaterfallChart(waterfall);
    this._renderSavingsRateTrend(monthlyData);

    // Bind click handlers for modal drill-down
    this._bindRowClicks(goalPlan);
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
  _renderSavingsRateTrend: function(monthlyData) {
    var canvas = document.getElementById('savingsRateTrendChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (this._trendChart) this._trendChart.destroy();

    var recent = monthlyData.slice(-24);
    var labels = recent.map(function(r) { return r.month; });
    var data = recent.map(function(r) { return r.savingsRate * 100; });

    // Color points by threshold
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

    // Build modal HTML
    var html = '<div class="cf-modal-overlay" id="cfModalOverlay">' +
      '<div class="cf-modal">' +
        '<div class="cf-modal-header">' +
          '<h2>' + this._formatMonthName(month) + ' — Cash Flow Detail</h2>' +
          '<button class="cf-modal-close" id="cfModalClose">&times;</button>' +
        '</div>' +
        '<div class="cf-modal-body">';

    // Summary bar
    var netSavings = detail.netSavings;
    var rate = detail.savingsRate * 100;
    html += '<div class="cf-modal-summary">' +
      '<div class="cf-summary-item cf-summary-income">' +
        '<div class="cf-summary-label">Income</div>' +
        '<div class="cf-summary-value">' + Fmt.currency(detail.income.total) + '</div>' +
      '</div>' +
      '<div class="cf-summary-arrow">→</div>' +
      '<div class="cf-summary-item cf-summary-expenses">' +
        '<div class="cf-summary-label">Expenses</div>' +
        '<div class="cf-summary-value">' + Fmt.currency(detail.expenses.total) + '</div>' +
      '</div>' +
      '<div class="cf-summary-arrow">→</div>' +
      '<div class="cf-summary-item cf-summary-transfers">' +
        '<div class="cf-summary-label">Transfers</div>' +
        '<div class="cf-summary-value">' + Fmt.currency(detail.transfers.total) + '</div>' +
      '</div>' +
      '<div class="cf-summary-arrow">=</div>' +
      '<div class="cf-summary-item ' + (netSavings >= 0 ? 'cf-summary-positive' : 'cf-summary-negative') + '">' +
        '<div class="cf-summary-label">Net Savings</div>' +
        '<div class="cf-summary-value">' + Fmt.currency(netSavings) + ' (' + Fmt.pct(rate) + ')</div>' +
      '</div>' +
    '</div>';

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
      '<h3>Expenses (Spending)</h3>' +
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

    // Goal allocations section
    if (goalPlan && goalPlan.goals && goalPlan.goals.length) {
      html += '<div class="cf-modal-section">' +
        '<h3>Goal Allocations</h3>' +
        '<table class="cf-detail-table"><thead><tr>' +
        '<th>Goal</th><th>Priority</th><th style="text-align:right">Allocated/mo</th><th>Status</th>' +
        '</tr></thead><tbody>';

      var totalAlloc = 0;
      goalPlan.goals.forEach(function(g) {
        if (g.allocated_monthly <= 0) return;
        totalAlloc += g.allocated_monthly;
        var statusClass = g.status === 'on_track' || g.status === 'funded' ? 'positive' :
          (g.status === 'at_risk' ? 'negative' : '');
        var statusLabel = (g.status || 'pending').replace(/_/g, ' ');
        statusLabel = statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1);
        html += '<tr>' +
          '<td>' + g.name + '</td>' +
          '<td>P' + g.priority + '</td>' +
          '<td style="text-align:right">' + Fmt.currency(g.allocated_monthly) + '</td>' +
          '<td class="' + statusClass + '">' + statusLabel + '</td>' +
        '</tr>';
      });

      html += '</tbody></table>' +
        '<div class="cf-section-total">Total: ' + Fmt.currency(totalAlloc) + '</div>' +
      '</div>';
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
    // ESC key
    var escHandler = function(e) {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  },

  _renderDetailTable: function(items, showSubcategory) {
    if (!items.length) return '<p style="color:var(--text-secondary);font-size:13px;">No entries</p>';

    var html = '<table class="cf-detail-table"><thead><tr>' +
      '<th>Category</th>';
    if (showSubcategory) html += '<th>Subcategory</th>';
    html += '<th style="text-align:right">Amount</th></tr></thead><tbody>';

    items.forEach(function(item) {
      html += '<tr><td>' + item.category + '</td>';
      if (showSubcategory) html += '<td>' + (item.subcategory || '-') + '</td>';
      html += '<td style="text-align:right">' + Fmt.currency(item.amount) + '</td></tr>';
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
