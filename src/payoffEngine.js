// Payoff computation engine for all trade types
// Returns: { metrics, curve, legs, breakevens, spot, zones }

// Generate a plain-language executive summary for each trade type
// Written for CFOs, board members, and sophisticated investors — not traders
// Parse number from user input — handles commas, $, %, spaces
function parseNum(v) {
  if (typeof v === "number") return v || 0;
  if (!v) return 0;
  const cleaned = String(v).replace(/[$,%\s]/g, "").replace(/,/g, "");
  return Number(cleaned) || 0;
}

export function generateExecutiveSummary(tradeId, fields) {
  const asset = fields.asset || "the underlying asset";
  const fmtN = (v) => {
    const num = parseNum(v);
    if (!num && num !== 0) return v;
    if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    if (Math.abs(num) < 1 && num !== 0) return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
    if (Math.abs(num) < 100) return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  // Format any value as $X,XXX.XX with commas
  const $ = (v) => {
    const num = parseNum(v);
    if (!num && num !== 0) return `$${v}`;
    if (Math.abs(num) < 1 && num !== 0) return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
    if (Math.abs(num) < 100) return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  switch (tradeId) {
    case "long_seagull":
      return `This trade establishes a structured options position on ${asset} designed to capture upside price appreciation while limiting downside exposure. The structure is "premium-neutral," meaning there is no upfront cost to enter the trade — the premiums collected from selling options offset the cost of purchased options. If ${asset} rises above ${fmtN(fields.lower_call)}, the position generates profit up to a maximum of ${fmtN(fields.max_pnl)} at ${fmtN(fields.upper_call)}. Below ${fmtN(fields.lower_put)}, the position is exposed to losses as the portfolio would be obligated to purchase ${asset} at that level. The trade expires on ${fields.expiry || "the target date"} and involves ${fields.contracts || "the specified number of"} contracts.`;

    case "reverse_cash_carry": {
      const pv = parseNum(fields.portfolio_value) || (parseNum(fields.spot_price) * parseNum(fields.btc_amount)) || 0;
      const crPct = parseNum(fields.cash_released_pct) || 85;
      const cashAmt = pv * (crPct / 100);
      const mgPct = parseNum(fields.margin_pct) || 15;
      const liqPx = parseNum(fields.spot_price) && parseNum(fields.btc_amount) ? parseNum(fields.spot_price) + (pv * mgPct / 100) / parseNum(fields.btc_amount) : 0;
      return `This strategy allows the portfolio to unlock liquidity from an existing ${asset} position without selling the asset. By simultaneously holding the spot position and opening an offsetting short perpetual futures contract, the portfolio maintains full price exposure while freeing up approximately ${crPct}% of the position's value as deployable capital — approximately ${fmtN(cashAmt)}. The ongoing cost of this structure is the funding rate, currently estimated at ${fields.funding_rate || "~10"}% APR. Only ${mgPct}% of the portfolio value needs to remain posted as margin.${liqPx ? ` Liquidation risk begins if ${asset} rises above ${fmtN(liqPx)} (margin fully depleted).` : ""} ${fields.client_use_case ? `The released capital is intended for: ${fields.client_use_case}.` : ""} This is executed on ${fields.exchange || "the designated exchange"}.`;
    }

    case "covered_call":
      return `This income strategy generates premium by selling call options against an existing ${asset} position of ${fields.holdings || 10} units currently held at a cost basis of ${$(fields.cost_basis)}. The portfolio collects ${$(fields.premium)} per unit in premium income by granting another party the right to purchase the holdings at ${$(fields.strike)}. If ${asset} remains below ${$(fields.strike)} at expiry (${fields.expiry || "the target date"}), the portfolio retains the position and the full premium. If ${asset} rises above the strike, the position is called away at ${$(fields.strike)} plus the premium collected. The position is protected down to a breakeven of ${$((parseNum(fields.cost_basis) - parseNum(fields.premium)).toFixed(2))}. The annualized return on this premium is approximately ${fields.current_price && fields.dte ? ((parseNum(fields.premium) / parseNum(fields.current_price)) * (365 / parseNum(fields.dte)) * 100).toFixed(1) : "N/A"}%.`;

    case "cash_secured_put":
      return `This strategy generates income by selling put options on ${asset}, currently trading at ${$(fields.current_price)}. The portfolio collects ${$(fields.premium)} per unit in premium by committing to purchase ${asset} at ${$(fields.strike)} if the price falls to that level by ${fields.expiry || "the expiry date"}. This requires ${fmtN(fields.capital_required)} in capital to be held in reserve. If the option expires worthless (${asset} stays above ${$(fields.strike)}), the portfolio keeps the full premium as profit. If assigned, the effective purchase price would be ${$(fields.effective_basis || (parseNum(fields.strike) - parseNum(fields.premium)).toFixed(2))} — a ${((1 - (parseNum(fields.strike) - parseNum(fields.premium)) / parseNum(fields.current_price)) * 100).toFixed(1)}% discount to the current market price.`;

    case "leap":
      return `This position takes a long-term directional view on ${asset} through a long-dated call option expiring ${fields.expiry || "in the future"} (${fields.dte || "300+"} days out). Rather than purchasing the asset outright, the portfolio acquires ${fields.contracts || 1} call option contract(s) at a ${$(fields.strike)} strike price for ${$(fields.premium)} per unit, committing ${fmtN(fields.total_outlay)} in total capital. This provides leveraged upside exposure — if ${asset} appreciates significantly, the percentage return on capital deployed is magnified compared to owning the asset directly. The maximum risk is limited to the ${fmtN(fields.total_outlay)} premium paid. The position breaks even at ${$((parseNum(fields.strike) + parseNum(fields.premium)).toFixed(2))}, requiring a ${((parseNum(fields.strike) + parseNum(fields.premium)) / parseNum(fields.current_price) * 100 - 100).toFixed(1)}% move from current levels.`;

    case "wheel":
      return `The Wheel is a systematic income generation strategy on ${asset} that cycles between selling cash-secured puts and covered calls. The portfolio is currently in the "${fields.current_phase || "active"}" phase, having completed ${fields.cycles_completed || 0} full cycles. To date, the strategy has collected ${$(fields.total_premium)} in cumulative premium, reducing the effective cost basis to ${$(fields.cost_basis)} per unit. The current active position has a strike of ${$(fields.current_strike)} generating ${$(fields.current_premium)} in premium. The annualized return on this strategy is approximately ${fields.annualized_return || "N/A"}%. The strategy is designed to generate consistent income in range-bound or moderately trending markets.`;

    case "collar":
      return `This hedging strategy protects an existing ${fields.holdings || 50}-unit position in ${asset} (currently at ${$(fields.current_price)}, cost basis ${$(fields.cost_basis)}) by establishing a price floor at ${$(fields.put_strike)} through a purchased put option, while partially funding that protection by selling a call option at ${$(fields.call_strike)}. The net cost of this protection is ${$((parseNum(fields.put_premium) - parseNum(fields.call_premium)).toFixed(2))} per unit${parseNum(fields.put_premium) <= parseNum(fields.call_premium) ? " (net credit — the protection generates income)" : ""}. The portfolio value is protected down to ${$(fields.put_strike)} (${fmtN(fields.protected_value)} in total protected value), with upside participation capped at ${$(fields.call_strike)}. This structure expires ${fields.expiry || "on the target date"}.`;

    case "earnings_play":
      return `This analysis evaluates the risk profile of an existing ${fields.position_type || "options"} position in ${asset} heading into the event on ${fields.event_date || "the upcoming date"}. The market is currently pricing an expected move of ±${fields.expected_move_pct}% (approximately ${$((parseNum(fields.current_price) * parseNum(fields.expected_move_pct) / 100).toFixed(2))} in either direction). The current position at the ${$(fields.strike)} strike has collected ${$(fields.premium_collected)} in premium, providing a ${((parseNum(fields.premium_collected) / parseNum(fields.current_price)) * 100).toFixed(1)}% cushion against adverse moves. Historical context: the last three event reactions were ${fields.last_3_reactions || "N/A"}. Recommendation: ${fields.recommendation || "under review"}.`;

    default:
      return "Trade analysis summary is being prepared.";
  }
}

export function computeTradeAnalysis(tradeId, fields) {
  switch (tradeId) {
    case "long_seagull": return computeLongSeagull(fields);
    case "reverse_cash_carry": return computeReverseCashCarry(fields);
    case "covered_call": return computeCoveredCall(fields);
    case "cash_secured_put": return computeCashSecuredPut(fields);
    case "leap": return computeLeap(fields);
    case "wheel": return computeWheel(fields);
    case "collar": return computeCollar(fields);
    case "earnings_play": return computeEarningsPlay(fields);
    default: return null;
  }
}

function n(v) {
  if (typeof v === "number") return v || 0;
  if (!v) return 0;
  // Strip $, commas, spaces, % before parsing
  const cleaned = String(v).replace(/[$,%\s]/g, "").replace(/,/g, "");
  return Number(cleaned) || 0;
}
function fmt(v, decimals = 0) {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(decimals > 0 ? decimals : 0)}K`;
  if (Math.abs(v) < 1 && v !== 0) return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  if (Math.abs(v) < 100 && v !== 0) return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: decimals })}`;
}
// Full comma-formatted dollar amount (no abbreviation)
function fmtFull(v) {
  const num = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,%\s,]/g, ""));
  if (isNaN(num)) return `$${v}`;
  if (Math.abs(num) < 1 && num !== 0) return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildCurve(minPrice, maxPrice, pnlFn, steps = 200) {
  const curve = [];
  for (let i = 0; i <= steps; i++) {
    const price = minPrice + (maxPrice - minPrice) * (i / steps);
    curve.push({ price, pnl: pnlFn(price) });
  }
  return curve;
}

