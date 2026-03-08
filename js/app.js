// === APP — ORCHESTRATION LAYER ===
// Wires data services to UI renderers. Handles events and initialization.

var mortgageData = null;
var milestonesData = [];
var plannerGoalsData = [];
var cashflowEntries = [];
var cashflowCategories = [];
var cashflowSubcategories = [];

// --- Monthly Summary (always visible) ---

function refreshSummary() {
  if (typeof SummaryCalculator === 'undefined' || typeof SummaryRenderer === 'undefined') return;

  try {
    var accountIds = AccountService.getNetworthAccountIds();
    var nwData = NetWorthCalculator.compute(allData, accountIds, mortgageData);
    if (nwData.length < 2) { SummaryRenderer.renderEmptyState(); return; }

    // Compute goals for summary context
    var goals = null;
    if (typeof GoalsCalculator !== 'undefined') {
      var emergencyTarget = appConfig.emergency_fund_target || 40000;
      var houseTarget = appConfig.house_downpayment_target || 80000;
      var operatingReserve = 0;
      if (typeof BudgetCalculator !== 'undefined' && budgetItems.length) {
        operatingReserve = BudgetCalculator.computeOperatingReserve(budgetItems);
      }
      var latest = nwData[nwData.length - 1].accounts;
      goals = {
        emergency: GoalsCalculator.computeEmergencyFund(latest, emergencyTarget),
        house: GoalsCalculator.computeHouseDownPayment(latest, houseTarget, operatingReserve)
      };
    }

    // Compute milestones for summary context
    var milestoneStatuses = [];
    if (typeof MilestoneCalculator !== 'undefined' && milestonesData && milestonesData.length) {
      var latestRow = nwData[nwData.length - 1];
      var emergency = goals ? goals.emergency : { available: 0 };
      var house = goals ? goals.house : { current: 0 };
      var currentValues = {
        total: latestRow.total || 0,
        emergency_fund: emergency.available,
        house_downpayment: house.current,
        fi_networth: latestRow.total || 0
      };
      milestoneStatuses = MilestoneCalculator.computeAll(milestonesData, currentValues, nwData[0].month, latestRow.month);
    }

    // Compute mortgage summary
    var mortgageSummary = null;
    if (mortgageData && typeof MortgageCalculator !== 'undefined') {
      mortgageSummary = MortgageCalculator.computeSummary(mortgageData);
    }

    var summary = SummaryCalculator.computeMonthlySummary(nwData, allData, goals, milestoneStatuses, mortgageSummary);
    var narrative = SummaryCalculator.generateNarrative(summary);

    // Detect anomalies
    var anomalies = [];
    if (typeof AnomalyCalculator !== 'undefined') {
      anomalies = AnomalyCalculator.detectAnomalies(allData);
    }

    SummaryRenderer.renderMonthlySummary(summary, narrative, anomalies);
  } catch (e) {
    console.error('[Summary] Error computing monthly summary:', e);
    SummaryRenderer.renderEmptyState();
  }
}

// --- FI Progress (always visible) ---

function refreshFIProgress() {
  // Compute current net worth from all networth-flagged accounts
  var accountIds = AccountService.getNetworthAccountIds();
  var nwData = NetWorthCalculator.compute(allData, accountIds, mortgageData);
  if (!nwData.length) return;

  var current = nwData[nwData.length - 1];
  var fiTarget = appConfig.fi_target || 1000000;
  var withdrawalRate = appConfig.withdrawal_rate || 0.04;
  var expectedReturn = appConfig.expected_return || 0.05;
  var monthlyIncome = appConfig.monthly_income || 0;

  var progressPct = FICalculator.progress(current.total, fiTarget);
  var passiveIncome = FICalculator.passiveIncome(current.investments, withdrawalRate);

  // Savings rate from last 12 months of all performance accounts
  var perfData = DataService.filterByAccount(allData, AccountService.isPerformance);
  var perfMonthly = DataService.aggregateByMonth(perfData);
  var last12Contrib = perfMonthly.slice(-12).reduce(function(s, r) { return s + r.net_contribution; }, 0);
  var savingsRate = FICalculator.savingsRate(last12Contrib, Math.min(perfMonthly.length, 12), monthlyIncome);

  var avgSavings = FICalculator.avgMonthlySavings(perfMonthly, 12);
  var yearsToFI = FICalculator.yearsToFI(current.total, avgSavings, expectedReturn, fiTarget);

  // Monthly expenses from budget (for passive income coverage stat)
  var monthlyExpenses = 0;
  if (typeof BudgetCalculator !== 'undefined' && budgetItems.length) {
    var budget = BudgetCalculator.computeMonthlyBudget(budgetItems);
    monthlyExpenses = budget.total || 0;
  }

  MetricsRenderer.renderFIProgress(progressPct, fiTarget, current.total, yearsToFI, passiveIncome, savingsRate, monthlyExpenses);
}

// --- Financial Goals (always visible) ---

