// === Calculator Tests ===

// --- Setup: populate globals needed by calculators ---
accountsConfig = [
  { account_id: 'BROKER_A', account_name: 'Broker A', type: 'Broker', currency: 'EUR', include_networth: true, include_performance: true, cashflow_role: 'savings' },
  { account_id: 'BROKER_B', account_name: 'Broker B', type: 'Broker', currency: 'EUR', include_networth: true, include_performance: true, cashflow_role: 'savings' },
  { account_id: 'TRADE_REPUBLIC', account_name: 'Trade Republic', type: 'Cash', currency: 'EUR', include_networth: true, include_performance: false, cashflow_role: 'savings' },
  { account_id: 'BBVA', account_name: 'BBVA', type: 'Cash', currency: 'EUR', include_networth: true, include_performance: false, cashflow_role: 'transactional' },
  { account_id: 'BANKINTER', account_name: 'Bankinter', type: 'Cash', currency: 'EUR', include_networth: true, include_performance: false, cashflow_role: 'savings' },
  { account_id: 'ARRAS', account_name: 'Arras', type: 'Cash', currency: 'EUR', include_networth: true, include_performance: false, cashflow_role: 'savings' }
];

// --- DataService ---

describe('DataService', function() {
  it('filterByAccount filters correctly', function() {
    var data = [
      { account_id: 'A', end_value: 100 },
      { account_id: 'B', end_value: 200 },
      { account_id: 'A', end_value: 150 }
    ];
    var result = DataService.filterByAccount(data, function(id) { return id === 'A'; });
    assertEqual(result.length, 2);
  });

  it('aggregateByMonth sums values per month', function() {
    var data = [
      { month: '2024-01', end_value: 100, net_contribution: 50 },
      { month: '2024-01', end_value: 200, net_contribution: 30 },
      { month: '2024-02', end_value: 400, net_contribution: 60 }
    ];
    var result = DataService.aggregateByMonth(data);
    assertEqual(result.length, 2);
    assertEqual(result[0].end_value, 300);
    assertEqual(result[0].net_contribution, 80);
    assertEqual(result[1].end_value, 400);
  });

  it('applyTimeRange slices correctly', function() {
    var data = [{}, {}, {}, {}, {}];
    assertEqual(DataService.applyTimeRange(data, 3).length, 3);
    assertEqual(DataService.applyTimeRange(data, 0).length, 5);
    assertEqual(DataService.applyTimeRange(data, 10).length, 5);
  });

  it('getUniqueMonths returns sorted unique months', function() {
    var data = [{ month: '2024-03' }, { month: '2024-01' }, { month: '2024-03' }, { month: '2024-02' }];
    var result = DataService.getUniqueMonths(data);
    assertEqual(result.length, 3);
    assertEqual(result[0], '2024-01');
    assertEqual(result[2], '2024-03');
  });
});

// --- ReturnsCalculator ---

describe('ReturnsCalculator', function() {
  it('computes cumulative contributions', function() {
    var data = [
      { month: '2024-01', end_value: 1050, net_contribution: 1000 },
      { month: '2024-02', end_value: 2150, net_contribution: 1000 }
    ];
    ReturnsCalculator.compute(data);
    assertEqual(data[0].cum_contribution, 1000);
    assertEqual(data[1].cum_contribution, 2000);
  });

  it('computes Modified Dietz monthly return', function() {
    var data = [
      { month: '2024-01', end_value: 1050, net_contribution: 1000 },
      { month: '2024-02', end_value: 2200, net_contribution: 1000 }
    ];
    ReturnsCalculator.compute(data);
    // First month: (1050 - 1000) / (0.5 * 1000) * 100 = 10%
    assertClose(data[0].monthly_return_pct, 10, 0.01);
    // Second month: (2200 - 1050 - 1000) / (1050 + 500) * 100 = 150/1550*100 ≈ 9.68%
    assertClose(data[1].monthly_return_pct, 9.68, 0.01);
  });

  it('resets YTD at January', function() {
    var data = [
      { month: '2024-11', end_value: 10500, net_contribution: 10000 },
      { month: '2024-12', end_value: 10800, net_contribution: 0 },
      { month: '2025-01', end_value: 11000, net_contribution: 0 }
    ];
    ReturnsCalculator.compute(data);
    // Jan 2025 should have YTD = monthly return (reset)
    assertClose(data[2].ytd_return_pct, data[2].monthly_return_pct, 0.001);
  });

  it('groupByYear organizes data correctly', function() {
    var data = [
      { month: '2024-01', end_value: 100 },
      { month: '2024-06', end_value: 200 },
      { month: '2025-01', end_value: 300 }
    ];
    var grouped = ReturnsCalculator.groupByYear(data);
    assert(grouped['2024'] !== undefined);
    assert(grouped['2025'] !== undefined);
    assert(grouped['2024'][0] !== undefined); // Jan = index 0
    assert(grouped['2024'][5] !== undefined); // Jun = index 5
  });
});

