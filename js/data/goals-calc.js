// === GOALS CALCULATOR ===
// Computes emergency fund and house down payment goal status. Pure math, no DOM access.
//
// House accounts (ARRAS + BANKINTER) are fully earmarked for the house and excluded
// from the emergency fund pool. Emergency fund = TRADE_REPUBLIC + BBVA only.

var GoalsCalculator = {
  // Compute emergency fund status
  // accounts: { TRADE_REPUBLIC, BBVA, ... } (values from latest NW data)
  // emergencyTarget: target amount (e.g. 40000)
  computeEmergencyFund: function(accounts, emergencyTarget) {
    var dedicated = accounts.TRADE_REPUBLIC || 0;
    var available = dedicated + (accounts.BBVA || 0);

    var status;
    if (dedicated >= emergencyTarget) {
      status = 'green';
    } else if (available >= emergencyTarget) {
      status = 'yellow';
    } else {
      status = 'red';
    }

    var effective = status === 'green' ? dedicated : available;
    var pct = emergencyTarget > 0 ? Math.min((effective / emergencyTarget) * 100, 100) : 0;

    return {
      dedicated: dedicated,
      available: available,
      target: emergencyTarget,
      pct: pct,
      status: status
    };
  },

  // Compute house down payment progress
  // accounts: { ARRAS, BANKINTER } (values from latest NW data)
  // houseTarget: target amount (e.g. 80000)
  // operatingReserve: monthly budget to deduct from Bankinter (default 0)
  computeHouseDownPayment: function(accounts, houseTarget, operatingReserve) {
    var bankinterTotal = accounts.BANKINTER || 0;
    var reserve = operatingReserve || 0;
    var bankinterEffective = Math.max(0, bankinterTotal - reserve);
    var current = (accounts.ARRAS || 0) + bankinterEffective;
    var surplus = Math.max(0, current - houseTarget);
    var pct = houseTarget > 0 ? Math.min((current / houseTarget) * 100, 100) : 0;

    return {
      current: current,
      target: houseTarget,
      surplus: surplus,
      pct: pct,
      bankinterTotal: bankinterTotal,
      bankinterEffective: bankinterEffective,
      operatingReserve: reserve
    };
  }
};