function getOperatingReserve() {
  return BudgetCalculator.computeOperatingReserve(budgetItems);
}

function refreshGoals() {
  var emergencyTarget = appConfig.emergency_fund_target || 40000;
  var houseTarget = appConfig.house_downpayment_target || 80000;
  var operatingReserve = getOperatingReserve();

  // Get latest month's account values from NW data
  var accountIds = AccountService.getNetworthAccountIds();
  var nwData = NetWorthCalculator.compute(allData, accountIds, mortgageData);
  if (!nwData.length) return;

  var latest = nwData[nwData.length - 1].accounts;

  var emergency = GoalsCalculator.computeEmergencyFund(latest, emergencyTarget);
  var house = GoalsCalculator.computeHouseDownPayment(latest, houseTarget, operatingReserve);

  GoalsRenderer.renderGoalsPanel(emergency, house);
}

// --- Emergency Fund Tab ---

function refreshEmergency() {
  if (typeof EmergencyCalculator === 'undefined' || typeof EmergencyRenderer === 'undefined') return;

  try {
    var accountIds = EmergencyCalculator.getAccountIds();
    var roles = EmergencyCalculator.getAccountRoles();
    var target = appConfig.emergency_fund_target || 40000;

    // Current status from latest NW data
    var nwAccountIds = AccountService.getNetworthAccountIds();
    var nwData = NetWorthCalculator.compute(allData, nwAccountIds, mortgageData);
    if (!nwData.length) {
      EmergencyRenderer.render(null, [], null, roles);
      return;
    }

    var latestAccounts = nwData[nwData.length - 1].accounts;
    var status = EmergencyCalculator.computeStatus(latestAccounts, appConfig);

    // History
    var history = EmergencyCalculator.computeHistory(allData, accountIds, target);

    // Coverage from budget
    var monthlyExpenses = 0;
    if (typeof BudgetCalculator !== 'undefined' && budgetItems.length) {
      var budget = BudgetCalculator.computeMonthlyBudget(budgetItems);
      monthlyExpenses = budget.total || 0;
    }
    var coverage = EmergencyCalculator.computeCoverage(status.available, monthlyExpenses);

    EmergencyRenderer.render(status, history, coverage, roles);
  } catch (e) {
    console.error('[Emergency] Error:', e);
  }
}

// --- Budget Tab ---

function refreshBudget() {
  var budget = BudgetCalculator.computeMonthlyBudget(budgetItems);
  BudgetRenderer.renderBudgetOverview(budget);
}

// --- Mortgage Tab ---

function refreshMortgage() {
  if (!mortgageData || typeof MortgageCalculator === 'undefined' || typeof MortgageRenderer === 'undefined') {
    if (typeof MortgageRenderer !== 'undefined') MortgageRenderer.renderEmptyState();
    return;
  }

  var schedule = MortgageCalculator.computeSchedule(mortgageData);
  var summary = MortgageCalculator.computeSummary(mortgageData);
  if (!summary) { MortgageRenderer.renderEmptyState(); return; }

  // Get latest month from data for equity calculation
  var latestMonth = null;
  if (allData.length) {
    var months = allData.map(function(r) { return r.month; }).sort();
    latestMonth = months[months.length - 1];
  }
  var equity = latestMonth ? MortgageCalculator.computeEquity(mortgageData, latestMonth) : null;
  var comparison = MortgageCalculator.compareActualVsPlanned(schedule, mortgageData.actual_payments);

  MortgageRenderer.renderMortgage({
    summary: summary,
    schedule: schedule,
    equity: equity,
    comparison: comparison,
    mortgage: mortgageData
  });
}

// --- Shared Helpers ---

// Build latest account balances from MonthEnd data (uses latest available month per account)
function _buildLatestAccounts(data) {
  var latestByAccount = {};
  var latestMonthByAccount = {};
  (data || []).forEach(function(r) {
    if (!r.account_id || !r.month) return;
    if (!latestMonthByAccount[r.account_id] || r.month > latestMonthByAccount[r.account_id]) {
      latestMonthByAccount[r.account_id] = r.month;
      latestByAccount[r.account_id] = r.end_value || 0;
    }
  });
  return latestByAccount;
}

// --- Cash Flow Tab ---

var _cashflowTrailingMonths = 6;

