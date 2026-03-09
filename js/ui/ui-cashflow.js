// === CASH FLOW RENDERER ===
// Renders Cash Flow tab organized by user questions:
// 1. "How did I do?" — Scorecard with narrative + spending split + income stability
// 2. "Where did the money go?" — Side-by-side income/expense detail with volatility badges
// 3. "Am I on budget?" — Budget vs Actual (month + YTD toggle)
// 4. "What should I improve?" — Improvement areas + FI impact per category
// 5. "Goal funding" — Per-goal planned vs actual contributions
// 6. "Money flow" — Waterfall chart
// 7. "How am I trending?" — Charts (expense trends, income vs expenses, savings rate)
// 8. "Year-over-year" — Same month last year comparison
// 9. "History" — Clickable monthly table

var CashFlowRenderer = {
  _waterfallChart: null,
  _trendChart: null,
  _categoryTrendsChart: null,
  _incExpChart: null,
  _budgetViewYTD: false,

  render: function(renderData) {
    var el = document.getElementById('cashflowContent');
    if (!el) return;

    var monthlyData = renderData.monthlyData || [];
    var months = renderData.months || [];
    var selectedMonth = renderData.selectedMonth;
    var pnl = renderData.pnl;
    var scorecard = renderData.scorecard;
    var categoryAverages = renderData.categoryAverages;
    var budgetVsActual = renderData.budgetVsActual;
    var budgetVsActualYTD = renderData.budgetVsActualYTD;
    var improvementAreas = renderData.improvementAreas;
    var waterfall = renderData.waterfall;
    var categoryTrends = renderData.categoryTrends;
    var budgetSummary = renderData.budgetSummary;
    var budgetStale = renderData.budgetStale;
    var spendingSplit = renderData.spendingSplit;
    var incomeStability = renderData.incomeStability;
    var expenseVolatility = renderData.expenseVolatility;
    var fiImpact = renderData.fiImpact;
    var goalFundingReality = renderData.goalFundingReality;
    var yoyComparison = renderData.yoyComparison;
    var trailingMonths = renderData.trailingMonths || 6;

    if (!months.length) {
      if (budgetSummary) {
        el.innerHTML = this._renderBudgetOnlySection(budgetSummary) +
          '<div class="empty-state-panel"><div class="empty-state-icon">&#128200;</div>' +
          '<div class="empty-state-title">No cash flow data yet</div>' +
          '<div class="empty-state-desc">Import actual income and expense data via Admin &gt; Cash Flow to see your cash flow analysis.</div></div>';
        return;
      }
      el.innerHTML =
        '<div class="empty-state-panel"><div class="empty-state-icon">&#128200;</div>' +
        '<div class="empty-state-title">No cash flow data</div>' +
        '<div class="empty-state-desc">Import actual income and expense data via Admin &gt; Cash Flow to see your cash flow analysis.</div></div>';
      return;
    }

    var html = '';

    // Budget staleness alert
    if (budgetStale) {
      html += '<div class="cf-budget-stale-alert">' +
        '<strong>Budget may be outdated</strong> — actual expenses averaged ' +
        Fmt.currency(budgetStale.avgActual) + '/mo vs planned ' +
        Fmt.currency(budgetStale.planned) + '/mo (' +
        (budgetStale.deviation * 100).toFixed(0) + '% deviation). ' +
        'Consider updating your budget in Admin.</div>';
    }

    // 1. Month Selector
    html += this._renderMonthSelector(months, selectedMonth);

    // 2. Scorecard — "How did I do?"
    if (scorecard) {
      html += this._renderScorecard(scorecard, spendingSplit, incomeStability);
    }

    // 3. Side-by-side Income + Expense detail — "Where did the money go?"
    if (pnl) {
      html += this._renderPnLDetail(pnl, categoryAverages, expenseVolatility);
    }

    // 4. Budget vs Actual — "Am I on budget?"
    if (budgetVsActual || budgetVsActualYTD) {
      html += this._renderBudgetVsActual(budgetVsActual, budgetVsActualYTD, selectedMonth);
    }

    // 5. Improvement Areas + FI Impact — "What should I improve?"
    if (improvementAreas && improvementAreas.length) {
      html += this._renderImprovementAreas(improvementAreas);
    }
    if (fiImpact && fiImpact.length) {
      html += this._renderFIImpact(fiImpact);
    }
    if (renderData.whatIfScenarios) {
      html += this._renderWhatIf(renderData.whatIfScenarios);
    }

    // 6. Goal Funding Reality
    if (goalFundingReality && goalFundingReality.goals.length) {
      html += this._renderGoalFundingReality(goalFundingReality);
    }

    // 7. Waterfall — "Money flow"
    if (waterfall) {
      html += '<div class="chart-container">' +
        '<div class="chart-header"><h2>Money Flow (' + selectedMonth + ')</h2></div>' +
        '<canvas id="waterfallChart"></canvas></div>';
    }

    // 8. Charts — "How am I trending?"
    if (monthlyData.length > 1) {
      html += '<div class="chart-container">' +
        '<div class="chart-header"><h2>Income vs Expenses</h2></div>' +
        '<canvas id="incExpChart"></canvas></div>';
    }

    if (categoryTrends && categoryTrends.months.length > 1) {
      html += '<div class="chart-container">' +
        '<div class="chart-header"><h2>Expense Trends (Last 12 Months)</h2></div>' +
        '<canvas id="categoryTrendsChart"></canvas></div>';
    }

    if (monthlyData.length > 1) {
      html += '<div class="chart-container">' +
        '<div class="chart-header"><h2>Savings Rate Trend</h2></div>' +
        '<canvas id="savingsRateTrendChart"></canvas></div>';
    }

    // 9. YoY Comparison
    if (yoyComparison && yoyComparison.hasPriorYear) {
      html += this._renderYoYComparison(yoyComparison, selectedMonth);
    }

    // 10. History table
    html += this._renderHistoryTable(monthlyData, selectedMonth);

    el.innerHTML = html;

    // Render charts
    if (waterfall) this._renderWaterfallChart(waterfall);
    if (monthlyData.length > 1) this._renderIncExpChart(monthlyData);
    if (categoryTrends && categoryTrends.months.length > 1) this._renderCategoryTrendsChart(categoryTrends);
    if (monthlyData.length > 1) this._renderSavingsRateTrend(monthlyData);

    // Bind interactions
    this._bindExpenseExpand();
    this._bindHistoryRowClicks();
    this._bindBudgetToggle(budgetVsActual, budgetVsActualYTD, selectedMonth);
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

    // Rolling average toggle
    html += '<div class="cf-trailing-toggle">';
    var trailingOptions = [3, 6, 12];
    var currentTrailing = (window._cashflowTrailingMonths || 6);
    for (var t = 0; t < trailingOptions.length; t++) {
      var active = trailingOptions[t] === currentTrailing ? ' cf-trailing-active' : '';
      html += '<button class="cf-trailing-btn' + active + '" data-trailing="' + trailingOptions[t] + '">' +
        trailingOptions[t] + 'mo</button>';
    }
    html += '</div>';
    html += '</div>';

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
      // Trailing toggle
      var trailingBtns = document.querySelectorAll('.cf-trailing-btn');
      for (var b = 0; b < trailingBtns.length; b++) {
        trailingBtns[b].addEventListener('click', function() {
          var val = parseInt(this.getAttribute('data-trailing'), 10);
          if (window.onCashflowTrailingChange) window.onCashflowTrailingChange(val);
        });
      }
    }, 0);

    return html;
  },

  // --- Scorecard ---
  _renderScorecard: function(sc, spendingSplit, incomeStability) {
    var netCls = sc.netSavingsStatus === 'positive' ? 'cf-summary-positive' :
      (sc.netSavingsStatus === 'negative' ? 'cf-summary-negative' : '');
    var ratePct = (sc.savingsRate * 100).toFixed(1);

    var html = '<div class="cf-scorecard">';

    // P&L bar
    html += '<div class="cf-pnl">' +
      this._summaryItem('Income', sc.income, 'cf-summary-income') +
      '<div class="cf-summary-arrow">&minus;</div>' +
      this._summaryItem('Expenses', sc.expenses, 'cf-summary-expenses') +
      '<div class="cf-summary-arrow">=</div>' +
      this._summaryItem('Net Savings', sc.netSavings, netCls, ' (' + ratePct + '%)') +
    '</div>';

    // Spending split bar (essential vs discretionary)
    if (spendingSplit && sc.expenses > 0) {
      html += '<div class="cf-spending-split">';
      if (spendingSplit.essentialPct > 0) {
        html += '<div class="cf-split-bar cf-split-essential" style="width:' + spendingSplit.essentialPct + '%" ' +
          'title="Essential: ' + Fmt.currency(spendingSplit.essential.total) + ' (' + spendingSplit.essentialPct.toFixed(0) + '%)">' +
          spendingSplit.essentialPct.toFixed(0) + '% Needs</div>';
      }
      if (spendingSplit.discretionaryPct > 0) {
        html += '<div class="cf-split-bar cf-split-discretionary" style="width:' + spendingSplit.discretionaryPct + '%" ' +
          'title="Discretionary: ' + Fmt.currency(spendingSplit.discretionary.total) + ' (' + spendingSplit.discretionaryPct.toFixed(0) + '%)">' +
          spendingSplit.discretionaryPct.toFixed(0) + '% Wants</div>';
      }
      if (spendingSplit.unclassifiedPct > 0) {
        html += '<div class="cf-split-bar cf-split-unclassified" style="width:' + spendingSplit.unclassifiedPct + '%" ' +
          'title="Unclassified: ' + Fmt.currency(spendingSplit.unclassified.total) + ' (' + spendingSplit.unclassifiedPct.toFixed(0) + '%)">' +
          spendingSplit.unclassifiedPct.toFixed(0) + '%</div>';
      }
      html += '</div>';
    }

    // Comparison metrics
    html += '<div class="cf-scorecard-metrics">';

    // Savings rate vs target
    if (sc.targetSavingsRate > 0) {
      var targetPct = (sc.targetSavingsRate * 100).toFixed(0);
      var vsTargetLabel = sc.onTarget ? 'On track' : 'Below target';
      html += '<div class="cf-scorecard-metric">' +
        '<span class="cf-scorecard-metric-label">Target: ' + targetPct + '%</span>' +
        '<span class="cf-scorecard-metric-value ' + sc.onTargetStatus + '">' + vsTargetLabel + '</span>' +
      '</div>';
    }

    // vs prior month
    if (sc.savingsRateDeltaPP !== null) {
      var ppSign = sc.savingsRateDeltaPP >= 0 ? '+' : '';
      html += '<div class="cf-scorecard-metric">' +
        '<span class="cf-scorecard-metric-label">vs Last Month</span>' +
        '<span class="cf-scorecard-metric-value ' + sc.savingsRateDeltaStatus + '">' +
          ppSign + sc.savingsRateDeltaPP.toFixed(1) + 'pp</span>' +
      '</div>';
    }

    // vs trailing average
    if (sc.trailingMonthsUsed >= 2) {
      var avgSign = sc.savingsRateVsAvgPP >= 0 ? '+' : '';
      html += '<div class="cf-scorecard-metric">' +
        '<span class="cf-scorecard-metric-label">vs ' + sc.trailingMonthsUsed + '-mo Avg</span>' +
        '<span class="cf-scorecard-metric-value ' + sc.savingsRateVsAvgStatus + '">' +
          avgSign + sc.savingsRateVsAvgPP.toFixed(1) + 'pp</span>' +
      '</div>';
    }

    // Expenses vs average
    if (sc.trailingMonthsUsed >= 2) {
      var expSign = sc.expenseVsAvgPct >= 0 ? '+' : '';
      html += '<div class="cf-scorecard-metric">' +
        '<span class="cf-scorecard-metric-label">Expenses vs Avg</span>' +
        '<span class="cf-scorecard-metric-value ' + sc.expenseVsAvgStatus + '">' +
          expSign + sc.expenseVsAvgPct.toFixed(0) + '%</span>' +
      '</div>';
    }

    // Income stability
    if (incomeStability && incomeStability.monthCount >= 3) {
      var stabilityLabel = incomeStability.coeffOfVariation < 5 ? 'Very Stable' :
        (incomeStability.coeffOfVariation < 15 ? 'Stable' : 'Variable');
      html += '<div class="cf-scorecard-metric">' +
        '<span class="cf-scorecard-metric-label">Income</span>' +
        '<span class="cf-scorecard-metric-value ' + incomeStability.cvStatus + '">' + stabilityLabel + '</span>' +
      '</div>';
    }

    html += '</div>';

    // Narrative
    if (sc.narrative) {
      html += '<div class="cf-scorecard-narrative">' + sc.narrative + '</div>';
    }

    html += '</div>';
    return html;
  },

  _summaryItem: function(label, value, cls, suffix) {
    return '<div class="cf-summary-item ' + (cls || '') + '">' +
      '<div class="cf-summary-label">' + label + '</div>' +
      '<div class="cf-summary-value">' + Fmt.currency(value) + (suffix || '') + '</div></div>';
  },

  // --- Side-by-side P&L Detail ---
  _renderPnLDetail: function(pnl, categoryAverages, expenseVolatility) {
    var html = '<div class="cf-pnl-detail">';

    // Income panel (left)
    html += '<div class="table-container"><div class="table-header-row"><h2>Income</h2></div>';
    html += '<div class="nw-table-scroll"><table class="returns-table"><thead><tr>' +
      '<th>Category</th><th class="text-right">Amount</th><th class="text-right">%</th>' +
      '</tr></thead><tbody>';

    var incCats = Object.keys(pnl.income.byCategory).sort(function(a, b) {
      return pnl.income.byCategory[b] - pnl.income.byCategory[a];
    });
    for (var i = 0; i < incCats.length; i++) {
      var amt = pnl.income.byCategory[incCats[i]];
      var pct = pnl.income.total > 0 ? (amt / pnl.income.total * 100).toFixed(0) : '0';
      html += '<tr><td>' + incCats[i] + '</td>' +
        '<td class="text-right">' + Fmt.currency(amt) + '</td>' +
        '<td class="text-right">' + pct + '%</td></tr>';
    }
    html += '<tr class="table-total-row"><td>Total</td>' +
      '<td class="text-right">' + Fmt.currency(pnl.income.total) + '</td>' +
      '<td class="text-right"></td></tr>';
    html += '</tbody></table></div></div>';

    // Expense panel (right)
    html += '<div class="table-container"><div class="table-header-row"><h2>Expenses</h2></div>';
    html += '<div class="nw-table-scroll"><table class="returns-table"><thead><tr>' +
      '<th>Category</th><th class="text-right">Amount</th>';
    if (categoryAverages && Object.keys(categoryAverages).length) {
      html += '<th class="text-right">6-mo Avg</th><th class="text-right">vs Avg</th>';
    } else {
      html += '<th class="text-right">%</th>';
    }
    html += '</tr></thead><tbody>';

    var expCats = Object.keys(pnl.expenses.byCategory).sort(function(a, b) {
      return pnl.expenses.byCategory[b].total - pnl.expenses.byCategory[a].total;
    });

    var hasAvgs = categoryAverages && Object.keys(categoryAverages).length;
    for (var j = 0; j < expCats.length; j++) {
      var cat = expCats[j];
      var catObj = pnl.expenses.byCategory[cat];
      var hasSubcats = Object.keys(catObj.subcategories).length > 0 || catObj.items.length > 1;
      var chevron = hasSubcats ? '<span class="cf-cat-chevron">&#9654;</span>' : '<span style="display:inline-block;width:16px"></span>';

      // Anomaly flag: if >20% above 6-mo avg
      var anomalyFlag = '';
      var avgData = hasAvgs && categoryAverages[cat] ? categoryAverages[cat] : null;
      if (avgData && avgData.months >= 2 && avgData.deltaPct > 20) {
        anomalyFlag = ' <span class="cf-anomaly-flag" title="' + avgData.deltaPct.toFixed(0) + '% above average">&#9888;</span>';
      }

      // Volatility badge
      var volBadge = '';
      if (expenseVolatility && expenseVolatility[cat] && expenseVolatility[cat].isVolatile) {
        volBadge = ' <span class="cf-volatility-badge" title="High variability (CV: ' +
          expenseVolatility[cat].cv.toFixed(0) + '%)">~</span>';
      }

      html += '<tr class="' + (hasSubcats ? 'cf-cat-row' : '') + '" data-category="' + cat + '">' +
        '<td>' + chevron + cat + anomalyFlag + volBadge + '</td>' +
        '<td class="text-right">' + Fmt.currency(catObj.total) + '</td>';

      if (hasAvgs) {
        if (avgData && avgData.months >= 1) {
          var dSign = avgData.delta >= 0 ? '+' : '';
          html += '<td class="text-right text-secondary">' + Fmt.currency(avgData.avg) + '</td>' +
            '<td class="text-right ' + avgData.deltaStatus + '">' + dSign + Fmt.currency(avgData.delta) + '</td>';
        } else {
          html += '<td class="text-right text-secondary">-</td><td class="text-right">-</td>';
        }
      } else {
        var pctVal = pnl.expenses.total > 0 ? (catObj.total / pnl.expenses.total * 100).toFixed(0) : '0';
        html += '<td class="text-right">' + pctVal + '%</td>';
      }
      html += '</tr>';

      // Subcategory rows
      if (hasSubcats) {
        for (var k = 0; k < catObj.items.length; k++) {
          var item = catObj.items[k];
          var subLabel = item.subcategory || '(no subcategory)';
          var notesHtml = item.notes ? ' <span class="cf-subcat-notes">' + item.notes + '</span>' : '';
          var colSpan = hasAvgs ? 3 : 2;
          html += '<tr class="cf-subcat-row" data-parent="' + cat + '">' +
            '<td>' + subLabel + notesHtml + '</td>' +
            '<td class="text-right">' + Fmt.currency(item.amount) + '</td>' +
            '<td class="text-right" colspan="' + (colSpan - 1) + '"></td></tr>';
        }
      }
    }

    html += '<tr class="table-total-row"><td><span style="display:inline-block;width:16px"></span>Total</td>' +
      '<td class="text-right">' + Fmt.currency(pnl.expenses.total) + '</td>';
    if (hasAvgs) {
      html += '<td class="text-right"></td><td class="text-right"></td>';
    } else {
      html += '<td class="text-right"></td>';
    }
    html += '</tr>';
    html += '</tbody></table></div></div>';

    html += '</div>'; // cf-pnl-detail
    return html;
  },

  // --- Budget vs Actual (with Month/YTD toggle) ---
  _renderBudgetVsActual: function(bva, bvaYTD, selectedMonth) {
    var hasYTD = bvaYTD && Object.keys(bvaYTD.byCategory).length > 0;
    var year = selectedMonth ? selectedMonth.slice(0, 4) : '';

    var html = '<div class="table-container"><div class="table-header-row">' +
      '<h2>Budget vs Actual</h2>';
    if (hasYTD) {
      html += '<div class="cf-budget-toggle">' +
        '<button class="cf-budget-toggle-btn cf-budget-toggle-active" data-view="month">Month</button>' +
        '<button class="cf-budget-toggle-btn" data-view="ytd">YTD ' + year + '</button>' +
      '</div>';
    }
    html += '</div>';

    // Month view (default)
    html += '<div id="cfBudgetMonth">' + this._renderBvaTable(bva, selectedMonth) + '</div>';

    // YTD view (hidden)
    if (hasYTD) {
      html += '<div id="cfBudgetYTD" style="display:none">' +
        this._renderBvaTable(bvaYTD, 'Jan\u2013' + this._formatMonthShort(selectedMonth) + ' ' + year) + '</div>';
    }

    html += '</div>';
    return html;
  },

  _renderBvaTable: function(bva, label) {
    if (!bva || !bva.byCategory) return '<p class="text-secondary">No budget data</p>';
    var cats = Object.keys(bva.byCategory).sort();
    if (!cats.length) return '';

    var html = '<div class="nw-table-scroll"><table class="returns-table"><thead><tr>' +
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

    var t = bva.totals;
    html += '<tr class="table-total-row"><td>Total</td>' +
      '<td class="text-right">' + Fmt.currency(t.planned) + '</td>' +
      '<td class="text-right">' + Fmt.currency(t.actual) + '</td>' +
      '<td class="text-right ' + t.varianceStatus + '">' +
        (t.delta >= 0 ? '+' : '') + Fmt.currency(t.delta) + '</td>' +
      '<td class="text-right ' + t.varianceStatus + '">' +
        (t.variancePct >= 0 ? '+' : '') + t.variancePct.toFixed(0) + '%</td></tr>';

    html += '</tbody></table></div>';
    return html;
  },

  _bindBudgetToggle: function(bva, bvaYTD, selectedMonth) {
    var btns = document.querySelectorAll('.cf-budget-toggle-btn');
    if (!btns.length) return;
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function() {
        var view = this.getAttribute('data-view');
        var monthEl = document.getElementById('cfBudgetMonth');
        var ytdEl = document.getElementById('cfBudgetYTD');
        if (!monthEl || !ytdEl) return;

        monthEl.style.display = view === 'month' ? '' : 'none';
        ytdEl.style.display = view === 'ytd' ? '' : 'none';

        var siblings = this.parentElement.querySelectorAll('.cf-budget-toggle-btn');
        for (var j = 0; j < siblings.length; j++) siblings[j].classList.remove('cf-budget-toggle-active');
        this.classList.add('cf-budget-toggle-active');
      });
    }
  },

  // --- Improvement Areas ---
  _renderImprovementAreas: function(areas) {
    if (!areas || !areas.length) return '';

    var html = '<div class="table-container"><div class="table-header-row"><h2>Improvement Areas</h2></div>' +
      '<div class="cf-improvements">';

    for (var i = 0; i < areas.length; i++) {
      var a = areas[i];
      var icon = a.severity === 'warning' ? '&#9888;' : (a.severity === 'success' ? '&#10003;' : '&#8505;');
      var cls = 'cf-improvement-' + a.severity;

      html += '<div class="cf-improvement ' + cls + '">' +
        '<div class="cf-improvement-icon">' + icon + '</div>' +
        '<div class="cf-improvement-body">' +
          '<div class="cf-improvement-title">' + a.title + '</div>' +
          '<div class="cf-improvement-detail">' + a.detail + '</div>';

      if (a.annualImpact && a.annualImpact > 0) {
        html += '<div class="cf-improvement-impact">Annual impact: <strong>' +
          Fmt.currency(a.annualImpact) + '</strong></div>';
      }

      html += '</div></div>';
    }

    html += '</div></div>';
    return html;
  },

  // --- FI Impact per Category ---
  _renderFIImpact: function(fiImpact) {
    if (!fiImpact || !fiImpact.length) return '';

    var html = '<div class="table-container"><div class="table-header-row"><h2>FI Impact by Category</h2>' +
      '<span class="cf-fi-impact-hint">If eliminated entirely</span></div>';
    html += '<div class="nw-table-scroll"><table class="returns-table"><thead><tr>' +
      '<th>Category</th><th class="text-right">Monthly</th>' +
      '<th class="text-right">FI Acceleration</th></tr></thead><tbody>';

    for (var i = 0; i < fiImpact.length; i++) {
      var fi = fiImpact[i];
      if (fi.fiImpactMonths < 0.1) continue; // skip negligible
      var months = fi.fiImpactMonths;
      var label = months >= 12 ? (months / 12).toFixed(1) + ' years' : months.toFixed(1) + ' months';

      html += '<tr><td>' + fi.category + '</td>' +
        '<td class="text-right">' + Fmt.currency(fi.amount) + '</td>' +
        '<td class="text-right ' + fi.fiImpactMonthsStatus + '">' + label + ' faster</td></tr>';
    }

    html += '</tbody></table></div></div>';
    return html;
  },

  // --- What-If Scenarios ---
  _renderWhatIf: function(scenarios) {
    if (!scenarios || !scenarios.length) return '';

    var html = '<div class="table-container"><div class="table-header-row">' +
      '<h2>What If I Cut Discretionary Spending?</h2></div>';
    html += '<div class="nw-table-scroll"><table class="returns-table"><thead><tr>' +
      '<th>Cut</th><th class="text-right">Monthly Saved</th>' +
      '<th class="text-right">New Rate</th><th class="text-right">FI Faster By</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < scenarios.length; i++) {
      var s = scenarios[i];
      var fiLabel = '-';
      if (s.fiAccelerationMonths !== null) {
        fiLabel = s.fiAccelerationMonths >= 12
          ? (s.fiAccelerationMonths / 12).toFixed(1) + ' years'
          : s.fiAccelerationMonths.toFixed(1) + ' months';
      }
      html += '<tr>' +
        '<td>' + s.label + '</td>' +
        '<td class="text-right">' + Fmt.currency(s.savings) + '</td>' +
        '<td class="text-right ' + s.newSavingsRateStatus + '">' + (s.newSavingsRate * 100).toFixed(1) + '%</td>' +
        '<td class="text-right ' + s.fiAccelerationStatus + '">' + fiLabel + '</td></tr>';
    }

    html += '</tbody></table></div></div>';
    return html;
  },

  // --- Goal Funding Reality ---
  _renderGoalFundingReality: function(gfr) {
    if (!gfr || !gfr.goals.length) return '';

    var html = '<div class="table-container"><div class="table-header-row"><h2>Goal Funding</h2></div>';
    html += '<div class="nw-table-scroll"><table class="returns-table"><thead><tr>' +
      '<th>Goal</th><th class="text-right">Planned</th>' +
      '<th class="text-right">Actual</th><th class="text-right">Status</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < gfr.goals.length; i++) {
      var g = gfr.goals[i];
      var statusLabel = g.status === 'on_track' ? 'On track' :
        (g.status === 'underfunded' ? 'Underfunded' :
        (g.status === 'overfunded' ? 'Overfunded' :
        (g.status === 'withdrawn' ? 'Withdrawn' : g.status)));
      var statusCls = g.status === 'on_track' || g.status === 'overfunded' ? 'positive' :
        (g.status === 'underfunded' ? 'negative' : 'negative');

      html += '<tr><td>' + g.name + '</td>' +
        '<td class="text-right">' + Fmt.currency(g.planned) + '</td>' +
        '<td class="text-right">' + Fmt.currency(g.actual) + '</td>' +
        '<td class="text-right ' + statusCls + '">' + statusLabel + '</td></tr>';
    }

    html += '<tr class="table-total-row"><td>Total</td>' +
      '<td class="text-right">' + Fmt.currency(gfr.totalPlanned) + '</td>' +
      '<td class="text-right">' + Fmt.currency(gfr.totalActual) + '</td>' +
      '<td class="text-right"></td></tr>';

    if (gfr.overdrawn > 0) {
      html += '<tr><td colspan="4" class="cf-funding-alert-warning">' +
        'Goal contributions exceed available savings by ' + Fmt.currency(gfr.overdrawn) + '</td></tr>';
    }

    html += '</tbody></table></div></div>';
    return html;
  },

  // --- YoY Comparison ---
  _renderYoYComparison: function(yoy, selectedMonth) {
    if (!yoy || !yoy.hasPriorYear) return '';

    var html = '<div class="table-container"><div class="table-header-row">' +
      '<h2>Year-over-Year (' + this._formatMonthShort(selectedMonth) + ' ' + selectedMonth.slice(0, 4) +
      ' vs ' + this._formatMonthShort(yoy.priorYearMonth) + ' ' + yoy.priorYearMonth.slice(0, 4) + ')</h2></div>';

    // Summary cards
    html += '<div class="cf-yoy-summary">';
    var incDeltaSign = yoy.totalIncomeChange.delta >= 0 ? '+' : '';
    var expDeltaSign = yoy.totalExpenseChange.delta >= 0 ? '+' : '';
    var srSign = yoy.savingsRateChangePP >= 0 ? '+' : '';

    html += '<div class="cf-yoy-item">' +
      '<span class="cf-yoy-label">Income</span>' +
      '<span class="cf-yoy-value ' + yoy.totalIncomeChange.deltaStatus + '">' +
        incDeltaSign + Fmt.currency(yoy.totalIncomeChange.delta) +
        ' (' + incDeltaSign + yoy.totalIncomeChange.deltaPct.toFixed(0) + '%)</span></div>';
    html += '<div class="cf-yoy-item">' +
      '<span class="cf-yoy-label">Expenses</span>' +
      '<span class="cf-yoy-value ' + yoy.totalExpenseChange.deltaStatus + '">' +
        expDeltaSign + Fmt.currency(yoy.totalExpenseChange.delta) +
        ' (' + expDeltaSign + yoy.totalExpenseChange.deltaPct.toFixed(0) + '%)</span></div>';
    html += '<div class="cf-yoy-item">' +
      '<span class="cf-yoy-label">Savings Rate</span>' +
      '<span class="cf-yoy-value ' + yoy.savingsRateChangeStatus + '">' +
        srSign + yoy.savingsRateChangePP.toFixed(1) + 'pp</span></div>';
    html += '</div>';

    // Category detail (top changes)
    if (yoy.expenseChanges.length) {
      html += '<div class="nw-table-scroll"><table class="returns-table"><thead><tr>' +
        '<th>Category</th><th class="text-right">This Year</th>' +
        '<th class="text-right">Last Year</th><th class="text-right">Change</th>' +
        '</tr></thead><tbody>';

      var shown = Math.min(yoy.expenseChanges.length, 8);
      for (var i = 0; i < shown; i++) {
        var c = yoy.expenseChanges[i];
        var sign = c.delta >= 0 ? '+' : '';
        html += '<tr><td>' + c.category + '</td>' +
          '<td class="text-right">' + Fmt.currency(c.current) + '</td>' +
          '<td class="text-right text-secondary">' + Fmt.currency(c.prior) + '</td>' +
          '<td class="text-right ' + c.deltaStatus + '">' + sign + Fmt.currency(c.delta) + '</td></tr>';
      }

      html += '</tbody></table></div>';
    }

    html += '</div>';
    return html;
  },

  // --- Bind expandable expense rows ---
  _bindExpenseExpand: function() {
    var rows = document.querySelectorAll('.cf-cat-row');
    for (var i = 0; i < rows.length; i++) {
      rows[i].addEventListener('click', function() {
        var cat = this.getAttribute('data-category');
        var isExpanded = this.classList.contains('expanded');
        this.classList.toggle('expanded');
        var subRows = document.querySelectorAll('.cf-subcat-row[data-parent="' + cat + '"]');
        for (var j = 0; j < subRows.length; j++) {
          subRows[j].classList[isExpanded ? 'remove' : 'add']('visible');
        }
      });
    }
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
        '<td class="text-right ' + r.savingsRateStatus + '">' + Fmt.pct(r.savingsRate * 100) + '</td></tr>';
    }

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
        '<td class="text-right">' + Fmt.pct(avgRate) + '</td></tr>';
    }

    html += '</tbody></table></div></div>';
    return html;
  },

  _bindHistoryRowClicks: function() {
    var rows = document.querySelectorAll('.cf-row-clickable');
    for (var i = 0; i < rows.length; i++) {
      rows[i].addEventListener('click', function() {
        var month = this.getAttribute('data-month');
        if (window.onCashflowMonthChange) window.onCashflowMonthChange(month);
      });
    }
  },

  // --- Budget-only section (no actuals) ---
  _renderBudgetOnlySection: function(budgetSummary) {
    var html = '<div class="table-container"><div class="table-header-row"><h2>Monthly Budget</h2></div>';
    html += '<div class="metrics">';
    html += this._metricCard('Total Budget', Fmt.currency(budgetSummary.total), '');
    html += this._metricCard('Fixed', Fmt.currency(budgetSummary.fixed), '');
    html += this._metricCard('Variable', Fmt.currency(budgetSummary.variable), '');
    html += '</div>';

    html += '<div class="nw-table-scroll"><table class="returns-table"><thead><tr>' +
      '<th>Category</th><th class="text-right">Fixed</th>' +
      '<th class="text-right">Variable</th><th class="text-right">Total</th></tr></thead><tbody>';

    var cats = Object.keys(budgetSummary.byCategory).sort();
    for (var i = 0; i < cats.length; i++) {
      var catData = budgetSummary.byCategory[cats[i]];
      var fixedAmt = 0, varAmt = 0;
      for (var j = 0; j < catData.items.length; j++) {
        if (catData.items[j].type === 'fixed') fixedAmt += catData.items[j].monthly;
        else varAmt += catData.items[j].monthly;
      }
      html += '<tr><td>' + cats[i] + '</td>' +
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

  // --- Charts ---

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

    var bases = [0], heights = [waterfall.income], running = waterfall.income;
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
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(ctx) { return ctx.datasetIndex === 0 ? null : Fmt.currency(ctx.raw); } } } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: function(v) { return Fmt.currency(v); } } } }
      }
    });
  },

  _renderIncExpChart: function(monthlyData) {
    var canvas = document.getElementById('incExpChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (this._incExpChart) this._incExpChart.destroy();

    var labels = monthlyData.map(function(r) { return r.month; });
    var incData = monthlyData.map(function(r) { return r.income; });
    var expData = monthlyData.map(function(r) { return r.expenses; });

    this._incExpChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: 'Income', data: incData, borderColor: '#1a73e8', backgroundColor: 'rgba(26,115,232,0.08)', fill: true, tension: 0.25, pointRadius: 3 },
          { label: 'Expenses', data: expData, borderColor: '#d93025', backgroundColor: 'rgba(217,48,37,0.08)', fill: true, tension: 0.25, pointRadius: 3 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } }, tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + Fmt.currency(ctx.raw); } } } },
        scales: { x: { grid: { display: false } }, y: { ticks: { callback: function(v) { return Fmt.currency(v); } } } }
      }
    });
  },

  _renderCategoryTrendsChart: function(trends) {
    var canvas = document.getElementById('categoryTrendsChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (this._categoryTrendsChart) this._categoryTrendsChart.destroy();

    var palette = ['#1a73e8', '#d93025', '#0d904f', '#e8710a', '#9334e6', '#00897b', '#c2185b', '#5c6bc0', '#fb8c00', '#43a047'];
    var datasets = [];
    for (var i = 0; i < trends.categories.length; i++) {
      datasets.push({
        label: trends.categories[i],
        data: trends.series[trends.categories[i]],
        backgroundColor: palette[i % palette.length],
        borderWidth: 0
      });
    }

    this._categoryTrendsChart = new Chart(canvas, {
      type: 'bar',
      data: { labels: trends.months, datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }, tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + Fmt.currency(ctx.raw); } } } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: function(v) { return Fmt.currency(v); } } } }
      }
    });
  },

  _renderSavingsRateTrend: function(actualData) {
    var canvas = document.getElementById('savingsRateTrendChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (this._trendChart) this._trendChart.destroy();

    var labels = actualData.map(function(r) { return r.month; });
    var data = actualData.map(function(r) { return r.savingsRate * 100; });
    var statusColors = { positive: '#0d904f', neutral: '#e8710a', negative: '#d93025' };
    var pointColors = actualData.map(function(r) { return statusColors[r.savingsRateStatus] || '#e8710a'; });

    this._trendChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Savings Rate', data: data,
          borderColor: '#1a73e8', backgroundColor: 'rgba(26,115,232,0.08)',
          fill: true, pointRadius: 4, pointBackgroundColor: pointColors, tension: 0.25
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(ctx) { return 'Savings Rate: ' + ctx.raw.toFixed(1) + '%'; } } } },
        scales: { x: { grid: { display: false } }, y: { ticks: { callback: function(v) { return v + '%'; } }, suggestedMin: 0, suggestedMax: 100 } }
      }
    });
  },

  _formatMonthName: function(monthStr) {
    var parts = monthStr.split('-');
    var names = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return names[parseInt(parts[1], 10) - 1] + ' ' + parts[0];
  },

  _formatMonthShort: function(monthStr) {
    var parts = monthStr.split('-');
    var names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return names[parseInt(parts[1], 10) - 1];
  }
};
