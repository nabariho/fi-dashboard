#!/usr/bin/env node
// Node.js test runner — mirrors test-runner.html but for CLI use.
// Usage: node tests/run-tests.js

var vm = require('vm');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
function load(f) { vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f }); }

// Test framework (same as test-runner.html) — must be global for vm.runInThisContext
global._suites = [];
global._currentSuite = null;
global.describe = function(n, f) { global._currentSuite = { name: n, tests: [] }; global._suites.push(global._currentSuite); f(); global._currentSuite = null; };
global.it = function(n, f) { global._currentSuite.tests.push({ name: n, fn: f }); };
global.assert = function(c, m) { if (!c) throw new Error(m || 'Assertion failed'); };
global.assertClose = function(a, e, t, m) { if (Math.abs(a - e) > t) throw new Error((m || '') + ' Expected ~' + e + ', got ' + a); };
global.assertEqual = function(a, e, m) { if (a !== e) throw new Error((m || '') + ' Expected ' + JSON.stringify(e) + ', got ' + JSON.stringify(a)); };

// Global state expected by modules
global.accountsConfig = [
  { account_id: 'BROKER_A', account_name: 'Broker A', type: 'Broker', currency: 'EUR', include_networth: true, include_performance: true, cashflow_role: 'savings' },
  { account_id: 'BROKER_B', account_name: 'Broker B', type: 'Broker', currency: 'EUR', include_networth: true, include_performance: true, cashflow_role: 'savings' },
  { account_id: 'TRADE_REPUBLIC', account_name: 'Trade Republic', type: 'Cash', currency: 'EUR', include_networth: true, include_performance: false, cashflow_role: 'savings' },
  { account_id: 'BBVA', account_name: 'BBVA', type: 'Cash', currency: 'EUR', include_networth: true, include_performance: false, cashflow_role: 'transactional' },
  { account_id: 'BANKINTER', account_name: 'Bankinter', type: 'Cash', currency: 'EUR', include_networth: true, include_performance: false, cashflow_role: 'savings' },
  { account_id: 'ARRAS', account_name: 'Arras', type: 'Cash', currency: 'EUR', include_networth: true, include_performance: false, cashflow_role: 'savings' }
];

// Load modules in same order as test-runner.html
load('js/lib/utils.js');
load('js/lib/date-utils.js');
load('js/data/account-service.js');
load('js/data/data-service.js');
load('js/data/returns-calc.js');
load('js/data/networth-calc.js');
load('js/data/fi-calc.js');
load('js/data/goals-calc.js');
load('js/data/budget-calc.js');
load('js/data/goal-accounting-service.js');
load('js/data/goal-allocation-service.js');
load('js/data/goal-rules-service.js');
load('js/data/actions-calc.js');
load('js/data/emergency-calc.js');
load('js/data/milestone-calc.js');
load('js/data/cashflow-taxonomy-service.js');
load('js/data/cashflow-normalization-service.js');
load('js/data/cashflow-calc.js');
load('js/data/savings-capacity-calc.js');
load('js/data/goal-planner-calc.js');
load('js/data/anomaly-calc.js');
load('js/data/summary-calc.js');

// Load test files
load('tests/test-calculators.js');

// Run all tests
var pass = 0, fail = 0;
for (var s = 0; s < global._suites.length; s++) {
  var suite = global._suites[s];
  var suiteFails = 0;
  for (var t = 0; t < suite.tests.length; t++) {
    try {
      suite.tests[t].fn();
      pass++;
    } catch(e) {
      fail++;
      suiteFails++;
      console.log('  FAIL: ' + suite.name + ' > ' + suite.tests[t].name);
      console.log('    ' + e.message);
    }
  }
  if (suiteFails === 0) {
    console.log('  \u2713 ' + suite.name + ' (' + suite.tests.length + ' tests)');
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
