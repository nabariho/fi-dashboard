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

  it('fiDate returns concrete month for achievable target', function() {
    var date = FICalculator.fiDate(0, 5000, 0.07, 300000);
    assert(date !== null, 'Should return a date');
    assert(/^\d{4}-\d{2}$/.test(date), 'Should be YYYY-MM format, got ' + date);
  });

  it('fiDate returns now when already at target', function() {
    assertEqual(FICalculator.fiDate(1000000, 1000, 0.07, 1000000), 'now');
  });

  it('fiDate returns null for impossible case', function() {
    assertEqual(FICalculator.fiDate(0, 0, 0, 1000000), null);
  });

  it('sensitivityAnalysis shows saving more reduces years', function() {
    var result = FICalculator.sensitivityAnalysis(100000, 2000, 0.06, 500000, [500, 1000]);
    assertEqual(result.length, 2);
    assert(result[0].yearsSaved > 0, 'Saving 500 more should reduce years');
    assert(result[1].yearsSaved > result[0].yearsSaved, 'Saving 1000 more should save more than 500');
  });

  it('computes after-tax passive income', function() {
    // 600k at 4% = 2000/mo gross; at 20% tax = 1600/mo net
    assertClose(FICalculator.passiveIncomeNet(600000, 0.04, 0.20), 1600, 0.01);
    // No tax = same as gross
    assertClose(FICalculator.passiveIncomeNet(600000, 0.04, 0), 2000, 0.01);
  });

  it('computes real return adjusted for inflation (exact Fisher)', function() {
    // Exact: (1.07)/(1.03) - 1 = 0.03883
    assertClose(FICalculator.realReturn(0.07, 0.03), (1.07 / 1.03) - 1, 0.0001);
    assertClose(FICalculator.realReturn(0.05, 0), 0.05, 0.001);
  });

  it('computes inflation-adjusted FI target in future euros', function() {
    // 1M at 3% inflation for 10 years
    var nominal = FICalculator.fiTargetNominal(1000000, 0.03, 10);
    assertClose(nominal, 1000000 * Math.pow(1.03, 10), 1);
    // No inflation = same target
    assertEqual(FICalculator.fiTargetNominal(1000000, 0, 10), 1000000);
  });

  it('computes derived FI target from expenses and tax rate', function() {
    // 30k annual expenses, 4% withdrawal, 20% tax → effective rate = 3.2% → need 937,500
    var derived = FICalculator.derivedFITarget(30000, 0.04, 0.20);
    assertClose(derived, 30000 / (0.04 * 0.80), 1);
    // No tax: 30k / 4% = 750k
    assertClose(FICalculator.derivedFITarget(30000, 0.04, 0), 750000, 1);
  });

  it('savingsRateTrend computes per-month rates', function() {
    var monthly = [
      { month: '2026-01', net_contribution: 1000 },
      { month: '2026-02', net_contribution: 1500 },
      { month: '2026-03', net_contribution: 800 }
    ];
    var trend = FICalculator.savingsRateTrend(monthly, 3000, 12);
    assertEqual(trend.length, 3);
    assertClose(trend[0].savingsRate, (1000/3000) * 100, 0.01);
    assertClose(trend[1].savingsRate, (1500/3000) * 100, 0.01);
    assertEqual(trend[0].month, '2026-01');
  });

  it('savingsRateTrend returns empty for zero income', function() {
    var monthly = [{ month: '2026-01', net_contribution: 1000 }];
    assertEqual(FICalculator.savingsRateTrend(monthly, 0, 12).length, 0);
  });

  it('coastFI computes the required amount today for growth-only FI', function() {
    // 1M target, 5% real return, 20 years to retirement
    // coastFI = 1000000 / (1.05)^20 ≈ 376889
    var coast = FICalculator.coastFI(1000000, 0.05, 20);
    assertClose(coast, 376889, 500, 'Coast FI amount');
  });

  it('coastFIAnalysis returns reached=true when NW exceeds coast amount', function() {
    var result = FICalculator.coastFIAnalysis(500000, 1000000, 0.07, 0.03, 1993, 55);
    assert(result !== null, 'Should return analysis');
    assert(result.coastFIAmount > 0, 'Coast amount should be positive');
    // With 500k NW, 4% real return, ~26 years to retirement (born 1993, retire 55, now ~2026)
    // coastFI = 1M / (1.04)^29 ≈ ~320k — so 500k > 320k → reached
    assertEqual(result.reached, true);
    assertClose(result.pct, 100, 0.1);
  });

  it('coastFIAnalysis returns null without birth_year', function() {
    var result = FICalculator.coastFIAnalysis(500000, 1000000, 0.07, 0.03, null, 55);
    assertEqual(result, null);
  });

  it('yearsToFIWithGrowth is shorter than without growth', function() {
    var noGrowth = FICalculator.yearsToFI(100000, 2000, 0.07, 1000000);
    var withGrowth = FICalculator.yearsToFIWithGrowth(100000, 2000, 0.07, 1000000, 0.05);
    assert(withGrowth < noGrowth, 'With income growth (' + withGrowth.toFixed(1) + ') should be < without (' + noGrowth.toFixed(1) + ')');
  });

  it('yearsToFIWithGrowth falls back to yearsToFI when no growth', function() {
    var noGrowth = FICalculator.yearsToFI(100000, 2000, 0.07, 1000000);
    var zeroGrowth = FICalculator.yearsToFIWithGrowth(100000, 2000, 0.07, 1000000, 0);
    assertEqual(noGrowth, zeroGrowth);
  });

  it('yearsToFIReal is longer than nominal yearsToFI', function() {
    var nominal = FICalculator.yearsToFI(100000, 2000, 0.07, 1000000);
    var real = FICalculator.yearsToFIReal(100000, 2000, 0.07, 0.03, 1000000);
    assert(real > nominal, 'Real years (' + real.toFixed(1) + ') should be > nominal (' + nominal.toFixed(1) + ')');
  });
});