function refreshCashFlow() {
  if (typeof SavingsCapacityCalculator === 'undefined' || typeof CashFlowRenderer === 'undefined') return;

  var monthlyIncome = appConfig.monthly_income || 0;
  var monthlyData = SavingsCapacityCalculator.computeMonthly(allData, { monthlyIncome: monthlyIncome });
  if (!monthlyData.length) {
    CashFlowRenderer.render(null, [], null, _cashflowTrailingMonths);
    return;
  }

  // Hybrid: override with actual cashflow data where available
  var actualMonths = null;
  if (typeof CashflowCalculator !== 'undefined' && cashflowEntries.length) {
    actualMonths = CashflowCalculator.getMonthsWithActuals(cashflowEntries);
    monthlyData = SavingsCapacityCalculator.computeMonthlyHybrid(
      allData, cashflowEntries, {
        monthlyIncome: monthlyIncome,
        categories: cashflowCategories,
        subcategories: cashflowSubcategories
      }
    );
  }

  // Budget total for comparison
  var budgetTotal = 0;
  if (typeof BudgetCalculator !== 'undefined' && budgetItems.length) {
    budgetTotal = BudgetCalculator.computeMonthlyBudget(budgetItems).total || 0;
  }

  // Goal plan for allocation overlay
  var goalPlan = null;
  if (typeof GoalPlannerCalculator !== 'undefined' && plannerGoalsData && plannerGoalsData.length) {
    // Use actual cashflow avg expenses when available, budget estimate as fallback
    var actualMonthlyData = monthlyData.filter(function(r) { return r.dataSource === 'actual'; });
    var monthlyExpenses = budgetTotal;
    if (actualMonthlyData.length > 0) {
      var n = Math.min(actualMonthlyData.length, _cashflowTrailingMonths || 6);
      var recentActual = actualMonthlyData.slice(-n);
      monthlyExpenses = recentActual.reduce(function(s, r) { return s + r.impliedExpenses; }, 0) / n;
    }
    var latestAccounts = _buildLatestAccounts(allData);
    var asOfMonth = monthlyData[monthlyData.length - 1].month;
    goalPlan = GoalPlannerCalculator.plan(plannerGoalsData, {
      monthlyIncome: monthlyIncome,
      monthlyExpenses: monthlyExpenses,
      asOfMonth: asOfMonth,
      latestAccounts: latestAccounts
    });
  }

  var waterfall = SavingsCapacityCalculator.computeWaterfall(monthlyData, budgetTotal, goalPlan, _cashflowTrailingMonths);
  var achievability = SavingsCapacityCalculator.computeAchievability(goalPlan, waterfall.actualSavings);

  // Provide modal drill-down data (includes allData for goal funding reality)
  CashFlowRenderer.setModalData({
    cashflowEntries: cashflowEntries,
    categories: cashflowCategories,
    subcategories: cashflowSubcategories,
    allData: allData
  });

  CashFlowRenderer.render(
    waterfall, monthlyData, achievability, _cashflowTrailingMonths, goalPlan
  );
}

// --- Goals Tab (unified: funding plan + milestones) ---

function refreshGoalsTab() {
  if (typeof GoalPlannerCalculator === 'undefined' || typeof PlannerRenderer === 'undefined') return;

  var monthlyIncome = appConfig.monthly_income || 0;

  // Use actual cashflow avg expenses when available, budget estimate as fallback
  var monthlyExpenses = 0;
  if (typeof BudgetCalculator !== 'undefined' && budgetItems.length) {
    monthlyExpenses = BudgetCalculator.computeMonthlyBudget(budgetItems).total || 0;
  }
  if (typeof SavingsCapacityCalculator !== 'undefined' && typeof CashflowCalculator !== 'undefined' && cashflowEntries.length) {
    var hybridData = SavingsCapacityCalculator.computeMonthlyHybrid(
      allData, cashflowEntries, {
        monthlyIncome: monthlyIncome,
        categories: cashflowCategories,
        subcategories: cashflowSubcategories
      }
    );
    var actualOnly = hybridData.filter(function(r) { return r.dataSource === 'actual'; });
    if (actualOnly.length > 0) {
      var n = Math.min(actualOnly.length, 6);
      var recent = actualOnly.slice(-n);
      monthlyExpenses = recent.reduce(function(s, r) { return s + r.impliedExpenses; }, 0) / n;
    }
  }

  var latestAccounts = _buildLatestAccounts(allData);
  var asOfMonth = '2025-01';
  if (allData.length) {
    var months = allData.map(function(r) { return r.month; }).sort();
    asOfMonth = months[months.length - 1];
  }

  var plan = GoalPlannerCalculator.plan(plannerGoalsData || [], {
    monthlyIncome: monthlyIncome,
    monthlyExpenses: monthlyExpenses,
    asOfMonth: asOfMonth,
    latestAccounts: latestAccounts
  });

  // Compute milestones
  var milestoneStatuses = [];
  if (typeof MilestoneCalculator !== 'undefined' && milestonesData && milestonesData.length) {
    var accountIds = AccountService.getNetworthAccountIds();
    var nwData = NetWorthCalculator.compute(allData, accountIds, mortgageData);
    if (nwData.length) {
      var latestRow = nwData[nwData.length - 1];
      var emergencyTarget = appConfig.emergency_fund_target || 40000;
      var houseTarget = appConfig.house_downpayment_target || 80000;
      var operatingReserve = getOperatingReserve();
      var emergency = GoalsCalculator.computeEmergencyFund(latestRow.accounts, emergencyTarget);
      var house = GoalsCalculator.computeHouseDownPayment(latestRow.accounts, houseTarget, operatingReserve);
      var currentValues = {
        total: latestRow.total || 0,
        emergency_fund: emergency.available,
        house_downpayment: house.current,
        fi_networth: latestRow.total || 0
      };
      milestoneStatuses = MilestoneCalculator.computeAll(milestonesData, currentValues, nwData[0].month, latestRow.month);
    }
  }

  PlannerRenderer.render(plan, milestoneStatuses);
}

