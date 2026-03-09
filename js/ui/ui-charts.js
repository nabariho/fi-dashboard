// === UI: CHARTS ===
// Creates and updates Chart.js charts. Receives processed data only.

var ChartRenderer = {
  _baseTooltip: function() {
    return {
      backgroundColor: 'white', titleColor: '#202124', bodyColor: '#5f6368',
      borderColor: '#e0e0e0', borderWidth: 1, cornerRadius: 8, padding: 12
    };
  },

  _baseXScale: function() {
    return {
      grid: { display: false },
      ticks: { font: { size: 11 }, color: '#5f6368', maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }
    };
  },

  // Render portfolio evolution as stacked: contributions (bottom) + gains (top)
  renderPortfolio: function(canvasId, labels, values, contributions) {
    var ctx = document.getElementById(canvasId).getContext('2d');
    if (investChart) investChart.destroy();

    // Use pre-computed gains from calculator
    var gains = ReturnsCalculator.computeGains(values, contributions);

    investChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Investment Gains',
          data: gains,
          borderColor: '#0d904f',
          backgroundColor: 'rgba(13,144,79,0.15)',
          fill: true, tension: 0.3, pointRadius: 0, pointHitRadius: 10, borderWidth: 2,
          order: 1,
        }, {
          label: 'Money Invested',
          data: contributions,
          borderColor: '#1a73e8',
          backgroundColor: 'rgba(26,115,232,0.12)',
          fill: true, tension: 0.3, pointRadius: 0, pointHitRadius: 10, borderWidth: 2,
          order: 2,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({}, this._baseTooltip(), {
            callbacks: {
              title: function(items) {
                var total = items.reduce(function(s, i) { return s + i.parsed.y; }, 0);
                return 'Portfolio: ' + Fmt.currency(total);
              },
              label: function(ctx) { return '  ' + ctx.dataset.label + ': ' + Fmt.currency(ctx.parsed.y); }
            }
          })
        },
        scales: {
          x: this._baseXScale(),
          y: {
            stacked: true,
            grid: { color: '#f0f0f0' },
            ticks: { font: { size: 11 }, color: '#5f6368', callback: function(v) { return Fmt.compact(v); } }
          }
        }
      }
    });
  },

  // Render per-account returns comparison bar chart
  renderAccountComparison: function(canvasId, comparison) {
    var ctx = document.getElementById(canvasId).getContext('2d');
    if (window._acctCompChart) window._acctCompChart.destroy();

    var ids = Object.keys(comparison.accounts);
    var labels = ids.map(function(id) { return AccountService.getName(id); });
    var monthlyData = ids.map(function(id) { return comparison.accounts[id].monthly; });
    var ytdData = ids.map(function(id) { return comparison.accounts[id].ytd; });
    var cumData = ids.map(function(id) { return comparison.accounts[id].cumReturn; });

    window._acctCompChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Monthly',
            data: monthlyData,
            backgroundColor: 'rgba(26,115,232,0.7)',
            borderRadius: 4
          },
          {
            label: 'YTD',
            data: ytdData,
            backgroundColor: 'rgba(13,144,79,0.7)',
            borderRadius: 4
          },
          {
            label: 'All-Time',
            data: cumData,
            backgroundColor: 'rgba(147,52,230,0.7)',
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: { size: 12 }, usePointStyle: true, pointStyle: 'rectRounded' } },
          tooltip: Object.assign({}, this._baseTooltip(), {
            callbacks: {
              label: function(ctx) { return '  ' + ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(2).replace('.', ',') + ' %'; }
            }
          })
        },
        scales: {
          x: this._baseXScale(),
          y: {
            grid: { color: '#f0f0f0' },
            ticks: { font: { size: 11 }, color: '#5f6368', callback: function(v) { return v.toFixed(0) + '%'; } }
          }
        }
      }
    });
  },

  // Render FI projection line chart
  renderFIProjection: function(canvasId, projectionData, fiTarget, historicalNW) {
    var ctx = document.getElementById(canvasId).getContext('2d');
    if (window._fiProjChart) window._fiProjChart.destroy();

    // Historical data points
    var histLabels = historicalNW.map(function(r) { return r.month; });
    var histValues = historicalNW.map(function(r) { return r.total; });

    // Projection data points (labeled by year)
    var now = new Date();
    var projLabels = projectionData.map(function(p) { return (now.getFullYear() + p.yearsFromNow).toString(); });
    var projValues = projectionData.map(function(p) { return p.value; });

    // Merge: use historical months, then projected years (skip overlap)
    var allLabels = histLabels.concat(projLabels.slice(1));
    var histDataset = histValues.concat(new Array(projLabels.length - 1).fill(null));
    var projDataset = new Array(histLabels.length - 1).fill(null).concat([histValues[histValues.length - 1]]).concat(projValues.slice(1));

    // FI target line
    var targetLine = allLabels.map(function() { return fiTarget; });

    window._fiProjChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: allLabels,
        datasets: [
          {
            label: 'Actual Net Worth',
            data: histDataset,
            borderColor: '#1a73e8',
            backgroundColor: 'rgba(26,115,232,0.08)',
            fill: true, tension: 0.3, pointRadius: 0, pointHitRadius: 10, borderWidth: 2.5
          },
          {
            label: 'Projected',
            data: projDataset,
            borderColor: '#9334e6',
            borderDash: [6, 4],
            backgroundColor: 'rgba(147,52,230,0.06)',
            fill: true, tension: 0.3, pointRadius: 0, pointHitRadius: 10, borderWidth: 2
          },
          {
            label: 'FI Target',
            data: targetLine,
            borderColor: '#ea4335',
            borderDash: [4, 4],
            borderWidth: 1.5, pointRadius: 0, fill: false
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { font: { size: 12 }, usePointStyle: true, pointStyle: 'rectRounded' } },
          tooltip: Object.assign({}, this._baseTooltip(), {
            callbacks: {
              label: function(ctx) {
                if (ctx.parsed.y === null) return null;
                return '  ' + ctx.dataset.label + ': ' + Fmt.currency(ctx.parsed.y);
              }
            }
          })
        },
        scales: {
          x: Object.assign({}, this._baseXScale(), { ticks: { font: { size: 11 }, color: '#5f6368', maxRotation: 0, autoSkip: true, maxTicksLimit: 15 } }),
          y: {
            grid: { color: '#f0f0f0' },
            ticks: { font: { size: 11 }, color: '#5f6368', callback: function(v) { return Fmt.compact(v); } }
          }
        }
      }
    });
  },

  // Render stacked area chart for net worth breakdown
  renderNetWorth: function(canvasId, legendId, labels, accountIds, data) {
    var ctx = document.getElementById(canvasId).getContext('2d');
    if (nwChart) nwChart.destroy();

    // Check if mortgage data exists
    var hasMortgage = data.some(function(r) { return r.liabilities > 0 || r.house_value > 0; });

    // Account datasets (stacked area)
    var datasets = accountIds.filter(function(a) {
      return data.some(function(r) { return r.accounts[a] > 0; });
    }).map(function(a) {
      return {
        label: AccountService.getName(a),
        data: data.map(function(r) { return r.accounts[a] || 0; }),
        borderColor: AccountService.getColor(a),
        backgroundColor: AccountService.getColor(a) + '33',
        fill: true, tension: 0.3, pointRadius: 0, pointHitRadius: 10, borderWidth: 1.5,
        stack: 'assets'
      };
    });

    if (hasMortgage) {
      // House value as a stacked asset
      datasets.push({
        label: 'House Value',
        data: data.map(function(r) { return r.house_value || 0; }),
        borderColor: '#8B4513',
        backgroundColor: '#8B451333',
        fill: true, tension: 0.3, pointRadius: 0, pointHitRadius: 10, borderWidth: 1.5,
        stack: 'assets'
      });

      // Net Worth line (non-stacked overlay)
      datasets.push({
        label: 'Net Worth',
        data: data.map(function(r) { return r.total; }),
        borderColor: '#202124',
        backgroundColor: 'transparent',
        fill: false, tension: 0.3, pointRadius: 2, pointHitRadius: 10, borderWidth: 2.5,
        borderDash: [6, 3],
        stack: 'networth'
      });
    }

    // Build legend
    var legendHtml = datasets.map(function(ds) {
      var style = ds.borderDash ? 'border-top:2px dashed ' + ds.borderColor : 'background:' + ds.borderColor;
      var dotStyle = ds.borderDash
        ? 'width:14px;height:0;border-top:2px dashed ' + ds.borderColor + ';margin-right:6px;align-self:center'
        : 'background:' + ds.borderColor;
      if (ds.borderDash) {
        return '<div class="legend-item"><div style="' + dotStyle + '"></div>' + ds.label + '</div>';
      }
      return '<div class="legend-item"><div class="legend-dot" style="background:' + ds.borderColor + '"></div>' + ds.label + '</div>';
    }).join('');
    document.getElementById(legendId).innerHTML = legendHtml;

    nwChart = new Chart(ctx, {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({}, this._baseTooltip(), {
            callbacks: {
              label: function(ctx) {
                return ctx.dataset.label + ': ' + Fmt.currency(ctx.parsed.y);
              },
              footer: function(items) {
                var idx = items[0] ? items[0].dataIndex : 0;
                var row = data[idx];
                if (!row) return '';
                if (hasMortgage) {
                  return 'Total Assets: ' + Fmt.currency(row.assets) +
                    '\nMortgage Debt: ' + Fmt.currency(row.liabilities) +
                    '\nNet Worth: ' + Fmt.currency(row.total);
                }
                return 'Total: ' + Fmt.currency(row.total);
              }
            }
          })
        },
        scales: {
          x: this._baseXScale(),
          y: {
            stacked: true,
            grid: { color: '#f0f0f0' },
            ticks: { font: { size: 11 }, color: '#5f6368', callback: function(v) { return Fmt.compact(v); } }
          }
        }
      }
    });
  }
};
