// === NET WORTH CALCULATOR ===
// Aggregates data across accounts into net worth snapshots. No DOM access.
//
// Each row contains:
//   liquid     — financial accounts only (investments + bank)
//   assets     — liquid + house market value
//   liabilities — mortgage outstanding balance
//   total      — assets - liabilities (net worth)
//   investments, bank — breakdowns of liquid
//
// When an account has no entry for a month, the last known balance is carried forward
// and a warning is added to result.warnings[].

var NetWorthCalculator = {
  // Build monthly net worth rows from raw data.
  // Returns array of: { month, total, assets, liabilities, liquid, investments, bank,
  //   accounts: { id: value }, mortgage_balance?, house_value?, house_equity? }
  // The returned array also has a .warnings property: [{ month, accountId, accountName, carriedValue }]
  // Optional 3rd param: mortgage object — if provided, integrates mortgage debt and house value.
  compute: function(data, accountIds, mortgage) {
    var nwData = data.filter(function(r) { return accountIds.indexOf(r.account_id) >= 0; });
    var months = DataService.getUniqueMonths(nwData);
    var warnings = [];

    // Pre-compute mortgage schedule if provided
    var mortgageSchedule = null;
    if (mortgage && typeof MortgageCalculator !== 'undefined') {
      mortgageSchedule = MortgageCalculator.computeSchedule(mortgage);
    }

    // Track last known balance per account for carry-forward
    var lastKnown = {};

    var result = months.map(function(m) {
      var row = { month: m, total: 0, liquid: 0, assets: 0, liabilities: 0, investments: 0, bank: 0, accounts: {} };
      accountIds.forEach(function(a) {
        var entry = nwData.find(function(r) { return r.month === m && r.account_id === a; });
        var val;
        if (entry) {
          val = entry.end_value;
          lastKnown[a] = val;
        } else if (lastKnown[a] !== undefined) {
          // Carry forward last known balance and record warning
          val = lastKnown[a];
          warnings.push({
            month: m,
            accountId: a,
            accountName: AccountService.getName(a),
            carriedValue: val
          });
        } else {
          val = 0;
        }
        row.accounts[a] = val;
        row.liquid += val;
        if (AccountService.isBroker(a)) row.investments += val;
        if (AccountService.isCash(a)) row.bank += val;
      });

      row.assets = row.liquid;
      row.liabilities = 0;

      // Integrate mortgage: house value is an asset, mortgage balance is a liability
      if (mortgage && mortgageSchedule) {
        var mortgageBalance = MortgageCalculator.getBalanceAtMonth(mortgageSchedule, m, mortgage);
        var marketValue = MortgageCalculator._getMarketValueAtMonth(mortgage.house_valuations, m);
        row.mortgage_balance = mortgageBalance;
        row.house_value = marketValue;
        row.house_equity = marketValue - mortgageBalance;
        row.assets = row.liquid + marketValue;
        row.liabilities = mortgageBalance;
      }

      row.total = row.assets - row.liabilities;

      return row;
    });

    // Attach warnings to the result array
    result.warnings = warnings;
    return result;
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
    var pct = Math.abs(startOfYear) > 0.01 ? (change / Math.abs(startOfYear)) * 100 : 0;

    return { change: change, pct: pct, status: ValueStatus.sign(change) };
  },

  // Compute month-over-month change
  computeMoM: function(data) {
    if (data.length < 2) return { change: 0, pct: 0, status: 'neutral' };

    var current = data[data.length - 1];
    var prev = data[data.length - 2];
    var change = current.total - prev.total;
    var pct = Math.abs(prev.total) > EPSILON ? (change / Math.abs(prev.total)) * 100 : 0;

    return { change: change, pct: pct, status: ValueStatus.sign(change) };
  },

  // Compute per-account deltas between the two most recent months.
  // Returns array of { accountId, name, current, previous, delta, deltaStatus }
  computeAccountDeltas: function(nwData, accountIds) {
    if (!nwData || nwData.length < 2) return [];
    var recent = nwData[nwData.length - 1];
    var prev = nwData[nwData.length - 2];
    return accountIds.map(function(id) {
      var cur = recent.accounts[id] || 0;
      var prv = prev.accounts[id] || 0;
      var delta = cur - prv;
      return {
        accountId: id,
        name: AccountService.getName(id),
        current: cur,
        previous: prv,
        delta: delta,
        deltaStatus: ValueStatus.sign(delta)
      };
    });
  }
};
