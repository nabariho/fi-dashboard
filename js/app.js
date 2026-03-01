// === APP — ORCHESTRATION LAYER ===
// Wires data services to UI renderers. Handles events and initialization.

// --- FI Progress (always visible) ---

function refreshFIProgress() {
  // Compute current net worth from all networth-flagged accounts
  var accountIds = AccountService.getNetworthAccountIds();
  var nwData = NetWorthCalculator.compute(allData, accountIds);
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

  MetricsRenderer.renderFIProgress(progressPct, fiTarget, current.total, yearsToFI, passiveIncome, savingsRate);
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
  var nwData = NetWorthCalculator.compute(allData, accountIds);
  if (!nwData.length) return;

  var latest = nwData[nwData.length - 1].accounts;

  var emergency = GoalsCalculator.computeEmergencyFund(latest, emergencyTarget);
  var house = GoalsCalculator.computeHouseDownPayment(latest, houseTarget, operatingReserve);

  GoalsRenderer.renderGoalsPanel(emergency, house);
}

// --- Goals Detail Tab ---

function refreshGoalsDetail() {
  var emergencyTarget = appConfig.emergency_fund_target || 40000;
  var houseTarget = appConfig.house_downpayment_target || 80000;
  var operatingReserve = getOperatingReserve();

  var accountIds = AccountService.getNetworthAccountIds();
  var nwData = NetWorthCalculator.compute(allData, accountIds);
  if (!nwData.length) return;

  var latest = nwData[nwData.length - 1].accounts;

  var emergency = GoalsCalculator.computeEmergencyFund(latest, emergencyTarget);
  var house = GoalsCalculator.computeHouseDownPayment(latest, houseTarget, operatingReserve);

  GoalsRenderer.renderGoalsDetail(emergency, house, latest);
}

// --- Budget Tab ---

function refreshBudget() {
  var budget = BudgetCalculator.computeMonthlyBudget(budgetItems);
  BudgetRenderer.renderBudgetOverview(budget);
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

  if (!data.length) return;

  // UI layer: render metrics and charts
  MetricsRenderer.renderInvestments(data[data.length - 1]);
  ChartRenderer.renderPortfolio('chart',
    data.map(function(r) { return r.month; }),
    data.map(function(r) { return r.end_value; }),
    data.map(function(r) { return r.cum_contribution; })
  );
  TableRenderer.renderReturns(ReturnsCalculator.groupByYear(data), currentView);
}

// --- Net Worth Tab ---

function refreshNetWorth() {
  var rangeBtn = document.querySelector('#tab-networth .time-range button.active');
  var rangeMonths = parseInt(rangeBtn.dataset.range);

  var accountIds = AccountService.getNetworthAccountIds();
  var nwData = NetWorthCalculator.compute(allData, accountIds);
  var data = DataService.applyTimeRange(nwData, rangeMonths);

  if (!data.length) return;

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
      else if (this.dataset.tab === 'goals') refreshGoalsDetail();
      else if (this.dataset.tab === 'budget') refreshBudget();
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
  document.getElementById('app').style.display = 'block';

  refreshFIProgress();
  refreshGoals();
  refreshInvestments();
}

function loadData(data) {
  appConfig = data.config || {};
  accountsConfig = data.accounts || [];
  allData = data.data || [];
  budgetItems = data.budgetItems || [];
}

// --- Unlock Screen ---

// State for the opened file
var _fileText = null;
var _fileName = null;

document.getElementById('openFileBtn').addEventListener('click', async function() {
  var errorEl = document.getElementById('unlockError');
  errorEl.textContent = '';
  try {
    var result = await FileManager.open();
    _fileText = result.text;
    _fileName = result.filename;
    document.getElementById('fileName').textContent = _fileName;
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
      FileManager.stashToSession({
        decryptedData: fileData,
        passphrase: null,
        wasEncrypted: false,
        originalFileText: _fileText,
        filename: _fileName
      });
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
    FileManager.stashToSession({
      decryptedData: decrypted,
      passphrase: passphrase,
      wasEncrypted: true,
      originalFileText: _fileText,
      filename: _fileName
    });
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

// Auto-restore from sessionStorage (skip unlock when navigating back from admin)
(function() {
  var session = FileManager.loadFromSession();
  if (!session || !session.decryptedData) return;
  loadData(session.decryptedData);
  showDashboard();
})();
