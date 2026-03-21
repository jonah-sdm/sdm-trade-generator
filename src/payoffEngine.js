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
    case "long_seagull": {
      const spot = parseNum(fields.spot);
      const lp = parseNum(fields.lower_put), lc = parseNum(fields.lower_call), uc = parseNum(fields.upper_call);
      return `This is a zero-cost options structure on ${asset}, consisting of a sold put at ${fmtN(lp)}, a bought call at ${fmtN(lc)}, and a sold call at ${fmtN(uc)}. The premiums received from the two short legs fully offset the cost of the long call — net premium paid is zero.

Above ${fmtN(lc)} at expiry, the position generates profit up to a maximum of ${fmtN(fields.max_pnl)} at ${fmtN(uc)}. Above ${fmtN(uc)}, the sold call caps further participation. Below ${fmtN(lp)}, you are obligated to purchase ${asset} at that level — the maximum loss is not bounded by premium but by the put strike. The structure covers ${fields.contracts || "the specified number of"} contracts and expires ${fields.expiry || "on the target date"}.

The key trade-off: no upfront cost in exchange for capped upside at ${fmtN(uc)} and downside obligation below ${fmtN(lp)}. This structure is only appropriate if you are prepared to take delivery of ${asset} at the put strike.`;
    }

    case "reverse_cash_carry": {
      const pv = parseNum(fields.portfolio_value) || (parseNum(fields.spot_price) * parseNum(fields.btc_amount)) || 0;
      const crPct = parseNum(fields.cash_released_pct) || 85;
      const cashAmt = pv * (crPct / 100);
      const mgPct = parseNum(fields.margin_pct) || 15;
      const liqPx = parseNum(fields.spot_price) && parseNum(fields.btc_amount) ? parseNum(fields.spot_price) + (pv * mgPct / 100) / parseNum(fields.btc_amount) : 0;
      return `This structure holds spot ${asset} long while shorting an equivalent notional in perpetual futures on ${fields.exchange || "the designated exchange"}. The two legs offset each other's directional exposure, producing a delta-neutral book. The net effect: approximately ${fmtN(cashAmt)} (${crPct}% of position value) is freed from collateral requirements, with ${mgPct}% of portfolio value retained as margin on the short leg.

The ongoing cost of carry is the funding rate, currently estimated at ${fields.funding_rate || "~10"}% APR — paid when funding is positive (longs pay shorts). The short futures leg introduces liquidation risk if ${asset} rises sharply: ${liqPx ? `liquidation on the short begins near ${fmtN(liqPx)}, at which point margin is exhausted.` : "refer to exchange margin tables for the specific liquidation level."} ${fields.client_use_case ? ` Released capital is designated for: ${fields.client_use_case}.` : ""}

The structure does not change your net ${asset} exposure — a spot price increase still benefits the long leg in proportion to the short leg's loss. The primary risk is funding rate turning negative (shorts pay longs) or a sharp enough rally to trigger liquidation before the margin can be replenished.`;
    }

    case "covered_call": {
      const holdings = parseNum(fields.holdings) || 10;
      const premium = parseNum(fields.premium);
      const price = parseNum(fields.current_price);
      const costBasis = parseNum(fields.cost_basis);
      const strike = parseNum(fields.strike);
      const dte = parseNum(fields.dte);
      const notional = holdings * price;
      const annReturn = notional > 0 && dte > 0 ? ((premium / notional) * (365 / dte) * 100).toFixed(1) : "N/A";
      const breakeven = (costBasis - (premium / holdings)).toFixed(2);
      const maxProfit = ((strike - costBasis) * holdings) + premium;
      return `You hold ${fields.holdings || 10} ${asset} at a cost basis of ${$(fields.cost_basis)}. This trade sells a call at the ${$(fields.strike)} strike expiring ${fields.expiry || "on the target date"}, collecting ${fmtN(premium)} total — or approximately ${annReturn}% annualized on the current price. The premium is received immediately and is yours regardless of outcome.

If ${asset} is below ${$(fields.strike)} at expiry, the option expires worthless and you retain your full position. If ${asset} is above ${$(fields.strike)} at expiry, your holdings are called away at that price. Upside above ${$(fields.strike)} is forfeited. Your effective downside breakeven, after premium, is ${$(breakeven)}. Maximum profit if called at the strike is ${fmtN(maxProfit)}.

IV Rank is ${fields.iv_rank}% — a higher reading implies relatively elevated premiums versus recent history. The ${fields.delta} delta at the chosen strike reflects the market-implied probability of assignment. If ${asset} is called away and you wish to re-establish the position, you will need to re-enter at the prevailing spot price.`;
    }

    case "cash_secured_put": {
      const effectiveBasis = parseNum(fields.effective_basis) || (parseNum(fields.strike) - parseNum(fields.premium));
      const discount = ((1 - effectiveBasis / parseNum(fields.current_price)) * 100).toFixed(1);
      return `${asset} is currently at ${$(fields.current_price)}. This trade sells a put at the ${$(fields.strike)} strike expiring ${fields.expiry || "on the target date"}, collecting ${$(fields.premium)} per unit. The full capital requirement of ${fmtN(fields.capital_required)} is held in reserve to cover potential assignment.

If ${asset} is above ${$(fields.strike)} at expiry, the option expires worthless and you keep the premium — no ${asset} is purchased. If ${asset} is at or below ${$(fields.strike)} at expiry, you are assigned and purchase ${asset} at an effective cost basis of ${$(effectiveBasis.toFixed(2))} — ${discount}% below the current spot price, net of premium received. There is no further downside protection below the strike; the position behaves identically to long spot below that level.

IV Rank is ${fields.iv_rank}%. The ${fields.delta} delta indicates the market-implied probability of expiring in the money is approximately ${(Math.abs(parseNum(fields.delta)) * 100).toFixed(0)}%. This trade is only appropriate if you are prepared to own ${asset} at the strike price.`;
    }

    case "leap": {
      const breakeven = (parseNum(fields.strike) + parseNum(fields.premium)).toFixed(2);
      const bePct = ((parseNum(fields.strike) + parseNum(fields.premium)) / parseNum(fields.current_price) * 100 - 100).toFixed(1);
      return `This is a long call position: ${fields.contracts || 1} contract(s) at the ${$(fields.strike)} strike expiring ${fields.expiry || "on the target date"}, purchased for ${fmtN(fields.total_outlay)} in total premium. ${asset} is currently at ${$(fields.current_price)}. The position has a delta of ${fields.delta} and ${fields.dte || "300+"} days to expiry.

The breakeven at expiry is ${$(breakeven)} — a ${bePct}% move from the current price. Above that level, the position is profitable in proportion to how far ${asset} exceeds the breakeven. The maximum loss is the ${fmtN(fields.total_outlay)} premium paid, incurred in full if ${asset} is at or below ${$(fields.strike)} at expiry.${fields.target_price ? ` At the stated target of ${$(fields.target_price)}, the intrinsic value at expiry would be ${$(Math.max(0, parseNum(fields.target_price) - parseNum(fields.strike)))} per unit.` : ""}

Time decay (theta) works against this position daily. A ${fields.dte || "300+"}-day expiry reduces — but does not eliminate — the rate of time value erosion versus shorter-dated options. If ${asset} does not reach the breakeven before expiry, the entire premium is lost.`;
    }

    case "wheel": {
      const effectiveBasis = (parseNum(fields.cost_basis) - parseNum(fields.total_premium)).toFixed(2);
      return `This is a summary of the ongoing Wheel strategy on ${asset}. After ${fields.cycles_completed || 0} completed cycles, cumulative premium collected totals ${$(fields.total_premium)}, reducing your adjusted cost basis from ${$(fields.cost_basis)} to ${$(effectiveBasis)} per unit. The strategy is currently in the "${fields.current_phase || "active"}" phase.

The active leg is a ${$(fields.current_strike)} strike generating ${$(fields.current_premium)} this cycle. Annualized return on committed capital is approximately ${fields.annualized_return || "N/A"}%. Each cycle alternates between cash-secured puts (when not holding the asset) and covered calls (when holding), with strike selection determining both the premium collected and the assignment risk.

The strategy generates income in exchange for two specific obligations: to buy ${asset} at the put strike if assigned, and to sell ${asset} at the call strike if called away. Performance deteriorates in trending markets — a sharp directional move can either result in purchasing ${asset} well above market (on an upward gap through the put strike) or being called away before the full upside is captured.`;
    }

    case "collar": {
      const netCost = parseNum(fields.put_premium) - parseNum(fields.call_premium);
      const isCredit = netCost <= 0;
      return `You hold ${fields.holdings || 50} ${asset} at a cost basis of ${$(fields.cost_basis)}, currently priced at ${$(fields.current_price)}. This trade buys a put at ${$(fields.put_strike)} and sells a call at ${$(fields.call_strike)}, both expiring ${fields.expiry || "on the target date"}. Net cost: ${isCredit ? `credit of ${$(Math.abs(netCost).toFixed(2))} per unit received` : `${$(netCost.toFixed(2))} per unit paid`}.

Below ${$(fields.put_strike)}, losses on the spot position are offset by the put — your total downside is capped regardless of how far ${asset} falls. Above ${$(fields.call_strike)}, gains on the spot position are offset by the short call — you do not participate in any rally beyond that level. Between the two strikes, the position moves dollar-for-dollar with ${asset}. Total protected value: ${fmtN(fields.protected_value)}.

The collar converts an open-ended risk profile into a bounded range. The cost of that downside protection is the forfeiture of upside above ${$(fields.call_strike)}. If ${asset} rallies significantly above the call strike, the opportunity cost may be substantial relative to holding unhedged.`;
    }

    case "earnings_play": {
      const expectedMoveDollar = (parseNum(fields.current_price) * parseNum(fields.expected_move_pct) / 100).toFixed(0);
      const cushionPct = ((parseNum(fields.premium_collected) / parseNum(fields.current_price)) * 100).toFixed(1);
      return `${asset} is at ${$(fields.current_price)} ahead of the ${fields.event_date || "upcoming"} event. The options market is pricing a ±${fields.expected_move_pct}% implied move, equivalent to approximately ${$(expectedMoveDollar)} in either direction. The current ${fields.position_type || "options"} position is at the ${$(fields.strike)} strike, with ${$(fields.premium_collected)} in collected premium — a ${cushionPct}% buffer before the position begins losing.

For the position to remain profitable, ${asset} must stay within the implied move range on the relevant side. The last three comparable events produced: ${fields.last_3_reactions || "data not available"}. That history does not predict this outcome but provides context on whether the implied move is consistent with realized moves.

Assessment: <strong>${fields.recommendation || "under review"}</strong>. ${fields.recommendation === "Hold Through Event" ? `Premium collected exceeds the breakeven move required — the position has positive expected value relative to historical realized moves at this event type. Hold unless the position size is disproportionate to risk tolerance.` : fields.recommendation === "Close Before Event" ? `Closing before the event locks in accumulated premium and removes binary gap risk. The remaining time value does not justify the event exposure.` : fields.recommendation === "Roll to Later Date" ? `Rolling to a later expiry captures the remaining premium advantage while removing this specific event from the risk window.` : `Review position sizing ahead of the event. Binary events can produce moves that exceed the implied range.`}`;
    }

    case "call_spread": {
      const spot = parseNum(fields.spot);
      const longK = parseNum(fields.long_strike);
      const shortK = parseNum(fields.short_strike);
      const premium = parseNum(fields.premium);
      const dir = fields.direction || "Long";
      const isLong = dir === "Long";
      const absP = Math.abs(premium);
      const breakeven = isLong ? longK + absP : shortK + absP;
      const maxGain = isLong ? Math.max(shortK - longK + premium, 0) : absP;
      const maxLoss = isLong ? absP : Math.max(longK - shortK - absP, 0);
      return isLong
        ? `This is a bull call spread on ${fields.asset || "the underlying"}. You buy the ${fmtN(longK)} call and sell the ${fmtN(shortK)} call, paying a net debit of ${fmtN(absP)}, expiring ${fields.expiry || "on the target date"}.

The position profits above ${fmtN(breakeven)} at expiry, with maximum gain of ${fmtN(maxGain)} if the asset settles above ${fmtN(shortK)}. Maximum loss is the ${fmtN(absP)} debit if the asset expires below ${fmtN(longK)}. The spread provides leveraged upside exposure at a lower cost than a naked long call, in exchange for capping profit at the width of the spread.`
        : `This is a bear call spread on ${fields.asset || "the underlying"}. You sell the ${fmtN(shortK)} call and buy the ${fmtN(longK)} call as a hedge, collecting a net credit of ${fmtN(absP)}, expiring ${fields.expiry || "on the target date"}.

The full ${fmtN(absP)} credit is retained if the asset remains below ${fmtN(shortK)} at expiry. Losses begin above ${fmtN(breakeven)} and are capped at ${fmtN(maxLoss)} if the asset expires above ${fmtN(longK)}. This is a neutral-to-bearish income trade with strictly defined maximum loss.`;
    }

    case "put_spread": {
      const spot = parseNum(fields.spot);
      const longK = parseNum(fields.long_strike);
      const shortK = parseNum(fields.short_strike);
      const premium = parseNum(fields.premium);
      const dir = fields.direction || "Long";
      const isLong = dir === "Long";
      const absP = Math.abs(premium);
      const breakeven = isLong ? longK - absP : shortK - absP;
      const maxGain = isLong ? Math.max(longK - shortK + premium, 0) : absP;
      const maxLoss = isLong ? absP : Math.max(longK - shortK - absP, 0);
      return isLong
        ? `This is a bear put spread on ${fields.asset || "the underlying"}. You buy the ${fmtN(longK)} put and sell the ${fmtN(shortK)} put, paying a net debit of ${fmtN(absP)}, expiring ${fields.expiry || "on the target date"}.

The position profits below ${fmtN(breakeven)} at expiry, with maximum gain of ${fmtN(maxGain)} if the asset settles below ${fmtN(shortK)}. Maximum loss is the ${fmtN(absP)} debit if the asset expires above ${fmtN(longK)}. This is a defined-risk directional downside trade.`
        : `This is a bull put spread on ${fields.asset || "the underlying"}. You sell the ${fmtN(shortK)} put and buy the ${fmtN(longK)} put for protection, collecting a net credit of ${fmtN(absP)}, expiring ${fields.expiry || "on the target date"}.

The full ${fmtN(absP)} credit is retained if the asset remains above ${fmtN(shortK)} at expiry. Losses begin below ${fmtN(breakeven)} and are capped at ${fmtN(maxLoss)} if the asset expires below ${fmtN(longK)}. This is a neutral-to-bullish income trade with bounded maximum loss.`;
    }

    case "straddle": {
      const spot = parseNum(fields.spot);
      const atmK = parseNum(fields.atm_strike);
      const premium = parseNum(fields.total_premium);
      const dir = fields.direction || "Long";
      const isLong = dir === "Long";
      const absP = Math.abs(premium);
      const beLow = atmK - absP;
      const beHigh = atmK + absP;
      return isLong
        ? `This is a long straddle on ${fields.asset || "the underlying"} at the ${fmtN(atmK)} strike, expiring ${fields.expiry || "on the target date"}. You buy both the call and put at the same strike, paying a total debit of ${fmtN(absP)}.

The position profits if the asset moves sharply in either direction. The two breakevens are ${fmtN(beLow)} to the downside and ${fmtN(beHigh)} to the upside. Maximum loss is the ${fmtN(absP)} premium paid, occurring if the asset expires exactly at the strike. Implied volatility at ${fields.iv || "current levels"} needs to be realised — or exceeded — for the trade to be profitable.`
        : `This is a short straddle on ${fields.asset || "the underlying"} at the ${fmtN(atmK)} strike, expiring ${fields.expiry || "on the target date"}. You sell both the call and put at the same strike, collecting a total credit of ${fmtN(absP)}.

Maximum profit of ${fmtN(absP)} is achieved if the asset expires exactly at ${fmtN(atmK)}. The position begins losing outside the ${fmtN(beLow)}–${fmtN(beHigh)} range, with theoretically unlimited loss on a large move in either direction. This trade is a bet on implied volatility (${fields.iv || "current IV"}) exceeding realised volatility — a volatility crush or a range-bound market.`;
    }

    case "strangle": {
      const spot = parseNum(fields.spot);
      const callK = parseNum(fields.call_strike);
      const putK = parseNum(fields.put_strike);
      const premium = parseNum(fields.total_premium);
      const dir = fields.direction || "Long";
      const isLong = dir === "Long";
      const absP = Math.abs(premium);
      const beLow = putK - absP;
      const beHigh = callK + absP;
      return isLong
        ? `This is a long strangle on ${fields.asset || "the underlying"}, buying the ${fmtN(callK)} call and the ${fmtN(putK)} put, expiring ${fields.expiry || "on the target date"}. Total debit paid is ${fmtN(absP)}.

The position profits outside the ${fmtN(beLow)}–${fmtN(beHigh)} range. Between the two strikes, the full premium is lost. Compared to a straddle, the strangle costs less but requires a larger price move to reach breakeven. Maximum loss is the ${fmtN(absP)} premium, occurring anywhere between ${fmtN(putK)} and ${fmtN(callK)} at expiry.`
        : `This is a short strangle on ${fields.asset || "the underlying"}, selling the ${fmtN(callK)} call and the ${fmtN(putK)} put, expiring ${fields.expiry || "on the target date"}. Total credit received is ${fmtN(absP)}.

Maximum profit is the ${fmtN(absP)} premium, kept as long as the asset expires between ${fmtN(putK)} and ${fmtN(callK)}. Losses begin outside the ${fmtN(beLow)}–${fmtN(beHigh)} range. This is a range-bound income trade with unlimited theoretical loss on a large directional move. It is exposed to volatility expansion (vega risk) and requires active management if the asset approaches either strike.`;
    }

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
    case "call_spread": return computeCallSpread(fields);
    case "put_spread": return computePutSpread(fields);
    case "straddle": return computeStraddle(fields);
    case "strangle": return computeStrangle(fields);
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
  const premium = n(f.premium);        // TOTAL flat premium for the whole position (NOT per unit)
  const holdings = n(f.holdings) || 10;
  const dte = n(f.dte);

  const premiumPerUnit = holdings > 0 ? premium / holdings : 0;
  const notional = holdings * price;
  const breakeven = cost - premiumPerUnit;
  const maxProfit = ((strike - cost) * holdings) + premium;
  const annReturn = notional > 0 && dte > 0 ? ((premium / notional) * (365 / dte) * 100).toFixed(1) : "N/A";

  const minP = Math.max(price * 0.5, 0.01);
  const maxP = strike * 1.3;

  const curve = buildCurve(minP, maxP, (p) => {
    // Covered call P&L: spot P&L + premium, capped above strike
    if (p <= strike) return ((p - cost) * holdings) + premium;
    return ((strike - cost) * holdings) + premium;   // capped
  });

  const unrealizedGain = price > 0 && cost > 0 ? ((price - cost) * holdings) : 0;

  return {
    curve, spot: price, breakevens: [breakeven],
    metrics: [
      { label: "Current Price", value: fmtFull(price), sub: f.asset || "—" },
      { label: "Premium Income", value: fmt(premium), sub: `${annReturn}% ann. return`, positive: true },
      { label: "Max Profit", value: fmt(maxProfit), sub: `If called at ${fmtFull(strike)}`, positive: true },
      { label: "Breakeven", value: fmtFull(breakeven.toFixed(2)), sub: "Downside protection" },
      { label: "Unrealized Gain", value: fmt(unrealizedGain), sub: `${holdings} units · ${f.iv_rank}% IV`, positive: unrealizedGain >= 0 },
    ],
    legs: [
      { action: "HOLD", type: `Spot ${f.asset || "Asset"}`, strike: cost, label: `${holdings} units @ ${fmtFull(cost)}`, color: "#00C2FF" },
      { action: "SELL", type: "Call", strike, label: `${fmtFull(strike)} Call · ${fmt(premium)} total`, color: "#ef4444" },
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
  const maxProfit = premium;
  const returnOnCapital = capital > 0 ? ((premium / capital) * (365 / (dte || 30)) * 100).toFixed(1) : "N/A";

  const minP = strike * 0.75;
  const maxP = price * 1.15;

  const curve = buildCurve(minP, maxP, (p) => {
    if (p >= strike) return premium;
    return p - strike + premium;
  });

  const discountToCurrent = price > 0 ? ((1 - effectiveBasis / price) * 100).toFixed(1) : "0";

  return {
    curve, spot: price, breakevens: [breakeven],
    metrics: [
      { label: "Current Price", value: fmtFull(price), sub: f.asset || "—" },
      { label: "Premium Income", value: fmtFull(maxProfit), sub: `${returnOnCapital}% ann. return`, positive: true },
      { label: "Breakeven", value: fmtFull(breakeven.toFixed(2)), sub: "If assigned" },
      { label: "Effective Basis", value: fmtFull(effectiveBasis), sub: `${discountToCurrent}% below spot`, positive: true },
      { label: "Capital Req.", value: fmt(capital), sub: `${f.iv_rank}% IV · ${dte}d · ${f.delta} Δ` },
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
  const totalOutlay = n(f.total_outlay) || premium * contracts;
  const dte = n(f.dte);
  const target = n(f.target_price);

  const breakeven = strike + premium;
  const chartMax = target > breakeven * 1.4 ? target * 1.1 : breakeven * 1.4;
  const minP = strike * 0.7;
  const maxP = chartMax;

  const curve = buildCurve(minP, maxP, (p) => {
    if (p <= strike) return -totalOutlay;
    return ((p - strike) * contracts) - totalOutlay;
  });

  // Key stats
  const profitAtTarget = target > strike ? ((target - strike) * contracts) - totalOutlay : null;
  const returnOnCapital = profitAtTarget !== null && totalOutlay > 0 ? (profitAtTarget / totalOutlay * 100) : null;
  const leverageMultiple = price > 0 && premium > 0 ? (n(f.delta) * price / premium) : null;

  const metrics = [
    { label: "Current Price", value: fmtFull(price), sub: f.asset || "—" },
    { label: "Capital at Risk", value: fmt(totalOutlay), sub: `${contracts} contracts`, negative: true },
    { label: "Breakeven", value: fmtFull(breakeven.toFixed(2)), sub: `+${((breakeven / price - 1) * 100).toFixed(1)}%` },
  ];

  if (profitAtTarget !== null) {
    metrics.push({ label: "Profit at Target", value: fmt(profitAtTarget), sub: `at ${fmtFull(target)}`, positive: true });
    metrics.push({ label: "Return on Capital", value: `${returnOnCapital.toFixed(0)}%`, sub: `${(profitAtTarget / totalOutlay + 1).toFixed(1)}x capital`, positive: true });
  }

  metrics.push({ label: "Delta / Leverage", value: `${f.delta} / ${leverageMultiple ? leverageMultiple.toFixed(1) + "x" : "—"}`, sub: `${dte}d · ${f.expiry || ""}` });

  return {
    curve, spot: price, breakevens: [breakeven],
    ...(target ? { annotations: [{ price: target, label: "Target", color: "#4ADE80" }] } : {}),
    metrics,
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
        if (p >= strike) return premCollected;
        return p - strike + premCollected;
      case "Long Call":
        if (p <= strike) return -premCollected;
        return (p - strike) - premCollected;
      case "Covered Call":
        if (p > strike) return strike - price + premCollected;
        return p - price + premCollected;
      case "Short Call Spread":
        if (p <= strike) return premCollected;
        return premCollected - (p - strike);
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

// --- CALL SPREAD ---
// long_strike = the strike of the leg you are LONG (bought call)
// short_strike = the strike of the leg you are SHORT (sold call)
// For Long (bull): long_strike < short_strike; premium is negative (debit)
// For Short (bear): long_strike > short_strike; premium is positive (credit)
function computeCallSpread(f) {
  const spot = n(f.spot);
  const longK = n(f.long_strike);
  const shortK = n(f.short_strike);
  const premium = n(f.premium);
  const dir = f.direction || "Long";
  const isLong = dir === "Long";

  const lo = spot * 0.74;
  const hi = spot * 1.26;

  // Single formula works for both directions given correct strike ordering
  const pf = (S) => Math.max(0, S - longK) - Math.max(0, S - shortK) + premium;
  const curve = buildCurve(lo, hi, pf);

  const absP = Math.abs(premium);
  const breakeven = isLong ? longK + absP : shortK + absP;
  const maxGain = isLong ? Math.max(shortK - longK + premium, 0) : absP;
  const maxLoss = isLong ? absP : Math.max(longK - shortK - absP, 0);

  return {
    curve, spot, breakevens: [breakeven],
    metrics: [
      { label: "Spot Price", value: fmt(spot), sub: f.asset || "—" },
      { label: dir + " Call Spread", value: `${fmt(longK)} / ${fmt(shortK)}`, sub: f.expiry || "—" },
      { label: "Max Gain", value: fmt(maxGain), sub: isLong ? `Above ${fmt(shortK)}` : "Premium income", positive: true },
      { label: "Max Loss", value: fmt(maxLoss), sub: isLong ? `Below ${fmt(longK)}` : `Above ${fmt(longK)}`, negative: true },
      { label: "Breakeven", value: fmt(breakeven), sub: `IV: ${f.iv || "—"} · Δ ${f.delta || "—"}` },
    ],
    legs: isLong
      ? [
          { action: "BUY", type: "Call", strike: longK, label: `${fmt(longK)} Call`, color: "#378ADD" },
          { action: "SELL", type: "Call", strike: shortK, label: `${fmt(shortK)} Call`, color: "#ef4444" },
        ]
      : [
          { action: "SELL", type: "Call", strike: shortK, label: `${fmt(shortK)} Call`, color: "#ef4444" },
          { action: "BUY", type: "Call", strike: longK, label: `${fmt(longK)} Call`, color: "#378ADD" },
        ],
    zones: [],
  };
}

// --- PUT SPREAD ---
// long_strike = strike of bought put (higher strike for Long bear spread)
// short_strike = strike of sold put (lower strike)
function computePutSpread(f) {
  const spot = n(f.spot);
  const longK = n(f.long_strike);
  const shortK = n(f.short_strike);
  const premium = n(f.premium);
  const dir = f.direction || "Long";
  const isLong = dir === "Long";

  const lo = spot * 0.74;
  const hi = spot * 1.26;

  const pf = (S) => Math.max(0, longK - S) - Math.max(0, shortK - S) + premium;
  const curve = buildCurve(lo, hi, pf);

  const absP = Math.abs(premium);
  const breakeven = isLong ? longK - absP : shortK - absP;
  const maxGain = isLong ? Math.max(longK - shortK + premium, 0) : absP;
  const maxLoss = isLong ? absP : Math.max(longK - shortK - absP, 0);

  return {
    curve, spot, breakevens: [breakeven],
    metrics: [
      { label: "Spot Price", value: fmt(spot), sub: f.asset || "—" },
      { label: dir + " Put Spread", value: `${fmt(longK)} / ${fmt(shortK)}`, sub: f.expiry || "—" },
      { label: "Max Gain", value: fmt(maxGain), sub: isLong ? `Below ${fmt(shortK)}` : "Premium income", positive: true },
      { label: "Max Loss", value: fmt(maxLoss), sub: isLong ? `Above ${fmt(longK)}` : `Below ${fmt(shortK)}`, negative: true },
      { label: "Breakeven", value: fmt(breakeven), sub: `IV: ${f.iv || "—"} · Δ ${f.delta || "—"}` },
    ],
    legs: isLong
      ? [
          { action: "BUY", type: "Put", strike: longK, label: `${fmt(longK)} Put`, color: "#378ADD" },
          { action: "SELL", type: "Put", strike: shortK, label: `${fmt(shortK)} Put`, color: "#ef4444" },
        ]
      : [
          { action: "SELL", type: "Put", strike: shortK, label: `${fmt(shortK)} Put`, color: "#ef4444" },
          { action: "BUY", type: "Put", strike: longK, label: `${fmt(longK)} Put`, color: "#378ADD" },
        ],
    zones: [],
  };
}

// --- STRADDLE ---
function computeStraddle(f) {
  const spot = n(f.spot);
  const atmK = n(f.atm_strike);
  const premium = n(f.total_premium);
  const dir = f.direction || "Long";
  const isLong = dir === "Long";

  const lo = spot * 0.74;
  const hi = spot * 1.26;

  const pf = (S) => {
    const raw = Math.max(0, S - atmK) + Math.max(0, atmK - S);
    return isLong ? raw + premium : premium - raw;
  };
  const curve = buildCurve(lo, hi, pf);

  const absP = Math.abs(premium);
  const beLow = atmK - absP;
  const beHigh = atmK + absP;

  return {
    curve, spot, breakevens: [beLow, beHigh],
    metrics: [
      { label: "Spot Price", value: fmt(spot), sub: f.asset || "—" },
      { label: dir + " Straddle", value: fmt(atmK) + " ATM", sub: f.expiry || "—" },
      ...(isLong
        ? [{ label: "Max Loss", value: fmt(absP), sub: "Premium paid", negative: true }]
        : [{ label: "Max Profit", value: fmt(absP), sub: "Premium received", positive: true }]
      ),
      { label: "BE Low", value: fmt(beLow), sub: isLong ? "Below = profit" : "Below = loss" },
      { label: "BE High", value: fmt(beHigh), sub: isLong ? "Above = profit" : "Above = loss" },
    ],
    legs: isLong
      ? [
          { action: "BUY", type: "Call", strike: atmK, label: `${fmt(atmK)} Call`, color: "#A78BFA" },
          { action: "BUY", type: "Put", strike: atmK, label: `${fmt(atmK)} Put`, color: "#A78BFA" },
        ]
      : [
          { action: "SELL", type: "Call", strike: atmK, label: `${fmt(atmK)} Call`, color: "#ef4444" },
          { action: "SELL", type: "Put", strike: atmK, label: `${fmt(atmK)} Put`, color: "#ef4444" },
        ],
    zones: [],
  };
}

// --- STRANGLE ---
function computeStrangle(f) {
  const spot = n(f.spot);
  const callK = n(f.call_strike);
  const putK = n(f.put_strike);
  const premium = n(f.total_premium);
  const dir = f.direction || "Long";
  const isLong = dir === "Long";

  const lo = spot * 0.74;
  const hi = spot * 1.26;

  const pf = (S) => {
    const raw = Math.max(0, S - callK) + Math.max(0, putK - S);
    return isLong ? raw + premium : premium - raw;
  };
  const curve = buildCurve(lo, hi, pf);

  const absP = Math.abs(premium);
  const beLow = putK - absP;
  const beHigh = callK + absP;

  return {
    curve, spot, breakevens: [beLow, beHigh],
    metrics: [
      { label: "Spot Price", value: fmt(spot), sub: f.asset || "—" },
      { label: dir + " Strangle", value: `${fmt(putK)} / ${fmt(callK)}`, sub: f.expiry || "—" },
      ...(isLong
        ? [{ label: "Max Loss", value: fmt(absP), sub: "Premium paid", negative: true }]
        : [{ label: "Max Profit", value: fmt(absP), sub: "Premium received", positive: true }]
      ),
      { label: "BE Low", value: fmt(beLow), sub: isLong ? "Below = profit" : "Below = loss" },
      { label: "BE High", value: fmt(beHigh), sub: isLong ? "Above = profit" : "Above = loss" },
    ],
    legs: isLong
      ? [
          { action: "BUY", type: "Call", strike: callK, label: `${fmt(callK)} Call`, color: "#34D399" },
          { action: "BUY", type: "Put", strike: putK, label: `${fmt(putK)} Put`, color: "#34D399" },
        ]
      : [
          { action: "SELL", type: "Call", strike: callK, label: `${fmt(callK)} Call`, color: "#ef4444" },
          { action: "SELL", type: "Put", strike: putK, label: `${fmt(putK)} Put`, color: "#ef4444" },
        ],
    zones: [],
  };
}
