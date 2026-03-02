// === ADMIN PAGE — Data Editor ===

// --- Config Parameter Descriptions ---
var CONFIG_DESCRIPTIONS = {
  fi_target: 'Total net worth needed for financial independence',
  withdrawal_rate: 'Annual withdrawal rate in retirement (e.g. 0.04 = 4%)',
  expected_return: 'Expected annual investment return (e.g. 0.07 = 7%)',
  monthly_income: 'Gross monthly income for savings rate calculation',
  emergency_fund_target: 'Target amount for emergency fund reserve',
  house_downpayment_target: 'Target amount for house down payment goal',
  auto_export: 'Auto-download .fjson on every save for iCloud Drive sync (1 = on, 0 = off)'
};

// --- State ---
var AdminState = {
  config: {},
  accounts: [],
  data: [],
  budgetItems: [],
  originalFileText: null,
  filename: null,
  wasEncrypted: false,
  passphrase: null,
  dirty: false,
  activeTab: 'config',
  filterAccount: 'ALL',
  filterMonths: 24
};

function markDirty() {
  AdminState.dirty = true;
  document.querySelector('.dirty-indicator').classList.add('visible');
  updateTabBadges();
}

function showToast(msg) {
  var toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(function() { toast.classList.remove('visible'); }, 2500);
}

function updateTabBadges() {
  var b1 = document.getElementById('badge-config');
  var b2 = document.getElementById('badge-accounts');
  var b3 = document.getElementById('badge-budget');
  var b4 = document.getElementById('badge-monthend');
  if (b1) b1.textContent = Object.keys(AdminState.config).length;
  if (b2) b2.textContent = AdminState.accounts.length;
  if (b3) b3.textContent = AdminState.budgetItems.length;
  if (b4) b4.textContent = AdminState.data.length;
}

// --- Unlock ---

var _fileText = null;
var _fileName = null;

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
    hint.textContent = '.fjson or .json data file';
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
  btn.textContent = 'Loading...';

  try {
    AdminState.originalFileText = _fileText;
    AdminState.filename = _fileName;
    var fileData = JSON.parse(_fileText);

    if (fileData.config && fileData.accounts && fileData.data && !fileData.v) {
      AdminState.wasEncrypted = false;
      loadAdminData(fileData);
      DataCache.save({
        decryptedData: fileData, passphrase: null, wasEncrypted: false,
        originalFileText: _fileText, filename: _fileName
      }).catch(function() {});
      showAdmin();
      return;
    }

    var passphrase = passphraseInput.value;
    if (!passphrase) {
      errorEl.textContent = 'Please enter the passphrase.';
      btn.disabled = false;
      btn.textContent = 'Decrypt & Load';
      return;
    }

    var decrypted = await Crypto.decrypt(fileData, passphrase);
    AdminState.wasEncrypted = true;
    AdminState.passphrase = passphrase;
    loadAdminData(decrypted);
    DataCache.save({
      decryptedData: decrypted, passphrase: passphrase, wasEncrypted: true,
      originalFileText: _fileText, filename: _fileName
    }).catch(function() {});
    showAdmin();
  } catch (e) {
    errorEl.textContent = 'Decryption failed. Wrong passphrase or invalid file.';
    btn.disabled = false;
    btn.textContent = 'Decrypt & Load';
  }
});

document.getElementById('passphrase').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') document.getElementById('decryptBtn').click();
});

function loadAdminData(data) {
  AdminState.config = data.config || {};
  AdminState.accounts = (data.accounts || []).map(function(a) { return Object.assign({}, a); });
  AdminState.data = (data.data || []).map(function(r) { return Object.assign({}, r); });
  AdminState.budgetItems = (data.budgetItems || []).map(function(b) { return Object.assign({}, b); });
}

function showAdmin() {
  document.getElementById('unlock').style.display = 'none';
  document.getElementById('adminApp').style.display = 'block';
  updateTabBadges();
  bindAdminEvents();
  renderActiveTab();
}

// --- Tab Switching ---

