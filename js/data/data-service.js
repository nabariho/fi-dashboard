// === DATA SERVICE ===
// Filtering and aggregation of raw MonthEnd data. No DOM access.

var DataService = {
  // Filter raw data by a predicate on account_id
  filterByAccount: function(data, predicate) {
    return data.filter(function(r) { return predicate(r.account_id); });
  },

  // Aggregate rows by month (sum end_value and net_contribution)
  aggregateByMonth: function(rows) {
    var byMonth = {};
    rows.forEach(function(r) {
      if (!byMonth[r.month]) {
        byMonth[r.month] = { month: r.month, end_value: 0, net_contribution: 0 };
      }
      byMonth[r.month].end_value += r.end_value;
      byMonth[r.month].net_contribution += r.net_contribution;
    });
    return Object.values(byMonth).sort(function(a, b) { return a.month.localeCompare(b.month); });
  },

  // Slice to last N months (0 = all)
  applyTimeRange: function(data, rangeMonths) {
    if (rangeMonths > 0 && data.length > rangeMonths) {
      return data.slice(-rangeMonths);
    }
    return data;
  },

  // Get unique sorted months from a dataset
  getUniqueMonths: function(data) {
    var months = [];
    data.forEach(function(r) {
      if (months.indexOf(r.month) < 0) months.push(r.month);
    });
    return months.sort();
  }
};
