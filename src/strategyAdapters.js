// ═══════════════════════════════════════════════════════════════════════════
// Strategy Adapters — convert raw form fields → StrategyDef for universal engine
// ═══════════════════════════════════════════════════════════════════════════

// Shared number parser
function n(v) {
  if (typeof v === "number") return v || 0;
  if (!v) return 0;
  return Number(String(v).replace(/[$,%\s]/g, "").replace(/,/g, "")) || 0;
}

// Shared formatters
function fmt(v, decimals = 0) {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(decimals > 0 ? decimals : 0)}K`;
  if (Math.abs(v) < 1 && v !== 0) return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  if (Math.abs(v) < 100 && v !== 0) return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: decimals })}`;
}

function fmtFull(v) {
  const num = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,%\s,]/g, ""));
  if (isNaN(num)) return `$${v}`;
  if (Math.abs(num) < 1 && num !== 0) return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtExact(v) {
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ── CASH-SECURED PUT ────────────────────────────────────────────────────

export function adaptCashSecuredPut(f) {
  const price = n(f.current_price);
  const strike = n(f.strike);
  const premium = Math.abs(n(f.premium)); // always received — force positive
  const dte = n(f.dte);
  const capitalReq = n(f.capital_required) || strike;
  const effectiveBasis = n(f.effective_basis) || (strike - premium);
  const annReturn = capitalReq > 0 && dte > 0 ? ((premium / capitalReq) * (365 / dte) * 100).toFixed(1) : "N/A";

  return {
    strategyId: "cash_secured_put",
    tradeType: "cash_secured_put",
    spot: price,
    legs: [{ type: "put", side: "short", strike, quantity: 1 }],
    netPremium: premium,
    contracts: 1,
    returnBasis: "capital_required",
    capitalRequired: capitalReq,
    chartBounds: { min: strike * 0.75, max: price * 1.15 },
    buildMetrics: ({ breakevens, extrema }) => [
      { label: "Current Price", value: fmtFull(price), sub: f.asset || "—" },
      { label: "Expiry", value: f.expiry || "—", sub: dte > 0 ? `${dte} DTE` : "—" },
      { label: "Premium Income", value: fmtExact(premium), sub: `${annReturn}% ann. yield`, positive: true },
      { label: "Breakeven", value: fmtFull(breakevens[0] || effectiveBasis), sub: "If assigned" },
      { label: "Effective Basis", value: fmtFull(effectiveBasis), sub: `${price > 0 ? ((1 - effectiveBasis / price) * 100).toFixed(1) : 0}% below spot` },
      { label: "Capital Req.", value: fmtExact(capitalReq), sub: `${f.iv_rank || "—"}% IV Rank · ${dte}d` },
    ],
    buildLegs: () => [
      { action: "SELL", type: "Put", strike, label: `${fmtFull(strike)} Put @ ${fmtExact(premium)}`, color: "#A78BFA" },
    ],
    buildZones: ({ breakevens }) => [
      { from: breakevens[0] || effectiveBasis, to: price * 1.15, label: "Profit Zone", color: "rgba(74,222,128,0.08)" },
    ],
  };
}

// ── LEAP (LONG-DATED CALL) ──────────────────────────────────────────────

export function adaptLeap(f) {
  const price = n(f.current_price);
  const strike = n(f.strike);
  const premium = Math.abs(n(f.premium)); // always a cost — force positive
  const contracts = n(f.contracts) || 1;
  const totalOutlay = Math.abs(n(f.total_outlay) || premium * contracts); // always paid
  const dte = n(f.dte);
  const target = n(f.target_price);
  const delta = f.delta || "—";
  const leverageMultiple = price > 0 && premium > 0 ? (n(f.delta) * price / premium) : null;
  const profitAtTarget = target > strike ? ((target - strike) * contracts) - totalOutlay : null;
  const returnOnCapital = profitAtTarget !== null && totalOutlay > 0 ? (profitAtTarget / totalOutlay * 100) : null;

  return {
    strategyId: "leap",
    tradeType: "leap",
    spot: price,
    legs: [{ type: "call", side: "long", strike, quantity: contracts }],
    netPremium: -totalOutlay,
    contracts: 1, // quantity already in leg
    returnBasis: "net_premium",
    chartBounds: {
      min: strike * 0.7,
      max: target ? Math.max(target * 1.2, strike * 1.5) : strike * 1.5,
    },
    buildMetrics: ({ breakevens, extrema }) => {
      const metrics = [
        { label: "Current Price", value: fmtFull(price), sub: f.asset || "—" },
        { label: "Capital at Risk", value: fmt(totalOutlay), sub: `${contracts} contracts`, negative: true },
        { label: "Expiry", value: f.expiry || "—", sub: dte > 0 ? `${dte} DTE` : "—" },
        { label: "Breakeven", value: fmtFull(breakevens[0] || (strike + premium)), sub: `+${breakevens[0] ? ((breakevens[0] / price - 1) * 100).toFixed(1) : "?"}%` },
      ];
      if (profitAtTarget !== null) {
        metrics.push({ label: "Profit at Target", value: fmt(profitAtTarget), sub: `at ${fmtFull(target)}`, positive: true });
        metrics.push({ label: "Return on Capital", value: `${returnOnCapital.toFixed(0)}%`, sub: `${(profitAtTarget / totalOutlay + 1).toFixed(1)}x capital`, positive: true });
      }
      metrics.push({ label: "Delta / Leverage", value: `${delta} / ${leverageMultiple ? leverageMultiple.toFixed(1) + "x" : "—"}`, sub: `${contracts} contracts` });
      return metrics;
    },
    buildLegs: () => [
      { action: "BUY", type: "Call (Long-Dated)", strike, label: `${fmtFull(strike)} Call @ ${fmtFull(premium)}`, color: "#FB923C" },
    ],
    buildZones: ({ breakevens }) => [
      ...(breakevens[0] ? [{ from: breakevens[0], to: target || strike * 1.5, label: "Profit Zone", color: "rgba(74,222,128,0.08)" }] : []),
    ],
  };
}

// ── CALL SPREAD ─────────────────────────────────────────────────────────

export function adaptCallSpread(f) {
  const spot = n(f.spot);
  const longK = n(f.long_strike);
  const shortK = n(f.short_strike);
  const dir = f.direction || "Long";
  const isLong = dir === "Long";
  const holdings = Math.max(1, parseFloat(f.holdings) || parseFloat(f.contracts) || 1);

  // User enters premium PER UNIT. Engine receives per-unit and multiplies by contracts (holdings).
  const premiumPerUnit = isLong ? -Math.abs(n(f.premium)) : Math.abs(n(f.premium));

  const legs = isLong
    ? [
        { type: "call", side: "long", strike: longK },
        { type: "call", side: "short", strike: shortK },
      ]
    : [
        { type: "call", side: "short", strike: shortK },
        { type: "call", side: "long", strike: longK },
      ];

  const spreadWidth = shortK - longK;
  // Analytical max P&L — total position (per-unit × holdings)
  const analyticalMaxProfit = isLong ? (spreadWidth + premiumPerUnit) * holdings : premiumPerUnit * holdings;
  const analyticalMaxLoss   = isLong ? premiumPerUnit * holdings : (premiumPerUnit - spreadWidth) * holdings;

  const chartMin = Math.min(spot, longK, shortK) * 0.85;
  const chartMax = Math.max(spot, longK, shortK) * 1.15;

  return {
    strategyId: "call_spread",
    tradeType: "call_spread",
    spot,
    legs,
    netPremium: premiumPerUnit,   // per-unit; engine multiplies by contracts (holdings)
    contracts: holdings,
    positionSize: holdings,
    returnBasis: "net_premium",
    chartBounds: { min: chartMin, max: chartMax },
    buildMetrics: ({ breakevens }) => [
      { label: "Spot Price", value: fmt(spot), sub: f.asset || "—" },
      { label: dir + " Call Spread", value: `${fmt(longK)} / ${fmt(shortK)}` },
      { label: "Expiry", value: f.expiry || "—", sub: `IV: ${f.iv || "—"} · Δ ${f.delta || "—"}` },
      { label: "Units", value: holdings.toLocaleString(), sub: "Contracts" },
      { label: isLong ? "Max Payout" : "Max Gain", value: fmt(analyticalMaxProfit), sub: isLong ? `Above ${fmt(shortK)}` : "Premium income", positive: true },
      { label: "Max Loss", value: fmt(Math.abs(analyticalMaxLoss)), sub: isLong ? `Below ${fmt(longK)}` : `Above ${fmt(longK)}`, negative: true },
      { label: "Breakeven", value: breakevens.length > 0 ? fmt(breakevens[0]) : "—" },
    ],
    buildLegs: () => isLong
      ? [
          { action: "BUY", type: "Call", strike: longK, label: `${fmt(longK)} Call`, color: "#378ADD" },
          { action: "SELL", type: "Call", strike: shortK, label: `${fmt(shortK)} Call`, color: "#ef4444" },
        ]
      : [
          { action: "SELL", type: "Call", strike: shortK, label: `${fmt(shortK)} Call`, color: "#ef4444" },
          { action: "BUY", type: "Call", strike: longK, label: `${fmt(longK)} Call`, color: "#378ADD" },
        ],
    buildZones: () => [],
  };
}

// ── PUT SPREAD ──────────────────────────────────────────────────────────

export function adaptPutSpread(f) {
  const spot = n(f.spot);
  const longK = n(f.long_strike);
  const shortK = n(f.short_strike);
  const dir = f.direction || "Long";
  const isLong = dir === "Long";
  const holdings = Math.max(1, parseFloat(f.holdings) || parseFloat(f.contracts) || 1);

  // User enters premium PER UNIT. Engine receives per-unit and multiplies by contracts (holdings).
  const premiumPerUnit = isLong ? -Math.abs(n(f.premium)) : Math.abs(n(f.premium));

  const legs = isLong
    ? [
        { type: "put", side: "long", strike: longK },
        { type: "put", side: "short", strike: shortK },
      ]
    : [
        { type: "put", side: "short", strike: shortK },
        { type: "put", side: "long", strike: longK },
      ];

  return {
    strategyId: "put_spread",
    tradeType: "put_spread",
    spot,
    legs,
    netPremium: premiumPerUnit,
    contracts: holdings,
    positionSize: holdings,
    returnBasis: "net_premium",
    chartBounds: { min: spot * 0.74, max: spot * 1.26 },
    buildMetrics: ({ breakevens, extrema }) => [
      { label: "Spot Price", value: fmt(spot), sub: f.asset || "—" },
      { label: dir + " Put Spread", value: `${fmt(longK)} / ${fmt(shortK)}` },
      { label: "Units", value: holdings.toLocaleString(), sub: "Contracts" },
      { label: "Expiry", value: f.expiry || "—", sub: `IV: ${f.iv || "—"} · Δ ${f.delta || "—"}` },
      { label: "Max Gain", value: fmt(extrema.maxProfit), sub: isLong ? `Below ${fmt(shortK)}` : "Premium income", positive: true },
      { label: "Max Loss", value: fmt(Math.abs(extrema.maxLoss)), sub: isLong ? `Above ${fmt(longK)}` : `Below ${fmt(shortK)}`, negative: true },
      { label: "Breakeven", value: breakevens.length > 0 ? fmt(breakevens[0]) : "—" },
    ],
    buildLegs: () => isLong
      ? [
          { action: "BUY", type: "Put", strike: longK, label: `${fmt(longK)} Put`, color: "#378ADD" },
          { action: "SELL", type: "Put", strike: shortK, label: `${fmt(shortK)} Put`, color: "#ef4444" },
        ]
      : [
          { action: "SELL", type: "Put", strike: shortK, label: `${fmt(shortK)} Put`, color: "#ef4444" },
          { action: "BUY", type: "Put", strike: longK, label: `${fmt(longK)} Put`, color: "#378ADD" },
        ],
    buildZones: () => [],
  };
}

// ── STRADDLE ────────────────────────────────────────────────────────────

export function adaptStraddle(f) {
  const spot = n(f.spot);
  const atmK = n(f.atm_strike);
  const dir = f.direction || "Long";
  const isLong = dir === "Long";
  const holdings = Math.max(1, parseFloat(f.holdings) || parseFloat(f.contracts) || 1);

  // User enters premium PER UNIT. Engine receives per-unit and multiplies by contracts (holdings).
  const premiumPerUnit = isLong ? -Math.abs(n(f.total_premium)) : Math.abs(n(f.total_premium));

  const legs = isLong
    ? [
        { type: "call", side: "long", strike: atmK },
        { type: "put", side: "long", strike: atmK },
      ]
    : [
        { type: "call", side: "short", strike: atmK },
        { type: "put", side: "short", strike: atmK },
      ];

  return {
    strategyId: "straddle",
    tradeType: "straddle",
    spot,
    legs,
    netPremium: premiumPerUnit, // per-unit; engine multiplies by contracts (holdings)
    contracts: holdings,
    positionSize: holdings,
    returnBasis: "net_premium",
    chartBounds: { min: spot * 0.74, max: spot * 1.26 },
    buildMetrics: ({ breakevens, extrema }) => [
      { label: "Spot Price", value: fmt(spot), sub: f.asset || "—" },
      { label: dir + " Straddle", value: fmt(atmK) + " ATM" },
      { label: "Expiry", value: f.expiry || "—" },
      { label: "Units", value: holdings.toLocaleString(), sub: "Contracts" },
      ...(isLong
        ? [{ label: "Max Loss", value: fmt(Math.abs(extrema.maxLoss)), sub: "Premium paid", negative: true }]
        : [{ label: "Max Profit", value: fmt(extrema.maxProfit), sub: "Premium received", positive: true }]
      ),
      { label: "BE Low", value: breakevens.length > 0 ? fmt(breakevens[0]) : "—", sub: isLong ? "Below = profit" : "Below = loss" },
      { label: "BE High", value: breakevens.length > 1 ? fmt(breakevens[1]) : "—", sub: isLong ? "Above = profit" : "Above = loss" },
    ],
    buildLegs: () => isLong
      ? [
          { action: "BUY", type: "Call", strike: atmK, label: `${fmt(atmK)} Call`, color: "#A78BFA" },
          { action: "BUY", type: "Put", strike: atmK, label: `${fmt(atmK)} Put`, color: "#A78BFA" },
        ]
      : [
          { action: "SELL", type: "Call", strike: atmK, label: `${fmt(atmK)} Call`, color: "#ef4444" },
          { action: "SELL", type: "Put", strike: atmK, label: `${fmt(atmK)} Put`, color: "#ef4444" },
        ],
    buildZones: () => [],
  };
}

// ── STRANGLE ────────────────────────────────────────────────────────────

export function adaptStrangle(f) {
  const spot = n(f.spot);
  const callK = n(f.call_strike);
  const putK = n(f.put_strike);
  const dir = f.direction || "Long";
  const isLong = dir === "Long";
  const holdings = Math.max(1, parseFloat(f.holdings) || parseFloat(f.contracts) || 1);

  // User enters premium PER UNIT. Engine receives per-unit and multiplies by contracts (holdings).
  const premiumPerUnit = isLong ? -Math.abs(n(f.total_premium)) : Math.abs(n(f.total_premium));

  const legs = isLong
    ? [
        { type: "call", side: "long", strike: callK },
        { type: "put", side: "long", strike: putK },
      ]
    : [
        { type: "call", side: "short", strike: callK },
        { type: "put", side: "short", strike: putK },
      ];

  return {
    strategyId: "strangle",
    tradeType: "strangle",
    spot,
    legs,
    netPremium: premiumPerUnit,
    contracts: holdings,
    positionSize: holdings,
    returnBasis: "net_premium",
    chartBounds: { min: spot * 0.74, max: spot * 1.26 },
    buildMetrics: ({ breakevens, extrema }) => [
      { label: "Spot Price", value: fmt(spot), sub: f.asset || "—" },
      { label: dir + " Strangle", value: `${fmt(putK)} / ${fmt(callK)}` },
      { label: "Expiry", value: f.expiry || "—" },
      { label: "Units", value: holdings.toLocaleString(), sub: "Contracts" },
      ...(isLong
        ? [{ label: "Max Loss", value: fmt(Math.abs(extrema.maxLoss)), sub: "Premium paid", negative: true }]
        : [{ label: "Max Profit", value: fmt(extrema.maxProfit), sub: "Premium received", positive: true }]
      ),
      { label: "BE Low", value: breakevens.length > 0 ? fmt(breakevens[0]) : "—", sub: isLong ? "Below = profit" : "Below = loss" },
      { label: "BE High", value: breakevens.length > 1 ? fmt(breakevens[1]) : "—", sub: isLong ? "Above = profit" : "Above = loss" },
    ],
    buildLegs: () => isLong
      ? [
          { action: "BUY", type: "Call", strike: callK, label: `${fmt(callK)} Call`, color: "#14B8A6" },
          { action: "BUY", type: "Put", strike: putK, label: `${fmt(putK)} Put`, color: "#14B8A6" },
        ]
      : [
          { action: "SELL", type: "Call", strike: callK, label: `${fmt(callK)} Call`, color: "#ef4444" },
          { action: "SELL", type: "Put", strike: putK, label: `${fmt(putK)} Put`, color: "#ef4444" },
        ],
    buildZones: () => [],
  };
}

// ── LONG SEAGULL ────────────────────────────────────────────────────────

export function adaptLongSeagull(f) {
  const spot = n(f.spot);
  const lp = n(f.lower_put);
  const lc = n(f.lower_call);
  const uc = n(f.upper_call);
  const contracts = n(f.contracts) || 1;

  const legs = [
    { type: "put", side: "short", strike: lp, quantity: contracts },
    { type: "call", side: "long", strike: lc, quantity: contracts },
    { type: "call", side: "short", strike: uc, quantity: contracts },
  ];

  const maxProfitVal = (uc - lc) * contracts;
  const maxLossVal = lp * contracts; // if underlying goes to 0

  return {
    strategyId: "long_seagull",
    tradeType: "long_seagull",
    spot,
    legs,
    netPremium: 0,
    contracts: 1, // quantity already in legs
    holdings: contracts,
    returnBasis: "notional",
    chartBounds: { min: lp * 0.75, max: uc * 1.25 },
    buildMetrics: ({ breakevens, extrema }) => [
      { label: "Spot Price", value: fmtFull(spot), sub: f.asset || "—" },
      { label: "Max Profit", value: fmt(extrema.maxProfit), sub: `Capped at ${fmtFull(uc)}`, positive: true },
      { label: "Max Loss", value: fmt(Math.abs(extrema.maxLoss)), sub: `Below ${fmtFull(lp)}`, negative: true },
      { label: "Contracts", value: `${contracts}`, sub: "Units" },
      { label: "Expiry", value: f.expiry || "—" },
      ...(breakevens.length === 1
        ? [{ label: "Breakeven", value: fmtFull(breakevens[0]) }]
        : breakevens.length >= 2
          ? [
              { label: "Lower BE", value: fmtFull(breakevens[0]) },
              { label: "Upper BE", value: fmtFull(breakevens[breakevens.length - 1]) },
            ]
          : []),
    ],
    buildLegs: () => [
      { action: "SELL", type: "Put", strike: lp, label: `${fmtFull(lp)} Put`, color: "#ef4444" },
      { action: "BUY", type: "Call", strike: lc, label: `${fmtFull(lc)} Call`, color: "#4ADE80" },
      { action: "SELL", type: "Call", strike: uc, label: `${fmtFull(uc)} Call`, color: "#ef4444" },
    ],
    buildZones: ({ breakevens }) => [
      { from: 0, to: lp, label: "Max Loss Zone", color: "rgba(239,68,68,0.08)" },
      { from: lc, to: uc, label: "Profit Zone", color: "rgba(74,222,128,0.08)" },
    ],
  };
}

export function adaptCallSpreadCollar(f) {
  const spot     = n(f.spot);
  const notional = n(f.notional) || 1;
  const kp       = n(f.put_strike);
  const kc1      = n(f.short_call);
  const kc2      = n(f.long_call);
  const putPrem  = n(f.put_premium);
  const scPrem   = n(f.short_call_premium);
  const lcPrem   = n(f.long_call_premium);

  const netPremium = (scPrem - putPrem - lcPrem) * notional;

  const legs = [
    { type: "put",  side: "long",  strike: kp,  quantity: notional },
    { type: "call", side: "short", strike: kc1, quantity: notional },
    { type: "call", side: "long",  strike: kc2, quantity: notional },
  ];

  return {
    strategyId:   "call_spread_collar",
    tradeType:    "call_spread_collar",
    spot,
    legs,
    netPremium,
    contracts:    1,
    holdings:     notional,
    returnBasis:  "notional",
    chartBounds:  { min: kp * 0.75, max: kc2 * 1.35 },

    buildMetrics: ({ breakevens, extrema }) => [
      { label: "Spot Price",       value: fmtFull(spot),                    sub: f.asset || "BTC" },
      { label: "Net Premium",      value: fmt(Math.abs(netPremium)),        sub: netPremium >= 0 ? "Credit" : "Debit", positive: netPremium >= 0 },
      { label: "Downside Floor",   value: fmtFull(kp),                     sub: "Protected below this level" },
      { label: "Soft Cap Start",   value: fmtFull(kc1),                    sub: "Upside capped here",                  negative: true },
      { label: "Re-participation", value: fmtFull(kc2),                    sub: "Tail upside restored above this" },
      { label: "Max Loss",         value: fmt(Math.abs(extrema.maxLoss)),   sub: `Below ${fmtFull(kp)}`,                negative: true },
      { label: "Expiry",           value: f.expiry || "—" },
      ...(breakevens.length >= 1 ? [{ label: "Breakeven", value: fmtFull(breakevens[0]) }] : []),
    ],

    buildLegs: () => [
      { action: "BUY",  type: "Put",  strike: kp,  label: `${fmtFull(kp)} Put — Downside Floor @ ${fmtFull(putPrem)}`,  color: "#4ADE80" },
      { action: "SELL", type: "Call", strike: kc1, label: `${fmtFull(kc1)} Call — ATM Cap @ ${fmtFull(scPrem)}`,        color: "#ef4444" },
      { action: "BUY",  type: "Call", strike: kc2, label: `${fmtFull(kc2)} Call — Tail Re-entry @ ${fmtFull(lcPrem)}`,  color: "#F97316" },
    ],

    buildZones: () => [
      { from: 0,         to: kp,       label: "Protected Zone",    color: "rgba(74,222,128,0.07)" },
      { from: kc1,       to: kc2,      label: "Soft Cap Zone",     color: "rgba(239,68,68,0.07)"  },
      { from: kc2,       to: kc2 * 2,  label: "Re-participation",  color: "rgba(249,115,22,0.07)" },
    ],
  };
}