function bindAdminEvents() {
  document.querySelectorAll('.admin-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.admin-tab').forEach(function(t) { t.classList.remove('active'); });
      document.querySelectorAll('.admin-content').forEach(function(c) { c.classList.remove('active'); });
      this.classList.add('active');
      AdminState.activeTab = this.dataset.tab;
      document.getElementById('admin-' + this.dataset.tab).classList.add('active');
      renderActiveTab();
    });
  });

  document.getElementById('saveBtn').addEventListener('click', save);

  window.addEventListener('beforeunload', function(e) {
    if (AdminState.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Keyboard shortcut: Ctrl/Cmd+S to save
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      save();
    }
  });
}

function renderActiveTab() {
  var tab = AdminState.activeTab;
  if (tab === 'config') renderConfig();
  else if (tab === 'accounts') renderAccounts();
  else if (tab === 'budget') renderBudget();
  else if (tab === 'monthend') renderMonthEnd();
}

// --- Config Tab ---

function renderConfig() {
  var container = document.getElementById('configTable');
  var keys = Object.keys(AdminState.config);

  var html = '<div class="section-header">' +
    '<h2>Configuration Parameters</h2>' +
    '<p class="section-desc">Financial targets and rates used for dashboard calculations. Values like withdrawal_rate and expected_return are decimals (e.g. 0.04 = 4%).</p>' +
    '</div>';

  html += '<div class="admin-table-container"><table class="admin-table"><thead><tr>' +
    '<th>Parameter</th><th>Description</th><th>Value</th><th></th>' +
    '</tr></thead><tbody>';

  keys.forEach(function(key) {
    var desc = CONFIG_DESCRIPTIONS[key] || '';
    html += '<tr>' +
      '<td class="cell-id">' + escHtml(key) + '</td>' +
      '<td class="config-desc">' + escHtml(desc) + '</td>' +
      '<td style="width:160px"><input type="number" step="any" value="' + AdminState.config[key] + '" data-key="' + escHtml(key) + '" class="config-value"></td>' +
      '<td style="width:60px"><button class="btn-delete" data-key="' + escHtml(key) + '" onclick="deleteConfig(this)">Delete</button></td>' +
      '</tr>';
  });

  html += '</tbody></table></div>';

  // Add form card
  html += '<div class="add-form-card" style="margin-top:16px">' +
    '<div class="add-form-title">Add Parameter</div>' +
    '<div class="add-form-row">' +
    '<div class="add-form-field"><label>Key</label><input type="text" id="newConfigKey" placeholder="parameter_name" style="width:180px"></div>' +
    '<div class="add-form-field"><label>Value</label><input type="number" step="any" id="newConfigValue" placeholder="0" style="width:120px"></div>' +
    '<button class="btn-add" onclick="addConfig()">Add Parameter</button>' +
    '</div></div>';

  container.innerHTML = html;

  container.querySelectorAll('.config-value').forEach(function(input) {
    input.addEventListener('change', function() {
      var key = this.dataset.key;
      var val = parseFloat(this.value);
      if (!isNaN(val)) {
        AdminState.config[key] = val;
        markDirty();
      }
    });
  });
}

function deleteConfig(btn) {
  var key = btn.dataset.key;
  if (!confirm('Delete parameter "' + key + '"?')) return;
  delete AdminState.config[key];
  markDirty();
  renderConfig();
}

function addConfig() {
  var keyInput = document.getElementById('newConfigKey');
  var valInput = document.getElementById('newConfigValue');
  var key = keyInput.value.trim();
  var val = parseFloat(valInput.value);

  keyInput.classList.remove('input-error');
  valInput.classList.remove('input-error');

  if (!key) { keyInput.classList.add('input-error'); return; }
  if (isNaN(val)) { valInput.classList.add('input-error'); return; }
  if (AdminState.config.hasOwnProperty(key)) {
    alert('Parameter "' + key + '" already exists.');
    return;
  }

  AdminState.config[key] = val;
  markDirty();
  renderConfig();
  showToast('Parameter added');
}

// --- Accounts Tab ---

