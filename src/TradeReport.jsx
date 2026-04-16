import { useMemo, useRef, useState } from "react";
import { computeTradeAnalysis, generateExecutiveSummary } from "./payoffEngine";
import { computeLendingProposal, fmt as lendFmt } from "./lendingEngine";

// ─── DESIGN TOKENS ───
const THEME = {
  bg: "#FDFCF7", bg2: "#F5F4EF", border: "#E8E7E2",
  text: "#1A1A18", textMuted: "#8A8A88",
  gold: "#FFC32C", goldText: "#7A5500",
  positive: "#16a34a", negative: "#dc2626",
};

// ─── FORMATTERS ───
const fmtPrice = (v) => {
  if (!v && v !== 0) return "$0";
  if (!isFinite(v)) return "$0";
  const abs = Math.abs(v);
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${Math.round(abs).toLocaleString()}`;
  if (abs < 1 && abs > 0) return `$${abs.toFixed(4)}`;
  return `$${abs.toFixed(2)}`;
};
const fmtShort = (v) => {
  if (!isFinite(v)) return "—";
  const sign = v < 0 ? "–" : "";
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}k`;
  return `${sign}$${abs.toFixed(0)}`;
};
const fmtPnlVal = (v) => v >= 0
  ? `+$${Math.abs(Math.round(v)).toLocaleString()}`
  : `-$${Math.abs(Math.round(v)).toLocaleString()}`;
const fmtPctVal = (v) => v >= 0 ? `+${v.toFixed(2)}%` : `${v.toFixed(2)}%`;

// ─── STYLES ───
const sectionLabel = { fontFamily: "'Montserrat',sans-serif", fontSize: 11, letterSpacing: 2, color: "#8A8A88", textTransform: "uppercase", fontWeight: 600 };

// ─── SDM LOGO DATA URI ───
const SDM_LOGO_SVG = `data:image/svg+xml,%3C%3Fxml%20version%3D%221.0%22%20encoding%3D%22UTF-8%22%3F%3E%0A%3Csvg%20id%3D%22Camada_1%22%20data-name%3D%22Camada%201%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20xmlns%3Axlink%3D%22http%3A%2F%2Fwww.w3.org%2F1999%2Fxlink%22%20viewBox%3D%220%200%20600%20231.11%22%3E%0A%20%20%3Cdefs%3E%0A%20%20%20%20%3Cstyle%3E%0A%20%20%20%20%20%20.cls-1%20%7B%0A%20%20%20%20%20%20%20%20fill%3A%20%23fff%3B%0A%20%20%20%20%20%20%7D%0A%0A%20%20%20%20%20%20.cls-1%2C%20.cls-2%20%7B%0A%20%20%20%20%20%20%20%20stroke-width%3A%200px%3B%0A%20%20%20%20%20%20%7D%0A%0A%20%20%20%20%20%20.cls-2%20%7B%0A%20%20%20%20%20%20%20%20fill%3A%20%23eec13f%3B%0A%20%20%20%20%20%20%7D%0A%0A%20%20%20%20%20%20.cls-3%20%7B%0A%20%20%20%20%20%20%20%20filter%3A%20url(%23outer-glow-1)%3B%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%3C%2Fstyle%3E%0A%20%20%20%20%3Cfilter%20id%3D%22outer-glow-1%22%20filterUnits%3D%22userSpaceOnUse%22%3E%0A%20%20%20%20%20%20%3CfeOffset%20dx%3D%220%22%20dy%3D%220%22%2F%3E%0A%20%20%20%20%20%20%3CfeGaussianBlur%20result%3D%22blur%22%20stdDeviation%3D%229.89%22%2F%3E%0A%20%20%20%20%20%20%3CfeFlood%20flood-color%3D%22%231851eb%22%20flood-opacity%3D%22.28%22%2F%3E%0A%20%20%20%20%20%20%3CfeComposite%20in2%3D%22blur%22%20operator%3D%22in%22%2F%3E%0A%20%20%20%20%20%20%3CfeComposite%20in%3D%22SourceGraphic%22%2F%3E%0A%20%20%20%20%3C%2Ffilter%3E%0A%20%20%3C%2Fdefs%3E%0A%20%20%3Cg%20class%3D%22cls-3%22%3E%0A%20%20%20%20%3Cpath%20class%3D%22cls-2%22%20d%3D%22M38.49%2C62.99v-12.32c55.08-23.68%2C103.1-23.66%2C158.16%2C0v39.04l-15.32-6.1v-20.36c-35.12-14.65-74.87-20.1-111-5.74l126.04%2C50.13c-.35%2C6.04-1.03%2C11.87-2.04%2C17.34L38.49%2C62.99Z%22%2F%3E%0A%20%20%20%20%3Cpath%20class%3D%22cls-2%22%20d%3D%22M113.53%2C203.69c-31.51-18.3-64.08-42.26-74.37-78.81l20.76%2C7.81c10.7%2C21.74%2C31.47%2C37.38%2C57.79%2C53.27%2C20.35-12.42%2C34.29-22.88%2C44.65-34.23l-123.57-49.15c-.36-5.44-.29-12.72-.29-18.27%2C11.62%2C4.64%2C143.04%2C56.81%2C149.86%2C59.74-15.41%2C27.83-43.18%2C46.57-70.64%2C61.69l-4.18-2.07Z%22%2F%3E%0A%20%20%3C%2Fg%3E%0A%20%20%3Cpath%20class%3D%22cls-1%22%20d%3D%22M295.28%2C159.49c-15.27%2C0-28-3.4-38.87-10.39l6.11-12.22c9.9%2C6.2%2C20.8%2C9.35%2C32.41%2C9.35%2C17.08%2C0%2C20.67-5.43%2C20.67-9.98%2C0-6.7-5.61-8.38-21.39-9.75-29-2.56-34.5-10.23-34.5-23.48%2C0-14.92%2C13.03-23.83%2C34.87-23.83%2C12.94%2C0%2C23.68%2C2.86%2C32.78%2C8.75l-5.56%2C11.72c-7.69-4.73-16.82-7.22-26.51-7.22-12.24%2C0-19.26%2C3.55-19.26%2C9.75%2C0%2C6.69%2C5.61%2C8.37%2C21.39%2C9.74%2C29%2C2.57%2C34.5%2C10.24%2C34.5%2C23.49%2C0%2C10.98-6.35%2C24.06-36.63%2C24.06Z%22%2F%3E%0A%20%20%3Cpolygon%20class%3D%22cls-1%22%20points%3D%22525.36%20158.08%20525.36%20101.02%20523.1%20100.55%20498.16%20158.08%20487.15%20158.08%20462.21%20100.55%20459.95%20101.02%20459.95%20158.08%20444.81%20158.08%20444.81%2080.6%20468.22%2080.6%20493.07%20137.8%20517.79%2080.6%20541.32%2080.6%20541.32%20158.08%20525.36%20158.08%22%2F%3E%0A%20%20%3Cpath%20class%3D%22cls-1%22%20d%3D%22M389.06%2C80.59h-36.04v13.37h34.16c16.42%2C0%2C25.84%2C9.25%2C25.84%2C25.37s-9.42%2C25.37-25.84%2C25.37h-18.49v-39.9h-15.67v53.28h36.04c25.22%2C0%2C40.27-14.48%2C40.27-38.75s-15.06-38.74-40.27-38.74Z%22%2F%3E%0A%3C%2Fsvg%3E`;

