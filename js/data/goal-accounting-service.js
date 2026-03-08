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

  analyzeFunding: function(goals, latestBalances) {
    var issues = [];
    var normalizedGoals = (goals || []).map(function(goal) { return GoalAccountingService.normalizeGoal(goal); });
    var goalCurrentFromAccounts = {};
    var accountLedger = {};
    var trackedByAccount = {};
    var manualByAccount = {};

    normalizedGoals.forEach(function(g) {
      if (!g.active) return;

      if (g.track_current_from_accounts && g.funding_accounts.length === 0) {
        issues.push({
          type: 'invalid_source',
          goal_id: g.goal_id,
          message: g.name + ': no funding accounts selected while source-tracking is enabled.'
        });
      }

      if (!g.track_current_from_accounts && g.funding_accounts.length === 0) {
        issues.push({
          type: 'invalid_source',
          goal_id: g.goal_id,
          message: g.name + ': no funding account selected. Manual tracking requires at least one.'
        });
      }

      if (!g.track_current_from_accounts && g.funding_accounts.length > 1) {
        issues.push({
          type: 'invalid_source',
          goal_id: g.goal_id,
          message: g.name + ': manual tracking with multiple accounts — consider enabling auto-tracking.'
        });
      }

      if (g.track_current_from_accounts) {
        g.funding_accounts.forEach(function(accountId) {
          if (!trackedByAccount[accountId]) trackedByAccount[accountId] = [];
          trackedByAccount[accountId].push(g);
        });
      } else if (g.funding_accounts.length === 1) {
        var accountId = g.funding_accounts[0];
        if (!manualByAccount[accountId]) manualByAccount[accountId] = [];
        manualByAccount[accountId].push({ goal_id: g.goal_id, amount: g.current_amount || 0, name: g.name });
      }
    });

    var accountIds = {};
    Object.keys(trackedByAccount).forEach(function(id) { accountIds[id] = true; });
    Object.keys(manualByAccount).forEach(function(id) { accountIds[id] = true; });

    Object.keys(accountIds).forEach(function(accountId) {
      var balance = (latestBalances && latestBalances[accountId]) || 0;
      var manualClaims = (manualByAccount[accountId] || []).reduce(function(sum, c) { return sum + c.amount; }, 0);
      var trackedGoals = trackedByAccount[accountId] || [];

      accountLedger[accountId] = {
        balance: balance,
        manual_claims: manualClaims,
        tracked_claims: 0,
        unassigned: 0,
        tracked_goal_ids: trackedGoals.map(function(g) { return g.goal_id; }),
        manual_goal_ids: (manualByAccount[accountId] || []).map(function(c) { return c.goal_id; })
      };

      if (manualClaims > balance + 0.01) {
        issues.push({
          type: 'account_oversubscribed',
          account_id: accountId,
          goal_ids: (manualByAccount[accountId] || []).map(function(c) { return c.goal_id; }),
          message: 'Account ' + accountId + ' is oversubscribed: manual claims ' + manualClaims.toFixed(2) + ' > balance ' + balance.toFixed(2) + '.'
        });
        return;
      }

      var remainingForTracked = Math.max(0, balance - manualClaims);
      if (trackedGoals.length > 0) {
        // Weight by target_amount so larger goals claim proportional share
        var totalTarget = trackedGoals.reduce(function(sum, g) { return sum + (g.target_amount || 0); }, 0);
        trackedGoals.forEach(function(g) {
          var share = totalTarget > 0
            ? remainingForTracked * ((g.target_amount || 0) / totalTarget)
            : remainingForTracked / trackedGoals.length;
          if (!goalCurrentFromAccounts[g.goal_id]) goalCurrentFromAccounts[g.goal_id] = 0;
          goalCurrentFromAccounts[g.goal_id] += share;
        });
        accountLedger[accountId].tracked_claims = remainingForTracked;
      } else {
        accountLedger[accountId].unassigned = remainingForTracked;
      }
    });

    return {
      issues: issues,
      goalCurrentFromAccounts: goalCurrentFromAccounts,
      accountLedger: accountLedger
    };
  },

  validateSources: function(goals, latestBalances) {
    return this.analyzeFunding(goals, latestBalances).issues;
  }
};