// --- LONG SEAGULL ---
function computeLongSeagull(f) {
  const spot = n(f.spot);
  const contracts = n(f.contracts) || 1;
  const lp = n(f.lower_put);
  const lc = n(f.lower_call);
  const uc = n(f.upper_call);

  const minP = lp * 0.75;
  const maxP = uc * 1.25;

  const curve = buildCurve(minP, maxP, (price) => {
    let pnl = 0;
    if (price < lp) pnl += (price - lp);
    if (price > lc) pnl += (price - lc);
    if (price > uc) pnl -= (price - uc);
    return pnl * contracts;
  });

  const maxProfit = (uc - lc) * contracts;
  const maxLoss = lp * contracts;

  return {
    curve,
    spot,
    breakevens: [lc],
    metrics: [
      { label: "Spot Price", value: fmt(spot), sub: f.asset || "—" },
      { label: "Max Profit", value: fmt(maxProfit), sub: `Capped at ${fmt(uc)}`, positive: true },
      { label: "Max Loss", value: fmt(maxLoss), sub: `Below ${fmt(lp)}`, negative: true },
      { label: "Contracts", value: contracts.toLocaleString(), sub: "Units" },
      { label: "Expiry", value: f.expiry || "—", sub: "Target" },
    ],
    legs: [
      { action: "SELL", type: "Put", strike: lp, label: `${fmt(lp)} Put`, color: "#ef4444" },
      { action: "BUY", type: "Call", strike: lc, label: `${fmt(lc)} Call`, color: "#4ADE80" },
      { action: "SELL", type: "Call", strike: uc, label: `${fmt(uc)} Call`, color: "#ef4444" },
    ],
    zones: [
      { from: minP, to: lp, label: "Max Loss Zone", color: "rgba(239,68,68,0.08)" },
      { from: lc, to: uc, label: "Profit Zone", color: "rgba(74,222,128,0.08)" },
    ],
  };
}

