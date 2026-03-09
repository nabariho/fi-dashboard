// === RETURNS CALCULATOR ===
// Modified Dietz monthly returns and YTD chaining. Pure math, no DOM access.

var ReturnsCalculator = {
  // Compute cumulative contributions + monthly returns + YTD for sorted monthly data.
  // Returns a NEW array with added fields (does NOT mutate input):
  //   cum_contribution, monthly_return_pct, ytd_return_pct,
  //   monthlyReturnStatus, ytdReturnStatus
  compute: function(sortedMonthly) {
    var rows = sortedMonthly.map(function(r) { return Object.assign({}, r); });
    var cumContrib = 0;

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      cumContrib += r.net_contribution;
      r.cum_contribution = cumContrib;

      // Modified Dietz monthly return
      if (i === 0) {
        r.monthly_return_pct = r.net_contribution > 0
          ? ((r.end_value - r.net_contribution) / (0.5 * r.net_contribution)) * 100
          : 0;
      } else {
        var prev = rows[i - 1];
        var denom = prev.end_value + 0.5 * r.net_contribution;
        r.monthly_return_pct = denom > 0
          ? ((r.end_value - prev.end_value - r.net_contribution) / denom) * 100
          : 0;
      }

      // YTD: chain monthly returns, reset each January
      var year = DateUtils.getYear(r.month);
      var prevYear = i > 0 ? DateUtils.getYear(rows[i - 1].month) : '';
      r._ytdProduct = (year !== prevYear)
        ? 1 + r.monthly_return_pct / 100
        : rows[i - 1]._ytdProduct * (1 + r.monthly_return_pct / 100);
      r.ytd_return_pct = (r._ytdProduct - 1) * 100;

      // Pre-computed status for UI (avoids sign checks in renderers)
      r.monthlyReturnStatus = ValueStatus.sign(r.monthly_return_pct);
      r.ytdReturnStatus = ValueStatus.sign(r.ytd_return_pct);
    }

    return rows;
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

      rows = ReturnsCalculator.compute(rows);
      rows.forEach(function(r) { allMonths[r.month] = true; });

      var last = rows[rows.length - 1];
      var cumContrib = last.cum_contribution;
      var cumReturn = cumContrib > 0 ? ((last.end_value - cumContrib) / cumContrib) * 100 : 0;

      var profit = last.end_value - cumContrib;
      result.accounts[id] = {
        monthly: last.monthly_return_pct,
        ytd: last.ytd_return_pct,
        cumReturn: cumReturn,
        currentValue: last.end_value,
        totalInvested: cumContrib,
        profit: profit,
        data: rows,
        // Pre-computed status for UI
        profitStatus: ValueStatus.sign(profit),
        monthlyStatus: ValueStatus.sign(last.monthly_return_pct),
        ytdStatus: ValueStatus.sign(last.ytd_return_pct),
        cumReturnStatus: ValueStatus.sign(cumReturn)
      };
    });

    // Pre-compute totals across all accounts
    var totalValue = 0, totalInvested = 0;
    var ids = Object.keys(result.accounts);
    ids.forEach(function(id) {
      totalValue += result.accounts[id].currentValue;
      totalInvested += result.accounts[id].totalInvested;
    });
    var totalProfit = totalValue - totalInvested;
    var totalMarketPct = totalValue > 0 ? (totalProfit / totalValue * 100) : 0;
    result.totals = {
      currentValue: totalValue,
      totalInvested: totalInvested,
      profit: totalProfit,
      marketPct: totalMarketPct,
      profitStatus: ValueStatus.sign(totalProfit),
      marketPctStatus: ValueStatus.sign(totalMarketPct)
    };

    result.months = Object.keys(allMonths).sort();
    return result;
  },

  // Compute gains (value minus contributions, floored at 0) for chart rendering.
  computeGains: function(values, contributions) {
    return values.map(function(v, i) { return Math.max(v - contributions[i], 0); });
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
