// === GOAL ACCOUNTING SERVICE ===
// Source-of-funds integrity checks and balance helpers.
// Pure functions, no DOM side effects.

var GoalAccountingService = {
  buildLatestBalances: function(allData) {
    var latestByAccount = {};
    var latestMonthByAccount = {};
    (allData || []).forEach(function(r) {
      if (!r || !r.account_id || !r.month) return;
      if (!latestMonthByAccount[r.account_id] || r.month > latestMonthByAccount[r.account_id]) {
        latestMonthByAccount[r.account_id] = r.month;
        latestByAccount[r.account_id] = r.end_value || 0;
      }
    });
    return latestByAccount;
  },

  normalizeGoal: function(goal) {
    var g = Object.assign({}, goal || {});
    g.goal_id = g.goal_id || '';
    g.name = g.name || g.goal_id || 'Goal';
    g.target_amount = g.target_amount || 0;
    g.current_amount = g.current_amount || 0;
    g.priority = parseInt(g.priority) || 3;
    g.target_date = g.target_date || '';
    g.active = g.active !== false;
    g.track_current_from_accounts = g.track_current_from_accounts !== false;
    g.funding_accounts = (g.funding_accounts || []).map(function(id) { return (id || '').toUpperCase(); });
    return g;
  },

  goalSourceBalance: function(goal, latestBalances) {
    var ids = (goal && goal.funding_accounts) || [];
    return ids.reduce(function(sum, id) {
      return sum + ((latestBalances && latestBalances[id]) || 0);
    }, 0);
  },

  validateSources: function(goals, latestBalances) {
    var issues = [];
    var accountToGoals = {};

    (goals || []).forEach(function(goal) {
      var g = GoalAccountingService.normalizeGoal(goal);
      var sourceBalance = GoalAccountingService.goalSourceBalance(g, latestBalances || {});

      if (g.track_current_from_accounts && g.active && g.funding_accounts.length === 0) {
        issues.push({
          type: 'invalid_source',
          goal_id: g.goal_id,
          message: g.name + ': no funding accounts selected while source-tracking is enabled.'
        });
      }

      if (!g.track_current_from_accounts && g.active && g.funding_accounts.length > 0 && g.current_amount > sourceBalance + 0.01) {
        issues.push({
          type: 'overstated_current',
          goal_id: g.goal_id,
          message: g.name + ': current amount exceeds selected account pool by ' + (g.current_amount - sourceBalance).toFixed(2) + '.'
        });
      }

      if (g.track_current_from_accounts && g.active) {
        g.funding_accounts.forEach(function(accountId) {
          if (!accountToGoals[accountId]) accountToGoals[accountId] = [];
          accountToGoals[accountId].push(g);
        });
      }
    });

    Object.keys(accountToGoals).forEach(function(accountId) {
      var linked = accountToGoals[accountId];
      if (linked.length > 1) {
        issues.push({
          type: 'source_overlap',
          account_id: accountId,
          goal_ids: linked.map(function(g) { return g.goal_id; }),
          message: 'Account ' + accountId + ' is linked to multiple goals: ' + linked.map(function(g) { return g.name; }).join(', ') + '.'
        });
      }
    });

    return issues;
  }
};
