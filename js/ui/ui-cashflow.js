// === CASH FLOW RENDERER ===
// Renders savings capacity analysis, payroll waterfall, and goal achievability.

var CashFlowRenderer = {
  _waterfallChart: null,
  _trendChart: null,

  render: function(waterfall, monthlyData, achievability, trailingMonths) {
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

    // --- Metrics row ---
    html += '<div class="metrics">';
    html += '<div class="metric-card"><div class="label">Monthly Income</div><div class="value">' + Fmt.currency(waterfall.income) + '</div></div>';
    html += '<div class="metric-card"><div class="label">Actual Expenses (' + trailingMonths + 'mo avg)</div><div class="value">' + Fmt.currency(waterfall.actualExpenses) + '</div></div>';
    html += '<div class="metric-card"><div class="label">Actual Savings (' + trailingMonths + 'mo avg)</div><div class="value ' + (waterfall.actualSavings > 0 ? 'positive' : 'negative') + '">' + Fmt.currency(waterfall.actualSavings) + '</div></div>';
    if (waterfall.estimatedExpenses > 0) {
      var gapClass = waterfall.expenseGap > 50 ? 'negative' : (waterfall.expenseGap < -50 ? 'positive' : '');
      html += '<div class="metric-card"><div class="label">Budget vs Actual Gap</div><div class="value ' + gapClass + '">' + Fmt.currency(waterfall.expenseGap) + '</div></div>';
    }
    html += '</div>';

    // --- Waterfall chart ---
    html += '<div class="chart-container">' +
      '<div class="chart-header"><h2>Payroll Distribution</h2></div>' +
      '<canvas id="waterfallChart"></canvas>' +
    '</div>';

    // --- Savings trend chart ---
    html += '<div class="chart-container">' +
      '<div class="chart-header"><h2>Savings Trend</h2>' +
      '<div class="legend">' +
        '<div class="legend-item"><div class="legend-dot" style="background:#1a73e8;"></div>Contributions</div>' +
        '<div class="legend-item"><div class="legend-dot" style="background:#0d904f;"></div>Implied Expenses</div>' +
        '<div class="legend-item"><div class="legend-dot" style="background:#e8710a;"></div>Savings Rate</div>' +
      '</div></div>' +
      '<canvas id="savingsTrendChart"></canvas>' +
    '</div>';

    // --- Goal Achievability table ---
    if (achievability && achievability.length) {
      html += '<div class="table-container"><div class="table-header-row"><h2>Goal Achievability</h2></div>' +
        '<div class="nw-table-scroll"><table class="returns-table"><thead><tr>' +
        '<th>Goal</th><th>Priority</th><th style="text-align:right">Remaining</th>' +
        '<th style="text-align:right">Required/mo</th><th style="text-align:right">Allocated/mo</th>' +
        '<th>Confidence</th><th>Assessment</th>' +
        '</tr></thead><tbody>';

      achievability.forEach(function(g) {
        var confPct = Math.round(g.confidence * 100);
        var confClass = confPct >= 80 ? 'positive' : (confPct >= 50 ? '' : 'negative');
        var barColor = confPct >= 80 ? 'var(--positive)' : (confPct >= 50 ? 'var(--primary)' : 'var(--negative)');

        html += '<tr>' +
          '<td>' + g.name + '</td>' +
          '<td>P' + g.priority + '</td>' +
          '<td style="text-align:right">' + Fmt.currency(g.remaining) + '</td>' +
          '<td style="text-align:right">' + Fmt.currency(g.required_monthly) + '</td>' +
          '<td style="text-align:right">' + Fmt.currency(g.allocated_monthly) + '</td>' +
          '<td class="' + confClass + '">' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
              '<div style="flex:1;height:6px;background:var(--border);border-radius:3px;">' +
                '<div style="width:' + confPct + '%;height:100%;background:' + barColor + ';border-radius:3px;"></div>' +
              '</div>' +
              '<span style="min-width:36px;text-align:right;">' + confPct + '%</span>' +
            '</div>' +
          '</td>' +
          '<td>' + g.message + '</td>' +
        '</tr>';
      });

      html += '</tbody></table></div></div>';
    }

    // --- Monthly breakdown table ---
    html += '<div class="table-container"><div class="table-header-row"><h2>Monthly Cash Flow</h2></div>' +
      '<div class="nw-table-scroll"><table class="returns-table"><thead><tr>' +
      '<th>Month</th><th style="text-align:right">Income</th><th style="text-align:right">Net Contributions</th>' +
      '<th style="text-align:right">Savings Accts</th><th style="text-align:right">Transactional</th>' +
      '<th style="text-align:right">Implied Expenses</th><th style="text-align:right">Savings Rate</th>' +
      '</tr></thead><tbody>';

    var displayed = monthlyData.slice(-24);
    for (var i = displayed.length - 1; i >= 0; i--) {
      var r = displayed[i];
      var rateClass = r.savingsRate >= 0.3 ? 'positive' : (r.savingsRate >= 0.15 ? '' : 'negative');
      html += '<tr>' +
        '<td>' + r.month + '</td>' +
        '<td style="text-align:right">' + Fmt.currency(r.income) + '</td>' +
        '<td style="text-align:right" class="' + (r.totalContributions >= 0 ? 'positive' : 'negative') + '">' + Fmt.currency(r.totalContributions) + '</td>' +
        '<td style="text-align:right">' + Fmt.currency(r.savingsContributions) + '</td>' +
        '<td style="text-align:right">' + Fmt.currency(r.transactionalContributions) + '</td>' +
        '<td style="text-align:right">' + Fmt.currency(r.impliedExpenses) + '</td>' +
        '<td style="text-align:right" class="' + rateClass + '">' + Fmt.pct(r.savingsRate * 100) + '</td>' +
      '</tr>';
    }

    html += '</tbody></table></div></div>';

    el.innerHTML = html;

    // Render charts after DOM is ready
    this._renderWaterfallChart(waterfall);
    this._renderTrendChart(monthlyData);
  },

  _renderWaterfallChart: function(waterfall) {
    var canvas = document.getElementById('waterfallChart');
    if (!canvas || typeof Chart === 'undefined') return;

    if (this._waterfallChart) this._waterfallChart.destroy();

    // Build waterfall: Income → Expenses → Goal allocations → Unallocated
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

    // Compute running totals for stacked waterfall effect
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
          {
            label: 'Base',
            data: bases,
            backgroundColor: 'transparent',
            borderWidth: 0,
            barPercentage: 0.6
          },
          {
            label: 'Amount',
            data: heights,
            backgroundColor: colors,
            borderWidth: 0,
            barPercentage: 0.6
          }
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
          y: {
            stacked: true,
            ticks: { callback: function(v) { return Fmt.currency(v); } }
          }
        }
      }
    });
  },

  _renderTrendChart: function(monthlyData) {
    var canvas = document.getElementById('savingsTrendChart');
    if (!canvas || typeof Chart === 'undefined') return;

    if (this._trendChart) this._trendChart.destroy();

    var recent = monthlyData.slice(-24);
    var labels = recent.map(function(r) { return r.month; });

    this._trendChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Net Contributions',
            data: recent.map(function(r) { return r.totalContributions; }),
            backgroundColor: '#1a73e8',
            order: 2
          },
          {
            label: 'Implied Expenses',
            data: recent.map(function(r) { return r.impliedExpenses; }),
            backgroundColor: '#d93025',
            order: 3
          },
          {
            label: 'Savings Rate',
            data: recent.map(function(r) { return r.savingsRate * 100; }),
            type: 'line',
            borderColor: '#e8710a',
            backgroundColor: 'transparent',
            pointRadius: 3,
            pointBackgroundColor: '#e8710a',
            yAxisID: 'yRate',
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: function(ctx) {
                if (ctx.dataset.yAxisID === 'yRate') return 'Savings Rate: ' + ctx.raw.toFixed(1) + '%';
                return ctx.dataset.label + ': ' + Fmt.currency(ctx.raw);
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            position: 'left',
            ticks: { callback: function(v) { return Fmt.currency(v); } }
          },
          yRate: {
            position: 'right',
            min: 0,
            max: 100,
            ticks: { callback: function(v) { return v + '%'; } },
            grid: { display: false }
          }
        }
      }
    });
  }
};