// --- Investments Tab ---

function refreshInvestments() {
  var account = document.getElementById('accountFilter').value;
  var rangeBtn = document.querySelector('#tab-investments .time-range button.active');
  var rangeMonths = parseInt(rangeBtn.dataset.range);

  // Data layer: filter, aggregate, compute returns
  var filtered = DataService.filterByAccount(allData, function(id) {
    if (account !== 'ALL') return id === account;
    return AccountService.isPerformance(id);
  });
  var monthly = DataService.aggregateByMonth(filtered);
  ReturnsCalculator.compute(monthly);
  var data = DataService.applyTimeRange(monthly, rangeMonths);

  if (!data.length) {
    document.getElementById('metrics').innerHTML =
      '<div class="empty-state-panel"><div class="empty-state-icon">&#128200;</div>' +
      '<div class="empty-state-title">No investment data</div>' +
      '<div class="empty-state-desc">Add performance accounts and month-end data in the Admin page.</div></div>';
    return;
  }

  // UI layer: render metrics and charts
  MetricsRenderer.renderInvestments(data[data.length - 1]);
  ChartRenderer.renderPortfolio('chart',
    data.map(function(r) { return r.month; }),
    data.map(function(r) { return r.end_value; }),
    data.map(function(r) { return r.cum_contribution; })
  );
  TableRenderer.renderReturns(ReturnsCalculator.groupByYear(data), currentView);

  // Per-account comparison (only when viewing all accounts)
  var compSection = document.getElementById('accountCompSection');
  if (account === 'ALL') {
    var perfIds = AccountService.getPerformanceAccounts().map(function(a) { return a.account_id; });
    var comparison = ReturnsCalculator.compareAccounts(allData, perfIds);
    compSection.style.display = '';
    TableRenderer.renderAccountComparison('acctCompTable', comparison);
  } else {
    compSection.style.display = 'none';
  }
}

// --- Net Worth Tab ---

function refreshNetWorth() {
  var rangeBtn = document.querySelector('#tab-networth .time-range button.active');
  var rangeMonths = parseInt(rangeBtn.dataset.range);

  var accountIds = AccountService.getNetworthAccountIds();
  var nwData = NetWorthCalculator.compute(allData, accountIds, mortgageData);
  var data = DataService.applyTimeRange(nwData, rangeMonths);

  if (!data.length) {
    document.getElementById('nwMetrics').innerHTML =
      '<div class="empty-state-panel"><div class="empty-state-icon">&#128176;</div>' +
      '<div class="empty-state-title">No net worth data</div>' +
      '<div class="empty-state-desc">Add accounts and month-end balances in the Admin page.</div></div>';
    return;
  }

  var current = data[data.length - 1];
  var mom = NetWorthCalculator.computeMoM(data);
  var ytd = NetWorthCalculator.computeYTD(data);

  MetricsRenderer.renderNetWorth(current, mom, ytd);
  ChartRenderer.renderNetWorth('nwChart', 'nwLegend',
    data.map(function(r) { return r.month; }),
    accountIds, data
  );
  TableRenderer.renderNetWorthBreakdown(data,
    AccountService.getBrokerAccountIds(),
    AccountService.getCashAccountIds()
  );
}

// --- Event Binding ---

function bindTimeRangeButtons(containerSelector, refreshFn) {
  document.querySelectorAll(containerSelector + ' .time-range button').forEach(function(btn) {
    btn.addEventListener('click', function() {
      this.parentElement.querySelectorAll('button').forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      refreshFn();
    });
  });
}

function bindEvents() {
  document.querySelectorAll('.nav-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.remove('active'); });
      document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
      this.classList.add('active');
      document.getElementById('tab-' + this.dataset.tab).classList.add('active');
      if (this.dataset.tab === 'investments') refreshInvestments();
      else if (this.dataset.tab === 'networth') refreshNetWorth();
      else if (this.dataset.tab === 'emergency') refreshEmergency();
      else if (this.dataset.tab === 'budget') refreshBudget();
      else if (this.dataset.tab === 'mortgage') refreshMortgage();
      else if (this.dataset.tab === 'goals') refreshGoalsTab();
      else if (this.dataset.tab === 'cashflow') refreshCashFlow();
    });
  });

  document.getElementById('accountFilter').addEventListener('change', refreshInvestments);
  bindTimeRangeButtons('#tab-investments', refreshInvestments);

  document.querySelectorAll('.toggle-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.toggle-btn').forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      currentView = this.dataset.view;
      refreshInvestments();
    });
  });

  bindTimeRangeButtons('#tab-networth', refreshNetWorth);
}

