import { useMemo, useRef, useState, useCallback } from "react";
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

// ─── SVG PAYOFF CHART (light theme) ───
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

  const spotMultiplier = (() => {
    if (!spot || spot <= 0) return 0;
    const nearSpot = curve.filter(c => Math.abs(c.price - spot) < (maxPrice - minPrice) * 0.1);
    if (nearSpot.length < 2) {
      const first = curve[0], last = curve[curve.length - 1];
      if (last.price === first.price) return 1;
      return Math.abs(last.pnl - first.pnl) / (last.price - first.price);
    }
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
      </defs>

      {yGridLines.map((g, i) => (
        <g key={`yg${i}`}>
          <line x1={PAD.left} y1={g.y} x2={W - PAD.right} y2={g.y} stroke="#E8E7E2" strokeWidth="1" />
          <text x={PAD.left - 10} y={g.y + 4} textAnchor="end" fill="#8A8A88" fontSize="10" fontFamily="'Poppins', sans-serif">
            {fmtAxis(g.val)}
          </text>
        </g>
      ))}
      {xGridLines.map((g, i) => (
        <g key={`xg${i}`}>
          <line x1={g.x} y1={PAD.top} x2={g.x} y2={H - PAD.bottom} stroke="#E8E7E2" strokeWidth="1" />
          <text x={g.x} y={H - PAD.bottom + 18} textAnchor="middle" fill="#8A8A88" fontSize="10" fontFamily="'Poppins', sans-serif">
            {fmtPrice(g.val)}
          </text>
        </g>
      ))}

      <line x1={PAD.left} y1={zeroY} x2={W - PAD.right} y2={zeroY}
        stroke="#C8C7C2" strokeWidth="1" strokeDasharray="4,3" />

      <path d={greenFill} fill="url(#greenGradLight)" />
      <path d={redFill} fill="url(#redGradLight)" />

      {/* Long Spot reference line */}
      {spotLinePath && !analysis.chartLabel && (
        <g>
          <path d={spotLinePath} fill="none" stroke="#C8C7C2" strokeWidth="1.5" strokeDasharray="6,4" strokeLinecap="round" />
          <text x={scaleX(maxPrice) - 4} y={scaleY((maxPrice - spot) * spotMultiplier) - 6}
            textAnchor="end" fill="#8A8A88" fontSize="8" fontFamily="'Poppins', sans-serif" fontWeight="500">
            Long Spot
          </text>
        </g>
      )}

      {/* Strategy payoff line */}
      <path d={linePath} fill="none" stroke={accentColor || "#1A1A18"} strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round" />

      {/* Spot price vertical */}
      {spot > minPrice && spot < maxPrice && (
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
          .filter(leg => leg.strike > minPrice && leg.strike < maxPrice)
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
          const curveY = scaleY(
            curve.reduce((closest, c) =>
              Math.abs(c.price - leg.strike) < Math.abs(closest.price - leg.strike) ? c : closest
            ).pnl
          );
          const fmtStrike = leg.strike >= 1e3
            ? `$${(leg.strike / 1e3).toFixed(leg.strike >= 1e4 ? 0 : 1)}K`
            : leg.strike < 1 && leg.strike > 0
              ? `$${leg.strike.toFixed(4)}`
              : `$${leg.strike.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          return (
            <g key={`leg${leg.idx}`}>
              <line x1={x} y1={PAD.top} x2={x} y2={H - PAD.bottom}
                stroke={leg.color} strokeWidth="1" strokeDasharray="4,4" opacity="0.5" />
              <circle cx={x} cy={curveY} r="4" fill={leg.color} stroke="#FFFFFF" strokeWidth="2" />
              <text x={x} y={y} textAnchor="middle"
                fill={leg.color} fontSize="8" fontFamily="'Montserrat', sans-serif" fontWeight="600" opacity="0.9">
                {leg.action} {fmtStrike}
              </text>
            </g>
          );
        });
      })()}

      {breakevens && breakevens.map((be, i) => (
        be > minPrice && be < maxPrice && (
          <g key={`be${i}`}>
            <circle cx={scaleX(be)} cy={zeroY} r="5" fill="none" stroke="#ca8a04" strokeWidth="2" />
            <text x={scaleX(be)} y={zeroY - 12} textAnchor="middle" fill="#ca8a04" fontSize="9" fontFamily="'Montserrat', sans-serif" fontWeight="600">BE</text>
          </g>
        )
      ))}

      <text x={PAD.left - 10} y={12} textAnchor="end" fill="#8A8A88" fontSize="9" fontFamily="'Poppins', sans-serif">P&amp;L</text>
      <text x={W - PAD.right} y={H - PAD.bottom + 18} textAnchor="end" fill="#8A8A88" fontSize="9" fontFamily="'Poppins', sans-serif">Price</text>
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

  const handleExecBlur = useCallback(() => {
    if (editorRef.current) setExecHtml(editorRef.current.innerHTML);
  }, []);

  const analysis = useMemo(() => computeTradeAnalysis(trade.id, fieldValues), [trade.id, fieldValues]);
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
          <div style={{ padding: "20px 20px 12px" }}>
            <PayoffChart analysis={analysis} accentColor={trade.color} />
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
          // Add breakeven if distinctly different from spot (> 1% gap)
          const be = spot - (analysis.netPremPerUnit || 0);
          if (spot > 0 && Math.abs(be - spot) / spot > 0.01) scenarioPrices.add(Math.round(be));
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
        {analysis.curve && analysis.curve.length > 0 && analysis.tradeType !== "call_spread_collar" && (() => {
          const spot = analysis.spot || 0;
          const curve = analysis.curve;
          const prices = curve.map(c => c.price);
          const minP = Math.min(...prices);
          const maxP = Math.max(...prices);
          const range = maxP - minP;
          // Pick structured scenario prices: key levels + percentage moves from spot
          const scenarioPrices = new Set();
          // Key levels: spot, breakevens, strike (if applicable)
          if (spot > 0) scenarioPrices.add(spot);
          (analysis.breakevens || []).forEach(b => { if (b > minP && b < maxP) scenarioPrices.add(b); });
          // Add strike levels from legs
          (analysis.legs || []).forEach(leg => {
            if (leg.strike && leg.strike > minP && leg.strike < maxP && leg.strike !== spot) {
              scenarioPrices.add(leg.strike);
            }
          });
          // Structured percentage moves from spot: ±10%, ±20%, ±30%
          if (spot > 0) {
            [0.7, 0.8, 0.9, 1.1, 1.2, 1.3].forEach(mult => {
              const p = Math.round(spot * mult);
              if (p > minP && p < maxP) scenarioPrices.add(p);
            });
          }
          // Sort and limit to ~8-9 rows
          const sorted = [...scenarioPrices].sort((a, b) => a - b).slice(0, 9);

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

          // Format price — show decimals if value is not a whole number (e.g. breakeven)
          const fmtP = (v) => {
            const hasDecimals = Math.abs(v - Math.round(v)) > 0.001;
            if (v >= 1000) return `$${v.toLocaleString(undefined, { minimumFractionDigits: hasDecimals ? 2 : 0, maximumFractionDigits: hasDecimals ? 2 : 0 })}`;
            if (v >= 1) return `$${v.toFixed(2)}`;
            return `$${v.toFixed(4)}`;
          };
          const fmtPnl = (v) => v >= 0 ? `+$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `-$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
          const fmtPct = (v) => v >= 0 ? `+${v.toFixed(2)}%` : `${v.toFixed(2)}%`;

          // Categorise strategy type for dynamic column logic
          const DOWNSIDE_STRATEGIES = ["collar", "cash_secured_put", "put_spread", "long_seagull"];
          const YIELD_STRATEGIES = ["covered_call", "call_spread"];
          const tt = analysis.tradeType;
          const isDownside = DOWNSIDE_STRATEGIES.includes(tt);
          const isYield = YIELD_STRATEGIES.includes(tt);
          const hasComparisonCol = isDownside || isYield;
          const comparisonColLabel = isDownside ? "Loss Prevention" : "Strategy vs Spot";

          const costBasis = analysis.costBasis || 0;
          const holdings = parseFloat(fieldValues.holdings) || 10;
          // Use currentNotional from analysis if available, else compute from spot * holdings
          const currentNotional = analysis.currentNotional || (spot * holdings);

          const thStyle = { padding: hasComparisonCol ? "8px 10px" : "10px 16px", fontFamily: "'Montserrat',sans-serif", fontSize: hasComparisonCol ? 7 : 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: THEME.textMuted, background: THEME.bg2, borderBottom: `0.5px solid ${THEME.border}`, textAlign: "left" };
          const tdStyle = { padding: hasComparisonCol ? "8px 10px" : "10px 16px", fontFamily: "'Poppins',sans-serif", fontSize: hasComparisonCol ? 11 : 12, color: "#4A4A48", borderBottom: `0.5px solid ${THEME.border}` };

          return (
            <div style={{ background: "#fff", border: `0.5px solid ${THEME.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 24, pageBreakInside: "avoid" }}>
              <div style={{ padding: "14px 20px", borderBottom: `0.5px solid ${THEME.border}`, fontFamily: "'Montserrat',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: THEME.textMuted }}>Scenario Analysis — P&L at Expiry</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Price at Expiry</th>
                    <th style={thStyle}>Move vs Spot</th>
                    {hasComparisonCol && <th style={thStyle}>Spot-Only P&L</th>}
                    <th style={thStyle}>Strategy P&L</th>
                    {hasComparisonCol && <th style={thStyle}>{comparisonColLabel}</th>}
                    <th style={thStyle}>Return on Notional</th>
                    <th style={thStyle}>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((price, i) => {
                    const pnl = findPnl(price);
                    const moveVsSpot = spot > 0 ? ((price - spot) / spot) * 100 : 0;
                    const notionalReturn = currentNotional > 0 ? (pnl / currentNotional) * 100 : 0;
                    const isSpot = spot > 0 && Math.abs(price - spot) < range * 0.005;
                    const isBe = (analysis.breakevens || []).some(b => Math.abs(price - b) < range * 0.005);

                    // Spot-only P&L: what you'd get just holding spot without the strategy
                    const spotOnlyPnl = hasComparisonCol ? (price - costBasis) * holdings : 0;
                    // Difference: strategy vs spot
                    const diff = pnl - spotOnlyPnl;

                    // Dynamic comparison value and sub-label
                    let comparisonValue = 0;
                    let comparisonSubLabel = "";
                    if (isDownside) {
                      // Downside protection: positive diff = strategy saved you money (Loss Prevention)
                      // negative diff = hedge cost / premium drag
                      comparisonValue = diff;
                      comparisonSubLabel = diff > 0 ? "" : diff < 0 ? "Hedge Cost" : "";
                    } else if (isYield) {
                      // Yield/capped: when spot outperforms strategy, show missed upside as opportunity cost (negative)
                      // when strategy outperforms spot (flat/down, premium collected), show as Premium Gain (positive)
                      comparisonValue = diff;
                      comparisonSubLabel = diff < 0 ? "Foregone Upside" : diff > 0 ? "Premium Gain" : "";
                    }

                    // Outcome label — institutional language
                    let outcome = "Neutral";
                    if (isBe) {
                      outcome = "Breakeven";
                    } else if (isDownside) {
                      if (pnl > 0) outcome = "Positive carry";
                      else if (pnl < 0 && diff > 0) outcome = "Hedge active — loss mitigated";
                      else if (pnl < 0) outcome = moveVsSpot < -15 ? "Net loss region" : "Net loss — partial offset";
                      else outcome = "Neutral";
                    } else if (isYield) {
                      if (pnl > 0 && diff < 0) outcome = "Capped upside region";
                      else if (pnl > 0) outcome = "Positive carry";
                      else if (pnl < 0) outcome = moveVsSpot < -15 ? "Net loss region" : "Carry offsets partial loss";
                      else outcome = "Neutral";
                    } else {
                      outcome = isBe ? "Breakeven" : pnl > 0 ? "Positive carry" : pnl < 0 ? (moveVsSpot < -15 ? "Net loss region" : "Net loss") : "Neutral";
                    }

                    return (
                      <tr key={i} style={{ background: isSpot ? "rgba(255,195,44,0.06)" : "transparent" }}>
                        <td style={tdStyle}>
                          <strong>{fmtP(price)}</strong>
                          {isSpot && <span style={{ background: "rgba(255,195,44,0.15)", color: THEME.goldText, fontFamily: "'Montserrat',sans-serif", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 10, marginLeft: 6 }}>SPOT</span>}
                        </td>
                        <td style={tdStyle}>{fmtPct(moveVsSpot)}</td>
                        {hasComparisonCol && (
                          <td style={{ ...tdStyle, fontFamily: "'Montserrat',sans-serif", fontWeight: 600, color: spotOnlyPnl > 0 ? THEME.positive : spotOnlyPnl < 0 ? THEME.negative : THEME.textMuted }}>
                            {fmtPnl(spotOnlyPnl)}
                          </td>
                        )}
                        <td style={{ ...tdStyle, fontFamily: "'Montserrat',sans-serif", fontWeight: 600, color: pnl > 0 ? THEME.positive : pnl < 0 ? THEME.negative : THEME.textMuted }}>
                          {isBe ? "$0 (breakeven)" : fmtPnl(pnl)}
                        </td>
                        {hasComparisonCol && (
                          <td style={{ ...tdStyle, fontFamily: "'Montserrat',sans-serif", fontWeight: 600 }}>
                            <span style={{ color: comparisonValue > 0 ? THEME.positive : comparisonValue < 0 ? THEME.negative : THEME.textMuted }}>
                              {fmtPnl(comparisonValue)}
                            </span>
                            {comparisonSubLabel && (
                              <span style={{ display: "block", fontSize: 8, fontWeight: 400, color: THEME.textMuted, marginTop: 1 }}>{comparisonSubLabel}</span>
                            )}
                          </td>
                        )}
                        <td style={{ ...tdStyle, fontFamily: "'Montserrat',sans-serif", fontWeight: 600, color: notionalReturn > 0 ? THEME.positive : notionalReturn < 0 ? THEME.negative : THEME.textMuted }}>
                          {isBe ? "0.00%" : fmtPct(notionalReturn)}
                        </td>
                        <td style={tdStyle}>{outcome}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
