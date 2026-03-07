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
  milestones: [],
  mortgage: null,
  originalFileText: null,
  filename: null,
  wasEncrypted: false,
  passphrase: null,
  dirty: false,
  activeTab: 'config',
  filterAccount: 'ALL',
  filterMonths: 24,
  storageMode: 'file'  // 'file' or 'db'
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
  var b5 = document.getElementById('badge-milestones');
  var b6 = document.getElementById('badge-mortgage');
  if (b1) b1.textContent = Object.keys(AdminState.config).length;
  if (b2) b2.textContent = AdminState.accounts.length;
  if (b3) b3.textContent = AdminState.budgetItems.length;
  if (b5) b5.textContent = AdminState.milestones.length;
  if (b4) b4.textContent = AdminState.data.length;
  if (b6) b6.textContent = AdminState.mortgage ? '1' : '0';
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
  AdminState.milestones = (data.milestones || []).map(function(m) {
    return Object.assign({}, m, { sub_targets: (m.sub_targets || []).map(function(s) { return Object.assign({}, s); }) });
  });
  if (data.mortgage) {
    AdminState.mortgage = Object.assign({}, data.mortgage, {
      extra_payments: (data.mortgage.extra_payments || []).map(function(e) { return Object.assign({}, e); }),
      actual_payments: (data.mortgage.actual_payments || []).map(function(a) { return Object.assign({}, a); }),
      house_valuations: (data.mortgage.house_valuations || []).map(function(v) { return Object.assign({}, v); })
    });
  } else {
    AdminState.mortgage = null;
  }
}

