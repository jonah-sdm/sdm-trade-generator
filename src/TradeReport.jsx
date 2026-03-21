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
      <path d={linePath} fill="none" stroke={accentColor || "#111111"} strokeWidth="2.5"
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
    return `<p>${raw.replace(/\n/g, "</p><p>")}</p>`;
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
        background: variant === "primary" ? "#111" : "#FFFFFF",
        color: variant === "primary" ? "#FFFFFF" : "#111",
        border: variant === "primary" ? "none" : "1px solid #E8E8E8",
        borderRadius: 2,
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
          <button onClick={() => handleShareLink(reportRef, trade, setLinkText)} style={{ background: "#FFC32C", border: "none", borderRadius: 999, color: "#111", padding: "8px 20px", fontFamily: "'Montserrat',sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer" }}>
            {linkText}
          </button>
          <button onClick={onReset} style={{ background: "none", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "rgba(255,255,255,0.5)", padding: "7px 14px", fontFamily: "'Poppins',sans-serif", fontSize: 12, cursor: "pointer" }}>
            New Trade
          </button>
        </div>
      </div>

      {/* ─── Report Content ─── */}
      <div ref={reportRef} style={{ background: "#FDFCF7" }}>

        {/* Dark Masthead */}
        <div style={{ background: "#1A1A18", padding: "28px 40px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 165 170" width="36" height="36" style={{ flexShrink: 0 }}>
                <path fill="#FFC32C" d="M69.38,81.61v-7.42c33.16-14.24,62.06-14.24,95.18,0v23.5l-9.22-3.66v-12.26c-21.14-8.77-45.06-12.1-66.81-3.46l75.87,30.17c-.2,3.5-.61,6.98-1.23,10.43l-93.8-37.3Z"/>
                <path fill="#FFC32C" d="M114.54,166.32c-18.96-11.01-38.57-25.45-44.76-47.42l12.5,4.69c6.45,13.09,18.95,22.5,34.78,32.07,12.24-7.48,20.63-13.77,26.86-20.6l-74.37-29.54c-.21-3.28-.17-7.66-.17-11,6.98,2.83,86.09,34.19,90.19,35.95-9.28,16.75-25.99,28.02-42.52,37.13l-2.52-1.29Z"/>
              </svg>
              <div>
                <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 9, letterSpacing: 3, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", marginBottom: 2 }}>SECURE DIGITAL MARKETS</div>
                <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)", letterSpacing: 1, textTransform: "uppercase" }}>Trade Structuring Report</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{dateStr}</div>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>Ref: SDM-{trade.tag?.replace(/\s+/g, "-").toUpperCase()}-{now.getFullYear()}</div>
            </div>
          </div>
        </div>
        {/* Gold gradient rule */}
        <div style={{ height: 3, background: "linear-gradient(90deg, #FFC32C 0%, rgba(255,195,44,0.25) 60%, transparent 100%)" }} />
        {/* Hero */}
        <div style={{ padding: "36px 40px 32px", borderBottom: "0.5px solid #E8E7E2", background: "#FDFCF7" }}>
          <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 9, letterSpacing: 2, color: "#7A5500", textTransform: "uppercase", fontWeight: 700, background: "rgba(255,195,44,0.15)", padding: "5px 14px", borderRadius: 999, display: "inline-block", marginBottom: 20 }}>{trade.tag}</span>
          <h1 style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 800, fontSize: 30, color: "#1A1A18", marginBottom: 10, lineHeight: 1.1 }}>{trade.label}</h1>
          <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#8A8A88", fontWeight: 300 }}>{trade.category} — {trade.description}</p>
        </div>

        {/* ─── Padded report body ─── */}
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 48px" }}>

        {/* Executive Summary */}
        <div
          style={{ marginBottom: 32, padding: 24, background: "rgba(255,195,44,0.06)", border: "0.5px solid #E8E7E2", borderLeft: "3px solid #FFC32C", borderRadius: "0 10px 10px 0", position: "relative" }}
          onMouseEnter={() => setExecHover(true)}
          onMouseLeave={() => setExecHover(false)}
        >
          <div style={{ ...sectionLabel, marginBottom: 12 }}>Executive Summary</div>
          <div style={{ transition: "opacity 0.15s, max-height 0.15s", opacity: execHover ? 1 : 0, maxHeight: execHover ? 40 : 0, overflow: "hidden", marginBottom: execHover ? 8 : 0 }}>
            <RichTextToolbar />
          </div>
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            dangerouslySetInnerHTML={{ __html: execHtml || (typeof execSummary === "string"
              ? `<p>${execSummary.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br/>")}</p>`
              : execSummary) || "" }}
            onBlur={handleExecBlur}
            style={{
              fontFamily: "'Poppins',sans-serif", fontSize: 14, lineHeight: 1.7, color: "#333", outline: "none",
              background: execHover ? "#FDFCF7" : "transparent",
              border: execHover ? "1px solid #E8E7E2" : "1px solid transparent",
              borderRadius: 2, padding: "12px 14px", minHeight: 80,
              transition: "background 0.15s, border-color 0.15s",
              cursor: "text",
            }}
          />
        </div>

        {/* Metrics Strip */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(analysis.metrics.length, 6)}, 1fr)`, borderBottom: "0.5px solid #E8E7E2", marginBottom: 32, marginLeft: -48, marginRight: -48 }}>
          {analysis.metrics.slice(0, 6).map((m, i, arr) => (
            <div key={i} style={{
              padding: "18px 20px",
              borderRight: i < arr.length - 1 ? "0.5px solid #E8E7E2" : "none",
            }}>
              <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 8, letterSpacing: 1.5, color: "#8A8A88", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>{m.label}</div>
              <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 17, color: m.positive ? "#16a34a" : m.negative ? "#dc2626" : "#1A1A18", marginBottom: 4 }}>{m.value}</div>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 10, color: "#8A8A88" }}>{m.sub}</div>
            </div>
          ))}
        </div>

        {/* Payoff Diagram */}
        <div style={{ marginBottom: 32, border: "0.5px solid #E8E7E2", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "0.5px solid #E8E7E2", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#F5F4EF" }}>
            <div>
              <div style={sectionLabel}>{analysis.chartLabel ? "Margin Health vs. Price" : "Payoff at Expiry"}</div>
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              {analysis.chartLabel ? (
                <>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#555" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#16a34a", display: "inline-block" }} />Safe</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#555" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#FFC32C", display: "inline-block" }} />Warning</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#555" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#dc2626", display: "inline-block" }} />Liquidation</span>
                </>
              ) : (
                <>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#555" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#16a34a", display: "inline-block" }} />Profit</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#555" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#dc2626", display: "inline-block" }} />Loss</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#555" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ca8a04", display: "inline-block" }} />Breakeven</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#555" }}><span style={{ width: 24, height: 1, background: "#CCCCCC", display: "inline-block" }} />Long Spot</span>
                </>
              )}
            </div>
          </div>
          <div style={{ padding: "8px 0" }}>
            <PayoffChart analysis={analysis} accentColor={trade.color} />
          </div>
        </div>

        {/* Trade Structure */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ ...sectionLabel, marginBottom: 12 }}>Trade Structure</div>
          <div style={{ border: "0.5px solid #E8E7E2", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "100px 140px 1fr", padding: "10px 16px", background: "#F5F4EF", borderBottom: "0.5px solid #E8E7E2" }}>
              <span style={{ ...sectionLabel }}>Action</span>
              <span style={{ ...sectionLabel }}>Instrument</span>
              <span style={{ ...sectionLabel }}>Detail</span>
            </div>
            {analysis.legs.map((leg, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "100px 140px 1fr", padding: "12px 16px", borderBottom: i < analysis.legs.length - 1 ? "0.5px solid #E8E7E2" : "none", alignItems: "center" }}>
                <span style={{
                  fontFamily: "'Montserrat',sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
                  color: leg.action.toLowerCase() === "buy" || leg.action.toLowerCase() === "long" ? "#16a34a" : "#dc2626",
                }}>{leg.action}</span>
                <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#555" }}>{leg.type}</span>
                <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#111", display: "flex", alignItems: "center", gap: 10 }}>
                  {leg.label}
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: leg.color, display: "inline-block", flexShrink: 0 }} />
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Summary */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ ...sectionLabel, marginBottom: 12 }}>Risk Summary</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {analysis.breakevens && analysis.breakevens.length > 0 && (
              <div style={{ background: "#F5F4EF", border: "0.5px solid #E8E7E2", borderRadius: 10, padding: "14px 16px" }}>
                <div style={sectionLabel}>Breakeven</div>
                <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 16, color: "#ca8a04", marginTop: 6 }}>
                  ${analysis.breakevens.map(b => Math.abs(b) < 1 && b !== 0 ? b.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : b.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })).join(", ")}
                </div>
              </div>
            )}
            {analysis.metrics.filter(m => m.negative).map((m, i) => (
              <div key={i} style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "14px 16px" }}>
                <div style={sectionLabel}>{m.label}</div>
                <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 16, color: "#dc2626", marginTop: 6 }}>{m.value}</div>
                <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#888", marginTop: 2 }}>{m.sub}</div>
              </div>
            ))}
            {analysis.metrics.filter(m => m.positive).map((m, i) => (
              <div key={i} style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "14px 16px" }}>
                <div style={sectionLabel}>{m.label}</div>
                <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 16, color: "#16a34a", marginTop: 6 }}>{m.value}</div>
                <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#888", marginTop: 2 }}>{m.sub}</div>
              </div>
            ))}
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
            <div style={{ marginBottom: 32, border: "1px solid #E8E8E8", borderTop: "3px solid #16a34a", borderRadius: 2, padding: "24px" }}>
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
                  <div key={i} style={{ background: "#FAFAFA", border: "1px solid #E8E8E8", borderRadius: 2, padding: "14px 16px" }}>
                    <div style={sectionLabel}>{kpi.label}</div>
                    <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 16, color: "#111", marginTop: 6 }}>{kpi.value}</div>
                    <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#888", marginTop: 2 }}>{kpi.sub}</div>
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
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F0F0F0" }}>
                    <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#888" }}>{label}</span>
                    <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 12, fontWeight: 600, color: "#111" }}>{val}</span>
                  </div>
                ))}
              </div>
              {loanComponent.useOfProceeds && (
                <div style={{ marginTop: 16, fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#555", padding: "12px 16px", background: "#FAFAFA", border: "1px solid #E8E8E8", borderRadius: 2 }}>
                  <strong>Use of Proceeds:</strong> {loanComponent.useOfProceeds}
                </div>
              )}
            </div>
          );
        })()}

        {/* Disclaimer */}
        <div style={{ padding: "16px 20px", background: "#F5F4EF", border: "0.5px solid #E8E7E2", borderRadius: 10, marginBottom: 24 }}>
          <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#888", lineHeight: 1.6 }}>
            SDM — Internal Use Only. This document does not constitute investment advice. Generated {dateStr} at {timeStr}.
          </p>
        </div>

        {/* Footer */}
        <div style={{ borderTop: "3px solid #111", paddingTop: 2 }}>
          <div style={{ height: 2, background: "#FFC32C", marginBottom: 20 }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: 2, color: "#111" }}>SECURE DIGITAL MARKETS</div>
              <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#888", marginTop: 4 }}>
                The Institutional Choice for <strong style={{ color: "#FFC32C" }}>Digital</strong> Asset Trading
              </p>
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              <a href="mailto:sales@sdm.co" style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#555", textDecoration: "none" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 4L12 13 2 4"/></svg>
                sales@sdm.co
              </a>
              <a href="https://twitter.com/SD_Markets" target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#555", textDecoration: "none" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                @SD_Markets
              </a>
              <a href="https://t.me/SecureDigitalMarkets" target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#555", textDecoration: "none" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                Telegram
              </a>
            </div>
          </div>
          <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#AAAAAA", marginTop: 16 }}>Confidential — For intended recipient only. Not investment advice.</p>
        </div>
        </div>
      </div>
    </div>
  );
}
