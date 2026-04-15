import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { computeTradeAnalysis, generateExecutiveSummary } from "./payoffEngine";
import { computeLendingProposal, fmt as lendFmt } from "./lendingEngine";

// ─── LIGHT THEME TOKENS ───
const THEME = {
  bg: "#FDFCF7",
  bg2: "#F5F4EF",
  bg3: "#F5F4EF",
  border: "#E8E7E2",
  borderLight: "#E8E7E2",
  text: "#1A1A18",
  textMuted: "#8A8A88",
  textDim: "#8A8A88",
  gold: "#FFC32C",
  goldText: "#7A5500",
  positive: "#16a34a",
  negative: "#dc2626",
};

// ─── RICH TEXT TOOLBAR ───
function RichTextToolbar() {
  const exec = (cmd, val) => document.execCommand(cmd, false, val || null);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 10px", background: "#F5F4EF", border: "1px solid #E8E7E2", borderBottom: "none" }}>
      <button type="button" onMouseDown={e => { e.preventDefault(); exec("bold"); }} title="Bold" style={toolbarBtnStyle}><strong>B</strong></button>
      <button type="button" onMouseDown={e => { e.preventDefault(); exec("italic"); }} title="Italic" style={toolbarBtnStyle}><em>I</em></button>
      <button type="button" onMouseDown={e => { e.preventDefault(); exec("underline"); }} title="Underline" style={toolbarBtnStyle}><u>U</u></button>
      <div style={{ width: 1, height: 16, background: "#E8E7E2", margin: "0 4px" }} />
      <button type="button" onMouseDown={e => { e.preventDefault(); exec("formatBlock", "<h3>"); }} title="Heading" style={toolbarBtnStyle}>H</button>
      <button type="button" onMouseDown={e => { e.preventDefault(); exec("formatBlock", "<p>"); }} title="Normal text" style={toolbarBtnStyle}>P</button>
      <div style={{ width: 1, height: 16, background: "#E8E7E2", margin: "0 4px" }} />
      <button type="button" onMouseDown={e => { e.preventDefault(); exec("insertUnorderedList"); }} title="Bullet list" style={toolbarBtnStyle}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="3" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="3" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>
      </button>
      <div style={{ width: 1, height: 16, background: "#E8E7E2", margin: "0 4px" }} />
      <select onChange={e => { exec("fontSize", e.target.value); e.target.value = ""; }} defaultValue="" style={{ fontSize: 11, border: "1px solid #E8E7E2", borderRadius: 2, padding: "2px 6px", fontFamily: "'Poppins',sans-serif", background: "#FDFCF7", color: "#4A4A48", cursor: "pointer" }}>
        <option value="" disabled>Size</option>
        <option value="2">Small</option>
        <option value="3">Normal</option>
        <option value="4">Large</option>
        <option value="5">X-Large</option>
      </select>
    </div>
  );
}

const toolbarBtnStyle = {
  background: "none", border: "none", cursor: "pointer", padding: "4px 8px",
  fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#4A4A48", borderRadius: 4,
};

