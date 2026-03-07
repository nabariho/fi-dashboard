// === GOAL ALLOCATION SERVICE ===
// Priority and proportional funding allocation.
// Pure functions, no DOM side effects.

var GoalAllocationService = {
  monthsBetween: function(from, to) {
    var f = (from || '').split('-');
    var t = (to || '').split('-');
    if (f.length !== 2 || t.length !== 2) return 0;
    return (parseInt(t[0]) - parseInt(f[0])) * 12 + (parseInt(t[1]) - parseInt(f[1]));
  },

  addMonths: function(monthStr, n) {
    var parts = (monthStr || '2025-01').split('-');
    var y = parseInt(parts[0]) || 2025;
    var m = parseInt(parts[1]) || 1;
    m += n;
    while (m > 12) { m -= 12; y++; }
    while (m < 1) { m += 12; y--; }
    return y + '-' + (m < 10 ? '0' : '') + m;
  },

  buildNeed: function(goal, asOfMonth) {
    var remaining = Math.max(0, (goal.target_amount || 0) - (goal.current_amount || 0));
    var monthsLeft = Math.max(0, GoalAllocationService.monthsBetween(asOfMonth, goal.target_date));
    var requiredMonthly = remaining > 0 ? (monthsLeft > 0 ? remaining / monthsLeft : remaining) : 0;
    return {
      remaining: remaining,
      months_left: monthsLeft,
      required_monthly: requiredMonthly
    };
  },

  allocateByPriorityProportional: function(goals, monthlyAvailable) {
    var rows = (goals || []).map(function(g) {
      var row = Object.assign({}, g);
      row.allocated_monthly = 0;
      return row;
    });
    var remainingPool = Math.max(0, monthlyAvailable || 0);

    rows.sort(function(a, b) {
      if ((a.priority || 99) !== (b.priority || 99)) return (a.priority || 99) - (b.priority || 99);
      return (a.goal_id || '').localeCompare(b.goal_id || '');
    });

    var byPriority = {};
    rows.forEach(function(g) {
      if (!byPriority[g.priority]) byPriority[g.priority] = [];
      byPriority[g.priority].push(g);
    });

    Object.keys(byPriority).map(Number).sort(function(a, b) { return a - b; }).forEach(function(priority) {
      if (remainingPool <= 0) return;
      var bucket = byPriority[priority];
      var bucketRequired = bucket.reduce(function(sum, g) { return sum + (g.required_monthly || 0); }, 0);
      if (bucketRequired <= 0) return;

      var bucketFunding = Math.min(bucketRequired, remainingPool);
      bucket.forEach(function(g) {
        g.allocated_monthly = bucketRequired > 0 ? (bucketFunding * g.required_monthly / bucketRequired) : 0;
      });
      remainingPool -= bucketFunding;
    });

    return {
      rows: rows,
      unallocated_surplus: Math.max(0, remainingPool)
    };
  }
};
