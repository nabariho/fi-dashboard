// === FI CALCULATOR ===
// Financial Independence projections and savings rate. Pure math, no DOM access.

var FICalculator = {
  // Compute FI progress as percentage of target
  progress: function(currentNetWorth, fiTarget) {
    if (fiTarget <= 0) return 0;
    return Math.min((currentNetWorth / fiTarget) * 100, 100);
  },

  // Estimate passive income at the configured withdrawal rate
  passiveIncome: function(currentInvestments, withdrawalRate) {
    return (currentInvestments * withdrawalRate) / 12;
  },

  // Estimate years to FI using future value of growing annuity
  // currentNW: current net worth
  // monthlySavings: average monthly savings
  // annualReturn: expected annual return (e.g. 0.05)
  // fiTarget: target net worth
  yearsToFI: function(currentNW, monthlySavings, annualReturn, fiTarget) {
    if (currentNW >= fiTarget) return 0;
    if (monthlySavings <= 0 && annualReturn <= 0) return Infinity;

    var monthlyReturn = Math.pow(1 + annualReturn, 1/12) - 1;

    // Simulate month by month (handles edge cases better than closed-form)
    var balance = currentNW;
    var months = 0;
    var maxMonths = 100 * 12; // cap at 100 years

    while (balance < fiTarget && months < maxMonths) {
      balance = balance * (1 + monthlyReturn) + monthlySavings;
      months++;
    }

    return months >= maxMonths ? Infinity : months / 12;
  },

  // Compute savings rate for a given period
  // totalContributions: sum of net_contribution in the period
  // months: number of months in the period
  // monthlyIncome: monthly net income
  savingsRate: function(totalContributions, months, monthlyIncome) {
    if (monthlyIncome <= 0 || months <= 0) return 0;
    var totalIncome = monthlyIncome * months;
    return (totalContributions / totalIncome) * 100;
  },

  // Compute average monthly savings from the last N months of data
  avgMonthlySavings: function(data, months) {
    if (!data.length) return 0;
    var recent = data.slice(-months);
    var totalContrib = recent.reduce(function(sum, r) { return sum + r.net_contribution; }, 0);
    return totalContrib / recent.length;
  },

  // Build projection data points for charting
  // Returns array of { month: 'YYYY-MM', projected: value }
  projectFuture: function(startValue, monthlySavings, annualReturn, fiTarget, maxYears) {
    var monthlyReturn = Math.pow(1 + annualReturn, 1/12) - 1;
    var balance = startValue;
    var points = [];
    var maxMonths = (maxYears || 30) * 12;

    for (var i = 0; i <= maxMonths && balance < fiTarget * 1.1; i++) {
      if (i > 0) {
        balance = balance * (1 + monthlyReturn) + monthlySavings;
      }
      // Only add one point per year for the projection
      if (i % 12 === 0) {
        points.push({ yearsFromNow: i / 12, value: balance });
      }
    }

    return points;
  }
};