// ─── SHARE HELPERS ───
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
    try { Array.from(sheet.cssRules).forEach(rule => { cssText += rule.cssText + "\n"; }); } catch (e) {}
  });
  let reportHtml = reportRef.current.outerHTML;
  reportHtml = reportHtml.replace(/src="\/sdm-logo[^"]*\.svg"/g, `src="${SDM_LOGO_SVG}"`)
                         .replace(/src="\/sdm-logo[^"]*\.png"/g, `src="${SDM_LOGO_SVG}"`);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>SDM — ${trade.label}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #FDFCF7; color: #1A1A18; font-family: 'Poppins', sans-serif; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
.report-actions, .report-share-bar, .noprint { display: none !important; }
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
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #FDFCF7; color: #1A1A18; font-family: 'Poppins', sans-serif; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
.report-actions, .report-share-bar, .noprint { display: none !important; }
${cssText}
@media print {
  @page { size: A4; margin: 0 !important; }
  *, *::before, *::after { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { background: #FDFCF7 !important; }
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

// ─── ZONE-COLORED STATIC PAYOFF SVG ───
function PayoffSVG({ analysis, fieldValues }) {
  const { curve, breakevens, spot, zones } = analysis;
  if (!curve || curve.length === 0) return null;

  const qty = parseFloat(
    fieldValues.quantity || fieldValues.units || fieldValues.btc_amount ||
    fieldValues.holdings || fieldValues.contracts || "1"
  ) || 1;
  const asset = fieldValues.asset || "BTC";

  const prices = curve.map(p => p.price);
  const pnls   = curve.map(p => p.pnl);
  const minP   = Math.min(...prices), maxP = Math.max(...prices);
  const minPnl = Math.min(...pnls),   maxPnl = Math.max(...pnls);

  const pad  = Math.max((maxPnl - minPnl) * 0.1, Math.abs(maxPnl) * 0.05, 500);
  const yMin = minPnl - pad, yMax = maxPnl + pad;

  // SVG coordinate mappers — chart area x: 50→770 (720px), y: 10→150 (140px)
  const xOf = p => Math.max(50, Math.min(770, ((p - minP) / (maxP - minP)) * 720 + 50));
  const yOf = v => Math.max(10, Math.min(150, 150 - ((v - yMin) / (yMax - yMin)) * 140));
  const zeroY = yOf(0);

  const be   = (breakevens && breakevens.length > 0) ? breakevens[0] : spot * 0.97;
  const xBe   = xOf(be);
  const xSpot = xOf(spot);

  // Build display zones — use engine zones if present, else derive from legs/breakevens
  const displayZones = (zones && zones.length >= 2) ? zones : (() => {
    const legs    = analysis.legs || [];
    const strikes = legs.map(l => l.strike).filter(s => s > 0).sort((a, b) => a - b);
    const capSt   = strikes.find(s => s > be);
    if (capSt) {
      return [
        { from: minP,  to: be,   type: "loss"   },
        { from: be,    to: capSt, type: "profit" },
        { from: capSt, to: maxP, type: "capped"  },
      ];
    }
    return [
      { from: minP, to: be,   type: "loss"   },
      { from: be,   to: maxP, type: "profit" },
    ];
  })();

  const cappedZone = displayZones.find(z => z.type === "capped");
  const hasCap     = Boolean(cappedZone);
  const xStrike    = cappedZone ? xOf(cappedZone.from) : 770;

  // P&L interpolator
  const findPnl = (price) => {
    if (analysis.pnlAtPrice) return analysis.pnlAtPrice(price);
    for (let i = 0; i < curve.length - 1; i++) {
      if (curve[i].price <= price && curve[i + 1].price >= price) {
        const r = (price - curve[i].price) / (curve[i + 1].price - curve[i].price);
        return curve[i].pnl + r * (curve[i + 1].pnl - curve[i].pnl);
      }
    }
    return 0;
  };

  const spotPnl = findPnl(spot);
  const maxGain = hasCap ? findPnl(cappedZone.from) : maxPnl;

  // Polyline point strings
  const pts = (arr) => arr.map(p => `${xOf(p.price).toFixed(1)},${yOf(p.pnl).toFixed(1)}`).join(" ");
  const lossCurve   = curve.filter(p => p.price <= be);
  const profitCurve = curve.filter(p => p.price >= be && (!hasCap || p.price <= cappedZone.from));
  const cappedCurve = hasCap ? curve.filter(p => p.price >= cappedZone.from) : [];

  // Y-axis labels (5 evenly spaced)
  const ySteps = [0, 1, 2, 3, 4].map(i => yMin + (yMax - yMin) * (i / 4));

  // X-axis labels at key prices, filtered to avoid crowding
  const xKeyRaw = [minP, be, spot, cappedZone?.from, maxP].filter(Boolean);
  const xKeys   = xKeyRaw.filter((p, i) =>
    i === 0 || (p - xKeyRaw[i - 1]) / (maxP - minP) > 0.09
  );

  const zoneBadgeSt = (type) => ({
    textAlign: "center", padding: "8px 16px", borderRadius: 6, flex: 1,
    fontFamily: "'Montserrat',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
    ...(type === "loss"
      ? { background: "rgba(220,38,38,0.07)", color: "#991b1b" }
      : type === "capped"
      ? { background: "rgba(255,195,44,0.1)", color: "#7A5500" }
      : { background: "rgba(22,163,74,0.08)", color: "#166534" }),
  });

  const zoneLabel = (z, i) => {
    if (zones && zones[i] && zones[i].label) return zones[i].label;
    if (z.type === "loss")   return `Below ${fmtPrice(be)} · Loss zone`;
    if (z.type === "profit") return hasCap
      ? `${fmtPrice(be)} – ${fmtPrice(cappedZone.from)} · Profit zone`
      : `Above ${fmtPrice(be)} · Profit zone`;
    return `Above ${fmtPrice(cappedZone.from)} · Capped at ${fmtPnlVal(maxGain)} max gain`;
  };

  // Clamp callout positions so they stay inside the SVG
  const spotCalloutX  = Math.max(77, Math.min(723, xSpot));
  const spotCalloutY  = Math.max(12, Math.min(128, yOf(spotPnl) - 22));
  const gainCalloutX  = hasCap ? Math.min(700, xStrike + 8) : 0;
  const gainCalloutY  = hasCap ? Math.max(12, Math.min(128, yOf(maxGain) - 10)) : 0;

  return (
    <div style={{ background: "#fff", border: "0.5px solid #E8E7E2", borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
      {/* Card header */}
      <div style={{ padding: "14px 20px", borderBottom: "0.5px solid #E8E7E2", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#8A8A88" }}>
          Payoff Diagram — At Expiry{qty !== 1 ? ` (per ${qty} ${asset})` : ""}
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {[
            { color: "#EF4444", label: "Loss zone" },
            { color: "#4ade80", label: "Profit zone" },
            ...(hasCap ? [{ dashed: true, label: "Capped above strike" }] : []),
          ].map((l, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'Poppins',sans-serif", fontSize: 10, color: "#8A8A88" }}>
              {l.dashed
                ? <span style={{ width: 12, height: 0, borderTop: "2px dashed #FFC32C", display: "inline-block" }} />
                : <span style={{ width: 10, height: 3, borderRadius: 2, background: l.color, display: "inline-block" }} />
              }
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {/* SVG + zone badges */}
      <div style={{ padding: "20px 20px 16px" }}>
        <svg viewBox="0 0 780 180" width="100%" height={180} style={{ display: "block" }}>
          {/* Zone background rects */}
          {displayZones.map((z, i) => {
            const x1 = xOf(Math.max(z.from, minP));
            const x2 = xOf(Math.min(z.to,   maxP));
            const fill = z.type === "loss"   ? "rgba(239,68,68,0.04)"
                       : z.type === "capped" ? "rgba(255,195,44,0.05)"
                       :                       "rgba(74,222,128,0.05)";
            return <rect key={i} x={x1} y={10} width={Math.max(0, x2 - x1)} height={140} fill={fill} rx={2} />;
          })}

          {/* Horizontal grid lines */}
          {[35, 60, 85, 110, 135].map((y, i) => (
            <line key={i} x1={50} y1={y} x2={770} y2={y} stroke="rgba(26,26,24,0.05)" strokeWidth={0.5} />
          ))}

          {/* Zero line */}
          {zeroY >= 10 && zeroY <= 150 && (
            <line x1={50} y1={zeroY} x2={770} y2={zeroY} stroke="rgba(26,26,24,0.2)" strokeWidth={1} strokeDasharray="5,4" />
          )}

          {/* Y-axis labels */}
          {ySteps.map((v, i) => (
            <text key={i} x={44} y={yOf(v) + 3} textAnchor="end" fontSize={8} fontFamily="'Poppins',sans-serif" fill="#8A8A88">
              {fmtShort(v)}
            </text>
          ))}

          {/* Loss fill polygon */}
          {lossCurve.length >= 2 && (
            <polygon
              points={`${xOf(lossCurve[0].price).toFixed(1)},${zeroY.toFixed(1)} ${pts(lossCurve)} ${xBe.toFixed(1)},${zeroY.toFixed(1)}`}
              fill="rgba(239,68,68,0.08)"
            />
          )}

          {/* Profit fill polygon */}
          {profitCurve.length >= 2 && (
            <polygon
              points={`${xBe.toFixed(1)},${zeroY.toFixed(1)} ${pts(profitCurve)} ${xOf(profitCurve[profitCurve.length - 1].price).toFixed(1)},${zeroY.toFixed(1)}`}
              fill="rgba(74,222,128,0.07)"
            />
          )}

          {/* Loss polyline — RED */}
          {lossCurve.length >= 2 && (
            <polyline points={pts(lossCurve)} fill="none" stroke="#EF4444" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          )}

          {/* Profit polyline — GOLD solid */}
          {profitCurve.length >= 2 && (
            <polyline points={pts(profitCurve)} fill="none" stroke="#FFC32C" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          )}

          {/* Capped polyline — GOLD dashed */}
          {hasCap && cappedCurve.length >= 2 && (
            <polyline points={pts(cappedCurve)} fill="none" stroke="#FFC32C" strokeWidth={2} strokeDasharray="7,4" strokeLinecap="round" opacity={0.75} />
          )}

          {/* Spot vertical reference */}
          <line x1={xSpot} y1={10} x2={xSpot} y2={150} stroke="rgba(26,26,24,0.12)" strokeWidth={1} strokeDasharray="4,3" />

          {/* Strike vertical reference */}
          {hasCap && (
            <line x1={xStrike} y1={10} x2={xStrike} y2={150} stroke="rgba(255,195,44,0.4)" strokeWidth={1} strokeDasharray="4,3" />
          )}

          {/* Breakeven dot */}
          {xBe >= 50 && xBe <= 770 && (
            <circle cx={xBe} cy={zeroY} r={4} fill="rgba(26,26,24,0.3)" stroke="rgba(26,26,24,0.5)" strokeWidth={1} />
          )}

          {/* Spot dot */}
          <circle cx={xSpot} cy={yOf(spotPnl)} r={5} fill="#1A1A18" stroke="#fff" strokeWidth={2} />

          {/* Max gain dot (double circle at strike) */}
          {hasCap && (
            <>
              <circle cx={xStrike} cy={yOf(maxGain)} r={6} fill="#FFC32C" />
              <circle cx={xStrike} cy={yOf(maxGain)} r={2.5} fill="#1A1A18" />
            </>
          )}

          {/* SPOT REF callout label */}
          <rect x={spotCalloutX - 27} y={spotCalloutY} width={54} height={16} rx={3} fill="#1A1A18" opacity={0.85} />
          <text x={spotCalloutX} y={spotCalloutY + 11} textAnchor="middle" fontSize={7} fontFamily="'Montserrat',sans-serif" fontWeight="700" fill="#fff">SPOT REF</text>

          {/* MAX GAIN callout label */}
          {hasCap && (
            <>
              <rect x={gainCalloutX} y={gainCalloutY} width={66} height={16} rx={3} fill="#FFC32C" opacity={0.9} />
              <text x={gainCalloutX + 33} y={gainCalloutY + 11} textAnchor="middle" fontSize={7} fontFamily="'Montserrat',sans-serif" fontWeight="700" fill="#1A1A18">MAX GAIN</text>
            </>
          )}

          {/* X-axis labels */}
          {xKeys.map((p, i) => (
            <text key={i} x={xOf(p)} y={168} textAnchor="middle" fontSize={8} fontFamily="'Poppins',sans-serif" fill="#8A8A88">
              {fmtPrice(p)}
            </text>
          ))}
        </svg>

        {/* Zone badges */}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {displayZones.map((z, i) => (
            <div key={i} style={zoneBadgeSt(z.type)}>{zoneLabel(z, i)}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── SCENARIO TABLE ───
function ScenarioCard({ analysis, fieldValues }) {
  const { curve, breakevens, spot } = analysis;
  if (!curve || !spot) return null;

  const qty      = parseFloat(fieldValues.quantity || fieldValues.units || fieldValues.btc_amount || fieldValues.holdings || fieldValues.contracts || "1") || 1;
  const asset    = fieldValues.asset || "BTC";
  const notional = spot * qty;

  const legs    = analysis.legs || [];
  const strikes = legs.map(l => l.strike).filter(Boolean).sort((a, b) => a - b);
  const be      = (breakevens && breakevens[0]) || spot * 0.97;

  // Key scenario prices
  const rawPrices = [...new Set([
    Math.round(spot * 0.78),
    Math.round(spot * 0.88),
    Math.round(be),
    Math.round(spot),
    ...strikes.map(s => Math.round(s)),
    ...strikes.map(s => Math.round(s * 1.10)),
    Math.round(spot * 1.25),
  ].filter(p => p > 0))].sort((a, b) => a - b);

  // Remove near-duplicates (within 0.8% of spot)
  const minGap    = spot * 0.008;
  const keyPrices = rawPrices.filter((p, i) => i === 0 || p - rawPrices[i - 1] > minGap);

  // P&L function
  const findPnl = (price) => {
    if (analysis.pnlAtPrice) return analysis.pnlAtPrice(price);
    for (let i = 0; i < curve.length - 1; i++) {
      if (curve[i].price <= price && curve[i + 1].price >= price) {
        const r = (price - curve[i].price) / (curve[i + 1].price - curve[i].price);
        return curve[i].pnl + r * (curve[i + 1].pnl - curve[i].pnl);
      }
    }
    return 0;
  };

  // Option value (intrinsic at expiry, per strategy)
  const shortCallSt = legs.find(l => (l.action || "").toLowerCase() === "sell" && (l.type || "").toLowerCase().includes("call"))?.strike;
  const longPutSt   = legs.find(l => (l.action || "").toLowerCase() === "buy"  && (l.type || "").toLowerCase().includes("put") )?.strike;
  const optionVal   = (price) => {
    if (shortCallSt) {
      if (price > shortCallSt) return `${fmtPrice((price - shortCallSt) * qty)} (assigned)`;
      return "$0 (OTM)";
    }
    if (longPutSt) {
      if (price < longPutSt) return `${fmtPrice((longPutSt - price) * qty)} (ITM)`;
      return "$0 (OTM)";
    }
    return "—";
  };

  // Outcome label
  const outcome = (price, pnl) => {
    if (Math.abs(pnl) < notional * 0.001) return "Breakeven";
    if (pnl < 0) return "Loss";
    if (shortCallSt && price >= shortCallSt) return "Max gain (capped)";
    return "Profit";
  };

  const thSt = {
    padding: "10px 16px", fontFamily: "'Montserrat',sans-serif", fontSize: 8, fontWeight: 700,
    letterSpacing: "0.12em", textTransform: "uppercase", color: "#8A8A88",
    background: "#F5F4EF", borderBottom: "0.5px solid #E8E7E2", textAlign: "left",
  };
  const tdSt = {
    padding: "10px 16px", fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#4A4A48",
  };

  return (
    <div style={{ background: "#fff", border: "0.5px solid #E8E7E2", borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
      <div style={{ padding: "14px 20px", borderBottom: "0.5px solid #E8E7E2", fontFamily: "'Montserrat',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#8A8A88" }}>
        Scenario Analysis — P&amp;L at Expiry ({qty} {asset} Notional)
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thSt}>{asset} Price at Expiry</th>
            <th style={thSt}>Move vs Spot</th>
            <th style={thSt}>Option Value</th>
            <th style={thSt}>P&amp;L (incl. premium)</th>
            <th style={thSt}>Return on Notional</th>
            <th style={thSt}>Outcome</th>
          </tr>
        </thead>
        <tbody>
          {keyPrices.map((price, i) => {
            const isSpot = Math.abs(price - spot) < spot * 0.005;
            const isBe   = Math.abs(price - be)   < spot * 0.005;
            const pnl    = findPnl(price);
            const move   = spot > 0 ? ((price - spot) / spot) * 100 : 0;
            const ret    = notional > 0 ? (pnl / notional) * 100 : 0;
            const isLast = i === keyPrices.length - 1;
            const rowBorder = isLast ? "none" : "0.5px solid #E8E7E2";

            return (
              <tr key={i} style={{ background: isSpot ? "rgba(255,195,44,0.06)" : "transparent" }}>
                <td style={{ ...tdSt, borderBottom: rowBorder }}>
                  <strong>{fmtPrice(price)}</strong>
                  {isSpot && (
                    <span style={{ background: "rgba(255,195,44,0.15)", color: "#7A5500", fontFamily: "'Montserrat',sans-serif", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 10, marginLeft: 6 }}>
                      SPOT
                    </span>
                  )}
                </td>
                <td style={{ ...tdSt, borderBottom: rowBorder }}>{fmtPctVal(move)}</td>
                <td style={{ ...tdSt, borderBottom: rowBorder, fontSize: 11 }}>{optionVal(price)}</td>
                <td style={{ ...tdSt, borderBottom: rowBorder, fontFamily: "'Montserrat',sans-serif", fontWeight: 600, color: pnl > 0 ? "#16a34a" : pnl < 0 ? "#dc2626" : "#8A8A88" }}>
                  {isBe ? "$0 (breakeven)" : fmtPnlVal(pnl)}
                </td>
                <td style={{ ...tdSt, borderBottom: rowBorder, fontFamily: "'Montserrat',sans-serif", fontWeight: 600, color: ret > 0 ? "#16a34a" : ret < 0 ? "#dc2626" : "#8A8A88" }}>
                  {isBe ? "0.00%" : fmtPctVal(ret)}
                </td>
                <td style={{ ...tdSt, borderBottom: rowBorder, fontSize: 11 }}>{outcome(price, pnl)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── RISK ITEMS BY TRADE TYPE ───
function buildRiskItems(tradeId) {
  const map = {
    covered_call: [
      { title: "Upside Cap", description: "Returns are capped above the strike. If the asset rallies significantly, you will not participate in gains beyond the strike price." },
      { title: "Downside Exposure", description: "You retain full downside risk on the underlying. A decline below breakeven results in net losses not offset by the premium received." },
      { title: "Assignment Risk", description: "At expiry, if the call is in-the-money, the underlying asset will be called away at the strike price." },
      { title: "Re-Entry Risk", description: "If assigned, repurchasing the position at higher market prices may be costly depending on conditions at the time." },
    ],
    collar: [
      { title: "Upside Cap", description: "Gains are limited at the short call strike. The collar prevents participation in significant upside moves above the cap." },
      { title: "Net Premium Cost", description: "The collar's net cost or credit depends on the put/call premium differential and may erode base returns." },
      { title: "Assignment Risk", description: "If the short call is in-the-money at expiry, the underlying asset may be called away at the strike price." },
      { title: "Roll Risk", description: "Rolling the collar at expiry may carry higher cost if implied volatility has shifted materially." },
    ],
    put_spread: [
      { title: "Limited Protection", description: "The put spread only hedges between the long and short put strikes. Below the short put strike, you bear full downside." },
      { title: "Premium Cost", description: "The net premium paid is a fixed drag on returns and is lost entirely if protection is not needed." },
      { title: "Counterparty Risk", description: "OTC options carry bilateral credit exposure. Confirm counterparty creditworthiness before execution." },
      { title: "Liquidity Risk", description: "Wide bid-ask spreads on out-of-the-money puts may make it costly to unwind the position before expiry." },
    ],
    cash_secured_put: [
      { title: "Downside Exposure", description: "If the asset falls sharply below the strike, losses can be substantial and not fully offset by the premium received." },
      { title: "Capital Lock-Up", description: "The full notional must remain set aside to secure the put obligation for the duration of the trade." },
      { title: "Assignment Risk", description: "At expiry, if the put is in-the-money, you are obligated to purchase the underlying at the strike price." },
      { title: "Opportunity Cost", description: "Capital reserved to secure the put cannot be deployed in other opportunities during the trade period." },
    ],
    leap: [
      { title: "Time Decay", description: "Long options lose value through daily theta decay. The position must overcome time decay to be profitable." },
      { title: "Leverage Risk", description: "Options are leveraged instruments — a small adverse move in the underlying can cause large percentage losses on premium paid." },
      { title: "Implied Volatility", description: "A compression in implied volatility (vega risk) can reduce option value even if the underlying moves in your favour." },
      { title: "Liquidity Risk", description: "Long-dated options may carry wide spreads and lower liquidity, making early exits more expensive." },
    ],
    call_spread: [
      { title: "Capped Upside", description: "Maximum profit is limited to the spread width minus net premium. Moves beyond the short strike generate no additional gain." },
      { title: "Full Premium at Risk", description: "If the underlying fails to reach the long strike before expiry, the entire net premium paid is lost." },
      { title: "Time Decay", description: "Time decay works against long positions in the spread, requiring timely directional movement to be profitable." },
      { title: "Execution Slippage", description: "Multi-leg options structures can be more costly to execute and unwind, especially in fast-moving markets." },
    ],
    straddle: [
      { title: "High Premium Cost", description: "Purchasing both a call and a put requires a significant combined premium outlay that must be overcome." },
      { title: "Time Decay", description: "Both legs lose value through theta decay. A large move must occur before expiry for the trade to be profitable." },
      { title: "Volatility Crush", description: "A compression in implied volatility after a catalyst event can result in losses even if the underlying moves materially." },
      { title: "Two Breakevens", description: "The underlying must move significantly in either direction — the wider the straddle, the larger the required move." },
    ],
    strangle: [
      { title: "Large Move Required", description: "The underlying must move far beyond either strike for the strangle to reach profitability." },
      { title: "Time Decay", description: "OTM options lose value rapidly through theta. Time works against long strangles without a catalyst." },
      { title: "Volatility Crush", description: "A post-event volatility collapse can cause losses even with a large move in the underlying." },
      { title: "Liquidity Risk", description: "Far out-of-the-money strikes can have wide bid-ask spreads, increasing entry and exit costs." },
    ],
  };

  return map[tradeId] || [
    { title: "Market Risk", description: "The strategy's P&L is directly affected by movements in the underlying asset price." },
    { title: "Liquidity Risk", description: "Options and structured products may have wide spreads, especially near expiry." },
    { title: "Timing Risk", description: "The timing of entry and exit can significantly impact returns, particularly around key events." },
    { title: "Execution Risk", description: "OTC execution prices may differ from indicative pricing. Confirm live terms with the SDM Structuring Desk before execution." },
  ];
}

// ─── DANGER ICON SVG ───
const DangerIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5">
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
    <circle cx="12" cy="12" r="10"/>
  </svg>
);

// ─── MAIN REPORT ───
export default function TradeReport({ trade, fieldValues, loanComponent, onBack, onReset, onFieldChange }) {
  const reportRef = useRef(null);
  const [linkText, setLinkText] = useState("Link");
  const [showEditPanel, setShowEditPanel] = useState(false);

  const analysis   = useMemo(() => computeTradeAnalysis(trade.id, fieldValues), [trade.id, fieldValues]);
  if (!analysis) return null;

  const execSummary = useMemo(() => generateExecutiveSummary(trade.id, fieldValues), [trade.id, fieldValues]);

  const now     = new Date();
  const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const refId   = `SDM-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${(trade.tag || "TR").replace(/\s+/g, "-").toUpperCase()}`;

  // Format exec summary string into paragraphs
  const execParas = typeof execSummary === "string"
    ? execSummary.split(/\n\n+/).filter(Boolean)
    : [];

  const riskItems = buildRiskItems(trade.id);

  return (
    <div style={{ background: THEME.bg, minHeight: "100vh" }}>

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
          {onFieldChange && (
            <button onClick={() => setShowEditPanel(v => !v)} style={{
              background: showEditPanel ? "rgba(255,195,44,0.15)" : "none",
              border: `1px solid ${showEditPanel ? "#FFC32C" : "rgba(255,255,255,0.2)"}`,
              borderRadius: 6, color: showEditPanel ? "#FFC32C" : "rgba(255,255,255,0.7)",
              padding: "7px 14px", fontFamily: "'Poppins',sans-serif", fontSize: 12,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
            }}>
              {showEditPanel ? "✕ Close" : "✎ Edit Parameters"}
            </button>
          )}
          <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 11, letterSpacing: 2, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>{trade.tag}</div>
          <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 13, fontWeight: 600, color: "#fff" }}>{trade.label}</div>
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

      {/* ─── Inline Edit Parameters Panel ─── */}
      {showEditPanel && onFieldChange && (
        <div className="noprint" style={{
          background: THEME.bg2, borderBottom: `1px solid ${THEME.border}`,
          padding: "20px 48px",
        }}>
          <div style={{
            fontFamily: "'Montserrat',sans-serif", fontSize: 9, fontWeight: 700,
            letterSpacing: "0.12em", textTransform: "uppercase", color: THEME.textMuted,
            marginBottom: 14,
          }}>
            Edit Parameters
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "12px 24px",
          }}>
            {(trade.fields || [])
              .filter(f => f.key !== "executive_summary")
              .map(field => (
                <div key={field.key}>
                  <label style={{
                    fontFamily: "'Montserrat',sans-serif", fontSize: 9, fontWeight: 700,
                    letterSpacing: "0.1em", textTransform: "uppercase", color: THEME.textMuted,
                    display: "block", marginBottom: 4,
                  }}>
                    {field.labelFn ? field.labelFn(fieldValues) : field.label}
                  </label>
                  {field.type === "select" ? (
                    <select
                      value={fieldValues[field.key] || ""}
                      onChange={e => onFieldChange(field.key, e.target.value)}
                      style={{
                        width: "100%", padding: "6px 10px",
                        border: `1px solid ${THEME.border}`, borderRadius: 6,
                        background: THEME.bg, fontFamily: "'Poppins',sans-serif",
                        fontSize: 12, color: THEME.text, cursor: "pointer",
                      }}
                    >
                      {(field.options || []).map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={fieldValues[field.key] ?? ""}
                      onChange={e => onFieldChange(field.key, e.target.value)}
                      style={{
                        width: "100%", padding: "6px 10px",
                        border: `1px solid ${THEME.border}`, borderRadius: 6,
                        background: THEME.bg, fontFamily: "'Poppins',sans-serif",
                        fontSize: 12, color: THEME.text, boxSizing: "border-box",
                      }}
                    />
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

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
              <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 9, color: "rgba(255,255,255,0.2)", marginTop: 3 }}>Ref: {refId}</div>
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

          {/* ── ZONE-COLORED PAYOFF SVG ── */}
          <PayoffSVG analysis={analysis} fieldValues={fieldValues} />

          {/* ── SCENARIO TABLE ── */}
          <ScenarioCard analysis={analysis} fieldValues={fieldValues} />

          {/* ── TWO-COL: EXEC SUMMARY + KEY RISKS ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>

            {/* LEFT: Executive Summary */}
            <div>
              <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: THEME.textMuted, marginBottom: 12, paddingBottom: 8, borderBottom: `0.5px solid ${THEME.border}` }}>
                Executive Summary
              </div>

              {execParas.length > 0 && (
                <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, lineHeight: 1.85, color: "#4A4A48", fontWeight: 300 }}
                  dangerouslySetInnerHTML={{ __html: execParas[0].replace(/\n/g, "<br/>") }} />
              )}

              {/* Callout box — key trade metrics */}
              <div style={{ background: "rgba(255,195,44,0.08)", borderLeft: "3px solid #FFC32C", borderRadius: "0 6px 6px 0", padding: "14px 18px", margin: "16px 0" }}>
                <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, lineHeight: 1.7, color: "#1A1A18", fontWeight: 400 }}>
                  {analysis.metrics.slice(0, 2).map((m, i) => (
                    <span key={i}>{i > 0 && " · "}<strong>{m.label}:</strong> {m.value}{m.sub ? ` (${m.sub})` : ""}</span>
                  ))}
                </div>
              </div>

              {execParas.slice(1).map((p, i) => (
                <div key={i} style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, lineHeight: 1.85, color: "#4A4A48", fontWeight: 300, marginTop: 12 }}
                  dangerouslySetInnerHTML={{ __html: p.replace(/\n/g, "<br/>") }} />
              ))}
            </div>

            {/* RIGHT: Key Risk Considerations */}
            <div>
              <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: THEME.textMuted, marginBottom: 12, paddingBottom: 8, borderBottom: `0.5px solid ${THEME.border}` }}>
                Key Risk Considerations
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                {riskItems.map((risk, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 14px", background: THEME.bg2, borderRadius: 6 }}>
                    <div style={{ flexShrink: 0, width: 18, height: 18, background: "rgba(220,38,38,0.1)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <DangerIcon />
                    </div>
                    <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#4A4A48", lineHeight: 1.6 }}>
                      <strong>{risk.title}.</strong> {risk.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── LOAN STRUCTURE (optional) ── */}
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
                    { label: "Gross Loan",       value: $k(loan.grossLoan),        sub: loan.loanCurrency },
                    { label: "Net Proceeds",      value: $k(loan.netLoanProceeds),  sub: `After ${lendFmt(loan.arrangementFeeRate * 100)}% fee` },
                    { label: "Quarterly Interest",value: $k(loan.quarterlyPayment), sub: `${(loan.annualRate * 100).toFixed(0)}% p.a.` },
                    { label: "Margin Call",       value: $k(loan.marginCallPrice),  sub: "70% of FMP trigger" },
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
                    ["Collateral",       `${lendFmt(loan.collateralUnits)} ${loan.collateralAsset}`],
                    ["Collateral Value", `$${lendFmt(loan.collateralValue)}`],
                    ["LTV",              `${(loan.ltv * 100).toFixed(0)}%`],
                    ["Term",             `${loan.termMonths} months`],
                    ["Arrangement Fee",  `$${lendFmt(loan.arrangementFeeAmount)}`],
                    ["Total Interest",   `$${lendFmt(loan.totalInterest)}`],
                    ["All-In Cost",      `$${lendFmt(loan.totalCost)}`],
                    ["Effective Rate",   `${loan.effectiveRate.toFixed(2)}% p.a.`],
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

          {/* ── CTA BAR ── */}
          <div style={{ background: "#1A1A18", borderRadius: 10, padding: "24px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 0 }}>
            <div>
              <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 6 }}>
                Ready to execute?
              </div>
              <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
                Confirm Terms with SDM Structuring Desk
              </div>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                Live pricing valid for 15 minutes · Reference: {refId}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
              <div style={{ padding: "10px 22px", background: "#FFC32C", borderRadius: 20, fontFamily: "'Montserrat',sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "#1A1A18", cursor: "pointer" }}>
                Confirm &amp; Execute
              </div>
              <div style={{ padding: "10px 22px", background: "rgba(255,255,255,0.07)", borderRadius: 20, fontFamily: "'Montserrat',sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "rgba(255,255,255,0.4)", cursor: "pointer" }}>
                Revise Terms
              </div>
            </div>
          </div>

        </div>{/* /content */}

        {/* ── FOOTER ── */}
        <div style={{ background: THEME.text, padding: "20px 40px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 10, color: "rgba(255,255,255,0.3)", lineHeight: 1.6 }}>
            © {now.getFullYear()} Secure Digital Markets<br/>
            Generated by SDM Trade Studio · sdm.io
          </div>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 9, color: "rgba(255,255,255,0.2)", maxWidth: 440, textAlign: "right", lineHeight: 1.5 }}>
            This report is prepared for informational purposes only for the named recipient and does not constitute financial advice or a binding offer. All pricing is indicative. Digital assets involve substantial risk of loss.
          </div>
        </div>

      </div>
    </div>
  );
}
