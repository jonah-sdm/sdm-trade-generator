/**
 * SDM Lending Calculator Engine
 * Based on SDM Lending Overview 2026 terms
 */

const TERMS = {
  ltv: 0.65,
  arrangementFee: 0.02,
  annualRate: 0.08,
  minLoan: 500000,
  minTermMonths: 18,
  maxTermMonths: 48,
  defaultThreshold: 0.70, // 70% of FMP triggers margin call
  marginCureDays: 5,
};

// Top 50 digital assets (common ones for dropdown)
const SUPPORTED_ASSETS = [
  "BTC", "ETH", "SOL", "XRP", "ADA", "AVAX", "DOT", "MATIC", "LINK", "UNI",
  "LTC", "BCH", "ATOM", "NEAR", "APT", "ARB", "OP", "FIL", "ICP", "HBAR",
  "STX", "IMX", "MKR", "AAVE", "GRT", "SNX", "COMP", "CRV", "LDO", "RPL",
  "DOGE", "SHIB", "PEPE", "TRX", "TON", "SUI", "SEI", "TIA", "JUP", "PYTH",
  "RENDER", "FET", "TAO", "INJ", "PENDLE", "ENA", "ETHFI", "EIGEN", "W", "ONDO",
];

function fmt(v) {
  const num = typeof v === "number" ? v : parseFloat(String(v).replace(/[,$\s]/g, ""));
  if (isNaN(num)) return `${v}`;
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInt(v) {
  const num = typeof v === "number" ? v : parseFloat(String(v).replace(/[,$\s]/g, ""));
  if (isNaN(num)) return `${v}`;
  return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function computeLendingProposal(inputs) {
  const {
    borrowerName = "Client",
    collateralAsset = "BTC",
    collateralUnits,
    pricePerUnit,
    termMonths = 18,
    loanCurrency = "USD",
    ltv: ltvInput,
    annualRate: rateInput,
  } = inputs;

  const units = parseFloat(String(collateralUnits).replace(/,/g, ""));
  const price = parseFloat(String(pricePerUnit).replace(/,/g, ""));
  const term = parseInt(termMonths);
  const ltvPct = parseFloat(String(ltvInput || "65").replace(/,/g, ""));
  const ratePct = parseFloat(String(rateInput || "8").replace(/,/g, ""));

  if (isNaN(units) || isNaN(price) || units <= 0 || price <= 0) {
    return { error: "Please enter valid collateral units and price per unit." };
  }

  if (term < 1 || term > TERMS.maxTermMonths) {
    return { error: `Term must be between 1 and ${TERMS.maxTermMonths} months.` };
  }

  if (isNaN(ltvPct) || ltvPct <= 0 || ltvPct > 100) {
    return { error: "LTV must be between 1% and 100%." };
  }
  if (isNaN(ratePct) || ratePct <= 0) {
    return { error: "Annual interest rate must be greater than 0%." };
  }

  const ltv = ltvPct / 100;
  const annualRate = ratePct / 100;

  // Core calculations
  const collateralValue = units * price;
  const grossLoan = collateralValue * ltv;
  const arrangementFeeAmount = grossLoan * TERMS.arrangementFee;
  const netLoanProceeds = grossLoan - arrangementFeeAmount;

  if (netLoanProceeds < TERMS.minLoan) {
    return { error: `Net loan proceeds ($${fmt(netLoanProceeds)}) fall below the minimum loan size of $${fmt(TERMS.minLoan)}.` };
  }

  // Interest calculations
  const quarterlyRate = annualRate / 4;
  const totalQuarters = Math.ceil(term / 3);
  const quarterlyPayment = grossLoan * quarterlyRate;
  const totalInterest = quarterlyPayment * totalQuarters;
  const totalCost = arrangementFeeAmount + totalInterest;
  const effectiveRate = (totalCost / grossLoan) * (12 / term) * 100;

  // Margin call level
  const marginCallPrice = price * TERMS.defaultThreshold;

  // Amortization schedule (quarterly)
  const schedule = [];
  for (let q = 1; q <= totalQuarters; q++) {
    const monthEnd = q * 3;
    schedule.push({
      quarter: q,
      monthEnd: Math.min(monthEnd, term),
      interestPayment: quarterlyPayment,
      outstandingPrincipal: grossLoan,
      cumulativeInterest: quarterlyPayment * q,
    });
  }

  // Summary for executive text
  const summary = generateLendingSummary({
    borrowerName,
    collateralAsset,
    units,
    price,
    collateralValue,
    grossLoan,
    netLoanProceeds,
    arrangementFeeAmount,
    term,
    quarterlyPayment,
    totalInterest,
    totalCost,
    marginCallPrice,
    totalQuarters,
    loanCurrency,
    ltvPct,
    ratePct,
  });

  return {
    // Inputs echo
    borrowerName,
    collateralAsset,
    collateralUnits: units,
    pricePerUnit: price,
    termMonths: term,
    loanCurrency,

    // Computed
    collateralValue,
    grossLoan,
    arrangementFeeAmount,
    netLoanProceeds,
    quarterlyPayment,
    totalQuarters,
    totalInterest,
    totalCost,
    effectiveRate,
    marginCallPrice,
    schedule,
    summary,

    // Terms (dynamic)
    ltv,
    arrangementFeeRate: TERMS.arrangementFee,
    annualRate,
    defaultThreshold: TERMS.defaultThreshold,
    marginCureDays: TERMS.marginCureDays,
  };
}

function generateLendingSummary(d) {
  const $ = (v) => `$${fmt(v)}`;

  return `SDM Lending proposes a collateralized loan facility for ${d.borrowerName}, secured against ${fmt(d.units)} ${d.collateralAsset} valued at ${$(d.price)} per unit (Fair Market Price based on 3-day pricing model).

The total collateral value is ${$(d.collateralValue)}, supporting a gross loan of ${$(d.grossLoan)} at a ${d.ltvPct}% loan-to-value ratio. After deducting the 2% arrangement fee of ${$(d.arrangementFeeAmount)}, net loan proceeds of ${$(d.netLoanProceeds)} ${d.loanCurrency} will be distributed to the borrower at closing.

The loan carries an annual interest rate of ${d.ratePct}%, payable quarterly in arrears at ${$(d.quarterlyPayment)} per quarter over ${d.totalQuarters} quarters (${d.term}-month term). Total interest over the life of the loan is ${$(d.totalInterest)}, bringing the all-in cost of borrowing to ${$(d.totalCost)}.

A margin call is triggered if the ${d.collateralAsset} price falls below ${$(d.marginCallPrice)} (70% of FMP) for 3 consecutive business days. Upon notice, the borrower has 5 business days to cure via additional collateral, partial loan repayment, or forfeiture of collateral. There is no early repayment option and no collateral rebalancing on the upside.`;
}

export { computeLendingProposal, SUPPORTED_ASSETS, TERMS, fmt, fmtInt };