// --- Initialization ---

function populateAccountFilter() {
  var perfAccounts = AccountService.getPerformanceAccounts();
  var select = document.getElementById('accountFilter');
  perfAccounts.forEach(function(a) {
    var opt = document.createElement('option');
    opt.value = a.account_id;
    opt.textContent = a.account_name;
    select.appendChild(opt);
  });
}

function showDashboard() {
  populateAccountFilter();
  bindEvents();

  // Show last updated
  if (allData.length) {
    var months = allData.map(function(r) { return r.month; }).sort();
    MetricsRenderer.renderLastUpdated(months[months.length - 1]);
  }

  document.getElementById('unlock').style.display = 'none';
  var authScreen = document.getElementById('authScreen');
  if (authScreen) authScreen.style.display = 'none';
  document.getElementById('app').style.display = 'block';

  // Always show refresh button once dashboard is loaded
  var refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) refreshBtn.style.display = '';

  // Toggle cloud/file menu items
  if (typeof updateDbModeUI === 'function') updateDbModeUI();

  refreshFIProgress();
  refreshGoals();
  refreshSummary();
  refreshInvestments();
  refreshGoalsTab();
}

function loadData(data) {
  appConfig = data.config || {};
  accountsConfig = data.accounts || [];
  allData = data.data || [];
  budgetItems = data.budgetItems || [];
  milestonesData = data.milestones || [];
  mortgageData = data.mortgage || null;
  plannerGoalsData = (data.plannerGoals || []).map(function(g) {
    var clone = Object.assign({}, g);
    clone.funding_accounts = (clone.funding_accounts || []).map(function(id) { return (id || '').toUpperCase(); });
    if (typeof clone.track_current_from_accounts === 'undefined') clone.track_current_from_accounts = true;
    return clone;
  });
  if (typeof CashflowNormalizationService !== 'undefined') {
    var normalizedCashflow = CashflowNormalizationService.normalizeDataset(data);
    cashflowCategories = normalizedCashflow.categories;
    cashflowSubcategories = normalizedCashflow.subcategories;
    cashflowEntries = normalizedCashflow.entries;
  } else {
    cashflowCategories = data.cashflowCategories || [];
    cashflowSubcategories = data.cashflowSubcategories || [];
    cashflowEntries = data.cashflowEntries || [];
  }
}

// --- Cache Status + Refresh ---

function showCacheStatus(cachedAt) {
  var el = document.getElementById('cacheStatus');
  var btn = document.getElementById('refreshBtn');
  if (!el || !cachedAt) return;

  var ago = Date.now() - cachedAt;
  var label;
  if (ago < 3600000) label = 'Cached just now';
  else if (ago < 86400000) label = 'Cached ' + Math.floor(ago / 3600000) + 'h ago';
  else label = 'Cached ' + Math.floor(ago / 86400000) + 'd ago';

  el.textContent = label;
  el.style.display = '';
  if (btn) btn.style.display = '';
}

function refreshAll() {
  // Destroy existing charts to avoid canvas reuse errors
  Chart.helpers.each(Chart.instances, function(instance) { instance.destroy(); });

  refreshFIProgress();
  refreshGoals();
  refreshSummary();
  refreshInvestments();
  refreshMortgage();
  refreshCashFlow();
  refreshGoalsTab();

  // Update last-updated badge
  if (allData.length) {
    var months = allData.map(function(r) { return r.month; }).sort();
    MetricsRenderer.renderLastUpdated(months[months.length - 1]);
  }
}

// --- Unlock Screen ---

// State for the opened file
var _fileText = null;
var _fileName = null;
var _cachedPassphrase = null;

function updateFilePickerUI() {
  var picker = document.getElementById('filePicker');
  var icon = document.getElementById('filePickerIcon');
  var label = document.getElementById('filePickerLabel');
  var hint = document.getElementById('filePickerHint');
  var step = document.getElementById('passphraseStep');
  if (!picker) return;

  if (_fileName) {
    picker.classList.add('has-file');
    icon.innerHTML = '&#9989;';
    label.textContent = _fileName;
    hint.textContent = 'File loaded — click to change';
    step.classList.remove('disabled');
    document.getElementById('passphrase').focus();
  } else {
    picker.classList.remove('has-file');
    icon.innerHTML = '&#128194;';
    label.textContent = 'Choose a data file';
    hint.textContent = '.fjson or .json from iCloud Drive';
    step.classList.add('disabled');
  }
}

document.getElementById('filePicker').addEventListener('click', async function() {
  var errorEl = document.getElementById('unlockError');
  errorEl.textContent = '';
  try {
    var result = await FileManager.open();
    _fileText = result.text;
    _fileName = result.filename;
    updateFilePickerUI();
  } catch (e) {
    if (e.name !== 'AbortError' && e.message !== 'File selection cancelled') {
      errorEl.textContent = 'Could not open file.';
    }
  }
});