function showAdmin() {
  document.getElementById('unlock').style.display = 'none';
  var authScreen = document.getElementById('authScreen');
  if (authScreen) authScreen.style.display = 'none';
  document.getElementById('adminApp').style.display = 'block';
  // Show import/export buttons in DB mode
  var dbActions = document.getElementById('adminDbActions');
  if (dbActions && AdminState.storageMode === 'db') dbActions.style.display = '';
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
  else if (tab === 'milestones') renderMilestones();
  else if (tab === 'monthend') renderMonthEnd();
  else if (tab === 'mortgage') renderMortgageAdmin();
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

// --- Milestones Tab ---

var GOAL_LABELS = {
  emergency_fund: 'Emergency Fund',
  house_downpayment: 'House Down Payment',
  fi_networth: 'FI Net Worth'
};

function renderMilestones() {
  var container = document.getElementById('milestonesTable');
  var milestones = AdminState.milestones;

  var html = '<div class="section-header">' +
    '<h2>Milestones</h2>' +
    '<p class="section-desc">Time-bound financial targets. Each milestone has an overall target and optional per-goal sub-targets.</p>' +
    '</div>';

  // Add form
  html += '<div class="add-form-card">' +
    '<div class="add-form-title">Add Milestone</div>' +
    '<div class="add-form-row">' +
    '<div class="add-form-field"><label>ID</label><input type="text" id="newMsId" placeholder="end_2026" style="width:120px"></div>' +
    '<div class="add-form-field"><label>Name</label><input type="text" id="newMsName" placeholder="End of 2026" style="width:160px"></div>' +
    '<div class="add-form-field"><label>Target Date</label><input type="text" id="newMsDate" placeholder="YYYY-MM" style="width:100px"></div>' +
    '<div class="add-form-field"><label>Total Target</label><input type="number" step="any" id="newMsTotal" placeholder="220000" style="width:130px"></div>' +
    '<button class="btn-add" onclick="addMilestone()">Add Milestone</button>' +
    '</div></div>';

  // Milestones list
  if (!milestones.length) {
    html += '<div class="empty-state" style="padding:24px; text-align:center; color:var(--text-secondary)">No milestones yet. Add one above.</div>';
  }

  milestones.forEach(function(m, i) {
    html += '<div class="add-form-card" style="margin-bottom:12px" data-ms-idx="' + i + '">' +
      '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px">' +
        '<div class="add-form-title" style="margin-bottom:0">' + escHtml(m.name) + ' (' + escHtml(m.milestone_id) + ')</div>' +
        '<button class="btn-delete" onclick="deleteMilestone(' + i + ')">Delete</button>' +
      '</div>' +
      '<div class="add-form-row" style="margin-bottom:12px">' +
        '<div class="add-form-field"><label>Name</label><input type="text" value="' + escHtml(m.name) + '" data-ms="' + i + '" data-field="name" class="ms-field" style="width:160px"></div>' +
        '<div class="add-form-field"><label>Target Date</label><input type="text" value="' + escHtml(m.target_date) + '" data-ms="' + i + '" data-field="target_date" class="ms-field" style="width:100px"></div>' +
        '<div class="add-form-field"><label>Total Target</label><input type="number" step="any" value="' + m.total_target + '" data-ms="' + i + '" data-field="total_target" class="ms-num" style="width:130px"></div>' +
      '</div>';

    // Sub-targets table
    html += '<div style="margin-left:12px">' +
      '<div style="font-size:12px; font-weight:600; color:var(--text-secondary); text-transform:uppercase; margin-bottom:8px">Sub-Targets</div>' +
      '<div class="admin-table-container"><table class="admin-table"><thead><tr>' +
      '<th>Goal</th><th style="text-align:right">Amount</th><th></th>' +
      '</tr></thead><tbody>';

    (m.sub_targets || []).forEach(function(st, j) {
      html += '<tr>' +
        '<td><select data-ms="' + i + '" data-st="' + j + '" data-field="goal" class="st-field">' +
        Object.keys(GOAL_LABELS).map(function(g) {
          return '<option value="' + g + '"' + (st.goal === g ? ' selected' : '') + '>' + GOAL_LABELS[g] + '</option>';
        }).join('') +
        '</select></td>' +
        '<td style="text-align:right"><input type="number" step="any" value="' + st.amount + '" data-ms="' + i + '" data-st="' + j + '" data-field="amount" class="st-num" style="width:120px; text-align:right"></td>' +
        '<td style="width:60px"><button class="btn-delete" onclick="deleteSubTarget(' + i + ',' + j + ')">Delete</button></td>' +
        '</tr>';
    });

    html += '</tbody></table></div>' +
      '<button class="btn-add" style="margin-top:8px; font-size:12px; padding:4px 12px" onclick="addSubTarget(' + i + ')">+ Sub-Target</button>' +
      '</div></div>';
  });

  container.innerHTML = html;

  // Bind milestone field events
  container.querySelectorAll('.ms-field').forEach(function(el) {
    el.addEventListener('change', function() {
      AdminState.milestones[parseInt(this.dataset.ms)][this.dataset.field] = this.value;
      markDirty();
    });
  });
  container.querySelectorAll('.ms-num').forEach(function(el) {
    el.addEventListener('change', function() {
      var val = parseFloat(this.value);
      if (!isNaN(val)) {
        AdminState.milestones[parseInt(this.dataset.ms)][this.dataset.field] = val;
        markDirty();
      }
    });
  });
  container.querySelectorAll('.st-field').forEach(function(el) {
    el.addEventListener('change', function() {
      AdminState.milestones[parseInt(this.dataset.ms)].sub_targets[parseInt(this.dataset.st)][this.dataset.field] = this.value;
      markDirty();
    });
  });
  container.querySelectorAll('.st-num').forEach(function(el) {
    el.addEventListener('change', function() {
      var val = parseFloat(this.value);
      if (!isNaN(val)) {
        AdminState.milestones[parseInt(this.dataset.ms)].sub_targets[parseInt(this.dataset.st)][this.dataset.field] = val;
        markDirty();
      }
    });
  });
}

function addMilestone() {
  var idEl = document.getElementById('newMsId');
  var nameEl = document.getElementById('newMsName');
  var dateEl = document.getElementById('newMsDate');
  var totalEl = document.getElementById('newMsTotal');
  var id = idEl.value.trim().toLowerCase().replace(/\s+/g, '_');
  var name = nameEl.value.trim();
  var date = dateEl.value.trim();
  var total = parseFloat(totalEl.value);

  idEl.classList.remove('input-error');
  nameEl.classList.remove('input-error');
  dateEl.classList.remove('input-error');
  totalEl.classList.remove('input-error');

  if (!id) { idEl.classList.add('input-error'); return; }
  if (!name) { nameEl.classList.add('input-error'); return; }
  if (!/^\d{4}-\d{2}$/.test(date)) { dateEl.classList.add('input-error'); return; }
  if (isNaN(total) || total <= 0) { totalEl.classList.add('input-error'); return; }
  if (AdminState.milestones.some(function(m) { return m.milestone_id === id; })) {
    alert('Milestone "' + id + '" already exists.');
    return;
  }

  AdminState.milestones.push({
    milestone_id: id,
    name: name,
    target_date: date,
    total_target: total,
    sub_targets: []
  });
  markDirty();
  renderMilestones();
  showToast('Milestone added');
}

function deleteMilestone(idx) {
  if (!confirm('Delete milestone "' + AdminState.milestones[idx].name + '"?')) return;
  AdminState.milestones.splice(idx, 1);
  markDirty();
  renderMilestones();
}

function addSubTarget(msIdx) {
  AdminState.milestones[msIdx].sub_targets.push({ goal: 'fi_networth', amount: 0 });
  markDirty();
  renderMilestones();
}

function deleteSubTarget(msIdx, stIdx) {
  AdminState.milestones[msIdx].sub_targets.splice(stIdx, 1);
  markDirty();
  renderMilestones();
}

// --- Mortgage Tab ---

function renderMortgageAdmin() {
  var container = document.getElementById('mortgageTable');
  var m = AdminState.mortgage;

  var html = '<div class="section-header">' +
    '<h2>Mortgage</h2>' +
    '<p class="section-desc">Configure your mortgage parameters, track extra payments, record actual payments, and log house valuations.</p>' +
    '</div>';

  // Section A: Mortgage Parameters
  if (!m) {
    html += '<div class="add-form-card mortgage-section">' +
      '<div class="add-form-title">Mortgage Parameters</div>' +
      '<p style="color:var(--text-secondary); font-size:13px; margin-bottom:12px">No mortgage configured yet. Fill in your mortgage details to get started.</p>' +
      '<div class="add-form-row">' +
      '<div class="add-form-field"><label>Purchase Price</label><input type="number" step="any" id="newMtgPurchasePrice" placeholder="310000" style="width:140px"></div>' +
      '<div class="add-form-field"><label>Down Payment</label><input type="number" step="any" id="newMtgDownPayment" placeholder="60000" style="width:140px"></div>' +
      '<div class="add-form-field"><label>Annual Rate (%)</label><input type="number" step="0.01" id="newMtgRate" value="2.75" style="width:100px"></div>' +
      '<div class="add-form-field"><label>Term (years)</label><input type="number" step="1" id="newMtgTerm" value="30" style="width:80px"></div>' +
      '<div class="add-form-field"><label>Start Date</label><input type="text" id="newMtgStart" value="' + nextMonth() + '" placeholder="YYYY-MM" style="width:100px"></div>' +
      '<button class="btn-add" onclick="createMortgage()">Create Mortgage</button>' +
      '</div></div>';
    container.innerHTML = html;
    return;
  }

  html += '<div class="add-form-card mortgage-section">' +
    '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px">' +
    '<div class="add-form-title" style="margin-bottom:0">Mortgage Parameters</div>' +
    '<button class="btn-delete" onclick="deleteMortgage()">Delete Mortgage</button>' +
    '</div>' +
    '<div class="add-form-row">' +
    '<div class="add-form-field"><label>Principal</label><input type="number" step="any" id="mtgPrincipal" value="' + m.principal + '" style="width:140px"></div>' +
    '<div class="add-form-field"><label>Annual Rate (%)</label><input type="number" step="0.01" id="mtgRate" value="' + (m.annual_rate * 100).toFixed(2) + '" style="width:100px"></div>' +
    '<div class="add-form-field"><label>Term (years)</label><input type="number" step="1" id="mtgTerm" value="' + m.term_years + '" style="width:80px"></div>' +
    '<div class="add-form-field"><label>Start Date</label><input type="text" id="mtgStart" value="' + escHtml(m.start_date) + '" placeholder="YYYY-MM" style="width:100px"></div>' +
    '</div></div>';

  // Section B: Extra Payments
  html += '<div class="add-form-card mortgage-section">' +
    '<div class="add-form-title">Extra Payments</div>';

  if (m.extra_payments.length) {
    html += '<div class="admin-table-container"><table class="admin-table"><thead><tr>' +
      '<th>Date</th><th style="text-align:right">Amount</th><th>Strategy</th><th></th>' +
      '</tr></thead><tbody>';
    m.extra_payments.forEach(function(ep, i) {
      html += '<tr>' +
        '<td>' + escHtml(ep.date) + '</td>' +
        '<td style="text-align:right">' + ep.amount.toLocaleString('es-ES', {minimumFractionDigits: 2}) + '</td>' +
        '<td>' + (ep.strategy === 'reduce_term' ? 'Reduce Term' : 'Reduce Payment') + '</td>' +
        '<td style="width:60px"><button class="btn-delete" onclick="deleteExtraPayment(' + i + ')">Delete</button></td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
  } else {
    html += '<p style="color:var(--text-secondary); font-size:13px; margin-bottom:12px">No extra payments yet.</p>';
  }

  html += '<div class="add-form-row" style="margin-top:12px">' +
    '<div class="add-form-field"><label>Date</label><input type="text" id="newEpDate" placeholder="YYYY-MM" style="width:100px"></div>' +
    '<div class="add-form-field"><label>Amount</label><input type="number" step="0.01" id="newEpAmount" placeholder="5000" style="width:120px"></div>' +
    '<div class="add-form-field"><label>Strategy</label><select id="newEpStrategy">' +
    '<option value="reduce_term">Reduce Term</option>' +
    '<option value="reduce_payment">Reduce Payment</option>' +
    '</select></div>' +
    '<button class="btn-add" onclick="addExtraPayment()">Add</button>' +
    '</div></div>';

  // Section C: Actual Payments
  html += '<div class="add-form-card mortgage-section">' +
    '<div class="add-form-title">Actual Payments</div>';

  if (m.actual_payments.length) {
    html += '<div class="admin-table-container"><table class="admin-table"><thead><tr>' +
      '<th>Month</th><th style="text-align:right">Amount</th><th style="text-align:right">Principal</th><th style="text-align:right">Interest</th><th>Notes</th><th></th>' +
      '</tr></thead><tbody>';
    m.actual_payments.forEach(function(ap, i) {
      html += '<tr>' +
        '<td>' + escHtml(ap.month) + '</td>' +
        '<td style="text-align:right">' + ap.amount.toLocaleString('es-ES', {minimumFractionDigits: 2}) + '</td>' +
        '<td style="text-align:right">' + ap.principal_paid.toLocaleString('es-ES', {minimumFractionDigits: 2}) + '</td>' +
        '<td style="text-align:right">' + ap.interest_paid.toLocaleString('es-ES', {minimumFractionDigits: 2}) + '</td>' +
        '<td>' + escHtml(ap.notes || '') + '</td>' +
        '<td style="width:60px"><button class="btn-delete" onclick="deleteActualPayment(' + i + ')">Delete</button></td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
  } else {
    html += '<p style="color:var(--text-secondary); font-size:13px; margin-bottom:12px">No actual payments recorded yet.</p>';
  }

  html += '<div class="add-form-row" style="margin-top:12px">' +
    '<div class="add-form-field"><label>Month</label><input type="text" id="newApMonth" placeholder="YYYY-MM" style="width:100px"></div>' +
    '<div class="add-form-field"><label>Amount</label><input type="number" step="0.01" id="newApAmount" placeholder="1020.56" style="width:120px"></div>' +
    '<div class="add-form-field"><label>Principal Paid</label><input type="number" step="0.01" id="newApPrincipal" placeholder="447.23" style="width:120px"></div>' +
    '<div class="add-form-field"><label>Interest Paid</label><input type="number" step="0.01" id="newApInterest" placeholder="573.33" style="width:120px"></div>' +
    '<div class="add-form-field"><label>Notes</label><input type="text" id="newApNotes" placeholder="" style="width:120px"></div>' +
    '<button class="btn-add" onclick="addActualPayment()">Add</button>' +
    '</div></div>';

  // Section D: House Valuations
  html += '<div class="add-form-card mortgage-section">' +
    '<div class="add-form-title">House Valuations</div>';

  if (m.house_valuations.length) {
    html += '<div class="admin-table-container"><table class="admin-table"><thead><tr>' +
      '<th>Date</th><th style="text-align:right">Market Value</th><th></th>' +
      '</tr></thead><tbody>';
    m.house_valuations.forEach(function(v, i) {
      html += '<tr>' +
        '<td>' + escHtml(v.date) + '</td>' +
        '<td style="text-align:right">' + v.market_value.toLocaleString('es-ES', {minimumFractionDigits: 2}) + '</td>' +
        '<td style="width:60px"><button class="btn-delete" onclick="deleteHouseValuation(' + i + ')">Delete</button></td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
  } else {
    html += '<p style="color:var(--text-secondary); font-size:13px; margin-bottom:12px">No valuations yet. Add one to enable equity tracking.</p>';
  }

  html += '<div class="add-form-row" style="margin-top:12px">' +
    '<div class="add-form-field"><label>Date</label><input type="text" id="newHvDate" placeholder="YYYY-MM" style="width:100px"></div>' +
    '<div class="add-form-field"><label>Market Value</label><input type="number" step="0.01" id="newHvValue" placeholder="310000" style="width:140px"></div>' +
    '<button class="btn-add" onclick="addHouseValuation()">Add</button>' +
    '</div></div>';

  container.innerHTML = html;

  // Bind mortgage parameter change events
  var fields = [
    { id: 'mtgPrincipal', key: 'principal', parse: parseFloat },
    { id: 'mtgRate', key: 'annual_rate', parse: function(v) { return parseFloat(v) / 100; } },
    { id: 'mtgTerm', key: 'term_years', parse: parseInt },
    { id: 'mtgStart', key: 'start_date', parse: function(v) { return v.trim(); } }
  ];
  fields.forEach(function(f) {
    var el = document.getElementById(f.id);
    if (el) {
      el.addEventListener('change', function() {
        var val = f.parse(this.value);
        if (f.key === 'start_date') {
          if (!/^\d{4}-\d{2}$/.test(val)) { this.classList.add('input-error'); return; }
          this.classList.remove('input-error');
        } else if (isNaN(val)) {
          this.classList.add('input-error');
          return;
        }
        this.classList.remove('input-error');
        AdminState.mortgage[f.key] = val;
        markDirty();
      });
    }
  });
}

function createMortgage() {
  var purchasePrice = parseFloat(document.getElementById('newMtgPurchasePrice').value) || 0;
  var downPayment = parseFloat(document.getElementById('newMtgDownPayment').value) || 0;
  var rate = parseFloat(document.getElementById('newMtgRate').value);
  var term = parseInt(document.getElementById('newMtgTerm').value);
  var startDate = document.getElementById('newMtgStart').value.trim();

  // Validate
  if (isNaN(rate) || isNaN(term) || !/^\d{4}-\d{2}$/.test(startDate)) {
    showToast('Please fill in all fields correctly');
    return;
  }

  var principal = purchasePrice > 0 ? purchasePrice - downPayment : 250000;
  if (principal <= 0) {
    showToast('Down payment cannot exceed purchase price');
    return;
  }

  var valuations = [];
  if (purchasePrice > 0) {
    valuations.push({ date: startDate, market_value: purchasePrice });
  }

  AdminState.mortgage = {
    principal: principal,
    annual_rate: rate / 100,
    term_years: term,
    start_date: startDate,
    extra_payments: [],
    actual_payments: [],
    house_valuations: valuations
  };
  markDirty();
  renderMortgageAdmin();
  showToast('Mortgage created — principal: ' + principal.toLocaleString('es-ES') + ' €');
}

function deleteMortgage() {
  if (!confirm('Delete mortgage? This will remove all mortgage data.')) return;
  AdminState.mortgage = null;
  markDirty();
  renderMortgageAdmin();
  showToast('Mortgage deleted');
}

function addExtraPayment() {
  var dateEl = document.getElementById('newEpDate');
  var amtEl = document.getElementById('newEpAmount');
  var date = dateEl.value.trim();
  var amount = parseFloat(amtEl.value);

  dateEl.classList.remove('input-error');
  amtEl.classList.remove('input-error');

  if (!/^\d{4}-\d{2}$/.test(date)) { dateEl.classList.add('input-error'); return; }
  if (isNaN(amount) || amount <= 0) { amtEl.classList.add('input-error'); return; }

  AdminState.mortgage.extra_payments.push({
    date: date,
    amount: amount,
    strategy: document.getElementById('newEpStrategy').value
  });
  AdminState.mortgage.extra_payments.sort(function(a, b) { return a.date.localeCompare(b.date); });
  markDirty();
  renderMortgageAdmin();
  showToast('Extra payment added');
}

function deleteExtraPayment(idx) {
  AdminState.mortgage.extra_payments.splice(idx, 1);
  markDirty();
  renderMortgageAdmin();
}

function addActualPayment() {
  var monthEl = document.getElementById('newApMonth');
  var amtEl = document.getElementById('newApAmount');
  var princEl = document.getElementById('newApPrincipal');
  var intEl = document.getElementById('newApInterest');
  var month = monthEl.value.trim();
  var amount = parseFloat(amtEl.value);
  var principal = parseFloat(princEl.value);
  var interest = parseFloat(intEl.value);

  monthEl.classList.remove('input-error');
  amtEl.classList.remove('input-error');
  princEl.classList.remove('input-error');
  intEl.classList.remove('input-error');

  if (!/^\d{4}-\d{2}$/.test(month)) { monthEl.classList.add('input-error'); return; }
  if (isNaN(amount) || amount <= 0) { amtEl.classList.add('input-error'); return; }
  if (isNaN(principal)) { princEl.classList.add('input-error'); return; }
  if (isNaN(interest)) { intEl.classList.add('input-error'); return; }

  AdminState.mortgage.actual_payments.push({
    month: month,
    amount: amount,
    principal_paid: principal,
    interest_paid: interest,
    notes: document.getElementById('newApNotes').value.trim()
  });
  AdminState.mortgage.actual_payments.sort(function(a, b) { return a.month.localeCompare(b.month); });
  markDirty();
  renderMortgageAdmin();
  showToast('Actual payment recorded');
}

function deleteActualPayment(idx) {
  AdminState.mortgage.actual_payments.splice(idx, 1);
  markDirty();
  renderMortgageAdmin();
}

function addHouseValuation() {
  var dateEl = document.getElementById('newHvDate');
  var valEl = document.getElementById('newHvValue');
  var date = dateEl.value.trim();
  var value = parseFloat(valEl.value);

  dateEl.classList.remove('input-error');
  valEl.classList.remove('input-error');

  if (!/^\d{4}-\d{2}$/.test(date)) { dateEl.classList.add('input-error'); return; }
  if (isNaN(value) || value <= 0) { valEl.classList.add('input-error'); return; }

  AdminState.mortgage.house_valuations.push({
    date: date,
    market_value: value
  });
  AdminState.mortgage.house_valuations.sort(function(a, b) { return a.date.localeCompare(b.date); });
  markDirty();
  renderMortgageAdmin();
  showToast('House valuation added');
}

function deleteHouseValuation(idx) {
  AdminState.mortgage.house_valuations.splice(idx, 1);
  markDirty();
  renderMortgageAdmin();
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

  // Quick Add Month — pre-filled grid for all accounts
  var defaultMonth = nextMonth();
  var lastMonthData = getLastMonthData();
  var quickAddAlreadyExists = acctIds.every(function(id) {
    return AdminState.data.some(function(r) { return r.month === defaultMonth && r.account_id === id; });
  });

  html += '<div class="add-form-card" id="quickAddCard">' +
    '<div class="add-form-title">Quick Add Month</div>';

  if (quickAddAlreadyExists) {
    html += '<p style="color:var(--text-secondary); font-size:13px; margin:0">All accounts for <strong>' + escHtml(defaultMonth) + '</strong> already exist. Use "Add Single Row" below for corrections.</p>';
  } else {
    var predictions = getPredictions();

    html += '<div class="add-form-row" style="margin-bottom:12px; align-items:center">' +
      '<div class="add-form-field"><label>Month</label><input type="text" id="quickAddMonth" value="' + defaultMonth + '" placeholder="YYYY-MM" style="width:100px"></div>' +
      '<button class="btn-autofill" id="autoFillBtn" style="margin-left:auto" title="Fill empty fields with predicted values based on recent trends">Auto-Fill Predictions</button>' +
      '</div>' +
      '<div class="admin-table-container"><table class="admin-table" id="quickAddTable"><thead><tr>' +
      '<th>Account</th><th style="text-align:right">Last Month</th><th style="text-align:right">Predicted</th><th style="text-align:right">End Value</th><th style="text-align:right">Net Contribution</th><th>Notes</th>' +
      '</tr></thead><tbody>';

    acctIds.forEach(function(id) {
      var prev = lastMonthData[id];
      var prevDisplay = prev !== undefined ? formatQuickAddNum(prev) : '—';
      var pred = predictions[id];
      var predDisplay = pred ? formatQuickAddNum(pred.predictedValue) : '—';
      var predContrib = pred ? pred.predictedContribution : 0;
      html += '<tr>' +
        '<td class="cell-id">' + escHtml(id) + ' <span style="color:var(--text-secondary);font-size:12px">' + escHtml(acctNames[id] || '') + '</span></td>' +
        '<td style="text-align:right; color:var(--text-secondary)">' + prevDisplay + '</td>' +
        '<td style="text-align:right; color:var(--primary); font-size:12px" title="Predicted from recent trend">' + predDisplay + '</td>' +
        '<td style="text-align:right"><input type="number" step="0.01" class="qa-end-value" data-account="' + escHtml(id) + '" data-predicted="' + (pred ? pred.predictedValue : '') + '" placeholder="0.00" style="width:120px; text-align:right"></td>' +
        '<td style="text-align:right"><input type="number" step="0.01" class="qa-contribution" data-account="' + escHtml(id) + '" data-predicted="' + predContrib + '" value="0" style="width:120px; text-align:right"></td>' +
        '<td><input type="text" class="qa-notes" data-account="' + escHtml(id) + '" placeholder="" style="width:120px"></td>' +
        '</tr>';
    });

    html += '</tbody></table></div>' +
      '<div style="margin-top:12px; display:flex; gap:12px; align-items:center">' +
      '<button class="btn-add" id="quickAddBtn">Add All Rows</button>' +
      '<span id="quickAddStatus" style="font-size:13px; color:var(--text-secondary)"></span>' +
      '</div>';
  }
  html += '</div>';

  // Single row add (collapsed by default)
  html += '<details class="add-form-card" style="cursor:pointer">' +
    '<summary class="add-form-title" style="margin-bottom:0">Add Single Row</summary>' +
    '<div class="add-form-row" style="margin-top:12px">' +
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
    '</div></details>';

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

  // Bind Quick Add button
  var quickAddBtn = document.getElementById('quickAddBtn');
  if (quickAddBtn) {
    quickAddBtn.addEventListener('click', addQuickMonth);
  }

  // Bind Auto-Fill button
  var autoFillBtn = document.getElementById('autoFillBtn');
  if (autoFillBtn) {
    autoFillBtn.addEventListener('click', autoFillPredictions);
  }
}

// --- Quick Add Helpers ---

function getLastMonthData() {
  var months = [];
  AdminState.data.forEach(function(r) { if (months.indexOf(r.month) === -1) months.push(r.month); });
  months.sort();
  var lastMonth = months.length ? months[months.length - 1] : null;
  var result = {};
  if (lastMonth) {
    AdminState.data.forEach(function(r) {
      if (r.month === lastMonth) result[r.account_id] = r.end_value;
    });
  }
  return result;
}

// Predict next month values from recent history (last 3 months)
function getPredictions() {
  var months = [];
  AdminState.data.forEach(function(r) { if (months.indexOf(r.month) === -1) months.push(r.month); });
  months.sort();
  if (months.length < 2) return {};

  var recentMonths = months.slice(-3); // last 3 months
  var predictions = {};

  AdminState.accounts.forEach(function(a) {
    var id = a.account_id;
    var recent = recentMonths.map(function(m) {
      return AdminState.data.find(function(r) { return r.month === m && r.account_id === id; });
    }).filter(function(r) { return r; });

    if (recent.length < 2) return;

    // Average monthly change in end_value
    var changes = [];
    var contributions = [];
    for (var i = 1; i < recent.length; i++) {
      changes.push(recent[i].end_value - recent[i - 1].end_value);
      contributions.push(recent[i].net_contribution || 0);
    }
    var avgChange = changes.reduce(function(s, v) { return s + v; }, 0) / changes.length;
    var avgContrib = contributions.reduce(function(s, v) { return s + v; }, 0) / contributions.length;
    var lastValue = recent[recent.length - 1].end_value;

    predictions[id] = {
      predictedValue: Math.round((lastValue + avgChange) * 100) / 100,
      predictedContribution: Math.round(avgContrib * 100) / 100,
      avgChange: avgChange
    };
  });

  return predictions;
}

function autoFillPredictions() {
  var filled = 0;
  document.querySelectorAll('.qa-end-value').forEach(function(input) {
    if (!input.value && input.dataset.predicted) {
      input.value = input.dataset.predicted;
      input.classList.add('autofilled');
      filled++;
    }
  });
  document.querySelectorAll('.qa-contribution').forEach(function(input) {
    var predicted = parseFloat(input.dataset.predicted);
    if (!isNaN(predicted) && predicted !== 0 && (input.value === '' || input.value === '0')) {
      input.value = predicted;
      input.classList.add('autofilled');
    }
  });

  var statusEl = document.getElementById('quickAddStatus');
  if (statusEl) {
    statusEl.textContent = filled ? filled + ' fields auto-filled from predictions. Review and adjust.' : 'All fields already have values.';
    statusEl.style.color = 'var(--primary)';
  }

  // Remove autofilled indicator on manual edit
  document.querySelectorAll('.autofilled').forEach(function(input) {
    input.addEventListener('input', function() {
      this.classList.remove('autofilled');
    }, { once: true });
  });
}

function formatQuickAddNum(val) {
  return val.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function addQuickMonth() {
  var monthInput = document.getElementById('quickAddMonth');
  var month = monthInput.value.trim();
  var statusEl = document.getElementById('quickAddStatus');

  if (!/^\d{4}-\d{2}$/.test(month)) {
    monthInput.classList.add('input-error');
    statusEl.textContent = 'Month must be YYYY-MM format.';
    statusEl.style.color = 'var(--negative)';
    return;
  }
  monthInput.classList.remove('input-error');

  var acctIds = AdminState.accounts.map(function(a) { return a.account_id; });
  var rows = [];
  var errors = [];

  acctIds.forEach(function(id) {
    var endValInput = document.querySelector('.qa-end-value[data-account="' + id + '"]');
    var contribInput = document.querySelector('.qa-contribution[data-account="' + id + '"]');
    var notesInput = document.querySelector('.qa-notes[data-account="' + id + '"]');
    var endValue = parseFloat(endValInput.value);
    var contribution = parseFloat(contribInput.value);

    endValInput.classList.remove('input-error');

    if (isNaN(endValue)) {
      endValInput.classList.add('input-error');
      errors.push(id + ': end value required');
      return;
    }
    if (isNaN(contribution)) contribution = 0;

    var dup = AdminState.data.some(function(r) { return r.month === month && r.account_id === id; });
    if (dup) {
      errors.push(id + ': already exists for ' + month);
      return;
    }

    rows.push({
      month: month,
      account_id: id,
      end_value: endValue,
      net_contribution: contribution,
      notes: (notesInput.value || '').trim()
    });
  });

  if (errors.length) {
    statusEl.textContent = errors.join('; ');
    statusEl.style.color = 'var(--negative)';
    return;
  }

  rows.forEach(function(r) { AdminState.data.push(r); });
  markDirty();
  renderMonthEnd();
  showToast(rows.length + ' rows added for ' + month);
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
      budgetItems: AdminState.budgetItems,
      milestones: AdminState.milestones
    };
    if (AdminState.mortgage) {
      updated.mortgage = AdminState.mortgage;
    }

    // --- DB MODE: use StorageManager ---
    if (AdminState.storageMode === 'db') {
      var result = await StorageManager.save(updated);
      // Also stash to session for fast page navigation
      var dbStash = {
        decryptedData: updated,
        storageMode: 'db',
        passphrase: null,
        wasEncrypted: false,
        originalFileText: null,
        filename: null
      };
      FileManager.stashToSession(dbStash);

      AdminState.dirty = false;
      document.querySelector('.dirty-indicator').classList.remove('visible');
      var toastMsg = result.offline
        ? 'Saved offline (' + result.upserted + ' updated, ' + result.deleted + ' deleted) — will sync when online'
        : 'Synced (' + result.upserted + ' updated, ' + result.deleted + ' deleted)';
      showToast(toastMsg);
    } else {
      // --- FILE MODE: existing flow ---

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
    }
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

// --- Admin Cloud Auth ---

function adminShowAuthScreen() {
  document.getElementById('unlock').style.display = 'none';
  document.getElementById('adminApp').style.display = 'none';
  document.getElementById('authScreen').style.display = '';
}

function adminShowUnlockScreen() {
  var authScreen = document.getElementById('authScreen');
  if (authScreen) authScreen.style.display = 'none';
  document.getElementById('adminApp').style.display = 'none';
  document.getElementById('unlock').style.display = '';
}

// "Use cloud sync instead" link
(function() {
  var cloudLink = document.getElementById('useCloudLink');
  if (cloudLink) {
    cloudLink.addEventListener('click', function(e) {
      e.preventDefault();
      if (!AppConfig.SUPABASE_URL || !AppConfig.SUPABASE_ANON_KEY) {
        alert('Cloud sync not configured. Set values in js/config.js.');
        return;
      }
      adminShowAuthScreen();
    });
  }
})();

// "Use local file instead" link
(function() {
  var fileLink = document.getElementById('useFileLink');
  if (fileLink) {
    fileLink.addEventListener('click', function(e) {
      e.preventDefault();
      if (typeof StorageManager !== 'undefined') StorageManager.setMode('file');
      adminShowUnlockScreen();
    });
  }
})();

// Sign In button (admin)
(function() {
  var signInBtn = document.getElementById('signInBtn');
  if (!signInBtn) return;
  signInBtn.addEventListener('click', async function() {
    var email = document.getElementById('authEmail').value.trim();
    var pass = document.getElementById('authPassphrase').value;
    var errorEl = document.getElementById('authError');
    errorEl.textContent = '';

    if (!email || !pass) { errorEl.textContent = 'Please enter email and passphrase.'; return; }

    signInBtn.disabled = true;
    signInBtn.textContent = 'Signing in...';
    try {
      StorageManager.init('db');
      await StorageManager.signIn(email, pass);
      var data = await StorageManager.load();
      AdminState.storageMode = 'db';
      loadAdminData(data);
      showAdmin();
    } catch (e) {
      errorEl.textContent = e.message || 'Sign in failed.';
      signInBtn.disabled = false;
      signInBtn.textContent = 'Sign In';
    }
  });
})();

// Sign Up button (admin)
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

    signUpBtn.disabled = true;
    signUpBtn.textContent = 'Creating...';
    try {
      StorageManager.init('db');
      var result = await StorageManager.signUp(email, pass);
      if (result.needsConfirmation) {
        errorEl.style.color = '#137333';
        errorEl.textContent = 'Account created! Check your email to confirm, then sign in.';
        signUpBtn.disabled = false;
        signUpBtn.textContent = 'Create Account';
        return;
      }
      var data = await StorageManager.load();
      AdminState.storageMode = 'db';
      loadAdminData(data);
      showAdmin();
    } catch (e) {
      errorEl.style.color = '';
      errorEl.textContent = e.message || 'Sign up failed.';
      signUpBtn.disabled = false;
      signUpBtn.textContent = 'Create Account';
    }
  });
})();

// Enter in auth passphrase
(function() {
  var authPass = document.getElementById('authPassphrase');
  if (authPass) {
    authPass.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') document.getElementById('signInBtn').click();
    });
  }
})();

// Export current admin data as .xlsx
function exportDataXlsx() {
  try {
    var data = {
      config: AdminState.config,
      accounts: AdminState.accounts,
      data: AdminState.data,
      budgetItems: AdminState.budgetItems,
      milestones: AdminState.milestones,
      mortgage: AdminState.mortgage
    };
    DataExport.exportXLSX(data);
    showToast('Exported to fi-dashboard-export.xlsx');
  } catch (e) {
    alert('Export failed: ' + e.message);
  }
}

// Import from .fjson into DB (admin)
async function importFileToDb() {
  try {
    var result = await FileManager.open();
    var fileData = JSON.parse(result.text);
    var decrypted;

    if (fileData.config && fileData.accounts && fileData.data && !fileData.v) {
      decrypted = fileData;
    } else {
      var pp = prompt('Enter file passphrase:');
      if (!pp) return;
      decrypted = await Crypto.decrypt(fileData, pp);
    }

    await StorageManager.importFromDecrypted(decrypted);
    loadAdminData(decrypted);
    renderActiveTab();
    showToast('Imported ' + (decrypted.data || []).length + ' month-end records to cloud');
  } catch (e) {
    if (e.name !== 'AbortError' && e.message !== 'File selection cancelled') {
      alert('Import failed: ' + e.message);
    }
  }
}

// Export from DB to .fjson (admin)
async function exportDbToFile() {
  try {
    var data = await StorageManager.exportData();
    var pp = prompt('Enter passphrase for exported file:');
    if (!pp) return;

    var encrypted = await Crypto.encrypt(data, pp);
    var output = JSON.stringify(encrypted);
    var filename = 'fi-data-export.fjson';

    // Download
    var blob = new Blob([output], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    showToast('Exported to ' + filename);
  } catch (e) {
    alert('Export failed: ' + e.message);
  }
}

// Auto-restore: DB session → sessionStorage → IndexedDB → unlock/auth screen
(async function() {
  var persistedMode = (typeof StorageManager !== 'undefined') ? StorageManager.getPersistedMode() : 'file';

  function restoreFromSession(session) {
    AdminState.originalFileText = session.originalFileText || null;
    AdminState.filename = session.filename || null;
    AdminState.wasEncrypted = !!session.wasEncrypted;
    AdminState.passphrase = session.passphrase || null;
    AdminState.storageMode = session.storageMode || 'file';
    loadAdminData(session.decryptedData);
    showAdmin();
  }

  // 0. DB mode: try restoring Supabase session
  if (persistedMode === 'db' && typeof StorageManager !== 'undefined' && AppConfig.SUPABASE_URL && AppConfig.SUPABASE_ANON_KEY) {
    try {
      StorageManager.init('db');
      var hasSession = await StorageManager.hasSession();
      if (hasSession) {
        // Try sessionStorage for cached data
        var sessionData = FileManager.loadFromSession();
        if (sessionData && sessionData.decryptedData && sessionData.storageMode === 'db') {
          AdminState.storageMode = 'db';
          loadAdminData(sessionData.decryptedData);
          showAdmin();
          return;
        }
        // Need passphrase — show auth
        adminShowAuthScreen();
        return;
      }
    } catch (e) { /* fall through */ }
    adminShowAuthScreen();
    return;
  }

  // 1. Try sessionStorage (file mode)
  var session = FileManager.loadFromSession();
  if (session && session.decryptedData && (!session.storageMode || session.storageMode === 'file')) {
    restoreFromSession(session);
    return;
  }

  // 2. Try IndexedDB (file mode)
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

  // 3. Show unlock screen (first visit, file mode)
})();

// Flush pending DB sync when coming back online
window.addEventListener('online', function() {
  if (typeof StorageManager !== 'undefined' && StorageManager.mode === 'db') {
    StorageManager.flushPendingSync().then(function(result) {
      if (result && result.flushed > 0) {
        showToast('Synced ' + result.flushed + ' pending change' + (result.flushed > 1 ? 's' : ''));
      }
    }).catch(function() {});
  }
});
