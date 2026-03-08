// === MONTHLY SUMMARY CALCULATOR ===
// Computes a structured summary of the latest month's changes. Pure math, no DOM access.

var SummaryCalculator = {

  // Main entry: builds a complete monthly summary object.
  // nwData: array from NetWorthCalculator.compute() (needs at least 2 months)
  // allData: raw MonthEnd rows (for per-account contribution breakdown)
  // goals: { emergency: {...}, house: {...} } from GoalsCalculator (optional)
  // milestones: array from MilestoneCalculator.computeAll() (optional)
  // mortgage: mortgage summary from MortgageCalculator (optional)
  computeMonthlySummary: function(nwData, allData, goals, milestones, mortgage) {
    if (!nwData || nwData.length < 2) return null;

    var current = nwData[nwData.length - 1];
    var prev = nwData[nwData.length - 2];
    var month = current.month;

    // --- Net worth change ---
    var nwChange = current.total - prev.total;
    var nwChangePct = prev.total > 0 ? (nwChange / prev.total) * 100 : 0;

    // --- Contributions vs market this month ---
    var monthContributions = 0;
    allData.forEach(function(r) {
      if (r.month === month) monthContributions += (r.net_contribution || 0);
    });
    var marketChange = nwChange - monthContributions;

    // --- Per-account changes (best/worst by absolute change) ---
    var accountIds = Object.keys(current.accounts);
    var accountChanges = [];
    accountIds.forEach(function(id) {
      var curVal = current.accounts[id] || 0;
      var prevVal = prev.accounts[id] || 0;
      var change = curVal - prevVal;
      // Get contribution for this account this month
      var contrib = 0;
      allData.forEach(function(r) {
        if (r.month === month && r.account_id === id) contrib = r.net_contribution || 0;
      });
      var marketPart = change - contrib;
      var changePct = prevVal > 0 ? (change / prevVal) * 100 : 0;
      accountChanges.push({
        id: id,
        name: AccountService.getName(id),
        current: curVal,
        previous: prevVal,
        change: change,
        changePct: changePct,
        contribution: contrib,
        marketChange: marketPart
      });
    });

    // Sort by change descending
    accountChanges.sort(function(a, b) { return b.change - a.change; });
    var best = accountChanges.length ? accountChanges[0] : null;
    var worst = accountChanges.length ? accountChanges[accountChanges.length - 1] : null;
    // Only flag as "worst" if it actually declined
    if (worst && worst.change >= 0) worst = null;

    // --- Goal status summary ---
    var goalsSummary = [];
    if (goals) {
      if (goals.emergency) {
        goalsSummary.push({
          name: 'Emergency Fund',
          status: goals.emergency.status,
          pct: goals.emergency.pct
        });
      }
      if (goals.house) {
        var housePct = goals.house.pct;
        var houseStatus = housePct >= 100 ? 'green' : (housePct >= 75 ? 'yellow' : 'red');
        goalsSummary.push({
          name: 'House Down Payment',
          status: houseStatus,
          pct: housePct
        });
      }
    }

    // --- Milestone status summary ---
    var milestoneSummary = [];
    if (milestones && milestones.length) {
      milestones.forEach(function(m) {
        milestoneSummary.push({
          name: m.name,
          status: m.status,
          progressPct: m.progressPct,
          monthsLeft: m.monthsLeft
        });
      });
    }

    // --- Mortgage summary (if exists) ---
    var mortgageSummary = null;
    if (mortgage) {
      mortgageSummary = {
        monthlyPayment: mortgage.monthlyPayment,
        monthsRemaining: mortgage.monthsRemaining,
        interestSaved: mortgage.interestSaved
      };
    }

    return {
      month: month,
      prevMonth: prev.month,
      netWorth: current.total,
      prevNetWorth: prev.total,
      nwChange: nwChange,
      nwChangePct: nwChangePct,
      contributions: monthContributions,
      marketChange: marketChange,
      best: best,
      worst: worst,
      accountChanges: accountChanges,
      goals: goalsSummary,
      milestones: milestoneSummary,
      mortgage: mortgageSummary
    };
  },

  // Generate a natural-language paragraph from the summary
  generateNarrative: function(summary) {
    if (!summary) return '';

    var parts = [];

    // NW change
    var direction = summary.nwChange >= 0 ? 'grew' : 'declined';
    parts.push('Net worth ' + direction + ' ' +
      Fmt.currency(Math.abs(summary.nwChange)) +
      ' (' + Fmt.pctShort(summary.nwChangePct) + ') in ' +
      this._monthName(summary.month) + '.');

    // Attribution
    if (summary.contributions !== 0 || summary.marketChange !== 0) {
      var contribPart = '';
      var marketPart = '';
      if (summary.marketChange >= 0) {
        marketPart = 'market returns contributed ' + Fmt.currency(summary.marketChange);
      } else {
        marketPart = 'markets pulled ' + Fmt.currency(Math.abs(summary.marketChange));
      }
      if (summary.contributions > 0) {
        contribPart = 'you saved ' + Fmt.currency(summary.contributions);
      } else if (summary.contributions < 0) {
        contribPart = 'you withdrew ' + Fmt.currency(Math.abs(summary.contributions));
      }
      if (contribPart && marketPart) {
        parts.push(marketPart.charAt(0).toUpperCase() + marketPart.slice(1) + ', ' + contribPart + '.');
      } else if (marketPart) {
        parts.push(marketPart.charAt(0).toUpperCase() + marketPart.slice(1) + '.');
      }
    }

    // Best/worst account
    if (summary.best && summary.best.change > 0) {
      parts.push('Best performer: ' + summary.best.name +
        ' (' + Fmt.currency(summary.best.change) + ').');
    }

    // Goals
    summary.goals.forEach(function(g) {
      if (g.status === 'green') {
        parts.push(g.name + ' is fully funded.');
      } else if (g.pct >= 90) {
        parts.push(g.name + ' is almost there (' + Math.round(g.pct) + '%).');
      }
    });

    // Milestones
    summary.milestones.forEach(function(m) {
      if (m.status === 'achieved') {
        parts.push(m.name + ' milestone achieved!');
      } else if (m.status === 'ahead') {
        parts.push('You\'re ahead of your ' + m.name + ' milestone.');
      } else if (m.status === 'behind') {
        parts.push('You\'re behind on your ' + m.name + ' milestone.');
      }
    });

    return parts.join(' ');
  },

  // Compute how many months closer to FI this month moved us.
  // prevYears/currYears: yearsToFI before and after this month's changes.
  // Returns: { monthsCloser: number, direction: 'closer'|'further'|'same' }
  computeFIImpact: function(prevYearsToFI, currYearsToFI) {
    if (prevYearsToFI === Infinity && currYearsToFI === Infinity) return { monthsCloser: 0, direction: 'same' };
    if (prevYearsToFI === Infinity) return { monthsCloser: 0, direction: 'closer' }; // now reachable
    if (currYearsToFI === Infinity) return { monthsCloser: 0, direction: 'further' };
    var delta = (prevYearsToFI - currYearsToFI) * 12; // in months
    return {
      monthsCloser: Math.round(Math.abs(delta)),
      direction: delta > 0.5 ? 'closer' : (delta < -0.5 ? 'further' : 'same')
    };
  },

  // Compute annual summaries from NW data and monthly contributions.
  // nwData: array from NetWorthCalculator.compute() — includes mortgage/house integration
  // allData: raw MonthEnd rows (investment + bank accounts only)
  // cashflowEntries: optional actual income/expense entries
  // Returns: array of { year, startNW, endNW, nwChange, nwChangePct, totalSaved,
  //   marketReturns, debtReduction, houseValueChange, savingsRate, totalIncome, totalExpenses }
  computeAnnualSummaries: function(nwData, allData, cashflowEntries) {
    if (!nwData || nwData.length < 2) return [];

    // Group NW data by year
    var byYear = {};
    nwData.forEach(function(r) {
      var year = r.month.split('-')[0];
      if (!byYear[year]) byYear[year] = [];
      byYear[year].push(r);
    });

    // Group contributions by year (from MonthEnd rows — investments + bank only)
    var contribByYear = {};
    allData.forEach(function(r) {
      var year = r.month.split('-')[0];
      contribByYear[year] = (contribByYear[year] || 0) + (r.net_contribution || 0);
    });

    // Group cashflow by year — use CashflowCalculator for proper classification
    var cfByYear = {};
    if (cashflowEntries && cashflowEntries.length && typeof CashflowCalculator !== 'undefined') {
      var allMonths = CashflowCalculator.computeAllMonths(cashflowEntries);
      allMonths.forEach(function(m) {
        var year = m.month.split('-')[0];
        if (!cfByYear[year]) cfByYear[year] = { income: 0, expenses: 0 };
        cfByYear[year].income += m.totalIncome;
        cfByYear[year].expenses += m.totalExpenses;
      });
    }

    var years = Object.keys(byYear).sort();
    var summaries = [];
    var prevYearEnd = null;
    var prevYearEndMortgage = null;
    var prevYearEndHouseValue = null;

    for (var i = 0; i < years.length; i++) {
      var year = years[i];
      var yearData = byYear[year];
      var startRow = prevYearEnd !== null ? null : yearData[0];
      var endRow = yearData[yearData.length - 1];
      var startNW = prevYearEnd !== null ? prevYearEnd : yearData[0].total;
      var endNW = endRow.total;
      var nwChange = endNW - startNW;

      // Fix: handle negative NW for percentage calculation
      var nwChangePct = Math.abs(startNW) > 0.01 ? (nwChange / Math.abs(startNW)) * 100 : 0;

      var totalSaved = contribByYear[year] || 0;

      // Decompose NW change: contributions + investment gains + debt reduction + house value change
      var startMortgage = prevYearEndMortgage !== null ? prevYearEndMortgage : (startRow ? startRow.mortgage_balance || 0 : 0);
      var endMortgage = endRow.mortgage_balance || 0;
      var debtReduction = startMortgage - endMortgage; // positive means debt went down

      var startHouseValue = prevYearEndHouseValue !== null ? prevYearEndHouseValue : (startRow ? startRow.house_value || 0 : 0);
      var endHouseValue = endRow.house_value || 0;
      var houseValueChange = endHouseValue - startHouseValue;

      // Market returns = NW change minus savings, debt reduction, and house appreciation
      var marketReturns = nwChange - totalSaved - debtReduction - houseValueChange;

      var cf = cfByYear[year] || { income: 0, expenses: 0 };
      var savingsRate = cf.income > 0 ? (totalSaved / cf.income * 100) : 0;

      summaries.push({
        year: year,
        startNW: startNW,
        endNW: endNW,
        nwChange: nwChange,
        nwChangePct: nwChangePct,
        totalSaved: totalSaved,
        marketReturns: marketReturns,
        debtReduction: debtReduction,
        houseValueChange: houseValueChange,
        savingsRate: savingsRate,
        totalIncome: cf.income,
        totalExpenses: cf.expenses,
        months: yearData.length
      });

      prevYearEnd = endNW;
      prevYearEndMortgage = endMortgage;
      prevYearEndHouseValue = endHouseValue;
    }

    return summaries;
  },

  _monthName: function(monthStr) {
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var m = parseInt(monthStr.split('-')[1]) - 1;
    var y = monthStr.split('-')[0];
    return months[m] + ' ' + y;
  }
};
