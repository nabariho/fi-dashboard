// === UI: EMERGENCY FUND TAB ===
// Renders emergency fund status, history chart, and monthly flow table.

var _efChart = null;

var EmergencyRenderer = {

  render: function(status, history, coverage, roles) {
    var el = document.getElementById('emergencyContent');
    if (!el) return;
    if (!history || !history.length) {
      el.innerHTML = '<div class="empty-state">No emergency fund data available.</div>';
      return;
    }

    var html = '';

    // === STATUS CARDS ===
    html += this._renderStatusCards(status, coverage, roles);

    // === HISTORY CHART ===
    html += '<div class="chart-container">' +
      '<div class="chart-header"><h2>Funding History</h2></div>' +
      '<canvas id="efChart"></canvas>' +
    '</div>';

    // === MONTHLY FLOW TABLE ===
    html += this._renderFlowTable(history, roles);

    el.innerHTML = html;

    // Render chart after DOM is ready
    this._renderChart(history);
  },

  _renderStatusCards: function(status, coverage, roles) {
    var statusLabels = { green: 'Fully Funded', yellow: 'Partially Funded', red: 'Underfunded' };
    var effective = status.status === 'green' ? status.dedicated : status.available;

    var html = '<div class="ef-status-cards">';

    // Main status card
    html += '<div class="ef-card ef-card-main">' +
      '<div class="ef-card-label">Emergency Fund</div>' +
      '<div class="ef-card-value">' + Fmt.currency(effective) + '</div>' +
      '<div class="ef-card-sub">of ' + Fmt.currency(status.target) + ' target</div>' +
      '<div class="goal-bar-container" style="margin-top:8px">' +
        '<div class="goal-bar status-' + status.status + '" style="width:' + Math.max(status.pct, 2).toFixed(1) + '%"></div>' +
        '<div class="goal-bar-label">' + status.pct.toFixed(1) + '%</div>' +
      '</div>' +
      '<span class="goal-status-badge status-' + status.status + '" style="margin-top:8px">' + statusLabels[status.status] + '</span>' +
    '</div>';

    // Breakdown card
    html += '<div class="ef-card">' +
      '<div class="ef-card-label">Breakdown</div>';

    var roleAccountIds = Object.keys(roles);
    for (var i = 0; i < roleAccountIds.length; i++) {
      var id = roleAccountIds[i];
      var name = AccountService.getName(id);
      var roleLabel = roles[id] === 'dedicated' ? 'Dedicated' : 'Backup';
      var val = roles[id] === 'dedicated' ? status.dedicated : status.backup;
      // For multiple accounts of the same role, we'd need per-account breakdown
      // but for now just show role totals
      if (i === 0 || roles[roleAccountIds[i]] !== roles[roleAccountIds[i - 1]]) {
        html += '<div class="ef-breakdown-row">' +
          '<span class="ef-breakdown-label">' + name + ' <span class="ef-role-tag">' + roleLabel + '</span></span>' +
          '<span class="ef-breakdown-value">' + Fmt.currency(val) + '</span>' +
        '</div>';
      }
    }

    html += '</div>';

    // Coverage card
    if (coverage !== null) {
      html += '<div class="ef-card">' +
        '<div class="ef-card-label">Expense Coverage</div>' +
        '<div class="ef-card-value">' + coverage.toFixed(1) + '</div>' +
        '<div class="ef-card-sub">months of expenses covered</div>' +
      '</div>';
    }

    // Shortfall / surplus card
    var diff = status.available - status.target;
    html += '<div class="ef-card">' +
      '<div class="ef-card-label">' + (diff >= 0 ? 'Surplus' : 'Shortfall') + '</div>' +
      '<div class="ef-card-value ' + (diff >= 0 ? 'positive' : 'negative') + '">' +
        (diff >= 0 ? '+' : '') + Fmt.currency(diff) +
      '</div>' +
      '<div class="ef-card-sub">' + (diff >= 0 ? 'above target' : 'below target') + '</div>' +
    '</div>';

    html += '</div>';
    return html;
  },

  _renderChart: function(history) {
    this._renderChartOnCanvas('efChart', history);
  },

  // Render EF detail embedded inside a goal card (different canvas ID to avoid conflicts)
  renderEmbedded: function(container, status, history, coverage, roles) {
    if (!container || !history || !history.length) return;

    var html = this._renderStatusCards(status, coverage, roles);
    html += '<div class="chart-container" style="margin-top:12px">' +
      '<div class="chart-header"><h2>Funding History</h2></div>' +
      '<canvas id="efChartGoal"></canvas>' +
    '</div>';
    html += this._renderFlowTable(history, roles);

    container.innerHTML = html;

    // Render chart on the embedded canvas
    this._renderChartOnCanvas('efChartGoal', history);
  },

  _renderChartOnCanvas: function(canvasId, history) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (_efChart) _efChart.destroy();

    var labels = history.map(function(h) { return h.month; });
    var balances = history.map(function(h) { return h.balance; });
    var target = history.length ? history[0].target : 0;
    var targetLine = history.map(function() { return target; });

    _efChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Emergency Fund Balance',
            data: balances,
            borderColor: '#1a73e8',
            backgroundColor: 'rgba(26,115,232,0.08)',
            fill: true, tension: 0.3, pointRadius: 0, pointHoverRadius: 5, borderWidth: 2
          },
          {
            label: 'Target',
            data: targetLine,
            borderColor: '#ea4335', borderDash: [6, 4], borderWidth: 1.5,
            pointRadius: 0, pointHoverRadius: 0, fill: false
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: true, position: 'top', labels: { usePointStyle: true, boxWidth: 8, font: { size: 12 } } },
          tooltip: {
            backgroundColor: 'white', titleColor: '#202124', bodyColor: '#5f6368',
            borderColor: '#e0e0e0', borderWidth: 1, cornerRadius: 8, padding: 12,
            callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + Fmt.currency(ctx.parsed.y); } }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#5f6368', maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
          y: { beginAtZero: true, ticks: { font: { size: 11 }, color: '#5f6368', callback: function(val) { return Fmt.currencyShort(val); } }, grid: { color: '#f0f0f0' } }
        }
      }
    });
  },

  _renderFlowTable: function(history, roles) {
    var html = '<div class="table-container">' +
      '<div class="table-header-row"><h2>Monthly Flows</h2></div>' +
      '<div class="nw-table-scroll"><table class="nw-breakdown"><thead><tr>' +
        '<th>Month</th>' +
        '<th class="text-right">Starting</th>' +
        '<th class="text-right">Contributions</th>' +
        '<th class="text-right">Withdrawals</th>' +
        '<th class="text-right">Market Change</th>' +
        '<th class="text-right">Ending</th>' +
        '<th class="text-right">vs Target</th>' +
      '</tr></thead><tbody>';

    // Show most recent first
    var prevBalance = 0;
    var balanceByMonth = {};
    for (var i = 0; i < history.length; i++) {
      balanceByMonth[history[i].month] = i > 0 ? history[i - 1].balance : 0;
    }

    for (var j = history.length - 1; j >= 0; j--) {
      var h = history[j];
      var starting = j > 0 ? history[j - 1].balance : 0;
      var diff = h.balance - h.target;
      var diffClass = diff >= 0 ? 'positive' : 'negative';
      var hasWithdrawal = h.withdrawals < 0;

      html += '<tr' + (hasWithdrawal ? ' class="ef-withdrawal-row"' : '') + '>' +
        '<td>' + h.month + '</td>' +
        '<td class="text-right">' + Fmt.currency(starting) + '</td>' +
        '<td class="text-right">' + (h.contributions > 0 ? '+' + Fmt.currency(h.contributions) : '-') + '</td>' +
        '<td class="text-right">' + (h.withdrawals < 0 ? '<span class="negative">' + Fmt.currency(h.withdrawals) + '</span>' : '-') + '</td>' +
        '<td class="text-right">' + (h.marketChange !== 0 ? '<span class="' + (h.marketChange >= 0 ? 'positive' : 'negative') + '">' + (h.marketChange >= 0 ? '+' : '') + Fmt.currency(h.marketChange) + '</span>' : '-') + '</td>' +
        '<td class="text-right font-semibold">' + Fmt.currency(h.balance) + '</td>' +
        '<td class="text-right ' + diffClass + '">' + (diff >= 0 ? '+' : '') + Fmt.currency(diff) + '</td>' +
      '</tr>';
    }

    html += '</tbody></table></div></div>';
    return html;
  }
};
