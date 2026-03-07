// === GOAL PLANNER CALCULATOR ===
// Priority-based monthly allocation planner for financial goals.
// Pure math, no DOM access.

var GoalPlannerCalculator = {
  plan: function(goals, options) {
    return GoalRulesService.evaluate(goals || [], {
      monthlyIncome: options && options.monthlyIncome || 0,
      monthlyExpenses: options && options.monthlyExpenses || 0,
      asOfMonth: options && options.asOfMonth || '2025-01',
      latestAccounts: options && options.latestAccounts || {}
    });
  }
};
