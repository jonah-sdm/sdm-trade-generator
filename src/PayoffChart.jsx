// Payoff-at-expiry chart for all derivatives trade types.
// Pure inline SVG — no external libraries.
export default function PayoffChart({ strategy, fields }) {
  const W = 480, H = 240;
  const PL = 52, PR = 16, PT = 28, PB = 32;
  const chartW = W - PL - PR;
  const chartH = H - PT - PB;

  // Parse numeric value from field
  function n(v) {
    if (typeof v === "number") return v || 0;
    if (!v) return 0;
    const cleaned = String(v).replace(/[$,%\s]/g, "").replace(/,/g, "");
    return Number(cleaned) || 0;
  }

  // Compute payoff at price S for each strategy
  function pf(S) {
    switch (strategy) {
      case "call_spread": {
        const longK = n(fields.long_strike), shortK = n(fields.short_strike), prem = n(fields.premium);
        const dir = fields.direction || "Long";
        const raw = Math.max(0, S - longK) - Math.max(0, S - shortK) + prem;
        return dir === "Short" ? -raw : raw;
      }
      case "put_spread": {
        const longK = n(fields.long_strike), shortK = n(fields.short_strike), prem = n(fields.premium);
        const dir = fields.direction || "Long";
        const raw = Math.max(0, longK - S) - Math.max(0, shortK - S) + prem;
        return dir === "Short" ? -raw : raw;
      }
      case "straddle": {
        const atm = n(fields.atm_strike), prem = n(fields.total_premium);
        const raw = Math.max(0, S - atm) + Math.max(0, atm - S);
        return (fields.direction || "Long") === "Long" ? raw + prem : prem - raw;
      }
      case "strangle": {
        const ck = n(fields.call_strike), pk = n(fields.put_strike), prem = n(fields.total_premium);
        const raw = Math.max(0, S - ck) + Math.max(0, pk - S);
        return (fields.direction || "Long") === "Long" ? raw + prem : prem - raw;
      }
      case "covered_call": {
        const costBasis = n(fields.cost_basis), strike = n(fields.strike), prem = n(fields.premium);
        // P&L = (S - costBasis) + premium - max(0, S - strike)
        return (S - costBasis) + prem - Math.max(0, S - strike);
      }
      case "cash_secured_put": {
        const strike = n(fields.strike), prem = n(fields.premium), curPrice = n(fields.current_price);
        // If assigned (S < strike): P&L = S - strike + premium
        // If not assigned (S >= strike): P&L = premium
        return S < strike ? (S - strike + prem) : prem;
      }
      case "leap": {
        const strike = n(fields.strike), prem = n(fields.premium);
        // Long call: P&L = max(0, S - strike) - premium
        return Math.max(0, S - strike) - prem;
      }
      case "collar": {
        const costBasis = n(fields.cost_basis), putK = n(fields.put_strike), callK = n(fields.call_strike);
        const netCost = n(fields.put_premium) - n(fields.call_premium);
        // Spot P&L + long put + short call - net cost
        return (S - costBasis) + Math.max(0, putK - S) - Math.max(0, S - callK) - netCost;
      }
      case "long_seagull": {
        const lp = n(fields.lower_put), lc = n(fields.lower_call), uc = n(fields.upper_call);
        // Short put + long call + short call (zero cost)
        return -Math.max(0, lp - S) + Math.max(0, S - lc) - Math.max(0, S - uc);
      }
      case "wheel": {
        const curPrice = n(fields.current_price), strike = n(fields.current_strike), prem = n(fields.current_premium);
        const phase = fields.current_phase || "Selling Puts";
        if (phase.includes("Put")) {
          // Cash-secured put
          return S < strike ? (S - strike + prem) : prem;
        } else {
          // Covered call phase
          const costBasis = n(fields.cost_basis);
          return (S - costBasis) + prem - Math.max(0, S - strike);
        }
      }
      case "earnings_play": {
        const curPrice = n(fields.current_price), strike = n(fields.strike), prem = n(fields.premium_collected);
        const posType = fields.position_type || "No Position";
        if (posType === "Short Put") return S < strike ? (S - strike + prem) : prem;
        if (posType === "Long Call") return Math.max(0, S - strike) - prem;
        if (posType === "Covered Call") return (S - curPrice) + prem - Math.max(0, S - strike);
        if (posType === "Short Call Spread") {
          const width = curPrice * 0.1;
          return -Math.max(0, S - strike) + Math.max(0, S - (strike + width)) + prem;
        }
        // No Position — show flat
        return 0;
      }
      case "reverse_cash_carry": {
        // Delta-neutral: P&L is flat (funding rate income)
        const spotPrice = n(fields.spot_price), fundRate = n(fields.funding_rate);
        const pv = n(fields.portfolio_value) || (spotPrice * n(fields.btc_amount));
        const dailyIncome = pv * (fundRate / 100) / 365;
        // Show as flat income line with slight slope for visualization
        return dailyIncome * 30; // ~1 month income
      }
      default:
        return 0;
    }
  }

  // Determine spot price and range
  function getSpot() {
    return n(fields.spot) || n(fields.current_price) || n(fields.spot_price) || 0;
  }

  const spot = getSpot();
  if (!spot) return null;

  const lo = spot * 0.74;
  const hi = spot * 1.26;
  const N = 120;
  const xs = Array.from({ length: N }, (_, i) => lo + (hi - lo) * (i / (N - 1)));
  const payoffs = xs.map(pf);

  const rawMin = Math.min(...payoffs);
  const rawMax = Math.max(...payoffs);
  const range = Math.max(rawMax - rawMin, 1);
  const pad = range * 0.15;
  const yLo = rawMin - pad;
  const yHi = rawMax + pad;

  const xp = (x) => PL + ((x - lo) / (hi - lo)) * chartW;
  const yp = (y) => PT + ((yHi - y) / (yHi - yLo)) * chartH;
  const zeroPx = yp(0);

  // Y grid step
  let yStep = 1;
  if (range >= 50000) yStep = 20000;
  else if (range >= 10000) yStep = 5000;
  else if (range >= 5000) yStep = 2000;
  else if (range >= 1000) yStep = 1000;
  else if (range >= 100) yStep = 100;
  else if (range >= 10) yStep = 10;

  const yTickStart = Math.ceil(yLo / yStep) * yStep;
  const yTicks = [];
  for (let v = yTickStart; v <= yHi + yStep * 0.01; v += yStep) {
    yTicks.push(v);
  }

  const fmtX = (v) => {
    if (spot >= 10000) return `$${Math.round(v / 1000)}K`;
    if (spot >= 100) return `$${Math.round(v)}`;
    return `$${v.toFixed(1)}`;
  };

  const fmtY = (v) => {
    if (Math.abs(v) >= 10000) return `$${(v / 1000).toFixed(0)}K`;
    if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}K`;
    return v >= 0 ? `+${Math.round(v)}` : `${Math.round(v)}`;
  };

  const fmtStrike = (v) => {
    if (spot >= 10000) return `$${Math.round(v / 1000)}K`;
    return `$${v}`;
  };

  // Long spot reference polyline
  const spotRefPts = xs.map((x) => {
    const sy = zeroPx - (x - spot) * 0.35 * (chartH / range);
    return `${xp(x).toFixed(1)},${Math.max(PT, Math.min(PT + chartH, sy)).toFixed(1)}`;
  }).join(" ");

  // Fill polygons (profit/loss areas)
  function buildPolygons(positive) {
    const result = [];
    let seg = null;
    for (let i = 0; i < N; i++) {
      const match = positive ? payoffs[i] >= 0 : payoffs[i] < 0;
      const px = xp(xs[i]);
      const py = yp(payoffs[i]);
      if (match) {
        if (!seg) seg = { pts: [], firstX: px };
        seg.pts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
        seg.lastX = px;
      } else if (seg) {
        result.push(
          <polygon
            key={result.length}
            points={[...seg.pts, `${seg.lastX.toFixed(1)},${zeroPx.toFixed(1)}`, `${seg.firstX.toFixed(1)},${zeroPx.toFixed(1)}`].join(" ")}
            fill={positive ? "rgba(29,158,117,0.13)" : "rgba(226,75,74,0.10)"}
            stroke="none"
          />
        );
        seg = null;
      }
    }
    if (seg) {
      result.push(
        <polygon
          key={result.length}
          points={[...seg.pts, `${seg.lastX.toFixed(1)},${zeroPx.toFixed(1)}`, `${seg.firstX.toFixed(1)},${zeroPx.toFixed(1)}`].join(" ")}
          fill={positive ? "rgba(29,158,117,0.13)" : "rgba(226,75,74,0.10)"}
          stroke="none"
        />
      );
    }
    return result;
  }

  // Payoff line segments colored by profit/loss
  function buildPayoffLine() {
    const segments = [];
    let seg = null;
    for (let i = 0; i < N; i++) {
      const pos = payoffs[i] >= 0;
      const pt = `${xp(xs[i]).toFixed(1)},${yp(payoffs[i]).toFixed(1)}`;
      if (!seg || seg.pos !== pos) {
        if (seg) segments.push(seg);
        seg = { pos, pts: [pt] };
      } else {
        seg.pts.push(pt);
      }
    }
    if (seg) segments.push(seg);
    return segments.map((s, i) => (
      <polyline
        key={i}
        points={s.pts.join(" ")}
        stroke={s.pos ? "#1D9E75" : "#E24B4A"}
        strokeWidth="2.5"
        strokeLinejoin="round"
        fill="none"
      />
    ));
  }

  // Strike annotations per strategy
  const annotations = [];
  switch (strategy) {
    case "call_spread":
    case "put_spread":
      if (n(fields.long_strike)) annotations.push({ strike: n(fields.long_strike), color: "#378ADD", label: "Long" });
      if (n(fields.short_strike)) annotations.push({ strike: n(fields.short_strike), color: "#E24B4A", label: "Short" });
      break;
    case "straddle":
      if (n(fields.atm_strike)) annotations.push({ strike: n(fields.atm_strike), color: "#378ADD", label: "ATM" });
      break;
    case "strangle":
      if (n(fields.call_strike)) annotations.push({ strike: n(fields.call_strike), color: "#378ADD", label: "Call" });
      if (n(fields.put_strike)) annotations.push({ strike: n(fields.put_strike), color: "#E24B4A", label: "Put" });
      break;
    case "covered_call":
      if (n(fields.strike)) annotations.push({ strike: n(fields.strike), color: "#E24B4A", label: "Call" });
      if (n(fields.cost_basis)) annotations.push({ strike: n(fields.cost_basis), color: "#8A8A88", label: "Basis" });
      break;
    case "cash_secured_put":
      if (n(fields.strike)) annotations.push({ strike: n(fields.strike), color: "#378ADD", label: "Put" });
      break;
    case "leap":
      if (n(fields.strike)) annotations.push({ strike: n(fields.strike), color: "#378ADD", label: "Strike" });
      break;
    case "collar":
      if (n(fields.put_strike)) annotations.push({ strike: n(fields.put_strike), color: "#378ADD", label: "Put" });
      if (n(fields.call_strike)) annotations.push({ strike: n(fields.call_strike), color: "#E24B4A", label: "Call" });
      break;
    case "long_seagull":
      if (n(fields.lower_put)) annotations.push({ strike: n(fields.lower_put), color: "#E24B4A", label: "Put" });
      if (n(fields.lower_call)) annotations.push({ strike: n(fields.lower_call), color: "#1D9E75", label: "Long C" });
      if (n(fields.upper_call)) annotations.push({ strike: n(fields.upper_call), color: "#E24B4A", label: "Short C" });
      break;
    case "wheel":
      if (n(fields.current_strike)) annotations.push({ strike: n(fields.current_strike), color: "#378ADD", label: "Strike" });
      if (n(fields.cost_basis)) annotations.push({ strike: n(fields.cost_basis), color: "#8A8A88", label: "Basis" });
      break;
    case "earnings_play":
      if (n(fields.strike)) annotations.push({ strike: n(fields.strike), color: "#FBBF24", label: "Strike" });
      break;
    default:
      break;
  }

  // Breakeven calculation
  let breakevens = [];
  for (let i = 1; i < N; i++) {
    if ((payoffs[i - 1] < 0 && payoffs[i] >= 0) || (payoffs[i - 1] >= 0 && payoffs[i] < 0)) {
      // Linear interpolation
      const ratio = Math.abs(payoffs[i - 1]) / (Math.abs(payoffs[i - 1]) + Math.abs(payoffs[i]));
      const bePrice = xs[i - 1] + ratio * (xs[i] - xs[i - 1]);
      breakevens.push(bePrice);
    }
  }

  const spotPnl = pf(spot);
  const zeroInRange = zeroPx >= PT && zeroPx <= PT + chartH;
  const xTicks = Array.from({ length: 6 }, (_, i) => lo + (hi - lo) * (i / 5));

  // Strategy label for chart header
  const strategyLabels = {
    call_spread: "Call Spread", put_spread: "Put Spread", straddle: "Straddle", strangle: "Strangle",
    covered_call: "Covered Call", cash_secured_put: "Cash-Secured Put", leap: "Long Call (LEAP)",
    collar: "Protective Collar", long_seagull: "Long Seagull", wheel: "The Wheel",
    earnings_play: "Event Risk", reverse_cash_carry: "Cash & Carry",
  };

  return (
    <div style={{
      marginBottom: 24,
      background: "#F5F4EF",
      border: "0.5px solid #E8E7E2",
      borderRadius: 14,
      overflow: "hidden",
      maxWidth: 480,
    }}>
      <div style={{
        padding: "8px 14px 6px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: "0.5px solid #E8E7E2",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8A8A88" strokeWidth="2">
            <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
          </svg>
          <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", color: "#8A8A88", textTransform: "uppercase" }}>
            Payoff at Expiry
          </span>
        </div>
        <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 10, color: "#8A8A88" }}>
          {strategyLabels[strategy] || strategy} {fields.direction ? `· ${fields.direction}` : ""}
        </span>
      </div>

      <div style={{ padding: "6px 8px 8px" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>

          {/* Long spot reference */}
          {strategy !== "reverse_cash_carry" && (
            <>
              <polyline points={spotRefPts} stroke="rgba(140,140,140,0.3)" strokeWidth="1" strokeDasharray="5,4" fill="none" />
              <text x={W - PR - 2} y={PT + 10} fontSize="9" fill="rgba(128,128,128,0.4)" textAnchor="end">Long spot</text>
            </>
          )}

          {/* Grid lines + axis labels */}
          {yTicks.map(v => {
            const py = yp(v);
            if (py < PT - 1 || py > PT + chartH + 1) return null;
            return (
              <g key={v}>
                <line x1={PL} y1={py} x2={W - PR} y2={py} stroke="rgba(128,128,128,0.10)" strokeWidth="0.5" />
                <text x={PL - 4} y={py + 3.5} fontSize="9.5" fill="rgba(128,128,128,0.7)" textAnchor="end" fontFamily="'Poppins',sans-serif">{fmtY(v)}</text>
              </g>
            );
          })}
          {xTicks.map((x, i) => (
            <text key={i} x={xp(x)} y={H - PB + 15} fontSize="9.5" fill="rgba(128,128,128,0.7)" textAnchor="middle" fontFamily="'Poppins',sans-serif">{fmtX(x)}</text>
          ))}

          {/* Profit fill */}
          {buildPolygons(true)}

          {/* Loss fill */}
          {buildPolygons(false)}

          {/* Strike annotation lines */}
          {annotations.map((ann, i) => {
            const ax = xp(ann.strike);
            if (ax < PL || ax > W - PR) return null;
            return (
              <g key={i}>
                <line x1={ax} y1={PT} x2={ax} y2={H - PB} stroke={ann.color} strokeWidth="1" strokeDasharray="4,3" opacity="0.7" />
                <text x={ax} y={PT - 4} fontSize="9" fontWeight="600" fill={ann.color} textAnchor="middle" fontFamily="'Poppins',sans-serif">{fmtStrike(ann.strike)}</text>
              </g>
            );
          })}

          {/* Spot vertical */}
          <line x1={xp(spot)} y1={PT} x2={xp(spot)} y2={H - PB} stroke="rgba(128,128,128,0.25)" strokeWidth="1" strokeDasharray="3,3" />

          {/* Zero line */}
          {zeroInRange && (
            <line x1={PL} y1={zeroPx} x2={W - PR} y2={zeroPx} stroke="rgba(128,128,128,0.18)" strokeWidth="0.8" />
          )}

          {/* Payoff line */}
          {buildPayoffLine()}

          {/* Breakeven dots */}
          {breakevens.map((be, i) => (
            <g key={`be-${i}`}>
              <circle cx={xp(be)} cy={zeroPx} r="5" fill="white" stroke="#D4A017" strokeWidth="2" />
              <text x={xp(be)} y={zeroPx - 9} fontSize="9" fontWeight="bold" fill="#D4A017" textAnchor="middle" fontFamily="'Poppins',sans-serif">BE</text>
              <text x={xp(be)} y={zeroPx + 16} fontSize="8" fill="#D4A017" textAnchor="middle" fontFamily="'Poppins',sans-serif">{fmtStrike(Math.round(be))}</text>
            </g>
          ))}

          {/* Spot dot */}
          <circle cx={xp(spot)} cy={yp(spotPnl)} r="4" fill={spotPnl >= 0 ? "#1D9E75" : "#E24B4A"} stroke="white" strokeWidth="1.5" />

        </svg>
      </div>
    </div>
  );
}
