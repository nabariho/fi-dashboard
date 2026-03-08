// === UI: GOALS PANEL ===
// Renders the always-visible financial goals summary panel (above tabs).
// Shows all active planner goals with progress bars. No data processing.

var GoalsRenderer = {
  _goalBar: function(pct, colorClass) {
    return '<div class="goal-bar-container">' +
      '<div class="goal-bar status-' + colorClass + '" style="width:' + Math.max(pct, 2).toFixed(1) + '%"></div>' +
      '<div class="goal-bar-label">' + pct.toFixed(1) + '%</div>' +
    '</div>';
  },

  // goals: array from GoalsCalculator.fromPlannerOutput()
  // budgetHealth: { deficit, surplus } from plan output (optional)
  renderGoalsPanel: function(goals, budgetHealth) {
    var el = document.getElementById('goalsPanel');
    if (!el) return;

    if (!goals || !goals.length) {
      el.innerHTML =
        '<div class="goal-item" style="opacity:0.6">' +
        '<div class="goal-header"><div class="goal-name">No goals configured</div></div>' +
        '<div class="goal-note">Add goals in Admin &rarr; Planning to track progress.</div>' +
        '</div>';
      return;
    }

    var html = '';

    // Sort by priority (lower = more important)
    var sorted = goals.slice().sort(function(a, b) {
      return (a.priority || 99) - (b.priority || 99);
    });

    sorted.forEach(function(g) {
      html += '<div class="goal-item">' +
        '<div class="goal-header">' +
          '<div class="goal-name">' +
            '<span class="status-dot status-' + g.color + '"></span>' +
            g.name +
          '</div>' +
          '<div class="goal-values">' + Fmt.currencyShort(g.current) +
            ' / ' + Fmt.currencyShort(g.target) + '</div>' +
        '</div>' +
        GoalsRenderer._goalBar(g.pct, g.color);

      // Status detail line
      if (g.status === 'funded') {
        html += '<div class="goal-note">Target reached</div>';
      } else if (g.remaining > 0) {
        var detail = Fmt.currencyShort(g.remaining) + ' remaining';
        if (g.required_monthly > 0) {
          detail += ' &middot; ' + Fmt.currencyShort(g.required_monthly) + '/mo needed';
        }
        if (g.projected_completion) {
          detail += ' &middot; ETA ' + g.projected_completion;
        }
        var detailClass = g.color === 'yellow' || g.color === 'red' ? 'goal-alert goal-alert-' + g.color : 'goal-note';
        html += '<div class="' + detailClass + '">' + detail + '</div>';
      }

      html += '</div>';
    });

    // Budget health banner
    if (budgetHealth && budgetHealth.deficit > 0.01) {
      html += '<div class="goal-alert goal-alert-red" style="margin-top:8px">' +
        'Budget deficit: ' + Fmt.currency(budgetHealth.deficit) + '/mo needed to fund all goals on time.' +
        '</div>';
    }

    el.innerHTML = html;
  }
};
