// === GOAL PLANNER RENDERER ===
// Renders monthly goal funding plan and conflict diagnostics.

var PlannerRenderer = {
  _statusLabel: function(status) {
    if (status === 'funded') return 'Funded';
    if (status === 'on_track') return 'On Track';
    if (status === 'at_risk') return 'At Risk';
    if (status === 'unfundable') return 'Unfundable';
    return 'Pending';
  },

  _statusClass: function(status) {
    if (status === 'funded' || status === 'on_track') return 'positive';
    if (status === 'at_risk' || status === 'unfundable') return 'negative';
    return '';
  },

  render: function(plan) {
    var el = document.getElementById('planningContent');
    if (!el) return;

    if (!plan || !plan.goals || !plan.goals.length) {
      el.innerHTML =
        '<div class="empty-state-panel"><div class="empty-state-icon">&#128161;</div>' +
        '<div class="empty-state-title">No planning goals</div>' +
        '<div class="empty-state-desc">Add goals in Admin → Planning to generate a funding plan.</div></div>';
      return;
    }

    var html = '';

    html += '<div class="metrics">' +
      '<div class="metric-card"><div class="label">Available for Goals</div><div class="value">' + Fmt.currency(plan.available_for_goals) + '</div></div>' +
      '<div class="metric-card"><div class="label">Required per Month</div><div class="value">' + Fmt.currency(plan.required_total) + '</div></div>' +
      '<div class="metric-card"><div class="label">Funding Gap</div><div class="value ' + (plan.shortfall_total > 0 ? 'negative' : 'positive') + '">' + Fmt.currency(plan.shortfall_total) + '</div></div>' +
      '<div class="metric-card"><div class="label">Unallocated Surplus</div><div class="value">' + Fmt.currency(plan.unallocated_surplus) + '</div></div>' +
    '</div>';

    if (plan.conflicts && plan.conflicts.length) {
      html += '<div class="summary-alerts">';
      plan.conflicts.forEach(function(g) {
        html += '<div class="summary-alert summary-alert-warning">' +
          '&#9888; ' + g.name + ': shortfall ' + Fmt.currency(g.shortfall) + '/mo at priority ' + g.priority +
          '</div>';
      });
      html += '</div>';
    }

    html += '<div class="table-container"><div class="table-header-row"><h2>Goal Funding Plan</h2></div>' +
      '<div class="nw-table-scroll"><table class="returns-table"><thead><tr>' +
      '<th>Goal</th><th>Priority</th><th>Target Date</th><th style="text-align:right">Remaining</th>' +
      '<th style="text-align:right">Required/mo</th><th style="text-align:right">Allocated/mo</th>' +
      '<th style="text-align:right">Shortfall</th><th>Status</th><th>Projected Completion</th>' +
      '</tr></thead><tbody>';

    plan.goals.forEach(function(g) {
      var cls = PlannerRenderer._statusClass(g.status);
      html += '<tr>' +
        '<td>' + g.name + '</td>' +
        '<td>P' + g.priority + '</td>' +
        '<td>' + (g.target_date || '-') + '</td>' +
        '<td style="text-align:right">' + Fmt.currency(g.remaining) + '</td>' +
        '<td style="text-align:right">' + Fmt.currency(g.required_monthly) + '</td>' +
        '<td style="text-align:right">' + Fmt.currency(g.allocated_monthly) + '</td>' +
        '<td style="text-align:right" class="' + (g.shortfall > 0 ? 'negative' : 'positive') + '">' + Fmt.currency(g.shortfall) + '</td>' +
        '<td class="' + cls + '">' + PlannerRenderer._statusLabel(g.status) + '</td>' +
        '<td>' + (g.projected_completion || 'N/A') + '</td>' +
      '</tr>';
    });

    html += '</tbody></table></div></div>';
    el.innerHTML = html;
  }
};
