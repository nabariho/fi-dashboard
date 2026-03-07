// === GOAL PLANNER CALCULATOR ===
// Priority-based monthly allocation planner for financial goals.
// Pure math, no DOM access.

var GoalPlannerCalculator = {
  _monthsBetween: function(from, to) {
    var f = (from || '').split('-');
    var t = (to || '').split('-');
    if (f.length !== 2 || t.length !== 2) return 0;
    return (parseInt(t[0]) - parseInt(f[0])) * 12 + (parseInt(t[1]) - parseInt(f[1]));
  },

  _addMonths: function(monthStr, n) {
    var parts = (monthStr || '2025-01').split('-');
    var y = parseInt(parts[0]) || 2025;
    var m = parseInt(parts[1]) || 1;
    m += n;
    while (m > 12) { m -= 12; y++; }
    while (m < 1) { m += 12; y--; }
    return y + '-' + (m < 10 ? '0' : '') + m;
  },

  plan: function(goals, options) {
    goals = goals || [];
    options = options || {};

    var monthlyIncome = options.monthlyIncome || 0;
    var monthlyExpenses = options.monthlyExpenses || 0;
    var asOfMonth = options.asOfMonth || '2025-01';
    var available = monthlyIncome - monthlyExpenses;

    var activeGoals = goals.filter(function(g) { return g.active !== false; }).map(function(g) {
      var current = g.current_amount || 0;
      var target = g.target_amount || 0;
      var remaining = Math.max(0, target - current);
      var monthsLeft = Math.max(0, GoalPlannerCalculator._monthsBetween(asOfMonth, g.target_date));
      var requiredMonthly = remaining > 0
        ? (monthsLeft > 0 ? remaining / monthsLeft : remaining)
        : 0;

      return {
        goal_id: g.goal_id,
        name: g.name || g.goal_id || 'Goal',
        priority: parseInt(g.priority) || 3,
        target_date: g.target_date || '',
        current_amount: current,
        target_amount: target,
        remaining: remaining,
        months_left: monthsLeft,
        required_monthly: requiredMonthly,
        allocated_monthly: 0,
        shortfall: requiredMonthly,
        status: remaining <= 0 ? 'funded' : 'pending',
        projected_completion: remaining <= 0 ? asOfMonth : null
      };
    });

    activeGoals.sort(function(a, b) {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.name.localeCompare(b.name);
    });

    var remainingPool = Math.max(0, available);
    var byPriority = {};
    activeGoals.forEach(function(g) {
      if (!byPriority[g.priority]) byPriority[g.priority] = [];
      byPriority[g.priority].push(g);
    });

    Object.keys(byPriority).map(Number).sort(function(a, b) { return a - b; }).forEach(function(priority) {
      var bucket = byPriority[priority];
      var bucketRequired = bucket.reduce(function(sum, g) { return sum + g.required_monthly; }, 0);
      if (bucketRequired <= 0 || remainingPool <= 0) return;

      var bucketFunding = Math.min(bucketRequired, remainingPool);
      bucket.forEach(function(g) {
        g.allocated_monthly = bucketRequired > 0 ? (bucketFunding * g.required_monthly / bucketRequired) : 0;
      });
      remainingPool -= bucketFunding;
    });

    activeGoals.forEach(function(g) {
      g.shortfall = Math.max(0, g.required_monthly - g.allocated_monthly);
      if (g.remaining <= 0) {
        g.status = 'funded';
      } else if (g.allocated_monthly <= 0) {
        g.status = 'unfundable';
      } else if (g.shortfall > 0.01) {
        g.status = 'at_risk';
      } else {
        g.status = 'on_track';
      }

      if (g.remaining <= 0) {
        g.projected_completion = asOfMonth;
      } else if (g.allocated_monthly > 0) {
        var monthsNeeded = Math.ceil(g.remaining / g.allocated_monthly);
        g.projected_completion = GoalPlannerCalculator._addMonths(asOfMonth, monthsNeeded);
      } else {
        g.projected_completion = null;
      }
    });

    var requiredTotal = activeGoals.reduce(function(sum, g) { return sum + g.required_monthly; }, 0);
    var allocatedTotal = activeGoals.reduce(function(sum, g) { return sum + g.allocated_monthly; }, 0);
    var shortfallTotal = activeGoals.reduce(function(sum, g) { return sum + g.shortfall; }, 0);
    var conflicts = activeGoals.filter(function(g) { return g.status === 'at_risk' || g.status === 'unfundable'; });

    return {
      as_of_month: asOfMonth,
      monthly_income: monthlyIncome,
      monthly_expenses: monthlyExpenses,
      available_for_goals: available,
      required_total: requiredTotal,
      allocated_total: allocatedTotal,
      shortfall_total: shortfallTotal,
      unallocated_surplus: Math.max(0, available - allocatedTotal),
      goals: activeGoals,
      conflicts: conflicts
    };
  }
};
