// === WHAT-IF SCENARIO PLANNER ===
// Interactive modal with sliders for exploring FI scenarios.
// Recalculates in real-time without persisting any changes.

var WhatIfRenderer = {
  _isOpen: false,
  _baseParams: null,

  // Open the what-if modal with current baseline values
  open: function(params) {
    if (this._isOpen) return;
    this._baseParams = params;
    this._isOpen = true;

    var html = '<div class="whatif-overlay" id="whatifOverlay">' +
      '<div class="whatif-modal">' +
        '<div class="whatif-header">' +
          '<h2>What If…</h2>' +
          '<button class="cf-modal-close" id="whatifClose">&times;</button>' +
        '</div>' +
        '<div class="whatif-body">' +
          '<div class="whatif-sliders">' +
            this._slider('whatifSavings', 'Monthly Savings', params.monthlySavings,
              Math.max(0, params.monthlySavings - 1000), params.monthlySavings + 2000, 50, '€') +
            this._slider('whatifReturn', 'Expected Return', (params.expectedReturn * 100).toFixed(1),
              1, 12, 0.5, '%') +
            this._slider('whatifInflation', 'Inflation Rate', (params.inflationRate * 100).toFixed(1),
              0, 6, 0.5, '%') +
            this._slider('whatifIncome', 'Monthly Income', params.monthlyIncome,
              Math.max(0, params.monthlyIncome - 1000), params.monthlyIncome + 3000, 100, '€') +
          '</div>' +
          '<div class="whatif-results" id="whatifResults"></div>' +
        '</div>' +
      '</div>' +
    '</div>';

    document.body.insertAdjacentHTML('beforeend', html);
    this._recalculate();
    this._bindEvents();
  },

  _slider: function(id, label, value, min, max, step, unit) {
    return '<div class="whatif-slider-group">' +
      '<div class="whatif-slider-label">' +
        '<span>' + label + '</span>' +
        '<span class="whatif-slider-value" id="' + id + 'Val">' +
          (unit === '€' ? Fmt.currency(value) : value + unit) + '</span>' +
      '</div>' +
      '<input type="range" id="' + id + '" min="' + min + '" max="' + max +
        '" step="' + step + '" value="' + value + '">' +
    '</div>';
  },

  _bindEvents: function() {
    var self = this;
    var overlay = document.getElementById('whatifOverlay');

    // Close handlers
    document.getElementById('whatifClose').addEventListener('click', function() { self.close(); });
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) self.close();
    });
    var escHandler = function(e) {
      if (e.key === 'Escape') {
        self.close();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Slider input handlers
    var sliders = ['whatifSavings', 'whatifReturn', 'whatifInflation', 'whatifIncome'];
    sliders.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', function() {
          self._updateLabel(id);
          self._recalculate();
        });
      }
    });
  },

  _updateLabel: function(id) {
    var el = document.getElementById(id);
    var valEl = document.getElementById(id + 'Val');
    if (!el || !valEl) return;

    var v = parseFloat(el.value);
    if (id === 'whatifSavings' || id === 'whatifIncome') {
      valEl.textContent = Fmt.currency(v);
    } else {
      valEl.textContent = v.toFixed(1) + '%';
    }
  },

  _getSliderValues: function() {
    return {
      monthlySavings: parseFloat(document.getElementById('whatifSavings').value),
      expectedReturn: parseFloat(document.getElementById('whatifReturn').value) / 100,
      inflationRate: parseFloat(document.getElementById('whatifInflation').value) / 100,
      monthlyIncome: parseFloat(document.getElementById('whatifIncome').value)
    };
  },

  _recalculate: function() {
    var el = document.getElementById('whatifResults');
    if (!el || typeof FICalculator === 'undefined') return;

    var bp = this._baseParams;
    var wp = this._getSliderValues();

    // Current scenario
    var curYears = bp.inflationRate > 0
      ? FICalculator.yearsToFIReal(bp.currentNW, bp.monthlySavings, bp.expectedReturn, bp.inflationRate, bp.fiTarget)
      : FICalculator.yearsToFI(bp.currentNW, bp.monthlySavings, bp.expectedReturn, bp.fiTarget);
    var curRate = bp.monthlyIncome > 0 ? (bp.monthlySavings / bp.monthlyIncome * 100) : 0;

    // What-if scenario
    var wifYears = wp.inflationRate > 0
      ? FICalculator.yearsToFIReal(bp.currentNW, wp.monthlySavings, wp.expectedReturn, wp.inflationRate, bp.fiTarget)
      : FICalculator.yearsToFI(bp.currentNW, wp.monthlySavings, wp.expectedReturn, bp.fiTarget);
    var wifRate = wp.monthlyIncome > 0 ? (wp.monthlySavings / wp.monthlyIncome * 100) : 0;

    // Coast FI comparison
    var curCoast = bp.birthYear
      ? FICalculator.coastFIAnalysis(bp.currentNW, bp.fiTarget, bp.expectedReturn, bp.inflationRate, bp.birthYear, bp.retirementAge)
      : null;
    var wifCoast = bp.birthYear
      ? FICalculator.coastFIAnalysis(bp.currentNW, bp.fiTarget, wp.expectedReturn, wp.inflationRate, bp.birthYear, bp.retirementAge)
      : null;

    // FI dates
    var curDate = this._fiDateStr(curYears);
    var wifDate = this._fiDateStr(wifYears);

    // Delta
    var deltaYears = curYears - wifYears;
    var deltaMonths = Math.round(Math.abs(deltaYears) * 12);
    var deltaDir = deltaYears > 0.1 ? 'earlier' : (deltaYears < -0.1 ? 'later' : 'same');

    var html = '<table class="whatif-table">' +
      '<thead><tr><th></th><th>Current</th><th>What If</th><th>Impact</th></tr></thead>' +
      '<tbody>';

    // Years to FI
    html += this._row('Years to FI', Fmt.years(curYears), Fmt.years(wifYears),
      deltaDir === 'same' ? 'No change'
        : deltaMonths + ' months ' + deltaDir,
      deltaDir === 'earlier' ? 'positive' : (deltaDir === 'later' ? 'negative' : ''));

    // FI Date
    html += this._row('FI Date', curDate, wifDate, '', '');

    // Savings Rate
    html += this._row('Savings Rate', Fmt.pct(curRate), Fmt.pct(wifRate),
      (wifRate - curRate >= 0 ? '+' : '') + (wifRate - curRate).toFixed(1) + 'pp',
      wifRate >= curRate ? 'positive' : 'negative');

    // Coast FI
    if (curCoast && wifCoast) {
      html += this._row('Coast FI',
        curCoast.reached ? 'Reached' : Fmt.pctShort(curCoast.pct),
        wifCoast.reached ? 'Reached' : Fmt.pctShort(wifCoast.pct),
        wifCoast.reached && !curCoast.reached ? 'Now reached!' : '',
        wifCoast.reached ? 'positive' : '');
    }

    html += '</tbody></table>';

    // Insight text
    if (deltaDir !== 'same') {
      var savingsDelta = wp.monthlySavings - bp.monthlySavings;
      var returnDelta = (wp.expectedReturn - bp.expectedReturn) * 100;
      var insights = [];
      if (Math.abs(savingsDelta) >= 50) {
        insights.push((savingsDelta > 0 ? 'Saving ' : 'Reducing savings by ') +
          Fmt.currency(Math.abs(savingsDelta)) + '/mo');
      }
      if (Math.abs(returnDelta) >= 0.5) {
        insights.push((returnDelta > 0 ? '+' : '') + returnDelta.toFixed(1) + '% return');
      }
      if (insights.length) {
        html += '<div class="whatif-insight ' + (deltaDir === 'earlier' ? 'positive' : 'negative') + '">' +
          insights.join(' + ') + ' → FI ' + deltaMonths + ' months ' + deltaDir +
        '</div>';
      }
    }

    el.innerHTML = html;
  },

  _row: function(label, current, whatif, impact, impactClass) {
    return '<tr>' +
      '<td class="whatif-row-label">' + label + '</td>' +
      '<td>' + current + '</td>' +
      '<td>' + whatif + '</td>' +
      '<td class="' + (impactClass || '') + '">' + (impact || '') + '</td>' +
    '</tr>';
  },

  _fiDateStr: function(years) {
    if (years === Infinity) return 'Never';
    if (years === 0) return 'Now';
    var d = new Date();
    d.setMonth(d.getMonth() + Math.round(years * 12));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  },

  close: function() {
    var overlay = document.getElementById('whatifOverlay');
    if (overlay) overlay.remove();
    this._isOpen = false;
  }
};
