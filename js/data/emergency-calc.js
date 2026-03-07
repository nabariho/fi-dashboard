// === EMERGENCY FUND CALCULATOR ===
// Computes emergency fund history, monthly flows, and coverage metrics.
// Pure math, no DOM access.

var EmergencyCalculator = {

  // Get the list of emergency fund account IDs from config.
  // Falls back to hardcoded defaults for backward compatibility.
  getAccountIds: function(config) {
    if (config.emergency_fund_accounts && config.emergency_fund_accounts.length) {
      return config.emergency_fund_accounts.map(function(a) { return a.account_id; });
    }
    return ['TRADE_REPUBLIC', 'BBVA'];
  },

  // Get account roles from config. Returns { account_id: 'dedicated'|'backup' }
  getAccountRoles: function(config) {
    var roles = {};
    if (config.emergency_fund_accounts && config.emergency_fund_accounts.length) {
      config.emergency_fund_accounts.forEach(function(a) {
        roles[a.account_id] = a.role || 'backup';
      });
    } else {
      roles.TRADE_REPUBLIC = 'dedicated';
      roles.BBVA = 'backup';
    }
    return roles;
  },

  // Compute monthly history of emergency fund balances.
  // Returns array of { month, balance, contributions, withdrawals, marketChange, perAccount: { id: { value, contribution } } }
  computeHistory: function(allData, accountIds, target) {
    // Group data by month
    var months = {};
    var monthOrder = [];

    for (var i = 0; i < allData.length; i++) {
      var row = allData[i];
      if (accountIds.indexOf(row.account_id) === -1) continue;

      if (!months[row.month]) {
        months[row.month] = {};
        monthOrder.push(row.month);
      }
      months[row.month][row.account_id] = {
        value: row.end_value || 0,
        contribution: row.net_contribution || 0
      };
    }

    monthOrder.sort();

    var history = [];
    var prevBalance = 0;

    for (var m = 0; m < monthOrder.length; m++) {
      var month = monthOrder[m];
      var accts = months[month];
      var balance = 0;
      var totalContribution = 0;
      var perAccount = {};

      for (var a = 0; a < accountIds.length; a++) {
        var id = accountIds[a];
        var acct = accts[id] || { value: 0, contribution: 0 };
        balance += acct.value;
        totalContribution += acct.contribution;
        perAccount[id] = { value: acct.value, contribution: acct.contribution };
      }

      var contributions = Math.max(totalContribution, 0);
      var withdrawals = Math.min(totalContribution, 0);
      var marketChange = balance - prevBalance - totalContribution;

      history.push({
        month: month,
        balance: balance,
        contributions: contributions,
        withdrawals: withdrawals,
        netContribution: totalContribution,
        marketChange: marketChange,
        target: target,
        funded: balance >= target,
        perAccount: perAccount
      });

      prevBalance = balance;
    }

    return history;
  },

  // Compute current status with configurable accounts and roles.
  computeStatus: function(latestAccounts, config) {
    var target = config.emergency_fund_target || 40000;
    var roles = this.getAccountRoles(config);
    var accountIds = this.getAccountIds(config);

    var dedicated = 0;
    var backup = 0;

    for (var i = 0; i < accountIds.length; i++) {
      var id = accountIds[i];
      var val = latestAccounts[id] || 0;
      if (roles[id] === 'dedicated') {
        dedicated += val;
      } else {
        backup += val;
      }
    }

    var available = dedicated + backup;
    var status;
    if (dedicated >= target) {
      status = 'green';
    } else if (available >= target) {
      status = 'yellow';
    } else {
      status = 'red';
    }

    var effective = status === 'green' ? dedicated : available;
    var pct = target > 0 ? Math.min((effective / target) * 100, 100) : 0;

    return {
      dedicated: dedicated,
      backup: backup,
      available: available,
      target: target,
      pct: pct,
      status: status
    };
  },

  // Compute how many months of expenses the fund covers.
  computeCoverage: function(balance, monthlyExpenses) {
    if (!monthlyExpenses || monthlyExpenses <= 0) return null;
    return Math.floor(balance / monthlyExpenses * 10) / 10;
  },

  // Compute cumulative contributions and withdrawals over time.
  computeCumulativeFlows: function(history) {
    var cumContributions = 0;
    var cumWithdrawals = 0;

    return history.map(function(h) {
      cumContributions += h.contributions;
      cumWithdrawals += h.withdrawals;
      return {
        month: h.month,
        cumContributions: cumContributions,
        cumWithdrawals: cumWithdrawals,
        balance: h.balance
      };
    });
  }
};