// --- REVERSE CASH & CARRY ---
// Delta-neutral: long spot + short perp. Net P&L is ~flat (funding cost only).
// Chart shows combined P&L: spot gain/loss + perp gain/loss + funding cost.
// Liquidation risk if price rises sharply and margin on short perp is exhausted.
function computeReverseCashCarry(f) {
  const spotPrice = n(f.spot_price);
  const units = n(f.btc_amount);
  const portfolio = n(f.portfolio_value) || spotPrice * units;
  const marginPct = n(f.margin_pct) || 15;
  const cashPct = n(f.cash_released_pct) || 85;
  const fundingRate = n(f.funding_rate) || 10;

  const cashReleased = portfolio * (cashPct / 100);
  const marginPosted = portfolio * (marginPct / 100);
  const annualFundingCost = portfolio * (fundingRate / 100);
  const monthlyFundingCost = annualFundingCost / 12;

  // Liquidation: perp loss eats all margin
  const liqPrice = spotPrice > 0 ? spotPrice + marginPosted / units : 0;
  const warningPrice = spotPrice > 0 ? spotPrice + (marginPosted * 0.5) / units : 0;

  // Chart: combined P&L of long spot + short perp
  const minP = spotPrice * 0.7;
  const maxP = liqPrice * 1.15;

  const curve = buildCurve(minP, maxP, (price) => {
    // Long spot P&L
    const spotPnl = (price - spotPrice) * units;
    // Short perp P&L (opposite of spot)
    const perpPnl = (spotPrice - price) * units;
    // Combined = nearly zero (delta-neutral)
    let combined = spotPnl + perpPnl;

    // After liquidation, short perp is closed — only long spot remains
    if (price >= liqPrice) {
      // Margin is fully lost, perp is liquidated at liqPrice
      const perpLossAtLiq = (liqPrice - spotPrice) * units;
      combined = spotPnl - perpLossAtLiq;
    }

    // Subtract ongoing funding cost (annualized, shown as drag)
    combined -= monthlyFundingCost;

    return combined;
  });

  return {
    curve,
    spot: spotPrice,
    breakevens: [liqPrice],
    metrics: [
      { label: "Portfolio Value", value: fmt(portfolio), sub: `${units.toLocaleString()} ${f.asset || "units"}` },
      { label: "Cash Released", value: fmt(cashReleased), sub: `${cashPct}% unlocked`, positive: true },
      { label: "Margin Posted", value: fmt(marginPosted), sub: `${marginPct}% locked` },
      { label: "Liquidation Price", value: fmt(liqPrice), sub: `+${((liqPrice / spotPrice - 1) * 100).toFixed(1)}% from spot`, negative: true },
      { label: "Funding Cost", value: fmt(monthlyFundingCost) + "/mo", sub: `${fundingRate}% APR` },
      { label: "Venue", value: f.exchange || "—", sub: "Execution" },
    ],
    legs: [
      { action: "HOLD", type: `Spot ${f.asset || "Asset"}`, strike: spotPrice, label: `${units.toLocaleString()} ${f.asset || "units"} @ ${fmt(spotPrice)}`, color: "#F7931A" },
      { action: "SHORT", type: "Perp Futures", strike: spotPrice, label: `Short ${units.toLocaleString()} ${f.asset || "units"} Perp`, color: "#ef4444" },
    ],
    zones: [
      { from: minP, to: warningPrice, label: "Safe Zone", color: "rgba(74,222,128,0.08)" },
      { from: warningPrice, to: liqPrice, label: "Warning Zone", color: "rgba(251,191,36,0.10)" },
      { from: liqPrice, to: maxP, label: "Liquidation", color: "rgba(239,68,68,0.12)" },
    ],
  };
}

