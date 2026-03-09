// === GOAL ALLOCATION SERVICE ===
// Priority and proportional funding allocation.
// Pure functions, no DOM side effects.

var GoalAllocationService = {
  // Delegate to DateUtils for shared date arithmetic
  monthsBetween: function(from, to) { return DateUtils.monthsBetween(from, to); },
  addMonths: function(monthStr, n) { return DateUtils.addMonths(monthStr, n); },

  buildNeed: function(goal, asOfMonth) {
    var remaining = Math.max(0, (goal.target_amount || 0) - (goal.current_amount || 0));
    var monthsLeft = Math.max(0, DateUtils.monthsBetween(asOfMonth, goal.target_date));
    var requiredMonthly;
    if (remaining <= 0) {
      requiredMonthly = 0;
    } else if (monthsLeft > 0) {
      requiredMonthly = remaining / monthsLeft;
    } else {
      // Past deadline: spread over 12 months to avoid starving other goals.
      // Status will still show 'at_risk' since months_left = 0.
      requiredMonthly = remaining / 12;
    }
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
