// === UI: GOALS PANEL ===
// Renders financial goals (emergency fund, house down payment). No data processing.

var GoalsRenderer = {
  _goalBar: function(pct, statusClass) {
    return '<div class="goal-bar-container">' +
      '<div class="goal-bar status-' + statusClass + '" style="width:' + Math.max(pct, 2).toFixed(1) + '%"></div>' +
      '<div class="goal-bar-label">' + pct.toFixed(1) + '%</div>' +
    '</div>';
  },

  renderGoalsPanel: function(emergency, house) {
    var el = document.getElementById('goalsPanel');
    if (!el) return;

    var html = '';

    // Emergency Fund
    var efValue = emergency.status === 'green' ? emergency.dedicated : emergency.available;
    html += '<div class="goal-item">' +
      '<div class="goal-header">' +
        '<div class="goal-name">' +
          '<span class="status-dot status-' + emergency.status + '"></span>' +
          'Emergency Fund' +
        '</div>' +
        '<div class="goal-values">' + Fmt.currencyShort(efValue) +
          ' / ' + Fmt.currencyShort(emergency.target) + '</div>' +
      '</div>' +
      this._goalBar(emergency.pct, emergency.status);

    var trName = AccountService.getName('TRADE_REPUBLIC');
    var bbvaName = AccountService.getName('BBVA');

    if (emergency.status === 'green') {
      html += '<div class="goal-note">Fully covered by ' + trName + ' (' + Fmt.currencyShort(emergency.dedicated) + ')</div>';
    } else if (emergency.status === 'yellow') {
      html += '<div class="goal-alert goal-alert-yellow">' + trName + ': ' + Fmt.currencyShort(emergency.dedicated) +
        ' + ' + bbvaName + ': ' + Fmt.currencyShort(emergency.available - emergency.dedicated) + '</div>';
    } else {
      html += '<div class="goal-alert goal-alert-red">Shortfall: ' + Fmt.currencyShort(emergency.target - emergency.available) +
        ' below target (' + trName + ': ' + Fmt.currencyShort(emergency.dedicated) + ')</div>';
    }

    html += '</div>';

    // House Down Payment
    html += '<div class="goal-item">' +
      '<div class="goal-header">' +
        '<div class="goal-name">' +
          '<span class="status-dot status-' + (house.surplus > 0 ? 'green' : 'blue') + '"></span>' +
          'House Down Payment' +
        '</div>' +
        '<div class="goal-values">' + Fmt.currencyShort(house.current) +
          ' / ' + Fmt.currencyShort(house.target) + '</div>' +
      '</div>' +
      this._goalBar(house.pct, house.surplus > 0 ? 'green' : 'blue');

    if (house.surplus > 0) {
      var efWithSurplus = emergency.available + house.surplus;
      var efPctWithSurplus = Math.min((efWithSurplus / emergency.target) * 100, 100);
      html += '<div class="goal-alert goal-alert-surplus">Surplus: ' + Fmt.currencyShort(house.surplus) +
        ' above target. Moving it to emergency fund would bring it to ' +
        Fmt.currencyShort(efWithSurplus) + ' (' + efPctWithSurplus.toFixed(1) + '% of target)</div>';
    }

    html += '</div>';

    el.innerHTML = html;
  },

  // Detailed goals breakdown for the Goals tab
  renderGoalsDetail: function(emergency, house, accounts, milestoneStatuses) {
    var el = document.getElementById('goalsDetail');
    if (!el) return;

    var trName = AccountService.getName('TRADE_REPUBLIC');
    var bbvaName = AccountService.getName('BBVA');
    var arrasName = AccountService.getName('ARRAS');
    var bankinterName = AccountService.getName('BANKINTER');

    var html = '';

    // === EMERGENCY FUND DETAIL ===
    var statusLabels = { green: 'Funded', yellow: 'Partially Funded', red: 'Underfunded' };
    html += '<div class="table-container">' +
      '<div class="table-header-row">' +
        '<h2>Emergency Fund</h2>' +
        '<span class="goal-status-badge status-' + emergency.status + '">' + statusLabels[emergency.status] + '</span>' +
      '</div>' +
      '<table><thead><tr>' +
        '<th>Account</th><th>Role</th><th style="text-align:right">Balance</th>' +
      '</tr></thead><tbody>';

    var trVal = accounts.TRADE_REPUBLIC || 0;
    var bbvaVal = accounts.BBVA || 0;

    html += '<tr><td>' + trName + '</td><td>Dedicated emergency fund</td>' +
      '<td style="text-align:right">' + Fmt.currency(trVal) + '</td></tr>';
    html += '<tr><td>' + bbvaName + '</td><td>Backup cash</td>' +
      '<td style="text-align:right">' + Fmt.currency(bbvaVal) + '</td></tr>';
    html += '<tr class="total-row"><td>Total Available</td><td></td>' +
      '<td style="text-align:right">' + Fmt.currency(emergency.available) + '</td></tr>';

    html += '</tbody></table>';

    // Calculation explanation
    html += '<div class="goals-detail-explain">' +
      '<div class="goals-detail-explain-title">How is this calculated?</div>' +
      '<div>Only cash accounts <strong>not earmarked for the house</strong> count toward the emergency fund.</div>' +
      '<div style="margin-top:6px">' + arrasName + ' and ' + bankinterName + ' are fully reserved for the house down payment and excluded from this calculation.</div>' +
      '<div class="goals-detail-calc">' +
        '<div class="calc-row"><span>' + trName + '</span><span>' + Fmt.currency(trVal) + '</span></div>' +
        '<div class="calc-row"><span>+ ' + bbvaName + '</span><span>' + Fmt.currency(bbvaVal) + '</span></div>' +
        '<div class="calc-row calc-total"><span>= Available for emergency</span><span>' + Fmt.currency(emergency.available) + '</span></div>' +
        '<div class="calc-row"><span>Target</span><span>' + Fmt.currency(emergency.target) + '</span></div>' +
        '<div class="calc-row calc-result ' + (emergency.available >= emergency.target ? 'positive' : 'negative') + '">' +
          '<span>' + (emergency.available >= emergency.target ? 'Surplus' : 'Shortfall') + '</span>' +
          '<span>' + Fmt.currency(Math.abs(emergency.available - emergency.target)) + '</span></div>' +
      '</div>';

    // Status explanation
    html += '<div class="goals-detail-status-explain">' +
      '<strong>Status logic:</strong> ' +
      '<span class="status-dot status-green"></span> Green = ' + trName + ' alone covers target | ' +
      '<span class="status-dot status-yellow"></span> Yellow = combined cash covers target | ' +
      '<span class="status-dot status-red"></span> Red = still below target' +
    '</div>';

    html += '</div></div>';

    // === HOUSE DOWN PAYMENT DETAIL ===
    var arrasVal = accounts.ARRAS || 0;
    var bankinterVal = accounts.BANKINTER || 0;

    html += '<div class="table-container">' +
      '<div class="table-header-row">' +
        '<h2>House Down Payment</h2>' +
        '<span class="goal-status-badge status-' + (house.surplus > 0 ? 'green' : 'blue') + '">' +
          (house.surplus > 0 ? 'Target Reached' : 'Saving') + '</span>' +
      '</div>' +
      '<table><thead><tr>' +
        '<th>Account</th><th>Role</th><th style="text-align:right">Balance</th>' +
      '</tr></thead><tbody>';

    html += '<tr><td>' + arrasName + '</td><td>House savings</td>' +
      '<td style="text-align:right">' + Fmt.currency(arrasVal) + '</td></tr>';
    html += '<tr><td>' + bankinterName + ' (total balance)</td><td>House savings + operating</td>' +
      '<td style="text-align:right">' + Fmt.currency(house.bankinterTotal) + '</td></tr>';

    if (house.operatingReserve > 0) {
      html += '<tr><td style="padding-left:40px">- Monthly operating reserve</td><td>Budgeted expenses</td>' +
        '<td style="text-align:right;color:var(--negative)">' + Fmt.currency(-house.operatingReserve) + '</td></tr>';
      html += '<tr><td style="padding-left:40px">= Available for house</td><td></td>' +
        '<td style="text-align:right">' + Fmt.currency(house.bankinterEffective) + '</td></tr>';
    }

    html += '<tr class="total-row"><td>Total</td><td></td>' +
      '<td style="text-align:right">' + Fmt.currency(house.current) + '</td></tr>';

    html += '</tbody></table>';

    // Calculation
    html += '<div class="goals-detail-explain">' +
      '<div class="goals-detail-calc">';

    if (house.operatingReserve > 0) {
      html += '<div class="calc-row"><span>' + bankinterName + ' (total balance)</span><span>' + Fmt.currency(house.bankinterTotal) + '</span></div>' +
        '<div class="calc-row"><span>- Monthly operating reserve</span><span>' + Fmt.currency(house.operatingReserve) + '</span></div>' +
        '<div class="calc-row calc-total"><span>= ' + bankinterName + ' available for house</span><span>' + Fmt.currency(house.bankinterEffective) + '</span></div>' +
        '<div class="calc-row" style="margin-top:8px"><span>' + arrasName + '</span><span>' + Fmt.currency(arrasVal) + '</span></div>' +
        '<div class="calc-row"><span>+ ' + bankinterName + ' (available)</span><span>' + Fmt.currency(house.bankinterEffective) + '</span></div>';
    } else {
      html += '<div class="calc-row"><span>' + arrasName + '</span><span>' + Fmt.currency(arrasVal) + '</span></div>' +
        '<div class="calc-row"><span>+ ' + bankinterName + '</span><span>' + Fmt.currency(bankinterVal) + '</span></div>';
    }

    html += '<div class="calc-row calc-total"><span>= Total saved</span><span>' + Fmt.currency(house.current) + '</span></div>' +
        '<div class="calc-row"><span>Target</span><span>' + Fmt.currency(house.target) + '</span></div>';

    if (house.surplus > 0) {
      html += '<div class="calc-row calc-result positive"><span>Surplus</span><span>' + Fmt.currency(house.surplus) + '</span></div>';
    } else {
      html += '<div class="calc-row calc-result negative"><span>Remaining</span><span>' + Fmt.currency(house.target - house.current) + '</span></div>';
    }

    html += '</div>';

    if (house.surplus > 0) {
      var efWithSurplus = emergency.available + house.surplus;
      var efPctWithSurplus = Math.min((efWithSurplus / emergency.target) * 100, 100);
      var efShortfallAfter = emergency.target - efWithSurplus;
      html += '<div class="goal-alert goal-alert-surplus" style="margin-top:12px">' +
        '<strong>Suggestion:</strong> You have ' + Fmt.currency(house.surplus) +
        ' above the house target. If moved to the emergency fund:' +
        '<div class="goals-detail-calc" style="margin-top:8px">' +
          '<div class="calc-row"><span>Current emergency fund</span><span>' + Fmt.currency(emergency.available) + '</span></div>' +
          '<div class="calc-row"><span>+ House surplus</span><span>' + Fmt.currency(house.surplus) + '</span></div>' +
          '<div class="calc-row calc-total"><span>= New emergency fund</span><span>' + Fmt.currency(efWithSurplus) + '</span></div>' +
          '<div class="calc-row"><span>Progress</span><span>' + efPctWithSurplus.toFixed(1) + '% of ' + Fmt.currencyShort(emergency.target) + '</span></div>' +
          (efShortfallAfter > 0
            ? '<div class="calc-row calc-result negative"><span>Still short by</span><span>' + Fmt.currency(efShortfallAfter) + '</span></div>'
            : '<div class="calc-row calc-result positive"><span>Emergency fund fully funded!</span><span></span></div>') +
        '</div>' +
      '</div>';
    }

    html += '</div></div>';

    // === ACTION ITEMS ===
    var actions = [];
    var efShortfall = emergency.target - emergency.available;

    if (efShortfall > 0 && house.surplus > 0) {
      var remaining = efShortfall - house.surplus;
      actions.push('Move ' + Fmt.currency(house.surplus) + ' from house savings (surplus) to ' + trName);
      if (remaining > 0) {
        actions.push('Add ' + Fmt.currency(remaining) + ' more to ' + trName + ' to fully fund the emergency fund');
      }
    } else if (efShortfall > 0) {
      actions.push('Add ' + Fmt.currency(efShortfall) + ' to ' + trName + ' to fully fund the emergency fund');
    }

    if (house.surplus <= 0 && house.target - house.current > 0) {
      actions.push('Save ' + Fmt.currency(house.target - house.current) + ' more toward the house down payment');
    }

    if (actions.length) {
      html += '<div class="table-container">' +
        '<div class="table-header-row"><h2>Action Items</h2></div>' +
        '<div class="goals-actions">' +
        actions.map(function(a, i) {
          return '<div class="goals-action-item"><span class="goals-action-num">' + (i + 1) + '</span>' + a + '</div>';
        }).join('') +
        '</div></div>';
    }

    // === MILESTONES ===
    if (milestoneStatuses && milestoneStatuses.length) {
      html += this._renderMilestones(milestoneStatuses);
    }

    el.innerHTML = html;
  },

  // Render all milestone cards
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

  // Render a single milestone card
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

    // Target date and time remaining
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

    // Overall progress bar
    html += '<div class="milestone-progress">' +
      '<div class="milestone-progress-labels">' +
        '<span>' + Fmt.currencyShort(ms.currentTotal) + ' / ' + Fmt.currencyShort(ms.totalTarget) + '</span>' +
        '<span>' + ms.progressPct.toFixed(1) + '%</span>' +
      '</div>' +
      '<div class="goal-bar-container">' +
        '<div class="goal-bar status-' + statusColor + '" style="width:' + Math.max(ms.progressPct, 2).toFixed(1) + '%"></div>';

    // Expected progress marker (glide path indicator)
    if (ms.status !== 'achieved' && ms.expectedPct > 0 && ms.expectedPct < 100) {
      html += '<div class="milestone-expected-marker" style="left:' + ms.expectedPct.toFixed(1) + '%" title="Expected: ' + ms.expectedPct.toFixed(1) + '%"></div>';
    }

    html += '</div></div>';

    // Monthly needed
    if (ms.status !== 'achieved' && ms.monthsLeft > 0) {
      html += '<div class="milestone-monthly-needed">Need ' + Fmt.currencyShort(ms.monthlyNeeded) + '/month to stay on track</div>';
    }

    // Sub-target breakdown
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
