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

  _monthName: function(monthStr) {
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var m = parseInt(monthStr.split('-')[1]) - 1;
    var y = monthStr.split('-')[0];
    return months[m] + ' ' + y;
  }
};