// --- FICalculator ---

describe('FICalculator', function() {
  it('computes progress percentage', function() {
    assertClose(FICalculator.progress(500000, 1000000), 50, 0.01);
    assertClose(FICalculator.progress(1200000, 1000000), 100, 0.01); // capped at 100
  });

  it('computes passive income', function() {
    assertClose(FICalculator.passiveIncome(600000, 0.04), 2000, 0.01);
  });

  it('computes years to FI', function() {
    var years = FICalculator.yearsToFI(0, 1000, 0.07, 300000);
    assert(years > 0 && years < 50, 'Should be between 0 and 50 years, got ' + years);
  });

  it('returns 0 if already at FI', function() {
    assertEqual(FICalculator.yearsToFI(1000000, 1000, 0.07, 1000000), 0);
  });

  it('returns Infinity for impossible case', function() {
    assertEqual(FICalculator.yearsToFI(0, 0, 0, 1000000), Infinity);
  });

  it('computes savings rate', function() {
    assertClose(FICalculator.savingsRate(12000, 12, 3500), (12000 / 42000) * 100, 0.01);
  });

  it('computes average monthly savings', function() {
    var data = [
      { net_contribution: 1000 },
      { net_contribution: 1200 },
      { net_contribution: 800 }
    ];
    assertClose(FICalculator.avgMonthlySavings(data, 3), 1000, 0.01);
  });
});

// --- NetWorthCalculator ---

describe('NetWorthCalculator', function() {
  it('computes net worth totals', function() {
    var data = [
      { month: '2024-01', account_id: 'BROKER_A', end_value: 50000, net_contribution: 0 },
      { month: '2024-01', account_id: 'TRADE_REPUBLIC', end_value: 20000, net_contribution: 0 }
    ];
    var accountIds = ['BROKER_A', 'TRADE_REPUBLIC'];
    var result = NetWorthCalculator.compute(data, accountIds);
    assertEqual(result.length, 1);
    assertEqual(result[0].total, 70000);
    assertEqual(result[0].investments, 50000);
    assertEqual(result[0].bank, 20000);
  });

  it('computeMoM returns change and percentage', function() {
    var data = [
      { month: '2024-01', total: 100000 },
      { month: '2024-02', total: 105000 }
    ];
    var mom = NetWorthCalculator.computeMoM(data);
    assertEqual(mom.change, 5000);
    assertClose(mom.pct, 5, 0.01);
  });
});

// --- GoalsCalculator ---