// --- COVERED CALL ---
function computeCoveredCall(f) {
  const price = n(f.current_price);
  const strike = n(f.strike);
  const cost = n(f.cost_basis);
  const premium = n(f.premium);
  const holdings = n(f.holdings) || 10;
  const dte = n(f.dte);

  const breakeven = cost - premium;
  const maxProfit = (strike - cost + premium) * holdings;
  const annReturn = price > 0 && dte > 0 ? ((premium / price) * (365 / dte) * 100).toFixed(1) : "N/A";

  const minP = Math.min(cost, breakeven) * 0.8;
  const maxP = strike * 1.2;

  const curve = buildCurve(minP, maxP, (p) => {
    const positionPnl = (p - cost) * holdings;
    const callPnl = premium * holdings - (p > strike ? (p - strike) * holdings : 0);
    return positionPnl + callPnl;
  });

  return {
    curve, spot: price, breakevens: [breakeven],
    metrics: [
      { label: "Current Price", value: fmtFull(price), sub: f.asset || "—" },
      { label: "Max Profit", value: fmt(maxProfit), sub: `At ${fmtFull(strike)}+`, positive: true },
      { label: "Breakeven", value: fmtFull(breakeven.toFixed(2)), sub: "Downside" },
      { label: "Premium", value: fmtFull(premium), sub: `${annReturn}% ann.`, positive: true },
      { label: "IV Rank / DTE", value: `${f.iv_rank}% / ${dte}d`, sub: `${n(f.delta)} delta` },
    ],
    legs: [
      { action: "HOLD", type: `Spot ${f.asset || "Asset"}`, strike: cost, label: `${holdings} units @ ${fmtFull(cost)}`, color: "#00C2FF" },
      { action: "SELL", type: "Call", strike, label: `${fmtFull(strike)} Call @ ${fmtFull(premium)}`, color: "#ef4444" },
    ],
    zones: [
      { from: breakeven, to: strike, label: "Profit Zone", color: "rgba(74,222,128,0.08)" },
    ],
  };
}

