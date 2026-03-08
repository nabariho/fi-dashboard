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

  // After-tax passive income (Spanish capital gains tax 19-26%)
  passiveIncomeNet: function(currentInvestments, withdrawalRate, taxRate) {
    var gross = (currentInvestments * withdrawalRate) / 12;
    return gross * (1 - (taxRate || 0));
  },

  // Real return adjusted for inflation (Fisher approximation)
  realReturn: function(nominalReturn, inflationRate) {
    return nominalReturn - (inflationRate || 0);
  },

  // What the FI target is in future (nominal) euros
  fiTargetNominal: function(fiTarget, inflationRate, years) {
    if (!inflationRate || years <= 0) return fiTarget;
    return fiTarget * Math.pow(1 + inflationRate, years);
  },

  // Derived FI target from actual expenses, withdrawal rate, and tax rate
  // "How much do I actually need to sustain my expenses?"
  derivedFITarget: function(annualExpenses, withdrawalRate, taxRate) {
    if (!withdrawalRate || withdrawalRate <= 0) return 0;
    var effectiveRate = withdrawalRate * (1 - (taxRate || 0));
    if (effectiveRate <= 0) return Infinity;
    return annualExpenses / effectiveRate;
  },

  // Inflation-adjusted years to FI (uses real return instead of nominal)
  yearsToFIReal: function(currentNW, monthlySavings, annualReturn, inflationRate, fiTarget) {
    var realReturn = this.realReturn(annualReturn, inflationRate);
    return this.yearsToFI(currentNW, monthlySavings, realReturn, fiTarget);
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

  // Compute FI date as concrete month/year string.
  // Returns 'YYYY-MM' or null if not reachable.
  fiDate: function(currentNW, monthlySavings, annualReturn, fiTarget) {
    var years = this.yearsToFI(currentNW, monthlySavings, annualReturn, fiTarget);
    if (years === Infinity || years === 0) return years === 0 ? 'now' : null;
    var now = new Date();
    var totalMonths = Math.ceil(years * 12);
    var targetMonth = now.getMonth() + totalMonths;
    var targetYear = now.getFullYear() + Math.floor(targetMonth / 12);
    var m = (targetMonth % 12) + 1;
    return targetYear + '-' + (m < 10 ? '0' : '') + m;
  },

  // Sensitivity analysis: how does FI date change with extra savings?
  // Returns array of { extraSavings, yearsToFI, fiDate, yearsSaved }
  sensitivityAnalysis: function(currentNW, monthlySavings, annualReturn, fiTarget, increments) {
    increments = increments || [100, 200, 500];
    var baseline = this.yearsToFI(currentNW, monthlySavings, annualReturn, fiTarget);
    var results = [];

    increments.forEach(function(extra) {
      var years = FICalculator.yearsToFI(currentNW, monthlySavings + extra, annualReturn, fiTarget);
      var fiDate = FICalculator.fiDate(currentNW, monthlySavings + extra, annualReturn, fiTarget);
      results.push({
        extraSavings: extra,
        yearsToFI: years,
        fiDate: fiDate,
        yearsSaved: baseline === Infinity ? Infinity : Math.max(0, baseline - years)
      });
    });

    return results;
  },

  // Compute savings rate trend: per-month savings rate for the last N months.
  // perfMonthly: aggregated monthly performance data [{ month, net_contribution }]
  // monthlyIncome: static or per-month income
  // numMonths: how many months to return (default 12)
  // Returns: [{ month, savingsRate }]
  savingsRateTrend: function(perfMonthly, monthlyIncome, numMonths) {
    if (!perfMonthly.length || monthlyIncome <= 0) return [];
    var n = numMonths || 12;
    var recent = perfMonthly.slice(-n);
    return recent.map(function(r) {
      return {
        month: r.month,
        savingsRate: (r.net_contribution / monthlyIncome) * 100
      };
    });
  },

  // Coast FI: the amount needed today such that compound growth alone
  // (no further savings) reaches fiTarget by retirement age.
  // coastFI = fiTarget / (1 + realReturn)^yearsToRetirement
  coastFI: function(fiTarget, realReturn, yearsToRetirement) {
    if (yearsToRetirement <= 0 || realReturn <= 0) return fiTarget;
    return fiTarget / Math.pow(1 + realReturn, yearsToRetirement);
  },

  // Full Coast FI analysis
  // Returns { coastFIAmount, reached, pct, yearsToRetirement }
  coastFIAnalysis: function(currentNW, fiTarget, nominalReturn, inflationRate, birthYear, retirementAge) {
    if (!birthYear || !retirementAge) return null;
    var currentAge = new Date().getFullYear() - birthYear;
    var yearsToRetirement = retirementAge - currentAge;
    if (yearsToRetirement <= 0) return null;

    var realReturn = this.realReturn(nominalReturn, inflationRate);
    var coastAmount = this.coastFI(fiTarget, realReturn, yearsToRetirement);
    var reached = currentNW >= coastAmount;
    var pct = coastAmount > 0 ? Math.min((currentNW / coastAmount) * 100, 100) : 0;

    return {
      coastFIAmount: coastAmount,
      reached: reached,
      pct: pct,
      yearsToRetirement: yearsToRetirement,
      currentAge: currentAge,
      retirementAge: retirementAge
    };
  },

  // Years to FI with income growth: savings increase over time as income grows,
  // assuming expense ratio stays constant (same savings rate, higher absolute savings).
  // incomeGrowthRate: annualized income growth (e.g. 0.05 = 5%/yr)
  yearsToFIWithGrowth: function(currentNW, monthlySavings, annualReturn, fiTarget, incomeGrowthRate) {
    if (currentNW >= fiTarget) return 0;
    if (monthlySavings <= 0 && annualReturn <= 0) return Infinity;
    if (!incomeGrowthRate || incomeGrowthRate <= 0) {
      return this.yearsToFI(currentNW, monthlySavings, annualReturn, fiTarget);
    }

    var monthlyReturn = Math.pow(1 + annualReturn, 1/12) - 1;
    var monthlyGrowth = Math.pow(1 + incomeGrowthRate, 1/12) - 1;
    var balance = currentNW;
    var savings = monthlySavings;
    var months = 0;
    var maxMonths = 100 * 12;

    while (balance < fiTarget && months < maxMonths) {
      balance = balance * (1 + monthlyReturn) + savings;
      savings = savings * (1 + monthlyGrowth);
      months++;
    }

    return months >= maxMonths ? Infinity : months / 12;
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
