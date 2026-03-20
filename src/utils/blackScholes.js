// ─── Black-Scholes Pricing Engine ─────────────────────────────────────────────
// SDM Options Pricer — pure JS, no external dependencies

// Cumulative standard normal distribution (Abramowitz & Stegun approximation)
function normalCDF(x) {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * ax);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1.0 + sign * y);
}

// Standard normal PDF
function normalPDF(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Black-Scholes option price for European options.
 * @param {number} S  - Spot price
 * @param {number} K  - Strike price
 * @param {number} T  - Time to expiry in YEARS
 * @param {number} r  - Risk-free rate as decimal (e.g. 0.05 = 5%)
 * @param {number} sigma - Implied volatility as decimal (e.g. 0.75 = 75%)
 * @param {'call'|'put'} type
 * @returns {number} option price
 */
export function blackScholes(S, K, T, r, sigma, type) {
  if (S <= 0 || K <= 0 || sigma <= 0) return 0;

  // At expiry: return intrinsic value
  if (T <= 0) {
    if (type === 'call') return Math.max(S - K, 0);
    return Math.max(K - S, 0);
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  if (type === 'call') {
    return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
  } else {
    return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
  }
}

/**
 * Greeks for a single option leg.
 * @returns {{ delta, gamma, vega, theta }}
 *   - delta: dimensionless
 *   - gamma: per $ move in spot
 *   - vega:  per 1% move in IV (i.e. vega / 100 of the raw formula)
 *   - theta: per calendar day (negative for long options)
 */
export function greeks(S, K, T, r, sigma, type) {
  if (S <= 0 || K <= 0 || sigma <= 0 || T <= 0) {
    const delta = type === 'call'
      ? (S >= K ? 1 : 0)
      : (S <= K ? -1 : 0);
    return { delta, gamma: 0, vega: 0, theta: 0 };
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const phi_d1 = normalPDF(d1);
  const disc = Math.exp(-r * T);

  const delta = type === 'call' ? normalCDF(d1) : normalCDF(d1) - 1;
  const gamma = phi_d1 / (S * sigma * sqrtT);
  const vega  = S * phi_d1 * sqrtT / 100; // per 1% IV move

  // Full BS theta formula, converted to per-day
  let theta;
  if (type === 'call') {
    theta = (
      -(S * phi_d1 * sigma) / (2 * sqrtT)
      - r * K * disc * normalCDF(d2)
    ) / 365;
  } else {
    theta = (
      -(S * phi_d1 * sigma) / (2 * sqrtT)
      + r * K * disc * normalCDF(-d2)
    ) / 365;
  }

  return { delta, gamma, vega, theta };
}

/**
 * Process an array of leg input objects into priced legs + net summary.
 * Each leg input:
 *   { id, legNum, type, side, spot, strike, tenor, iv, rate, qty, spotLinked }
 *
 * Returns:
 *   { pricedLegs, netPremium, netDelta, netGamma, netVega, netTheta }
 */
export function computeLegs(legs, globalSpot) {
  let netPremium = 0;
  let netDelta   = 0;
  let netGamma   = 0;
  let netVega    = 0;
  let netTheta   = 0;

  const pricedLegs = legs.map(leg => {
    const S     = leg.spotLinked ? (globalSpot || leg.spot) : leg.spot;
    const K     = leg.strike;
    const T     = leg.tenor / 365;
    const r     = (leg.rate || 0) / 100;
    const sigma = (leg.iv || 0) / 100;
    const qty   = leg.qty || 1;
    const sign  = leg.side === 'sell' ? -1 : 1; // buy = +1, sell = -1

    const price = blackScholes(S, K, T, r, sigma, leg.type);
    const g     = greeks(S, K, T, r, sigma, leg.type);

    // For net premium: buying costs money (negative), selling earns money (positive)
    const legCost = sign * price * qty * -1; // negative = cash out, positive = cash in

    netPremium += legCost;
    netDelta   += sign * g.delta * qty;
    netGamma   += sign * g.gamma * qty;
    netVega    += sign * g.vega  * qty;
    netTheta   += sign * g.theta * qty;

    return {
      ...leg,
      S,
      bsPrice:  price,
      delta:    g.delta,
      gamma:    g.gamma,
      vega:     g.vega,
      theta:    g.theta,
      legCost,  // cash flow (negative = you pay, positive = you receive)
    };
  });

  return { pricedLegs, netPremium, netDelta, netGamma, netVega, netTheta };
}

/**
 * Scenario analysis: compute P&L at expiry across key price zones.
 * Uses intrinsic value at expiry (no time value).
 *
 * Returns array of { scenario, price, pnl, notes }
 */
export function scenarioTable(pricedLegs, netPremium) {
  if (!pricedLegs || pricedLegs.length === 0) return [];

  // Collect unique strikes sorted ascending
  const strikes = [...new Set(pricedLegs.map(l => l.strike))].sort((a, b) => a - b);

  // Build test prices: below lowest, between each pair, above highest
  const testPrices = [];
  const minS = pricedLegs[0].S;

  // Padding: 20% beyond the strike range
  const lowestK  = strikes[0];
  const highestK = strikes[strikes.length - 1];
  const range    = highestK - lowestK || lowestK * 0.1;

  // Zone: below all strikes
  testPrices.push({
    label: `Below all strikes`,
    price: Math.max(lowestK * 0.8, 1),
    note: strikes.length === 1
      ? `< $${fmt(lowestK)}`
      : `< $${fmt(lowestK)}`,
  });

  // Zones between strikes
  for (let i = 0; i < strikes.length - 1; i++) {
    const mid = (strikes[i] + strikes[i + 1]) / 2;
    testPrices.push({
      label: `Between strikes`,
      price: mid,
      note: `$${fmt(strikes[i])} – $${fmt(strikes[i + 1])}`,
    });
  }

  // At each strike boundary
  strikes.forEach(k => {
    testPrices.push({
      label: `At strike`,
      price: k,
      note: `$${fmt(k)}`,
    });
  });

  // Zone: above all strikes
  testPrices.push({
    label: `Above all strikes`,
    price: highestK * 1.2,
    note: `> $${fmt(highestK)}`,
  });

  // Sort by price
  testPrices.sort((a, b) => a.price - b.price);

  // De-duplicate very close prices (within 0.1%)
  const deduped = [];
  testPrices.forEach(tp => {
    if (deduped.length === 0 || Math.abs(tp.price - deduped[deduped.length - 1].price) / tp.price > 0.001) {
      deduped.push(tp);
    }
  });

  return deduped.map(({ label, price, note }) => {
    // Intrinsic payoff per leg at expiry
    let payoff = 0;
    pricedLegs.forEach(leg => {
      const sign = leg.side === 'sell' ? -1 : 1;
      const qty  = leg.qty || 1;
      const intrinsic = leg.type === 'call'
        ? Math.max(price - leg.strike, 0)
        : Math.max(leg.strike - price, 0);
      payoff += sign * intrinsic * qty;
    });

    // Net P&L = payoff at expiry + net premium received (or - net premium paid)
    const pnl = payoff + netPremium;

    return { scenario: label, price, pnl, notes: note };
  });
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function fmt(n, decimals = 0) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtPrice(n) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtGreek(n) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return n.toFixed(4);
}

export function fmtPnl(n) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  const str = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-${str}` : `+${str}`;
}
