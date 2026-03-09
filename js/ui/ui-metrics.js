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
  // opts: { passiveIncomeNet, taxRate, inflationRate, derivedFITarget, fiTargetNominal, coastFI }
  renderFIProgress: function(progressPct, fiTarget, currentNW, yearsToFI, passiveIncome, savingsRate, monthlyExpenses, opts) {
    opts = opts || {};
    var pct = Math.max(0, Math.min(progressPct, 100)).toFixed(1);
    var pctLabel = progressPct < 0 ? progressPct.toFixed(1) : pct;
    var el = document.getElementById('fiProgress');
    if (!el) return;

    // On-track context from FICalculator
    var contextHtml = '';
    var fiCtx = FICalculator.fiContext(yearsToFI, opts.inflationRate);
    if (fiCtx.badge) {
      contextHtml = '<div class="fi-context"><span class="fi-context-badge ' + fiCtx.badgeClass + '">' +
        fiCtx.badge + '</span> At current pace, ' + fiCtx.message + '</div>';
    }

    // Income growth note (only when growth rate is significant)
    if (opts.incomeGrowthRate && opts.incomeGrowthRate > 0.01) {
      contextHtml += '<div class="fi-income-trend">Income trend: +' +
        (opts.incomeGrowthRate * 100).toFixed(1) + '%/yr growth detected</div>';
    }

    // Target line with inflation context
    var targetHtml = '<div class="fi-target fi-target-line">Target: ' + Fmt.currencyShort(fiTarget);
    if (opts.fiTargetNominal > 0) {
      targetHtml += ' <span class="text-secondary">(~' + Fmt.currencyShort(opts.fiTargetNominal) + ' in future euros)</span>';
    }
    targetHtml += '</div>';

    // Derived FI target warning (divergence check from calculator)
    var derivedWarning = '';
    if (opts.derivedFITarget > 0) {
      var divResult = FICalculator.derivedFIDivergence(opts.derivedFITarget, fiTarget);
      if (divResult.isSignificant) {
        derivedWarning = '<div class="fi-derived-warning">' +
          'Based on your expenses, you need ~' + Fmt.currencyShort(opts.derivedFITarget) +
          ' (' + divResult.label + ' than target)' +
          (opts.taxRate > 0 ? ' incl. ' + (opts.taxRate * 100).toFixed(0) + '% withdrawal tax' : '') +
          '</div>';
      }
    }

    // Passive income: show after-tax when tax is configured
    var passiveLabel = 'Passive Income';
    var passiveValue = Fmt.currency(passiveIncome) + '/mo';
    if (opts.taxRate > 0 && opts.passiveIncomeNet !== undefined) {
      passiveValue = Fmt.currency(opts.passiveIncomeNet) + '/mo';
      passiveLabel = 'Passive Income (net)';
    }

    // Passive income coverage (from calculator)
    var coverageStat = '';
    var coverageIncome = (opts.taxRate > 0 && opts.passiveIncomeNet !== undefined) ? opts.passiveIncomeNet : passiveIncome;
    var covPct = FICalculator.coveragePct(coverageIncome, monthlyExpenses);
    if (covPct !== null) {
      coverageStat =
        '<div class="fi-stat">' +
          '<span class="fi-stat-value">' + covPct.toFixed(0) + '%</span>' +
          '<span class="fi-stat-label">Expenses Covered</span>' +
        '</div>';
    }

    // Time to FI label
    var timeLabel = 'Est. Time to FI';
    if (opts.inflationRate > 0) timeLabel = 'Time to FI (real)';

    el.innerHTML =
      targetHtml +
      derivedWarning +
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
          '<span class="fi-stat-label">' + timeLabel + '</span>' +
        '</div>' +
        '<div class="fi-stat">' +
          '<span class="fi-stat-value">' + passiveValue + '</span>' +
          '<span class="fi-stat-label">' + passiveLabel + '</span>' +
        '</div>' +
        coverageStat +
        (opts.coastFI ? this._renderCoastFIStat(opts.coastFI) : '') +
        '<div class="fi-stat">' +
          '<span class="fi-stat-value">' + Fmt.pctShort(savingsRate) + '</span>' +
          '<span class="fi-stat-label">Savings Rate (12mo)</span>' +
          (opts.savingsRateTrend && opts.savingsRateTrend.length >= 3
            ? '<canvas id="savingsRateSparkline" width="80" height="28" style="margin-top:4px"></canvas>'
            : '') +
        '</div>' +
      '</div>';

    // Render sparkline after DOM update
    if (opts.savingsRateTrend && opts.savingsRateTrend.length >= 3) {
      this._renderSavingsSparkline(opts.savingsRateTrend);
    }

    // Add "What If" button if WhatIfRenderer is available
    if (typeof WhatIfRenderer !== 'undefined') {
      var btnContainer = document.createElement('div');
      btnContainer.className = 'fi-whatif-container';
      btnContainer.innerHTML = '<button class="btn-link" id="whatifBtn">What if…?</button>';
      el.appendChild(btnContainer);
    }
  },

  // Tiny sparkline chart for savings rate trend
  _savingsSparkChart: null,
  _renderSavingsSparkline: function(trend) {
    var canvas = document.getElementById('savingsRateSparkline');
    if (!canvas) return;
    if (this._savingsSparkChart) this._savingsSparkChart.destroy();

    var values = trend.map(function(t) { return t.savingsRate; });
    // Determine trend direction for color
    var avg1 = 0, avg2 = 0;
    var half = Math.floor(values.length / 2);
    for (var i = 0; i < half; i++) avg1 += values[i];
    for (var j = half; j < values.length; j++) avg2 += values[j];
    avg1 /= half;
    avg2 /= (values.length - half);
    var color = avg2 >= avg1 ? '#0d904f' : '#ea4335';

    this._savingsSparkChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: trend.map(function(t) { return t.month; }),
        datasets: [{
          data: values,
          borderColor: color,
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.3,
          fill: false
        }]
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
        animation: false
      }
    });
  },

  _renderCoastFIStat: function(coastFI) {
    if (coastFI.reached) {
      return '<div class="fi-stat">' +
        '<span class="fi-stat-value positive">Coast FI ✓</span>' +
        '<span class="fi-stat-label">Growth alone reaches FI by age ' + coastFI.retirementAge + '</span>' +
      '</div>';
    }
    return '<div class="fi-stat">' +
      '<span class="fi-stat-value">' + Fmt.pctShort(coastFI.pct) + '</span>' +
      '<span class="fi-stat-label">Coast FI (' + Fmt.currencyShort(coastFI.coastFIAmount) + ')</span>' +
    '</div>';
  },

  renderInvestments: function(current) {
    var invested = current.cum_contribution;
    var profit = current.end_value - invested;
    var ytd = current.ytd_return_pct;
    var mom = current.monthly_return_pct;
    var savingsPct = current.end_value > 0 ? (invested / current.end_value * 100) : 0;
    var marketPct = current.end_value > 0 ? (profit / current.end_value * 100) : 0;
    var profitStatus = ValueStatus.sign(profit);

    document.getElementById('metrics').innerHTML =
      this._card('Portfolio Value', Fmt.currency(current.end_value), '',
        Fmt.pct(mom) + ' this month', current.monthlyReturnStatus) +
      this._card('Your Savings', Fmt.currency(invested), '',
        Fmt.pctShort(savingsPct) + ' of portfolio') +
      this._card('Market Growth', Fmt.currency(profit), profitStatus,
        Fmt.pctShort(marketPct) + ' of portfolio', profitStatus) +
      this._card('YTD Return', Fmt.pct(ytd), current.ytdReturnStatus,
        Fmt.pct(mom) + ' this month', current.monthlyReturnStatus);
  },

  renderNetWorth: function(current, mom, ytd) {
    var hasMortgage = current.liabilities > 0 || current.house_value > 0;

    var html = this._card('Net Worth', Fmt.currency(current.total), '',
      Fmt.pct(mom.pct) + ' this month', mom.status);

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

    html += this._card('YTD Change', Fmt.currency(ytd.change), ytd.status,
      Fmt.pct(ytd.pct), ytd.status);

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
