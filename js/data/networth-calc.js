// === NET WORTH CALCULATOR ===
// Aggregates data across accounts into net worth snapshots. No DOM access.

var NetWorthCalculator = {
  // Build monthly net worth rows from raw data.
  // Returns array of: { month, total, investments, bank, accounts: { id: value }, mortgage_balance?, house_value?, house_equity? }
  // Optional 3rd param: mortgage object — if provided, integrates mortgage debt and house value.
  compute: function(data, accountIds, mortgage) {
    var nwData = data.filter(function(r) { return accountIds.indexOf(r.account_id) >= 0; });
    var months = DataService.getUniqueMonths(nwData);

    // Pre-compute mortgage schedule if provided
    var mortgageSchedule = null;
    if (mortgage && typeof MortgageCalculator !== 'undefined') {
      mortgageSchedule = MortgageCalculator.computeSchedule(mortgage);
    }

    return months.map(function(m) {
      var row = { month: m, total: 0, investments: 0, bank: 0, accounts: {} };
      accountIds.forEach(function(a) {
        var entry = nwData.find(function(r) { return r.month === m && r.account_id === a; });
        var val = entry ? entry.end_value : 0;
        row.accounts[a] = val;
        row.total += val;
        if (AccountService.isBroker(a)) row.investments += val;
        if (AccountService.isCash(a)) row.bank += val;
      });

      // Integrate mortgage: subtract debt, add house market value
      if (mortgage && mortgageSchedule) {
        var mortgageBalance = MortgageCalculator.getBalanceAtMonth(mortgageSchedule, m, mortgage);
        var marketValue = MortgageCalculator._getMarketValueAtMonth(mortgage.house_valuations, m);
        row.mortgage_balance = mortgageBalance;
        row.house_value = marketValue;
        row.house_equity = marketValue - mortgageBalance;
        row.total = row.total - mortgageBalance + marketValue;
      }

      return row;
    });
  },

  // Compute YTD change metrics for the most recent data point
  computeYTD: function(data) {
    if (!data.length) return { change: 0, pct: 0 };

    var current = data[data.length - 1];
    var currentYear = current.month.substring(0, 4);
    var decPrev = data.filter(function(r) {
      return r.month === (parseInt(currentYear) - 1) + '-12';
    });
    var startOfYear = decPrev.length ? decPrev[0].total : data[0].total;
    var change = current.total - startOfYear;
    var pct = startOfYear > 0 ? (change / startOfYear) * 100 : 0;

    return { change: change, pct: pct };
  },

  // Compute month-over-month change
  computeMoM: function(data) {
    if (data.length < 2) return { change: 0, pct: 0 };

    var current = data[data.length - 1];
    var prev = data[data.length - 2];
    var change = current.total - prev.total;
    var pct = prev.total > 0 ? (change / prev.total) * 100 : 0;

    return { change: change, pct: pct };
  }
};