function renderAccounts() {
  var container = document.getElementById('accountsTable');
  var accts = AdminState.accounts;

  var html = '<div class="section-header">' +
    '<h2>Accounts</h2>' +
    '<p class="section-desc">Financial accounts tracked in the dashboard. "Net Worth" includes the account in total net worth. "Performance" includes it in investment return calculations.</p>' +
    '</div>';

  // Add form at top
  html += '<div class="add-form-card">' +
    '<div class="add-form-title">Add Account</div>' +
    '<div class="add-form-row">' +
    '<div class="add-form-field"><label>ID</label><input type="text" id="newAcctId" placeholder="ACCT_ID" style="width:120px"></div>' +
    '<div class="add-form-field"><label>Name</label><input type="text" id="newAcctName" placeholder="Account Name" style="width:180px"></div>' +
    '<div class="add-form-field"><label>Type</label><select id="newAcctType"><option value="Broker">Broker</option><option value="Cash">Cash</option></select></div>' +
    '<div class="add-form-field"><label>Currency</label><input type="text" id="newAcctCurrency" value="EUR" style="width:60px"></div>' +
    '<div class="add-form-field"><label>Net Worth</label><input type="checkbox" id="newAcctNW" checked></div>' +
    '<div class="add-form-field"><label>Performance</label><input type="checkbox" id="newAcctPerf"></div>' +
    '<button class="btn-add" onclick="addAccount()">Add Account</button>' +
    '</div></div>';

  html += '<div class="admin-table-container"><table class="admin-table"><thead><tr>' +
    '<th>ID</th><th>Name</th><th>Type</th><th>Currency</th><th style="text-align:center">Net Worth</th><th style="text-align:center">Performance</th><th></th>' +
    '</tr></thead><tbody>';

  if (!accts.length) {
    html += '<tr><td colspan="7"><div class="empty-state">No accounts yet. Add one above.</div></td></tr>';
  }

  accts.forEach(function(a, i) {
    html += '<tr>' +
      '<td class="cell-id">' + escHtml(a.account_id) + '</td>' +
      '<td><input type="text" value="' + escHtml(a.account_name) + '" data-idx="' + i + '" data-field="account_name" class="acct-field"></td>' +
      '<td><select data-idx="' + i + '" data-field="type" class="acct-field">' +
        '<option value="Broker"' + (a.type === 'Broker' ? ' selected' : '') + '>Broker</option>' +
        '<option value="Cash"' + (a.type === 'Cash' ? ' selected' : '') + '>Cash</option>' +
      '</select></td>' +
      '<td><input type="text" value="' + escHtml(a.currency || 'EUR') + '" data-idx="' + i + '" data-field="currency" class="acct-field" style="width:60px"></td>' +
      '<td style="text-align:center"><input type="checkbox"' + (a.include_networth ? ' checked' : '') + ' data-idx="' + i + '" data-field="include_networth" class="acct-check"></td>' +
      '<td style="text-align:center"><input type="checkbox"' + (a.include_performance ? ' checked' : '') + ' data-idx="' + i + '" data-field="include_performance" class="acct-check"></td>' +
      '<td style="width:60px"><button class="btn-delete" data-idx="' + i + '" onclick="deleteAccount(this)">Delete</button></td>' +
      '</tr>';
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;

  container.querySelectorAll('.acct-field').forEach(function(el) {
    el.addEventListener('change', function() {
      var idx = parseInt(this.dataset.idx);
      AdminState.accounts[idx][this.dataset.field] = this.value;
      markDirty();
    });
  });

  container.querySelectorAll('.acct-check').forEach(function(el) {
    el.addEventListener('change', function() {
      var idx = parseInt(this.dataset.idx);
      AdminState.accounts[idx][this.dataset.field] = this.checked;
      markDirty();
    });
  });
}

function deleteAccount(btn) {
  var idx = parseInt(btn.dataset.idx);
  var acct = AdminState.accounts[idx];
  var refs = AdminState.data.filter(function(r) { return r.account_id === acct.account_id; });
  var msg = 'Delete account "' + acct.account_id + '"?';
  if (refs.length) msg += '\n\nWarning: ' + refs.length + ' MonthEnd rows reference this account.';
  if (!confirm(msg)) return;
  AdminState.accounts.splice(idx, 1);
  markDirty();
  renderAccounts();
}

function addAccount() {
  var idEl = document.getElementById('newAcctId');
  var nameEl = document.getElementById('newAcctName');
  var id = idEl.value.trim().toUpperCase();
  var name = nameEl.value.trim();

  idEl.classList.remove('input-error');
  nameEl.classList.remove('input-error');

  if (!id) { idEl.classList.add('input-error'); return; }
  if (!name) { nameEl.classList.add('input-error'); return; }
  if (AdminState.accounts.some(function(a) { return a.account_id === id; })) {
    alert('Account ID "' + id + '" already exists.');
    return;
  }

  AdminState.accounts.push({
    account_id: id,
    account_name: name,
    type: document.getElementById('newAcctType').value,
    currency: document.getElementById('newAcctCurrency').value.trim() || 'EUR',
    include_networth: document.getElementById('newAcctNW').checked,
    include_performance: document.getElementById('newAcctPerf').checked
  });
  markDirty();
  renderAccounts();
  showToast('Account added');
}

// --- Budget Tab ---

function renderBudget() {
  var container = document.getElementById('budgetTable');
  var items = AdminState.budgetItems;

  var html = '<div class="section-header">' +
    '<h2>Budget Items</h2>' +
    '<p class="section-desc">Monthly budget items used for savings rate and operating reserve calculations. Yearly/quarterly amounts are automatically prorated to monthly.</p>' +
    '</div>';

  // Add form at top
  html += '<div class="add-form-card">' +
    '<div class="add-form-title">Add Budget Item</div>' +
    '<div class="add-form-row">' +
    '<div class="add-form-field"><label>ID</label><input type="text" id="newBudgetId" placeholder="item_id" style="width:100px"></div>' +
    '<div class="add-form-field"><label>Name</label><input type="text" id="newBudgetName" placeholder="Name" style="width:150px"></div>' +
    '<div class="add-form-field"><label>Type</label><select id="newBudgetType"><option value="fixed">fixed</option><option value="variable">variable</option></select></div>' +
    '<div class="add-form-field"><label>Amount</label><input type="number" step="any" id="newBudgetAmount" placeholder="0" style="width:100px"></div>' +
    '<div class="add-form-field"><label>Frequency</label><select id="newBudgetFreq"><option value="monthly">monthly</option><option value="quarterly">quarterly</option><option value="yearly">yearly</option></select></div>' +
    '<div class="add-form-field"><label>Category</label><input type="text" id="newBudgetCategory" placeholder="Category" style="width:120px"></div>' +
    '<div class="add-form-field"><label>Active</label><input type="checkbox" id="newBudgetActive" checked></div>' +
    '<button class="btn-add" onclick="addBudget()">Add Item</button>' +
    '</div></div>';

  html += '<div class="admin-table-container"><table class="admin-table"><thead><tr>' +
    '<th>ID</th><th>Name</th><th>Type</th><th>Amount</th><th>Frequency</th><th>Category</th><th style="text-align:center">Active</th><th></th>' +
    '</tr></thead><tbody>';

  if (!items.length) {
    html += '<tr><td colspan="8"><div class="empty-state">No budget items yet. Add one above.</div></td></tr>';
  }

  items.forEach(function(b, i) {
    html += '<tr' + (!b.active ? ' style="opacity:0.5"' : '') + '>' +
      '<td class="cell-id">' + escHtml(b.item_id) + '</td>' +
      '<td><input type="text" value="' + escHtml(b.name) + '" data-idx="' + i + '" data-field="name" class="budget-field"></td>' +
      '<td><select data-idx="' + i + '" data-field="type" class="budget-field">' +
        '<option value="fixed"' + (b.type === 'fixed' ? ' selected' : '') + '>fixed</option>' +
        '<option value="variable"' + (b.type === 'variable' ? ' selected' : '') + '>variable</option>' +
      '</select></td>' +
      '<td><input type="number" step="any" value="' + b.amount + '" data-idx="' + i + '" data-field="amount" class="budget-num" style="width:100px"></td>' +
      '<td><select data-idx="' + i + '" data-field="frequency" class="budget-field">' +
        '<option value="monthly"' + (b.frequency === 'monthly' ? ' selected' : '') + '>monthly</option>' +
        '<option value="quarterly"' + (b.frequency === 'quarterly' ? ' selected' : '') + '>quarterly</option>' +
        '<option value="yearly"' + (b.frequency === 'yearly' ? ' selected' : '') + '>yearly</option>' +
      '</select></td>' +
      '<td><input type="text" value="' + escHtml(b.category) + '" data-idx="' + i + '" data-field="category" class="budget-field" style="width:120px"></td>' +
      '<td style="text-align:center"><input type="checkbox"' + (b.active ? ' checked' : '') + ' data-idx="' + i + '" class="budget-active"></td>' +
      '<td style="width:60px"><button class="btn-delete" data-idx="' + i + '" onclick="deleteBudget(this)">Delete</button></td>' +
      '</tr>';
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;

  container.querySelectorAll('.budget-field').forEach(function(el) {
    el.addEventListener('change', function() {
      var idx = parseInt(this.dataset.idx);
      AdminState.budgetItems[idx][this.dataset.field] = this.value;
      markDirty();
    });
  });

  container.querySelectorAll('.budget-num').forEach(function(el) {
    el.addEventListener('change', function() {
      var idx = parseInt(this.dataset.idx);
      var val = parseFloat(this.value);
      if (!isNaN(val)) {
        AdminState.budgetItems[idx][this.dataset.field] = val;
        markDirty();
      }
    });
  });

  container.querySelectorAll('.budget-active').forEach(function(el) {
    el.addEventListener('change', function() {
      var idx = parseInt(this.dataset.idx);
      AdminState.budgetItems[idx].active = this.checked;
      markDirty();
      renderBudget();
    });
  });
}

function deleteBudget(btn) {
  var idx = parseInt(btn.dataset.idx);
  if (!confirm('Delete budget item "' + AdminState.budgetItems[idx].item_id + '"?')) return;
  AdminState.budgetItems.splice(idx, 1);
  markDirty();
  renderBudget();
}

function addBudget() {
  var idEl = document.getElementById('newBudgetId');
  var nameEl = document.getElementById('newBudgetName');
  var amtEl = document.getElementById('newBudgetAmount');
  var id = idEl.value.trim().toLowerCase();
  var name = nameEl.value.trim();
  var amount = parseFloat(amtEl.value);

  idEl.classList.remove('input-error');
  nameEl.classList.remove('input-error');
  amtEl.classList.remove('input-error');

  if (!id) { idEl.classList.add('input-error'); return; }
  if (!name) { nameEl.classList.add('input-error'); return; }
  if (isNaN(amount) || amount <= 0) { amtEl.classList.add('input-error'); return; }
  if (AdminState.budgetItems.some(function(b) { return b.item_id === id; })) {
    alert('Budget item "' + id + '" already exists.');
    return;
  }

  AdminState.budgetItems.push({
    item_id: id,
    name: name,
    type: document.getElementById('newBudgetType').value,
    amount: amount,
    frequency: document.getElementById('newBudgetFreq').value,
    category: document.getElementById('newBudgetCategory').value.trim() || 'Other',
    active: document.getElementById('newBudgetActive').checked
  });
  markDirty();
  renderBudget();
  showToast('Budget item added');
}

// --- MonthEnd Tab ---

function getFilteredData() {
  var rows = AdminState.data.slice();
  // Sort descending by month, then by account_id
  rows.sort(function(a, b) {
    if (a.month !== b.month) return b.month.localeCompare(a.month);
    return a.account_id.localeCompare(b.account_id);
  });

  if (AdminState.filterAccount !== 'ALL') {
    rows = rows.filter(function(r) { return r.account_id === AdminState.filterAccount; });
  }

  if (AdminState.filterMonths > 0) {
    var months = [];
    rows.forEach(function(r) { if (months.indexOf(r.month) === -1) months.push(r.month); });
    months.sort().reverse();
    var keepMonths = months.slice(0, AdminState.filterMonths);
    rows = rows.filter(function(r) { return keepMonths.indexOf(r.month) !== -1; });
  }

  return rows;
}

function renderMonthEnd() {
  var container = document.getElementById('monthendContent');
  var acctIds = AdminState.accounts.map(function(a) { return a.account_id; });
  var acctNames = {};
  AdminState.accounts.forEach(function(a) { acctNames[a.account_id] = a.account_name; });

  var html = '<div class="section-header">' +
    '<h2>Month-End Balances</h2>' +
    '<p class="section-desc">End-of-month account values and net contributions. Each row is a unique (month, account) pair. Sorted newest first.</p>' +
    '</div>';

  // Add form at top
  var defaultMonth = nextMonth();
  html += '<div class="add-form-card">' +
    '<div class="add-form-title">Add Month-End Row</div>' +
    '<div class="add-form-row">' +
    '<div class="add-form-field"><label>Month</label><input type="text" id="newMeMonth" value="' + defaultMonth + '" placeholder="YYYY-MM" style="width:100px"></div>' +
    '<div class="add-form-field"><label>Account</label><select id="newMeAccount">';
  acctIds.forEach(function(id) {
    html += '<option value="' + escHtml(id) + '">' + escHtml(id) + '</option>';
  });
  html += '</select></div>' +
    '<div class="add-form-field"><label>End Value</label><input type="number" step="0.01" id="newMeEndValue" placeholder="0.00" style="width:130px"></div>' +
    '<div class="add-form-field"><label>Net Contribution</label><input type="number" step="0.01" id="newMeContribution" placeholder="0.00" style="width:130px"></div>' +
    '<div class="add-form-field"><label>Notes</label><input type="text" id="newMeNotes" placeholder="" style="width:140px"></div>' +
    '<button class="btn-add" onclick="addMonthEnd()">Add Row</button>' +
    '</div></div>';

  // Filters
  html += '<div class="admin-filters">' +
    '<label>Account:</label>' +
    '<select id="meFilterAccount"><option value="ALL">All Accounts</option>';
  acctIds.forEach(function(id) {
    html += '<option value="' + escHtml(id) + '"' + (AdminState.filterAccount === id ? ' selected' : '') + '>' + escHtml(id) + ' — ' + escHtml(acctNames[id] || '') + '</option>';
  });
  html += '</select>' +
    '<label>Show last:</label>' +
    '<select id="meFilterMonths">' +
    '<option value="6"' + (AdminState.filterMonths === 6 ? ' selected' : '') + '>6 months</option>' +
    '<option value="12"' + (AdminState.filterMonths === 12 ? ' selected' : '') + '>12 months</option>' +
    '<option value="24"' + (AdminState.filterMonths === 24 ? ' selected' : '') + '>24 months</option>' +
    '<option value="36"' + (AdminState.filterMonths === 36 ? ' selected' : '') + '>36 months</option>' +
    '<option value="0"' + (AdminState.filterMonths === 0 ? ' selected' : '') + '>All</option>' +
    '</select></div>';

  var filtered = getFilteredData();

  html += '<div class="row-count">' + filtered.length + ' rows shown (of ' + AdminState.data.length + ' total)</div>' +
    '<div class="admin-table-container"><table class="admin-table"><thead><tr>' +
    '<th>Month</th><th>Account</th><th style="text-align:right">End Value</th><th style="text-align:right">Net Contribution</th><th>Notes</th><th></th>' +
    '</tr></thead><tbody>';

  if (!filtered.length) {
    html += '<tr><td colspan="6"><div class="empty-state">No rows match the current filters.</div></td></tr>';
  }

  // Track month groups for visual separation
  var lastMonth = null;
  filtered.forEach(function(r) {
    var dataIdx = AdminState.data.indexOf(r);
    var monthChanged = r.month !== lastMonth;
    lastMonth = r.month;

    html += '<tr' + (monthChanged && lastMonth ? ' style="border-top:2px solid var(--border)"' : '') + '>' +
      '<td><input type="text" value="' + escHtml(r.month) + '" data-idx="' + dataIdx + '" data-field="month" class="me-field" style="width:100px"></td>' +
      '<td><select data-idx="' + dataIdx + '" data-field="account_id" class="me-field">';
    acctIds.forEach(function(id) {
      html += '<option value="' + escHtml(id) + '"' + (r.account_id === id ? ' selected' : '') + '>' + escHtml(id) + '</option>';
    });
    html += '</select></td>' +
      '<td style="text-align:right"><input type="number" step="0.01" value="' + r.end_value + '" data-idx="' + dataIdx + '" data-field="end_value" class="me-num" style="width:130px; text-align:right"></td>' +
      '<td style="text-align:right"><input type="number" step="0.01" value="' + r.net_contribution + '" data-idx="' + dataIdx + '" data-field="net_contribution" class="me-num" style="width:130px; text-align:right"></td>' +
      '<td><input type="text" value="' + escHtml(r.notes || '') + '" data-idx="' + dataIdx + '" data-field="notes" class="me-field"></td>' +
      '<td style="width:60px"><button class="btn-delete" data-idx="' + dataIdx + '" onclick="deleteMonthEnd(this)">Delete</button></td>' +
      '</tr>';
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;

  // Bind filter events
  document.getElementById('meFilterAccount').addEventListener('change', function() {
    AdminState.filterAccount = this.value;
    renderMonthEnd();
  });
  document.getElementById('meFilterMonths').addEventListener('change', function() {
    AdminState.filterMonths = parseInt(this.value);
    renderMonthEnd();
  });

  container.querySelectorAll('.me-field').forEach(function(el) {
    el.addEventListener('change', function() {
      var idx = parseInt(this.dataset.idx);
      AdminState.data[idx][this.dataset.field] = this.value;
      markDirty();
    });
  });

  container.querySelectorAll('.me-num').forEach(function(el) {
    el.addEventListener('change', function() {
      var idx = parseInt(this.dataset.idx);
      var val = parseFloat(this.value);
      if (!isNaN(val)) {
        AdminState.data[idx][this.dataset.field] = val;
        markDirty();
      }
    });
  });
}

function nextMonth() {
  if (!AdminState.data.length) return '2025-01';
  var months = AdminState.data.map(function(r) { return r.month; }).sort();
  var last = months[months.length - 1];
  var parts = last.split('-');
  var y = parseInt(parts[0]);
  var m = parseInt(parts[1]) + 1;
  if (m > 12) { m = 1; y++; }
  return y + '-' + (m < 10 ? '0' : '') + m;
}

function deleteMonthEnd(btn) {
  var idx = parseInt(btn.dataset.idx);
  var r = AdminState.data[idx];
  if (!confirm('Delete row ' + r.month + ' / ' + r.account_id + '?')) return;
  AdminState.data.splice(idx, 1);
  markDirty();
  renderMonthEnd();
}

function addMonthEnd() {
  var monthEl = document.getElementById('newMeMonth');
  var endValEl = document.getElementById('newMeEndValue');
  var contribEl = document.getElementById('newMeContribution');
  var month = monthEl.value.trim();
  var accountId = document.getElementById('newMeAccount').value;
  var endValue = parseFloat(endValEl.value);
  var contribution = parseFloat(contribEl.value);

  monthEl.classList.remove('input-error');
  endValEl.classList.remove('input-error');

  if (!/^\d{4}-\d{2}$/.test(month)) {
    monthEl.classList.add('input-error');
    alert('Month must be in YYYY-MM format.');
    return;
  }
  if (isNaN(endValue)) { endValEl.classList.add('input-error'); return; }
  if (isNaN(contribution)) contribution = 0;

  var dup = AdminState.data.some(function(r) { return r.month === month && r.account_id === accountId; });
  if (dup) {
    alert('A row for ' + month + ' / ' + accountId + ' already exists.');
    return;
  }

  AdminState.data.push({
    month: month,
    account_id: accountId,
    end_value: endValue,
    net_contribution: contribution,
    notes: document.getElementById('newMeNotes').value.trim()
  });
  markDirty();
  renderMonthEnd();
  showToast('Row added: ' + month + ' / ' + accountId);
}

// --- Validation ---

function validate() {
  var errors = [];

  Object.keys(AdminState.config).forEach(function(key) {
    if (typeof AdminState.config[key] !== 'number' || isNaN(AdminState.config[key])) {
      errors.push('Config: "' + key + '" must be a number.');
    }
  });

  var acctIds = {};
  AdminState.accounts.forEach(function(a) {
    if (!a.account_id) errors.push('Accounts: missing account_id.');
    if (!a.account_name) errors.push('Accounts: missing name for ' + a.account_id + '.');
    if (acctIds[a.account_id]) errors.push('Accounts: duplicate ID "' + a.account_id + '".');
    acctIds[a.account_id] = true;
  });

  var budgetIds = {};
  AdminState.budgetItems.forEach(function(b) {
    if (!b.item_id) errors.push('Budget: missing item_id.');
    if (budgetIds[b.item_id]) errors.push('Budget: duplicate ID "' + b.item_id + '".');
    budgetIds[b.item_id] = true;
    if (typeof b.amount !== 'number' || b.amount <= 0) errors.push('Budget: "' + b.item_id + '" amount must be > 0.');
  });

  var meKeys = {};
  AdminState.data.forEach(function(r) {
    if (!/^\d{4}-\d{2}$/.test(r.month)) errors.push('MonthEnd: invalid month "' + r.month + '".');
    var key = r.month + '|' + r.account_id;
    if (meKeys[key]) errors.push('MonthEnd: duplicate row for ' + r.month + ' / ' + r.account_id + '.');
    meKeys[key] = true;
  });

  return errors;
}

// --- Save ---

async function save() {
  var errors = validate();
  if (errors.length) {
    var errHtml = '<div class="validation-errors"><strong>Validation errors:</strong><ul>' +
      errors.map(function(e) { return '<li>' + escHtml(e) + '</li>'; }).join('') +
      '</ul></div>';
    var activeContent = document.querySelector('.admin-content.active');
    var existing = activeContent.querySelector('.validation-errors');
    if (existing) existing.remove();
    activeContent.insertAdjacentHTML('afterbegin', errHtml);
    activeContent.scrollTop = 0;
    window.scrollTo(0, 0);
    return;
  }

  document.querySelectorAll('.validation-errors').forEach(function(el) { el.remove(); });

  var btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    // 1. Build updated data
    var updated = {
      config: AdminState.config,
      accounts: AdminState.accounts,
      data: AdminState.data,
      budgetItems: AdminState.budgetItems
    };

    // 2. Encrypt or keep as plain JSON
    var output, filename;
    if (AdminState.wasEncrypted) {
      var encrypted = await Crypto.encrypt(updated, AdminState.passphrase);
      output = JSON.stringify(encrypted);
      filename = AdminState.filename || 'fi-data.fjson';
    } else {
      output = JSON.stringify(updated, null, 2);
      filename = AdminState.filename || 'fi-data.json';
    }

    // 3. Save to IDB + sessionStorage first (working copy)
    AdminState.originalFileText = output;
    var stashData = {
      decryptedData: updated,
      passphrase: AdminState.passphrase,
      wasEncrypted: AdminState.wasEncrypted,
      originalFileText: output,
      filename: filename
    };
    FileManager.stashToSession(stashData);
    await DataCache.save(stashData);

    AdminState.dirty = false;
    document.querySelector('.dirty-indicator').classList.remove('visible');

    // 4. Write to file/directory (Chrome) or export download (Safari)
    var toastMsg = 'Saved';
    if (typeof window.showOpenFilePicker === 'function') {
      // File System Access API available (Chrome/Edge)
      try {
        var method = await FileManager.save(output, filename);
        if (method === 'handle') {
          toastMsg = 'Saved to ' + filename;
        } else if (method === 'directory') {
          toastMsg = 'Saved to folder';
        }
      } catch (e) {
        if (e.name === 'AbortError') {
          toastMsg = 'Saved (folder selection cancelled)';
        } else {
          throw e;
        }
      }
    } else if (AdminState.config.auto_export) {
      // No File System Access (Safari/iOS) — download if auto_export enabled
      FileManager.export(output, filename);
      toastMsg = 'Saved \u2014 export downloaded';
    }

    showToast(toastMsg);
  } catch (e) {
    alert('Save failed: ' + e.message);
  }

  btn.disabled = false;
  btn.textContent = 'Save';
}

// --- Helpers ---

function escHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

// Auto-restore: sessionStorage → IndexedDB → unlock screen
(async function() {
  function restoreFromSession(session) {
    AdminState.originalFileText = session.originalFileText || null;
    AdminState.filename = session.filename || null;
    AdminState.wasEncrypted = !!session.wasEncrypted;
    AdminState.passphrase = session.passphrase || null;
    loadAdminData(session.decryptedData);
    showAdmin();
  }

  // 1. Try sessionStorage
  var session = FileManager.loadFromSession();
  if (session && session.decryptedData) {
    restoreFromSession(session);
    return;
  }

  // 2. Try IndexedDB
  try {
    var cached = await DataCache.load();
    if (cached && cached.decryptedData) {
      FileManager.stashToSession(cached);
      restoreFromSession(cached);
      return;
    }
  } catch (e) {
    // IndexedDB unavailable — fall through to unlock
  }

  // 3. Show unlock screen (first visit)
})();
