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
  // Build a lookup mapping account_id patterns to subcategory names for matching.
  // E.g., INDEXA -> "indexa capital", IBKR -> "interactive brokers"
  _matchesAccount: function(text, acctId) {
    if (!text || !acctId) return false;
    var t = text.toLowerCase();
    var id = acctId.toLowerCase();
    // Direct match
    if (t.indexOf(id) >= 0) return true;
    // Underscore/hyphen variants
    if (t.indexOf(id.replace(/_/g, ' ')) >= 0) return true;
    if (t.indexOf(id.replace(/_/g, '-')) >= 0) return true;
    // Common abbreviation mappings
    if (id === 'ibkr' && t.indexOf('interactive brokers') >= 0) return true;
    if (id === 'indexa' && t.indexOf('indexa capital') >= 0) return true;
    return false;
  },

  computeMonth: function(options) {
    var month = options.month;
    var cashflowMonth = options.cashflowMonth;       // from CashflowCalculator.computeMonth()
    var provisionLedger = options.provisionLedger;    // from computeProvisionLedger()
    var goals = options.goals || [];                  // planner goals with monthly_contribution
    var monthEntries = options.monthEntries || [];    // raw cashflow entries for this month

    var income = cashflowMonth ? cashflowMonth.totalIncome : 0;
    var operatingExpenses = cashflowMonth ? cashflowMonth.totalExpenses : 0;
    var annualProvision = provisionLedger ? provisionLedger.monthlyProvision : 0;

    // Goal contributions: match raw entries (type=expense, transfer-classified categories)
    // against goal funding account IDs via subcategory names
    var goalContributions = 0;
    var goalContributionDetails = [];
    var self = this;

    for (var i = 0; i < goals.length; i++) {
      var g = goals[i];
      var planned = g.monthly_contribution || 0;
      if (planned <= 0) continue;

      var actual = 0;
      var fundingAccounts = g.funding_accounts || [];

      // Scan raw entries for matches against funding account IDs
      for (var j = 0; j < monthEntries.length; j++) {
        var entry = monthEntries[j];
        if (entry.type !== 'expense') continue;

        // Check subcategory and category against each funding account
        var subcat = (entry.subcategory || '').toLowerCase();
        var cat = (entry.category || '').toLowerCase();
        var entryId = (entry.entry_id || '').toLowerCase();

        for (var k = 0; k < fundingAccounts.length; k++) {
          if (self._matchesAccount(subcat, fundingAccounts[k]) ||
              self._matchesAccount(entryId, fundingAccounts[k])) {
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

    // Index entries by month
    var entriesByMonth = {};
    for (var j = 0; j < allEntries.length; j++) {
      var e = allEntries[j];
      if (!entriesByMonth[e.month]) entriesByMonth[e.month] = [];
      entriesByMonth[e.month].push(e);
    }

    var results = [];
    for (var i = 0; i < months.length; i++) {
      var month = months[i];
      results.push(this.computeMonth({
        month: month,
        cashflowMonth: cashflowMonths[month] || null,
        provisionLedger: provisionLedger,
        goals: goals,
        monthEntries: entriesByMonth[month] || []
      }));
    }

    return results;
  },

  // Decompose a transactional account balance into earmarked portions.
  // Returns: {
  //   accountBalance, mortgageEarmark, provisionReserve, availableCash,
  //   availableCashStatus
  // }
  decomposeBalance: function(options) {
    var accountBalance = options.accountBalance || 0;
    var mortgageTarget = options.mortgageTarget || 0;
    var otherFundingBalance = options.otherFundingBalance || 0; // e.g., Arras account
    var provisionBalance = options.provisionBalance || 0;

    var mortgageEarmark = Math.max(0, mortgageTarget - otherFundingBalance);
    var provisionReserve = Math.max(0, provisionBalance);
    var availableCash = Math.round((accountBalance - mortgageEarmark - provisionReserve) * 100) / 100;

    return {
      accountBalance: accountBalance,
      mortgageEarmark: mortgageEarmark,
      provisionReserve: provisionReserve,
      availableCash: availableCash,
      availableCashStatus: ValueStatus.sign(availableCash)
    };
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
