// === MORTGAGE CALCULATOR ===
// Computes amortization schedule, summary, equity, and actual vs planned. No DOM access.

var MortgageCalculator = {

  // Standard monthly payment formula: P * [r(1+r)^n] / [(1+r)^n - 1]
  _monthlyPayment: function(principal, monthlyRate, totalMonths) {
    if (monthlyRate === 0) return principal / totalMonths;
    var factor = Math.pow(1 + monthlyRate, totalMonths);
    return principal * (monthlyRate * factor) / (factor - 1);
  },

  // Delegate to DateUtils for shared date arithmetic
  _addMonths: function(dateStr, n) { return DateUtils.addMonths(dateStr, n); },
  _monthsBetween: function(a, b) { return DateUtils.monthsBetween(a, b); },

  // Get market value at a given month from sparse valuations
  _getMarketValueAtMonth: function(valuations, month) {
    if (!valuations || !valuations.length) return 0;
    var sorted = valuations.slice().sort(function(a, b) { return a.date.localeCompare(b.date); });
    var val = 0;
    for (var i = 0; i < sorted.length; i++) {
      if (sorted[i].date <= month) val = sorted[i].market_value;
      else break;
    }
    return val;
  },

  // Build month-by-month amortization schedule
  // Returns [{ month, payment, principal_paid, interest_paid, extra, balance, cum_interest, cum_principal }]
  computeSchedule: function(mortgage) {
    if (!mortgage) return [];

    var principal = mortgage.principal;
    var monthlyRate = mortgage.annual_rate / 12;
    var totalMonths = mortgage.term_years * 12;
    var startDate = mortgage.start_date;
    var extras = (mortgage.extra_payments || []).slice();

    var balance = principal;
    var payment = this._monthlyPayment(principal, monthlyRate, totalMonths);
    var cumInterest = 0;
    var cumPrincipal = 0;
    var schedule = [];
    var remainingMonths = totalMonths;

    for (var i = 0; i < totalMonths && balance > 0.005; i++) {
      var month = this._addMonths(startDate, i);
      var interest = Math.round(balance * monthlyRate * 100) / 100;
      var principalPart = Math.min(Math.round((payment - interest) * 100) / 100, balance);
      var monthPayment = interest + principalPart;

      // Check for extra payment this month
      var extraAmount = 0;
      var extraStrategy = null;
      for (var j = 0; j < extras.length; j++) {
        if (extras[j].date === month) {
          extraAmount += extras[j].amount;
          extraStrategy = extras[j].strategy;
        }
      }

      // Apply extra to principal
      if (extraAmount > 0) {
        extraAmount = Math.min(extraAmount, balance - principalPart);
      }

      balance = balance - principalPart - extraAmount;
      if (balance < 0.005) balance = 0;

      cumInterest = Math.round((cumInterest + interest) * 100) / 100;
      cumPrincipal = Math.round((cumPrincipal + principalPart + extraAmount) * 100) / 100;

      schedule.push({
        month: month,
        payment: monthPayment,
        principal_paid: principalPart,
        interest_paid: interest,
        extra: extraAmount,
        balance: balance,
        cum_interest: cumInterest,
        cum_principal: cumPrincipal
      });

      // After extra payment: recalculate based on strategy
      if (extraAmount > 0 && balance > 0) {
        remainingMonths = totalMonths - i - 1;
        if (extraStrategy === 'reduce_payment') {
          // Recalculate payment with remaining term
          payment = this._monthlyPayment(balance, monthlyRate, remainingMonths);
        }
        // reduce_term: keep same payment, loop naturally ends sooner
      }

      if (balance <= 0) break;
    }

    return schedule;
  },

  // Compute summary stats (runs schedule twice: with and without extras)
  computeSummary: function(mortgage) {
    if (!mortgage) return null;

    var scheduleWithExtras = this.computeSchedule(mortgage);
    if (!scheduleWithExtras.length) return null;

    // Schedule without extras
    var noExtras = Object.assign({}, mortgage, { extra_payments: [] });
    var scheduleNoExtras = this.computeSchedule(noExtras);

    var last = scheduleWithExtras[scheduleWithExtras.length - 1];
    var lastNoExtras = scheduleNoExtras[scheduleNoExtras.length - 1];

    var monthlyPayment = this._monthlyPayment(
      mortgage.principal,
      mortgage.annual_rate / 12,
      mortgage.term_years * 12
    );

    return {
      monthlyPayment: monthlyPayment,
      totalInterest: last.cum_interest,
      totalCost: last.cum_interest + last.cum_principal,
      payoffDate: last.month,
      originalPayoffDate: lastNoExtras.month,
      monthsSaved: scheduleNoExtras.length - scheduleWithExtras.length,
      interestSaved: lastNoExtras.cum_interest - last.cum_interest,
      currentBalance: last.balance,
      monthsRemaining: scheduleWithExtras.length,
      totalExtraPayments: (mortgage.extra_payments || []).reduce(function(s, e) { return s + e.amount; }, 0)
    };
  },

  // Get equity info at a given month
  computeEquity: function(mortgage, month) {
    if (!mortgage) return { marketValue: 0, mortgageBalance: 0, equity: 0, ltv: 0 };

    var schedule = this.computeSchedule(mortgage);
    var balance = this.getBalanceAtMonth(schedule, month, mortgage);
    var marketValue = this._getMarketValueAtMonth(mortgage.house_valuations, month);

    var equity = marketValue - balance;
    var ltv = marketValue > 0 ? (balance / marketValue) * 100 : 0;

    return {
      marketValue: marketValue,
      mortgageBalance: balance,
      equity: equity,
      ltv: ltv
    };
  },

  // Get remaining balance at a specific month
  // Before start_date: full principal. After payoff: 0.
  getBalanceAtMonth: function(schedule, month, mortgage) {
    if (!mortgage || !schedule.length) return 0;

    // Before start date — full principal
    if (month < mortgage.start_date) return mortgage.principal;

    // Find the exact month or the last one before it
    var balance = 0;
    for (var i = 0; i < schedule.length; i++) {
      if (schedule[i].month === month) return schedule[i].balance;
      if (schedule[i].month > month) {
        return i > 0 ? schedule[i - 1].balance : mortgage.principal;
      }
      balance = schedule[i].balance;
    }

    // After last schedule entry: loan paid off
    return 0;
  },

  // Aggregate schedule by year for charts and summary tables.
  // Returns { 'YYYY': { principal, interest, extra, payment } }
  computeYearlyAggregates: function(schedule) {
    var byYear = {};
    schedule.forEach(function(s) {
      var year = DateUtils.getYear(s.month);
      if (!byYear[year]) byYear[year] = { principal: 0, interest: 0, extra: 0, payment: 0 };
      byYear[year].principal = Math.round((byYear[year].principal + s.principal_paid) * 100) / 100;
      byYear[year].interest = Math.round((byYear[year].interest + s.interest_paid) * 100) / 100;
      byYear[year].extra = Math.round((byYear[year].extra + s.extra) * 100) / 100;
      byYear[year].payment = Math.round((byYear[year].payment + s.payment + s.extra) * 100) / 100;
    });
    return byYear;
  },

  // Compare actual payments vs planned schedule
  compareActualVsPlanned: function(schedule, actualPayments) {
    if (!actualPayments || !actualPayments.length) return [];

    var scheduleMap = {};
    var cumActual = 0;
    var cumPlanned = 0;
    schedule.forEach(function(s) { scheduleMap[s.month] = s; });

    // Track actual running balance
    var result = [];
    actualPayments.slice().sort(function(a, b) { return a.month.localeCompare(b.month); }).forEach(function(ap) {
      var planned = scheduleMap[ap.month];
      var plannedPayment = planned ? planned.payment + planned.extra : 0;
      var plannedBalance = planned ? planned.balance : 0;

      cumActual += ap.amount;
      cumPlanned += plannedPayment;

      result.push({
        month: ap.month,
        planned_payment: plannedPayment,
        actual_payment: ap.amount,
        planned_balance: plannedBalance,
        diff: ap.amount - plannedPayment,
        cum_actual: cumActual,
        cum_planned: cumPlanned
      });
    });

    return result;
  }
};
