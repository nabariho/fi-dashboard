// === DATE UTILITIES ===
// Shared month-level date arithmetic. Used by calculators and services.
// All functions are pure — no side effects, no DOM access.

var DateUtils = {
  // Months between two 'YYYY-MM' strings (to - from).
  // Returns negative if 'from' is after 'to'.
  monthsBetween: function(from, to) {
    var f = (from || '').split('-');
    var t = (to || '').split('-');
    if (f.length < 2 || t.length < 2) return 0;
    return (parseInt(t[0]) - parseInt(f[0])) * 12 + (parseInt(t[1]) - parseInt(f[1]));
  },

  // Add n months to a 'YYYY-MM' string. n can be negative.
  addMonths: function(monthStr, n) {
    var parts = (monthStr || new Date().toISOString().slice(0, 7)).split('-');
    var y = parseInt(parts[0]) || new Date().getFullYear();
    var m = parseInt(parts[1]) || 1;
    m += n;
    while (m > 12) { m -= 12; y++; }
    while (m < 1) { m += 12; y--; }
    return y + '-' + (m < 10 ? '0' : '') + m;
  },

  // Previous month from a 'YYYY-MM' string.
  prevMonth: function(monthStr) {
    return this.addMonths(monthStr, -1);
  },

  // Next month from a 'YYYY-MM' string.
  nextMonth: function(monthStr) {
    return this.addMonths(monthStr, 1);
  },

  // Extract year from 'YYYY-MM' string.
  getYear: function(monthStr) {
    return (monthStr || '').substring(0, 4);
  },

  // Extract month index (0-11) from 'YYYY-MM' string.
  getMonthIndex: function(monthStr) {
    return parseInt((monthStr || '').substring(5, 7)) - 1;
  },

  // Current month as 'YYYY-MM'.
  currentMonth: function() {
    return new Date().toISOString().slice(0, 7);
  }
};
