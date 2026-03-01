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

    // Compute gains = value - cumulative contribution (floored at 0)
    var gains = values.map(function(v, i) { return Math.max(v - contributions[i], 0); });

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
              label: function(ctx) { return ctx.dataset.label + ': ' + Fmt.currency(ctx.parsed.y); },
              footer: function(items) {
                var total = items.reduce(function(s, i) { return s + i.parsed.y; }, 0);
                return 'Total: ' + Fmt.currency(total);
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
  },

  // Render stacked area chart for net worth breakdown
  renderNetWorth: function(canvasId, legendId, labels, accountIds, data) {
    var ctx = document.getElementById(canvasId).getContext('2d');
    if (nwChart) nwChart.destroy();

    var datasets = accountIds.filter(function(a) {
      return data.some(function(r) { return r.accounts[a] > 0; });
    }).map(function(a) {
      return {
        label: AccountService.getName(a),
        data: data.map(function(r) { return r.accounts[a] || 0; }),
        borderColor: AccountService.getColor(a),
        backgroundColor: AccountService.getColor(a) + '33',
        fill: true, tension: 0.3, pointRadius: 0, pointHitRadius: 10, borderWidth: 1.5,
      };
    });

    document.getElementById(legendId).innerHTML = datasets.map(function(ds) {
      return '<div class="legend-item"><div class="legend-dot" style="background:' + ds.borderColor + '"></div>' + ds.label + '</div>';
    }).join('');

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
              label: function(ctx) { return ctx.dataset.label + ': ' + Fmt.currency(ctx.parsed.y); },
              footer: function(items) { return 'Total: ' + Fmt.currency(items.reduce(function(s, i) { return s + i.parsed.y; }, 0)); }
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
