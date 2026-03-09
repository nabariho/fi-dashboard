// === GOALS CALCULATOR ===
// Extracts goal status from the unified planner output.
// Pure functions, no DOM access, no hardcoded account IDs.

var GoalsCalculator = {
  // Extract goal status summaries from planner output for the Goals panel.
  // Returns an array of { goal_id, name, current, target, pct, status, remaining,
  //   required_monthly, projected_completion, funding_accounts } objects.
  fromPlannerOutput: function(plan) {
    if (!plan || !plan.goals || !plan.goals.length) return [];

    return plan.goals.map(function(g) {
      var current = g.current_amount || 0;
      var target = g.target_amount || 0;
      var pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;

      // Map planner status to traffic-light color for the panel
      var color;
      if (g.status === 'funded') {
        color = 'green';
      } else if (g.status === 'on_track') {
        color = 'blue';
      } else if (g.status === 'at_risk') {
        color = 'yellow';
      } else {
        color = 'red';
      }

      return {
        goal_id: g.goal_id,
        name: g.name,
        current: current,
        target: target,
        pct: pct,
        remaining: g.remaining || 0,
        color: color,
        status: g.status,
        required_monthly: g.required_monthly || 0,
        projected_completion: g.projected_completion || null,
        funding_accounts: g.funding_accounts || [],
        priority: g.priority || 99
      };
    });
  },

  // Build the goals summary shape expected by SummaryCalculator.
  // Returns { emergency: {status, pct}, house: {pct}, all: [...] }
  // Looks up goals by goal_id pattern matching (contains 'emergency' or 'house').
  forSummary: function(plan) {
    var goals = GoalsCalculator.fromPlannerOutput(plan);
    var emergency = null;
    var house = null;

    goals.forEach(function(g) {
      var id = (g.goal_id || '').toLowerCase();
      if (!emergency && id.indexOf('emergency') !== -1) {
        emergency = g;
      }
      if (!house && (id.indexOf('house') !== -1 || id.indexOf('downpayment') !== -1 || id.indexOf('down_payment') !== -1)) {
        house = g;
      }
    });

    return {
      emergency: emergency ? {
        status: emergency.color,
        pct: emergency.pct,
        available: emergency.current,
        target: emergency.target
      } : null,
      house: house ? {
        pct: house.pct,
        current: house.current,
        target: house.target,
        surplus: Math.max(0, house.current - house.target)
      } : null,
      all: goals
    };
  },

  // Find a goal by ID pattern from planner goals array.
  // pattern: string to match (case-insensitive) against goal_id.
  findByIdPattern: function(planGoals, pattern) {
    if (!planGoals) return null;
    var lc = pattern.toLowerCase();
    for (var i = 0; i < planGoals.length; i++) {
      if ((planGoals[i].goal_id || '').toLowerCase().indexOf(lc) !== -1) return planGoals[i];
    }
    return null;
  }
};
