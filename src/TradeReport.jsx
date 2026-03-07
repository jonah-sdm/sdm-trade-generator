import { useMemo, useRef, useState, useCallback } from "react";
import { computeTradeAnalysis, generateExecutiveSummary } from "./payoffEngine";

// ─── RICH TEXT TOOLBAR ───
function RichTextToolbar() {
  const exec = (cmd, val) => {
    document.execCommand(cmd, false, val || null);
  };

  return (
    <div className="rt-toolbar">
      <button type="button" className="rt-btn rt-btn-bold" onMouseDown={e => { e.preventDefault(); exec("bold"); }} title="Bold">B</button>
      <button type="button" className="rt-btn rt-btn-italic" onMouseDown={e => { e.preventDefault(); exec("italic"); }} title="Italic"><em>I</em></button>
      <button type="button" className="rt-btn rt-btn-underline" onMouseDown={e => { e.preventDefault(); exec("underline"); }} title="Underline"><u>U</u></button>
      <div className="rt-sep" />
      <button type="button" className="rt-btn" onMouseDown={e => { e.preventDefault(); exec("formatBlock", "<h3>"); }} title="Heading">H</button>
      <button type="button" className="rt-btn rt-btn-sm" onMouseDown={e => { e.preventDefault(); exec("formatBlock", "<p>"); }} title="Normal text">P</button>
      <div className="rt-sep" />
      <button type="button" className="rt-btn" onMouseDown={e => { e.preventDefault(); exec("insertUnorderedList"); }} title="Bullet list">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="3" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="3" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>
      </button>
      <button type="button" className="rt-btn" onMouseDown={e => { e.preventDefault(); exec("insertOrderedList"); }} title="Numbered list">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="2" y="8" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text><text x="2" y="14" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text><text x="2" y="20" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text></svg>
      </button>
      <div className="rt-sep" />
      <select className="rt-select" onChange={e => { exec("fontSize", e.target.value); e.target.value = ""; }} defaultValue="">
        <option value="" disabled>Size</option>
        <option value="2">Small</option>
        <option value="3">Normal</option>
        <option value="4">Large</option>
        <option value="5">X-Large</option>
      </select>
    </div>
  );
}

