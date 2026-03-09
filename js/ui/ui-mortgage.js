// === MORTGAGE RENDERER ===
// Renders mortgage dashboard: summary cards, balance chart, amortization table,
// actual vs planned comparison, equity section. No data processing.

var MortgageRenderer = {

  _chartInstance: null,

  // Main entry point — receives pre-computed data
  renderMortgage: function(data) {
    var container = document.getElementById('mortgageContent');
    if (!container) return;

    var html = '';
    html += this._renderSummaryCards(data.summary, data.equity);
    html += this._renderBalanceChart();
    if (data.equity && data.equity.marketValue > 0) {
      html += this._renderEquitySection(data.equity);
    }
    html += this._renderAmortizationTable(data.schedule);
    if (data.comparison && data.comparison.length) {
      html += this._renderActualVsPlanned(data.comparison);
    }

    container.innerHTML = html;
    this._initBalanceChart(data.schedule, data.equity, data.mortgage);
  },

  renderEmptyState: function() {
    var container = document.getElementById('mortgageContent');
    if (!container) return;
    container.innerHTML =
      '<div class="empty-state-panel">' +
      '<div class="empty-state-icon">&#127968;</div>' +
      '<div class="empty-state-title">No mortgage configured</div>' +
      '<div class="empty-state-desc">Set up your mortgage in the <a href="admin.html">Admin page</a> to see amortization schedule, equity tracking, and FI impact.</div>' +
      '</div>';
  },

  _renderSummaryCards: function(summary, equity) {
    var html = '<div class="metrics mortgage-summary">';

    html += '<div class="metric-card">' +
      '<div class="label">Monthly Payment</div>' +
      '<div class="value">' + Fmt.currency(summary.monthlyPayment) + '</div>' +
      '</div>';

    html += '<div class="metric-card">' +
      '<div class="label">Total Interest</div>' +
      '<div class="value">' + Fmt.currency(summary.totalInterest) + '</div>' +
      '<div class="sub">Total cost: ' + Fmt.currency(summary.totalCost) + '</div>' +
      '</div>';

    html += '<div class="metric-card">' +
      '<div class="label">Payoff Date</div>' +
      '<div class="value">' + summary.payoffDate + '</div>' +
      (summary.monthsSaved > 0
        ? '<div class="sub positive">' + summary.monthsSaved + ' months saved vs original'
        : '<div class="sub">Original: ' + summary.originalPayoffDate) +
      '</div></div>';

    html += '<div class="metric-card">' +
      '<div class="label">Interest Saved</div>' +
      '<div class="value ' + (summary.interestSaved > 0 ? 'positive' : '') + '">' +
      Fmt.currency(summary.interestSaved) + '</div>' +
      (summary.totalExtraPayments > 0
        ? '<div class="sub">From ' + Fmt.currency(summary.totalExtraPayments) + ' in extra payments</div>'
        : '<div class="sub">No extra payments yet</div>') +
      '</div>';

    if (equity && equity.marketValue > 0) {
      html += '<div class="metric-card">' +
        '<div class="label">Home Equity</div>' +
        '<div class="value">' + Fmt.currency(equity.equity) + '</div>' +
        '<div class="sub">LTV: ' + Fmt.pct(equity.ltv) + '</div>' +
        '</div>';
    }

    html += '</div>';
    return html;
  },

  _renderBalanceChart: function() {
    return '<div class="chart-container">' +
      '<div class="chart-header">' +
      '<h2>Payment Breakdown</h2>' +
      '<div class="legend" id="mortgageLegend"></div>' +
      '</div>' +
      '<canvas id="mortgageChart"></canvas>' +
      '</div>';
  },

  _initBalanceChart: function(schedule, equity, mortgage) {
    var canvas = document.getElementById('mortgageChart');
    if (!canvas || !schedule.length) return;

    // Destroy old chart
    if (this._chartInstance) {
      this._chartInstance.destroy();
      this._chartInstance = null;
    }

    // Aggregate by year using calculator (no inline aggregation)
    var yearData = MortgageCalculator.computeYearlyAggregates(schedule);

    var labels = Object.keys(yearData).sort();
    var principalData = labels.map(function(y) { return yearData[y].principal; });
    var interestData = labels.map(function(y) { return yearData[y].interest; });
    var extraData = labels.map(function(y) { return yearData[y].extra; });

    var datasets = [
      {
        label: 'Principal',
        data: principalData,
        backgroundColor: '#0d904f',
        borderRadius: 2
      },
      {
        label: 'Interest',
        data: interestData,
        backgroundColor: '#d93025',
        borderRadius: 2
      }
    ];

    // Only add extra payments dataset if any exist
    var hasExtras = extraData.some(function(v) { return v > 0; });
    if (hasExtras) {
      datasets.push({
        label: 'Extra Payments',
        data: extraData,
        backgroundColor: '#1a73e8',
        borderRadius: 2
      });
    }

    // Build legend
    var legendEl = document.getElementById('mortgageLegend');
    if (legendEl) {
      var legendHtml = '<div class="legend-item"><div class="legend-dot" style="background:#0d904f"></div>Principal</div>' +
        '<div class="legend-item"><div class="legend-dot" style="background:#d93025"></div>Interest</div>';
      if (hasExtras) {
        legendHtml += '<div class="legend-item"><div class="legend-dot" style="background:#1a73e8"></div>Extra Payments</div>';
      }
      legendEl.innerHTML = legendHtml;
    }

    this._chartInstance = new Chart(canvas, {
      type: 'bar',
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(ctx) {
                return ctx.dataset.label + ': ' + Fmt.currency(ctx.parsed.y);
              },
              footer: function(items) {
                var total = items.reduce(function(s, i) { return s + i.parsed.y; }, 0);
                return 'Total: ' + Fmt.currency(total);
              }
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false }
          },
          y: {
            stacked: true,
            ticks: {
              callback: function(val) { return Fmt.currency(val); }
            },
            grid: { color: 'rgba(0,0,0,0.05)' }
          }
        }
      }
    });
  },

  _renderEquitySection: function(equity) {
    return '<div class="table-container equity-card">' +
      '<div class="table-header-row"><h2>Home Equity</h2></div>' +
      '<div style="padding: 0 24px 20px">' +
      '<div class="goals-detail-calc">' +
      '<div class="calc-row"><span>Market Value</span><span>' + Fmt.currency(equity.marketValue) + '</span></div>' +
      '<div class="calc-row"><span>Mortgage Balance</span><span class="negative">- ' + Fmt.currency(equity.mortgageBalance) + '</span></div>' +
      '<div class="calc-row calc-result"><span>Equity</span><span>' + Fmt.currency(equity.equity) + '</span></div>' +
      '<div class="calc-row"><span>Loan-to-Value (LTV)</span><span>' + Fmt.pct(equity.ltv) + '</span></div>' +
      '</div></div></div>';
  },

  _renderAmortizationTable: function(schedule) {
    if (!schedule.length) return '';

    // Group by year for subtotals (grouping for row display + pre-computed aggregates for totals)
    var years = {};
    schedule.forEach(function(s) {
      var year = s.month.substring(0, 4);
      if (!years[year]) years[year] = [];
      years[year].push(s);
    });
    var yearAggregates = MortgageCalculator.computeYearlyAggregates(schedule);

    var html = '<div class="table-container">' +
      '<div class="table-header-row"><h2>Amortization Schedule</h2></div>' +
      '<div class="nw-table-scroll">' +
      '<table class="amort-table">' +
      '<thead><tr>' +
      '<th>Month</th><th class="text-right">Payment</th><th class="text-right">Principal</th>' +
      '<th class="text-right">Interest</th><th class="text-right">Extra</th>' +
      '<th class="text-right">Balance</th>' +
      '</tr></thead><tbody>';

    var yearKeys = Object.keys(years).sort();
    yearKeys.forEach(function(year) {
      var rows = years[year];
      var agg = yearAggregates[year] || { principal: 0, interest: 0, extra: 0, payment: 0 };

      rows.forEach(function(s) {
        var hasExtra = s.extra > 0;
        html += '<tr class="' + (hasExtra ? 'extra-payment-row' : '') + '">' +
          '<td>' + s.month + '</td>' +
          '<td class="text-right">' + Fmt.currency(s.payment) + '</td>' +
          '<td class="text-right">' + Fmt.currency(s.principal_paid) + '</td>' +
          '<td class="text-right">' + Fmt.currency(s.interest_paid) + '</td>' +
          '<td class="text-right">' + (hasExtra ? Fmt.currency(s.extra) : '') + '</td>' +
          '<td class="text-right">' + Fmt.currency(s.balance) + '</td>' +
          '</tr>';
      });

      // Year subtotal row (from pre-computed aggregates)
      html += '<tr class="amort-year-row">' +
        '<td><strong>' + year + ' Total</strong></td>' +
        '<td class="text-right"><strong>' + Fmt.currency(agg.payment) + '</strong></td>' +
        '<td class="text-right"><strong>' + Fmt.currency(agg.principal) + '</strong></td>' +
        '<td class="text-right"><strong>' + Fmt.currency(agg.interest) + '</strong></td>' +
        '<td class="text-right"><strong>' + (agg.extra > 0 ? Fmt.currency(agg.extra) : '') + '</strong></td>' +
        '<td class="text-right"></td>' +
        '</tr>';
    });

    html += '</tbody></table></div></div>';
    return html;
  },

  _renderActualVsPlanned: function(comparison) {
    var html = '<div class="table-container">' +
      '<div class="table-header-row"><h2>Actual vs Planned Payments</h2></div>' +
      '<div class="nw-table-scroll">' +
      '<table class="admin-table">' +
      '<thead><tr>' +
      '<th>Month</th><th class="text-right">Planned</th><th class="text-right">Actual</th>' +
      '<th class="text-right">Difference</th>' +
      '</tr></thead><tbody>';

    comparison.forEach(function(c) {
      var diffClass = ValueStatus.sign(c.diff);
      html += '<tr>' +
        '<td>' + c.month + '</td>' +
        '<td class="text-right">' + Fmt.currency(c.planned_payment) + '</td>' +
        '<td class="text-right">' + Fmt.currency(c.actual_payment) + '</td>' +
        '<td class="text-right ' + diffClass + '">' + Fmt.currency(c.diff) + '</td>' +
        '</tr>';
    });

    html += '</tbody></table></div></div>';
    return html;
  }
};