// ─── SVG PAYOFF CHART (light theme, with zoom / leg toggles / entry override) ───
function PayoffChart({ analysis, accentColor, entryOverride }) {
  const { curve, spot, breakevens, zones, legs, spotQuantity, legPayoffs, pnlAtPrice } = analysis;
  if (!curve || curve.length === 0) return null;

  // ── Axis / zoom state ──────────────────────────────────────────────────
  const allPrices = curve.map(c => c.price);
  const dataMin = Math.min(...allPrices);
  const dataMax = Math.max(...allPrices);
  const defaultPctRange = 30;

  const [xPctRange, setXPctRange] = useState(defaultPctRange);
  const [xIncrement, setXIncrementRaw] = useState("");
  const [fitY, setFitY] = useState(false);
  const [xStartInput, setXStartInput] = useState("");

  const setXIncrement = (v) => setXIncrementRaw(v);

  // Compute visible price range (centred on spot, ±xPctRange%; optionally pin left edge)
  const effectiveSpot = (entryOverride > 0 ? entryOverride : 0) || spot || (dataMin + dataMax) / 2;
  const halfRange = effectiveSpot * (xPctRange / 100);
  const xStartNum = parseFloat(String(xStartInput).replace(/[$,\s]/g, ""));
  const xStartValid = isFinite(xStartNum) && xStartNum > 0 && xStartNum < effectiveSpot;
  const visMin = xStartValid ? xStartNum : Math.max(effectiveSpot - halfRange, dataMin * 0.5);
  const visMax = Math.min(effectiveSpot + halfRange, dataMax * 1.5);

  // ── Leg toggle state ───────────────────────────────────────────────────
  const hasSpotQty = (spotQuantity || 0) > 0;
  const hasLegs = legPayoffs && legPayoffs.length > 0;

  // Net P&L toggle always on; individual legs off by default
  const [showNetPnl, setShowNetPnl] = useState(true);
  const [showLongSpot, setShowLongSpot] = useState(true);
  const [legVisibility, setLegVisibility] = useState(() =>
    (legPayoffs || []).map(() => false)
  );

  // Reset leg visibility when analysis changes (different trade)
  useEffect(() => {
    setLegVisibility((legPayoffs || []).map(() => false));
  }, [analysis]);

  const toggleLeg = (i) => setLegVisibility(v => v.map((b, j) => j === i ? !b : b));

  // ── Entry override ─────────────────────────────────────────────────────
  // Shift net P&L by (spot - entryOverride) * spotQuantity when override is set
  const entryShift = (entryOverride > 0 && spot > 0 && (spotQuantity || 0) > 0)
    ? (spot - entryOverride) * spotQuantity
    : 0;

  const shiftedPnlAtPrice = pnlAtPrice
    ? (p) => pnlAtPrice(p) + entryShift
    : null;

  // ── Build visible curve (re-sample within visible X range) ─────────────
  const STEPS = 300;
  const visXs = Array.from({ length: STEPS + 1 }, (_, i) => visMin + (visMax - visMin) * (i / STEPS));

  const netPnlPoints = visXs.map(x => ({
    price: x,
    pnl: shiftedPnlAtPrice ? shiftedPnlAtPrice(x) : 0,
  }));

  const longSpotPoints = visXs.map(x => ({
    price: x,
    pnl: (x - spot) * (spotQuantity || 1),
  }));

  // Per-leg curves
  const legCurves = (legPayoffs || []).map(leg => ({
    ...leg,
    points: visXs.map(x => ({ price: x, pnl: leg.fn(x) })),
  }));

  // ── Y range ────────────────────────────────────────────────────────────
  const allVisiblePnls = [
    ...(showNetPnl ? netPnlPoints.map(p => p.pnl) : []),
    ...(showLongSpot && hasSpotQty ? longSpotPoints.map(p => p.pnl) : []),
    ...legCurves.filter((_, i) => legVisibility[i]).flatMap(l => l.points.map(p => p.pnl)),
    0,
  ];
  const rawMinPnl = Math.min(...allVisiblePnls);
  const rawMaxPnl = Math.max(...allVisiblePnls);
  const pnlRange = rawMaxPnl - rawMinPnl || 1;
  const pnlPad = pnlRange * 0.12;
  const minPnl = rawMinPnl - pnlPad;
  const maxPnl = rawMaxPnl + pnlPad;

  // ── Chart geometry ─────────────────────────────────────────────────────
  const W = 720, H = 340;
  const PAD = { top: 24, right: 40, bottom: 52, left: 72 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const scaleX = (p) => PAD.left + ((p - visMin) / (visMax - visMin)) * cW;
  const scaleY = (v) => PAD.top + cH - ((v - minPnl) / (maxPnl - minPnl)) * cH;
  const zeroY = scaleY(0);

  // ── X tick marks ───────────────────────────────────────────────────────
  const incNum = parseFloat(xIncrement);
  const xGridLines = (() => {
    if (incNum > 0 && isFinite(incNum)) {
      const ticks = [];
      const start = Math.ceil(visMin / incNum) * incNum;
      for (let v = start; v <= visMax; v += incNum) {
        ticks.push({ x: scaleX(v), val: v });
      }
      return ticks.slice(0, 20); // cap at 20 labels
    }
    const tickCount = 6;
    return Array.from({ length: tickCount + 1 }, (_, i) => {
      const val = visMin + (visMax - visMin) * (i / tickCount);
      return { x: scaleX(val), val };
    });
  })();

  // ── Y grid ─────────────────────────────────────────────────────────────
  const yGridLines = [];
  for (let i = 0; i <= 5; i++) {
    const val = minPnl + (maxPnl - minPnl) * (i / 5);
    yGridLines.push({ y: scaleY(val), val });
  }

  // ── Path builder ───────────────────────────────────────────────────────
  const buildPath = (points) => points.map((p, i) =>
    `${i === 0 ? "M" : "L"}${scaleX(p.price).toFixed(1)},${scaleY(p.pnl).toFixed(1)}`
  ).join(" ");

  const linePath = buildPath(netPnlPoints);
  const spotLinePath = hasSpotQty ? buildPath(longSpotPoints) : "";

  // ── Fill areas (net P&L only) ──────────────────────────────────────────
  const buildFillPath = (filterFn) => {
    const segments = [];
    let inSeg = false, seg = [];
    netPnlPoints.forEach((c, i) => {
      const match = filterFn(c.pnl);
      if (match) {
        if (!inSeg) {
          inSeg = true;
          if (i > 0 && !filterFn(netPnlPoints[i - 1].pnl)) {
            const prev = netPnlPoints[i - 1];
            const ratio = (0 - prev.pnl) / (c.pnl - prev.pnl);
            seg.push({ price: prev.price + ratio * (c.price - prev.price), pnl: 0 });
          }
        }
        seg.push(c);
      } else if (inSeg) {
        const prev = netPnlPoints[i - 1];
        const ratio = (0 - prev.pnl) / (c.pnl - prev.pnl);
        seg.push({ price: prev.price + ratio * (c.price - prev.price), pnl: 0 });
        segments.push([...seg]);
        seg = [];
        inSeg = false;
      }
    });
    if (seg.length) segments.push(seg);
    return segments.map(s => {
      const top = s.map(c => `${scaleX(c.price).toFixed(1)},${scaleY(c.pnl).toFixed(1)}`).join(" L");
      const bot = `${scaleX(s[s.length - 1].price).toFixed(1)},${zeroY.toFixed(1)} L${scaleX(s[0].price).toFixed(1)},${zeroY.toFixed(1)}`;
      return `M${top} L${bot}Z`;
    }).join(" ");
  };

  const greenFill = showNetPnl ? buildFillPath(v => v > 0) : "";
  const redFill = showNetPnl ? buildFillPath(v => v < 0) : "";

  // ── Formatters ─────────────────────────────────────────────────────────
  const fmtAxis = (v) => {
    if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    if (Math.abs(v) < 1 && v !== 0) return v.toFixed(4);
    if (Math.abs(v) < 100) return v.toFixed(2);
    return v.toFixed(0);
  };
  const fmtPrice = (v) => {
    if (v >= 1e3) return `$${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1)}K`;
    if (v < 1 && v > 0) return `$${v.toFixed(4)}`;
    if (v < 100) return `$${v.toFixed(2)}`;
    return `$${v.toFixed(0)}`;
  };
  const fmtStrike = (v) => v >= 1e3
    ? `$${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1)}K`
    : v < 1 && v > 0 ? `$${v.toFixed(4)}`
    : `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // ── Visible breakevens (re-detect in current view) ─────────────────────
  const visBreakevens = (() => {
    const bes = [];
    for (let i = 1; i < netPnlPoints.length; i++) {
      const a = netPnlPoints[i - 1], b = netPnlPoints[i];
      if ((a.pnl < 0 && b.pnl >= 0) || (a.pnl >= 0 && b.pnl < 0)) {
        const ratio = Math.abs(a.pnl) / (Math.abs(a.pnl) + Math.abs(b.pnl));
        bes.push(a.price + ratio * (b.price - a.price));
      }
    }
    return bes;
  })();

  // ── Toggle panel style helpers ────────────────────────────────────────
  const toggleBtnStyle = (active, color) => ({
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "4px 10px", borderRadius: 20, cursor: "pointer", userSelect: "none",
    fontFamily: "'Poppins',sans-serif", fontSize: 10, fontWeight: 500,
    border: `1px solid ${active ? color : "#E8E7E2"}`,
    background: active ? `${color}18` : "transparent",
    color: active ? color : "#8A8A88",
    transition: "all 0.12s",
  });

  const inputStyle = {
    border: "1px solid #E8E7E2", borderRadius: 4, padding: "3px 7px",
    fontFamily: "'Poppins',sans-serif", fontSize: 10, color: "#4A4A48",
    background: "#FDFCF7", width: 60, outline: "none",
  };

  return (
    <div>
      {/* ── Leg toggle panel ── */}
      {!analysis.chartLabel && (hasSpotQty || hasLegs) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10, padding: "0 4px" }}>
          <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8A8A88", display: "flex", alignItems: "center", marginRight: 4 }}>Layers</span>
          {/* Net P&L always present */}
          <button style={toggleBtnStyle(showNetPnl, accentColor || "#1A1A18")} onClick={() => setShowNetPnl(v => !v)}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: showNetPnl ? (accentColor || "#1A1A18") : "#C8C7C2" }} />
            Net P&L
          </button>
          {/* Long Spot — only for strategies that hold spot */}
          {hasSpotQty && !analysis.chartLabel && (
            <button style={toggleBtnStyle(showLongSpot, "#8A8A88")} onClick={() => setShowLongSpot(v => !v)}>
              <span style={{ width: 8, height: 2, background: showLongSpot ? "#8A8A88" : "#C8C7C2", display: "inline-block", borderRadius: 1, marginRight: 2 }} />
              Long Spot
            </button>
          )}
          {/* Individual legs */}
          {(legPayoffs || []).map((leg, i) => (
            <button key={i} style={toggleBtnStyle(legVisibility[i], leg.color)} onClick={() => toggleLeg(i)}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: legVisibility[i] ? leg.color : "#C8C7C2" }} />
              {leg.label}
            </button>
          ))}
        </div>
      )}

      {/* ── SVG chart ── */}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", background: "#FDFCF7" }}>
        <defs>
          <linearGradient id="greenGradLight" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16a34a" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#16a34a" stopOpacity="0.03" />
          </linearGradient>
          <linearGradient id="redGradLight" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#dc2626" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#dc2626" stopOpacity="0.03" />
          </linearGradient>
          <clipPath id="chartClip">
            <rect x={PAD.left} y={PAD.top} width={cW} height={cH} />
          </clipPath>
        </defs>

        {/* Y grid */}
        {yGridLines.map((g, i) => (
          <g key={`yg${i}`}>
            <line x1={PAD.left} y1={g.y} x2={W - PAD.right} y2={g.y} stroke="#E8E7E2" strokeWidth="1" />
            <text x={PAD.left - 10} y={g.y + 4} textAnchor="end" fill="#8A8A88" fontSize="10" fontFamily="'Poppins', sans-serif">
              {fmtAxis(g.val)}
            </text>
          </g>
        ))}

        {/* X grid */}
        {xGridLines.map((g, i) => (
          <g key={`xg${i}`}>
            <line x1={g.x} y1={PAD.top} x2={g.x} y2={H - PAD.bottom} stroke="#E8E7E2" strokeWidth="1" />
            <text x={g.x} y={H - PAD.bottom + 18} textAnchor="middle" fill="#8A8A88" fontSize="10" fontFamily="'Poppins', sans-serif">
              {fmtPrice(g.val)}
            </text>
          </g>
        ))}

        {/* Zero line */}
        {zeroY >= PAD.top && zeroY <= H - PAD.bottom && (
          <line x1={PAD.left} y1={zeroY} x2={W - PAD.right} y2={zeroY}
            stroke="#C8C7C2" strokeWidth="1" strokeDasharray="4,3" />
        )}

        {/* Fill zones (clipped) */}
        <g clipPath="url(#chartClip)">
          <path d={greenFill} fill="url(#greenGradLight)" />
          <path d={redFill} fill="url(#redGradLight)" />
        </g>

        {/* Individual leg lines (clipped, behind net P&L) */}
        <g clipPath="url(#chartClip)">
          {legCurves.map((leg, i) =>
            legVisibility[i] ? (
              <path key={i} d={buildPath(leg.points)} fill="none" stroke={leg.color} strokeWidth="1.5"
                strokeDasharray="5,3" strokeLinecap="round" opacity="0.75" />
            ) : null
          )}
        </g>

        {/* Long Spot reference line */}
        {hasSpotQty && showLongSpot && !analysis.chartLabel && spotLinePath && (
          <g clipPath="url(#chartClip)">
            <path d={spotLinePath} fill="none" stroke="#C8C7C2" strokeWidth="1.5" strokeDasharray="6,4" strokeLinecap="round" />
          </g>
        )}
        {hasSpotQty && showLongSpot && !analysis.chartLabel && (() => {
          const labelPrice = Math.min(visMax * 0.98, dataMax);
          const labelY = scaleY((labelPrice - spot) * (spotQuantity || 1));
          if (labelY < PAD.top || labelY > H - PAD.bottom) return null;
          return (
            <text x={scaleX(labelPrice) - 4} y={labelY - 6}
              textAnchor="end" fill="#8A8A88" fontSize="8" fontFamily="'Poppins', sans-serif" fontWeight="500">
              Long Spot
            </text>
          );
        })()}

        {/* Net P&L strategy line */}
        {showNetPnl && (
          <g clipPath="url(#chartClip)">
            <path d={linePath} fill="none" stroke={accentColor || "#1A1A18"} strokeWidth="2.5"
              strokeLinejoin="round" strokeLinecap="round" />
          </g>
        )}

        {/* Entry override vertical line */}
        {entryOverride > 0 && entryOverride >= visMin && entryOverride <= visMax && (
          <g>
            <line x1={scaleX(entryOverride)} y1={PAD.top} x2={scaleX(entryOverride)} y2={H - PAD.bottom}
              stroke="#FFC32C" strokeWidth="1.5" strokeDasharray="5,4" />
            <rect x={scaleX(entryOverride) - 22} y={H - PAD.bottom + 26} width="44" height="18" rx="2" fill="#FFF8E1" />
            <text x={scaleX(entryOverride)} y={H - PAD.bottom + 38} textAnchor="middle"
              fill="#7A5500" fontSize="9" fontFamily="'Montserrat', sans-serif" fontWeight="600">
              ENTRY
            </text>
          </g>
        )}

        {/* Spot price vertical */}
        {spot >= visMin && spot <= visMax && (
          <g>
            <line x1={scaleX(spot)} y1={PAD.top} x2={scaleX(spot)} y2={H - PAD.bottom}
              stroke="#8A8A88" strokeWidth="1" strokeDasharray="6,4" />
            <rect x={scaleX(spot) - 24} y={H - PAD.bottom + 26} width="48" height="18" rx="2" fill="#F5F4EF" />
            <text x={scaleX(spot)} y={H - PAD.bottom + 38} textAnchor="middle"
              fill="#4A4A48" fontSize="9" fontFamily="'Montserrat', sans-serif" fontWeight="600">
              SPOT
            </text>
          </g>
        )}

        {/* Strike labels */}
        {(() => {
          if (!legs) return null;
          const visible = legs
            .map((leg, i) => ({ ...leg, idx: i }))
            .filter(leg => leg.strike >= visMin && leg.strike <= visMax)
            .sort((a, b) => a.strike - b.strike);
          const labelPositions = [];
          const MIN_GAP = 55;
          visible.forEach(leg => {
            const x = scaleX(leg.strike);
            let y = PAD.top - 6;
            for (const prev of labelPositions) {
              if (Math.abs(x - prev.x) < MIN_GAP) y = Math.min(y, prev.y - 12);
            }
            labelPositions.push({ x, y, leg });
          });
          return labelPositions.map(({ x, y, leg }) => {
            const nearPt = netPnlPoints.reduce((closest, c) =>
              Math.abs(c.price - leg.strike) < Math.abs(closest.price - leg.strike) ? c : closest
            );
            const curveY = showNetPnl ? scaleY(nearPt.pnl) : zeroY;
            return (
              <g key={`leg${leg.idx}`}>
                <line x1={x} y1={PAD.top} x2={x} y2={H - PAD.bottom}
                  stroke={leg.color} strokeWidth="1" strokeDasharray="4,4" opacity="0.5" />
                <circle cx={x} cy={curveY} r="4" fill={leg.color} stroke="#FFFFFF" strokeWidth="2" />
                <text x={x} y={y} textAnchor="middle"
                  fill={leg.color} fontSize="8" fontFamily="'Montserrat', sans-serif" fontWeight="600" opacity="0.9">
                  {leg.action} {fmtStrike(leg.strike)}
                </text>
              </g>
            );
          });
        })()}

        {/* Breakeven dots */}
        {visBreakevens.map((be, i) => (
          be >= visMin && be <= visMax && (
            <g key={`be${i}`}>
              <circle cx={scaleX(be)} cy={zeroY} r="5" fill="none" stroke="#ca8a04" strokeWidth="2" />
              <text x={scaleX(be)} y={zeroY - 12} textAnchor="middle" fill="#ca8a04" fontSize="9" fontFamily="'Montserrat', sans-serif" fontWeight="600">BE</text>
            </g>
          )
        ))}

        <text x={PAD.left - 10} y={12} textAnchor="end" fill="#8A8A88" fontSize="9" fontFamily="'Poppins', sans-serif">P&amp;L</text>
        <text x={W - PAD.right} y={H - PAD.bottom + 18} textAnchor="end" fill="#8A8A88" fontSize="9" fontFamily="'Poppins', sans-serif">Price</text>
      </svg>

      {/* ── Zoom / axis controls ── */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, marginTop: 10, padding: "8px 4px 0", borderTop: "0.5px solid #E8E7E2" }}>
        {/* X range slider */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8A8A88", whiteSpace: "nowrap" }}>
            Range ±{xPctRange}%
          </span>
          <input type="range" min={5} max={80} step={5} value={xPctRange}
            onChange={e => setXPctRange(Number(e.target.value))}
            style={{ width: 100, accentColor: "#FFC32C", cursor: "pointer" }} />
        </div>
        {/* X start price input */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8A8A88", whiteSpace: "nowrap" }}>
            Start $
          </span>
          <input type="text" placeholder={Math.round(visMin)} value={xStartInput}
            onChange={e => setXStartInput(e.target.value)}
            style={{ ...inputStyle, width: 72 }} />
          {xStartInput && (
            <button onClick={() => setXStartInput("")} style={{ border: "none", background: "none", cursor: "pointer", color: "#8A8A88", fontSize: 12, padding: "0 2px", lineHeight: 1 }}>✕</button>
          )}
        </div>
        {/* X increment input */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8A8A88", whiteSpace: "nowrap" }}>
            X Increment
          </span>
          <input type="number" placeholder="auto" value={xIncrement}
            onChange={e => setXIncrement(e.target.value)}
            style={inputStyle} />
        </div>
        {/* Fit Y button */}
        <button
          onClick={() => setFitY(v => !v)}
          style={{
            padding: "4px 10px", borderRadius: 4, cursor: "pointer",
            fontFamily: "'Poppins',sans-serif", fontSize: 10, fontWeight: 500,
            border: `1px solid ${fitY ? "#FFC32C" : "#E8E7E2"}`,
            background: fitY ? "rgba(255,195,44,0.1)" : "transparent",
            color: fitY ? "#7A5500" : "#8A8A88",
          }}
        >
          Fit Y to view
        </button>
      </div>
    </div>
  );
}

// ─── Share helpers ───
function buildShareText(trade, analysis) {
  const lines = [
    `SDM — ${trade.label}`,
    `${trade.category} | ${trade.tag}`,
    "",
    ...analysis.metrics.map(m => `${m.label}: ${m.value} (${m.sub})`),
    "",
    `Generated ${new Date().toLocaleDateString()}`,
    "— SDM Trade Idea Studio",
  ];
  return lines.filter(Boolean).join("\n");
}

const SDM_LOGO_SVG = `data:image/svg+xml,%3C%3Fxml%20version%3D%221.0%22%20encoding%3D%22UTF-8%22%3F%3E%0A%3Csvg%20id%3D%22Camada_1%22%20data-name%3D%22Camada%201%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20xmlns%3Axlink%3D%22http%3A%2F%2Fwww.w3.org%2F1999%2Fxlink%22%20viewBox%3D%220%200%20600%20231.11%22%3E%0A%20%20%3Cdefs%3E%0A%20%20%20%20%3Cstyle%3E%0A%20%20%20%20%20%20.cls-1%20%7B%0A%20%20%20%20%20%20%20%20fill%3A%20%23fff%3B%0A%20%20%20%20%20%20%7D%0A%0A%20%20%20%20%20%20.cls-1%2C%20.cls-2%20%7B%0A%20%20%20%20%20%20%20%20stroke-width%3A%200px%3B%0A%20%20%20%20%20%20%7D%0A%0A%20%20%20%20%20%20.cls-2%20%7B%0A%20%20%20%20%20%20%20%20fill%3A%20%23eec13f%3B%0A%20%20%20%20%20%20%7D%0A%0A%20%20%20%20%20%20.cls-3%20%7B%0A%20%20%20%20%20%20%20%20filter%3A%20url(%23outer-glow-1)%3B%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%3C%2Fstyle%3E%0A%20%20%20%20%3Cfilter%20id%3D%22outer-glow-1%22%20filterUnits%3D%22userSpaceOnUse%22%3E%0A%20%20%20%20%20%20%3CfeOffset%20dx%3D%220%22%20dy%3D%220%22%2F%3E%0A%20%20%20%20%20%20%3CfeGaussianBlur%20result%3D%22blur%22%20stdDeviation%3D%229.89%22%2F%3E%0A%20%20%20%20%20%20%3CfeFlood%20flood-color%3D%22%231851eb%22%20flood-opacity%3D%22.28%22%2F%3E%0A%20%20%20%20%20%20%3CfeComposite%20in2%3D%22blur%22%20operator%3D%22in%22%2F%3E%0A%20%20%20%20%20%20%3CfeComposite%20in%3D%22SourceGraphic%22%2F%3E%0A%20%20%20%20%3C%2Ffilter%3E%0A%20%20%3C%2Fdefs%3E%0A%20%20%3Cg%20class%3D%22cls-3%22%3E%0A%20%20%20%20%3Cpath%20class%3D%22cls-2%22%20d%3D%22M38.49%2C62.99v-12.32c55.08-23.68%2C103.1-23.66%2C158.16%2C0v39.04l-15.32-6.1v-20.36c-35.12-14.65-74.87-20.1-111-5.74l126.04%2C50.13c-.35%2C6.04-1.03%2C11.87-2.04%2C17.34L38.49%2C62.99Z%22%2F%3E%0A%20%20%20%20%3Cpath%20class%3D%22cls-2%22%20d%3D%22M113.53%2C203.69c-31.51-18.3-64.08-42.26-74.37-78.81l20.76%2C7.81c10.7%2C21.74%2C31.47%2C37.38%2C57.79%2C53.27%2C20.35-12.42%2C34.29-22.88%2C44.65-34.23l-123.57-49.15c-.36-5.44-.29-12.72-.29-18.27%2C11.62%2C4.64%2C143.04%2C56.81%2C149.86%2C59.74-15.41%2C27.83-43.18%2C46.57-70.64%2C61.69l-4.18-2.07Z%22%2F%3E%0A%20%20%3C%2Fg%3E%0A%20%20%3Cpath%20class%3D%22cls-1%22%20d%3D%22M295.28%2C159.49c-15.27%2C0-28-3.4-38.87-10.39l6.11-12.22c9.9%2C6.2%2C20.8%2C9.35%2C32.41%2C9.35%2C17.08%2C0%2C20.67-5.43%2C20.67-9.98%2C0-6.7-5.61-8.38-21.39-9.75-29-2.56-34.5-10.23-34.5-23.48%2C0-14.92%2C13.03-23.83%2C34.87-23.83%2C12.94%2C0%2C23.68%2C2.86%2C32.78%2C8.75l-5.56%2C11.72c-7.69-4.73-16.82-7.22-26.51-7.22-12.24%2C0-19.26%2C3.55-19.26%2C9.75%2C0%2C6.69%2C5.61%2C8.37%2C21.39%2C9.74%2C29%2C2.57%2C34.5%2C10.24%2C34.5%2C23.49%2C0%2C10.98-6.35%2C24.06-36.63%2C24.06Z%22%2F%3E%0A%20%20%3Cpolygon%20class%3D%22cls-1%22%20points%3D%22525.36%20158.08%20525.36%20101.02%20523.1%20100.55%20498.16%20158.08%20487.15%20158.08%20462.21%20100.55%20459.95%20101.02%20459.95%20158.08%20444.81%20158.08%20444.81%2080.6%20468.22%2080.6%20493.07%20137.8%20517.79%2080.6%20541.32%2080.6%20541.32%20158.08%20525.36%20158.08%22%2F%3E%0A%20%20%3Cpath%20class%3D%22cls-1%22%20d%3D%22M389.06%2C80.59h-36.04v13.37h34.16c16.42%2C0%2C25.84%2C9.25%2C25.84%2C25.37s-9.42%2C25.37-25.84%2C25.37h-18.49v-39.9h-15.67v53.28h36.04c25.22%2C0%2C40.27-14.48%2C40.27-38.75s-15.06-38.74-40.27-38.74Z%22%2F%3E%0A%3C%2Fsvg%3E`;

function buildStandaloneHtml(reportRef, trade) {
  const styleSheets = Array.from(document.styleSheets);
  let cssText = "";
  styleSheets.forEach(sheet => {
    try { Array.from(sheet.cssRules).forEach(rule => { cssText += rule.cssText + "\n"; }); } catch (e) {}
  });
  let reportHtml = reportRef.current.outerHTML;
  reportHtml = reportHtml.replace(/src="\/sdm-logo[^"]*\.svg"/g, `src="${SDM_LOGO_SVG}"`)
                         .replace(/src="\/sdm-logo[^"]*\.png"/g, `src="${SDM_LOGO_SVG}"`);
  const now = new Date();
  const footerDate = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>SDM — ${trade.label}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #FDFCF7; color: #1A1A18; font-family: 'Poppins', sans-serif; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
.report-actions, .report-share-bar, .btn-edit-thesis, .btn-save-thesis, .noprint { display: none !important; }
${cssText}
@media print {
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  @page { size: A4; margin: 18mm 15mm; }
  body { background: #FDFCF7 !important; padding: 0 !important; }
}
</style>
</head>
<body>
${reportHtml}
</body>
</html>`;
}

async function handleShareLink(reportRef, trade, setLinkText) {
  if (!reportRef.current) return;
  setLinkText("Creating...");
  const fullHtml = buildStandaloneHtml(reportRef, trade);
  try {
    const date = new Date().toISOString().slice(0, 10);
    const slug = (trade.label || "report").replace(/[^a-zA-Z0-9]+/g, "-");
    const filename = `SDM-${slug}-${date}.html`;
    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: fullHtml, filename }),
    });
    const json = await res.json();
    if (!res.ok || !json.url) throw new Error(json.error || "Share failed");
    await navigator.clipboard.writeText(json.url).catch(() => {});
    window.open(json.url, "_blank");
    setLinkText("Link copied ✓");
  } catch (e) {
    console.error("Share error:", e);
    setLinkText("Error — try again");
  }
  setTimeout(() => setLinkText("Link"), 4000);
}

