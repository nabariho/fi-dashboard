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
