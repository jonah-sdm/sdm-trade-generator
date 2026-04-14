// ═══════════════════════════════════════════════════════════════════════════
// Universal Structured Products Calculation Engine
// ═══════════════════════════════════════════════════════════════════════════
//
// Single source of truth for all option strategy payoff math.
// Every pure option strategy computes P&L, breakevens, and extrema from legs.
//
// ACCOUNTING RULE: Calculate with raw numbers. Format only at display.
// PAYOFF RULE:     sum(leg intrinsics) + netPremium, per contracts.
// BREAKEVEN RULE:  Scan & bisect — never assume count.
// RETURN RULE:     Always divide by explicit, declared denominator.

// ── Leg Payoff ──────────────────────────────────────────────────────────

/**
 * Intrinsic value of a single option leg at expiry.
 * @param {{ type: 'call'|'put', side: 'long'|'short', strike: number, quantity?: number }} leg
 * @param {number} price - underlying price at expiry
 * @returns {number} P&L contribution of this leg (before premium)
 */
export function payoffForLeg(leg, price) {
  const intrinsic = leg.type === "call"
    ? Math.max(0, price - leg.strike)
    : Math.max(0, leg.strike - price);
  const sign = leg.side === "long" ? 1 : -1;
  const qty = leg.quantity || 1;
  return sign * intrinsic * qty;
}

// ── Strategy Payoff ─────────────────────────────────────────────────────

/**
 * Total strategy P&L at a given expiry price.
 * @param {Array} legs - normalized option legs
 * @param {number} price - underlying price at expiry
 * @param {number} netPremium - signed total premium (negative = debit)
 * @param {number} [contracts=1] - position multiplier
 * @returns {number} total P&L
 */
export function strategyPayoff(legs, price, netPremium, contracts = 1) {
  const legTotal = legs.reduce((sum, leg) => sum + payoffForLeg(leg, price), 0);
  return (legTotal + netPremium) * contracts;
}

// ── Breakeven Detection ────────────────────────────────────────────────

/**
 * Bisect to find exact zero-crossing between two prices.
 */
