// === GLOBAL STATE ===
var appConfig = {};
var accountsConfig = [];
var allData = [];
var investChart = null;
var nwChart = null;
var budgetItems = [];
var currentView = 'pct';

// === FORMATTERS ===
var Fmt = {
  currency: function(val) {
    return val.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
  },

  currencyShort: function(val) {
    if (Math.abs(val) >= 1000000) return (val / 1000000).toFixed(1).replace('.', ',') + 'M \u20AC';
    if (Math.abs(val) >= 1000) return (val / 1000).toFixed(1).replace('.', ',') + 'k \u20AC';
    return val.toFixed(0) + ' \u20AC';
  },

  compact: function(val) {
    if (val >= 1000) return (val / 1000).toFixed(1).replace('.', ',') + 'k \u20AC';
    return val.toFixed(0) + ' \u20AC';
  },

  pct: function(val) {
    var sign = val >= 0 ? '+' : '';
    return sign + val.toFixed(2) + '%';
  },

  pctShort: function(val) {
    var sign = val >= 0 ? '+' : '';
    return sign + val.toFixed(1) + '%';
  },

  years: function(val) {
    if (val === Infinity) return 'N/A';
    if (val < 1) return '< 1 year';
    var y = Math.floor(val);
    var m = Math.round((val - y) * 12);
    if (m === 0) return y + (y === 1 ? ' year' : ' years');
    return y + 'y ' + m + 'm';
  }
};