// ─── SVG PAYOFF CHART ───
function PayoffChart({ analysis, accentColor }) {
  const { curve, spot, breakevens, zones, legs } = analysis;
  if (!curve || curve.length === 0) return null;

  const W = 720, H = 340;
  const PAD = { top: 24, right: 40, bottom: 52, left: 72 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const prices = curve.map(c => c.price);
  const pnls = curve.map(c => c.pnl);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const minPnl = Math.min(...pnls, 0);
  const maxPnl = Math.max(...pnls, 0);
  const pnlRange = maxPnl - minPnl || 1;
  const pnlPad = pnlRange * 0.1;

  const scaleX = (p) => PAD.left + ((p - minPrice) / (maxPrice - minPrice)) * cW;
  const scaleY = (v) => PAD.top + cH - ((v - (minPnl - pnlPad)) / (pnlRange + pnlPad * 2)) * cH;

  const zeroY = scaleY(0);

  const linePath = curve.map((c, i) =>
    `${i === 0 ? "M" : "L"}${scaleX(c.price).toFixed(1)},${scaleY(c.pnl).toFixed(1)}`
  ).join(" ");

  // Spot reference line — "Long BTC" diagonal showing what holding spot would return
  // Derive multiplier from the trade curve slope near the spot price
  const spotMultiplier = (() => {
    if (!spot || spot <= 0) return 0;
    // Find the curve slope near spot by sampling two close points
    const nearSpot = curve.filter(c => Math.abs(c.price - spot) < (maxPrice - minPrice) * 0.1);
    if (nearSpot.length < 2) {
      // Fallback: use first and last to estimate scale
      const first = curve[0], last = curve[curve.length - 1];
      if (last.price === first.price) return 1;
      return Math.abs(last.pnl - first.pnl) / (last.price - first.price);
    }
    // Use max absolute P&L to normalize — the spot line should look proportional
    const absPnl = Math.max(Math.abs(maxPnl), Math.abs(minPnl));
    const priceRange = maxPrice - minPrice;
    return priceRange > 0 ? absPnl / (priceRange * 0.5) : 1;
  })();

  const spotLinePath = spot > 0 ? `M${scaleX(minPrice).toFixed(1)},${scaleY((minPrice - spot) * spotMultiplier).toFixed(1)} L${scaleX(maxPrice).toFixed(1)},${scaleY((maxPrice - spot) * spotMultiplier).toFixed(1)}` : "";

  const buildFillPath = (filterFn) => {
    const segments = [];
    let inSegment = false;
    let segPoints = [];

    curve.forEach((c, i) => {
      const above = filterFn(c.pnl);
      if (above) {
        if (!inSegment) {
          inSegment = true;
          if (i > 0 && !filterFn(curve[i - 1].pnl)) {
            const prev = curve[i - 1];
            const ratio = (0 - prev.pnl) / (c.pnl - prev.pnl);
            const crossPrice = prev.price + ratio * (c.price - prev.price);
            segPoints.push({ price: crossPrice, pnl: 0 });
          }
        }
        segPoints.push(c);
      } else if (inSegment) {
        const prev = curve[i - 1];
        const ratio = (0 - prev.pnl) / (c.pnl - prev.pnl);
        const crossPrice = prev.price + ratio * (c.price - prev.price);
        segPoints.push({ price: crossPrice, pnl: 0 });
        segments.push([...segPoints]);
        segPoints = [];
        inSegment = false;
      }
    });
    if (segPoints.length > 0) segments.push(segPoints);

    return segments.map(seg => {
      const top = seg.map(c => `${scaleX(c.price).toFixed(1)},${scaleY(c.pnl).toFixed(1)}`).join(" L");
      const bottom = `${scaleX(seg[seg.length - 1].price).toFixed(1)},${zeroY.toFixed(1)} L${scaleX(seg[0].price).toFixed(1)},${zeroY.toFixed(1)}`;
      return `M${top} L${bottom}Z`;
    }).join(" ");
  };

  const greenFill = buildFillPath(pnl => pnl > 0);
  const redFill = buildFillPath(pnl => pnl < 0);

  const yTicks = 5;
  const yGridLines = [];
  for (let i = 0; i <= yTicks; i++) {
    const val = (minPnl - pnlPad) + (pnlRange + pnlPad * 2) * (i / yTicks);
    yGridLines.push({ y: scaleY(val), val });
  }

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

  const xTicks = 6;
  const xGridLines = [];
  for (let i = 0; i <= xTicks; i++) {
    const val = minPrice + (maxPrice - minPrice) * (i / xTicks);
    xGridLines.push({ x: scaleX(val), val });
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="payoff-svg">
      <defs>
        <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00C896" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#00C896" stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id="redGrad" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#FF453A" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#FF453A" stopOpacity="0.05" />
        </linearGradient>
      </defs>

      {yGridLines.map((g, i) => (
        <g key={`yg${i}`}>
          <line x1={PAD.left} y1={g.y} x2={W - PAD.right} y2={g.y}
            stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          <text x={PAD.left - 10} y={g.y + 4} textAnchor="end"
            fill="rgba(255,255,255,0.35)" fontSize="10" fontFamily="'Sora', sans-serif">
            {fmtAxis(g.val)}
          </text>
        </g>
      ))}
      {xGridLines.map((g, i) => (
        <g key={`xg${i}`}>
          <line x1={g.x} y1={PAD.top} x2={g.x} y2={H - PAD.bottom}
            stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          <text x={g.x} y={H - PAD.bottom + 18} textAnchor="middle"
            fill="rgba(255,255,255,0.35)" fontSize="10" fontFamily="'Sora', sans-serif">
            {fmtPrice(g.val)}
          </text>
        </g>
      ))}

      <line x1={PAD.left} y1={zeroY} x2={W - PAD.right} y2={zeroY}
        stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="4,3" />

      <path d={greenFill} fill="url(#greenGrad)" />
      <path d={redFill} fill="url(#redGrad)" />

      {/* Long BTC spot reference line — dashed diagonal */}
      {spotLinePath && !analysis.chartLabel && (
        <g>
          <path d={spotLinePath} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5"
            strokeDasharray="6,4" strokeLinecap="round" />
          <text x={scaleX(maxPrice) - 4} y={scaleY((maxPrice - spot) * spotMultiplier) - 6}
            textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize="8" fontFamily="'Sora', sans-serif" fontWeight="500">
            Long Spot
          </text>
        </g>
      )}

      {/* Strategy payoff line */}
      <path d={linePath} fill="none" stroke={accentColor || "#00C2FF"} strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round" />


      {/* Spot price vertical */}
      {spot > minPrice && spot < maxPrice && (
        <g>
          <line x1={scaleX(spot)} y1={PAD.top} x2={scaleX(spot)} y2={H - PAD.bottom}
            stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="6,4" />
          <rect x={scaleX(spot) - 24} y={H - PAD.bottom + 26} width="48" height="18" rx="4"
            fill="rgba(255,255,255,0.08)" />
          <text x={scaleX(spot)} y={H - PAD.bottom + 38} textAnchor="middle"
            fill="rgba(255,255,255,0.6)" fontSize="9" fontFamily="'Sora', sans-serif" fontWeight="600">
            SPOT
          </text>
        </g>
      )}

      {/* Strike labels + dots on curve */}
      {(() => {
        if (!legs) return null;
        const visible = legs
          .map((leg, i) => ({ ...leg, idx: i }))
          .filter(leg => leg.strike > minPrice && leg.strike < maxPrice)
          .sort((a, b) => a.strike - b.strike);
        // Stagger labels that are too close together
        const labelPositions = [];
        const MIN_GAP = 55; // min px between labels
        visible.forEach(leg => {
          const x = scaleX(leg.strike);
          let y = PAD.top - 6;
          for (const prev of labelPositions) {
            if (Math.abs(x - prev.x) < MIN_GAP) {
              y = Math.min(y, prev.y - 12);
            }
          }
          labelPositions.push({ x, y, leg });
        });
        return labelPositions.map(({ x, y, leg }) => {
          const curveY = scaleY(
            curve.reduce((closest, c) =>
              Math.abs(c.price - leg.strike) < Math.abs(closest.price - leg.strike) ? c : closest
            ).pnl
          );
          const fmtStrike = leg.strike >= 1e3 ? `$${(leg.strike / 1e3).toFixed(leg.strike >= 1e4 ? 0 : 1)}K` : leg.strike < 1 && leg.strike > 0 ? `$${leg.strike.toFixed(4)}` : `$${leg.strike.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          return (
            <g key={`leg${leg.idx}`}>
              <line x1={x} y1={PAD.top} x2={x} y2={H - PAD.bottom}
                stroke={leg.color} strokeWidth="1" strokeDasharray="4,4" opacity="0.4" />
              <circle cx={x} cy={curveY} r="4" fill={leg.color} stroke="#111118" strokeWidth="2" />
              <text x={x} y={y} textAnchor="middle"
                fill={leg.color} fontSize="8" fontFamily="'Sora', sans-serif" fontWeight="600" opacity="0.85">
                {leg.action} {fmtStrike}
              </text>
            </g>
          );
        });
      })()}

      {breakevens && breakevens.map((be, i) => (
        be > minPrice && be < maxPrice && (
          <g key={`be${i}`}>
            <circle cx={scaleX(be)} cy={zeroY} r="5" fill="none"
              stroke="#ca8a04" strokeWidth="2" />
            <text x={scaleX(be)} y={zeroY - 12} textAnchor="middle"
              fill="#ca8a04" fontSize="9" fontFamily="'Sora', sans-serif" fontWeight="600">
              BE
            </text>
          </g>
        )
      ))}

      <text x={PAD.left - 10} y={12} textAnchor="end"
        fill="rgba(255,255,255,0.25)" fontSize="9" fontFamily="'Sora', sans-serif">P&L</text>
      <text x={W - PAD.right} y={H - PAD.bottom + 18} textAnchor="end"
        fill="rgba(255,255,255,0.25)" fontSize="9" fontFamily="'Sora', sans-serif">Price</text>
    </svg>
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
    try {
      Array.from(sheet.cssRules).forEach(rule => { cssText += rule.cssText + "\n"; });
    } catch (e) { /* cross-origin sheets */ }
  });

  // Replace local image paths with inline data URI so logo works in standalone HTML
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
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Sora:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #0a0a0f; --bg2: #111118; --bg3: #16161f; --bg4: #1c1c28;
  --border: rgba(255,255,255,0.06); --border-light: rgba(255,255,255,0.12);
  --text: #f0f0f5; --text-muted: #8a8a9a; --text-dim: #55556a;
  --amber: #F5A623; --gold: var(--amber); --gold-dark: #D4910A;
  --font-display: 'Sora', sans-serif; --font-body: 'Sora', 'Inter', sans-serif; --font-mono: 'JetBrains Mono', monospace;
  --font-serif: 'Sora', -apple-system, sans-serif;
}
body { background: var(--bg); color: var(--text); font-family: var(--font-body); margin: 0; padding: 32px; -webkit-font-smoothing: antialiased; }
.report-actions, .report-share-bar, .btn-edit-thesis, .btn-save-thesis, .btn-back { display: none !important; }
${cssText}

/* Hide print-only headers from standalone view */
.print-running-header, .print-running-footer { display: none !important; }

/* Standalone share header */
.share-header {
  display: flex !important;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0 14px;
  margin: 0 0 28px;
  border-bottom: 1px solid var(--amber);
}
.share-header img { height: 28px; width: auto; display: block; }
.share-header-right {
  text-align: right;
  font-family: 'Sora', 'Inter', sans-serif;
  font-size: 11px;
  color: #8a8a9a;
  line-height: 1.5;
}
.share-header-right .doc-name {
  color: #f0f0f5;
  font-weight: 500;
  font-size: 12px;
}

/* ── Print / PDF page layout ── */
@media print {
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
  @page {
    size: A4;
    margin: 18mm 15mm 18mm 15mm;
  }
  body { background: var(--bg) !important; padding: 0 !important; }
  .report { gap: 16px !important; }
  .report-section { break-inside: avoid; page-break-inside: avoid; }
  .report-kpis { break-inside: avoid; page-break-inside: avoid; }
  .legs-table { break-inside: avoid; page-break-inside: avoid; }
  .risk-grid { break-inside: avoid; page-break-inside: avoid; }
  .chart-container { break-inside: avoid; page-break-inside: avoid; }
  .exec-summary { break-inside: auto; }
  .kpi-card { break-inside: avoid; page-break-inside: avoid; }
  .report-disclaimer { break-before: avoid; }
}
</style>
</head>
<body>
<div class="share-header">
  <img src="${SDM_LOGO_SVG}" alt="SDM" />
  <div class="share-header-right">
    <div class="doc-name">${trade.label}</div>
    <div>${footerDate} &middot; ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
  </div>
</div>
${reportHtml}
</body>
</html>`;
}

async function handleShareLink(reportRef, trade, setLinkText) {
  if (!reportRef.current) return;

  setLinkText("Saving...");
  const fullHtml = buildStandaloneHtml(reportRef, trade);
  const filename = `SDM-${trade.label.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.html`;

  try {
    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: fullHtml, filename }),
    });

    if (!res.ok) throw new Error("Upload failed");
    const { url } = await res.json();

    await navigator.clipboard.writeText(url);
    setLinkText("Link copied!");
    window.open(url, "_blank");
  } catch (e) {
    // Fallback: download as file
    const blob = new Blob([fullHtml], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setLinkText("Downloaded!");
  }

  setTimeout(() => setLinkText("Link"), 3000);
}

function handleExportPDF(reportRef, trade) {
  if (!reportRef.current) return;

  // Build a clean standalone page that looks exactly like the web view
  const styleSheets = Array.from(document.styleSheets);
  let cssText = "";
  styleSheets.forEach(sheet => {
    try {
      Array.from(sheet.cssRules).forEach(rule => { cssText += rule.cssText + "\n"; });
    } catch (e) { /* cross-origin */ }
  });

  let reportHtml = reportRef.current.outerHTML;
  reportHtml = reportHtml.replace(/src="\/sdm-logo[^"]*\.svg"/g, `src="${SDM_LOGO_SVG}"`)
                         .replace(/src="\/sdm-logo[^"]*\.png"/g, `src="${SDM_LOGO_SVG}"`);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Report — SDM Trade Idea Studio</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Sora:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #0a0a0f; --bg2: #111118; --bg3: #16161f; --bg4: #1c1c28;
  --border: rgba(255,255,255,0.06); --border-light: rgba(255,255,255,0.12);
  --text: #f0f0f5; --text-muted: #8a8a9a; --text-dim: #55556a;
  --amber: #F5A623; --gold: var(--amber); --gold-dark: #D4910A;
  --font-display: 'Sora', sans-serif; --font-body: 'Sora', 'Inter', sans-serif; --font-mono: 'JetBrains Mono', monospace;
  --font-serif: 'Sora', -apple-system, sans-serif;
}
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html {
  background: var(--bg);
}
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
  margin: 0;
  padding: 32px 36px;
  -webkit-font-smoothing: antialiased;
  max-width: 100vw;
  overflow-x: hidden;
}
.report { max-width: 100% !important; }
.report-actions, .report-share-bar, .btn-edit-thesis, .btn-save-thesis, .btn-back,
.print-running-header, .print-running-footer { display: none !important; }
${cssText}
/* Override any print styles from app CSS */
@media print {
  @page { size: A4; margin: 0 !important; }
  *, *::before, *::after { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
  html { background: #0a0a0f !important; }
  body {
    background: #0a0a0f !important;
    padding: 12mm 12mm 12mm 12mm !important;
    width: 100% !important;
    max-width: 100% !important;
    overflow: hidden !important;
    -webkit-print-color-adjust: exact !important;
  }
  .report { max-width: 100% !important; gap: 28px !important; }
  .report-section { break-inside: avoid; }
  .report-kpis { break-inside: avoid; }
  .chart-container { break-inside: avoid; }
  .legs-table { break-inside: avoid; }
  .risk-grid { break-inside: avoid; }
  /* Hide app noise */
  .header, .footer, .breadcrumb { display: none !important; }
  .main::before, .main::after, body::after { display: none !important; }
}
</style>
</head>
<body>${reportHtml}</body>
</html>`;

  const printWindow = window.open("", "_blank");
  printWindow.document.write(html);
  printWindow.document.close();
  // Wait for fonts/images to load, then print
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
    }, 400);
  };
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

// ─── MAIN REPORT ───
export default function TradeReport({ trade, fieldValues, onBack, onReset }) {
  const reportRef = useRef(null);
  const editorRef = useRef(null);
  const [linkText, setLinkText] = useState("Link");
  const [execHtml, setExecHtml] = useState(() => {
    const raw = fieldValues.executive_summary;
    if (!raw) return "";
    // If already contains HTML tags, use as-is
    if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
    return `<p>${raw.replace(/\n/g, "</p><p>")}</p>`;
  });
  const [execEditing, setExecEditing] = useState(false);

  const handleEditorSave = useCallback(() => {
    if (editorRef.current) {
      setExecHtml(editorRef.current.innerHTML);
    }
    setExecEditing(false);
  }, []);

  const analysis = useMemo(
    () => computeTradeAnalysis(trade.id, fieldValues),
    [trade.id, fieldValues]
  );

  if (!analysis) return null;

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const execSummary = useMemo(
    () => generateExecutiveSummary(trade.id, fieldValues),
    [trade.id, fieldValues]
  );

  return (
    <div className="report" ref={reportRef} style={{ "--accent": trade.color }}>
      {/* Print-only running header & footer */}
      <div className="print-running-header">
        <div className="print-header-left">
          <img src="/sdm-logo-full.svg" alt="Secure Digital Markets" className="print-header-logo" />
        </div>
        <div className="print-header-right">{dateStr}</div>
      </div>
      <div className="print-running-footer">
        <span>Confidential — Internal Use Only</span>
        <span>Secure Digital Markets — Trade Idea Studio</span>
      </div>

      {/* Report Header */}
      <div className="report-header reveal-section reveal-delay-1">
        <div className="report-header-left">
          <div className="report-badge">
            <span className="report-icon">{trade.icon}</span>
            <span className="report-tag">{trade.tag}</span>
          </div>
          <h1 className="report-title">{trade.label}</h1>
          <p className="report-category">{trade.category} — {trade.description}</p>
        </div>
      </div>

      {/* Executive Summary — editable */}
      <div className="report-section exec-summary reveal-section reveal-delay-2">
        <div className="section-header">
          <h2 className="section-title">Executive Summary</h2>
          {!execEditing && (
            <button className="btn-edit-thesis" onClick={() => setExecEditing(true)}>
              Edit
            </button>
          )}
        </div>
        {execEditing ? (
          <div className="thesis-edit">
            <RichTextToolbar />
            <div
              ref={editorRef}
              className="rt-editor"
              contentEditable
              suppressContentEditableWarning
              dangerouslySetInnerHTML={{ __html: execHtml || "" }}
            />
            <button className="btn-save-thesis" onClick={handleEditorSave}>
              Save
            </button>
          </div>
        ) : (
          <div className="exec-content">
            {execHtml ? (
              <div className="exec-text exec-user-text" dangerouslySetInnerHTML={{ __html: execHtml }} />
            ) : (
              <>
                <p className="exec-text">{execSummary}</p>
                <p className="thesis-placeholder" style={{ marginTop: 12 }}>Click "Edit" to write your own executive summary instead...</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="report-kpis reveal-section reveal-delay-3">
        {analysis.metrics.map((m, i) => (
          <div key={i} className={`kpi-card ${m.positive ? "kpi-positive" : ""} ${m.negative ? "kpi-negative" : ""}`}>
            <div className="kpi-label">{m.label}</div>
            <div className="kpi-value">{m.value}</div>
            <div className="kpi-sub">{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Payoff Diagram */}
      <div className="report-section reveal-section reveal-delay-4">
        <div className="section-header">
          <h2 className="section-title">{analysis.chartLabel ? "Margin Health vs. Price" : "Payoff at Expiry"}</h2>
          <div className="section-legend">
            {analysis.chartLabel ? (
              <>
                <span className="legend-item"><span className="legend-dot legend-green" />Safe</span>
                <span className="legend-item"><span className="legend-dot legend-yellow" />Warning</span>
                <span className="legend-item"><span className="legend-dot legend-red" />Liquidation</span>
              </>
            ) : (
              <>
                <span className="legend-item"><span className="legend-dot legend-green" />Profit</span>
                <span className="legend-item"><span className="legend-dot legend-red" />Loss</span>
                <span className="legend-item"><span className="legend-dot legend-yellow" />Breakeven</span>
                <span className="legend-item"><span className="legend-line" />Long Spot</span>
              </>
            )}
          </div>
        </div>
        <div className="chart-container">
          <PayoffChart analysis={analysis} accentColor={trade.color} />
        </div>
      </div>

      {/* Trade Structure */}
      <div className="report-section reveal-section reveal-delay-5">
        <h2 className="section-title">Trade Structure</h2>
        <div className="legs-table">
          <div className="legs-header">
            <span className="leg-col-action">Action</span>
            <span className="leg-col-type">Instrument</span>
            <span className="leg-col-detail">Detail</span>
          </div>
          {analysis.legs.map((leg, i) => (
            <div key={i} className="leg-row">
              <span className={`leg-action leg-action-${leg.action.toLowerCase()}`}>{leg.action}</span>
              <span className="leg-type">{leg.type}</span>
              <span className="leg-detail">{leg.label}</span>
              <span className="leg-color-bar" style={{ background: leg.color }} />
            </div>
          ))}
        </div>
      </div>

      {/* Risk Summary */}
      <div className="report-section reveal-section reveal-delay-6">
        <h2 className="section-title">Risk Summary</h2>
        <div className="risk-grid">
          {analysis.breakevens && analysis.breakevens.length > 0 && (
            <div className="risk-item">
              <span className="risk-label">Breakeven</span>
              <span className="risk-value">${analysis.breakevens.map(b => Math.abs(b) < 1 && b !== 0 ? b.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : b.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })).join(", ")}</span>
            </div>
          )}
          {analysis.metrics.filter(m => m.negative).map((m, i) => (
            <div key={i} className="risk-item risk-item-warn">
              <span className="risk-label">{m.label}</span>
              <span className="risk-value">{m.value}</span>
              <span className="risk-sub">{m.sub}</span>
            </div>
          ))}
          {analysis.metrics.filter(m => m.positive).map((m, i) => (
            <div key={i} className="risk-item risk-item-good">
              <span className="risk-label">{m.label}</span>
              <span className="risk-value">{m.value}</span>
              <span className="risk-sub">{m.sub}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Share & Export Bar */}
      <div className="report-share-bar">
        <img src="/sdm-logo-full.svg" alt="SDM" className="share-bar-logo" />
        <div className="share-group">
          <span className="share-label">Share</span>
          <button className="share-btn share-telegram" onClick={() => handleShare("telegram", trade, analysis)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
            Telegram
          </button>
          <button className="share-btn share-whatsapp" onClick={() => handleShare("whatsapp", trade, analysis)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
            WhatsApp
          </button>
          <button className="share-btn share-email" onClick={() => handleShare("email", trade, analysis)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 4L12 13 2 4"/></svg>
            Email
          </button>
          <button className="share-btn share-pdf" onClick={() => handleExportPDF(reportRef, trade)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            PDF
          </button>
        </div>
        <div className="share-group">
          <button className="btn-export-pdf" onClick={() => handleShareLink(reportRef, trade, setLinkText)}>
            {linkText}
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="report-actions">
        {onBack && <button className="btn-back" onClick={onBack}>← Edit Parameters</button>}
        <button className="btn-new-trade" onClick={onReset}>New Trade</button>
      </div>

      {/* Disclaimer */}
      <div className="report-disclaimer">
        SDM — Internal Use Only. This document does not constitute investment advice.
        Generated {dateStr} at {timeStr}.
      </div>

      {/* Branded Footer / CTA */}
      <div className="report-footer-cta">
        <div className="footer-cta-divider" />
        <div className="footer-cta-content">
          <img src="/sdm-logo-full.svg" alt="Secure Digital Markets" className="footer-cta-logo" />
          <p className="footer-cta-tagline">The Institutional Choice for <span className="tagline-gold">Digital</span> <span className="tagline-blue">Asset</span> Trading</p>
          <div className="footer-cta-contacts">
            <a href="mailto:sales@sdm.co" className="footer-cta-link">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 4L12 13 2 4"/></svg>
              sales@sdm.co
            </a>
            <a href="https://twitter.com/SD_Markets" target="_blank" rel="noopener noreferrer" className="footer-cta-link">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              @SD_Markets
            </a>
            <a href="https://t.me/SecureDigitalMarkets" target="_blank" rel="noopener noreferrer" className="footer-cta-link">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              Telegram
            </a>
          </div>
        </div>
        <p className="footer-cta-legal">Confidential — For intended recipient only. Not investment advice.</p>
      </div>
    </div>
  );
}