describe('GoalsCalculator', function() {
  it('emergency fund green when TR alone covers target', function() {
    var result = GoalsCalculator.computeEmergencyFund({ TRADE_REPUBLIC: 45000, BBVA: 5000 }, 40000);
    assertEqual(result.status, 'green');
    assertClose(result.pct, 100, 0.1);
  });

  it('emergency fund yellow when TR+BBVA covers target', function() {
    var result = GoalsCalculator.computeEmergencyFund({ TRADE_REPUBLIC: 25000, BBVA: 20000 }, 40000);
    assertEqual(result.status, 'yellow');
  });

  it('emergency fund red when below target', function() {
    var result = GoalsCalculator.computeEmergencyFund({ TRADE_REPUBLIC: 15000, BBVA: 5000 }, 40000);
    assertEqual(result.status, 'red');
  });

  it('house down payment computes surplus', function() {
    var result = GoalsCalculator.computeHouseDownPayment({ ARRAS: 40000, BANKINTER: 50000 }, 80000, 2000);
    // bankinterEffective = 50000 - 2000 = 48000
    // current = 40000 + 48000 = 88000
    // surplus = 88000 - 80000 = 8000
    assertEqual(result.surplus, 8000);
    assertClose(result.pct, 100, 0.1);
  });
});

// --- BudgetCalculator ---

describe('BudgetCalculator', function() {
  it('toMonthly converts yearly to monthly', function() {
    assertClose(BudgetCalculator.toMonthly(1200, 'yearly'), 100, 0.01);
  });

  it('toMonthly converts quarterly to monthly', function() {
    assertClose(BudgetCalculator.toMonthly(300, 'quarterly'), 75, 0.01);
  });

  it('computeMonthlyBudget totals correctly', function() {
    var items = [
      { item_id: '1', name: 'Rent', type: 'fixed', amount: 1000, frequency: 'monthly', category: 'Housing', active: true },
      { item_id: '2', name: 'Food', type: 'variable', amount: 300, frequency: 'monthly', category: 'Food', active: true },
      { item_id: '3', name: 'Inactive', type: 'fixed', amount: 999, frequency: 'monthly', category: 'Other', active: false }
    ];
    var result = BudgetCalculator.computeMonthlyBudget(items);
    assertClose(result.total, 1300, 0.01);
    assertClose(result.fixed, 1000, 0.01);
    assertClose(result.variable, 300, 0.01);
    assertEqual(Object.keys(result.byCategory).length, 2);
  });
});

// --- AccountService ---

describe('AccountService', function() {
  it('getName returns name for known account', function() {
    assertEqual(AccountService.getName('BROKER_A'), 'Broker A');
  });

  it('getName returns id for unknown account', function() {
    assertEqual(AccountService.getName('UNKNOWN'), 'UNKNOWN');
  });

  it('isPerformance returns true for performance accounts', function() {
    assertEqual(AccountService.isPerformance('BROKER_A'), true);
    assertEqual(AccountService.isPerformance('TRADE_REPUBLIC'), false);
  });

  it('getBrokerAccountIds returns only brokers in networth', function() {
    var ids = AccountService.getBrokerAccountIds();
    assert(ids.indexOf('BROKER_A') >= 0);
    assert(ids.indexOf('TRADE_REPUBLIC') < 0);
  });
});

// --- Fmt ---

describe('Fmt', function() {
  it('pct formats with sign', function() {
    assert(Fmt.pct(5.123).indexOf('+') === 0);
    assert(Fmt.pct(-3.45).indexOf('-') === 0);
  });

  it('years handles Infinity', function() {
    assertEqual(Fmt.years(Infinity), 'N/A');
  });

  it('years formats years and months', function() {
    assertEqual(Fmt.years(2.5), '2y 6m');
  });

  it('currencyShort formats thousands', function() {
    assert(Fmt.currencyShort(5000).indexOf('5') >= 0);
    assert(Fmt.currencyShort(5000).indexOf('k') >= 0);
  });
});

// --- GoalAccountingService ---

