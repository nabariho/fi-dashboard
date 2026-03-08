// === ACTIONS CALCULATOR ===
// Generates prioritized action recommendations from goal plan + cashflow data.
// Pure functions, no DOM access.

var ActionsCalculator = {

  // Generate recommended actions based on current plan state.
  // plan: output from GoalPlannerCalculator.plan()
  // fundingHistory: output from CashflowCalculator.computeGoalFundingHistory() (optional)
  // cashflowMonths: array from SavingsCapacityCalculator.computeMonthlyHybrid() (optional)
  // Returns: [{ type, severity, message, detail }]
  //   severity: 'error' | 'warning' | 'info' | 'success'
  computeActions: function(plan, fundingHistory, cashflowMonths) {
    var actions = [];
    if (!plan || !plan.goals || !plan.goals.length) return actions;

    // 1. Budget deficit — most critical
    if (plan.budget_deficit > 0.01) {
      actions.push({
        type: 'budget_deficit',
        severity: 'error',
        message: 'Reduce expenses by ' + Math.ceil(plan.budget_deficit) + '/mo to fund all goals on time.',
        detail: 'Your goals require ' + Math.ceil(plan.required_total) + '/mo but you only save ' +
          Math.ceil(plan.available_for_goals) + '/mo.'
      });
    }

    // 2. Goal achieved — redirect funds
    var fundedGoals = plan.goals.filter(function(g) { return g.status === 'funded'; });
    var atRiskGoals = plan.goals.filter(function(g) { return g.status === 'at_risk'; });

    fundedGoals.forEach(function(fg) {
      if (fg.required_monthly > 0) return; // still needs funding somehow
      // Suggest redirecting to at-risk goals
      if (atRiskGoals.length > 0) {
        actions.push({
          type: 'redirect_funds',
          severity: 'success',
          message: fg.name + ' target reached! Consider redirecting savings to ' + atRiskGoals[0].name + '.',
          detail: atRiskGoals[0].name + ' needs ' + Math.ceil(atRiskGoals[0].required_monthly) + '/mo.'
        });
      }
    });

    // 3. Rebalance: overfunded vs underfunded goals (from actual funding data)
    if (fundingHistory && fundingHistory.goals && fundingHistory.goals.length) {
      var overfunded = fundingHistory.goals.filter(function(g) { return g.status === 'overfunded'; });
      var underfunded = fundingHistory.goals.filter(function(g) { return g.status === 'underfunded' || g.status === 'withdrawn'; });

      overfunded.forEach(function(of) {
        if (underfunded.length > 0) {
          var uf = underfunded[0];
          var excess = Math.ceil(of.delta);
          actions.push({
            type: 'rebalance',
            severity: 'warning',
            message: of.name + ' is overfunded by ~' + excess + '/mo. Consider redirecting to ' + uf.name + '.',
            detail: of.name + ' gets ' + Math.ceil(of.avgActual) + '/mo (planned ' + Math.ceil(of.avgPlanned) +
              '). ' + uf.name + ' only gets ' + Math.ceil(uf.avgActual) + '/mo (needs ' + Math.ceil(uf.avgPlanned) + ').'
          });
        }
      });

      // Reserve drawdown warning
      if (fundingHistory.overdrawnMonths > 0) {
        actions.push({
          type: 'reserve_drawdown',
          severity: 'warning',
          message: 'Goal funding exceeded savings in ' + fundingHistory.overdrawnMonths +
            ' of ' + fundingHistory.totalMonths + ' recent months.',
          detail: 'You are drawing from reserves to fund goals. This is unsustainable long-term.'
        });
      }
    }

    // 4. Expense trend (rising expenses)
    if (cashflowMonths && cashflowMonths.length >= 3) {
      var actual = cashflowMonths.filter(function(r) { return r.dataSource === 'actual'; });
      if (actual.length >= 3) {
        var recent3 = actual.slice(-3);
        var older3 = actual.length >= 6 ? actual.slice(-6, -3) : null;

        if (older3 && older3.length >= 2) {
          var recentAvg = recent3.reduce(function(s, r) { return s + r.impliedExpenses; }, 0) / recent3.length;
          var olderAvg = older3.reduce(function(s, r) { return s + r.impliedExpenses; }, 0) / older3.length;

          if (olderAvg > 0) {
            var increase = (recentAvg - olderAvg) / olderAvg;
            if (increase > 0.10) {
              actions.push({
                type: 'expense_trend',
                severity: 'warning',
                message: 'Expenses increased ' + Math.round(increase * 100) + '% over the last 3 months.',
                detail: 'Recent avg: ' + Math.ceil(recentAvg) + '/mo vs prior avg: ' + Math.ceil(olderAvg) + '/mo. Review variable spending.'
              });
            }
          }
        }
      }
    }

    // 5. Unallocated surplus
    if (plan.budget_surplus > 50) {
      var lowestUnfunded = plan.goals.filter(function(g) {
        return g.status !== 'funded';
      }).sort(function(a, b) { return (a.priority || 99) - (b.priority || 99); })[0];

      if (lowestUnfunded) {
        actions.push({
          type: 'surplus',
          severity: 'info',
          message: Math.ceil(plan.budget_surplus) + '/mo unallocated. Consider adding to ' + lowestUnfunded.name + '.',
          detail: lowestUnfunded.name + ' needs ' + Math.ceil(lowestUnfunded.required_monthly) +
            '/mo. Extra savings could accelerate completion.'
        });
      }
    }

    // Sort by severity: error > warning > info > success
    var severityOrder = { error: 0, warning: 1, info: 2, success: 3 };
    actions.sort(function(a, b) {
      return (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99);
    });

    return actions;
  }
};
