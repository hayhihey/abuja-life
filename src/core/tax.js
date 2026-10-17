// ============================================================================
// ABUJA LIFE: FEDERAL INLAND REVENUE (FIRS) & FCT-IRS TAXATION ENGINE
// Progressive PAYE, Corporate Levy, Luxury Property Tax & Tax Clearance Cert (TCC)
// ============================================================================

export const TAX_BRACKETS = [
  { threshold: 300000, rate: 0.05, label: 'Standard Exemption / Minimum Tax' },
  { threshold: 1000000, rate: 0.10, label: 'Lower Middle Bracket (10%)' },
  { threshold: 3500000, rate: 0.15, label: 'Upper Middle Bracket (15%)' },
  { threshold: 10000000, rate: 0.20, label: 'Executive Bracket (20%)' },
  { threshold: Infinity, rate: 0.24, label: 'High Net Worth Individual (HNWI) (24%)' }
];

export const LUXURY_ASSET_TAX = {
  mansion_asokoro: 150000,
  mansion_maitama: 120000,
  duplex_wuse2: 65000,
  duplex_gwarinpa: 35000,
  car_luxury_suv: 50000,
  car_sports_coupe: 45000
};

/**
 * Calculate total pending tax liabilities for a player state.
 * @param {object} s - Player game state
 * @returns {object} Tax audit breakdown
 */
export function calculateTaxAssessment(s) {
  const funds = (s.fin?.cash || 0) + (s.fin?.bank || 0);
  const netIncome = Math.max(0, funds);
  
  // 1. Progressive PAYE
  let remaining = netIncome;
  let payeTax = 0;
  let prevThreshold = 0;

  for (const b of TAX_BRACKETS) {
    const chunk = Math.min(remaining, b.threshold - prevThreshold);
    if (chunk > 0) {
      payeTax += chunk * b.rate;
      remaining -= chunk;
      prevThreshold = b.threshold;
    }
    if (remaining <= 0) break;
  }

  // Scale down to a reasonable daily/weekly cycle tax rate so it's fun and strategic, not crippling
  const cyclePaye = Math.round(payeTax * 0.045);

  // 2. Luxury Asset Levies
  let luxuryTax = 0;
  const currentDistrict = s.loc?.district;
  if (currentDistrict === 'asokoro') luxuryTax += LUXURY_ASSET_TAX.mansion_asokoro;
  else if (currentDistrict === 'maitama') luxuryTax += LUXURY_ASSET_TAX.mansion_maitama;
  else if (currentDistrict === 'wuse2') luxuryTax += LUXURY_ASSET_TAX.duplex_wuse2;
  else if (currentDistrict === 'gwarinpa') luxuryTax += LUXURY_ASSET_TAX.duplex_gwarinpa;

  if (s.social?.car) {
    if (s.social.car.type === 'vip_suv') luxuryTax += LUXURY_ASSET_TAX.car_luxury_suv;
    if (s.social.car.type === 'sports_coupe') luxuryTax += LUXURY_ASSET_TAX.car_sports_coupe;
  }

  const totalDue = cyclePaye + luxuryTax;
  const currentDayNum = s.clock?.day || (s.t ? Math.floor(s.t / 1440) + 1 : 1);
  const hasValidTCC = Boolean(s.tax?.tccValidUntilDay && s.tax.tccValidUntilDay >= currentDayNum);

  return {
    netIncome,
    cyclePaye,
    luxuryTax,
    totalDue,
    hasValidTCC,
    tccExpiresDay: s.tax?.tccValidUntilDay || 0,
    firsTaxId: s.tax?.firsTaxId || `FIRS-ABJ-${(currentDayNum * 739 + 1042) % 9000 + 1000}`
  };
}

/**
 * Pay taxes and renew official Tax Clearance Certificate (TCC).
 * @param {object} s - Player game state
 * @returns {object} Result of tax payment
 */
export function payTaxesAndIssueTCC(s) {
  const assessment = calculateTaxAssessment(s);
  const total = assessment.totalDue;
  
  const bank = s.bank !== undefined ? s.bank : (s.fin?.bank || 0);
  const cash = s.cash !== undefined ? s.cash : (s.fin?.cash || 0);

  if (bank + cash < total) {
    return {
      success: false,
      message: `Insufficient funds to settle FIRS Tax Assessment of ₦${total.toLocaleString()}. You have ₦${(bank + cash).toLocaleString()}.`
    };
  }

  if (s.bank !== undefined) {
    if (s.bank >= total) {
      s.bank -= total;
    } else {
      const fromCash = total - s.bank;
      s.bank = 0;
      s.cash -= fromCash;
    }
  } else if (s.fin) {
    if (s.fin.bank >= total) {
      s.fin.bank -= total;
    } else {
      const fromCash = total - s.fin.bank;
      s.fin.bank = 0;
      s.fin.cash -= fromCash;
    }
  }

  if (!s.tax) s.tax = {};
  const currentDayNum = s.clock?.day || (s.t ? Math.floor(s.t / 1440) + 1 : 1);
  s.tax.firsTaxId = assessment.firsTaxId;
  s.tax.tccValidUntilDay = currentDayNum + 14; // Valid for 14 game days
  s.tax.totalTaxesPaid = (s.tax.totalTaxesPaid || 0) + total;
  
  if (!s.social) s.social = {};
  s.clout = Math.min(100, (s.clout || 20) + 15);
  s.social.steeze = Math.min(100, (s.social.steeze || 70) + 10);

  return {
    success: true,
    amountPaid: total,
    tccId: assessment.firsTaxId,
    validUntilDay: s.tax.tccValidUntilDay,
    message: `FIRS Tax Assessment settled in full (₦${total.toLocaleString()}). Official Tax Clearance Certificate (TCC) granted for 14 Days! +15 Clout.`
  };
}
