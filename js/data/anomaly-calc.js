// === ANOMALY CALCULATOR ===
// Detects unusual changes in monthly data to catch errors and provide context. No DOM access.

var AnomalyCalculator = {

  // Detect anomalies for the latest month compared to historical patterns.
  // allData: raw MonthEnd rows
  // latestMonth: 'YYYY-MM' string to check (if null, auto-detects latest)
  // Returns: [{ account, type, message, severity: 'warning'|'info' }]
  detectAnomalies: function(allData, latestMonth) {
    if (!allData.length) return [];

    // Find latest month if not specified
    if (!latestMonth) {
      var months = allData.map(function(r) { return r.month; }).sort();
      latestMonth = months[months.length - 1];
    }

    // Get previous month
    var prevMonth = this._prevMonth(latestMonth);

    // Group data by account
    var byAccount = {};
    allData.forEach(function(r) {
      if (!byAccount[r.account_id]) byAccount[r.account_id] = [];
      byAccount[r.account_id].push(r);
    });

    var alerts = [];

    Object.keys(byAccount).forEach(function(accountId) {
      var rows = byAccount[accountId].sort(function(a, b) { return a.month.localeCompare(b.month); });
      var current = rows.find(function(r) { return r.month === latestMonth; });
      var prev = rows.find(function(r) { return r.month === prevMonth; });

      if (!current) return; // No data for this account this month

      var name = AccountService.getName(accountId);

      // 1. Zero balance check
      if (current.end_value === 0 && prev && prev.end_value > 0) {
        alerts.push({
          account: accountId,
          type: 'zero_balance',
          message: name + ' balance is 0 — was ' + Fmt.currency(prev.end_value) + ' last month. Intentional?',
          severity: 'warning'
        });
        return; // Skip other checks for this account
      }

      // 2. Large value change (relative to history)
      if (prev && prev.end_value > 0) {
        var changePct = ((current.end_value - prev.end_value) / prev.end_value) * 100;

        // Compute historical monthly change stats (stddev + mean)
        var changes = [];
        for (var i = 1; i < rows.length; i++) {
          if (rows[i - 1].end_value > 0) {
            changes.push(((rows[i].end_value - rows[i - 1].end_value) / rows[i - 1].end_value) * 100);
          }
        }

        if (changes.length >= 3) {
          var stats = this._meanStddev(changes);
          var zScore = stats.stddev > 0 ? Math.abs(changePct - stats.mean) / stats.stddev : 0;

          // Flag if > 2 standard deviations from mean
          if (zScore > 2 && Math.abs(changePct) > 5) {
            var direction = changePct > 0 ? 'gained' : 'dropped';
            alerts.push({
              account: accountId,
              type: 'large_change',
              message: name + ' ' + direction + ' ' + Fmt.pctShort(changePct) + ' this month — unusual compared to its history (avg ' + Fmt.pctShort(stats.mean) + '/mo).',
              severity: Math.abs(changePct) > 15 ? 'warning' : 'info'
            });
          }
        }
      }

      // 3. Unusually large contribution
      if (current.net_contribution !== 0) {
        var contributions = rows.filter(function(r) { return r.month !== latestMonth; })
          .map(function(r) { return Math.abs(r.net_contribution || 0); })
          .filter(function(v) { return v > 0; });

        if (contributions.length >= 3) {
          var contribStats = this._meanStddev(contributions);
          var absContrib = Math.abs(current.net_contribution);
          if (contribStats.mean > 0 && absContrib > contribStats.mean * 3 && absContrib > 1000) {
            var contribDir = current.net_contribution > 0 ? 'contribution' : 'withdrawal';
            alerts.push({
              account: accountId,
              type: 'large_contribution',
              message: name + ': ' + Fmt.currency(absContrib) + ' ' + contribDir + ' is ' + Math.round(absContrib / contribStats.mean) + 'x your average. Double-check?',
              severity: 'info'
            });
          }
        }
      }
    });

    // Sort: warnings first, then info
    alerts.sort(function(a, b) {
      if (a.severity === b.severity) return 0;
      return a.severity === 'warning' ? -1 : 1;
    });

    return alerts;
  },

  _meanStddev: function(arr) {
    var n = arr.length;
    var mean = arr.reduce(function(s, v) { return s + v; }, 0) / n;
    var variance = arr.reduce(function(s, v) { return s + (v - mean) * (v - mean); }, 0) / n;
    return { mean: mean, stddev: Math.sqrt(variance) };
  },

  _prevMonth: function(monthStr) {
    return DateUtils.prevMonth(monthStr);
  }
};