document.getElementById('decryptBtn').addEventListener('click', async function() {
  var passphraseInput = document.getElementById('passphrase');
  var errorEl = document.getElementById('unlockError');
  var btn = this;

  errorEl.textContent = '';

  if (!_fileText) {
    errorEl.textContent = 'Please select a file.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Decrypting...';

  try {
    var fileData = JSON.parse(_fileText);

    // Check if this is an unencrypted JSON (for dev/testing with sample.json)
    if (fileData.config && fileData.accounts && fileData.data && !fileData.v) {
      loadData(fileData);
      var sessionData = {
        decryptedData: fileData,
        passphrase: null,
        wasEncrypted: false,
        originalFileText: _fileText,
        filename: _fileName
      };
      FileManager.stashToSession(sessionData);
      DataCache.save(sessionData).catch(function() {});
      showDashboard();
      return;
    }

    // Encrypted .fjson
    var passphrase = passphraseInput.value;
    if (!passphrase) {
      errorEl.textContent = 'Please enter the passphrase.';
      btn.disabled = false;
      btn.textContent = 'Decrypt & Load';
      return;
    }

    var decrypted = await Crypto.decrypt(fileData, passphrase);
    loadData(decrypted);
    _cachedPassphrase = passphrase;
    var sessionData2 = {
      decryptedData: decrypted,
      passphrase: null,
      wasEncrypted: true,
      originalFileText: _fileText,
      filename: _fileName
    };
    FileManager.stashToSession(sessionData2);
    DataCache.save(sessionData2).catch(function() {});
    showDashboard();
  } catch (e) {
    errorEl.textContent = 'Decryption failed. Wrong passphrase or invalid file.';
    btn.disabled = false;
    btn.textContent = 'Decrypt & Load';
  }
});

// Allow pressing Enter in passphrase field to trigger decrypt
document.getElementById('passphrase').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    document.getElementById('decryptBtn').click();
  }
});

// Hamburger menu toggle
(function() {
  var btn = document.getElementById('menuBtn');
  var menu = document.getElementById('navMenu');
  if (!btn || !menu) return;
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    menu.classList.toggle('open');
  });
  document.addEventListener('click', function() {
    menu.classList.remove('open');
  });
})();

// --- Cloud Auth Screen ---

function showAuthScreen() {
  document.getElementById('unlock').style.display = 'none';
  document.getElementById('app').style.display = 'none';
  document.getElementById('authScreen').style.display = '';
  var filePass = document.getElementById('passphrase');
  if (filePass) filePass.disabled = true;
}

function showUnlockScreen() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('app').style.display = 'none';
  document.getElementById('unlock').style.display = '';
  var filePass = document.getElementById('passphrase');
  if (filePass) filePass.disabled = false;
}

function setAuthLoading(loading) {
  var signInBtn = document.getElementById('signInBtn');
  var signUpBtn = document.getElementById('signUpBtn');
  if (signInBtn) { signInBtn.disabled = loading; signInBtn.textContent = loading ? 'Signing in...' : 'Sign In'; }
  if (signUpBtn) { signUpBtn.disabled = loading; }
}

function updateDbModeUI() {
  var signOutBtn = document.getElementById('menuSignOut');
  var switchCloud = document.getElementById('menuSwitchCloud');
  if (StorageManager.mode === 'db') {
    if (signOutBtn) signOutBtn.style.display = '';
    if (switchCloud) switchCloud.style.display = 'none';
  } else {
    if (signOutBtn) signOutBtn.style.display = 'none';
    if (switchCloud) switchCloud.style.display = '';
  }
}

// "Use cloud sync instead" link on unlock screen
(function() {
  var cloudLink = document.getElementById('useCloudLink');
  if (cloudLink) {
    cloudLink.addEventListener('click', function(e) {
      e.preventDefault();
      if (!AppConfig.SUPABASE_URL || !AppConfig.SUPABASE_ANON_KEY) {
        alert('Cloud sync is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in js/config.js.');
        return;
      }
      showAuthScreen();
    });
  }
})();

// "Use local file instead" link on auth screen
(function() {
  var fileLink = document.getElementById('useFileLink');
  if (fileLink) {
    fileLink.addEventListener('click', function(e) {
      e.preventDefault();
      StorageManager.setMode('file');
      showUnlockScreen();
    });
  }
})();

// Sign In button
(function() {
  var signInBtn = document.getElementById('signInBtn');
  if (!signInBtn) return;
  signInBtn.addEventListener('click', async function() {
    var email = document.getElementById('authEmail').value.trim();
    var pass = document.getElementById('authPassphrase').value;
    var errorEl = document.getElementById('authError');
    errorEl.textContent = '';

    if (!email || !pass) { errorEl.textContent = 'Please enter email and passphrase.'; return; }

    setAuthLoading(true);
    try {
      StorageManager.init('db');
      await StorageManager.signIn(email, pass);
      var data = await StorageManager.load();
      loadData(data);
      // Stash for same-tab navigation
      FileManager.stashToSession({
        decryptedData: data, storageMode: 'db',
        passphrase: null, wasEncrypted: false, originalFileText: null, filename: null
      });
      showDashboard();
      updateDbModeUI();
    } catch (e) {
      errorEl.textContent = e.message || 'Sign in failed.';
      setAuthLoading(false);
    }
  });
})();