function bisectBreakeven(legs, netPremium, contracts, lo, hi, iterations = 50) {
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    const pnl = strategyPayoff(legs, mid, netPremium, contracts);
    if (Math.abs(pnl) < 0.005) return mid;
    const pnlLo = strategyPayoff(legs, lo, netPremium, contracts);
    if ((pnlLo < 0 && pnl < 0) || (pnlLo >= 0 && pnl >= 0)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Find ALL breakeven prices (zero-crossings) in the given range.
 * Never assumes count — scans and bisects.
 * Handles flat-zero regions by reporting entry/exit points only.
 * @returns {number[]} sorted array of breakeven prices
 */
export function findBreakevens(legs, netPremium, contracts, { min, max, steps = 2000 }) {
  const breakevens = [];
  const range = max - min;
  // Dedup tolerance: 0.5% of range or $1, whichever is larger
  const dedupTol = Math.max(range * 0.005, 1);
  let prevPnl = strategyPayoff(legs, min, netPremium, contracts);

  for (let i = 1; i <= steps; i++) {
    const price = min + range * (i / steps);
    const pnl = strategyPayoff(legs, price, netPremium, contracts);

    // Detect sign change (non-zero to opposite sign)
    if ((prevPnl < -0.01 && pnl > 0.01) || (prevPnl > 0.01 && pnl < -0.01)) {
      const prevPrice = min + range * ((i - 1) / steps);
      const be = bisectBreakeven(legs, netPremium, contracts, prevPrice, price);
      if (!breakevens.some(b => Math.abs(b - be) < dedupTol)) {
        breakevens.push(Math.round(be * 100) / 100);
      }
    }

    // Transition from non-zero to zero (entering flat-zero region)
    if (Math.abs(prevPnl) > 0.01 && Math.abs(pnl) <= 0.01) {
      if (!breakevens.some(b => Math.abs(b - price) < dedupTol)) {
        breakevens.push(Math.round(price * 100) / 100);
      }
    }

    // Transition from zero to non-zero (exiting flat-zero region)
    if (Math.abs(prevPnl) <= 0.01 && Math.abs(pnl) > 0.01) {
      const prevPrice = min + range * ((i - 1) / steps);
      if (!breakevens.some(b => Math.abs(b - prevPrice) < dedupTol)) {
        breakevens.push(Math.round(prevPrice * 100) / 100);
      }
    }

    prevPnl = pnl;
  }

  return breakevens.sort((a, b) => a - b);
}

// ── Extrema Detection ──────────────────────────────────────────────────

/**
 * Find max profit, max loss, and whether each is bounded or unbounded.
 * @returns {{ maxProfit, maxLoss, maxProfitPrice, maxLossPrice, maxProfitBounded, maxLossBounded }}
 */
export function findExtrema(legs, netPremium, contracts, { min, max, steps = 2000 }) {
  let maxProfit = -Infinity, maxLoss = Infinity;
  let maxProfitPrice = min, maxLossPrice = min;

  for (let i = 0; i <= steps; i++) {
    const price = min + (max - min) * (i / steps);
    const pnl = strategyPayoff(legs, price, netPremium, contracts);
    if (pnl > maxProfit) { maxProfit = pnl; maxProfitPrice = price; }
    if (pnl < maxLoss) { maxLoss = pnl; maxLossPrice = price; }
  }

  // Check if extremum is a plateau (same value at boundary AND slightly inside)
  // A plateau touching the boundary is still "bounded" if the value doesn't change
  const edgeTol = (max - min) * 0.02;
  const pnlAtMinEdge = strategyPayoff(legs, min, netPremium, contracts);
  const pnlAtMinInside = strategyPayoff(legs, min + edgeTol, netPremium, contracts);
  const pnlAtMaxEdge = strategyPayoff(legs, max, netPremium, contracts);
  const pnlAtMaxInside = strategyPayoff(legs, max - edgeTol, netPremium, contracts);

  // Max profit is unbounded if it occurs at an edge AND the payoff is still changing at that edge
  const profitAtEdge = Math.abs(maxProfitPrice - max) < edgeTol || Math.abs(maxProfitPrice - min) < edgeTol;
  const profitStillChanging = profitAtEdge && (
    (Math.abs(maxProfitPrice - max) < edgeTol && Math.abs(pnlAtMaxEdge - pnlAtMaxInside) > 0.01) ||
    (Math.abs(maxProfitPrice - min) < edgeTol && Math.abs(pnlAtMinEdge - pnlAtMinInside) > 0.01)
  );

  const lossAtEdge = Math.abs(maxLossPrice - min) < edgeTol || Math.abs(maxLossPrice - max) < edgeTol;
  const lossStillChanging = lossAtEdge && (
    (Math.abs(maxLossPrice - min) < edgeTol && Math.abs(pnlAtMinEdge - pnlAtMinInside) > 0.01) ||
    (Math.abs(maxLossPrice - max) < edgeTol && Math.abs(pnlAtMaxEdge - pnlAtMaxInside) > 0.01)
  );

  return {
    maxProfit,
    maxLoss,
    maxProfitPrice,
    maxLossPrice,
    maxProfitBounded: !profitStillChanging,
    maxLossBounded: !lossStillChanging,
  };
}

// ── Return Denominator ─────────────────────────────────────────────────

/**
 * Compute the return denominator based on strategy definition.
 * @param {Object} def - strategy definition with returnBasis
 * @returns {{ value: number, label: string }}
 */
export function computeReturnDenominator(def, extrema) {
  switch (def.returnBasis) {
    case "net_premium":
      return {
        value: Math.abs(def.netPremium) * (def.contracts || 1),
        label: "Premium at risk",
      };
    case "max_risk":
      return {
        value: Math.abs(extrema?.maxLoss || 0),
        label: "Max loss",
      };
    case "capital_required":
      return {
        value: def.capitalRequired || def.spot * (def.holdings || def.contracts || 1),
        label: "Capital required",
      };
    case "notional":
    default:
      return {
        value: def.spot * (def.holdings || def.contracts || 1),
        label: "Spot notional",
      };
  }
}

// ── Scenario Grid ──────────────────────────────────────────────────────

/**
 * Build structured scenario price levels.
 * Always includes: spot, all breakevens, all strikes, ±10/20/30% from spot.
 */
export function buildScenarioGrid(spot, breakevens, legs, { min, max }) {
  const prices = new Set();

  // Key levels
  if (spot > 0) prices.add(spot);
  breakevens.forEach(b => { if (b > min && b < max) prices.add(b); });
  legs.forEach(l => {
    if (l.strike > min && l.strike < max && Math.abs(l.strike - spot) > spot * 0.005) {
      prices.add(l.strike);
    }
  });

  // Percentage moves from spot
  if (spot > 0) {
    [0.7, 0.8, 0.9, 1.1, 1.2, 1.3].forEach(mult => {
      const p = Math.round(spot * mult);
      if (p > min && p < max) prices.add(p);
    });
  }

  return [...prices].sort((a, b) => a - b).slice(0, 10);
}

// ── Chart Bounds ───────────────────────────────────────────────────────

/**
 * Compute sensible chart bounds from strategy definition.
 */
export function defaultBounds(def) {
  const strikes = def.legs.map(l => l.strike);
  const allPrices = [def.spot, ...strikes].filter(Boolean);
  const lo = Math.min(...allPrices);
  const hi = Math.max(...allPrices);
  const spread = (hi - lo) || lo * 0.3;
  return {
    min: Math.max(lo - spread * 0.5, 0.01),
    max: hi + spread * 0.5,
  };
}

// ── Build Curve ────────────────────────────────────────────────────────

function buildCurve(min, max, pnlFn, steps = 200) {
  const curve = [];
  for (let i = 0; i <= steps; i++) {
    const price = min + (max - min) * (i / steps);
    curve.push({ price, pnl: pnlFn(price) });
  }
  return curve;
}

// ── Main Entry Point ───────────────────────────────────────────────────

/**
 * Analyze a structured product from a normalized definition.
 * Returns a TradeReport-compatible analysis object.
 *
 * @param {Object} def - strategy definition (see StrategyDef type above)
 * @returns {Object} analysis result compatible with TradeReport.jsx
 */
export function analyzeStructuredProduct(def) {
  const contracts = def.contracts || 1;
  const bounds = def.chartBounds || defaultBounds(def);
  const { min, max } = bounds;

  // Analytical payoff function — always present
  const pnlAtPrice = (price) => strategyPayoff(def.legs, price, def.netPremium, contracts);

  // Curve for chart visualization
  const curve = buildCurve(min, max, pnlAtPrice);

  // Universal breakeven detection
  const breakevens = findBreakevens(def.legs, def.netPremium, contracts, { min, max });

  // Universal extrema detection
  const extrema = findExtrema(def.legs, def.netPremium, contracts, { min, max });

  // Notional & return denominator
  const currentNotional = def.spot * (def.holdings || contracts);
  const returnDenom = computeReturnDenominator(def, extrema);

  // Build strategy-specific display elements via callbacks
  const metrics = def.buildMetrics
    ? def.buildMetrics({ breakevens, extrema, currentNotional, returnDenom })
    : [];
  const legs = def.buildLegs ? def.buildLegs() : [];
  const zones = def.buildZones ? def.buildZones({ breakevens, extrema }) : [];

  // Per-leg payoff functions (intrinsic only, no premium attribution)
  const legPayoffs = def.legs.map(leg => ({
    label: `${leg.side === "long" ? "Long" : "Short"} ${leg.type.charAt(0).toUpperCase() + leg.type.slice(1)}`,
    color: leg.side === "long" ? "#4ADE80" : "#ef4444",
    fn: (p) => payoffForLeg(leg, p) * contracts,
  }));

  return {
    curve,
    spot: def.spot,
    breakevens,
    tradeType: def.tradeType || def.strategyId,
    currentNotional,
    pnlAtPrice,
    maxProfit: extrema.maxProfit,
    maxLoss: extrema.maxLoss,
    maxProfitBounded: extrema.maxProfitBounded,
    maxLossBounded: extrema.maxLossBounded,
    returnDenominator: returnDenom,
    spotQuantity: def.spotQuantity || 0,
    legPayoffs,
    metrics,
    legs,
    zones,
  };
}
