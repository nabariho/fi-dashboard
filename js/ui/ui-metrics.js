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
  renderFIProgress: function(progressPct, fiTarget, currentNW, yearsToFI, passiveIncome, savingsRate, monthlyExpenses) {
    var pct = Math.max(0, Math.min(progressPct, 100)).toFixed(1);
    var pctLabel = progressPct < 0 ? progressPct.toFixed(1) : pct;
    var el = document.getElementById('fiProgress');
    if (!el) return;

    // On-track context: if yearsToFI is reasonable, show encouragement
    var contextHtml = '';
    if (yearsToFI !== Infinity && yearsToFI > 0) {
      var targetYear = new Date().getFullYear() + Math.ceil(yearsToFI);
      if (yearsToFI <= 10) {
        contextHtml = '<div class="fi-context"><span class="fi-context-badge on-track">On Track</span> At current pace, FI by ~' + targetYear + '</div>';
      } else if (yearsToFI <= 20) {
        contextHtml = '<div class="fi-context"><span class="fi-context-badge slow">Steady</span> At current pace, FI by ~' + targetYear + '</div>';
      } else {
        contextHtml = '<div class="fi-context"><span class="fi-context-badge behind">Long Road</span> At current pace, FI by ~' + targetYear + '</div>';
      }
    }

    // Passive income coverage
    var coverageStat = '';
    if (monthlyExpenses > 0) {
      var coveragePct = (passiveIncome / monthlyExpenses * 100).toFixed(0);
      coverageStat =
        '<div class="fi-stat">' +
          '<span class="fi-stat-value">' + coveragePct + '%</span>' +
          '<span class="fi-stat-label">Expenses Covered</span>' +
        '</div>';
    }

    el.innerHTML =
      '<div class="fi-target" style="margin-bottom:8px">Target: ' + Fmt.currencyShort(fiTarget) + '</div>' +
      contextHtml +
      '<div class="fi-bar-container">' +
        '<div class="fi-bar" style="width:' + pct + '%"></div>' +
        '<div class="fi-bar-label">' + pctLabel + '%</div>' +
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
          '<span class="fi-stat-value">' + Fmt.currency(passiveIncome) + '/mo</span>' +
          '<span class="fi-stat-label">Passive Income</span>' +
        '</div>' +
        coverageStat +
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
    var savingsPct = current.end_value > 0 ? (invested / current.end_value * 100) : 0;
    var marketPct = current.end_value > 0 ? (profit / current.end_value * 100) : 0;

    document.getElementById('metrics').innerHTML =
      this._card('Portfolio Value', Fmt.currency(current.end_value), '',
        Fmt.pct(mom) + ' this month', mom >= 0 ? 'positive' : 'negative') +
      this._card('Your Savings', Fmt.currency(invested), '',
        Fmt.pctShort(savingsPct) + ' of portfolio') +
      this._card('Market Growth', Fmt.currency(profit), profit >= 0 ? 'positive' : 'negative',
        Fmt.pctShort(marketPct) + ' of portfolio', profit >= 0 ? 'positive' : 'negative') +
      this._card('YTD Return', Fmt.pct(ytd), ytd >= 0 ? 'positive' : 'negative',
        Fmt.pct(mom) + ' this month', mom >= 0 ? 'positive' : 'negative');
  },

  renderNetWorth: function(current, mom, ytd) {
    var hasMortgage = current.liabilities > 0 || current.house_value > 0;

    var html = this._card('Net Worth', Fmt.currency(current.total), '',
      Fmt.pct(mom.pct) + ' this month', mom.change >= 0 ? 'positive' : 'negative');

    if (hasMortgage) {
      // Show the full breakdown: assets vs liabilities
      html += this._card('Total Assets', Fmt.currency(current.assets), '',
        'Accounts + house value');
      html += this._card('Total Liabilities', Fmt.currency(current.liabilities), 'negative',
        'Mortgage balance');
      html += this._card('Liquid Net Worth', Fmt.currency(current.liquid), '',
        'Accounts only (excl. house)');
    } else {
      html += this._card('Investments', Fmt.currency(current.investments));
      html += this._card('Bank Accounts', Fmt.currency(current.bank));
    }

    html += this._card('YTD Change', Fmt.currency(ytd.change), ytd.change >= 0 ? 'positive' : 'negative',
      Fmt.pct(ytd.pct), ytd.pct >= 0 ? 'positive' : 'negative');

    document.getElementById('nwMetrics').innerHTML = html;
  },

  renderLastUpdated: function(latestMonth) {
    var el = document.getElementById('lastUpdated');
    if (!el) return;

    // Parse "YYYY-MM" to end-of-month date
    var parts = latestMonth.split('-');
    var y = parseInt(parts[0]);
    var m = parseInt(parts[1]);
    var endOfMonth = new Date(y, m, 0); // last day of that month
    var now = new Date();
    var diffDays = Math.floor((now - endOfMonth) / (1000 * 60 * 60 * 24));

    // Relative time
    var relative = '';
    if (diffDays <= 1) relative = 'today';
    else if (diffDays <= 7) relative = diffDays + 'd ago';
    else if (diffDays <= 60) relative = Math.floor(diffDays / 7) + 'w ago';
    else relative = Math.floor(diffDays / 30) + 'mo ago';

    el.textContent = 'Data through ' + latestMonth + ' (' + relative + ')';

    // Staleness classes
    el.classList.remove('stale', 'very-stale');
    if (diffDays > 75) el.classList.add('very-stale');
    else if (diffDays > 45) el.classList.add('stale');
  }
};
