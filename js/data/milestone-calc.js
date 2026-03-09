// === MILESTONE CALCULATOR ===
// Computes glide paths and progress tracking for planner goals.
// Pure math, no DOM access.
//
// Works with planner goals that have target_date and target_amount.
// Replaces the legacy standalone milestone system.

var MilestoneCalculator = {
  // Compute glide path status for a planner goal.
  // goal: planner goal row (from GoalRulesService.evaluate)
  //   { goal_id, name, target_date, target_amount, current_amount, sub_targets? }
  // startDate: 'YYYY-MM' (earliest data month)
  // currentDate: 'YYYY-MM' (latest data month)
  computeGoalGlidePath: function(goal, startDate, currentDate) {
    var targetDate = goal.target_date;
    var targetAmount = goal.target_amount || 0;
    var currentAmount = goal.current_amount || 0;

    if (!targetDate || !targetAmount) return null;

    // Time progress (0 to 1)
    var totalMonths = this._monthsBetween(startDate, targetDate);
    var elapsedMonths = this._monthsBetween(startDate, currentDate);
    var timeProgress = totalMonths > 0 ? Math.min(elapsedMonths / totalMonths, 1) : 1;

    // Expected value on the glide path (linear interpolation from 0)
    var expectedValue = targetAmount * timeProgress;

    // Overall progress
    var progressPct = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;
    var expectedPct = targetAmount > 0 ? (expectedValue / targetAmount) * 100 : 0;

    // Status: ahead if > 105% of expected, behind if < 95%, on-track otherwise
    var status;
    if (currentAmount >= targetAmount) {
      status = 'achieved';
    } else if (currentAmount >= expectedValue * 1.05) {
      status = 'ahead';
    } else if (currentAmount >= expectedValue * 0.95) {
      status = 'on-track';
    } else {
      status = 'behind';
    }

    var remaining = Math.max(0, targetAmount - currentAmount);
    var monthsLeft = this._monthsBetween(currentDate, targetDate);
    var monthlyNeeded = monthsLeft > 0 ? remaining / monthsLeft : remaining;

    // Sub-target progress (if goal has sub_targets from legacy milestone migration)
    var subProgress = [];
    if (goal.sub_targets && goal.sub_targets.length) {
      subProgress = goal.sub_targets.map(function(st) {
        var current = st.current || 0;
        var pct = st.amount > 0 ? (current / st.amount) * 100 : 0;
        return {
          goal: st.goal,
          target: st.amount,
          current: current,
          pct: Math.min(pct, 100),
          remaining: Math.max(0, st.amount - current)
        };
      });
    }

    return {
      goal_id: goal.goal_id,
      name: goal.name,
      targetDate: targetDate,
      totalTarget: targetAmount,
      currentTotal: currentAmount,
      progressPct: Math.min(progressPct, 100),
      expectedPct: expectedPct,
      expectedValue: expectedValue,
      status: status,
      remaining: remaining,
      monthsLeft: monthsLeft,
      monthlyNeeded: monthlyNeeded,
      timeProgress: timeProgress,
      subProgress: subProgress
    };
  },

  // Compute glide paths for all planner goals that have a target_date.
  computeAllFromGoals: function(plannerGoals, startDate, currentDate) {
    var self = this;
    return (plannerGoals || []).filter(function(g) {
      return g.target_date && g.target_amount > 0;
    }).map(function(g) {
      return self.computeGoalGlidePath(g, startDate, currentDate);
    }).filter(function(r) { return r !== null; });
  },

  // Legacy: compute status for a standalone milestone (backward compat during migration)
  computeStatus: function(milestone, currentValues, startDate, currentDate) {
    return this.computeGoalGlidePath({
      goal_id: milestone.milestone_id,
      name: milestone.name,
      target_date: milestone.target_date,
      target_amount: milestone.total_target,
      current_amount: currentValues.total || 0,
      sub_targets: (milestone.sub_targets || []).map(function(st) {
        return { goal: st.goal, amount: st.amount, current: currentValues[st.goal] || 0 };
      })
    }, startDate, currentDate);
  },

  // Legacy: compute all standalone milestones (backward compat)
  computeAll: function(milestones, currentValues, startDate, currentDate) {
    var self = this;
    return milestones.map(function(m) {
      return self.computeStatus(m, currentValues, startDate, currentDate);
    });
  },

  // Delegate to DateUtils
  _monthsBetween: function(from, to) {
    return DateUtils.monthsBetween(from, to);
  }
};
