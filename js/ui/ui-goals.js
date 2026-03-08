// === UI: GOALS PANEL ===
// Renders the always-visible financial goals summary panel (above tabs).
// Emergency fund + house down payment quick status. No data processing.

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
  }
};