// --- CASH-SECURED PUT ---
function computeCashSecuredPut(f) {
  const price = n(f.current_price);
  const strike = n(f.strike);
  const premium = n(f.premium);
  const dte = n(f.dte);
  const capital = n(f.capital_required);
  const effectiveBasis = n(f.effective_basis) || (strike - premium);

  const breakeven = strike - premium;
  const maxProfit = premium * 100;
  const returnOnCapital = capital > 0 ? ((premium * 100 / capital) * (365 / (dte || 30)) * 100).toFixed(1) : "N/A";

  const minP = strike * 0.75;
  const maxP = price * 1.15;

  const curve = buildCurve(minP, maxP, (p) => {
    if (p >= strike) return premium * 100;
    return (p - strike + premium) * 100;
  });

  return {
    curve, spot: price, breakevens: [breakeven],
    metrics: [
      { label: "Current Price", value: fmtFull(price), sub: f.asset || "—" },
      { label: "Max Income", value: fmt(maxProfit), sub: `${returnOnCapital}% ann.`, positive: true },
      { label: "Breakeven", value: fmtFull(breakeven.toFixed(2)), sub: "Assignment" },
      { label: "Capital Req.", value: fmt(capital), sub: `Eff. basis ${fmtFull(effectiveBasis)}` },
      { label: "IV Rank / DTE", value: `${f.iv_rank}% / ${dte}d`, sub: `${f.delta} delta` },
    ],
    legs: [
      { action: "SELL", type: "Put", strike, label: `${fmtFull(strike)} Put @ ${fmtFull(premium)}`, color: "#A78BFA" },
    ],
    zones: [
      { from: breakeven, to: maxP, label: "Profit Zone", color: "rgba(74,222,128,0.08)" },
    ],
  };
}

// --- LONG-DATED OPTION ---
function computeLeap(f) {
  const price = n(f.current_price);
  const strike = n(f.strike);
  const premium = n(f.premium);
  const contracts = n(f.contracts) || 1;
  const totalOutlay = n(f.total_outlay) || premium * contracts * 100;
  const dte = n(f.dte);

  const breakeven = strike + premium;
  const minP = strike * 0.7;
  const maxP = breakeven * 1.4;

  const curve = buildCurve(minP, maxP, (p) => {
    if (p <= strike) return -totalOutlay;
    return ((p - strike) * contracts * 100) - totalOutlay;
  });

  return {
    curve, spot: price, breakevens: [breakeven],
    metrics: [
      { label: "Current Price", value: fmtFull(price), sub: f.asset || "—" },
      { label: "Capital at Risk", value: fmt(totalOutlay), sub: `${contracts} contracts`, negative: true },
      { label: "Breakeven", value: fmtFull(breakeven.toFixed(2)), sub: `+${((breakeven / price - 1) * 100).toFixed(1)}%` },
      { label: "Delta", value: f.delta, sub: `Leverage ~${(n(f.delta) * price / premium).toFixed(1)}x` },
      { label: "DTE", value: `${dte}d`, sub: f.expiry || "" },
    ],
    legs: [
      { action: "BUY", type: "Call (Long-Dated)", strike, label: `${fmtFull(strike)} Call @ ${fmtFull(premium)}`, color: "#FB923C" },
    ],
    zones: [
      { from: breakeven, to: maxP, label: "Profit Zone", color: "rgba(74,222,128,0.08)" },
    ],
  };
}

