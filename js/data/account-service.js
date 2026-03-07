// === ACCOUNT SERVICE ===
// Pure data lookups against the accounts config. No DOM access.

var AccountService = (function() {
  var PALETTE = ['#1a73e8', '#0d904f', '#e8710a', '#9334e6', '#4285f4', '#34a853', '#ea4335', '#f538a0'];

  function find(id) {
    return accountsConfig.find(function(a) { return a.account_id === id; });
  }

  return {
    getName: function(id) {
      var acct = find(id);
      return acct ? acct.account_name : id;
    },

    getColor: function(id) {
      var idx = accountsConfig.findIndex(function(a) { return a.account_id === id; });
      return PALETTE[idx >= 0 ? idx % PALETTE.length : 0];
    },

    isPerformance: function(id) {
      var acct = find(id);
      return acct ? acct.include_performance : false;
    },

    isNetworth: function(id) {
      var acct = find(id);
      return acct ? acct.include_networth : false;
    },

    isBroker: function(id) {
      var acct = find(id);
      return acct ? acct.type === 'Broker' : false;
    },

    isCash: function(id) {
      var acct = find(id);
      return acct ? acct.type === 'Cash' : false;
    },

    getPerformanceAccounts: function() {
      return accountsConfig.filter(function(a) { return a.include_performance; });
    },

    getNetworthAccounts: function() {
      return accountsConfig.filter(function(a) { return a.include_networth; });
    },

    getNetworthAccountIds: function() {
      return this.getNetworthAccounts().map(function(a) { return a.account_id; });
    },

    getBrokerAccountIds: function() {
      return accountsConfig.filter(function(a) { return a.include_networth && a.type === 'Broker'; })
        .map(function(a) { return a.account_id; });
    },

    getCashAccountIds: function() {
      return accountsConfig.filter(function(a) { return a.include_networth && a.type === 'Cash'; })
        .map(function(a) { return a.account_id; });
    },

    getEmergencyFundAccounts: function() {
      return accountsConfig.filter(function(a) { return a.emergency_fund_role && a.emergency_fund_role !== 'none'; });
    },

    getEmergencyFundAccountIds: function() {
      return this.getEmergencyFundAccounts().map(function(a) { return a.account_id; });
    },

    getEmergencyFundRoles: function() {
      var roles = {};
      this.getEmergencyFundAccounts().forEach(function(a) {
        roles[a.account_id] = a.emergency_fund_role;
      });
      return roles;
    }
  };
})();
