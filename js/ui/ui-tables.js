// === UI: TABLES ===
// Renders data tables. Receives processed data only.

var TableRenderer = {
  // Format a percentage in Spanish locale: "1,3 %" or "-3,4 %"
  _fmtPctES: function(val) {
    return val.toFixed(1).replace('.', ',') + ' %';
  },

  // Render the year-by-month returns grid (Indexa style)
  renderReturns: function(byYear, viewMode) {
    var years = Object.keys(byYear).sort().reverse();

    document.getElementById('returnsBody').innerHTML = years.map(function(year) {
      var months = byYear[year];
      var cells = '';

      for (var m = 0; m < 12; m++) {
        var r = months[m];
        if (!r) {
          cells += '<td class="empty"></td>';
        } else if (viewMode === 'pct') {
          var cls = r.monthly_return_pct >= 0 ? 'positive' : 'negative';
          cells += '<td class="' + cls + '">' + TableRenderer._fmtPctES(r.monthly_return_pct) + '</td>';
        } else {
          cells += '<td>' + Fmt.currency(r.end_value) + '</td>';
        }
      }

      // YTD column
      var lastM = Object.keys(months).map(Number).sort(function(a, b) { return a - b; }).pop();
      var last = months[lastM];
      var ytd;
      if (viewMode === 'pct') {
        var cls2 = last.ytd_return_pct >= 0 ? 'positive' : 'negative';
        ytd = '<td class="' + cls2 + '">' + TableRenderer._fmtPctES(last.ytd_return_pct) + '</td>';
      } else {
        ytd = '<td>' + Fmt.currency(last.end_value) + '</td>';
      }

      return '<tr><td>' + year + '</td>' + cells + ytd + '</tr>';
    }).join('');
  },

  // Render per-account comparison summary table
  renderAccountComparison: function(elementId, comparison) {
    var ids = Object.keys(comparison.accounts);
    if (!ids.length) return;

    // Compute totals for the summary row
    var totalValue = 0, totalInvested = 0;
    ids.forEach(function(id) {
      totalValue += comparison.accounts[id].currentValue;
      totalInvested += comparison.accounts[id].totalInvested;
    });
    var totalProfit = totalValue - totalInvested;
    var totalMarketPct = totalValue > 0 ? (totalProfit / totalValue * 100) : 0;

    var html = '<table class="returns-table"><thead><tr>' +
      '<th>Account</th><th style="text-align:right">Value</th><th style="text-align:right">Invested</th>' +
      '<th style="text-align:right">Market Growth</th><th style="text-align:right">Market %</th>' +
      '<th style="text-align:right">Monthly</th><th style="text-align:right">YTD</th>' +
      '<th style="text-align:right">All-Time</th></tr></thead><tbody>';

    ids.forEach(function(id) {
      var a = comparison.accounts[id];
      var profitCls = a.profit >= 0 ? 'positive' : 'negative';
      var momCls = a.monthly >= 0 ? 'positive' : 'negative';
      var ytdCls = a.ytd >= 0 ? 'positive' : 'negative';
      var cumCls = a.cumReturn >= 0 ? 'positive' : 'negative';
      var marketPct = a.currentValue > 0 ? (a.profit / a.currentValue * 100) : 0;
      var marketPctCls = marketPct >= 0 ? 'positive' : 'negative';

      html += '<tr>' +
        '<td>' + AccountService.getName(id) + '</td>' +
        '<td style="text-align:right">' + Fmt.currency(a.currentValue) + '</td>' +
        '<td style="text-align:right">' + Fmt.currency(a.totalInvested) + '</td>' +
        '<td style="text-align:right" class="' + profitCls + '">' + Fmt.currency(a.profit) + '</td>' +
        '<td style="text-align:right" class="' + marketPctCls + '">' + TableRenderer._fmtPctES(marketPct) + '</td>' +
        '<td style="text-align:right" class="' + momCls + '">' + TableRenderer._fmtPctES(a.monthly) + '</td>' +
        '<td style="text-align:right" class="' + ytdCls + '">' + TableRenderer._fmtPctES(a.ytd) + '</td>' +
        '<td style="text-align:right" class="' + cumCls + '">' + TableRenderer._fmtPctES(a.cumReturn) + '</td>' +
        '</tr>';
    });

    // Total row
    var totalProfitCls = totalProfit >= 0 ? 'positive' : 'negative';
    var totalMarketCls = totalMarketPct >= 0 ? 'positive' : 'negative';
    html += '<tr class="total-row">' +
      '<td>TOTAL</td>' +
      '<td style="text-align:right">' + Fmt.currency(totalValue) + '</td>' +
      '<td style="text-align:right">' + Fmt.currency(totalInvested) + '</td>' +
      '<td style="text-align:right" class="' + totalProfitCls + '">' + Fmt.currency(totalProfit) + '</td>' +
      '<td style="text-align:right" class="' + totalMarketCls + '">' + TableRenderer._fmtPctES(totalMarketPct) + '</td>' +
      '<td colspan="3"></td></tr>';

    html += '</tbody></table>';
    document.getElementById(elementId).innerHTML = html;
  },

  // Render the net worth monthly breakdown table with MoM deltas
  renderNetWorthBreakdown: function(data, brokerIds, cashIds) {
    // Show up to 6 most recent months from the (already time-filtered) data
    var maxCols = Math.min(data.length, 6);
    var recent = data.slice(-maxCols).reverse();

    // Total columns = account name + months + change
    var colCount = recent.length + 2;

    // Header
    document.getElementById('nwTableHead').innerHTML =
      '<tr><th></th>' +
      recent.map(function(r) { return '<th>' + r.month + '</th>'; }).join('') +
      '<th>Change</th></tr>';

    var rows = '';

    // Broker section
    rows += this._sectionRow('Investments', colCount);
    brokerIds.forEach(function(a) {
      var delta = TableRenderer._computeDelta(recent, a);
      rows += '<tr><td>' + AccountService.getName(a) + '</td>' +
        recent.map(function(r) {
          var val = r.accounts[a] || 0;
          return '<td>' + (val > 0 ? Fmt.currency(val) : '-') + '</td>';
        }).join('') +
        TableRenderer._deltaCell(delta) + '</tr>';
    });
    rows += this._totalRowWithDelta('Subtotal', recent, 'investments');

    // Cash section
    rows += this._sectionRow('Bank Accounts', colCount);
    cashIds.forEach(function(a) {
      var delta = TableRenderer._computeDelta(recent, a);
      rows += '<tr><td>' + AccountService.getName(a) + '</td>' +
        recent.map(function(r) {
          var val = r.accounts[a] || 0;
          return '<td>' + (val > 0 ? Fmt.currency(val) : '-') + '</td>';
        }).join('') +
        TableRenderer._deltaCell(delta) + '</tr>';
    });
    rows += this._totalRowWithDelta('Subtotal', recent, 'bank');

    // Grand total
    var totalDelta = recent.length >= 2 ? recent[0].total - recent[1].total : 0;
    rows += '<tr class="total-row" style="font-size:15px"><td>NET WORTH</td>' +
      recent.map(function(r) { return '<td>' + Fmt.currency(r.total) + '</td>'; }).join('') +
      this._deltaCell(totalDelta) + '</tr>';

    document.getElementById('nwTableBody').innerHTML = rows;
  },

  _computeDelta: function(recent, accountId) {
    if (recent.length < 2) return 0;
    return (recent[0].accounts[accountId] || 0) - (recent[1].accounts[accountId] || 0);
  },

  _deltaCell: function(delta) {
    if (delta === 0) return '<td class="delta-cell">-</td>';
    var cls = delta >= 0 ? 'positive' : 'negative';
    var sign = delta >= 0 ? '+' : '';
    return '<td class="delta-cell ' + cls + '">' + sign + Fmt.currencyShort(delta) + '</td>';
  },

  _sectionRow: function(label, colCount) {
    return '<tr class="section-row"><td colspan="' + colCount + '">' + label + '</td></tr>';
  },

  _totalRowWithDelta: function(label, recent, field) {
    var delta = recent.length >= 2 ? recent[0][field] - recent[1][field] : 0;
    return '<tr class="total-row"><td>' + label + '</td>' +
      recent.map(function(r) { return '<td>' + Fmt.currency(r[field]) + '</td>'; }).join('') +
      this._deltaCell(delta) + '</tr>';
  }
};
