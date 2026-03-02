// === MILESTONE CALCULATOR ===
// Computes milestone progress, glide paths, and status. Pure math, no DOM access.
//
// Milestone structure:
// { milestone_id, name, target_date: 'YYYY-MM', total_target,
//   sub_targets: [{ goal: 'emergency_fund'|'house_downpayment'|'fi_networth', amount }] }

var MilestoneCalculator = {
  // Compute status for a single milestone
  // milestone: milestone object
  // currentValues: { total, emergency_fund, house_downpayment, fi_networth }
  // startDate: 'YYYY-MM' (earliest data month)
  // currentDate: 'YYYY-MM' (latest data month)
  computeStatus: function(milestone, currentValues, startDate, currentDate) {
    var targetDate = milestone.target_date;
    var totalTarget = milestone.total_target;
    var currentTotal = currentValues.total || 0;

    // Time progress (0 to 1)
    var totalMonths = this._monthsBetween(startDate, targetDate);
    var elapsedMonths = this._monthsBetween(startDate, currentDate);
    var timeProgress = totalMonths > 0 ? Math.min(elapsedMonths / totalMonths, 1) : 1;

    // Expected value on the glide path (linear interpolation)
    // Assume starting from 0 contribution toward this milestone
    var startValue = 0; // glide path starts from beginning of tracked data
    var expectedValue = startValue + (totalTarget - startValue) * timeProgress;

    // Overall progress
    var progressPct = totalTarget > 0 ? (currentTotal / totalTarget) * 100 : 0;
    var expectedPct = totalTarget > 0 ? (expectedValue / totalTarget) * 100 : 0;

    // Status: ahead if > 105% of expected, behind if < 95%, on-track otherwise
    var status;
    if (currentTotal >= totalTarget) {
      status = 'achieved';
    } else if (currentTotal >= expectedValue * 1.05) {
      status = 'ahead';
    } else if (currentTotal >= expectedValue * 0.95) {
      status = 'on-track';
    } else {
      status = 'behind';
    }

    // Remaining
    var remaining = Math.max(0, totalTarget - currentTotal);
    var monthsLeft = this._monthsBetween(currentDate, targetDate);
    var monthlyNeeded = monthsLeft > 0 ? remaining / monthsLeft : remaining;

    // Sub-target progress
    var subProgress = (milestone.sub_targets || []).map(function(st) {
      var current = currentValues[st.goal] || 0;
      var pct = st.amount > 0 ? (current / st.amount) * 100 : 0;
      return {
        goal: st.goal,
        target: st.amount,
        current: current,
        pct: Math.min(pct, 100),
        remaining: Math.max(0, st.amount - current)
      };
    });

    return {
      milestone_id: milestone.milestone_id,
      name: milestone.name,
      targetDate: targetDate,
      totalTarget: totalTarget,
      currentTotal: currentTotal,
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

  // Compute all milestones
  computeAll: function(milestones, currentValues, startDate, currentDate) {
    var self = this;
    return milestones.map(function(m) {
      return self.computeStatus(m, currentValues, startDate, currentDate);
    });
  },

  // Helper: months between two YYYY-MM strings
  _monthsBetween: function(from, to) {
    var f = from.split('-');
    var t = to.split('-');
    return (parseInt(t[0]) - parseInt(f[0])) * 12 + (parseInt(t[1]) - parseInt(f[1]));
  }
};
