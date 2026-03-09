// === SAVINGS CAPACITY CALCULATOR ===
// Derives actual savings capacity from month-end snapshots.
// Uses net contributions to savings-role accounts as the measure of actual saving.
// Pure math, no DOM access.

var SavingsCapacityCalculator = {
  // Compute monthly savings from net contributions to savings accounts.
  // Returns array of: { month, income, totalContributions, savingsContributions,
  //                     transactionalContributions, expenses, savingsRate }
  // Options: { monthlyIncome, trailingMonths (default 6) }
  computeMonthly: function(data, options) {
    var income = (options && options.monthlyIncome) || 0;
    var savingsIds = AccountService.getSavingsAccountIds();
    var transactionalIds = AccountService.getTransactionalAccountIds();

    // Group all data by month
    var byMonth = {};
    (data || []).forEach(function(r) {
      if (!byMonth[r.month]) byMonth[r.month] = [];
      byMonth[r.month].push(r);
    });

    var months = Object.keys(byMonth).sort();

    return months.map(function(m) {
      var rows = byMonth[m];
      var savingsContrib = 0;
      var transactionalContrib = 0;
      var totalContrib = 0;

      rows.forEach(function(r) {
        var nc = r.net_contribution || 0;
        totalContrib += nc;
        if (savingsIds.indexOf(r.account_id) >= 0) {
          savingsContrib += nc;
        }
        if (transactionalIds.indexOf(r.account_id) >= 0) {
          transactionalContrib += nc;
        }
      });

      var expenses = income > 0 ? Math.max(0, income - totalContrib) : 0;
      var savingsRate = income > 0 ? totalContrib / income : 0;

      // Savings rate status: >=30% positive, >=15% neutral, else negative
      var savingsRateStatus = savingsRate >= 0.30 ? 'positive' : (savingsRate >= 0.15 ? 'neutral' : 'negative');

      return {
        month: m,
        income: income,
        totalContributions: totalContrib,
        savingsContributions: savingsContrib,
        transactionalContributions: transactionalContrib,
        expenses: expenses,
        savingsRate: savingsRate,
        savingsRateStatus: savingsRateStatus
      };
    });
  },

  // Compute monthly data with actual cashflow overrides where available.
  // For months with actual entries, replaces income/expenses/savingsRate with real data.
  // Returns same shape as computeMonthly, with additional dataSource field.
  computeMonthlyHybrid: function(data, cashflowEntries, options) {
    var derived = this.computeMonthly(data, options);
    if (!cashflowEntries || !cashflowEntries.length || typeof CashflowCalculator === 'undefined') {
      return derived.map(function(r) { r.dataSource = 'derived'; return r; });
    }

    var actualMonths = CashflowCalculator.getMonthsWithActuals(cashflowEntries);
    var categories = options && options.categories;
    var subcategories = options && options.subcategories;

    return derived.map(function(row) {
      if (actualMonths.has(row.month)) {
        var actual = CashflowCalculator.computeMonth(cashflowEntries, row.month, categories, subcategories);
        row.income = actual.totalIncome;
        row.expenses = actual.totalExpenses;
        row.totalTransfers = actual.totalTransfers;
        row.totalOutflows = actual.totalOutflows;
        row.totalContributions = actual.netSavings;
        row.savingsRate = actual.savingsRate;
        row.expensesByCategory = actual.expensesByCategory;
        row.incomeByCategory = actual.incomeByCategory;
        row.dataSource = 'actual';
      } else {
        row.totalTransfers = 0;
        row.totalOutflows = row.expenses;
        row.dataSource = 'derived';
      }
      return row;
    });
  },

  // Compute trailing average over last N months
  computeTrailingAverage: function(monthlyData, trailingMonths) {
    var n = trailingMonths || 6;
    var recent = monthlyData.slice(-n);
    if (!recent.length) return { avgSavings: 0, avgExpenses: 0, avgRate: 0, months: 0 };

    var totals = recent.reduce(function(acc, r) {
      acc.savings += r.totalContributions;
      acc.expenses += r.expenses;
      acc.rate += r.savingsRate;
      return acc;
    }, { savings: 0, expenses: 0, rate: 0 });

    return {
      avgSavings: totals.savings / recent.length,
      avgExpenses: totals.expenses / recent.length,
      avgRate: totals.rate / recent.length,
      months: recent.length
    };
  },

  // Build payroll distribution waterfall
  // Returns: { income, estimatedExpenses, actualExpenses, goalAllocations[], unallocated }
  computeWaterfall: function(monthlyData, budgetTotal, goalPlan, trailingMonths) {
    var avg = this.computeTrailingAverage(monthlyData, trailingMonths);
    var income = avg.months > 0 ? monthlyData[monthlyData.length - 1].income : 0;
    var actualExpenses = avg.avgExpenses;
    var actualSavings = avg.avgSavings;

    var goalAllocations = [];
    if (goalPlan && goalPlan.goals) {
      goalPlan.goals.forEach(function(g) {
        if (g.allocated_monthly > 0 || g.required_monthly > 0) {
          goalAllocations.push({
            name: g.name,
            priority: g.priority,
            required: g.required_monthly,
            allocated: g.allocated_monthly,
            status: g.status
          });
        }
      });
    }

    var totalGoalAllocation = goalAllocations.reduce(function(sum, g) { return sum + g.allocated; }, 0);
    var unallocated = Math.max(0, actualSavings - totalGoalAllocation);

    var expenseGap = (budgetTotal || 0) - actualExpenses;
    return {
      income: income,
      estimatedExpenses: budgetTotal || 0,
      actualExpenses: actualExpenses,
      expenseGap: expenseGap,
      expenseGapStatus: ValueStatus.sign(expenseGap),
      actualSavings: actualSavings,
      goalAllocations: goalAllocations,
      totalGoalAllocation: totalGoalAllocation,
      unallocated: unallocated
    };
  },

  // Compute goal achievability scores using actual savings data
  // Returns array of: { goal_id, name, status, achievable, confidence, message }
  computeAchievability: function(goalPlan, actualAvgSavings) {
    if (!goalPlan || !goalPlan.goals) return [];

    return goalPlan.goals.map(function(g) {
      var result = {
        goal_id: g.goal_id,
        name: g.name,
        priority: g.priority,
        target_amount: g.target_amount,
        current_amount: g.current_amount,
        remaining: g.remaining,
        required_monthly: g.required_monthly,
        allocated_monthly: g.allocated_monthly,
        target_date: g.target_date,
        months_left: g.months_left,
        status: g.status
      };

      if (g.remaining <= 0) {
        result.achievable = true;
        result.confidence = 1;
        result.message = 'Already funded';
      } else if (actualAvgSavings <= 0) {
        result.achievable = false;
        result.confidence = 0;
        result.message = 'No savings capacity detected';
      } else if (g.allocated_monthly >= g.required_monthly - 0.01) {
        result.achievable = true;
        result.confidence = Math.min(1, g.allocated_monthly / g.required_monthly);
        result.message = 'On track with current allocation';
      } else if (g.allocated_monthly > 0) {
        var actualMonthsNeeded = Math.ceil(g.remaining / g.allocated_monthly);
        result.achievable = g.months_left > 0 ? actualMonthsNeeded <= g.months_left * 1.2 : true;
        result.confidence = g.months_left > 0 ? Math.min(1, g.months_left / actualMonthsNeeded) : 0.5;
        result.projected_months = actualMonthsNeeded;
        result.message = result.achievable
          ? 'Achievable with ' + actualMonthsNeeded + ' months (deadline: ' + g.months_left + ')'
          : 'Needs ' + actualMonthsNeeded + ' months but only ' + g.months_left + ' left';
      } else {
        result.achievable = false;
        result.confidence = 0;
        result.message = 'No allocation — higher priority goals consume all savings';
      }

      return result;
    });
  }
};