describe('GoalAccountingService', function() {
  it('buildLatestBalances keeps latest month per account', function() {
    var rows = [
      { month: '2025-01', account_id: 'A', end_value: 100 },
      { month: '2025-02', account_id: 'A', end_value: 120 },
      { month: '2025-01', account_id: 'B', end_value: 50 }
    ];
    var latest = GoalAccountingService.buildLatestBalances(rows);
    assertEqual(latest.A, 120);
    assertEqual(latest.B, 50);
  });

  it('analyzeFunding splits shared account balance across tracked goals', function() {
    var goals = [
      { goal_id: 'g1', name: 'Goal 1', active: true, track_current_from_accounts: true, funding_accounts: ['BBVA'] },
      { goal_id: 'g2', name: 'Goal 2', active: true, track_current_from_accounts: true, funding_accounts: ['BBVA'] }
    ];
    var analysis = GoalAccountingService.analyzeFunding(goals, { BBVA: 1000 });
    assertClose(analysis.goalCurrentFromAccounts.g1, 500, 0.01);
    assertClose(analysis.goalCurrentFromAccounts.g2, 500, 0.01);
    assertEqual(analysis.issues.length, 0);
  });

  it('analyzeFunding flags account oversubscription for manual claims', function() {
    var goals = [
      { goal_id: 'g1', name: 'Goal 1', active: true, track_current_from_accounts: false, current_amount: 600, funding_accounts: ['BBVA'] },
      { goal_id: 'g2', name: 'Goal 2', active: true, track_current_from_accounts: false, current_amount: 500, funding_accounts: ['BBVA'] }
    ];
    var analysis = GoalAccountingService.analyzeFunding(goals, { BBVA: 1000 });
    assert(analysis.issues.some(function(i) { return i.type === 'account_oversubscribed'; }), 'Expected account_oversubscribed issue');
  });
});

// --- GoalAllocationService ---

describe('GoalAllocationService', function() {
  it('allocateByPriorityProportional allocates within priority by required ratio', function() {
    var rows = [
      { goal_id: 'a', priority: 2, required_monthly: 400 },
      { goal_id: 'b', priority: 2, required_monthly: 200 }
    ];
    var result = GoalAllocationService.allocateByPriorityProportional(rows, 300);
    var a = result.rows.find(function(r) { return r.goal_id === 'a'; });
    var b = result.rows.find(function(r) { return r.goal_id === 'b'; });
    assertClose(a.allocated_monthly, 200, 0.01);
    assertClose(b.allocated_monthly, 100, 0.01);
  });

  it('allocateByPriorityProportional funds higher priority first', function() {
    var rows = [
      { goal_id: 'p1', priority: 1, required_monthly: 200 },
      { goal_id: 'p2', priority: 2, required_monthly: 200 }
    ];
    var result = GoalAllocationService.allocateByPriorityProportional(rows, 200);
    var p1 = result.rows.find(function(r) { return r.goal_id === 'p1'; });
    var p2 = result.rows.find(function(r) { return r.goal_id === 'p2'; });
    assertClose(p1.allocated_monthly, 200, 0.01);
    assertClose(p2.allocated_monthly, 0, 0.01);
  });
});

// --- GoalRulesService / GoalPlannerCalculator ---

describe('GoalRulesService', function() {
  it('splits tracked current amount across shared account without double counting', function() {
    var goals = [
      { goal_id: 'emergency', name: 'Emergency', target_amount: 1000, current_amount: 0, target_date: '2025-12', priority: 1, active: true, track_current_from_accounts: true, funding_accounts: ['BBVA'] },
      { goal_id: 'car', name: 'Car', target_amount: 1000, current_amount: 0, target_date: '2025-12', priority: 2, active: true, track_current_from_accounts: true, funding_accounts: ['BBVA'] }
    ];
    var plan = GoalRulesService.evaluate(goals, {
      monthlyIncome: 2000,
      monthlyExpenses: 1000,
      asOfMonth: '2025-01',
      latestAccounts: { BBVA: 500 }
    });
    var emergency = plan.goals.find(function(g) { return g.goal_id === 'emergency'; });
    var car = plan.goals.find(function(g) { return g.goal_id === 'car'; });
    assertClose(emergency.current_amount, 250, 0.01);
    assertClose(car.current_amount, 250, 0.01);
    assert(!plan.conflicts.some(function(c) { return c.type === 'account_oversubscribed'; }), 'Should not be oversubscribed');
  });

  it('planner facade delegates to rules engine and computes shortfall', function() {
    var goals = [
      { goal_id: 'house', name: 'House', target_amount: 2400, current_amount: 0, target_date: '2025-12', priority: 1, active: true, track_current_from_accounts: false, funding_accounts: [] }
    ];
    var plan = GoalPlannerCalculator.plan(goals, {
      monthlyIncome: 1000,
      monthlyExpenses: 900,
      asOfMonth: '2025-01',
      latestAccounts: {}
    });
    assert(plan.shortfall_total > 0, 'Expected positive shortfall');
  });
});