// --- THE WHEEL ---
// Cycles between selling cash-secured puts and covered calls.
// Chart shows per-unit P&L for the current phase, including cumulative premium.
function computeWheel(f) {
  const price = n(f.current_price);
  const costBasis = n(f.cost_basis);
  const totalPremium = n(f.total_premium);
  const currentStrike = n(f.current_strike);
  const currentPremium = n(f.current_premium);
  const cycles = n(f.cycles_completed);
  const annReturn = n(f.annualized_return);

  const isSellingPuts = f.current_phase === "Selling Puts";
  const isSellingCalls = f.current_phase === "Selling Covered Calls";

  // Effective breakeven after all collected premium
  const effectiveBasis = costBasis - totalPremium;

  let minP, maxP;

  if (isSellingPuts) {
    // Selling puts: profit = premium if price stays above strike
    // Loss starts below strike (assigned at strike, minus premium cushion)
    const putBreakeven = currentStrike - currentPremium;
    minP = putBreakeven * 0.8;
    maxP = currentStrike * 1.3;
  } else {
    // Holding + selling calls: profit from asset appreciation + premium, capped at call strike
    minP = effectiveBasis * 0.8;
    maxP = currentStrike * 1.2;
  }

  const curve = buildCurve(minP, maxP, (p) => {
    if (isSellingPuts) {
      // Short put payoff (per unit)
      if (p >= currentStrike) return currentPremium;
      return p - currentStrike + currentPremium;
    }
    // Holding position + selling covered calls
    // Per-unit P&L: asset gain from cost basis + all premium collected
    const assetPnl = p - costBasis;
    const allPremium = totalPremium + (isSellingCalls ? currentPremium : 0);
    if (isSellingCalls && p > currentStrike) {
      // Called away: capped gain
      return (currentStrike - costBasis) + allPremium;
    }
    return assetPnl + allPremium;
  });

  const breakeven = isSellingPuts
    ? currentStrike - currentPremium
    : costBasis - totalPremium - (isSellingCalls ? currentPremium : 0);
  const maxProfit = isSellingCalls
    ? (currentStrike - costBasis) + totalPremium + currentPremium
    : null;

  return {
    curve, spot: price, breakevens: [breakeven],
    metrics: [
      { label: "Current Price", value: fmtFull(price), sub: f.asset || "—" },
      { label: "Phase", value: f.current_phase || "—", sub: `Cycle ${cycles}` },
      { label: "Total Premium", value: fmtFull(totalPremium), sub: `${cycles} cycles`, positive: true },
      { label: "Adj. Basis", value: fmtFull(costBasis), sub: `BE: ${fmtFull(breakeven)}` },
      { label: "Ann. Return", value: `${annReturn}%`, sub: `${fmtFull(currentPremium)} current`, positive: true },
      ...(maxProfit ? [{ label: "Max Profit", value: fmtFull(maxProfit), sub: "if called away", positive: true }] : []),
    ],
    legs: isSellingPuts
      ? [{ action: "SELL", type: "Put", strike: currentStrike, label: `${fmtFull(currentStrike)} Put @ ${fmtFull(currentPremium)}`, color: "#34D399" }]
      : isSellingCalls
        ? [
            { action: "HOLD", type: `Spot ${f.asset || "Asset"}`, strike: costBasis, label: `Position @ ${fmtFull(costBasis)}`, color: "#00C2FF" },
            { action: "SELL", type: "Call", strike: currentStrike, label: `${fmtFull(currentStrike)} Call @ ${fmtFull(currentPremium)}`, color: "#34D399" },
          ]
        : [{ action: "HOLD", type: `Spot ${f.asset || "Asset"}`, strike: costBasis, label: `Position @ ${fmtFull(costBasis)}`, color: "#00C2FF" }],
    zones: [],
  };
}