// --- SummaryCalculator ---

describe('SummaryCalculator', function() {
  it('computeFIImpact detects months closer', function() {
    var result = SummaryCalculator.computeFIImpact(15, 14);
    assertEqual(result.direction, 'closer');
    assertEqual(result.monthsCloser, 12);
  });

  it('computeFIImpact detects months further', function() {
    var result = SummaryCalculator.computeFIImpact(14, 15);
    assertEqual(result.direction, 'further');
    assertEqual(result.monthsCloser, 12);
  });

  it('computeFIImpact handles Infinity', function() {
    var result = SummaryCalculator.computeFIImpact(Infinity, Infinity);
    assertEqual(result.direction, 'same');
  });

  it('computeAnnualSummaries aggregates by year', function() {
    var nwData = [
      { month: '2024-06', total: 50000, accounts: {} },
      { month: '2024-12', total: 60000, accounts: {} },
      { month: '2025-06', total: 75000, accounts: {} },
      { month: '2025-12', total: 90000, accounts: {} }
    ];
    var allData = [
      { month: '2024-06', account_id: 'A', net_contribution: 3000 },
      { month: '2024-12', account_id: 'A', net_contribution: 2000 },
      { month: '2025-06', account_id: 'A', net_contribution: 4000 },
      { month: '2025-12', account_id: 'A', net_contribution: 3000 }
    ];
    var result = SummaryCalculator.computeAnnualSummaries(nwData, allData);
    assertEqual(result.length, 2);
    assertEqual(result[0].year, '2024');
    assertEqual(result[0].endNW, 60000);
    assertEqual(result[0].totalSaved, 5000);
    assertEqual(result[1].year, '2025');
    assertEqual(result[1].startNW, 60000);
    assertEqual(result[1].endNW, 90000);
    assertEqual(result[1].nwChange, 30000);
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

  it('computes liquid, assets, liabilities fields without mortgage', function() {
    var data = [
      { month: '2024-01', account_id: 'BROKER_A', end_value: 50000, net_contribution: 0 },
      { month: '2024-01', account_id: 'TRADE_REPUBLIC', end_value: 20000, net_contribution: 0 }
    ];
    var accountIds = ['BROKER_A', 'TRADE_REPUBLIC'];
    var result = NetWorthCalculator.compute(data, accountIds);
    assertEqual(result[0].liquid, 70000);
    assertEqual(result[0].assets, 70000);
    assertEqual(result[0].liabilities, 0);
    assertEqual(result[0].total, 70000);
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

// --- GoalsCalculator (reads from planner output) ---

describe('GoalsCalculator', function() {
  var mockPlan = {
    goals: [
      { goal_id: 'emergency_fund', name: 'Emergency Fund', target_amount: 40000, current_amount: 35000, remaining: 5000, status: 'on_track', required_monthly: 500, projected_completion: '2026-06', funding_accounts: ['TR'], priority: 1 },
      { goal_id: 'house_downpayment', name: 'House Down Payment', target_amount: 80000, current_amount: 85000, remaining: 0, status: 'funded', required_monthly: 0, projected_completion: '2026-01', funding_accounts: ['BANK'], priority: 2 },
      { goal_id: 'retirement', name: 'Retirement', target_amount: 500000, current_amount: 100000, remaining: 400000, status: 'at_risk', required_monthly: 2000, projected_completion: '2040-01', funding_accounts: ['BROKER'], priority: 3 }
    ],
    budget_deficit: 200,
    budget_surplus: 0
  };

  it('fromPlannerOutput extracts all goals with correct colors', function() {
    var goals = GoalsCalculator.fromPlannerOutput(mockPlan);
    assertEqual(goals.length, 3);
    assertEqual(goals[0].color, 'blue');   // on_track
    assertEqual(goals[1].color, 'green');  // funded
    assertEqual(goals[2].color, 'yellow'); // at_risk
    assertClose(goals[0].pct, 87.5, 0.1);
    assertClose(goals[1].pct, 100, 0.1);
  });

  it('forSummary finds emergency and house goals by ID pattern', function() {
    var summary = GoalsCalculator.forSummary(mockPlan);
    assert(summary.emergency !== null, 'Should find emergency goal');
    assert(summary.house !== null, 'Should find house goal');
    assertEqual(summary.emergency.status, 'blue');
    assertClose(summary.emergency.available, 35000, 0.01);
    assertClose(summary.house.current, 85000, 0.01);
    assertClose(summary.house.surplus, 5000, 0.01);
  });

  it('fromPlannerOutput returns empty array when no plan', function() {
    var goals = GoalsCalculator.fromPlannerOutput(null);
    assertEqual(goals.length, 0);
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

// --- ActionsCalculator ---

describe('ActionsCalculator', function() {
  it('generates budget_deficit action when savings insufficient', function() {
    var plan = {
      goals: [{ goal_id: 'g1', status: 'at_risk', required_monthly: 1000 }],
      budget_deficit: 300,
      budget_surplus: 0,
      required_total: 1000,
      available_for_goals: 700
    };
    var actions = ActionsCalculator.computeActions(plan, null, null);
    assert(actions.some(function(a) { return a.type === 'budget_deficit'; }), 'Should have budget_deficit');
    assertEqual(actions[0].severity, 'error');
  });

  it('generates surplus action when budget exceeds requirements', function() {
    var plan = {
      goals: [{ goal_id: 'g1', name: 'Goal A', status: 'on_track', required_monthly: 500, priority: 1 }],
      budget_deficit: 0,
      budget_surplus: 200,
      required_total: 500,
      available_for_goals: 700
    };
    var actions = ActionsCalculator.computeActions(plan, null, null);
    assert(actions.some(function(a) { return a.type === 'surplus'; }), 'Should suggest surplus allocation');
  });

  it('generates redirect action when goal is funded and others at risk', function() {
    var plan = {
      goals: [
        { goal_id: 'g1', name: 'Done Goal', status: 'funded', required_monthly: 0, priority: 1 },
        { goal_id: 'g2', name: 'Needs Help', status: 'at_risk', required_monthly: 800, priority: 2 }
      ],
      budget_deficit: 0,
      budget_surplus: 0,
      required_total: 800,
      available_for_goals: 500
    };
    var actions = ActionsCalculator.computeActions(plan, null, null);
    assert(actions.some(function(a) { return a.type === 'redirect_funds'; }), 'Should suggest redirect');
  });

  it('returns empty array when no plan', function() {
    var actions = ActionsCalculator.computeActions(null, null, null);
    assertEqual(actions.length, 0);
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

  it('analyzeFunding splits shared account balance weighted by target_amount', function() {
    var goals = [
      { goal_id: 'g1', name: 'Goal 1', active: true, track_current_from_accounts: true, target_amount: 80000, funding_accounts: ['BBVA'] },
      { goal_id: 'g2', name: 'Goal 2', active: true, track_current_from_accounts: true, target_amount: 20000, funding_accounts: ['BBVA'] }
    ];
    var analysis = GoalAccountingService.analyzeFunding(goals, { BBVA: 1000 });
    // 80k / 100k = 80%, 20k / 100k = 20%
    assertClose(analysis.goalCurrentFromAccounts.g1, 800, 0.01);
    assertClose(analysis.goalCurrentFromAccounts.g2, 200, 0.01);
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

  it('buildNeed caps past-deadline goals at remaining/12', function() {
    var goal = { target_amount: 12000, current_amount: 0, target_date: '2024-06' };
    var need = GoalAllocationService.buildNeed(goal, '2025-01');
    // Past deadline: remaining 12000 / 12 = 1000
    assertClose(need.required_monthly, 1000, 0.01);
    assertEqual(need.months_left, 0);
    assertEqual(need.remaining, 12000);
  });

  it('buildNeed calculates monthly for future deadline', function() {
    var goal = { target_amount: 6000, current_amount: 0, target_date: '2025-07' };
    var need = GoalAllocationService.buildNeed(goal, '2025-01');
    // 6 months left, 6000 remaining → 1000/month
    assertClose(need.required_monthly, 1000, 0.01);
    assertEqual(need.months_left, 6);
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

  it('raises budget_deficit conflict when savings insufficient for all goals', function() {
    var goals = [
      { goal_id: 'g1', name: 'Goal A', target_amount: 12000, current_amount: 0, target_date: '2026-01', priority: 1, active: true, track_current_from_accounts: false, funding_accounts: ['BBVA'] }
    ];
    // Need 12000 / 12 months = 1000/mo, but only 500 available
    var plan = GoalRulesService.evaluate(goals, {
      monthlyIncome: 2000,
      monthlyExpenses: 1500,
      asOfMonth: '2025-01',
      latestAccounts: { BBVA: 0 }
    });
    assertClose(plan.budget_deficit, 500, 1);
    assertClose(plan.budget_surplus, 0, 0.01);
    assert(plan.conflicts.some(function(c) { return c.type === 'budget_deficit'; }), 'Expected budget_deficit conflict');
    assertEqual(plan.goals[0].status, 'at_risk');
  });

  it('no budget_deficit when savings cover all goals', function() {
    var goals = [
      { goal_id: 'g1', name: 'Goal A', target_amount: 6000, current_amount: 0, target_date: '2026-01', priority: 1, active: true, track_current_from_accounts: false, funding_accounts: ['BBVA'] }
    ];
    // Need 6000 / 12 = 500/mo, have 1000 available
    var plan = GoalRulesService.evaluate(goals, {
      monthlyIncome: 2000,
      monthlyExpenses: 1000,
      asOfMonth: '2025-01',
      latestAccounts: { BBVA: 0 }
    });
    assertClose(plan.budget_deficit, 0, 0.01);
    assertClose(plan.budget_surplus, 500, 1);
    assert(!plan.conflicts.some(function(c) { return c.type === 'budget_deficit'; }), 'Should not have budget deficit');
    assertEqual(plan.goals[0].status, 'on_track');
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
        { goal_id: 'g2', name: 'Goal 2', target_amount: 50000, current_amount: 0, remaining: 50000, required_monthly: 5000, allocated_monthly: 0, target_date: '2025-12', months_left: 10, priority: 2, status: 'at_risk' }
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

  it('computeGoalFundingHistory averages across months', function() {
    var allData = [
      { month: '2024-01', account_id: 'IBKR', end_value: 10000, net_contribution: 1000 },
      { month: '2024-02', account_id: 'IBKR', end_value: 12000, net_contribution: 1500 }
    ];
    var goals = [
      { goal_id: 'retirement', name: 'Retirement', priority: 1, allocated_monthly: 1200, funding_accounts: ['IBKR'] }
    ];
    var entries = [
      { entry_id: '2024-01_income_salary', month: '2024-01', type: 'income', category: 'Salary', amount: 4000 },
      { entry_id: '2024-01_expense_rent', month: '2024-01', type: 'expense', category: 'Rent', amount: 2000 },
      { entry_id: '2024-02_income_salary', month: '2024-02', type: 'income', category: 'Salary', amount: 4000 },
      { entry_id: '2024-02_expense_rent', month: '2024-02', type: 'expense', category: 'Rent', amount: 2000 }
    ];
    var result = CashflowCalculator.computeGoalFundingHistory(['2024-01', '2024-02'], allData, goals, entries, [], []);
    assertEqual(result.goals.length, 1);
    assertEqual(result.goals[0].goal_id, 'retirement');
    // Avg planned = 1200, avg actual = (1000+1500)/2 = 1250
    assertClose(result.goals[0].avgPlanned, 1200, 0.01);
    assertClose(result.goals[0].avgActual, 1250, 0.01);
    assertEqual(result.totalMonths, 2);
  });

  it('computeIncomeTrend computes growth rate from salary entries', function() {
    var entries = [
      { month: '2024-01', type: 'income', category: 'Salary', amount: 3000 },
      { month: '2024-02', type: 'income', category: 'Salary', amount: 3000 },
      { month: '2024-03', type: 'income', category: 'Salary', amount: 3000 },
      { month: '2024-04', type: 'income', category: 'Salary', amount: 3200 },
      { month: '2024-05', type: 'income', category: 'Salary', amount: 3200 },
      { month: '2024-06', type: 'income', category: 'Salary', amount: 3200 }
    ];
    var result = CashflowCalculator.computeIncomeTrend(entries);
    assertEqual(result.months.length, 6);
    assert(result.growthRate > 0, 'Growth rate should be positive: ' + result.growthRate);
  });

  it('computeIncomeTrend returns zero growth with insufficient data', function() {
    var entries = [
      { month: '2024-01', type: 'income', category: 'Salary', amount: 3000 }
    ];
    var result = CashflowCalculator.computeIncomeTrend(entries);
    assertEqual(result.growthRate, 0);
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

// --- EmergencyCalculator ---
// These tests temporarily override accountsConfig to set up EF account roles.

describe('EmergencyCalculator', function() {
  it('computeStatus without planner goal uses own calculation', function() {
    var saved = accountsConfig;
    accountsConfig = [
      { account_id: 'EF_MAIN', account_name: 'EF Main', type: 'Cash', currency: 'EUR', include_networth: true, emergency_fund_role: 'dedicated' },
      { account_id: 'EF_BACKUP', account_name: 'EF Backup', type: 'Cash', currency: 'EUR', include_networth: true, emergency_fund_role: 'backup' }
    ];
    try {
      var latestAccounts = { EF_MAIN: 8000, EF_BACKUP: 4000 };
      var config = { emergency_fund_target: 10000 };
      var status = EmergencyCalculator.computeStatus(latestAccounts, config);
      assertEqual(status.dedicated, 8000);
      assertEqual(status.backup, 4000);
      assertEqual(status.available, 12000);
      assertEqual(status.target, 10000);
      assertEqual(status.status, 'yellow'); // dedicated < target, but available >= target
    } finally { accountsConfig = saved; }
  });

  it('computeStatus with planner goal uses planner current_amount', function() {
    var saved = accountsConfig;
    accountsConfig = [
      { account_id: 'EF_MAIN', account_name: 'EF Main', type: 'Cash', currency: 'EUR', include_networth: true, emergency_fund_role: 'dedicated' },
      { account_id: 'EF_BACKUP', account_name: 'EF Backup', type: 'Cash', currency: 'EUR', include_networth: true, emergency_fund_role: 'backup' }
    ];
    try {
      var latestAccounts = { EF_MAIN: 8000, EF_BACKUP: 4000 };
      var config = { emergency_fund_target: 10000 };
      var plannerGoal = { current_amount: 15000, target_amount: 20000 };
      var status = EmergencyCalculator.computeStatus(latestAccounts, config, plannerGoal);
      assertEqual(status.available, 15000);
      assertEqual(status.target, 20000);
      assert(Math.abs(status.dedicated - 10000) < 1, 'dedicated scaled: ' + status.dedicated);
      assert(Math.abs(status.backup - 5000) < 1, 'backup scaled: ' + status.backup);
    } finally { accountsConfig = saved; }
  });

  it('computeStatus planner goal does not override when amounts match', function() {
    var saved = accountsConfig;
    accountsConfig = [
      { account_id: 'EF_MAIN', account_name: 'EF Main', type: 'Cash', currency: 'EUR', include_networth: true, emergency_fund_role: 'dedicated' },
      { account_id: 'EF_BACKUP', account_name: 'EF Backup', type: 'Cash', currency: 'EUR', include_networth: true, emergency_fund_role: 'backup' }
    ];
    try {
      var latestAccounts = { EF_MAIN: 8000, EF_BACKUP: 4000 };
      var config = { emergency_fund_target: 10000 };
      var plannerGoal = { current_amount: 12000, target_amount: 10000 };
      var status = EmergencyCalculator.computeStatus(latestAccounts, config, plannerGoal);
      assertEqual(status.available, 12000);
      assertEqual(status.dedicated, 8000);
      assertEqual(status.target, 10000);
    } finally { accountsConfig = saved; }
  });
});

// --- MilestoneCalculator (glide paths from planner goals) ---

describe('MilestoneCalculator', function() {
  it('computeGoalGlidePath computes progress and status', function() {
    var goal = { goal_id: 'ef', name: 'Emergency Fund', target_date: '2027-01', target_amount: 40000, current_amount: 25000 };
    var result = MilestoneCalculator.computeGoalGlidePath(goal, '2025-01', '2026-01');
    assertEqual(result.goal_id, 'ef');
    assertEqual(result.totalTarget, 40000);
    assertEqual(result.currentTotal, 25000);
    assertClose(result.progressPct, 62.5, 0.1);
    assertEqual(result.monthsLeft, 12);
    assertClose(result.monthlyNeeded, 1250, 1);
    // 12 of 24 months elapsed = 50% expected = 20000, we have 25000 > 20000*1.05 = 21000 → ahead
    assertEqual(result.status, 'ahead');
  });

  it('computeGoalGlidePath returns achieved when funded', function() {
    var goal = { goal_id: 'ef', name: 'EF', target_date: '2027-01', target_amount: 40000, current_amount: 45000 };
    var result = MilestoneCalculator.computeGoalGlidePath(goal, '2025-01', '2026-01');
    assertEqual(result.status, 'achieved');
    assertEqual(result.remaining, 0);
  });

  it('computeGoalGlidePath returns null for goals without target_date', function() {
    var goal = { goal_id: 'x', name: 'No Date', target_amount: 10000, current_amount: 5000 };
    var result = MilestoneCalculator.computeGoalGlidePath(goal, '2025-01', '2026-01');
    assertEqual(result, null);
  });

  it('computeAllFromGoals filters goals with target_date', function() {
    var goals = [
      { goal_id: 'a', name: 'A', target_date: '2027-01', target_amount: 10000, current_amount: 5000 },
      { goal_id: 'b', name: 'B', target_amount: 20000, current_amount: 10000 },
      { goal_id: 'c', name: 'C', target_date: '2028-06', target_amount: 30000, current_amount: 0 }
    ];
    var results = MilestoneCalculator.computeAllFromGoals(goals, '2025-01', '2026-01');
    assertEqual(results.length, 2);
    assertEqual(results[0].goal_id, 'a');
    assertEqual(results[1].goal_id, 'c');
  });

  it('legacy computeAll still works for backward compat', function() {
    var milestones = [{ milestone_id: 'ms1', name: 'End 2026', target_date: '2026-12', total_target: 100000, sub_targets: [] }];
    var values = { total: 60000 };
    var results = MilestoneCalculator.computeAll(milestones, values, '2025-01', '2026-01');
    assertEqual(results.length, 1);
    assertEqual(results[0].goal_id, 'ms1');
    assertClose(results[0].progressPct, 60, 0.1);
  });
});
