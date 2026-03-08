// === UI: HOME TAB ("This Month") ===
// Renders the monthly review home view. Receives processed data only.

var HomeRenderer = {
  render: function(summary, goalPlan, actions, savingsRateTrend, fiImpact, progressPct, annualSummaries) {
    var el = document.getElementById('homeContent');
    if (!el) return;
    if (!summary) {
      el.innerHTML = '<p style="color:#5f6368;padding:24px">Not enough data for a monthly review. Add at least 2 months of data.</p>';
      return;
    }

    var html = '';

    // 1. Headline: NW change this month
    html += this._renderHeadline(summary);

    // 2. Change attribution: savings vs market vs debt
    html += this._renderAttribution(summary);

    // 3. Goal progress bars (compact)
    if (goalPlan && goalPlan.goals && goalPlan.goals.length) {
      html += this._renderGoalBars(goalPlan.goals);
    }

    // 4. Recommended actions (top 3)
    if (actions && actions.length) {
      html += this._renderActions(actions.slice(0, 3));
    }

    // 5. Key numbers + savings rate trend + FI impact
    html += this._renderKeyNumbers(summary, savingsRateTrend, fiImpact, progressPct);

    // 6. Year-over-Year review (when more than 1 year of data)
    if (annualSummaries && annualSummaries.length >= 2) {
      html += this._renderYearReview(annualSummaries);
    }

    el.innerHTML = html;
  },

  _renderHeadline: function(summary) {
    var cls = summary.nwChange >= 0 ? 'positive' : 'negative';
    var sign = summary.nwChange >= 0 ? '+' : '';
    return '<div class="home-headline">' +
      '<div class="home-headline-label">Net Worth Change in ' + SummaryCalculator._monthName(summary.month) + '</div>' +
      '<div class="home-headline-value ' + cls + '">' + sign + Fmt.currency(summary.nwChange) + '</div>' +
      '<div class="home-headline-sub ' + cls + '">' + Fmt.pctShort(summary.nwChangePct) + '</div>' +
    '</div>';
  },

  _renderAttribution: function(summary) {
    var items = [];

    if (summary.contributions !== 0) {
      var savCls = summary.contributions >= 0 ? 'positive' : 'negative';
      var savSign = summary.contributions >= 0 ? '+' : '';
      items.push('<div class="home-attr-item"><span class="home-attr-label">Savings</span>' +
        '<span class="home-attr-value ' + savCls + '">' + savSign + Fmt.currencyShort(summary.contributions) + '</span></div>');
    }

    if (summary.marketChange !== 0) {
      var mktCls = summary.marketChange >= 0 ? 'positive' : 'negative';
      var mktSign = summary.marketChange >= 0 ? '+' : '';
      items.push('<div class="home-attr-item"><span class="home-attr-label">Market</span>' +
        '<span class="home-attr-value ' + mktCls + '">' + mktSign + Fmt.currencyShort(summary.marketChange) + '</span></div>');
    }

    if (!items.length) return '';
    return '<div class="home-attribution">' + items.join('') + '</div>';
  },

  _renderGoalBars: function(goals) {
    var html = '<div class="home-goals"><div class="home-section-title">Goal Progress</div>';
    var activeGoals = goals.filter(function(g) { return g.active !== false; });

    activeGoals.forEach(function(g) {
      var pct = g.target_amount > 0 ? Math.min((g.current_amount / g.target_amount) * 100, 100) : 0;
      var statusCls = g.status === 'funded' ? 'funded' : (g.status === 'on_track' ? 'on-track' : 'at-risk');

      html += '<div class="home-goal-row">' +
        '<div class="home-goal-header">' +
          '<span class="home-goal-name">' + g.name + '</span>' +
          '<span class="home-goal-pct">' + pct.toFixed(0) + '%</span>' +
        '</div>' +
        '<div class="home-goal-bar-bg">' +
          '<div class="home-goal-bar ' + statusCls + '" style="width:' + pct.toFixed(1) + '%"></div>' +
        '</div>' +
        '<div class="home-goal-detail">' +
          Fmt.currencyShort(g.current_amount) + ' / ' + Fmt.currencyShort(g.target_amount) +
        '</div>' +
      '</div>';
    });

    html += '</div>';
    return html;
  },

  _renderActions: function(actions) {
    var html = '<div class="home-actions"><div class="home-section-title">Recommended Actions</div>';

    actions.forEach(function(a) {
      var iconMap = { error: '!', warning: '!', info: 'i', success: '&#10003;' };
      var icon = iconMap[a.severity] || 'i';
      html += '<div class="home-action ' + a.severity + '">' +
        '<span class="home-action-icon">' + icon + '</span>' +
        '<span class="home-action-text">' + a.message + '</span>' +
      '</div>';
    });

    html += '</div>';
    return html;
  },

  _renderKeyNumbers: function(summary, savingsRateTrend, fiImpact, progressPct) {
    var html = '<div class="home-key-numbers">';

    // FI impact
    if (fiImpact && fiImpact.direction !== 'same') {
      var impactCls = fiImpact.direction === 'closer' ? 'positive' : 'negative';
      var impactText = fiImpact.monthsCloser + ' month' + (fiImpact.monthsCloser !== 1 ? 's' : '') +
        ' ' + fiImpact.direction + ' to FI';
      html += '<div class="home-key-card">' +
        '<div class="home-key-value ' + impactCls + '">' + impactText + '</div>' +
        '<div class="home-key-label">FI Impact</div>' +
      '</div>';
    }

    // FI progress
    if (progressPct !== undefined) {
      html += '<div class="home-key-card">' +
        '<div class="home-key-value">' + progressPct.toFixed(1) + '%</div>' +
        '<div class="home-key-label">FI Progress</div>' +
      '</div>';
    }

    // Savings this month
    html += '<div class="home-key-card">' +
      '<div class="home-key-value ' + (summary.contributions >= 0 ? 'positive' : 'negative') + '">' +
        Fmt.currencyShort(summary.contributions) +
      '</div>' +
      '<div class="home-key-label">Saved This Month</div>' +
    '</div>';

    // Market returns this month
    html += '<div class="home-key-card">' +
      '<div class="home-key-value ' + (summary.marketChange >= 0 ? 'positive' : 'negative') + '">' +
        Fmt.currencyShort(summary.marketChange) +
      '</div>' +
      '<div class="home-key-label">Market Returns</div>' +
    '</div>';

    // Savings rate trend (last value)
    if (savingsRateTrend && savingsRateTrend.length) {
      var lastRate = savingsRateTrend[savingsRateTrend.length - 1].savingsRate;
      html += '<div class="home-key-card">' +
        '<div class="home-key-value">' + Fmt.pctShort(lastRate) + '</div>' +
        '<div class="home-key-label">Savings Rate</div>' +
      '</div>';
    }

    html += '</div>';
    return html;
  },

  _renderYearReview: function(annualSummaries) {
    var html = '<div class="home-year-review"><div class="home-section-title">Year-over-Year</div>';

    // Show last 2 years side by side for comparison
    var current = annualSummaries[annualSummaries.length - 1];
    var previous = annualSummaries[annualSummaries.length - 2];

    html += '<div class="nw-table-scroll"><table class="returns-table"><thead><tr>' +
      '<th></th><th style="text-align:right">' + previous.year + '</th>' +
      '<th style="text-align:right">' + current.year + '</th>' +
      '<th style="text-align:right">Change</th>' +
    '</tr></thead><tbody>';

    html += this._yoyRow('Net Worth (end)', previous.endNW, current.endNW);
    html += this._yoyRow('NW Growth', previous.nwChange, current.nwChange);
    html += this._yoyRow('NW Growth %', previous.nwChangePct, current.nwChangePct, true);
    html += this._yoyRow('Total Saved', previous.totalSaved, current.totalSaved);
    html += this._yoyRow('Market Returns', previous.marketReturns, current.marketReturns);

    if (current.totalIncome > 0 || previous.totalIncome > 0) {
      html += this._yoyRow('Income', previous.totalIncome, current.totalIncome);
      html += this._yoyRow('Expenses', previous.totalExpenses, current.totalExpenses);
    }

    html += '</tbody></table></div></div>';
    return html;
  },

  _yoyRow: function(label, prev, curr, isPct) {
    var delta = curr - prev;
    var deltaClass = delta >= 0 ? 'positive' : 'negative';
    // For expense row, lower is better
    if (label === 'Expenses') deltaClass = delta <= 0 ? 'positive' : 'negative';

    var fmt = isPct ? Fmt.pct : Fmt.currency;
    var deltaFmt = isPct
      ? ((delta >= 0 ? '+' : '') + delta.toFixed(1) + 'pp')
      : ((delta >= 0 ? '+' : '') + Fmt.currency(delta));

    return '<tr>' +
      '<td>' + label + '</td>' +
      '<td style="text-align:right">' + fmt(prev) + '</td>' +
      '<td style="text-align:right">' + fmt(curr) + '</td>' +
      '<td style="text-align:right" class="' + deltaClass + '">' + deltaFmt + '</td>' +
    '</tr>';
  }
};