// --- COLLAR ---
function computeCollar(f) {
  const price = n(f.current_price);
  const cost = n(f.cost_basis);
  const putStrike = n(f.put_strike);
  const callStrike = n(f.call_strike);
  const putPrem = n(f.put_premium);
  const callPrem = n(f.call_premium);
  const holdings = n(f.holdings) || 50;
  const netCost = putPrem - callPrem;
  const protectedVal = n(f.protected_value);

  const minP = putStrike * 0.85;
  const maxP = callStrike * 1.15;

  const curve = buildCurve(minP, maxP, (p) => {
    let pnl = (p - cost - netCost) * holdings;
    if (p < putStrike) pnl = (putStrike - cost - netCost) * holdings;
    if (p > callStrike) pnl = (callStrike - cost - netCost) * holdings;
    return pnl;
  });

  const maxProfit = (callStrike - cost - netCost) * holdings;

  return {
    curve, spot: price, breakevens: [cost + netCost],
    metrics: [
      { label: "Current Price", value: fmtFull(price), sub: f.asset || "—" },
      { label: "Protected Floor", value: fmtFull(putStrike), sub: `${holdings} units` },
      { label: "Upside Cap", value: fmtFull(callStrike), sub: `Max ${fmt(maxProfit)}`, positive: true },
      { label: "Net Cost", value: fmtFull(netCost.toFixed(2)), sub: netCost <= 0 ? "Credit" : "Debit", positive: netCost <= 0 },
      { label: "Value Protected", value: fmt(protectedVal), sub: f.expiry || "" },
    ],
    legs: [
      { action: "HOLD", type: `Spot ${f.asset || "Asset"}`, strike: cost, label: `${holdings} units @ ${fmtFull(cost)}`, color: "#00C2FF" },
      { action: "BUY", type: "Put", strike: putStrike, label: `${fmtFull(putStrike)} Put @ ${fmtFull(putPrem)}`, color: "#F472B6" },
      { action: "SELL", type: "Call", strike: callStrike, label: `${fmtFull(callStrike)} Call @ ${fmtFull(callPrem)}`, color: "#ef4444" },
    ],
    zones: [
      { from: putStrike, to: callStrike, label: "Active Range", color: "rgba(244,114,182,0.06)" },
    ],
  };
}

// --- EVENT RISK ANALYSIS ---
function computeEarningsPlay(f) {
  const price = n(f.current_price);
  const move = n(f.expected_move_pct);
  const strike = n(f.strike);
  const premCollected = n(f.premium_collected);

  const downTarget = price * (1 - move / 100);
  const upTarget = price * (1 + move / 100);
  const minP = price * 0.75;
  const maxP = price * 1.25;

  const posType = f.position_type || "Short Put";
  const curve = buildCurve(minP, maxP, (p) => {
    switch (posType) {
      case "Short Put":
        if (p >= strike) return premCollected * 100;
        return (p - strike + premCollected) * 100;
      case "Long Call":
        if (p <= strike) return -premCollected * 100;
        return ((p - strike) - premCollected) * 100;
      case "Covered Call":
        if (p > strike) return (strike - price + premCollected) * 100;
        return (p - price + premCollected) * 100;
      case "Short Call Spread":
        if (p <= strike) return premCollected * 100;
        return (premCollected - (p - strike)) * 100;
      default:
        return 0;
    }
  });

  const cushion = price > 0 ? ((premCollected / price) * 100).toFixed(1) : "0";

  return {
    curve, spot: price, breakevens: [strike - premCollected],
    metrics: [
      { label: "Current Price", value: fmtFull(price), sub: f.asset || "—" },
      { label: "Expected Move", value: `±${move}%`, sub: `${fmtFull(downTarget.toFixed(0))} – ${fmtFull(upTarget.toFixed(0))}` },
      { label: "Position", value: posType, sub: `${fmtFull(strike)} strike` },
      { label: "Premium", value: fmtFull(premCollected), sub: `${cushion}% cushion`, positive: true },
      { label: "Event", value: f.event_date || "—", sub: f.recommendation || "" },
    ],
    legs: [
      { action: posType.includes("Short") || posType.includes("Covered") ? "SELL" : "BUY", type: posType, strike, label: `${fmtFull(strike)} @ ${fmtFull(premCollected)}`, color: "#FBBF24" },
    ],
    zones: [
      { from: downTarget, to: upTarget, label: "Expected Move", color: "rgba(251,191,36,0.06)" },
    ],
  };
}
