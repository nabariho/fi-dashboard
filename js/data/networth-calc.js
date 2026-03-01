// === NET WORTH CALCULATOR ===
// Aggregates data across accounts into net worth snapshots. No DOM access.

var NetWorthCalculator = {
  // Build monthly net worth rows from raw data.
  // Returns array of: { month, total, investments, bank, accounts: { id: value } }
  compute: function(data, accountIds) {
    var nwData = data.filter(function(r) { return accountIds.indexOf(r.account_id) >= 0; });
    var months = DataService.getUniqueMonths(nwData);

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