// --- SavingsCapacityCalculator ---

describe('SavingsCapacityCalculator', function() {
  var testData = [
    { month: '2024-01', account_id: 'BROKER_A', end_value: 5000, net_contribution: 500 },
    { month: '2024-01', account_id: 'BBVA', end_value: 3000, net_contribution: 2500 },
    { month: '2024-02', account_id: 'BROKER_A', end_value: 5600, net_contribution: 500 },
    { month: '2024-02', account_id: 'BBVA', end_value: 2800, net_contribution: 2300 },
    { month: '2024-03', account_id: 'BROKER_A', end_value: 6200, net_contribution: 500 },
    { month: '2024-03', account_id: 'BBVA', end_value: 3100, net_contribution: 2600 }
  ];

  it('computeMonthly returns per-month savings data', function() {
    var result = SavingsCapacityCalculator.computeMonthly(testData, { monthlyIncome: 4000 });
    assertEqual(result.length, 3);
    assertEqual(result[0].month, '2024-01');
    assertClose(result[0].totalContributions, 3000, 0.01);
    assertClose(result[0].savingsContributions, 500, 0.01);
    assertClose(result[0].transactionalContributions, 2500, 0.01);
    assertClose(result[0].impliedExpenses, 1000, 0.01);
    assertClose(result[0].savingsRate, 0.75, 0.01);
  });

  it('computeTrailingAverage calculates correct averages', function() {
    var monthly = SavingsCapacityCalculator.computeMonthly(testData, { monthlyIncome: 4000 });
    var avg = SavingsCapacityCalculator.computeTrailingAverage(monthly, 3);
    assertEqual(avg.months, 3);
    assertClose(avg.avgSavings, 2966.67, 1);
    assertClose(avg.avgExpenses, 1033.33, 1);
  });

  it('computeWaterfall builds correct distribution', function() {
    var monthly = SavingsCapacityCalculator.computeMonthly(testData, { monthlyIncome: 4000 });
    var waterfall = SavingsCapacityCalculator.computeWaterfall(monthly, 1500, null, 3);
    assertClose(waterfall.income, 4000, 0.01);
    assertClose(waterfall.estimatedExpenses, 1500, 0.01);
    assert(waterfall.actualExpenses > 0, 'Should have actual expenses');
    assertClose(waterfall.expenseGap, 1500 - waterfall.actualExpenses, 1);
  });

  it('computeAchievability returns scores for goals', function() {
    var goalPlan = {
      goals: [
        { goal_id: 'g1', name: 'Goal 1', target_amount: 10000, current_amount: 5000, remaining: 5000, required_monthly: 500, allocated_monthly: 500, target_date: '2025-01', months_left: 10, priority: 1, status: 'on_track' },
        { goal_id: 'g2', name: 'Goal 2', target_amount: 50000, current_amount: 0, remaining: 50000, required_monthly: 5000, allocated_monthly: 0, target_date: '2025-12', months_left: 10, priority: 2, status: 'unfundable' }
      ]
    };
    var result = SavingsCapacityCalculator.computeAchievability(goalPlan, 3000);
    assertEqual(result.length, 2);
    assert(result[0].achievable === true, 'Goal 1 should be achievable');
    assert(result[0].confidence >= 0.9, 'Goal 1 should have high confidence');
    assert(result[1].achievable === false, 'Goal 2 should not be achievable');
    assert(result[1].confidence === 0, 'Goal 2 should have 0 confidence');
  });
});

// --- CashflowCalculator ---

