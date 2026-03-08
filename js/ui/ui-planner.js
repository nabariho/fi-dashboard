// === GOALS TAB RENDERER ===
// Renders goal funding plan, conflict diagnostics, and milestones.

var PlannerRenderer = {
  _statusLabel: function(status) {
    if (status === 'funded') return 'Funded';
    if (status === 'on_track') return 'On Track';
    if (status === 'at_risk') return 'At Risk';
    if (status === 'account_mismatch') return 'Account Mismatch';
    if (status === 'invalid_source') return 'Invalid Source';
    return 'Pending';
  },

  _statusClass: function(status) {
    if (status === 'funded' || status === 'on_track') return 'positive';
    if (status === 'at_risk' || status === 'account_mismatch' || status === 'invalid_source') return 'negative';
    return '';
  },

  render: function(plan, milestoneStatuses) {
    var el = document.getElementById('goalsContent');
    if (!el) return;

    if ((!plan || !plan.goals || !plan.goals.length) && (!milestoneStatuses || !milestoneStatuses.length)) {
      el.innerHTML =
        '<div class="empty-state-panel"><div class="empty-state-icon">&#128161;</div>' +
        '<div class="empty-state-title">No goals configured</div>' +
        '<div class="empty-state-desc">Add goals in Admin &rarr; Planning to generate a funding plan.</div></div>';
      return;
    }

    var html = '';

    // --- Funding plan ---
    if (plan && plan.goals && plan.goals.length) {
      var hasDeficit = plan.budget_deficit > 0.01;
      var healthLabel = hasDeficit ? 'Budget Deficit' : 'Budget Surplus';
      var healthValue = hasDeficit ? plan.budget_deficit : plan.budget_surplus;
      var healthClass = hasDeficit ? 'negative' : 'positive';

      html += '<div class="metrics">' +
        '<div class="metric-card"><div class="label">Monthly Savings</div><div class="value">' + Fmt.currency(plan.available_for_goals) + '</div></div>' +
        '<div class="metric-card"><div class="label">Required for Goals</div><div class="value">' + Fmt.currency(plan.required_total) + '</div></div>' +
        '<div class="metric-card"><div class="label">' + healthLabel + '</div><div class="value ' + healthClass + '">' + Fmt.currency(healthValue) + '</div></div>' +
      '</div>';

      if (plan.conflicts && plan.conflicts.length) {
        html += '<div class="summary-alerts">';
        plan.conflicts.forEach(function(c) {
          var alertClass = c.type === 'budget_deficit' ? 'summary-alert-error' : 'summary-alert-warning';
          var msg = c.message;
          if (c.type === 'budget_deficit') {
            msg = 'Your goals require ' + Fmt.currency(c.required) + '/mo but you only save ' +
              Fmt.currency(c.available) + '/mo. Reduce expenses by ' + Fmt.currency(c.deficit) +
              '/mo or extend target dates to fund all goals on time.';
          }
          html += '<div class="summary-alert ' + alertClass + '">' +
            '&#9888; ' + msg +
            '</div>';
        });
        html += '</div>';
      }

      html += '<div class="table-container"><div class="table-header-row"><h2>Goal Funding Plan</h2></div>' +
        '<div class="nw-table-scroll"><table class="returns-table"><thead><tr>' +
        '<th>Goal</th><th>Priority</th><th>Funding Accounts</th><th style="text-align:right">Current</th>' +
        '<th style="text-align:right">Target</th><th style="text-align:right">Remaining</th>' +
        '<th style="text-align:right">Required/mo</th><th>Target Date</th>' +
        '<th>Status</th><th>Projected Completion</th>' +
        '</tr></thead><tbody>';

      plan.goals.forEach(function(g) {
        var cls = PlannerRenderer._statusClass(g.status);
        var sources = (g.funding_accounts || []).length ? g.funding_accounts.map(function(id) { return AccountService.getName(id); }).join(', ') : '-';
        var projLabel = g.projected_completion || 'N/A';
        // Show delay if projected completion is after target date
        var delayed = g.projected_completion && g.target_date && g.projected_completion > g.target_date;
        var projClass = delayed ? 'negative' : '';
        html += '<tr>' +
          '<td>' + g.name + '</td>' +
          '<td>P' + g.priority + '</td>' +
          '<td>' + sources + '</td>' +
          '<td style="text-align:right">' + Fmt.currency(g.current_amount || 0) + '</td>' +
          '<td style="text-align:right">' + Fmt.currency(g.target_amount || 0) + '</td>' +
          '<td style="text-align:right">' + Fmt.currency(g.remaining) + '</td>' +
          '<td style="text-align:right">' + Fmt.currency(g.required_monthly) + '</td>' +
          '<td>' + (g.target_date || '-') + '</td>' +
          '<td class="' + cls + '">' + PlannerRenderer._statusLabel(g.status) + '</td>' +
          '<td class="' + projClass + '">' + projLabel + '</td>' +
        '</tr>';
      });

      html += '</tbody></table></div></div>';

      // Account-level ledger
      var ledger = plan.account_ledger || {};
      var accountIds = Object.keys(ledger).sort();
      if (accountIds.length) {
        html += '<div class="table-container"><div class="table-header-row"><h2>Account Ledger Integrity</h2></div>' +
          '<div class="nw-table-scroll"><table class="returns-table"><thead><tr>' +
          '<th>Account</th><th style="text-align:right">Balance</th><th style="text-align:right">Manual Claims</th>' +
          '<th style="text-align:right">Tracked Claims</th><th style="text-align:right">Total Claimed</th><th style="text-align:right">Unassigned</th>' +
          '</tr></thead><tbody>';

        accountIds.forEach(function(accountId) {
          var row = ledger[accountId];
          var totalClaimed = (row.manual_claims || 0) + (row.tracked_claims || 0);
          var over = totalClaimed > (row.balance || 0) + 0.01;
          html += '<tr>' +
            '<td>' + AccountService.getName(accountId) + '</td>' +
            '<td style="text-align:right">' + Fmt.currency(row.balance || 0) + '</td>' +
            '<td style="text-align:right">' + Fmt.currency(row.manual_claims || 0) + '</td>' +
            '<td style="text-align:right">' + Fmt.currency(row.tracked_claims || 0) + '</td>' +
            '<td style="text-align:right" class="' + (over ? 'negative' : 'positive') + '">' + Fmt.currency(totalClaimed) + '</td>' +
            '<td style="text-align:right">' + Fmt.currency(row.unassigned || 0) + '</td>' +
          '</tr>';
        });

        html += '</tbody></table></div></div>';
      }
    }

    // --- Milestones ---
    if (milestoneStatuses && milestoneStatuses.length) {
      html += this._renderMilestones(milestoneStatuses);
    }

    el.innerHTML = html;
  },

  _renderMilestones: function(milestoneStatuses) {
    var self = this;
    var html = '<div class="table-container">' +
      '<div class="table-header-row"><h2>Milestones</h2></div>' +
      '<div class="milestones-list">';

    milestoneStatuses.forEach(function(ms) {
      html += self._renderMilestoneCard(ms);
    });

    html += '</div></div>';
    return html;
  },

  _renderMilestoneCard: function(ms) {
    var statusLabels = { achieved: 'Achieved', ahead: 'Ahead', 'on-track': 'On Track', behind: 'Behind' };
    var statusColors = { achieved: 'green', ahead: 'green', 'on-track': 'blue', behind: 'red' };
    var statusColor = statusColors[ms.status] || 'blue';

    var html = '<div class="milestone-card">' +
      '<div class="milestone-header">' +
        '<div class="milestone-title">' +
          '<span class="status-dot status-' + statusColor + '"></span>' +
          ms.name +
        '</div>' +
        '<span class="goal-status-badge status-' + statusColor + '">' + statusLabels[ms.status] + '</span>' +
      '</div>';

    var dateLabel = ms.targetDate;
    if (ms.monthsLeft > 0) {
      var yrs = Math.floor(ms.monthsLeft / 12);
      var mos = ms.monthsLeft % 12;
      var timeStr = yrs > 0 ? yrs + 'y ' + mos + 'm' : mos + ' months';
      dateLabel += ' (' + timeStr + ' left)';
    } else if (ms.status === 'achieved') {
      dateLabel += ' (achieved)';
    } else {
      dateLabel += ' (overdue)';
    }
    html += '<div class="milestone-date">' + dateLabel + '</div>';

    html += '<div class="milestone-progress">' +
      '<div class="milestone-progress-labels">' +
        '<span>' + Fmt.currencyShort(ms.currentTotal) + ' / ' + Fmt.currencyShort(ms.totalTarget) + '</span>' +
        '<span>' + ms.progressPct.toFixed(1) + '%</span>' +
      '</div>' +
      '<div class="goal-bar-container">' +
        '<div class="goal-bar status-' + statusColor + '" style="width:' + Math.max(ms.progressPct, 2).toFixed(1) + '%"></div>';

    if (ms.status !== 'achieved' && ms.expectedPct > 0 && ms.expectedPct < 100) {
      html += '<div class="milestone-expected-marker" style="left:' + ms.expectedPct.toFixed(1) + '%" title="Expected: ' + ms.expectedPct.toFixed(1) + '%"></div>';
    }

    html += '</div></div>';

    if (ms.status !== 'achieved' && ms.monthsLeft > 0) {
      html += '<div class="milestone-monthly-needed">Need ' + Fmt.currencyShort(ms.monthlyNeeded) + '/month to stay on track</div>';
    }

    if (ms.subProgress && ms.subProgress.length) {
      html += '<div class="milestone-subs">';
      var goalLabels = { emergency_fund: 'Emergency Fund', house_downpayment: 'House Down Payment', fi_networth: 'FI Net Worth' };

      ms.subProgress.forEach(function(sub) {
        var subLabel = goalLabels[sub.goal] || sub.goal;
        var subColor = sub.pct >= 100 ? 'green' : (sub.pct >= 50 ? 'blue' : 'yellow');
        html += '<div class="milestone-sub">' +
          '<div class="milestone-sub-header">' +
            '<span>' + subLabel + '</span>' +
            '<span>' + Fmt.currencyShort(sub.current) + ' / ' + Fmt.currencyShort(sub.target) +
              ' (' + sub.pct.toFixed(0) + '%)</span>' +
          '</div>' +
          '<div class="goal-bar-container milestone-sub-bar">' +
            '<div class="goal-bar status-' + subColor + '" style="width:' + Math.max(sub.pct, 2).toFixed(1) + '%"></div>' +
          '</div>' +
        '</div>';
      });

      html += '</div>';
    }

    html += '</div>';
    return html;
  }
};
