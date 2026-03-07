// === DATA-EXPORT — Plaintext XLSX Export for Migration ===
// Exports all dashboard data as a multi-sheet XLSX workbook.
// Uses SheetJS (xlsx) loaded from CDN. No encryption — plaintext for portability.
//
// Sheet structure mirrors the Personal Finances Dashboard.xlsx:
//   Config     — key/value pairs with descriptions
//   Accounts   — account definitions
//   MonthEnd   — month-end balances (the core data)
//   Budget     — budget line items
//   Planner    — funding goals and priorities
//   Milestones — milestone targets with sub-targets
//   Mortgage   — mortgage parameters, payments, and valuations

var DataExport = (function() {

  // Build a workbook from the full data object.
  // data: { config, accounts, data, budgetItems, plannerGoals, milestones, mortgage }
  function buildWorkbook(data) {
    if (typeof XLSX === 'undefined') {
      throw new Error('SheetJS (XLSX) library not loaded. Cannot export.');
    }

    var wb = XLSX.utils.book_new();

    // --- Config sheet ---
    var configRows = [['key', 'value', 'description']];
    var CONFIG_DESCRIPTIONS = {
      fi_target: 'Financial Independence target (EUR)',
      withdrawal_rate: 'Safe withdrawal rate (4% = 0.04)',
      expected_return: 'Expected annual return for projections (5% = 0.05)',
      monthly_income: 'Monthly net income after taxes (EUR)',
      emergency_fund_target: 'Target amount for emergency fund reserve (EUR)',
      house_downpayment_target: 'Target amount for house down payment goal (EUR)',
      auto_export: 'Auto-download .fjson on every save (1 = on, 0 = off)'
    };
    var config = data.config || {};
    var configKeys = Object.keys(config).sort();
    for (var i = 0; i < configKeys.length; i++) {
      var k = configKeys[i];
      configRows.push([k, config[k], CONFIG_DESCRIPTIONS[k] || '']);
    }
    var wsConfig = XLSX.utils.aoa_to_sheet(configRows);
    wsConfig['!cols'] = [{ wch: 28 }, { wch: 15 }, { wch: 55 }];
    XLSX.utils.book_append_sheet(wb, wsConfig, 'Config');

    // --- Accounts sheet ---
    var accountRows = [['account_id', 'account_name', 'type', 'currency', 'include_networth', 'include_performance', 'emergency_fund_role', 'cashflow_role']];
    var accounts = data.accounts || [];
    for (var a = 0; a < accounts.length; a++) {
      var acc = accounts[a];
      accountRows.push([
        acc.account_id,
        acc.account_name,
        acc.type,
        acc.currency || 'EUR',
        acc.include_networth !== false,
        acc.include_performance === true,
        acc.emergency_fund_role || 'none',
        acc.cashflow_role || 'none'
      ]);
    }
    var wsAccounts = XLSX.utils.aoa_to_sheet(accountRows);
    wsAccounts['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 8 }, { wch: 10 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsAccounts, 'Accounts');

    // --- MonthEnd sheet ---
    var monthRows = [['month', 'account_id', 'end_value', 'net_contribution', 'notes']];
    var monthData = (data.data || []).slice().sort(function(x, y) {
      if (x.month !== y.month) return x.month < y.month ? -1 : 1;
      return (x.account_id || '').localeCompare(y.account_id || '');
    });
    for (var m = 0; m < monthData.length; m++) {
      var row = monthData[m];
      monthRows.push([
        row.month,
        row.account_id,
        row.end_value,
        row.net_contribution,
        row.notes || ''
      ]);
    }
    var wsMonth = XLSX.utils.aoa_to_sheet(monthRows);
    wsMonth['!cols'] = [{ wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsMonth, 'MonthEnd');

    // --- Budget sheet ---
    var budgetRows = [['item_id', 'name', 'type', 'amount', 'frequency', 'category', 'active']];
    var budgetItems = data.budgetItems || [];
    for (var b = 0; b < budgetItems.length; b++) {
      var bi = budgetItems[b];
      budgetRows.push([
        bi.item_id,
        bi.name,
        bi.type,
        bi.amount,
        bi.frequency,
        bi.category || '',
        bi.active !== false
      ]);
    }
    var wsBudget = XLSX.utils.aoa_to_sheet(budgetRows);
    wsBudget['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, wsBudget, 'Budget');

    // --- Planner goals sheet ---
    var plannerRows = [['goal_id', 'name', 'target_amount', 'current_amount', 'target_date', 'priority', 'active', 'track_current_from_accounts', 'funding_accounts_csv']];
    var plannerGoals = data.plannerGoals || [];
    for (var pg = 0; pg < plannerGoals.length; pg++) {
      var g = plannerGoals[pg];
      plannerRows.push([
        g.goal_id,
        g.name || '',
        g.target_amount || 0,
        g.current_amount || 0,
        g.target_date || '',
        g.priority || 3,
        g.active !== false,
        g.track_current_from_accounts !== false,
        (g.funding_accounts || []).join(',')
      ]);
    }
    var wsPlanner = XLSX.utils.aoa_to_sheet(plannerRows);
    wsPlanner['!cols'] = [{ wch: 18 }, { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 9 }, { wch: 8 }, { wch: 16 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(wb, wsPlanner, 'Planner');

    // --- Milestones sheet ---
    // Flattened: one row per sub-target, milestone fields repeated
    var msRows = [['milestone_id', 'name', 'target_date', 'total_target', 'sub_goal', 'sub_amount']];
    var milestones = data.milestones || [];
    for (var ms = 0; ms < milestones.length; ms++) {
      var mi = milestones[ms];
      var subs = mi.sub_targets || [];
      if (subs.length === 0) {
        msRows.push([mi.milestone_id, mi.name || '', mi.target_date || '', mi.total_target || 0, '', 0]);
      } else {
        for (var s = 0; s < subs.length; s++) {
          msRows.push([
            mi.milestone_id,
            mi.name || '',
            mi.target_date || '',
            mi.total_target || 0,
            subs[s].goal || '',
            subs[s].amount || 0
          ]);
        }
      }
    }
    var wsMilestones = XLSX.utils.aoa_to_sheet(msRows);
    wsMilestones['!cols'] = [{ wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsMilestones, 'Milestones');

    // --- Mortgage sheet (3 sections) ---
    if (data.mortgage) {
      var mort = data.mortgage;
      var mortRows = [];

      // Section A: Parameters
      mortRows.push(['=== Mortgage Parameters ===']);
      mortRows.push(['key', 'value']);
      mortRows.push(['principal', mort.principal || 0]);
      mortRows.push(['annual_rate', mort.annual_rate || 0]);
      mortRows.push(['term_years', mort.term_years || 0]);
      mortRows.push(['start_date', mort.start_date || '']);
      mortRows.push([]);

      // Section B: Extra Payments
      mortRows.push(['=== Extra Payments ===']);
      mortRows.push(['date', 'amount', 'strategy']);
      var extras = mort.extra_payments || [];
      for (var e = 0; e < extras.length; e++) {
        mortRows.push([extras[e].date, extras[e].amount, extras[e].strategy]);
      }
      if (extras.length === 0) mortRows.push(['(none)', '', '']);
      mortRows.push([]);

      // Section C: Actual Payments
      mortRows.push(['=== Actual Payments ===']);
      mortRows.push(['month', 'amount', 'principal_paid', 'interest_paid', 'notes']);
      var actuals = mort.actual_payments || [];
      for (var ap = 0; ap < actuals.length; ap++) {
        mortRows.push([actuals[ap].month, actuals[ap].amount, actuals[ap].principal_paid, actuals[ap].interest_paid, actuals[ap].notes || '']);
      }
      if (actuals.length === 0) mortRows.push(['(none)', '', '', '', '']);
      mortRows.push([]);

      // Section D: House Valuations
      mortRows.push(['=== House Valuations ===']);
      mortRows.push(['date', 'market_value']);
      var vals = mort.house_valuations || [];
      for (var v = 0; v < vals.length; v++) {
        mortRows.push([vals[v].date, vals[v].market_value]);
      }
      if (vals.length === 0) mortRows.push(['(none)', '']);

      var wsMortgage = XLSX.utils.aoa_to_sheet(mortRows);
      wsMortgage['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, wsMortgage, 'Mortgage');
    }

    return wb;
  }

  // Export data as XLSX and trigger download.
  function exportXLSX(data, filename) {
    filename = filename || 'fi-dashboard-export.xlsx';
    var wb = buildWorkbook(data);
    XLSX.writeFile(wb, filename);
  }

  return {
    buildWorkbook: buildWorkbook,
    exportXLSX: exportXLSX
  };
})();