describe('CashflowCalculator', function() {
  var testEntries = [
    { entry_id: '2024-01_income_salary', month: '2024-01', type: 'income', category: 'Salary', amount: 3200, notes: '' },
    { entry_id: '2024-01_income_bonus', month: '2024-01', type: 'income', category: 'Bonus', amount: 500, notes: '' },
    { entry_id: '2024-01_expense_housing', month: '2024-01', type: 'expense', category: 'Housing', amount: 900, notes: '' },
    { entry_id: '2024-01_expense_food', month: '2024-01', type: 'expense', category: 'Food', amount: 400, notes: '' },
    { entry_id: '2024-02_income_salary', month: '2024-02', type: 'income', category: 'Salary', amount: 3200, notes: '' },
    { entry_id: '2024-02_expense_housing', month: '2024-02', type: 'expense', category: 'Housing', amount: 900, notes: '' },
    { entry_id: '2024-02_expense_food', month: '2024-02', type: 'expense', category: 'Food', amount: 350, notes: '' },
    { entry_id: '2024-02_expense_transport', month: '2024-02', type: 'expense', category: 'Transport', amount: 150, notes: '' }
  ];

  it('computeMonth aggregates income and expenses', function() {
    var result = CashflowCalculator.computeMonth(testEntries, '2024-01');
    assertClose(result.totalIncome, 3700, 0.01);
    assertClose(result.totalExpenses, 1300, 0.01);
    assertClose(result.netSavings, 2400, 0.01);
    assertClose(result.savingsRate, 2400 / 3700, 0.001);
    assertEqual(result.incomeByCategory['Salary'], 3200);
    assertEqual(result.incomeByCategory['Bonus'], 500);
    assertEqual(result.expensesByCategory['Housing'], 900);
    assertEqual(result.expensesByCategory['Food'], 400);
  });

  it('computeMonth returns zeros for empty month', function() {
    var result = CashflowCalculator.computeMonth(testEntries, '2099-01');
    assertEqual(result.totalIncome, 0);
    assertEqual(result.totalExpenses, 0);
    assertEqual(result.netSavings, 0);
    assertEqual(result.savingsRate, 0);
  });

  it('computeAllMonths returns summaries for all months', function() {
    var result = CashflowCalculator.computeAllMonths(testEntries);
    assertEqual(result.length, 2);
    assertEqual(result[0].month, '2024-01');
    assertEqual(result[1].month, '2024-02');
    assertClose(result[1].totalExpenses, 1400, 0.01);
  });

  it('getMonthsWithActuals returns correct set', function() {
    var months = CashflowCalculator.getMonthsWithActuals(testEntries);
    assertEqual(months.size, 2);
    assert(months.has('2024-01'), 'Should have 2024-01');
    assert(months.has('2024-02'), 'Should have 2024-02');
  });

  it('slugify produces valid slugs', function() {
    assertEqual(CashflowCalculator.slugify('Housing'), 'housing');
    assertEqual(CashflowCalculator.slugify('  Food & Drink '), 'food--drink');
    assertEqual(CashflowCalculator.slugify('Transport Costs'), 'transport-costs');
  });

  it('buildEntryId generates correct format', function() {
    var id = CashflowCalculator.buildEntryId('2024-03', 'expense', 'expense_housing', 'expense_housing_rent');
    assertEqual(id, '2024-03_expense_expense_housing_expense_housing_rent');
  });

  it('computePlannedVsActual compares budget to actuals', function() {
    var budgetItems = [
      { item_id: 'b1', name: 'Rent', type: 'fixed', amount: 950, frequency: 'monthly', category: 'Housing', active: true },
      { item_id: 'b2', name: 'Groceries', type: 'variable', amount: 350, frequency: 'monthly', category: 'Food', active: true }
    ];
    var result = CashflowCalculator.computePlannedVsActual(testEntries, budgetItems, '2024-01');
    assertClose(result.byCategory['Housing'].planned, 950, 0.01);
    assertClose(result.byCategory['Housing'].actual, 900, 0.01);
    assertClose(result.byCategory['Housing'].delta, -50, 0.01);
    assertClose(result.byCategory['Food'].planned, 350, 0.01);
    assertClose(result.byCategory['Food'].actual, 400, 0.01);
    assertClose(result.byCategory['Food'].delta, 50, 0.01);
  });

  it('computeCategoryTrends tracks categories over time', function() {
    var result = CashflowCalculator.computeCategoryTrends(testEntries, 12);
    assertEqual(result.months.length, 2);
    assert(result.categories.indexOf('Housing') >= 0, 'Should include Housing');
    assert(result.categories.indexOf('Food') >= 0, 'Should include Food');
    assertEqual(result.series['Housing'][0], 900);
    assertEqual(result.series['Housing'][1], 900);
    assertEqual(result.series['Food'][0], 400);
    assertEqual(result.series['Food'][1], 350);
  });

  it('computeMonth separates transfers from spending', function() {
    var entriesWithTransfer = [
      { entry_id: 't1', month: '2024-03', type: 'income', category: 'Salary', category_id: 'income_salary', amount: 3000, notes: '' },
      { entry_id: 't2', month: '2024-03', type: 'expense', category: 'Housing', category_id: 'expense_housing', amount: 800, notes: '' },
      { entry_id: 't3', month: '2024-03', type: 'expense', category: 'Investing', category_id: 'expense_investing', amount: 1200, notes: '' }
    ];
    var cats = [
      { category_id: 'expense_housing', type: 'expense', name: 'Housing', classification: 'spending' },
      { category_id: 'expense_investing', type: 'expense', name: 'Investing', classification: 'transfer' }
    ];
    var result = CashflowCalculator.computeMonth(entriesWithTransfer, '2024-03', cats);
    assertClose(result.totalIncome, 3000, 0.01, 'income');
    assertClose(result.totalExpenses, 800, 0.01, 'expenses (spending only)');
    assertClose(result.totalTransfers, 1200, 0.01, 'transfers');
    assertClose(result.totalOutflows, 2000, 0.01, 'total outflows');
    assertClose(result.netSavings, 2200, 0.01, 'net savings = income - spending');
    assertClose(result.savingsRate, 2200 / 3000, 0.001, 'savings rate excludes transfers');
    assertEqual(result.expensesByCategory['Housing'], 800);
    assertEqual(result.transfersByCategory['Investing'], 1200);
    assert(!result.expensesByCategory['Investing'], 'Investing should not be in expensesByCategory');
  });

  it('computeMonthDetail returns itemized breakdown', function() {
    var entries = [
      { entry_id: 'd1', month: '2024-03', type: 'income', category: 'Salary', category_id: 'income_salary', amount: 3000, notes: '' },
      { entry_id: 'd2', month: '2024-03', type: 'expense', category: 'Housing', category_id: 'expense_housing', subcategory: 'Rent', amount: 575, notes: '' },
      { entry_id: 'd3', month: '2024-03', type: 'expense', category: 'Housing', category_id: 'expense_housing', subcategory: 'Electricity', amount: 50, notes: '' },
      { entry_id: 'd4', month: '2024-03', type: 'expense', category: 'Investing', category_id: 'expense_investing', subcategory: 'IBKR', amount: 1000, notes: '' }
    ];
    var cats = [
      { category_id: 'expense_housing', type: 'expense', name: 'Housing', classification: 'spending' },
      { category_id: 'expense_investing', type: 'expense', name: 'Investing', classification: 'transfer' }
    ];
    var detail = CashflowCalculator.computeMonthDetail(entries, '2024-03', cats);
    assertEqual(detail.income.total, 3000);
    assertEqual(detail.income.items.length, 1);
    assertEqual(detail.expenses.total, 625);
    assertEqual(detail.expenses.items.length, 2);
    assertEqual(detail.expenses.items[0].subcategory, 'Rent'); // sorted by amount desc
    assertEqual(detail.transfers.total, 1000);
    assertEqual(detail.transfers.items.length, 1);
    assertClose(detail.netSavings, 2375, 0.01, 'net savings');
  });

  it('computeGoalFundingReality detects overdrawn goals', function() {
    var allData = [
      { month: '2024-03', account_id: 'IBKR', end_value: 10000, net_contribution: 2200 },
      { month: '2024-03', account_id: 'EF_SAVINGS', end_value: 5000, net_contribution: -500 }
    ];
    var goals = [
      { goal_id: 'retirement', name: 'Retirement', priority: 1, allocated_monthly: 1000, funding_accounts: ['IBKR'] },
      { goal_id: 'emergency', name: 'Emergency Fund', priority: 2, allocated_monthly: 500, funding_accounts: ['EF_SAVINGS'] }
    ];
    var netSavings = 1700;
    var result = CashflowCalculator.computeGoalFundingReality('2024-03', allData, goals, netSavings);

    assertEqual(result.goals.length, 2);
    // Retirement: planned 1000, actual 2200 (overfunded)
    assertEqual(result.goals[0].name, 'Retirement');
    assertClose(result.goals[0].actual, 2200, 0.01, 'retirement actual');
    assertEqual(result.goals[0].status, 'overfunded');
    // Emergency: planned 500, actual -500 (withdrawn)
    assertEqual(result.goals[1].name, 'Emergency Fund');
    assertClose(result.goals[1].actual, -500, 0.01, 'emergency actual');
    assertEqual(result.goals[1].status, 'withdrawn');
    // Total actual = 2200 + (-500) = 1700, available = 1700, overdrawn = 0
    assertClose(result.totalActual, 1700, 0.01, 'total actual');
    assertClose(result.overdrawn, 0, 0.01, 'overdrawn');
  });
});

