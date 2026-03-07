// === GOAL RULES SERVICE ===
// Orchestrates goal normalization, accounting checks, and funding allocation.

var GoalRulesService = {
  evaluate: function(goals, context) {
    context = context || {};
    var asOfMonth = context.asOfMonth || '2025-01';
    var monthlyIncome = context.monthlyIncome || 0;
    var monthlyExpenses = context.monthlyExpenses || 0;
    var latestAccounts = context.latestAccounts || {};
    var available = monthlyIncome - monthlyExpenses;

    var rows = (goals || []).filter(function(g) { return g && g.active !== false; }).map(function(goal) {
      var g = GoalAccountingService.normalizeGoal(goal);
      var sourceBalance = GoalAccountingService.goalSourceBalance(g, latestAccounts);
      var effectiveCurrent = (g.track_current_from_accounts && g.funding_accounts.length) ? sourceBalance : g.current_amount;
      g.current_amount = effectiveCurrent;
      g.manual_current_amount = goal.current_amount || 0;
      g.source_balance = sourceBalance;

      var need = GoalAllocationService.buildNeed(g, asOfMonth);
      g.remaining = need.remaining;
      g.months_left = need.months_left;
      g.required_monthly = need.required_monthly;
      g.allocated_monthly = 0;
      g.shortfall = g.required_monthly;
      g.status = g.remaining <= 0 ? 'funded' : 'pending';
      g.projected_completion = g.remaining <= 0 ? asOfMonth : null;
      return g;
    });

    var sourceIssues = GoalAccountingService.validateSources(rows, latestAccounts);
    var overlapGoalIds = {};
    sourceIssues.forEach(function(issue) {
      if (issue.type === 'source_overlap') {
        (issue.goal_ids || []).forEach(function(goalId) { overlapGoalIds[goalId] = true; });
      }
    });

    var allocation = GoalAllocationService.allocateByPriorityProportional(rows, available);
    rows = allocation.rows;

    rows.forEach(function(g) {
      g.shortfall = Math.max(0, g.required_monthly - g.allocated_monthly);

      if (g.remaining <= 0) {
        g.status = 'funded';
      } else if (g.track_current_from_accounts && g.funding_accounts.length === 0) {
        g.status = 'invalid_source';
      } else if (overlapGoalIds[g.goal_id]) {
        g.status = 'source_conflict';
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
        g.projected_completion = GoalAllocationService.addMonths(asOfMonth, monthsNeeded);
      } else {
        g.projected_completion = null;
      }
    });

    var conflicts = sourceIssues.slice();
    rows.filter(function(g) {
      return g.status === 'at_risk' || g.status === 'unfundable' || g.status === 'source_conflict' || g.status === 'invalid_source';
    }).forEach(function(g) {
      conflicts.push({
        type: g.status,
        goal_id: g.goal_id,
        message: g.name + ': status ' + g.status.replace('_', ' ') + '.'
      });
    });

    return {
      as_of_month: asOfMonth,
      monthly_income: monthlyIncome,
      monthly_expenses: monthlyExpenses,
      available_for_goals: available,
      required_total: rows.reduce(function(sum, g) { return sum + g.required_monthly; }, 0),
      allocated_total: rows.reduce(function(sum, g) { return sum + g.allocated_monthly; }, 0),
      shortfall_total: rows.reduce(function(sum, g) { return sum + g.shortfall; }, 0),
      unallocated_surplus: allocation.unallocated_surplus,
      goals: rows,
      conflicts: conflicts
    };
  }
};
