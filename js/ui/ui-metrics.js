// === UI: METRIC CARDS & FI PROGRESS ===
// Renders metric cards and FI progress bar. No data processing.

var MetricsRenderer = {
  _card: function(label, value, valueClass, sub, subClass) {
    var html = '<div class="metric-card">';
    html += '<div class="label">' + label + '</div>';
    html += '<div class="value' + (valueClass ? ' ' + valueClass : '') + '">' + value + '</div>';
    if (sub) {
      html += '<div class="sub' + (subClass ? ' ' + subClass : '') + '">' + sub + '</div>';
    }
    html += '</div>';
    return html;
  },

  // Render FI progress bar
  renderFIProgress: function(progressPct, fiTarget, currentNW, yearsToFI, passiveIncome, savingsRate) {
    var pct = Math.min(progressPct, 100).toFixed(1);
    var el = document.getElementById('fiProgress');
    if (!el) return;

    el.innerHTML =
      '<div class="fi-header">' +
        '<div class="fi-title">Financial Independence Progress</div>' +
        '<div class="fi-target">Target: ' + Fmt.currencyShort(fiTarget) + '</div>' +
      '</div>' +
      '<div class="fi-bar-container">' +
        '<div class="fi-bar" style="width:' + pct + '%"></div>' +
        '<div class="fi-bar-label">' + pct + '%</div>' +
      '</div>' +
      '<div class="fi-stats">' +
        '<div class="fi-stat">' +
          '<span class="fi-stat-value">' + Fmt.currencyShort(currentNW) + '</span>' +
          '<span class="fi-stat-label">Net Worth</span>' +
        '</div>' +
        '<div class="fi-stat">' +
          '<span class="fi-stat-value">' + Fmt.years(yearsToFI) + '</span>' +
          '<span class="fi-stat-label">Est. Time to FI</span>' +
        '</div>' +
        '<div class="fi-stat">' +
          '<span class="fi-stat-value">' + Fmt.currency(passiveIncome) + '</span>' +
          '<span class="fi-stat-label">Passive Income /mo</span>' +
        '</div>' +
        '<div class="fi-stat">' +
          '<span class="fi-stat-value">' + Fmt.pctShort(savingsRate) + '</span>' +
          '<span class="fi-stat-label">Savings Rate (12mo)</span>' +
        '</div>' +
      '</div>';
  },

  renderInvestments: function(current) {
    var invested = current.cum_contribution;
    var profit = current.end_value - invested;
    var ytd = current.ytd_return_pct;
    var mom = current.monthly_return_pct;

    document.getElementById('metrics').innerHTML =
      this._card('Current Value', Fmt.currency(current.end_value), '',
        Fmt.pct(mom) + ' this month', mom >= 0 ? 'positive' : 'negative') +
      this._card('Total Invested', Fmt.currency(invested), '',
        Fmt.currency(profit) + ' profit', '') +
      this._card('YTD Return', Fmt.pct(ytd), ytd >= 0 ? 'positive' : 'negative') +
      this._card('Monthly Return', Fmt.pct(mom), mom >= 0 ? 'positive' : 'negative');
  },

  renderNetWorth: function(current, mom, ytd) {
    document.getElementById('nwMetrics').innerHTML =
      this._card('Net Worth', Fmt.currency(current.total), '',
        Fmt.pct(mom.pct) + ' this month', mom.change >= 0 ? 'positive' : 'negative') +
      this._card('Investments', Fmt.currency(current.investments)) +
      this._card('Bank Accounts', Fmt.currency(current.bank)) +
      this._card('YTD Change', Fmt.currency(ytd.change), ytd.change >= 0 ? 'positive' : 'negative',
        Fmt.pct(ytd.pct), ytd.pct >= 0 ? 'positive' : 'negative');
  },

  renderLastUpdated: function(latestMonth) {
    var el = document.getElementById('lastUpdated');
    if (el) el.textContent = 'Last data: ' + latestMonth;
  }
};