// --- CashflowNormalizationService ---

describe('CashflowNormalizationService', function() {
  it('normalizes legacy categories into taxonomy IDs', function() {
    var data = {
      cashflowEntries: [
        { entry_id: 'legacy_1', month: '2024-01', type: 'income', category: 'salary', amount: 3000, notes: '' },
        { entry_id: 'legacy_2', month: '2024-01', type: 'expense', category: 'donations', subcategory: 'Cruz Roja', amount: 50, notes: '' }
      ]
    };
    var normalized = CashflowNormalizationService.normalizeDataset(data);
    assert(normalized.categories.length >= 2, 'Expected at least two categories');
    assert(normalized.subcategories.length >= 1, 'Expected one subcategory');
    var income = normalized.entries.find(function(e) { return e.type === 'income'; });
    var expense = normalized.entries.find(function(e) { return e.type === 'expense'; });
    assert(income && income.category_id, 'Income entry should have category_id');
    assert(expense && expense.subcategory_id, 'Expense entry should have subcategory_id');
  });

  it('ensures default income categories exist', function() {
    var normalized = CashflowNormalizationService.normalizeDataset({ cashflowEntries: [] });
    var incomeNames = normalized.categories
      .filter(function(c) { return c.type === 'income'; })
      .map(function(c) { return c.name; });
    assert(incomeNames.indexOf('Salary') >= 0, 'Missing Salary');
    assert(incomeNames.indexOf('Bonus') >= 0, 'Missing Bonus');
    assert(incomeNames.indexOf('Other') >= 0, 'Missing Other');
  });

  it('keeps duplicate category/subcategory entries as distinct IDs', function() {
    var data = {
      cashflowEntries: [
        { entry_id: 'a', month: '2024-01', type: 'expense', category: 'Food', subcategory: 'Restaurant', amount: 35, notes: '' },
        { entry_id: 'b', month: '2024-01', type: 'expense', category: 'Food', subcategory: 'Restaurant', amount: 22, notes: '' }
      ]
    };
    var normalized = CashflowNormalizationService.normalizeDataset(data);
    assertEqual(normalized.entries.length, 2);
    assert(normalized.entries[0].entry_id !== normalized.entries[1].entry_id, 'Expected distinct entry IDs');
  });
});
