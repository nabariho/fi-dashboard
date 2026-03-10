// === CASH FLOW RENDERER ===
// Renders Cash Flow tab organized by user questions:
// 1. "How did I do?" — Scorecard with narrative + spending split + income stability
// 2. "Where does every cent go?" — Money Flow Statement (P&L → deployments → residual)
// 3. "Am I on budget?" — Budget vs Actual (month + YTD toggle)
// 4. "What should I improve?" — Improvement areas + FI impact per category
// 5. "How am I trending?" — Charts (expense trends, income vs expenses, savings rate)
// 6. "Year-over-year" — Same month last year comparison
// 7. "History" — Clickable monthly table

var CashFlowRenderer = {
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

    // 2b. Cash Health — "Can I cover all my obligations?"
    if (renderData.cashHealth) {
      html += this._renderCashHealth(renderData.cashHealth, renderData.cashHealthTrailing, renderData.balanceDecomposition);

      // Cash Health trend charts (need multiple months)
      if (renderData.cashHealthAllMonths && renderData.cashHealthAllMonths.length > 1) {
        html += '<div class="chart-container">' +
          '<div class="chart-header"><h2>Cash Health Trend</h2></div>' +
          '<canvas id="cashHealthTrendChart"></canvas></div>';
      }
      if (renderData.decompositionSeries && renderData.decompositionSeries.length > 1) {
        html += '<div class="chart-container">' +
          '<div class="chart-header"><h2>Transactional Balance Breakdown</h2></div>' +
          '<canvas id="balanceDecompChart"></canvas></div>';
      }
    }

    // 3. Money Flow Statement — "Where does every cent go?"
    var moneyFlow = renderData.moneyFlow;
    if (moneyFlow) {
      html += this._renderMoneyFlowStatement(moneyFlow, categoryAverages, expenseVolatility);
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

    // 6. Charts — "How am I trending?"
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

    // 7. YoY Comparison
    if (yoyComparison && yoyComparison.hasPriorYear) {
      html += this._renderYoYComparison(yoyComparison, selectedMonth);
    }

    // 8. History table
    html += this._renderHistoryTable(monthlyData, selectedMonth);

    el.innerHTML = html;

    // Render charts
    if (monthlyData.length > 1) this._renderIncExpChart(monthlyData);
    if (categoryTrends && categoryTrends.months.length > 1) this._renderCategoryTrendsChart(categoryTrends);
    if (monthlyData.length > 1) this._renderSavingsRateTrend(monthlyData);
    if (renderData.cashHealthAllMonths && renderData.cashHealthAllMonths.length > 1) {
      this._renderCashHealthTrendChart(renderData.cashHealthAllMonths);
    }
    if (renderData.decompositionSeries && renderData.decompositionSeries.length > 1) {
      this._renderBalanceDecompChart(renderData.decompositionSeries);
    }

    // Bind interactions
    this._bindMoneyFlowCollapsibles();
    this._bindExpenseExpand();
    this._bindHistoryRowClicks();
    this._bindBudgetToggle(budgetVsActual, budgetVsActualYTD, selectedMonth);
  },

  // --- Cash Health ---
  _renderCashHealth: function(health, trailing, decomposition) {
    var monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var statusClass = health.surplusStatus === 'positive' ? 'cf-health-healthy' :
                      health.surplusStatus === 'negative' ? 'cf-health-deficit' : 'cf-health-neutral';
    var statusLabel = health.surplus >= 0 ? 'HEALTHY' : 'DEFICIT';
    var statusIcon = health.surplus >= 0 ? '&#10003;' : '&#9888;';

    var html = '<div class="cf-section cf-health-section ' + statusClass + '">' +
      '<div class="cf-health-header">' +
        '<h2>Cash Health</h2>' +
        '<span class="cf-health-badge ' + statusClass + '">' + statusIcon + ' ' + statusLabel + '</span>' +
      '</div>';

    // Main equation
    html += '<div class="cf-health-equation">' +
      '<div class="cf-health-row">' +
        '<span class="cf-health-label">Income</span>' +
        '<span class="cf-health-amount">' + Fmt.currency(health.income) + '</span>' +
      '</div>' +
      '<div class="cf-health-row cf-health-debit">' +
        '<span class="cf-health-label">Operating expenses</span>' +
        '<span class="cf-health-amount">(' + Fmt.currency(health.operatingExpenses) + ')</span>' +
      '</div>' +
      '<div class="cf-health-row cf-health-debit">' +
        '<span class="cf-health-label">Annual provisions (1/12)</span>' +
        '<span class="cf-health-amount">(' + Fmt.currency(health.annualProvision) + ')</span>' +
      '</div>';

    // Goal contribution details
    if (health.goalContributionDetails && health.goalContributionDetails.length) {
      for (var i = 0; i < health.goalContributionDetails.length; i++) {
        var gc = health.goalContributionDetails[i];
        var gcLabel = gc.name;
        if (gc.actual !== gc.planned && gc.planned > 0) {
          gcLabel += ' <span class="cf-health-planned">(planned: ' + Fmt.currency(gc.planned) + ')</span>';
        }
        html += '<div class="cf-health-row cf-health-debit">' +
          '<span class="cf-health-label">' + gcLabel + '</span>' +
          '<span class="cf-health-amount">(' + Fmt.currency(gc.actual) + ')</span>' +
        '</div>';
      }
    } else if (health.goalContributions > 0) {
      html += '<div class="cf-health-row cf-health-debit">' +
        '<span class="cf-health-label">Goal contributions</span>' +
        '<span class="cf-health-amount">(' + Fmt.currency(health.goalContributions) + ')</span>' +
      '</div>';
    }

    html += '<div class="cf-health-divider"></div>' +
      '<div class="cf-health-row cf-health-total ' + statusClass + '">' +
        '<span class="cf-health-label">' + (health.surplus >= 0 ? 'Monthly surplus' : 'Monthly deficit') + '</span>' +
        '<span class="cf-health-amount">' + (health.surplus < 0 ? '(' + Fmt.currency(Math.abs(health.surplus)) + ')' : Fmt.currency(health.surplus)) + '</span>' +
      '</div>';

    // Deficit warning
    if (health.surplus < -0.01) {
      html += '<div class="cf-health-alert">' +
        '&#9888; ' + Fmt.currency(Math.abs(health.surplus)) + ' was drawn from your goal earmark this month.' +
      '</div>';
    }

    html += '</div>'; // equation

    // Trailing summary
    if (trailing) {
      var trendClass = trailing.trend === 'healthy' ? 'positive' : (trailing.trend === 'deteriorating' ? 'negative' : 'neutral');
      html += '<div class="cf-health-trailing">' +
        '<span class="cf-health-trailing-label">Last ' + trailing.totalMonths + ' months:</span> ' +
        'Avg surplus <span class="' + trendClass + '">' + Fmt.currency(trailing.avgSurplus) + '/mo</span>';
      if (trailing.deficitMonths > 0) {
        html += ' &middot; <span class="negative">Deficit in ' + trailing.deficitMonths + ' of ' + trailing.totalMonths + ' months</span>';
      }
      html += '</div>';
    }

    // Provision status table
    if (health.provisionItems && health.provisionItems.length) {
      html += '<details class="cf-health-provisions">' +
        '<summary>Provision Status (' + health.provisionItems.length + ' annual items)</summary>' +
        '<table class="cf-health-prov-table"><thead><tr>' +
          '<th>Item</th><th style="text-align:right">Annual</th><th style="text-align:right">Accrued</th>' +
          '<th>Due</th><th>Status</th>' +
        '</tr></thead><tbody>';

      for (var p = 0; p < health.provisionItems.length; p++) {
        var pi = health.provisionItems[p];
        var provStatusClass = pi.status === 'at_risk' ? 'negative' : (pi.status === 'on_track' ? 'positive' : 'neutral');
        var provStatusLabel = pi.status === 'at_risk' ? 'At risk' : (pi.status === 'on_track' ? 'On track' : 'No due date');
        var dueLabel = pi.due_month ? monthNames[pi.due_month] : '—';
        var pctAccrued = pi.annualAmount > 0 ? Math.round(Math.max(0, pi.balance) / pi.annualAmount * 100) : 0;

        html += '<tr>' +
          '<td>' + pi.name + '</td>' +
          '<td style="text-align:right">' + Fmt.currency(pi.annualAmount) + '</td>' +
          '<td style="text-align:right">' + Fmt.currency(Math.max(0, pi.balance)) + ' <span class="cf-health-pct">(' + pctAccrued + '%)</span></td>' +
          '<td>' + dueLabel + '</td>' +
          '<td><span class="' + provStatusClass + '">' + provStatusLabel + '</span></td>' +
        '</tr>';
      }

      html += '</tbody></table></details>';
    }

    // Balance decomposition
    if (decomposition && decomposition.accountBalance > 0) {
      html += '<details class="cf-health-decomp">' +
        '<summary>Transactional Account Balance Breakdown</summary>' +
        '<div class="cf-health-decomp-rows">' +
          '<div class="cf-health-row">' +
            '<span class="cf-health-label">Account balance</span>' +
            '<span class="cf-health-amount">' + Fmt.currency(decomposition.accountBalance) + '</span>' +
          '</div>' +
          '<div class="cf-health-row cf-health-debit">' +
            '<span class="cf-health-label">Goal earmark</span>' +
            '<span class="cf-health-amount">(' + Fmt.currency(decomposition.goalEarmark) + ')</span>' +
          '</div>' +
          '<div class="cf-health-row cf-health-debit">' +
            '<span class="cf-health-label">Provision reserve</span>' +
            '<span class="cf-health-amount">(' + Fmt.currency(decomposition.provisionReserve) + ')</span>' +
          '</div>' +
          '<div class="cf-health-divider"></div>' +
          '<div class="cf-health-row cf-health-total ' + (decomposition.availableCashStatus === 'positive' ? 'cf-health-healthy' : 'cf-health-deficit') + '">' +
            '<span class="cf-health-label">Available operating cash</span>' +
            '<span class="cf-health-amount">' + Fmt.currency(decomposition.availableCash) + '</span>' +
          '</div>' +
        '</div>' +
      '</details>';
    }

    html += '</div>'; // section
    return html;
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

  // --- Money Flow Statement ---
  _renderMoneyFlowStatement: function(mf, categoryAverages, expenseVolatility) {
    var html = '<div class="table-container cf-money-flow">' +
      '<div class="table-header-row"><h2>Money Flow Statement</h2></div>';

    // Balance verdict banner
    html += '<div class="cf-mf-verdict cf-mf-verdict-' + mf.balanceVerdictStatus + '">' +
      mf.balanceVerdict + '</div>';

    // --- INCOME section (collapsible) ---
    html += '<div class="cf-mf-section">';
    html += '<div class="cf-mf-section-header cf-mf-collapsible" data-section="mf-income">' +
      '<span class="cf-mf-chevron">&#9660;</span>' +
      '<span class="cf-mf-section-title">INCOME</span>' +
      '<span class="cf-mf-section-total">' + Fmt.currency(mf.income.total) + '</span></div>';
    html += '<div class="cf-mf-section-body" id="mf-income">';

    var incCats = Object.keys(mf.income.byCategory).sort(function(a, b) {
      return mf.income.byCategory[b] - mf.income.byCategory[a];
    });
    for (var i = 0; i < incCats.length; i++) {
      var amt = mf.income.byCategory[incCats[i]];
      html += '<div class="cf-mf-line cf-mf-line-indent">' +
        '<span class="cf-mf-line-label">' + incCats[i] + '</span>' +
        '<span class="cf-mf-line-amount">' + Fmt.currency(amt) + '</span></div>';
    }
    html += '</div></div>';

    // --- EXPENSES section (collapsible, with expandable subcategories) ---
    html += '<div class="cf-mf-section">';
    html += '<div class="cf-mf-section-header cf-mf-collapsible" data-section="mf-expenses">' +
      '<span class="cf-mf-chevron">&#9660;</span>' +
      '<span class="cf-mf-section-title">EXPENSES</span>' +
      '<span class="cf-mf-section-total cf-mf-negative">&minus;' + Fmt.currency(mf.expenses.total) + '</span></div>';
    html += '<div class="cf-mf-section-body" id="mf-expenses">';

    var expCats = Object.keys(mf.expenses.byCategory).sort(function(a, b) {
      return mf.expenses.byCategory[b].total - mf.expenses.byCategory[a].total;
    });

    var hasAvgs = categoryAverages && Object.keys(categoryAverages).length;
    for (var j = 0; j < expCats.length; j++) {
      var cat = expCats[j];
      var catObj = mf.expenses.byCategory[cat];
      var hasSubcats = Object.keys(catObj.subcategories).length > 0 || catObj.items.length > 1;
      var pctOfTotal = mf.expenses.total > 0 ? (catObj.total / mf.expenses.total * 100).toFixed(0) : '0';

      // Anomaly + volatility badges
      var badges = '';
      var avgData = hasAvgs && categoryAverages[cat] ? categoryAverages[cat] : null;
      if (avgData && avgData.months >= 2 && avgData.deltaPct > 20) {
        badges += ' <span class="cf-anomaly-flag" title="' + avgData.deltaPct.toFixed(0) + '% above average">&#9888;</span>';
      }
      if (expenseVolatility && expenseVolatility[cat] && expenseVolatility[cat].isVolatile) {
        badges += ' <span class="cf-volatility-badge" title="High variability (CV: ' +
          expenseVolatility[cat].cv.toFixed(0) + '%)">~</span>';
      }

      var chevron = hasSubcats ? '<span class="cf-cat-chevron">&#9654;</span>' : '';
      var rowCls = hasSubcats ? ' cf-cat-row' : '';

      html += '<div class="cf-mf-line cf-mf-line-indent' + rowCls + '" data-category="' + cat + '">' +
        '<span class="cf-mf-line-label">' + chevron + cat + badges +
        ' <span class="cf-mf-pct">' + pctOfTotal + '%</span></span>' +
        '<span class="cf-mf-line-amount">' + Fmt.currency(catObj.total) + '</span></div>';

      // Subcategory rows (hidden, expandable)
      if (hasSubcats) {
        for (var k = 0; k < catObj.items.length; k++) {
          var item = catObj.items[k];
          var subLabel = item.subcategory || '(no subcategory)';
          var notesHtml = item.notes ? ' <span class="cf-subcat-notes">' + item.notes + '</span>' : '';
          html += '<div class="cf-mf-line cf-mf-line-subcat cf-subcat-row" data-parent="' + cat + '">' +
            '<span class="cf-mf-line-label">' + subLabel + notesHtml + '</span>' +
            '<span class="cf-mf-line-amount text-secondary">' + Fmt.currency(item.amount) + '</span></div>';
        }
      }
    }
    html += '</div></div>';

    // --- NET SAVINGS divider ---
    html += '<div class="cf-mf-divider"></div>';
    var netCls = mf.netSavings >= 0 ? 'cf-mf-positive' : 'cf-mf-negative';
    var ratePct = (mf.savingsRate * 100).toFixed(1);
    html += '<div class="cf-mf-line cf-mf-total">' +
      '<span class="cf-mf-line-label">NET SAVINGS <span class="cf-mf-pct">' + ratePct + '% savings rate</span></span>' +
      '<span class="cf-mf-line-amount ' + netCls + '">' + Fmt.currency(mf.netSavings) + '</span></div>';

    // --- DEPLOYED TO GOALS section (collapsible) ---
    if (mf.deployments.length > 0) {
      html += '<div class="cf-mf-section">';
      html += '<div class="cf-mf-section-header cf-mf-collapsible" data-section="mf-deployments">' +
        '<span class="cf-mf-chevron">&#9660;</span>' +
        '<span class="cf-mf-section-title">DEPLOYED TO GOALS</span>' +
        '<span class="cf-mf-section-total cf-mf-negative">&minus;' + Fmt.currency(mf.totalDeployed) + '</span></div>';
      html += '<div class="cf-mf-section-body" id="mf-deployments">';

      for (var g = 0; g < mf.deployments.length; g++) {
        var dep = mf.deployments[g];
        var statusCls = (dep.status === 'on_track' || dep.status === 'overfunded') ? 'positive' :
          (dep.status === 'underfunded' || dep.status === 'withdrawn') ? 'negative' : 'neutral';
        var statusIcon = dep.status === 'on_track' ? '&#10003;' :
          (dep.status === 'underfunded' ? '&#9888;' :
          (dep.status === 'overfunded' ? '&#9650;' : '&#9660;'));

        // Goal line
        html += '<div class="cf-mf-line cf-mf-line-indent">' +
          '<span class="cf-mf-line-label">' + dep.goal + '</span>' +
          '<span class="cf-mf-line-amount">' + Fmt.currency(dep.actual) + '</span></div>';

        // Planned vs actual detail
        html += '<div class="cf-mf-line cf-mf-line-detail">' +
          '<span class="cf-mf-line-label text-secondary">planned ' + Fmt.currency(dep.planned) +
          ' &rarr; actual ' + Fmt.currency(dep.actual) +
          ' <span class="' + statusCls + '">' + statusIcon + ' ' + dep.statusLabel + '</span></span></div>';

        // Inline account detail
        if (dep.accounts.length > 0) {
          for (var da = 0; da < dep.accounts.length; da++) {
            var acct = dep.accounts[da];
            html += '<div class="cf-mf-line cf-mf-line-account">' +
              '<span class="cf-mf-line-label text-muted">' + acct.name + '</span>' +
              '<span class="cf-mf-line-amount text-muted">' + Fmt.currency(acct.net_contribution) + '</span></div>';
          }
        }
      }
      html += '</div></div>';
    }

    // --- DIVIDER + RESIDUAL (always visible) ---
    html += '<div class="cf-mf-divider"></div>';
    var resCls = mf.residual >= 0 ? 'cf-mf-positive' : 'cf-mf-negative';
    html += '<div class="cf-mf-line cf-mf-total">' +
      '<span class="cf-mf-line-label">UNALLOCATED</span>' +
      '<span class="cf-mf-line-amount ' + resCls + '">' + Fmt.currency(mf.residual) + '</span></div>';

    // --- ACCOUNT MOVEMENTS section (collapsible) ---
    if (mf.accountMovements.length > 0) {
      html += '<div class="cf-mf-section">';
      html += '<div class="cf-mf-section-header cf-mf-collapsible" data-section="mf-accounts">' +
        '<span class="cf-mf-chevron">&#9654;</span>' +
        '<span class="cf-mf-section-title">Account Movements</span>' +
        '<span class="cf-mf-section-total"></span></div>';
      html += '<div class="cf-mf-section-body cf-mf-collapsed" id="mf-accounts">';

      for (var m = 0; m < mf.accountMovements.length; m++) {
        var mv = mf.accountMovements[m];
        var mvCls = mv.net_contribution >= 0 ? 'cf-mf-positive' : 'cf-mf-negative';
        var roleLabel = mv.role === 'savings' ? 'savings' : (mv.role === 'transactional' ? 'transactional' : '');
        var goalLabel = mv.goal ? ' &rarr; ' + mv.goal : '';

        html += '<div class="cf-mf-line cf-mf-line-indent">' +
          '<span class="cf-mf-line-label">' + mv.name +
          (roleLabel ? ' <span class="cf-mf-role-badge">' + roleLabel + '</span>' : '') +
          goalLabel + '</span>' +
          '<span class="cf-mf-line-amount ' + mvCls + '">' +
          (mv.net_contribution >= 0 ? '+' : '') + Fmt.currency(mv.net_contribution) + '</span></div>';
      }

      // Net flow summary
      html += '<div class="cf-mf-line cf-mf-line-detail">' +
        '<span class="cf-mf-line-label text-secondary">Net account flow: ' + Fmt.currency(mf.netAccountFlow) + '</span></div>';

      html += '</div></div>';
    }

    // Draining warning
    if (mf.isDraining && mf.drainingAccounts.length > 0) {
      html += '<div class="cf-mf-draining-alert">';
      for (var d = 0; d < mf.drainingAccounts.length; d++) {
        var dr = mf.drainingAccounts[d];
        html += '<div>' + dr.name + ': ' + Fmt.currency(dr.amount) + ' withdrawn</div>';
      }
      html += '</div>';
    }

    html += '</div>'; // cf-money-flow
    return html;
  },

  // --- Bind collapsible sections in Money Flow ---
  _bindMoneyFlowCollapsibles: function() {
    var headers = document.querySelectorAll('.cf-mf-collapsible');
    for (var i = 0; i < headers.length; i++) {
      headers[i].addEventListener('click', function() {
        var sectionId = this.getAttribute('data-section');
        var body = document.getElementById(sectionId);
        if (!body) return;
        var chevron = this.querySelector('.cf-mf-chevron');
        var isCollapsed = body.classList.contains('cf-mf-collapsed');
        if (isCollapsed) {
          body.classList.remove('cf-mf-collapsed');
          if (chevron) chevron.innerHTML = '&#9660;';
        } else {
          body.classList.add('cf-mf-collapsed');
          if (chevron) chevron.innerHTML = '&#9654;';
        }
      });
    }
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

  // (Goal Funding Reality removed — now part of Money Flow Statement)

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

  // (Waterfall chart removed — replaced by Money Flow Statement)

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
  },

  // Cash Health Trend: bar chart (surplus/deficit per month) + cumulative line
  _renderCashHealthTrendChart: function(healthMonths) {
    var canvas = document.getElementById('cashHealthTrendChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (this._cashHealthTrendChart) this._cashHealthTrendChart.destroy();

    var labels = healthMonths.map(function(h) { return h.month; });
    var surplusData = healthMonths.map(function(h) { return h.surplus; });
    var cumulativeData = healthMonths.map(function(h) { return h.cumulativeSurplus; });
    var barColors = healthMonths.map(function(h) {
      return h.surplus >= 0 ? 'rgba(13,144,79,0.7)' : 'rgba(217,48,37,0.7)';
    });

    this._cashHealthTrendChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Monthly Surplus/Deficit',
            data: surplusData,
            backgroundColor: barColors,
            borderWidth: 0,
            order: 2,
            yAxisID: 'y'
          },
          {
            label: 'Cumulative',
            data: cumulativeData,
            type: 'line',
            borderColor: '#1a73e8',
            backgroundColor: 'rgba(26,115,232,0.08)',
            fill: true,
            tension: 0.25,
            pointRadius: 3,
            borderWidth: 2,
            order: 1,
            yAxisID: 'y'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12 } },
          tooltip: {
            callbacks: {
              label: function(ctx) { return ctx.dataset.label + ': ' + Fmt.currency(ctx.raw); }
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            ticks: { callback: function(v) { return Fmt.currency(v); } },
            grid: { color: function(ctx) { return ctx.tick.value === 0 ? '#666' : '#e0e0e0'; } }
          }
        }
      }
    });
  },

  // Balance Decomposition: stacked area chart over time
  _renderBalanceDecompChart: function(decompositionSeries) {
    var canvas = document.getElementById('balanceDecompChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (this._balanceDecompChart) this._balanceDecompChart.destroy();

    var labels = decompositionSeries.map(function(d) { return d.month; });
    var mortgageData = decompositionSeries.map(function(d) { return d.goalEarmark; });
    var provisionData = decompositionSeries.map(function(d) { return d.provisionReserve; });
    var availableData = decompositionSeries.map(function(d) { return d.availableCash; });

    this._balanceDecompChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Available Cash',
            data: availableData,
            backgroundColor: 'rgba(13,144,79,0.15)',
            borderColor: '#0d904f',
            fill: true,
            tension: 0.25,
            pointRadius: 3,
            order: 1
          },
          {
            label: 'Provision Reserve',
            data: provisionData,
            backgroundColor: 'rgba(232,113,10,0.15)',
            borderColor: '#e8710a',
            fill: true,
            tension: 0.25,
            pointRadius: 3,
            order: 2
          },
          {
            label: 'Goal Earmark',
            data: mortgageData,
            backgroundColor: 'rgba(26,115,232,0.15)',
            borderColor: '#1a73e8',
            fill: true,
            tension: 0.25,
            pointRadius: 3,
            order: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12 } },
          tooltip: {
            callbacks: {
              label: function(ctx) { return ctx.dataset.label + ': ' + Fmt.currency(ctx.raw); },
              footer: function(items) {
                var total = 0;
                items.forEach(function(i) { total += i.raw; });
                return 'Total: ' + Fmt.currency(total);
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            stacked: true,
            ticks: { callback: function(v) { return Fmt.currency(v); } }
          }
        }
      }
    });
  }
};
