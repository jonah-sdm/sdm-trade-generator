// Compact payoff-at-expiry chart for call/put spreads, straddles, and strangles.
// Pure inline SVG — no external libraries. viewBox 300×148.
export default function PayoffChart({ strategy, direction, spot, long_strike, short_strike, atm_strike, call_strike, put_strike, premium }) {
  const W = 300, H = 148;
  const PL = 38, PR = 8, PT = 22, PB = 24;
  const chartW = W - PL - PR; // 254
  const chartH = H - PT - PB; // 102

  function pf(S) {
    if (strategy === "call_spread") {
      return Math.max(0, S - long_strike) - Math.max(0, S - short_strike) + premium;
    }
    if (strategy === "put_spread") {
      return Math.max(0, long_strike - S) - Math.max(0, short_strike - S) + premium;
    }
    if (strategy === "straddle") {
      const raw = Math.max(0, S - atm_strike) + Math.max(0, atm_strike - S);
      return direction === "Long" ? raw + premium : premium - raw;
    }
    if (strategy === "strangle") {
      const raw = Math.max(0, S - call_strike) + Math.max(0, put_strike - S);
      return direction === "Long" ? raw + premium : premium - raw;
    }
    return 0;
  }

  const lo = spot * 0.74;
  const hi = spot * 1.26;
  const N = 100;
  const xs = Array.from({ length: N }, (_, i) => lo + (hi - lo) * (i / (N - 1)));
  const payoffs = xs.map(pf);

  const rawMin = Math.min(...payoffs);
  const rawMax = Math.max(...payoffs);
  const range = Math.max(rawMax - rawMin, 1);
  const pad = range * 0.12;
  const yLo = rawMin - pad;
  const yHi = rawMax + pad;

  const xp = (x) => PL + ((x - lo) / (hi - lo)) * chartW;
  const yp = (y) => PT + ((yHi - y) / (yHi - yLo)) * chartH;
  const zeroPx = yp(0);

  // Y grid step
  let yStep = 1;
  if (range >= 10000) yStep = 10000;
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
    if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(0)}K`;
    return v >= 0 ? `+${Math.round(v)}` : `${Math.round(v)}`;
  };

  const fmtStrike = (v) => {
    if (spot >= 10000) return `$${Math.round(v / 1000)}K`;
    return `$${v}`;
  };

  // Layer 1: long spot reference polyline
  const spotRefPts = xs.map((x) => {
    const sy = zeroPx - (x - spot) * 0.35 * (chartH / range);
    return `${xp(x).toFixed(1)},${sy.toFixed(1)}`;
  }).join(" ");

  // Layers 3 & 4: fill polygons
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
            fill={positive ? "rgba(29,158,117,0.15)" : "rgba(226,75,74,0.12)"}
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
          fill={positive ? "rgba(29,158,117,0.15)" : "rgba(226,75,74,0.12)"}
          stroke="none"
        />
      );
    }
    return result;
  }

  // Layer 8: payoff line segments (color changes at zero)
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
        strokeWidth="2"
        strokeLinejoin="round"
        fill="none"
      />
    ));
  }

  // Strike annotations
  const annotations = [];
  if (strategy === "call_spread" || strategy === "put_spread") {
    annotations.push({ strike: long_strike, color: "#378ADD" });
    annotations.push({ strike: short_strike, color: "#E24B4A" });
  } else if (strategy === "straddle") {
    annotations.push({ strike: atm_strike, color: "#378ADD" });
  } else if (strategy === "strangle") {
    const color = direction === "Long" ? "#378ADD" : "#E24B4A";
    annotations.push({ strike: call_strike, color });
    annotations.push({ strike: put_strike, color });
  }

  // Breakeven dot (spreads only, not straddle/strangle)
  let breakeven = null;
  if (strategy === "call_spread" || strategy === "put_spread") {
    const absP = Math.abs(premium);
    if (strategy === "call_spread") {
      breakeven = direction === "Long" ? long_strike + absP : short_strike + absP;
    } else {
      breakeven = direction === "Long" ? long_strike - absP : short_strike - absP;
    }
    if (breakeven < lo || breakeven > hi) breakeven = null;
  }

  const spotPnl = pf(spot);
  const zeroInRange = zeroPx >= PT && zeroPx <= PT + chartH;
  const xTicks = Array.from({ length: 5 }, (_, i) => lo + (hi - lo) * (i / 4));

  return (
    <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", padding: 0, background: "transparent" }}>
      <svg viewBox="0 0 300 148" width="100%" style={{ display: "block" }}>

        {/* Layer 1: Long spot reference */}
        <polyline points={spotRefPts} stroke="rgba(140,140,140,0.4)" strokeWidth="1.2" strokeDasharray="5,4" fill="none" />
        <text x={W - PR - 2} y={PT + 8} fontSize="8" fill="rgba(128,128,128,0.5)" textAnchor="end">Long spot</text>

        {/* Layer 2: Grid lines + axis labels */}
        {yTicks.map(v => {
          const py = yp(v);
          if (py < PT - 1 || py > PT + chartH + 1) return null;
          return (
            <g key={v}>
              <line x1={PL} y1={py} x2={W - PR} y2={py} stroke="rgba(128,128,128,0.12)" strokeWidth="0.5" />
              <text x={PL - 3} y={py + 3} fontSize="9" fill="rgba(128,128,128,0.8)" textAnchor="end">{fmtY(v)}</text>
            </g>
          );
        })}
        {xTicks.map((x, i) => (
          <text key={i} x={xp(x)} y={H - PB + 13} fontSize="9" fill="rgba(128,128,128,0.8)" textAnchor="middle">{fmtX(x)}</text>
        ))}

        {/* Layer 3: Profit fill */}
        {buildPolygons(true)}

        {/* Layer 4: Loss fill */}
        {buildPolygons(false)}

        {/* Layer 5: Strike annotation lines */}
        {annotations.map((ann, i) => {
          const ax = xp(ann.strike);
          if (ax < PL || ax > W - PR) return null;
          return (
            <g key={i}>
              <line x1={ax} y1={PT} x2={ax} y2={H - PB} stroke={ann.color} strokeWidth="1" strokeDasharray="3,3" opacity="0.8" />
              <text x={ax} y={PT - 3} fontSize="8" fontWeight="bold" fill={ann.color} textAnchor="middle">{fmtStrike(ann.strike)}</text>
            </g>
          );
        })}

        {/* Layer 6: Spot vertical */}
        <line x1={xp(spot)} y1={PT} x2={xp(spot)} y2={H - PB} stroke="rgba(128,128,128,0.3)" strokeWidth="1" strokeDasharray="3,3" />

        {/* Layer 7: Zero line */}
        {zeroInRange && (
          <line x1={PL} y1={zeroPx} x2={W - PR} y2={zeroPx} stroke="rgba(128,128,128,0.2)" strokeWidth="0.8" />
        )}

        {/* Layer 8: Payoff line */}
        {buildPayoffLine()}

        {/* Layer 9: Breakeven dot */}
        {breakeven !== null && (
          <g>
            <circle cx={xp(breakeven)} cy={zeroPx} r="4.5" fill="white" stroke="#D4A017" strokeWidth="2" />
            <text x={xp(breakeven)} y={zeroPx - 8} fontSize="8" fontWeight="bold" fill="#D4A017" textAnchor="middle">BE</text>
          </g>
        )}

        {/* Layer 10: Spot dot */}
        <circle cx={xp(spot)} cy={yp(spotPnl)} r="3.5" fill={spotPnl >= 0 ? "#1D9E75" : "#E24B4A"} stroke="white" strokeWidth="1.5" />

      </svg>
    </div>
  );
}