// Sign Up button
(function() {
  var signUpBtn = document.getElementById('signUpBtn');
  if (!signUpBtn) return;
  signUpBtn.addEventListener('click', async function() {
    var email = document.getElementById('authEmail').value.trim();
    var pass = document.getElementById('authPassphrase').value;
    var errorEl = document.getElementById('authError');
    errorEl.textContent = '';

    if (!email || !pass) { errorEl.textContent = 'Please enter email and passphrase.'; return; }
    if (pass.length < 8) { errorEl.textContent = 'Passphrase must be at least 8 characters.'; return; }

    this.disabled = true;
    this.textContent = 'Creating...';
    try {
      StorageManager.init('db');
      var result = await StorageManager.signUp(email, pass);
      if (result.needsConfirmation) {
        errorEl.style.color = '#137333';
        errorEl.textContent = 'Account created! Check your email to confirm, then sign in.';
        this.disabled = false;
        this.textContent = 'Create Account';
        return;
      }
      // New account — load empty data
      var data = await StorageManager.load();
      loadData(data);
      FileManager.stashToSession({
        decryptedData: data, storageMode: 'db',
        passphrase: null, wasEncrypted: false, originalFileText: null, filename: null
      });
      showDashboard();
      updateDbModeUI();
    } catch (e) {
      errorEl.style.color = '';
      errorEl.textContent = e.message || 'Sign up failed.';
      this.disabled = false;
      this.textContent = 'Create Account';
    }
  });
})();

// Auth form submit (Enter / password manager submit)
(function() {
  var authForm = document.getElementById('authForm');
  if (!authForm) return;
  authForm.addEventListener('submit', function(e) {
    e.preventDefault();
    var signInBtn = document.getElementById('signInBtn');
    if (signInBtn) signInBtn.click();
  });
})();

// Toggle passphrase visibility on auth screen
(function() {
  var passInput = document.getElementById('authPassphrase');
  var toggleBtn = document.getElementById('authTogglePassphrase');
  if (!passInput || !toggleBtn) return;
  toggleBtn.addEventListener('click', function() {
    var show = passInput.type === 'password';
    passInput.type = show ? 'text' : 'password';
    toggleBtn.textContent = show ? 'Hide' : 'Show';
    toggleBtn.setAttribute('aria-label', show ? 'Hide passphrase' : 'Show passphrase');
    toggleBtn.setAttribute('aria-pressed', show ? 'true' : 'false');
  });
})();

// Allow Enter in auth passphrase field
(function() {
  var authPass = document.getElementById('authPassphrase');
  if (authPass) {
    authPass.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') document.getElementById('signInBtn').click();
    });
  }
})();

// Export Data (.xlsx) menu item
(function() {
  var exportBtn = document.getElementById('menuExportXlsx');
  if (!exportBtn) return;
  exportBtn.addEventListener('click', function(e) {
    e.preventDefault();
    try {
      var data = {
        config: appConfig,
        accounts: accountsConfig,
        data: allData,
        budgetItems: budgetItems,
        milestones: milestonesData,
        mortgage: mortgageData,
        plannerGoals: plannerGoalsData,
        cashflowCategories: cashflowCategories,
        cashflowSubcategories: cashflowSubcategories,
        cashflowEntries: cashflowEntries
      };
      DataExport.exportXLSX(data);
    } catch (err) {
      alert('Export failed: ' + err.message);
    }
  });
})();

// "Switch to Cloud" menu item (visible when in file mode on dashboard)
(function() {
  var switchBtn = document.getElementById('menuSwitchCloud');
  if (!switchBtn) return;
  switchBtn.addEventListener('click', function(e) {
    e.preventDefault();
    if (!AppConfig.SUPABASE_URL || !AppConfig.SUPABASE_ANON_KEY) {
      alert('Cloud sync is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in js/config.js.');
      return;
    }
    document.getElementById('app').style.display = 'none';
    showAuthScreen();
  });
})();

// Sign Out menu item
(function() {
  var signOutBtn = document.getElementById('menuSignOut');
  if (!signOutBtn) return;
  signOutBtn.addEventListener('click', async function(e) {
    e.preventDefault();
    try {
      await StorageManager.signOut();
      StorageManager.setMode('file');
      FileManager.clearSession();
      DataCache.clear().catch(function() {});
      location.reload();
    } catch (err) {
      alert('Sign out failed: ' + err.message);
    }
  });
})();

