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
    return v.toFixed(0);
  };

  const fmtPrice = (v) => {
    if (v >= 1e3) return `$${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1)}K`;
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
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="redGrad" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {yGridLines.map((g, i) => (
        <g key={`yg${i}`}>
          <line x1={PAD.left} y1={g.y} x2={W - PAD.right} y2={g.y}
            stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          <text x={PAD.left - 10} y={g.y + 4} textAnchor="end"
            fill="rgba(255,255,255,0.35)" fontSize="10" fontFamily="Inter, sans-serif">
            {fmtAxis(g.val)}
          </text>
        </g>
      ))}
      {xGridLines.map((g, i) => (
        <g key={`xg${i}`}>
          <line x1={g.x} y1={PAD.top} x2={g.x} y2={H - PAD.bottom}
            stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          <text x={g.x} y={H - PAD.bottom + 18} textAnchor="middle"
            fill="rgba(255,255,255,0.35)" fontSize="10" fontFamily="Inter, sans-serif">
            {fmtPrice(g.val)}
          </text>
        </g>
      ))}

      <line x1={PAD.left} y1={zeroY} x2={W - PAD.right} y2={zeroY}
        stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="4,3" />

      {zones && zones.map((z, i) => (
        <rect key={`z${i}`}
          x={scaleX(Math.max(z.from, minPrice))}
          y={PAD.top}
          width={scaleX(Math.min(z.to, maxPrice)) - scaleX(Math.max(z.from, minPrice))}
          height={cH}
          fill={z.color}
        />
      ))}

      <path d={greenFill} fill="url(#greenGrad)" />
      <path d={redFill} fill="url(#redGrad)" />

      <path d={linePath} fill="none" stroke={accentColor || "#00C2FF"} strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round" />

      {spot > minPrice && spot < maxPrice && (
        <g>
          <line x1={scaleX(spot)} y1={PAD.top} x2={scaleX(spot)} y2={H - PAD.bottom}
            stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="6,4" />
          <rect x={scaleX(spot) - 24} y={H - PAD.bottom + 26} width="48" height="18" rx="4"
            fill="rgba(255,255,255,0.08)" />
          <text x={scaleX(spot)} y={H - PAD.bottom + 38} textAnchor="middle"
            fill="rgba(255,255,255,0.6)" fontSize="9" fontFamily="Inter, sans-serif" fontWeight="600">
            SPOT
          </text>
        </g>
      )}

      {legs && legs.map((leg, i) => (
        leg.strike > minPrice && leg.strike < maxPrice && (
          <g key={`leg${i}`}>
            <line x1={scaleX(leg.strike)} y1={H - PAD.bottom} x2={scaleX(leg.strike)} y2={H - PAD.bottom + 6}
              stroke={leg.color} strokeWidth="2" />
            <circle cx={scaleX(leg.strike)} cy={scaleY(
              curve.reduce((closest, c) =>
                Math.abs(c.price - leg.strike) < Math.abs(closest.price - leg.strike) ? c : closest
              ).pnl
            )} r="4" fill={leg.color} stroke="#111118" strokeWidth="2" />
          </g>
        )
      ))}

      {breakevens && breakevens.map((be, i) => (
        be > minPrice && be < maxPrice && (
          <g key={`be${i}`}>
            <circle cx={scaleX(be)} cy={zeroY} r="5" fill="none"
              stroke="#ca8a04" strokeWidth="2" />
            <text x={scaleX(be)} y={zeroY - 12} textAnchor="middle"
              fill="#ca8a04" fontSize="9" fontFamily="Inter, sans-serif" fontWeight="600">
              BE
            </text>
          </g>
        )
      ))}

      <text x={PAD.left - 10} y={12} textAnchor="end"
        fill="rgba(255,255,255,0.25)" fontSize="9" fontFamily="Inter, sans-serif">P&L</text>
      <text x={W - PAD.right} y={H - PAD.bottom + 18} textAnchor="end"
        fill="rgba(255,255,255,0.25)" fontSize="9" fontFamily="Inter, sans-serif">Price</text>
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

function buildStandaloneHtml(reportRef, trade) {
  const styleSheets = Array.from(document.styleSheets);
  let cssText = "";
  styleSheets.forEach(sheet => {
    try {
      Array.from(sheet.cssRules).forEach(rule => { cssText += rule.cssText + "\n"; });
    } catch (e) { /* cross-origin sheets */ }
  });

  const reportHtml = reportRef.current.outerHTML;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>SDM — ${trade.label}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #0a0a0f; --bg2: #111118; --bg3: #16161f; --bg4: #1c1c28;
  --border: rgba(255,255,255,0.06); --border-light: rgba(255,255,255,0.12);
  --text: #f0f0f5; --text-muted: #8a8a9a; --text-dim: #55556a;
  --gold: #FFC32C; --gold-dark: #D4A017;
  --font-display: 'Inter', sans-serif; --font-body: 'Inter', sans-serif;
  --font-serif: 'Instrument Serif', Georgia, serif;
}
body { background: var(--bg); color: var(--text); font-family: var(--font-body); margin: 0; padding: 32px; -webkit-font-smoothing: antialiased; }
.report-actions, .report-share-bar, .btn-edit-thesis, .btn-save-thesis, .btn-back { display: none !important; }
${cssText}
@media print {
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
  body { background: var(--bg) !important; }
}
</style>
</head>
<body>${reportHtml}</body>
</html>`;
}

function handleShareLink(reportRef, trade, setLinkText) {
  if (!reportRef.current) return;

  const fullHtml = buildStandaloneHtml(reportRef, trade);
  const blob = new Blob([fullHtml], { type: "text/html" });
  const url = URL.createObjectURL(blob);

  // Open in new tab so user can share it, and also copy
  window.open(url, "_blank");

  // Also trigger download so they have the file
  const a = document.createElement("a");
  a.href = url;
  a.download = `SDM-${trade.label.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setLinkText("Downloaded!");
  setTimeout(() => setLinkText("Share Link"), 2500);
}

function handleExportPDF(reportRef) {
  if (!reportRef.current) return;
  window.print();
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
  const [linkText, setLinkText] = useState("Share Link");
  const [execHtml, setExecHtml] = useState(fieldValues.executive_summary ? `<p>${fieldValues.executive_summary.replace(/\n/g, "</p><p>")}</p>` : "");
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
      {/* SDM Letterhead */}
      <div className="letterhead">
        <div className="letterhead-left">
          <img src="/sdm-logo.svg" alt="SDM" className="letterhead-logo" width="38" height="42" />
          <div className="letterhead-text">
            <span className="letterhead-name">SDM</span>
            <span className="letterhead-slogan">Trade Idea Studio</span>
          </div>
        </div>
        <div className="letterhead-right">
          <span className="letterhead-date">{dateStr}</span>
          <span className="letterhead-time">{timeStr}</span>
        </div>
      </div>
      <div className="letterhead-divider" />

      {/* Report Header */}
      <div className="report-header">
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
      <div className="report-section exec-summary">
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
              dangerouslySetInnerHTML={{ __html: execHtml || `<p>${execSummary}</p>` }}
            />
            <button className="btn-save-thesis" onClick={handleEditorSave}>
              Save
            </button>
          </div>
        ) : (
          <div className="exec-content" onClick={() => !execHtml && setExecEditing(true)}>
            {execHtml ? (
              <div className="exec-text exec-user-text" dangerouslySetInnerHTML={{ __html: execHtml }} />
            ) : (
              <>
                <p className="exec-text">{execSummary}</p>
                <p className="thesis-placeholder" style={{ marginTop: 12 }}>Click "Edit" to add your own executive summary instead...</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="report-kpis">
        {analysis.metrics.map((m, i) => (
          <div key={i} className={`kpi-card ${m.positive ? "kpi-positive" : ""} ${m.negative ? "kpi-negative" : ""}`}>
            <div className="kpi-label">{m.label}</div>
            <div className="kpi-value">{m.value}</div>
            <div className="kpi-sub">{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Payoff Diagram */}
      <div className="report-section">
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
              </>
            )}
          </div>
        </div>
        <div className="chart-container">
          <PayoffChart analysis={analysis} accentColor={trade.color} />
        </div>
      </div>

      {/* Trade Structure */}
      <div className="report-section">
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
      <div className="report-section">
        <h2 className="section-title">Risk Summary</h2>
        <div className="risk-grid">
          {analysis.breakevens && analysis.breakevens.length > 0 && (
            <div className="risk-item">
              <span className="risk-label">Breakeven</span>
              <span className="risk-value">${analysis.breakevens.map(b => b.toLocaleString()).join(", ")}</span>
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
        </div>
        <div className="share-group">
          <button className="share-btn share-link" onClick={() => handleShareLink(reportRef, trade, setLinkText)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            {linkText}
          </button>
          <button className="share-btn share-pdf" onClick={() => handleExportPDF(reportRef)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Export to PDF
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="report-actions">
        {onBack && <button className="btn-back" onClick={onBack}>← Edit Parameters</button>}
        <button className="btn-new-trade" onClick={onReset}>New Trade</button>
        <button className="btn-share-link" onClick={() => handleShareLink(reportRef, trade, setLinkText)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          {linkText}
        </button>
        <button className="btn-export-pdf" onClick={() => handleExportPDF(reportRef)}>
          Export to PDF →
        </button>
      </div>

      {/* Disclaimer */}
      <div className="report-disclaimer">
        SDM — Internal Use Only. This document does not constitute investment advice.
        Generated {dateStr} at {timeStr}.
      </div>
    </div>
  );
}
