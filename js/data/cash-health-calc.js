// === CASH HEALTH CALCULATOR ===
// Computes monthly cash health: income vs obligations (operating expenses +
// annual provisions + goal contributions). Tracks provision accrual for
// yearly budget items and decomposes the transactional account balance.
// Pure functions, no DOM access.

var CashHealthCalculator = {

  // Compute the monthly provision amount for all yearly budget items.
  // Returns: number (total monthly provision = sum of yearly amounts / 12)
  computeMonthlyProvision: function(budgetItems) {
    var total = 0;
    for (var i = 0; i < budgetItems.length; i++) {
      var item = budgetItems[i];
      if (!item.active || item.frequency !== 'yearly') continue;
      total += Math.round(item.amount / 12 * 100) / 100;
    }
    return total;
  },

  // Build a provision ledger: running balance per yearly budget item over time.
  // Each month accrues 1/12 of the annual amount. When the actual charge hits
  // (matched by category in cashflow entries), the balance is debited.
  //
  // budgetItems: array with { item_id, name, amount, frequency, category, due_month, active }
  // cashflowEntries: array with { month, type, category, amount }
  // months: sorted array of YYYY-MM strings to compute over
  //
  // Returns: {
  //   items: [{ item_id, name, annualAmount, monthlyAccrual, due_month, balanceByMonth: { YYYY-MM: number } }],
  //   totalByMonth: { YYYY-MM: number },
  //   monthlyProvision: number
  // }
  computeProvisionLedger: function(budgetItems, cashflowEntries, months) {
    var yearlyItems = [];
    for (var i = 0; i < budgetItems.length; i++) {
      var b = budgetItems[i];
      if (!b.active || b.frequency !== 'yearly') continue;
      yearlyItems.push({
        item_id: b.item_id,
        name: b.name,
        annualAmount: b.amount,
        monthlyAccrual: Math.round(b.amount / 12 * 100) / 100,
        due_month: b.due_month || null,
        category: b.category || '',
        balanceByMonth: {}
      });
    }

    // Index cashflow expenses by month+category for matching
    var expenseIndex = {};
    for (var j = 0; j < cashflowEntries.length; j++) {
      var e = cashflowEntries[j];
      if (e.type !== 'expense') continue;
      var key = e.month + '|' + (e.category || '').toLowerCase();
      expenseIndex[key] = (expenseIndex[key] || 0) + e.amount;
    }

    var totalByMonth = {};
    var monthlyProvision = 0;

    for (var k = 0; k < yearlyItems.length; k++) {
      monthlyProvision += yearlyItems[k].monthlyAccrual;
    }

    for (var m = 0; m < months.length; m++) {
      var month = months[m];
      var monthNum = parseInt(month.split('-')[1], 10);
      var totalBalance = 0;

      for (var n = 0; n < yearlyItems.length; n++) {
        var item = yearlyItems[n];
        // Get previous balance
        var prevBalance = 0;
        if (m > 0) {
          prevBalance = item.balanceByMonth[months[m - 1]] || 0;
        }

        // Accrue
        var balance = prevBalance + item.monthlyAccrual;

        // Check if this is the due month — debit the annual amount
        if (item.due_month && monthNum === item.due_month) {
          // Match against actual expense if available
          var catKey = month + '|' + item.category.toLowerCase();
          var actualCharge = expenseIndex[catKey];
          if (actualCharge && actualCharge > 0) {
            // Use actual charge amount (may differ from budgeted)
            balance -= actualCharge;
          } else {
            // No actual found — debit budgeted amount
            balance -= item.annualAmount;
          }
        }

        balance = Math.round(balance * 100) / 100;
        item.balanceByMonth[month] = balance;
        totalBalance += balance;
      }

      totalByMonth[month] = Math.round(totalBalance * 100) / 100;
    }

    return {
      items: yearlyItems,
      totalByMonth: totalByMonth,
      monthlyProvision: monthlyProvision
    };
  },

  // Compute cash health for a single month.
  // Returns: {
  //   month, income, operatingExpenses, annualProvision, goalContributions,
  //   goalContributionDetails: [{ name, planned, actual }],
  //   surplus, surplusStatus,
  //   provisionBalance, provisionItems: [{ name, balance, due_month, annualAmount, status }]
  // }
  // Build a lookup from account_id to all matchable names (id, name, variants).
  // accounts: array of { account_id, account_name, ... }
  // Returns: { account_id_lower: [name1_lower, name2_lower, ...] }
  _buildAccountNameMap: function(accounts) {
    var map = {};
    for (var i = 0; i < accounts.length; i++) {
      var a = accounts[i];
      var id = (a.account_id || '').toLowerCase();
      if (!id) continue;
      var names = [id];
      // Add underscore/hyphen variants of the ID
      if (id.indexOf('_') >= 0) {
        names.push(id.replace(/_/g, ' '));
        names.push(id.replace(/_/g, '-'));
      }
      // Add account_name if present
      var name = (a.account_name || '').toLowerCase();
      if (name && names.indexOf(name) < 0) names.push(name);
      map[id] = names;
    }
    return map;
  },

  // Check if text matches any known name for the given account_id.
  // accountNameMap: from _buildAccountNameMap()
  _matchesAccount: function(text, acctId, accountNameMap) {
    if (!text || !acctId) return false;
    var t = text.toLowerCase();
    var id = acctId.toLowerCase();
    var names = accountNameMap[id];
    if (!names) {
      // Fallback: direct substring match on ID itself
      return t.indexOf(id) >= 0;
    }
    for (var i = 0; i < names.length; i++) {
      if (t.indexOf(names[i]) >= 0) return true;
    }
    return false;
  },

  computeMonth: function(options) {
    var month = options.month;
    var cashflowMonth = options.cashflowMonth;       // from CashflowCalculator.computeMonth()
    var provisionLedger = options.provisionLedger;    // from computeProvisionLedger()
    var goals = options.goals || [];                  // planner goals with monthly_contribution
    var monthEntries = options.monthEntries || [];    // raw cashflow entries for this month
    var categories = options.categories || [];        // cashflow categories (for classification lookup)
    var accounts = options.accounts || [];            // accounts config (for account_id → account_name mapping)

    var income = cashflowMonth ? cashflowMonth.totalIncome : 0;
    var operatingExpenses = cashflowMonth ? cashflowMonth.totalExpenses : 0;
    var annualProvision = provisionLedger ? provisionLedger.monthlyProvision : 0;

    // Build set of transfer-classified category IDs from categories config.
    // Categories with classification === 'transfer' are investment/internal transfers.
    var transferCategoryIds = {};
    for (var ci = 0; ci < categories.length; ci++) {
      if (categories[ci].classification === 'transfer') {
        transferCategoryIds[categories[ci].category_id] = true;
      }
    }

    // Helper: check if an entry belongs to a transfer-classified category
    function isTransferEntry(entry) {
      return !!transferCategoryIds[entry.category_id];
    }

    // Build account name map for matching entry subcategories to funding account IDs
    var accountNameMap = this._buildAccountNameMap(accounts);

    // Goal contributions: only match entries from transfer-classified categories
    // (Investing, Internal Transfer) against goal funding account IDs
    var goalContributions = 0;
    var goalContributionDetails = [];
    var self = this;

    for (var i = 0; i < goals.length; i++) {
      var g = goals[i];
      var planned = g.monthly_contribution || 0;
      if (planned <= 0) continue;

      var actual = 0;
      var fundingAccounts = g.funding_accounts || [];

      // Scan only transfer-classified entries for matches
      for (var j = 0; j < monthEntries.length; j++) {
        var entry = monthEntries[j];
        if (entry.type !== 'expense') continue;
        // Only consider transfer-classified categories (Investing, Internal Transfer)
        if (!isTransferEntry(entry)) continue;

        var subcat = (entry.subcategory || '').toLowerCase();
        var entryId = (entry.entry_id || '').toLowerCase();

        for (var k = 0; k < fundingAccounts.length; k++) {
          if (self._matchesAccount(subcat, fundingAccounts[k], accountNameMap) ||
              self._matchesAccount(entryId, fundingAccounts[k], accountNameMap)) {
            actual += entry.amount || 0;
            break; // avoid double counting
          }
        }
      }

      actual = Math.round(actual * 100) / 100;
      goalContributions += actual;

      goalContributionDetails.push({
        goal_id: g.goal_id,
        name: g.name,
        planned: planned,
        actual: actual,
        delta: Math.round((actual - planned) * 100) / 100,
        deltaStatus: ValueStatus.signInverse(actual - planned)
      });
    }

    var surplus = Math.round((income - operatingExpenses - annualProvision - goalContributions) * 100) / 100;

    // Provision item details for the selected month
    var provisionItems = [];
    if (provisionLedger) {
      var monthNum = parseInt(month.split('-')[1], 10);
      for (var p = 0; p < provisionLedger.items.length; p++) {
        var pi = provisionLedger.items[p];
        var balance = pi.balanceByMonth[month] || 0;
        var status = 'on_track';
        if (pi.due_month) {
          var monthsUntilDue = pi.due_month - monthNum;
          if (monthsUntilDue <= 0) monthsUntilDue += 12;
          var needed = pi.annualAmount;
          // If balance + remaining accruals won't cover it, flag as at_risk
          var projectedAtDue = balance + (pi.monthlyAccrual * monthsUntilDue);
          if (projectedAtDue < needed * 0.9) {
            status = 'at_risk';
          }
          if (monthsUntilDue <= 2 && balance < needed * 0.8) {
            status = 'at_risk';
          }
        } else {
          status = 'no_due_date';
        }

        provisionItems.push({
          item_id: pi.item_id,
          name: pi.name,
          annualAmount: pi.annualAmount,
          monthlyAccrual: pi.monthlyAccrual,
          balance: balance,
          due_month: pi.due_month,
          status: status
        });
      }
    }

    var provisionBalance = provisionLedger ? (provisionLedger.totalByMonth[month] || 0) : 0;

    return {
      month: month,
      income: income,
      operatingExpenses: operatingExpenses,
      annualProvision: annualProvision,
      goalContributions: goalContributions,
      goalContributionDetails: goalContributionDetails,
      surplus: surplus,
      surplusStatus: ValueStatus.sign(surplus),
      provisionBalance: provisionBalance,
      provisionItems: provisionItems
    };
  },

  // Compute cash health for all months.
  // Returns array of computeMonth results sorted by month.
  computeAllMonths: function(options) {
    var months = options.months || [];
    var cashflowMonths = options.cashflowMonths || {};  // keyed by month
    var provisionLedger = options.provisionLedger;
    var goals = options.goals || [];
    var allEntries = options.allEntries || [];
    var categories = options.categories || [];
    var accounts = options.accounts || [];

    // Index entries by month
    var entriesByMonth = {};
    for (var j = 0; j < allEntries.length; j++) {
      var e = allEntries[j];
      if (!entriesByMonth[e.month]) entriesByMonth[e.month] = [];
      entriesByMonth[e.month].push(e);
    }

    var results = [];
    var cumulative = 0;
    for (var i = 0; i < months.length; i++) {
      var month = months[i];
      var result = this.computeMonth({
        month: month,
        cashflowMonth: cashflowMonths[month] || null,
        provisionLedger: provisionLedger,
        goals: goals,
        monthEntries: entriesByMonth[month] || [],
        categories: categories,
        accounts: accounts
      });
      cumulative += result.surplus;
      result.cumulativeSurplus = Math.round(cumulative * 100) / 100;
      result.cumulativeSurplusStatus = ValueStatus.sign(cumulative);
      results.push(result);
    }

    return results;
  },

  // Decompose a transactional account balance into earmarked portions.
  // goalEarmarkTarget: total target amount for goals funded from this account
  // otherFundingBalance: balance held in non-transactional funding accounts for those goals
  // Returns: {
  //   accountBalance, goalEarmark, provisionReserve, availableCash,
  //   availableCashStatus
  // }
  decomposeBalance: function(options) {
    var accountBalance = options.accountBalance || 0;
    var goalEarmarkTarget = options.goalEarmarkTarget || 0;
    var otherFundingBalance = options.otherFundingBalance || 0;
    var provisionBalance = options.provisionBalance || 0;

    var goalEarmark = Math.max(0, goalEarmarkTarget - otherFundingBalance);
    var provisionReserve = Math.max(0, provisionBalance);
    var availableCash = Math.round((accountBalance - goalEarmark - provisionReserve) * 100) / 100;

    return {
      accountBalance: accountBalance,
      goalEarmark: goalEarmark,
      provisionReserve: provisionReserve,
      availableCash: availableCash,
      availableCashStatus: ValueStatus.sign(availableCash)
    };
  },

  // Compute balance decomposition for multiple months.
  // Uses account cashflow_role and goal funding_accounts to identify relevant accounts.
  // monthendData: array of { month, account_id, end_value }
  // accounts: accounts config with cashflow_role
  // goals: planner goals with funding_accounts
  // provisionTotalByMonth: { YYYY-MM: number } from provision ledger
  // Returns: array of { month, accountBalance, goalEarmark, provisionReserve, availableCash, availableCashStatus }
  computeDecompositionSeries: function(options) {
    var months = options.months || [];
    var monthendData = options.monthendData || [];
    var accounts = options.accounts || [];
    var goals = options.goals || [];
    var provisionTotalByMonth = options.provisionTotalByMonth || {};

    // Find transactional accounts (where salary lands, expenses are paid from)
    var transactionalIds = [];
    var transactionalSet = {};
    for (var a = 0; a < accounts.length; a++) {
      if (accounts[a].cashflow_role === 'transactional') {
        transactionalIds.push(accounts[a].account_id);
        transactionalSet[accounts[a].account_id] = true;
      }
    }

    // Find goals whose funding_accounts include a transactional account.
    // These goals create earmarks on the transactional balance.
    var earmarkedGoals = [];
    for (var g = 0; g < goals.length; g++) {
      var goal = goals[g];
      if (goal.active === false) continue;
      var fundingAccts = goal.funding_accounts || [];
      var usesTransactional = false;
      for (var fa = 0; fa < fundingAccts.length; fa++) {
        if (transactionalSet[fundingAccts[fa]]) { usesTransactional = true; break; }
      }
      if (usesTransactional) earmarkedGoals.push(goal);
    }

    // Build per-month balances: { month: { account_id: end_value } }
    var balancesByMonth = {};
    for (var d = 0; d < monthendData.length; d++) {
      var r = monthendData[d];
      if (!r.month || !r.account_id) continue;
      if (!balancesByMonth[r.month]) balancesByMonth[r.month] = {};
      balancesByMonth[r.month][r.account_id] = r.end_value || 0;
    }

    // Sum total earmark target and collect all non-transactional funding accounts
    var totalEarmarkTarget = 0;
    var otherFundingAccountIds = [];
    for (var eg = 0; eg < earmarkedGoals.length; eg++) {
      totalEarmarkTarget += earmarkedGoals[eg].target_amount || 0;
      var efa = earmarkedGoals[eg].funding_accounts || [];
      for (var efi = 0; efi < efa.length; efi++) {
        if (!transactionalSet[efa[efi]] && otherFundingAccountIds.indexOf(efa[efi]) < 0) {
          otherFundingAccountIds.push(efa[efi]);
        }
      }
    }

    var series = [];
    for (var m = 0; m < months.length; m++) {
      var month = months[m];
      var monthBalances = balancesByMonth[month] || {};

      // Sum transactional account balances
      var transactionalBalance = 0;
      for (var t = 0; t < transactionalIds.length; t++) {
        transactionalBalance += monthBalances[transactionalIds[t]] || 0;
      }

      // Sum other funding account balances (non-transactional accounts that fund earmarked goals)
      var otherFundingBalance = 0;
      for (var f = 0; f < otherFundingAccountIds.length; f++) {
        otherFundingBalance += monthBalances[otherFundingAccountIds[f]] || 0;
      }

      var provisionBalance = provisionTotalByMonth[month] || 0;

      var decomp = this.decomposeBalance({
        accountBalance: transactionalBalance,
        goalEarmarkTarget: totalEarmarkTarget,
        otherFundingBalance: otherFundingBalance,
        provisionBalance: provisionBalance
      });
      decomp.month = month;
      series.push(decomp);
    }

    return series;
  },

  // Compute trailing average surplus/deficit.
  computeTrailingHealth: function(healthMonths, trailingCount) {
    trailingCount = trailingCount || 6;
    var recent = healthMonths.slice(-trailingCount);
    if (!recent.length) return null;

    var totalSurplus = 0;
    var deficitMonths = 0;
    for (var i = 0; i < recent.length; i++) {
      totalSurplus += recent[i].surplus;
      if (recent[i].surplus < -0.01) deficitMonths++;
    }

    var avgSurplus = Math.round(totalSurplus / recent.length * 100) / 100;

    return {
      avgSurplus: avgSurplus,
      avgSurplusStatus: ValueStatus.sign(avgSurplus),
      deficitMonths: deficitMonths,
      totalMonths: recent.length,
      trend: deficitMonths > recent.length / 2 ? 'deteriorating' : (deficitMonths === 0 ? 'healthy' : 'mixed')
    };
  }
};