// Collapsible panels (FI progress, Goals)
(function() {
  document.querySelectorAll('.collapsible-header').forEach(function(header) {
    var panelKey = 'panel_' + header.dataset.panel;
    var wrapper = header.parentElement;

    // Restore saved state
    if (localStorage.getItem(panelKey) === 'collapsed') {
      wrapper.classList.add('collapsed');
    }

    header.addEventListener('click', function() {
      wrapper.classList.toggle('collapsed');
      localStorage.setItem(panelKey, wrapper.classList.contains('collapsed') ? 'collapsed' : 'open');
    });
  });
})();

// Refresh button: re-open file from iCloud Drive
document.getElementById('refreshBtn').addEventListener('click', async function() {
  try {
    var result = await FileManager.open();
    var fileData = JSON.parse(result.text);
    var decrypted;

    if (fileData.config && fileData.accounts && fileData.data && !fileData.v) {
      decrypted = fileData;
    } else {
      // Try cached passphrase first, then prompt
      var pp = _cachedPassphrase;
      if (!pp) pp = prompt('Enter passphrase:');
      if (!pp) return;
      try {
        decrypted = await Crypto.decrypt(fileData, pp);
      } catch (e) {
        if (pp === _cachedPassphrase) {
          pp = prompt('Cached passphrase failed. Enter passphrase:');
          if (!pp) return;
          decrypted = await Crypto.decrypt(fileData, pp);
        } else { throw e; }
      }
      _cachedPassphrase = pp;
    }

    loadData(decrypted);
    var sessionData = {
      decryptedData: decrypted,
      passphrase: null,
      wasEncrypted: !!fileData.v,
      originalFileText: result.text,
      filename: result.filename
    };
    FileManager.stashToSession(sessionData);
    DataCache.save(sessionData).catch(function() {});
    showCacheStatus(Date.now());
    refreshAll();
  } catch (e) {
    if (e.name !== 'AbortError' && e.message !== 'File selection cancelled') {
      alert('Refresh failed: ' + e.message);
    }
  }
});

// Offline / Online listeners
window.addEventListener('online', function() {
  document.getElementById('offlineBanner').style.display = 'none';
  // Flush any pending DB writes queued while offline
  if (typeof StorageManager !== 'undefined' && StorageManager.mode === 'db') {
    StorageManager.flushPendingSync().then(function(result) {
      if (result && result.flushed > 0) {
        var msg = 'Synced ' + result.flushed + ' pending change' + (result.flushed > 1 ? 's' : '');
        if (typeof showToast === 'function') showToast(msg);
      }
    }).catch(function() {});
  }
});
window.addEventListener('offline', function() {
  document.getElementById('offlineBanner').style.display = '';
});
if (!navigator.onLine) {
  document.getElementById('offlineBanner').style.display = '';
}

// Auto-restore: DB session → sessionStorage → IndexedDB → unlock/auth screen
(async function() {
  var persistedMode = (typeof StorageManager !== 'undefined') ? StorageManager.getPersistedMode() : 'file';

  // 0. DB mode: try restoring Supabase session
  if (persistedMode === 'db' && typeof StorageManager !== 'undefined' && AppConfig.SUPABASE_URL && AppConfig.SUPABASE_ANON_KEY) {
    try {
      StorageManager.init('db');
      var hasSession = await StorageManager.hasSession();
      if (hasSession) {
        // Restore CryptoKey first (needed for any save operations later)
        var restored = await StorageManager.restoreFromCachedKey();

        // Try sessionStorage for cached data (avoids re-fetching from Supabase)
        if (restored) {
          var sessionData = await FileManager.loadFromSession();
          if (sessionData && sessionData.decryptedData && sessionData.storageMode === 'db') {
            loadData(sessionData.decryptedData);
            showDashboard();
            updateDbModeUI();
            return;
          }
        }

        // CryptoKey restored but no session data — fetch from Supabase
        if (restored) {
          var data = await StorageManager.load();
          loadData(data);
          FileManager.stashToSession({
            decryptedData: data, storageMode: 'db',
            passphrase: null, wasEncrypted: false, originalFileText: null, filename: null
          });
          showDashboard();
          updateDbModeUI();
          return;
        }
        // No cached key — need to re-authenticate
        showAuthScreen();
        return;
      }
    } catch (e) {
      // Session expired or error — fall through
    }
    // No valid session — show auth screen
    showAuthScreen();
    return;
  }

  // 1. Try sessionStorage (same-tab navigation, file mode)
  var session = await FileManager.loadFromSession();
  if (session && session.decryptedData && (!session.storageMode || session.storageMode === 'file')) {
    _cachedPassphrase = session.passphrase || null;
    loadData(session.decryptedData);
    showDashboard();
    return;
  }

  // 2. Try IndexedDB (returning visit, file mode)
  try {
    var cached = await DataCache.load();
    if (cached && cached.decryptedData) {
      _cachedPassphrase = cached.passphrase || null;
      loadData(cached.decryptedData);
      FileManager.stashToSession(cached);
      showDashboard();
      showCacheStatus(cached.cachedAt);
      return;
    }
  } catch (e) {
    // IndexedDB unavailable — fall through to unlock
  }

  // 3. Show unlock screen (first visit, file mode)
})();
