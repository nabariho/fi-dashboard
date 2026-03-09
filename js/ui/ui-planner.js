// === GOALS TAB RENDERER ===
// Renders goal cards (expandable), funding summary, account ledger, FI timeline.

var PlannerRenderer = {
  _efData: null,
  _efRendered: false,

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

  _statusColor: function(status) {
    if (status === 'funded') return 'green';
    if (status === 'on_track') return 'blue';
    if (status === 'at_risk') return 'red';
    return 'yellow';
  },

  _confidenceLabel: function(confidence) {
    if (confidence === 'high') return 'High';
    if (confidence === 'medium') return 'Medium';
    if (confidence === 'low') return 'Low';
    return '-';
  },

  _confidenceClass: function(confidence) {
    if (confidence === 'high') return 'positive';
    if (confidence === 'medium') return '';
    if (confidence === 'low') return 'negative';
    return '';
  },

  render: function(plan, milestoneStatuses, fundingHistory, actions, fiProjection, efData) {
    var el = document.getElementById('goalsContent');
    if (!el) return;

    this._efData = efData || null;
    this._efRendered = false;

    if ((!plan || !plan.goals || !plan.goals.length) && (!milestoneStatuses || !milestoneStatuses.length)) {
      el.innerHTML =
        '<div class="empty-state-panel"><div class="empty-state-icon">&#128161;</div>' +
        '<div class="empty-state-title">No goals configured</div>' +
        '<div class="empty-state-desc">Add goals in Admin &rarr; Planning to generate a funding plan.</div></div>';
      return;
    }

    var html = '';

    // --- Recommended Actions ---
    if (actions && actions.length) {
      html += this._renderActions(actions);
    }

    // --- Funding summary metrics ---
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

      // Conflicts
      if (plan.conflicts && plan.conflicts.length) {
        html += '<div class="summary-alerts">';
        plan.conflicts.forEach(function(c) {
          var alertClass = c.type === 'budget_deficit' ? 'summary-alert-error' : 'summary-alert-warning';
          var msg = c.message;
          if (c.type === 'budget_deficit') {
            msg = 'Your goals require ' + Fmt.currency(c.required) + '/mo but you only save ' +
              Fmt.currency(c.available) + '/mo. Reduce expenses by ' + Fmt.currency(c.deficit) +
              '/mo or extend target dates.';
          }
          html += '<div class="summary-alert ' + alertClass + '">&#9888; ' + msg + '</div>';
        });
        html += '</div>';
      }

      // --- Goal Cards ---
      html += this._renderGoalCards(plan.goals, milestoneStatuses, fundingHistory);

      // --- Account Ledger Integrity ---
      var ledger = plan.account_ledger || {};
      var accountIds = Object.keys(ledger).sort();
      if (accountIds.length) {
        html += this._renderLedger(ledger, accountIds);
      }
    }

    // --- FI Journey Timeline ---
    if (fiProjection && plan && plan.goals) {
      html += this._renderJourneyTimeline(plan.goals, fiProjection);
    }

    // --- FI Timeline details ---
    if (fiProjection) {
      html += this._renderFITimeline(plan, fiProjection);
    }

    el.innerHTML = html;
  },

  // --- Goal Cards (expandable) ---
  _renderGoalCards: function(goals, milestoneStatuses, fundingHistory) {
    var self = this;

    // Build lookup maps
    var milestoneByGoal = {};
    if (milestoneStatuses && milestoneStatuses.length) {
      milestoneStatuses.forEach(function(ms) {
        if (ms.goal_id) milestoneByGoal[ms.goal_id] = ms;
      });
    }

    var fundingByGoal = {};
    if (fundingHistory && fundingHistory.goals) {
      fundingHistory.goals.forEach(function(fg) {
        if (fg.goal_id) fundingByGoal[fg.goal_id] = fg;
      });
    }

    var html = '<div class="goal-cards-grid">';

    goals.forEach(function(g) {
      html += self._renderGoalCard(g, milestoneByGoal[g.goal_id], fundingByGoal[g.goal_id]);
    });

    html += '</div>';
    return html;
  },

  _renderGoalCard: function(goal, milestone, funding) {
    var color = this._statusColor(goal.status);
    var pct = goal.progressPct !== undefined ? goal.progressPct : (goal.target_amount > 0 ? Math.min((goal.current_amount / goal.target_amount) * 100, 100) : 0);
    var cardId = 'goal-card-' + (goal.goal_id || '').replace(/[^a-zA-Z0-9]/g, '_');
    var isEF = (goal.goal_id || '').toLowerCase().indexOf('emergency') !== -1;

    // Header (always visible)
    var html = '<div class="goal-expand-card" id="' + cardId + '">' +
      '<div class="goal-expand-header" onclick="PlannerRenderer.toggleCard(\'' + cardId + '\')">' +
        '<div class="goal-expand-left">' +
          '<div class="goal-expand-title">' +
            '<span class="status-dot status-' + color + '"></span>' +
            goal.name +
            '<span class="goal-priority-tag">P' + goal.priority + '</span>' +
            '<span class="goal-status-badge status-' + color + '" style="font-size:11px;padding:2px 8px;">' +
              this._statusLabel(goal.status) + '</span>' +
          '</div>' +
          '<div class="goal-expand-progress">' +
            '<div class="goal-bar-container">' +
              '<div class="goal-bar status-' + color + '" style="width:' + Math.max(pct, 2).toFixed(1) + '%"></div>' +
              '<div class="goal-bar-label">' + pct.toFixed(1) + '%</div>' +
            '</div>' +
          '</div>' +
          '<div class="goal-expand-amounts">' +
            Fmt.currencyShort(goal.current_amount || 0) + ' / ' + Fmt.currencyShort(goal.target_amount || 0) +
          '</div>' +
        '</div>' +
        '<div class="goal-expand-right">' +
          '<div class="goal-expand-meta">' +
            '<span class="' + this._confidenceClass(goal.confidence) + '">' +
              this._confidenceLabel(goal.confidence) + ' confidence</span>' +
            (goal.projected_completion
              ? '<span>ETA ' + goal.projected_completion + '</span>'
              : '') +
          '</div>' +
          '<div class="goal-expand-chevron">&#9660;</div>' +
        '</div>' +
      '</div>';

    // Body (hidden by default, shown on expand)
    html += '<div class="goal-expand-body">';

    // Detail grid
    html += '<div class="goal-detail-grid">';
    html += this._detailItem('Remaining', Fmt.currency(goal.remaining));
    html += this._detailItem('Required/mo', Fmt.currency(goal.required_monthly));
    html += this._detailItem('Target Date', goal.target_date || 'Not set');

    var sources = (goal.funding_accounts || []).length
      ? goal.funding_accounts.map(function(id) { return AccountService.getName(id); }).join(', ')
      : 'Not specified';
    html += this._detailItem('Funding Accounts', sources);

    if (goal.projected_completion && goal.target_date && goal.projected_completion > goal.target_date) {
      html += this._detailItem('Delay', '<span class="negative">Projected ' + goal.projected_completion + ' (after target)</span>');
    }
    html += '</div>';

    // Actual vs planned funding
    if (funding) {
      html += '<div class="goal-funding-actual">';
      html += this._detailItem('Planned/mo', Fmt.currency(funding.avgPlanned));
      html += this._detailItem('Actual Avg/mo', Fmt.currency(funding.avgActual));
      var delta = funding.delta;
      html += this._detailItem('Delta', '<span class="' + (delta >= 0 ? 'positive' : 'negative') + '">' +
        (delta >= 0 ? '+' : '') + Fmt.currency(delta) + '</span>');
      html += '</div>';
    }

    // Glide path (from milestone data)
    if (milestone) {
      html += '<div class="goal-glide-section">';
      html += this._renderMilestoneCard(milestone);
      html += '</div>';
    }

    // EF detail placeholder (rendered lazily on expand)
    if (isEF) {
      html += '<div class="goal-ef-detail" id="' + cardId + '-ef-detail"></div>';
    }

    html += '</div>'; // goal-expand-body
    html += '</div>'; // goal-expand-card
    return html;
  },

  _detailItem: function(label, value) {
    return '<div class="goal-detail-item">' +
      '<span class="label">' + label + '</span>' +
      '<span class="value">' + value + '</span>' +
    '</div>';
  },

  toggleCard: function(cardId) {
    var card = document.getElementById(cardId);
    if (!card) return;
    var isExpanded = card.classList.contains('expanded');
    card.classList.toggle('expanded');

    // Lazy-render EF detail on first expand
    if (!isExpanded && !this._efRendered && this._efData) {
      var efContainer = document.getElementById(cardId + '-ef-detail');
      if (efContainer && typeof EmergencyRenderer !== 'undefined') {
        EmergencyRenderer.renderEmbedded(
          efContainer,
          this._efData.status,
          this._efData.history,
          this._efData.coverage,
          this._efData.roles
        );
        this._efRendered = true;
      }
    }
  },

  // --- Actions ---
  _renderActions: function(actions) {
    var severityIcons = { error: '&#9888;', warning: '&#9888;', info: '&#128161;', success: '&#10003;' };
    var severityClasses = { error: 'summary-alert-error', warning: 'summary-alert-warning', info: 'summary-alert-info', success: 'summary-alert-success' };

    var html = '<div class="table-container"><div class="table-header-row"><h2>Recommended Actions</h2></div>' +
      '<div class="actions-list">';

    actions.forEach(function(a) {
      var icon = severityIcons[a.severity] || '&#128161;';
      var cls = severityClasses[a.severity] || 'summary-alert-info';
      html += '<div class="summary-alert ' + cls + '">' +
        '<div><strong>' + icon + ' ' + a.message + '</strong></div>';
      if (a.detail) {
        html += '<div class="action-detail">' + a.detail + '</div>';
      }
      html += '</div>';
    });

    html += '</div></div>';
    return html;
  },

  // --- Account Ledger ---
  _renderLedger: function(ledger, accountIds) {
    var html = '<div class="table-container"><div class="table-header-row"><h2>Account Ledger Integrity</h2></div>' +
      '<div class="nw-table-scroll"><table class="returns-table"><thead><tr>' +
      '<th>Account</th><th class="text-right">Balance</th><th class="text-right">Manual Claims</th>' +
      '<th class="text-right">Tracked Claims</th><th class="text-right">Total Claimed</th><th class="text-right">Unassigned</th>' +
      '</tr></thead><tbody>';

    accountIds.forEach(function(accountId) {
      var row = ledger[accountId];
      var totalClaimed = (row.manual_claims || 0) + (row.tracked_claims || 0);
      var over = totalClaimed > (row.balance || 0) + 0.01;
      html += '<tr>' +
        '<td>' + AccountService.getName(accountId) + '</td>' +
        '<td class="text-right">' + Fmt.currency(row.balance || 0) + '</td>' +
        '<td class="text-right">' + Fmt.currency(row.manual_claims || 0) + '</td>' +
        '<td class="text-right">' + Fmt.currency(row.tracked_claims || 0) + '</td>' +
        '<td class="text-right ' + (over ? 'negative' : 'positive') + '">' + Fmt.currency(totalClaimed) + '</td>' +
        '<td class="text-right">' + Fmt.currency(row.unassigned || 0) + '</td>' +
      '</tr>';
    });

    html += '</tbody></table></div></div>';
    return html;
  },

  // --- FI Journey Timeline (visual) ---
  _renderJourneyTimeline: function(goals, fiProjection) {
    var events = [];
    var now = new Date();
    var nowStr = now.getFullYear() + '-' + (now.getMonth() < 9 ? '0' : '') + (now.getMonth() + 1);

    goals.forEach(function(g) {
      if (g.status === 'funded') {
        events.push({ label: g.name, date: 'Funded', monthsFromNow: -1, status: 'funded' });
      } else if (g.projected_completion) {
        var months = DateUtils.monthsBetween(nowStr, g.projected_completion);
        var delayed = g.target_date && g.projected_completion > g.target_date;
        events.push({ label: g.name, date: g.projected_completion, monthsFromNow: months, status: delayed ? 'delayed' : 'on_track' });
      }
    });

    if (fiProjection.fiDate && fiProjection.fiDate !== 'now') {
      var fiMonths = Math.ceil(fiProjection.yearsToFI * 12);
      events.push({ label: 'Financial Independence', date: fiProjection.fiDate, monthsFromNow: fiMonths, status: 'fi' });
    }

    events.sort(function(a, b) { return a.monthsFromNow - b.monthsFromNow; });

    var futureEvents = events.filter(function(e) { return e.monthsFromNow > 0; });
    if (!futureEvents.length) return '';

    var maxMonths = futureEvents[futureEvents.length - 1].monthsFromNow;

    var html = '<div class="table-container"><div class="table-header-row"><h2>FI Journey</h2></div>' +
      '<div class="journey-timeline">';

    html += '<div class="journey-now"><span class="journey-now-label">Now</span></div>';
    html += '<div class="journey-bar">';

    futureEvents.forEach(function(e) {
      var pct = maxMonths > 0 ? (e.monthsFromNow / maxMonths * 100) : 100;
      var colorMap = { funded: '#0d904f', on_track: '#1a73e8', delayed: '#ea4335', fi: '#9334e6' };
      var color = colorMap[e.status] || '#1a73e8';

      var dateLabel = e.date;
      if (dateLabel && dateLabel.length === 7) {
        var parts = dateLabel.split('-');
        var mn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        dateLabel = mn[parseInt(parts[1]) - 1] + ' ' + parts[0];
      }

      html += '<div class="journey-event" style="left:' + pct.toFixed(1) + '%">' +
        '<div class="journey-dot" style="background:' + color + '"></div>' +
        '<div class="journey-label">' +
          '<span class="journey-event-name" style="color:' + color + '">' + e.label + '</span>' +
          '<span class="journey-event-date">' + dateLabel + '</span>' +
        '</div>' +
      '</div>';
    });

    html += '</div></div></div>';
    return html;
  },

  // Delegate to DateUtils
  _monthsBetween: function(from, to) {
    return DateUtils.monthsBetween(from, to);
  },

  // --- FI Timeline details ---
  _renderFITimeline: function(plan, fiProjection) {
    var html = '<div class="table-container"><div class="table-header-row"><h2>FI Timeline</h2></div>';
    html += '<div class="fi-timeline-content">';

    if (fiProjection.fiDate === 'now') {
      html += '<div class="fi-timeline-headline positive">You have reached Financial Independence!</div>';
    } else if (fiProjection.fiDate) {
      var parts = fiProjection.fiDate.split('-');
      var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      var dateLabel = monthNames[parseInt(parts[1]) - 1] + ' ' + parts[0];
      html += '<div class="fi-timeline-headline">At current pace, FI by <strong>' + dateLabel + '</strong>' +
        ' (' + fiProjection.yearsToFI.toFixed(1) + ' years)</div>';
    } else {
      html += '<div class="fi-timeline-headline negative">FI target not reachable at current savings rate.</div>';
    }

    // Per-goal completion dates
    if (plan && plan.goals && plan.goals.length) {
      var activeGoals = plan.goals.filter(function(g) { return g.status !== 'funded'; });
      if (activeGoals.length) {
        html += '<div class="fi-timeline-goals">';
        activeGoals.forEach(function(g) {
          var label = g.projected_completion || 'N/A';
          var delayed = g.projected_completion && g.target_date && g.projected_completion > g.target_date;
          html += '<span class="fi-timeline-goal">' + g.name + ': ' +
            '<strong class="' + (delayed ? 'negative' : '') + '">' + label + '</strong></span>';
        });
        html += '</div>';
      }
    }

    // Sensitivity table
    if (fiProjection.sensitivity && fiProjection.sensitivity.length) {
      html += '<div class="fi-sensitivity"><table class="returns-table"><thead><tr>' +
        '<th class="text-right">Save Extra/mo</th><th>FI Date</th>' +
        '<th class="text-right">Years Saved</th>' +
        '</tr></thead><tbody>';

      fiProjection.sensitivity.forEach(function(s) {
        var dLabel = s.fiDate || 'N/A';
        if (s.fiDate && s.fiDate !== 'now') {
          var p = s.fiDate.split('-');
          var mn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          dLabel = mn[parseInt(p[1]) - 1] + ' ' + p[0];
        }
        var saved = s.yearsSaved === Infinity ? '-' : s.yearsSaved.toFixed(1) + ' years';
        html += '<tr>' +
          '<td class="text-right">+' + Fmt.currency(s.extraSavings) + '</td>' +
          '<td>' + dLabel + '</td>' +
          '<td class="text-right positive">' + saved + '</td>' +
        '</tr>';
      });

      html += '</tbody></table></div>';
    }

    html += '</div></div>';
    return html;
  },

  // --- Milestone card (reused inside goal card body) ---
  _renderMilestoneCard: function(ms) {
    var statusLabels = { achieved: 'Achieved', ahead: 'Ahead', 'on-track': 'On Track', behind: 'Behind' };
    var statusColors = { achieved: 'green', ahead: 'green', 'on-track': 'blue', behind: 'red' };
    var statusColor = statusColors[ms.status] || 'blue';

    var html = '<div class="milestone-card">' +
      '<div class="milestone-header">' +
        '<div class="milestone-title">' +
          '<span class="status-dot status-' + statusColor + '"></span>' +
          'Glide Path' +
        '</div>' +
        '<span class="goal-status-badge status-' + statusColor + '">' + (statusLabels[ms.status] || ms.status) + '</span>' +
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
      ms.subProgress.forEach(function(sub) {
        var subLabel = sub.goal.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
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
