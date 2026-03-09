// === MONTHLY SUMMARY RENDERER ===
// Renders the monthly summary panel: narrative paragraph, metric cards, and anomaly alerts.
// No data processing — receives pre-computed data from SummaryCalculator and AnomalyCalculator.

var SummaryRenderer = {

  // Main entry: render the full summary panel.
  // summary: from SummaryCalculator.computeMonthlySummary()
  // narrative: from SummaryCalculator.generateNarrative()
  // anomalies: from AnomalyCalculator.detectAnomalies()
  renderMonthlySummary: function(summary, narrative, anomalies) {
    var container = document.getElementById('summaryPanel');
    if (!container) return;

    if (!summary) {
      container.innerHTML = '';
      return;
    }

    var html = '';

    // Anomaly alerts (if any)
    if (anomalies && anomalies.length) {
      html += this._renderAlerts(anomalies);
    }

    // Narrative paragraph
    html += '<div class="summary-narrative">' + this._escHtml(narrative) + '</div>';

    // 4 compact metric cards
    html += '<div class="summary-cards">';
    html += this._card(
      'NW Change',
      summary.nwChange,
      Fmt.pctShort(summary.nwChangePct),
      summary.nwChangeStatus !== 'negative'
    );
    html += this._card(
      'Savings',
      summary.contributions,
      'contributed',
      summary.contributionsStatus !== 'negative'
    );
    if (summary.best) {
      var bestStatus = ValueStatus.sign(summary.best.change);
      html += this._cardText(
        'Top Performer',
        summary.best.name,
        (bestStatus !== 'negative' ? '+' : '') + Fmt.currency(summary.best.change),
        bestStatus !== 'negative'
      );
    }
    if (summary.worst) {
      html += this._cardText(
        'Biggest Drop',
        summary.worst.name,
        Fmt.currency(summary.worst.change),
        false
      );
    } else if (summary.marketChange !== undefined) {
      html += this._card(
        'Market Returns',
        summary.marketChange,
        'this month',
        summary.marketChangeStatus !== 'negative'
      );
    }
    html += '</div>';

    container.innerHTML = html;
  },

  renderEmptyState: function() {
    var container = document.getElementById('summaryPanel');
    if (container) container.innerHTML = '';
  },

  // --- Private rendering helpers ---

  _card: function(label, value, subtitle, positive) {
    var sign = value >= 0 ? '+' : '';
    var colorClass = value >= 0 ? 'positive' : 'negative';
    return '<div class="summary-card">' +
      '<div class="summary-card-label">' + label + '</div>' +
      '<div class="summary-card-value ' + colorClass + '">' + sign + Fmt.currency(value) + '</div>' +
      '<div class="summary-card-sub">' + subtitle + '</div>' +
      '</div>';
  },

  _cardText: function(label, mainText, subtitle, positive) {
    var colorClass = positive ? 'positive' : 'negative';
    return '<div class="summary-card">' +
      '<div class="summary-card-label">' + label + '</div>' +
      '<div class="summary-card-value" style="font-size:16px">' + this._escHtml(mainText) + '</div>' +
      '<div class="summary-card-sub ' + colorClass + '">' + subtitle + '</div>' +
      '</div>';
  },

  _renderAlerts: function(anomalies) {
    var html = '<div class="summary-alerts">';
    anomalies.forEach(function(a) {
      var icon = a.severity === 'warning' ? '&#9888;' : '&#8505;';
      var cls = a.severity === 'warning' ? 'summary-alert-warning' : 'summary-alert-info';
      html += '<div class="summary-alert ' + cls + '">' +
        '<span class="summary-alert-icon">' + icon + '</span> ' +
        a.message +
        '</div>';
    });
    html += '</div>';
    return html;
  },

  _escHtml: function(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
