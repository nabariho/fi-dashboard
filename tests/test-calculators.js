// === Calculator Tests ===

// --- Setup: populate globals needed by calculators ---
accountsConfig = [
  { account_id: 'BROKER_A', account_name: 'Broker A', type: 'Broker', currency: 'EUR', include_networth: true, include_performance: true },
  { account_id: 'BROKER_B', account_name: 'Broker B', type: 'Broker', currency: 'EUR', include_networth: true, include_performance: true },
  { account_id: 'TRADE_REPUBLIC', account_name: 'Trade Republic', type: 'Cash', currency: 'EUR', include_networth: true, include_performance: false },
  { account_id: 'BBVA', account_name: 'BBVA', type: 'Cash', currency: 'EUR', include_networth: true, include_performance: false },
  { account_id: 'BANKINTER', account_name: 'Bankinter', type: 'Cash', currency: 'EUR', include_networth: true, include_performance: false },
  { account_id: 'ARRAS', account_name: 'Arras', type: 'Cash', currency: 'EUR', include_networth: true, include_performance: false }
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
