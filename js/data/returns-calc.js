// === RETURNS CALCULATOR ===
// Modified Dietz monthly returns and YTD chaining. Pure math, no DOM access.

var ReturnsCalculator = {
  // Compute cumulative contributions + monthly returns + YTD for sorted monthly data.
  // Mutates and returns the same array with added fields:
  //   cum_contribution, monthly_return_pct, ytd_return_pct
  compute: function(sortedMonthly) {
    var cumContrib = 0;

    for (var i = 0; i < sortedMonthly.length; i++) {
      var r = sortedMonthly[i];
      cumContrib += r.net_contribution;
      r.cum_contribution = cumContrib;

      // Modified Dietz monthly return
      if (i === 0) {
        r.monthly_return_pct = r.net_contribution > 0
          ? ((r.end_value - r.net_contribution) / (0.5 * r.net_contribution)) * 100
          : 0;
      } else {
        var prev = sortedMonthly[i - 1];
        var denom = prev.end_value + 0.5 * r.net_contribution;
        r.monthly_return_pct = denom > 0
          ? ((r.end_value - prev.end_value - r.net_contribution) / denom) * 100
          : 0;
      }

      // YTD: chain monthly returns, reset each January
      var year = r.month.substring(0, 4);
      var prevYear = i > 0 ? sortedMonthly[i - 1].month.substring(0, 4) : '';
      r._ytdProduct = (year !== prevYear)
        ? 1 + r.monthly_return_pct / 100
        : sortedMonthly[i - 1]._ytdProduct * (1 + r.monthly_return_pct / 100);
      r.ytd_return_pct = (r._ytdProduct - 1) * 100;
    }

    return sortedMonthly;
  },

  // Compute returns per individual account and return a summary for comparison.
  // Input: raw allData array, array of account IDs to compare
  // Returns: { accounts: { ID: { monthly, ytd, cumReturn, data: [...] } }, months: [...] }
  compareAccounts: function(allData, accountIds) {
    var result = { accounts: {}, months: [] };
    var allMonths = {};

    accountIds.forEach(function(id) {
      var rows = allData.filter(function(r) { return r.account_id === id; })
        .map(function(r) { return { month: r.month, end_value: r.end_value, net_contribution: r.net_contribution }; })
        .sort(function(a, b) { return a.month.localeCompare(b.month); });

      if (!rows.length) return;

      ReturnsCalculator.compute(rows);
      rows.forEach(function(r) { allMonths[r.month] = true; });

      var last = rows[rows.length - 1];
      var cumContrib = last.cum_contribution;
      var cumReturn = cumContrib > 0 ? ((last.end_value - cumContrib) / cumContrib) * 100 : 0;

      result.accounts[id] = {
        monthly: last.monthly_return_pct,
        ytd: last.ytd_return_pct,
        cumReturn: cumReturn,
        currentValue: last.end_value,
        totalInvested: cumContrib,
        profit: last.end_value - cumContrib,
        data: rows
      };
    });

    result.months = Object.keys(allMonths).sort();
    return result;
  },

  // Group data by year and month index (0-11) for the returns grid
  groupByYear: function(data) {
    var byYear = {};
    data.forEach(function(r) {
      var y = r.month.substring(0, 4);
      var m = parseInt(r.month.substring(5, 7)) - 1;
      if (!byYear[y]) byYear[y] = {};
      byYear[y][m] = r;
    });
    return byYear;
  }
};