function handleExportPDF(reportRef, trade) {
  if (!reportRef.current) return;
  const styleSheets = Array.from(document.styleSheets);
  let cssText = "";
  styleSheets.forEach(sheet => {
    try { Array.from(sheet.cssRules).forEach(rule => { cssText += rule.cssText + "\n"; }); } catch (e) {}
  });
  let reportHtml = reportRef.current.outerHTML;
  reportHtml = reportHtml.replace(/src="\/sdm-logo[^"]*\.svg"/g, `src="${SDM_LOGO_SVG}"`)
                         .replace(/src="\/sdm-logo[^"]*\.png"/g, `src="${SDM_LOGO_SVG}"`);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Report — SDM Trade Idea Studio</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #FDFCF7; color: #1A1A18; font-family: 'Poppins', sans-serif; margin: 0; padding: 32px 36px; -webkit-font-smoothing: antialiased; }
.report-actions, .report-share-bar, .btn-edit-thesis, .btn-save-thesis, .noprint { display: none !important; }
${cssText}
@media print {
  @page { size: A4; margin: 0 !important; }
  *, *::before, *::after { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { background: #FDFCF7 !important; padding: 12mm !important; }
}
</style>
</head>
<body>${reportHtml}</body>
</html>`;
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); }, 800);
}

function handleShare(platform, trade, analysis) {
  const text = encodeURIComponent(buildShareText(trade, analysis));
  const links = {
    telegram: `https://t.me/share/url?text=${text}`,
    whatsapp: `https://wa.me/?text=${text}`,
    email: `mailto:?subject=${encodeURIComponent(`SDM — ${trade.label}`)}&body=${text}`,
  };
  window.open(links[platform], "_blank");
}

// ─── Styles ───
const sectionLabel = { fontFamily: "'Montserrat',sans-serif", fontSize: 11, letterSpacing: 2, color: "#8A8A88", textTransform: "uppercase", fontWeight: 600 };
const sectionTitle = { fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 16, color: "#1A1A18" };

// ─── SCENARIO PRESET HELPERS ───
function getPresetOptions(tradeType) {
  const base = [
    { value: "key_levels", label: "Key Levels" },
    { value: "standard",   label: "± Moves"   },
  ];
  const third = {
    covered_call:       { value: "upside_focus",  label: "Upside Focus"  },
    collar:             { value: "collar_range",  label: "Collar Range"  },
    call_spread:        { value: "spread_range",  label: "Spread Range"  },
    put_spread:         { value: "spread_range",  label: "Spread Range"  },
    straddle:           { value: "expected_move", label: "Expected Move" },
    strangle:           { value: "expected_move", label: "Expected Move" },
    call_spread_collar: { value: "full_range",    label: "Full Range"    },
    earnings_play:      { value: "event_range",   label: "Event Range"   },
  };
  return third[tradeType] ? [...base, third[tradeType]] : base;
}

function getScenarioPrices(preset, spot, analysis, fieldValues) {
  const legs = analysis.legs || [];
  const strikes = legs.map(l => l.strike).filter(Boolean);
  const breakevens = analysis.breakevens || [];
  const tt = analysis.tradeType;
  const pct = (m) => Math.round(spot * m * 100) / 100;

  if (preset === "standard") {
    return [pct(0.7), pct(0.8), pct(0.9), spot, pct(1.1), pct(1.2), pct(1.3)];
  }

  if (preset === "key_levels") {
    const keySet = new Set([spot, ...strikes, ...breakevens]);
    const sorted = [...keySet].sort((a, b) => a - b);
    const lo = sorted[0], hi = sorted[sorted.length - 1];
    const pad = Math.max((hi - lo) * 0.15, spot * 0.05);
    keySet.add(Math.round(lo - pad));
    keySet.add(Math.round(hi + pad));
    return [...keySet].filter(p => p > 0).sort((a, b) => a - b);
  }

  switch (preset) {
    case "upside_focus": {
      const strike = strikes[0] || pct(1.1);
      const cb = analysis.costBasis || spot * 0.95;
      const be = breakevens[0] || (cb + strike) / 2;
      return [cb * 0.92, cb, be, spot, (spot + strike) / 2, strike, strike * 1.08, strike * 1.15].map(Math.round);
    }
    case "collar_range": {
      const floor = strikes.find(s => s < spot) || pct(0.9);
      const cap   = strikes.find(s => s > spot) || pct(1.1);
      const step  = (cap - floor) / 4;
      return [floor * 0.9, floor, floor + step, floor + 2 * step, floor + 3 * step, cap, cap * 1.08].map(Math.round);
    }
    case "spread_range": {
      if (tt === "put_spread") {
        const longK  = Math.max(...strikes);
        const shortK = Math.min(...strikes);
        const mid    = (longK + shortK) / 2;
        return [shortK * 0.9, shortK, mid, longK, (longK + spot) / 2, spot].map(Math.round);
      }
      const longK  = Math.min(...strikes);
      const shortK = Math.max(...strikes);
      const mid    = (longK + shortK) / 2;
      return [spot, (spot + longK) / 2, longK, mid, shortK, shortK * 1.08].map(Math.round);
    }
    case "expected_move": {
      const ivPct = parseFloat(String(fieldValues.iv || "").replace(/%/g, "")) / 100 || 0.15;
      return [pct(1 - ivPct * 2), pct(1 - ivPct), spot, pct(1 + ivPct), pct(1 + ivPct * 2)].map(Math.round);
    }
    case "full_range": {
      const sorted = [...strikes].sort((a, b) => a - b);
      const lo = sorted[0] || pct(0.85), hi = sorted[sorted.length - 1] || pct(1.15);
      const pad = (hi - lo) * 0.12;
      const mid = (lo + hi) / 2;
      return [lo - pad, lo, (lo + mid) / 2, spot, mid, hi, hi + pad].map(Math.round);
    }
    case "event_range": {
      const movePct = parseFloat(fieldValues.expected_move_pct || "15") / 100;
      return [pct(1 - movePct * 2), pct(1 - movePct), pct(1 - movePct * 0.5), spot, pct(1 + movePct * 0.5), pct(1 + movePct), pct(1 + movePct * 2)].map(Math.round);
    }
    default:
      return [pct(0.7), pct(0.8), pct(0.9), spot, pct(1.1), pct(1.2), pct(1.3)];
  }
}

// ─── MAIN REPORT ───
export default function TradeReport({ trade, fieldValues, loanComponent, onBack, onReset }) {
  const reportRef = useRef(null);
  const editorRef = useRef(null);
  const [linkText, setLinkText] = useState("Link");
  const [execHtml, setExecHtml] = useState(() => {
    const raw = fieldValues.executive_summary;
    if (!raw) return "";
    if (/<[a-z][\s\S]*>/i.test(raw)) {
      // Strip all tags/whitespace — if nothing left, treat as empty
      const text = raw.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, "").trim();
      if (!text) return "";
      return raw;
    }
    return `<p style="margin-bottom:12px">${raw.replace(/\n\n/g, `</p><p style="margin-bottom:12px">`).replace(/\n/g, "<br/>")}</p>`;
  });
  const [execHover, setExecHover] = useState(false);
  const [entryOverrideInput, setEntryOverrideInput] = useState("");
  const [scenarioPreset, setScenarioPreset] = useState("key_levels");
  const [scenarioRows, setScenarioRows] = useState(null);
  useEffect(() => { setScenarioPreset("key_levels"); setScenarioRows(null); }, [trade.id]);

  const entryOverride = (() => {
    const v = parseFloat(String(entryOverrideInput).replace(/[$,\s]/g, ""));
    return isFinite(v) && v > 0 ? v : 0;
  })();

  const handleExecBlur = useCallback(() => {
    if (editorRef.current) setExecHtml(editorRef.current.innerHTML);
  }, []);

  const analysis = useMemo(() => computeTradeAnalysis(trade.id, fieldValues), [trade.id, fieldValues]);

  // Reset scenario rows when preset changes (trade.id reset handled above)
  useEffect(() => {
    if (!analysis || !analysis.spot) return;
    const raw = getScenarioPrices(scenarioPreset, analysis.spot, analysis, fieldValues);
    setScenarioRows(raw.slice(0, 5).map(p => String(Math.round(p))));
  }, [scenarioPreset, trade.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!analysis) return null;

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const execSummary = useMemo(() => generateExecutiveSummary(trade.id, fieldValues), [trade.id, fieldValues]);

  const actionBarBtn = (label, onClick, icon, variant = "default") => (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "8px 16px",
        background: variant === "primary" ? "#1A1A18" : "#FDFCF7",
        color: variant === "primary" ? "#FFFFFF" : "#1A1A18",
        border: variant === "primary" ? "none" : "0.5px solid #E8E7E2",
        borderRadius: 6,
        fontFamily: "'Montserrat',sans-serif", fontSize: 11, fontWeight: 600,
        letterSpacing: 1, textTransform: "uppercase", cursor: "pointer",
        transition: "opacity 0.15s",
      }}
      onMouseEnter={e => e.currentTarget.style.opacity = "0.8"}
      onMouseLeave={e => e.currentTarget.style.opacity = "1"}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div style={{ background: "#FDFCF7", minHeight: "100vh" }}>
      {/* ─── Sticky Action Bar ─── */}
      <div className="noprint" style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "#1A1A18", padding: "10px 48px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "2px solid #FFC32C",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {onBack && (
            <button onClick={onBack} style={{
              background: "none", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6,
              color: "rgba(255,255,255,0.7)", padding: "7px 14px",
              fontFamily: "'Poppins',sans-serif", fontSize: 12, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              Edit
            </button>
          )}
          <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 11, letterSpacing: 2, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>
            {trade.tag}
          </div>
          <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 13, fontWeight: 600, color: "#FFFFFF" }}>
            {trade.label}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => handleShare("telegram", trade, analysis)} style={{ background: "none", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "rgba(255,255,255,0.7)", padding: "7px 14px", fontFamily: "'Poppins',sans-serif", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
            Telegram
          </button>
          <button onClick={() => handleShare("whatsapp", trade, analysis)} style={{ background: "none", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "rgba(255,255,255,0.7)", padding: "7px 14px", fontFamily: "'Poppins',sans-serif", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
            WhatsApp
          </button>
          <button onClick={() => handleShare("email", trade, analysis)} style={{ background: "none", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "rgba(255,255,255,0.7)", padding: "7px 14px", fontFamily: "'Poppins',sans-serif", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 4L12 13 2 4"/></svg>
            Email
          </button>
          <button onClick={() => handleExportPDF(reportRef, trade)} style={{ background: "none", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "rgba(255,255,255,0.7)", padding: "7px 14px", fontFamily: "'Poppins',sans-serif", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            PDF
          </button>
          <button onClick={() => handleShareLink(reportRef, trade, setLinkText)} style={{ background: "#FFC32C", border: "none", borderRadius: 999, color: "#1A1A18", padding: "8px 20px", fontFamily: "'Montserrat',sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer" }}>
            {linkText}
          </button>
          <button onClick={onReset} style={{ background: "none", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "rgba(255,255,255,0.5)", padding: "7px 14px", fontFamily: "'Poppins',sans-serif", fontSize: 12, cursor: "pointer" }}>
            New Trade
          </button>
        </div>
      </div>

      {/* ─── Report Content ─── */}
      <div ref={reportRef} style={{ background: THEME.bg, maxWidth: 860, margin: "0 auto" }}>

        {/* ── MASTHEAD ── */}
        <div style={{ background: THEME.text, padding: "28px 40px 24px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <svg viewBox="62 68 110 106" width="30" height="30" xmlns="http://www.w3.org/2000/svg">
                <path fill="#FFC32C" d="M69.38,81.61v-7.42c33.16-14.24,62.06-14.24,95.18,0v23.5l-9.22-3.66v-12.26c-21.14-8.77-45.06-12.1-66.81-3.46l75.87,30.17c-.2,3.5-.61,6.98-1.23,10.43l-93.8-37.3Z"/>
                <path fill="#FFC32C" d="M114.54,166.32c-18.96-11.01-38.57-25.45-44.76-47.42l12.5,4.69c6.45,13.09,18.95,22.5,34.78,32.07,12.24-7.48,20.63-13.77,26.86-20.6l-74.37-29.54c-.21-3.28-.17-7.66-.17-11,6.98,2.83,86.09,34.19,90.19,35.95-9.28,16.75-25.99,28.02-42.52,37.13l-2.52-1.29Z"/>
              </svg>
              <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 12, fontWeight: 700, color: "#fff", letterSpacing: "0.08em" }}>SECURE DIGITAL MARKETS</span>
              <div style={{ width: 1, height: 26, background: "rgba(255,255,255,0.15)" }} />
              <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 9, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)" }}>Trade Structuring Report</span>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: "0.04em" }}>{dateStr} · SDM Structuring Desk</div>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 9, color: "rgba(255,255,255,0.2)", marginTop: 3 }}>Ref: SDM-{now.getFullYear()}-{String(now.getMonth()+1).padStart(2,"0")}{String(now.getDate()).padStart(2,"0")}-{trade.tag?.replace(/\s+/g, "-").toUpperCase()}</div>
            </div>
          </div>
        </div>
        <div style={{ height: 3, background: "linear-gradient(90deg, #FFC32C 0%, rgba(255,195,44,0.25) 60%, transparent 100%)" }} />

        {/* ── HERO ── */}
        <div style={{ padding: "36px 40px 32px", borderBottom: `0.5px solid ${THEME.border}` }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", background: "rgba(255,195,44,0.12)", borderRadius: 20, fontFamily: "'Montserrat',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: THEME.goldText, marginBottom: 14 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>
            {trade.tag}
          </div>
          <h1 style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 800, fontSize: 30, color: THEME.text, lineHeight: 1.15, letterSpacing: "-0.025em", marginBottom: 8 }}>{trade.label}</h1>
          <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: THEME.textMuted, fontWeight: 300 }}>
            {trade.category} · {trade.description}
          </p>
        </div>

        {/* ── METRICS STRIP ── */}
        <div style={{ background: "#fff", borderBottom: `0.5px solid ${THEME.border}`, display: "grid", gridTemplateColumns: `repeat(${Math.min(analysis.metrics.length, 6)}, 1fr)` }}>
          {analysis.metrics.slice(0, 6).map((m, i, arr) => (
            <div key={i} style={{ padding: "18px 20px", borderRight: i < arr.length - 1 ? `0.5px solid ${THEME.border}` : "none" }}>
              <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: THEME.textMuted, marginBottom: 6 }}>{m.label}</div>
              <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", color: m.positive ? THEME.positive : m.negative ? THEME.negative : THEME.text }}>{m.value}</div>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 10, color: THEME.textMuted, marginTop: 3 }}>{m.sub}</div>
            </div>
          ))}
        </div>

        {/* ── CONTENT ── */}
        <div style={{ padding: "36px 40px" }}>

        {/* ── PAYOFF DIAGRAM (on top) ── */}
        <div style={{ background: "#fff", border: `0.5px solid ${THEME.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 24, pageBreakInside: "avoid" }}>
          <div style={{ padding: "14px 20px", borderBottom: `0.5px solid ${THEME.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: THEME.textMuted }}>{analysis.chartLabel ? "Margin Health vs. Price" : "Payoff Diagram — At Expiry"}</div>
            <div style={{ display: "flex", gap: 16 }}>
              {analysis.chartLabel ? (
                <>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'Poppins',sans-serif", fontSize: 10, color: THEME.textMuted }}><span style={{ width: 10, height: 3, borderRadius: 2, background: "#16a34a", display: "inline-block" }} /> Safe</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'Poppins',sans-serif", fontSize: 10, color: THEME.textMuted }}><span style={{ width: 10, height: 3, borderRadius: 2, background: "#FFC32C", display: "inline-block" }} /> Warning</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'Poppins',sans-serif", fontSize: 10, color: THEME.textMuted }}><span style={{ width: 10, height: 3, borderRadius: 2, background: "#dc2626", display: "inline-block" }} /> Liquidation</span>
                </>
              ) : (
                <>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'Poppins',sans-serif", fontSize: 10, color: THEME.textMuted }}><span style={{ width: 10, height: 3, borderRadius: 2, background: "#EF4444", display: "inline-block" }} /> Loss zone</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'Poppins',sans-serif", fontSize: 10, color: THEME.textMuted }}><span style={{ width: 10, height: 3, borderRadius: 2, background: "#FFC32C", display: "inline-block" }} /> Profit zone</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'Poppins',sans-serif", fontSize: 10, color: THEME.textMuted }}><span style={{ width: 12, height: 0, borderTop: "2px dashed #C8C7C2", display: "inline-block" }} /> Long Spot</span>
                </>
              )}
            </div>
          </div>
          {/* Entry override input row */}
          {(analysis.spotQuantity || 0) > 0 && (
            <div className="noprint" style={{ padding: "8px 20px", borderBottom: `0.5px solid ${THEME.border}`, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: THEME.textMuted }}>
                Entry / Buy Price Override
              </span>
              <input
                type="text"
                placeholder={`Default: spot price`}
                value={entryOverrideInput}
                onChange={e => setEntryOverrideInput(e.target.value)}
                style={{
                  border: `1px solid ${entryOverride > 0 ? "#FFC32C" : THEME.border}`,
                  borderRadius: 4, padding: "4px 10px",
                  fontFamily: "'Poppins',sans-serif", fontSize: 11, color: THEME.text,
                  background: entryOverride > 0 ? "#FFFBEB" : THEME.bg, width: 140, outline: "none",
                }}
              />
              {entryOverride > 0 && (
                <>
                  <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 10, color: "#7A5500" }}>
                    P&L shifted by{" "}
                    {(analysis.spot - entryOverride) * (analysis.spotQuantity || 1) >= 0 ? "+" : ""}
                    {((analysis.spot - entryOverride) * (analysis.spotQuantity || 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                  <button onClick={() => setEntryOverrideInput("")} style={{ background: "none", border: "none", cursor: "pointer", color: THEME.textMuted, fontSize: 11, padding: "2px 4px", fontFamily: "'Poppins',sans-serif" }}>✕ Clear</button>
                </>
              )}
            </div>
          )}
          <div style={{ padding: "20px 20px 12px" }}>
            <PayoffChart analysis={analysis} accentColor={trade.color} entryOverride={entryOverride} />
          </div>
          {analysis.zones && analysis.zones.length > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0 20px 16px", gap: 8 }}>
              {analysis.zones.map((zone, i) => (
                <div key={i} style={{
                  textAlign: "center", padding: "8px 16px", borderRadius: 6, flex: 1,
                  fontFamily: "'Montserrat',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                  background: zone.type === "loss" ? "rgba(220,38,38,0.07)" : zone.type === "capped" ? "rgba(255,195,44,0.1)" : "rgba(22,163,74,0.08)",
                  color: zone.type === "loss" ? "#991b1b" : zone.type === "capped" ? "#7A5500" : "#166534",
                }}>{zone.label}</div>
              ))}
            </div>
          )}
        </div>

        {/* ── TRADE STRUCTURE (below payoff) ── */}
        <div style={{ background: "#fff", border: `0.5px solid ${THEME.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 24, pageBreakInside: "avoid" }}>
          <div style={{ padding: "14px 20px", borderBottom: `0.5px solid ${THEME.border}`, fontFamily: "'Montserrat',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: THEME.textMuted }}>Trade Structure</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ padding: "10px 16px", fontFamily: "'Montserrat',sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: THEME.textMuted, background: THEME.bg2, borderBottom: `0.5px solid ${THEME.border}`, textAlign: "left" }}>Action</th>
                <th style={{ padding: "10px 16px", fontFamily: "'Montserrat',sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: THEME.textMuted, background: THEME.bg2, borderBottom: `0.5px solid ${THEME.border}`, textAlign: "left" }}>Instrument</th>
                <th style={{ padding: "10px 16px", fontFamily: "'Montserrat',sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: THEME.textMuted, background: THEME.bg2, borderBottom: `0.5px solid ${THEME.border}`, textAlign: "left" }}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {analysis.legs.map((leg, i) => (
                <tr key={i}>
                  <td style={{ padding: "10px 16px", fontFamily: "'Montserrat',sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: leg.action.toLowerCase() === "buy" || leg.action.toLowerCase() === "long" ? THEME.positive : THEME.negative, borderBottom: i < analysis.legs.length - 1 ? `0.5px solid ${THEME.border}` : "none" }}>{leg.action}</td>
                  <td style={{ padding: "10px 16px", fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#4A4A48", borderBottom: i < analysis.legs.length - 1 ? `0.5px solid ${THEME.border}` : "none" }}>{leg.type}</td>
                  <td style={{ padding: "10px 16px", fontFamily: "'Poppins',sans-serif", fontSize: 12, color: THEME.text, borderBottom: i < analysis.legs.length - 1 ? `0.5px solid ${THEME.border}` : "none" }}>
                    {leg.label}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── CALL SPREAD COLLAR: Hedged Scenario Table ── */}
        {analysis.tradeType === "call_spread_collar" && analysis.pnlAtPrice && (() => {
          const spot       = analysis.spot || 0;
          const { kp, kc1, kc2 } = analysis;

          // Scenario prices: key structural levels + a few round levels around spot
          const scenarioPrices = new Set();
          [kp * 0.75, kp, spot, kc1, Math.round((kc1 + kc2) / 2), kc2, kc2 * 1.15].forEach(p => scenarioPrices.add(Math.round(p)));
          // Add the actual breakeven from analysis (zone-aware, may be above kc2)
          const be = (analysis.breakevens || [])[0];
          if (be && spot > 0 && Math.abs(be - spot) / spot > 0.01) scenarioPrices.add(Math.round(be));
          const sorted = [...scenarioPrices].sort((a, b) => a - b);

          const fmtP   = (v) => `$${Math.round(v).toLocaleString()}`;
          const fmtPnl = (v) => v >= 0 ? `+$${Math.abs(Math.round(v)).toLocaleString()}` : `-$${Math.abs(Math.round(v)).toLocaleString()}`;
          const fmtPct = (v) => v >= 0 ? `+${v.toFixed(1)}%` : `${v.toFixed(1)}%`;

          const thSt = { padding: "8px 10px", fontFamily: "'Montserrat',sans-serif", fontSize: 7, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: THEME.textMuted, background: THEME.bg2, borderBottom: `0.5px solid ${THEME.border}`, textAlign: "left" };
          const tdSt = { padding: "8px 10px", fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#4A4A48", borderBottom: `0.5px solid ${THEME.border}` };
          const numSt = (v) => ({ ...tdSt, fontFamily: "'Montserrat',sans-serif", fontWeight: 600, color: v > 0 ? THEME.positive : v < 0 ? THEME.negative : THEME.textMuted });

          return (
            <div style={{ background: "#fff", border: `0.5px solid ${THEME.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 24, pageBreakInside: "avoid" }}>
              <div style={{ padding: "14px 20px", borderBottom: `0.5px solid ${THEME.border}`, fontFamily: "'Montserrat',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: THEME.textMuted }}>Scenario Analysis — Hedged P&L at Expiry</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thSt}>Price at Expiry</th>
                    <th style={thSt}>Move vs Entry</th>
                    <th style={thSt}>Spot-only P&L</th>
                    <th style={thSt}>Hedged Strategy P&L</th>
                    <th style={thSt}>Protection Savings vs Spot</th>
                    <th style={thSt}>Opportunity Cost vs Spot</th>
                    <th style={thSt}>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((price, i) => {
                    const hedged   = analysis.pnlAtPrice(price);
                    const spotOnly = analysis.spotPnlAtPrice(price);
                    const delta    = analysis.deltaAtPrice(price);
                    const moveVsSpot = spot > 0 ? ((price - spot) / spot) * 100 : 0;

                    const isEntry  = Math.abs(price - spot) < 1;
                    const isFloor  = Math.abs(price - kp)   < 1;
                    const isCap    = Math.abs(price - kc1)  < 1;
                    const isReEntry = Math.abs(price - kc2) < 1;

                    // Protection savings: hedge is net saving money (below kp region)
                    const inProtected = price <= kp;
                    // Upside cost: cap is biting (above kc1)
                    const inCapped = price >= kc1;

                    // Protection savings: positive delta means hedge outperforms spot (shown below kp)
                    const protSavings = inProtected ? delta : null;
                    // Opportunity cost: negative delta means cap is biting; show as positive cost value
                    const upsideCost  = !inProtected && inCapped ? -delta : null;

                    let outcome = "—";
                    if (isEntry)             outcome = "Current entry";
                    else if (price < kp)     outcome = "Floor active — loss capped vs spot";
                    else if (price === kp)   outcome = "Put strike reached — protection begins below";
                    else if (price < kc1)    outcome = delta >= 0 ? "Net premium benefit" : "Below breakeven — premium not yet recovered";
                    else if (price === kc1)  outcome = "Soft cap begins — gains flattened";
                    else if (price < kc2)    outcome = "Upside flattened — gains resume above re-entry";
                    else if (price === kc2)  outcome = "Re-participation starts";
                    else                     outcome = "Tail upside restored — reparticipating above cap";

                    return (
                      <tr key={i} style={{ background: isEntry ? "rgba(255,195,44,0.06)" : "transparent" }}>
                        <td style={tdSt}>
                          <strong>{fmtP(price)}</strong>
                          {isEntry   && <span style={{ background: "rgba(255,195,44,0.15)", color: THEME.goldText, fontFamily: "'Montserrat',sans-serif", fontSize: 8, fontWeight: 700, padding: "1px 6px", borderRadius: 8, marginLeft: 5 }}>ENTRY</span>}
                          {isFloor   && <span style={{ background: "rgba(74,222,128,0.15)", color: "#15803d", fontFamily: "'Montserrat',sans-serif", fontSize: 8, fontWeight: 700, padding: "1px 6px", borderRadius: 8, marginLeft: 5 }}>FLOOR</span>}
                          {isCap     && <span style={{ background: "rgba(239,68,68,0.12)",  color: "#b91c1c", fontFamily: "'Montserrat',sans-serif", fontSize: 8, fontWeight: 700, padding: "1px 6px", borderRadius: 8, marginLeft: 5 }}>CAP</span>}
                          {isReEntry && <span style={{ background: "rgba(249,115,22,0.15)", color: "#c2410c", fontFamily: "'Montserrat',sans-serif", fontSize: 8, fontWeight: 700, padding: "1px 6px", borderRadius: 8, marginLeft: 5 }}>RE-ENTRY</span>}
                        </td>
                        <td style={tdSt}>{fmtPct(moveVsSpot)}</td>
                        <td style={numSt(spotOnly)}>{fmtPnl(spotOnly)}</td>
                        <td style={numSt(hedged)}>{fmtPnl(hedged)}</td>
                        <td style={{ ...tdSt, fontFamily: "'Montserrat',sans-serif", fontWeight: 600, color: protSavings !== null ? THEME.positive : THEME.textMuted }}>
                          {protSavings !== null ? fmtPnl(protSavings) : "—"}
                        </td>
                        <td style={{ ...tdSt, fontFamily: "'Montserrat',sans-serif", fontWeight: 600, color: upsideCost !== null ? THEME.goldText : THEME.textMuted }}>
                          {upsideCost !== null ? `$${Math.abs(Math.round(upsideCost)).toLocaleString()}` : "—"}
                        </td>
                        <td style={tdSt}>{outcome}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}

        {/* ── SCENARIO ANALYSIS TABLE ── */}
        {analysis.curve && analysis.curve.length > 0 && (() => {
          const spot = analysis.spot || 0;
          const curve = analysis.curve;
          const prices = curve.map(c => c.price);
          const minP = Math.min(...prices);
          const maxP = Math.max(...prices);
          const range = maxP - minP;
          const tt = analysis.tradeType;

          // Derive display rows from state, or initialise from preset (5 rows default)
          const displayRows = (() => {
            if (scenarioRows && scenarioRows.length > 0) return scenarioRows;
            const raw = getScenarioPrices(scenarioPreset, spot, analysis, fieldValues);
            return raw.slice(0, 5).map(p => String(Math.round(p)));
          })();

          // Use analytical pnlAtPrice if available (exact), else interpolate from curve
          const findPnl = analysis.pnlAtPrice ? analysis.pnlAtPrice : (price) => {
            const exact = curve.find(c => Math.abs(c.price - price) < range * 0.005);
            if (exact) return exact.pnl;
            for (let i = 0; i < curve.length - 1; i++) {
              if (curve[i].price <= price && curve[i + 1].price >= price) {
                const ratio = (price - curve[i].price) / (curve[i + 1].price - curve[i].price);
                return curve[i].pnl + ratio * (curve[i + 1].pnl - curve[i].pnl);
              }
            }
            return 0;
          };

          // Format helpers
          const fmtPnl = (v) => v >= 0 ? `+$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `-$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
          const fmtPct = (v) => v >= 0 ? `+${v.toFixed(2)}%` : `${v.toFixed(2)}%`;

          // Categorise strategy type for dynamic column logic
          const DOWNSIDE_STRATEGIES = ["collar", "cash_secured_put", "put_spread", "long_seagull", "call_spread_collar"];
          const YIELD_STRATEGIES = ["covered_call", "call_spread"];
          const isDownside = DOWNSIDE_STRATEGIES.includes(tt);
          const isYield = YIELD_STRATEGIES.includes(tt);
          const hasComparisonCol = isDownside || isYield;
          const comparisonColLabel = isDownside ? "Loss Prevention" : "Strategy vs Spot";

          const costBasis = analysis.costBasis || spot;
          const holdings = parseFloat(fieldValues.holdings) || parseFloat(fieldValues.notional) || parseFloat(fieldValues.contracts) || 1;
          const spotQuantity = analysis.spotQuantity != null ? analysis.spotQuantity : holdings;
          const currentNotional = analysis.currentNotional || (spot * spotQuantity);

          const presetOpts = getPresetOptions(tt);
          const thStyle = { padding: hasComparisonCol ? "8px 10px" : "10px 16px", fontFamily: "'Montserrat',sans-serif", fontSize: hasComparisonCol ? 7 : 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: THEME.textMuted, background: THEME.bg2, borderBottom: `0.5px solid ${THEME.border}`, textAlign: "left" };
          const tdStyle = { padding: hasComparisonCol ? "6px 10px" : "8px 16px", fontFamily: "'Poppins',sans-serif", fontSize: hasComparisonCol ? 11 : 12, color: "#4A4A48", borderBottom: `0.5px solid ${THEME.border}` };

          return (
            <div style={{ background: "#fff", border: `0.5px solid ${THEME.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 24, pageBreakInside: "avoid" }}>
              {/* Header row with title + preset pills */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: `0.5px solid ${THEME.border}` }}>
                <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: THEME.textMuted }}>Scenario Analysis — P&L at Expiry</span>
                <div className="noprint" style={{ display: "flex", gap: 4 }}>
                  {presetOpts.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setScenarioPreset(opt.value)}
                      style={{
                        padding: "3px 10px", borderRadius: 20,
                        fontFamily: "'Montserrat',sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: "0.1em",
                        border: scenarioPreset === opt.value ? "none" : `0.5px solid ${THEME.border}`,
                        background: scenarioPreset === opt.value ? "#1A1A18" : "transparent",
                        color: scenarioPreset === opt.value ? "#fff" : THEME.textMuted,
                        cursor: "pointer", transition: "all 0.15s",
                      }}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, paddingLeft: hasComparisonCol ? 30 : 36 }}>Price at Expiry</th>
                    <th style={thStyle}>Move vs Spot</th>
                    {hasComparisonCol && <th style={thStyle}>Spot-Only P&L</th>}
                    <th style={thStyle}>Strategy P&L</th>
                    {hasComparisonCol && <th style={thStyle}>{comparisonColLabel}</th>}
                    <th style={thStyle}>Return on Notional</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((priceStr, i) => {
                    const price = parseFloat(String(priceStr).replace(/[$,]/g, "")) || 0;
                    const isValid = price > 0;
                    const pnl = isValid ? findPnl(price) : 0;
                    const moveVsSpot = isValid && spot > 0 ? ((price - spot) / spot) * 100 : 0;
                    const notionalReturn = isValid && currentNotional > 0 ? (pnl / currentNotional) * 100 : 0;
                    const isSpot = isValid && spot > 0 && Math.abs(price - spot) < Math.max(range * 0.005, 0.01);
                    const isBe = isValid && (analysis.breakevens || []).some(b => Math.abs(price - b) < Math.max(range * 0.005, 0.01));

                    const spotOnlyPnl = isValid && hasComparisonCol ? (price - costBasis) * spotQuantity : 0;
                    const diff = pnl - spotOnlyPnl;

                    let comparisonValue = 0;
                    let comparisonSubLabel = "";
                    if (isValid && isDownside) {
                      comparisonValue = diff;
                      comparisonSubLabel = diff > 0 ? "Hedge Saving" : diff < 0 ? "Hedge Cost" : "";
                    } else if (isValid && isYield) {
                      comparisonValue = diff;
                      comparisonSubLabel = diff < 0 ? "Foregone Upside" : diff > 0 ? "Premium Gain" : "";
                    }

                    return (
                      <tr key={i} style={{ background: isSpot ? "rgba(255,195,44,0.06)" : "transparent" }}>
                        {/* Editable price cell with delete button */}
                        <td style={{ ...tdStyle, padding: "4px 8px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <button
                              className="noprint"
                              onClick={() => setScenarioRows(r => (r || displayRows).filter((_, idx) => idx !== i))}
                              style={{ flexShrink: 0, border: "none", background: "none", color: THEME.textMuted, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: "0 3px", opacity: 0.4 }}
                            >×</button>
                            <input
                              type="text"
                              value={priceStr}
                              onChange={e => setScenarioRows(r => (r || displayRows).map((v, idx) => idx === i ? e.target.value : v))}
                              placeholder="Enter price…"
                              style={{ width: 90, border: "none", background: "transparent", fontFamily: "'Poppins',sans-serif", fontSize: 12, fontWeight: 700, color: "#1A1A18", outline: "none", padding: "4px 0" }}
                            />
                            {isSpot && <span style={{ background: "rgba(255,195,44,0.15)", color: THEME.goldText, fontFamily: "'Montserrat',sans-serif", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 10, flexShrink: 0 }}>SPOT</span>}
                          </div>
                        </td>
                        <td style={tdStyle}>{isValid ? fmtPct(moveVsSpot) : "—"}</td>
                        {hasComparisonCol && (
                          <td style={{ ...tdStyle, fontFamily: "'Montserrat',sans-serif", fontWeight: 600, color: isValid ? (spotOnlyPnl > 0 ? THEME.positive : spotOnlyPnl < 0 ? THEME.negative : THEME.textMuted) : THEME.textMuted }}>
                            {isValid ? fmtPnl(spotOnlyPnl) : "—"}
                          </td>
                        )}
                        <td style={{ ...tdStyle, fontFamily: "'Montserrat',sans-serif", fontWeight: 600, color: isValid ? (pnl > 0 ? THEME.positive : pnl < 0 ? THEME.negative : THEME.textMuted) : THEME.textMuted }}>
                          {isValid ? (isBe ? "$0 (breakeven)" : fmtPnl(pnl)) : "—"}
                        </td>
                        {hasComparisonCol && (
                          <td style={{ ...tdStyle, fontFamily: "'Montserrat',sans-serif", fontWeight: 600 }}>
                            {isValid ? (
                              <>
                                <span style={{ color: comparisonValue > 0 ? THEME.positive : comparisonValue < 0 ? THEME.negative : THEME.textMuted }}>
                                  {fmtPnl(comparisonValue)}
                                </span>
                                {comparisonSubLabel && (
                                  <span style={{ display: "block", fontSize: 8, fontWeight: 400, color: THEME.textMuted, marginTop: 1 }}>{comparisonSubLabel}</span>
                                )}
                              </>
                            ) : "—"}
                          </td>
                        )}
                        <td style={{ ...tdStyle, fontFamily: "'Montserrat',sans-serif", fontWeight: 600, color: isValid ? (notionalReturn > 0 ? THEME.positive : notionalReturn < 0 ? THEME.negative : THEME.textMuted) : THEME.textMuted }}>
                          {isValid ? (isBe ? "0.00%" : fmtPct(notionalReturn)) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* Add row button */}
              <div className="noprint" style={{ padding: "8px 20px", borderTop: `0.5px solid ${THEME.border}` }}>
                <button
                  onClick={() => setScenarioRows(r => [...(r || displayRows), ""])}
                  style={{ background: "none", border: `0.5px solid ${THEME.border}`, borderRadius: 6, padding: "4px 14px", fontFamily: "'Montserrat',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: THEME.textMuted, cursor: "pointer" }}
                >+ ADD ROW</button>
              </div>
            </div>
          );
        })()}

        {/* ── EXECUTIVE SUMMARY + RISK — two-column ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24, pageBreakInside: "avoid" }}>
          {/* Executive Summary */}
          <div>
            <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: THEME.textMuted, marginBottom: 12, paddingBottom: 8, borderBottom: `0.5px solid ${THEME.border}` }}>Executive Summary</div>
            <div
              onMouseEnter={() => setExecHover(true)}
              onMouseLeave={() => setExecHover(false)}
              style={{ position: "relative" }}
            >
              <div style={{ transition: "opacity 0.15s, max-height 0.15s", opacity: execHover ? 1 : 0, maxHeight: execHover ? 40 : 0, overflow: "hidden", marginBottom: execHover ? 8 : 0 }}>
                <RichTextToolbar />
              </div>
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                dangerouslySetInnerHTML={{ __html: execHtml || (typeof execSummary === "string"
                  ? `<p style="margin-bottom:14px">${execSummary.replace(/\n\n/g, `</p><p style="margin-bottom:14px">`).replace(/\n/g, "<br/>")}</p>`
                  : execSummary) || "" }}
                onBlur={handleExecBlur}
                style={{
                  fontFamily: "'Poppins',sans-serif", fontSize: 13, lineHeight: 1.85, color: "#4A4A48", outline: "none", fontWeight: 300,
                  background: execHover ? THEME.bg : "transparent",
                  border: execHover ? `1px solid ${THEME.border}` : "1px solid transparent",
                  borderRadius: 6, padding: "8px 10px", minHeight: 80,
                  transition: "background 0.15s, border-color 0.15s",
                  cursor: "text",
                }}
              />
            </div>
          </div>

          {/* Key Risk Considerations */}
          <div>
            <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: THEME.textMuted, marginBottom: 12, paddingBottom: 8, borderBottom: `0.5px solid ${THEME.border}` }}>Key Risk Considerations</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {analysis.metrics.filter(m => m.positive).map((m, i) => (
                <div key={`pos-${i}`} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 14px", background: "#f0fdf4", borderRadius: 6 }}>
                  <div style={{ flexShrink: 0, width: 18, height: 18, background: "rgba(22,163,74,0.1)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#4A4A48", lineHeight: 1.6 }}>
                    <strong>{m.label}.</strong> {m.value} — {m.sub}
                  </div>
                </div>
              ))}
              {/* Breakeven */}
              {analysis.breakevens && analysis.breakevens.length > 0 && (
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 14px", background: "rgba(255,195,44,0.06)", border: `1px solid rgba(255,195,44,0.2)`, borderRadius: 6 }}>
                  <div style={{ flexShrink: 0, width: 18, height: 18, background: "rgba(255,195,44,0.15)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#7A5500" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </div>
                  <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#4A4A48", lineHeight: 1.6 }}>
                    <strong>Breakeven.</strong> ${analysis.breakevens.map(b => Math.abs(b) < 1 && b !== 0 ? b.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : b.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })).join(", ")}
                  </div>
                </div>
              )}
              {analysis.metrics.filter(m => m.negative).map((m, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 14px", background: THEME.bg2, borderRadius: 6 }}>
                  <div style={{ flexShrink: 0, width: 18, height: 18, background: "rgba(220,38,38,0.1)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5"><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/><circle cx="12" cy="12" r="10"/></svg>
                  </div>
                  <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#4A4A48", lineHeight: 1.6 }}>
                    <strong>{m.label}.</strong> {m.value} — {m.sub}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Loan Structure */}
        {loanComponent && (() => {
          const loan = computeLendingProposal({
            collateralAsset: loanComponent.collateralAsset,
            collateralUnits: loanComponent.collateralUnits,
            pricePerUnit: loanComponent.pricePerUnit,
            termMonths: loanComponent.termMonths,
            ltv: loanComponent.ltv || "65",
            annualRate: loanComponent.annualRate || "8",
            arrangementFee: loanComponent.arrangementFee || "2",
          });
          if (loan.error) return null;
          const $k = v => `$${typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : v}`;
          return (
            <div style={{ marginBottom: 32, border: "0.5px solid #E8E7E2", borderTop: "3px solid #16a34a", borderRadius: 14, padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>
                <h2 style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 16, color: "#16a34a" }}>Loan Structure</h2>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Gross Loan", value: $k(loan.grossLoan), sub: loan.loanCurrency },
                  { label: "Net Proceeds", value: $k(loan.netLoanProceeds), sub: `After ${lendFmt(loan.arrangementFeeRate * 100)}% fee` },
                  { label: "Quarterly Interest", value: $k(loan.quarterlyPayment), sub: `${(loan.annualRate * 100).toFixed(0)}% p.a.` },
                  { label: "Margin Call", value: $k(loan.marginCallPrice), sub: "70% of FMP trigger" },
                ].map((kpi, i) => (
                  <div key={i} style={{ background: "#F5F4EF", border: "0.5px solid #E8E7E2", borderRadius: 10, padding: "14px 16px" }}>
                    <div style={sectionLabel}>{kpi.label}</div>
                    <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 16, color: "#1A1A18", marginTop: 6 }}>{kpi.value}</div>
                    <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#8A8A88", marginTop: 2 }}>{kpi.sub}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  ["Collateral", `${lendFmt(loan.collateralUnits)} ${loan.collateralAsset}`],
                  ["Collateral Value", `$${lendFmt(loan.collateralValue)}`],
                  ["LTV", `${(loan.ltv * 100).toFixed(0)}%`],
                  ["Term", `${loan.termMonths} months`],
                  ["Arrangement Fee", `$${lendFmt(loan.arrangementFeeAmount)}`],
                  ["Total Interest", `$${lendFmt(loan.totalInterest)}`],
                  ["All-In Cost", `$${lendFmt(loan.totalCost)}`],
                  ["Effective Rate", `${loan.effectiveRate.toFixed(2)}% p.a.`],
                ].map(([label, val], i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "0.5px solid #E8E7E2" }}>
                    <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#8A8A88" }}>{label}</span>
                    <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 12, fontWeight: 600, color: "#1A1A18" }}>{val}</span>
                  </div>
                ))}
              </div>
              {loanComponent.useOfProceeds && (
                <div style={{ marginTop: 16, fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#4A4A48", padding: "12px 16px", background: "#F5F4EF", border: "0.5px solid #E8E7E2", borderRadius: 10 }}>
                  <strong>Use of Proceeds:</strong> {loanComponent.useOfProceeds}
                </div>
              )}
            </div>
          );
        })()}


        </div>{/* /content */}

        {/* ── FOOTER ── */}
        <div style={{ background: THEME.text, padding: "20px 40px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 10, color: "rgba(255,255,255,0.3)", lineHeight: 1.6 }}>
            © {now.getFullYear()} Secure Digital Markets<br/>
            Generated by SDM Trade Studio · sdm.co
          </div>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 9, color: "rgba(255,255,255,0.2)", maxWidth: 440, textAlign: "right", lineHeight: 1.5 }}>
            This report is prepared for informational purposes only for the named recipient and does not constitute financial advice or a binding offer. All pricing is indicative. Digital assets involve substantial risk of loss.
          </div>
        </div>

      </div>
    </div>
  );
}
