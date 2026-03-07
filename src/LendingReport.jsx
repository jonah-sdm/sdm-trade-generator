import { useRef, useState, useCallback } from "react";
import { fmt, fmtInt } from "./lendingEngine";

// ─── RICH TEXT TOOLBAR (same as TradeReport) ───
function RichTextToolbar() {
  const exec = (cmd, val) => document.execCommand(cmd, false, val || null);
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

const SDM_LOGO_SVG = `data:image/svg+xml,${encodeURIComponent(`<?xml version="1.0" encoding="UTF-8"?><svg id="Camada_1" data-name="Camada 1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 600 231.11"><defs><style>.cls-1{fill:#fff;}.cls-1,.cls-2{stroke-width:0px;}.cls-2{fill:#eec13f;}.cls-3{filter:url(#outer-glow-1);}</style><filter id="outer-glow-1" filterUnits="userSpaceOnUse"><feOffset dx="0" dy="0"/><feGaussianBlur result="blur" stdDeviation="9.89"/><feFlood flood-color="#1851eb" flood-opacity=".28"/><feComposite in2="blur" operator="in"/><feComposite in="SourceGraphic"/></filter></defs><g class="cls-3"><path class="cls-2" d="M38.49,62.99v-12.32c55.08-23.68,103.1-23.66,158.16,0v39.04l-15.32-6.1v-20.36c-35.12-14.65-74.87-20.1-111-5.74l126.04,50.13c-.35,6.04-1.03,11.87-2.04,17.34L38.49,62.99Z"/><path class="cls-2" d="M113.53,203.69c-31.51-18.3-64.08-42.26-74.37-78.81l20.76,7.81c10.7,21.74,31.47,37.38,57.79,53.27,20.35-12.42,34.29-22.88,44.65-34.23l-123.57-49.15c-.36-5.44-.29-12.72-.29-18.27,11.62,4.64,143.04,56.81,149.86,59.74-15.41,27.83-43.18,46.57-70.64,61.69l-4.18-2.07Z"/></g><path class="cls-1" d="M295.28,159.49c-15.27,0-28-3.4-38.87-10.39l6.11-12.22c9.9,6.2,20.8,9.35,32.41,9.35,17.08,0,20.67-5.43,20.67-9.98,0-6.7-5.61-8.38-21.39-9.75-29-2.56-34.5-10.23-34.5-23.48,0-14.92,13.03-23.83,34.87-23.83,12.94,0,23.68,2.86,32.78,8.75l-5.56,11.72c-7.69-4.73-16.82-7.22-26.51-7.22-12.24,0-19.26,3.55-19.26,9.75,0,6.69,5.61,8.37,21.39,9.74,29,2.57,34.5,10.24,34.5,23.49,0,10.98-6.35,24.06-36.63,24.06Z"/><polygon class="cls-1" points="525.36 158.08 525.36 101.02 523.1 100.55 498.16 158.08 487.15 158.08 462.21 100.55 459.95 101.02 459.95 158.08 444.81 158.08 444.81 80.6 468.22 80.6 493.07 137.8 517.79 80.6 541.32 80.6 541.32 158.08 525.36 158.08"/><path class="cls-1" d="M389.06,80.59h-36.04v13.37h34.16c16.42,0,25.84,9.25,25.84,25.37s-9.42,25.37-25.84,25.37h-18.49v-39.9h-15.67v53.28h36.04c25.22,0,40.27-14.48,40.27-38.75s-15.06-38.74-40.27-38.74Z"/></svg>`)}`;

function handleExportPDF(reportRef) {
  if (!reportRef.current) return;

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
<title>Lending Proposal &mdash; SDM</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Sora:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #0a0a0f; --bg2: #111118; --bg3: #16161f; --bg4: #1c1c28;
  --border: rgba(255,255,255,0.06); --border-light: rgba(255,255,255,0.12);
  --border-gold: rgba(255,195,44,0.20);
  --text: #f0f0f5; --text-muted: #8a8a9a; --text-dim: #55556a;
  --amber: #F5A623; --gold: var(--amber); --gold-dark: #D4910A; --accent: #4ade80;
  --font-display: 'Sora', sans-serif; --font-body: 'Sora', 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --font-serif: 'Sora', -apple-system, sans-serif;
  --shadow-xs: 0 1px 2px rgba(0,0,0,0.3);
  --shadow-sm: 0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3);
  --gradient-brand: linear-gradient(135deg, #FFC32C 0%, #D4A017 100%);
  --gradient-gold: #FFC32C;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: var(--bg); color: var(--text); font-family: var(--font-body); -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
${cssText}
@media print {
  @page { size: A4; margin: 0 !important; }
  *, *::before, *::after { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
  html { background: #0a0a0f !important; }
  body {
    background: #0a0a0f !important;
    padding: 12mm !important;
    width: 100% !important;
    max-width: 100% !important;
    overflow: hidden !important;
  }
  .report { max-width: 100% !important; gap: 28px !important; }
  .report-section { break-inside: avoid; }
  .lending-schedule-table { break-inside: avoid; }
  .report-share-bar, .report-actions, .btn-edit-thesis, .btn-save-thesis, .btn-back, .btn-new-trade { display: none !important; }
  .header, .footer, .breadcrumb { display: none !important; }
}
</style>
</head>
<body>
<div style="max-width:900px;margin:0 auto;padding:0 20px;">
${reportHtml}
</div>
</body>
</html>`;

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); }, 800);
}

function buildLendingStandaloneHtml(reportRef) {
  if (!reportRef.current) return '';
  const styleSheets = Array.from(document.styleSheets);
  let cssText = "";
  styleSheets.forEach(sheet => {
    try { Array.from(sheet.cssRules).forEach(rule => { cssText += rule.cssText + "\n"; }); } catch (e) {}
  });
  let reportHtml = reportRef.current.outerHTML;
  reportHtml = reportHtml.replace(/src="\/sdm-logo[^"]*\.svg"/g, `src="${SDM_LOGO_SVG}"`)
                         .replace(/src="\/sdm-logo[^"]*\.png"/g, `src="${SDM_LOGO_SVG}"`);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Lending Proposal — SDM</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Sora:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #0a0a0f; --bg2: #111118; --bg3: #16161f; --bg4: #1c1c28;
  --border: rgba(255,255,255,0.06); --border-light: rgba(255,255,255,0.12);
  --text: #f0f0f5; --text-muted: #8a8a9a; --text-dim: #55556a;
  --amber: #F5A623; --gold: var(--amber); --gold-dark: #D4910A;
  --font-display: 'Sora', sans-serif; --font-body: 'Sora', 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --font-serif: 'Sora', -apple-system, sans-serif;
}
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
body { background: var(--bg); color: var(--text); font-family: var(--font-body); padding: 32px; }
.report-share-bar, .report-actions, .btn-edit-thesis, .btn-save-thesis, .btn-back, .btn-new-trade { display: none !important; }
${cssText}
</style></head>
<body><div style="max-width:900px;margin:0 auto;padding:0 20px;">${reportHtml}</div></body></html>`;
}

async function handleLendingShareLink(reportRef, data, setLinkText) {
  if (!reportRef.current) return;
  setLinkText("Saving...");
  const fullHtml = buildLendingStandaloneHtml(reportRef);
  const filename = `SDM-Lending-${data.collateralAsset}-${new Date().toISOString().slice(0, 10)}.html`;
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

export default function LendingReport({ data, fieldValues, onBack, onReset }) {
  const reportRef = useRef(null);
  const editorRef = useRef(null);
  const [execHtml, setExecHtml] = useState(fieldValues?.executive_summary ? `<p>${fieldValues.executive_summary.replace(/\n/g, "</p><p>")}</p>` : "");
  const [execEditing, setExecEditing] = useState(false);
  const [linkText, setLinkText] = useState("Link");

  const handleEditorSave = useCallback(() => {
    if (editorRef.current) {
      setExecHtml(editorRef.current.innerHTML);
    }
    setExecEditing(false);
  }, []);

  if (!data || data.error) {
    return (
      <div style={{ textAlign: "center", padding: "40px" }}>
        <p style={{ color: "var(--text-muted)" }}>{data?.error || "No data"}</p>
        <button className="btn-back" onClick={onBack}>Back</button>
      </div>
    );
  }

  const $ = (v) => `$${fmt(v)}`;
  // Compact format for KPI cards — no decimals for large numbers
  const $k = (v) => {
    const num = typeof v === "number" ? v : parseFloat(String(v).replace(/[,$\s]/g, ""));
    if (isNaN(num)) return `$${v}`;
    return `$${num.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  return (
    <>
      {/* Report body — uses same .report class as TradeReport */}
      <div className="report" ref={reportRef} style={{ "--accent": "#4ade80" }}>

        {/* Report Header */}
        <div className="report-header reveal-section reveal-delay-1">
          <div className="report-header-left">
            <div className="report-badge">
              <span className="report-icon">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20"/><circle cx="12" cy="16" r="2"/></svg>
              </span>
              <span className="report-tag" style={{ background: "rgba(74,222,128,0.10)", borderColor: "rgba(74,222,128,0.15)", color: "#4ade80" }}>LENDING PROPOSAL</span>
            </div>
            <h1 className="report-title">{data.collateralAsset}-Backed Loan Facility</h1>
            <p className="report-category">Prepared for {data.borrowerName} &mdash; {data.termMonths}-Month Secured Lending Arrangement</p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="report-kpis reveal-section reveal-delay-2">
          <div className="kpi-card" style={{ borderLeftColor: "#4ade80" }}>
            <div className="kpi-label">Net Loan Proceeds</div>
            <div className="kpi-value" style={{ color: "#4ade80" }}>{$k(data.netLoanProceeds)}</div>
            <div className="kpi-sub">{data.loanCurrency}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Collateral Value</div>
            <div className="kpi-value">{$k(data.collateralValue)}</div>
            <div className="kpi-sub">{fmt(data.collateralUnits)} {data.collateralAsset}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">LTV Ratio</div>
            <div className="kpi-value">{(data.ltv * 100).toFixed(0)}%</div>
            <div className="kpi-sub">Loan-to-Value</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Annual Rate</div>
            <div className="kpi-value">{(data.annualRate * 100).toFixed(0)}%</div>
            <div className="kpi-sub">Paid quarterly in arrears</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">All-In Cost</div>
            <div className="kpi-value" style={{ color: "#f87171" }}>{$k(data.totalCost)}</div>
            <div className="kpi-sub">Fee + interest over term</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Effective Rate</div>
            <div className="kpi-value">{data.effectiveRate.toFixed(2)}%</div>
            <div className="kpi-sub">Annualized all-in cost</div>
          </div>
        </div>

        {/* Executive Summary — editable */}
        <div className="report-section exec-summary reveal-section reveal-delay-3">
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
                dangerouslySetInnerHTML={{ __html: execHtml || data.summary.split("\n\n").map(p => `<p>${p}</p>`).join("") }}
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
                  {data.summary.split("\n\n").map((para, i) => (
                    <p key={i} className="exec-text">{para}</p>
                  ))}
                  <p className="thesis-placeholder" style={{ marginTop: 12 }}>Click "Edit" to customize the executive summary...</p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Loan Structure */}
        <div className="report-section reveal-section reveal-delay-4">
          <div className="section-header">
            <h2 className="section-title">Loan Structure</h2>
          </div>
          <div className="lending-details-grid">
            <div className="lending-detail">
              <span className="lending-detail-label">Collateral Asset</span>
              <span className="lending-detail-value">{data.collateralAsset}</span>
            </div>
            <div className="lending-detail">
              <span className="lending-detail-label">Collateral Units</span>
              <span className="lending-detail-value">{fmt(data.collateralUnits)}</span>
            </div>
            <div className="lending-detail">
              <span className="lending-detail-label">Price Per Unit (FMP)</span>
              <span className="lending-detail-value">{$(data.pricePerUnit)}</span>
            </div>
            <div className="lending-detail">
              <span className="lending-detail-label">Total Collateral Value</span>
              <span className="lending-detail-value">{$(data.collateralValue)}</span>
            </div>
            <div className="lending-detail">
              <span className="lending-detail-label">Gross Loan (65% LTV)</span>
              <span className="lending-detail-value">{$(data.grossLoan)}</span>
            </div>
            <div className="lending-detail">
              <span className="lending-detail-label">Arrangement Fee (2%)</span>
              <span className="lending-detail-value" style={{ color: "#f87171" }}>-{$(data.arrangementFeeAmount)}</span>
            </div>
            <div className="lending-detail lending-detail-highlight">
              <span className="lending-detail-label">Net Loan Proceeds</span>
              <span className="lending-detail-value">{$(data.netLoanProceeds)}</span>
            </div>
            <div className="lending-detail">
              <span className="lending-detail-label">Loan Term</span>
              <span className="lending-detail-value">{data.termMonths} months</span>
            </div>
          </div>
        </div>

        {/* Cost of Borrowing */}
        <div className="report-section reveal-section reveal-delay-5">
          <div className="section-header">
            <h2 className="section-title">Cost of Borrowing</h2>
          </div>
          <div className="lending-details-grid">
            <div className="lending-detail">
              <span className="lending-detail-label">Arrangement Fee</span>
              <span className="lending-detail-value">{$(data.arrangementFeeAmount)}</span>
            </div>
            <div className="lending-detail">
              <span className="lending-detail-label">Quarterly Interest Payment</span>
              <span className="lending-detail-value">{$(data.quarterlyPayment)}</span>
            </div>
            <div className="lending-detail">
              <span className="lending-detail-label">Total Quarters</span>
              <span className="lending-detail-value">{data.totalQuarters}</span>
            </div>
            <div className="lending-detail">
              <span className="lending-detail-label">Total Interest</span>
              <span className="lending-detail-value">{$(data.totalInterest)}</span>
            </div>
            <div className="lending-detail lending-detail-highlight">
              <span className="lending-detail-label">All-In Cost</span>
              <span className="lending-detail-value">{$(data.totalCost)}</span>
            </div>
            <div className="lending-detail">
              <span className="lending-detail-label">Effective Annual Rate</span>
              <span className="lending-detail-value">{data.effectiveRate.toFixed(2)}%</span>
            </div>
          </div>
        </div>

        {/* Payment Schedule */}
        <div className="report-section reveal-section reveal-delay-6">
          <div className="section-header">
            <h2 className="section-title">Payment Schedule</h2>
          </div>
          <div className="lending-schedule-table">
            <table>
              <thead>
                <tr>
                  <th>Quarter</th>
                  <th>Month</th>
                  <th>Interest Due</th>
                  <th>Cumulative Interest</th>
                  <th>Outstanding Principal</th>
                </tr>
              </thead>
              <tbody>
                {data.schedule.map((row, i) => (
                  <tr key={i}>
                    <td>Q{row.quarter}</td>
                    <td>Month {row.monthEnd}</td>
                    <td>{$(row.interestPayment)}</td>
                    <td>{$(row.cumulativeInterest)}</td>
                    <td>{$(row.outstandingPrincipal)}</td>
                  </tr>
                ))}
                <tr className="schedule-total-row">
                  <td colSpan="2">Maturity</td>
                  <td>{$(data.totalInterest)}</td>
                  <td>{$(data.totalInterest)}</td>
                  <td>{$(data.grossLoan)} (returned)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Risk Management */}
        <div className="report-section reveal-section reveal-delay-7">
          <div className="section-header">
            <h2 className="section-title">Margin Call &amp; Risk Management</h2>
          </div>
          <div className="lending-risk-section">
            <div className="lending-risk-card">
              <div className="lending-risk-label">Margin Call Trigger</div>
              <div className="lending-risk-value risk-warn">{$(data.marginCallPrice)}</div>
              <div className="lending-risk-sub">70% of FMP for 3 consecutive business days</div>
            </div>
            <div className="lending-risk-card">
              <div className="lending-risk-label">Cure Period</div>
              <div className="lending-risk-value">{data.marginCureDays} days</div>
              <div className="lending-risk-sub">Business days to remedy margin notice</div>
            </div>
            <div className="lending-risk-card">
              <div className="lending-risk-label">Price Buffer</div>
              <div className="lending-risk-value" style={{ color: "#4ade80" }}>{((1 - data.marginCallPrice / data.pricePerUnit) * 100).toFixed(1)}%</div>
              <div className="lending-risk-sub">Decline from {$(data.pricePerUnit)} before trigger</div>
            </div>
          </div>

          <div className="lending-risk-options">
            <h3 className="lending-risk-options-title">Default Cure Options</h3>
            <div className="lending-option">
              <span className="lending-option-num">1</span>
              <div>
                <strong>Partial Repayment</strong> &mdash; Return a portion of loan proceeds in stablecoins (USDC/USDT) or fiat (USD/CAD/EUR/GBP)
              </div>
            </div>
            <div className="lending-option">
              <span className="lending-option-num">2</span>
              <div>
                <strong>Additional Collateral</strong> &mdash; Transfer additional {data.collateralAsset} to restore the margin threshold
              </div>
            </div>
            <div className="lending-option">
              <span className="lending-option-num">3</span>
              <div>
                <strong>Walk Away</strong> &mdash; Retain loan proceeds and forfeit collateral (all outstanding interest must be current)
              </div>
            </div>
          </div>
        </div>

        {/* Key Terms */}
        <div className="report-section reveal-section reveal-delay-8">
          <div className="section-header">
            <h2 className="section-title">Key Terms &amp; Conditions</h2>
          </div>
          <div className="lending-terms-list">
            <div className="lending-term-item">
              <span className="lending-term-bullet" />
              <span>Minimum loan size: $500,000 USD</span>
            </div>
            <div className="lending-term-item">
              <span className="lending-term-bullet" />
              <span>No collateral rebalancing on the upside &mdash; if collateral appreciates, no automatic withdrawal</span>
            </div>
            <div className="lending-term-item">
              <span className="lending-term-bullet" />
              <span>No early repayment option on the loan</span>
            </div>
            <div className="lending-term-item">
              <span className="lending-term-bullet" />
              <span>3-day pricing model (Fair Market Price) based on average of last sale price on 3 consecutive business days</span>
            </div>
            <div className="lending-term-item">
              <span className="lending-term-bullet" />
              <span>Collateral returned at maturity assuming all interest paid and principal returned within 7 days</span>
            </div>
            <div className="lending-term-item">
              <span className="lending-term-bullet" />
              <span>Settlement: test transfer followed by final balance to dedicated SDM Lending Wallet</span>
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="report-disclaimer">
          This material is for informational use only and does not constitute financial or investment advice. The terms, conditions, and policies outlined herein are subject to change without notice. Digital assets used as collateral may fluctuate significantly due to market volatility. Crypto-backed lending involves substantial risk and may not be suitable for all borrowers.
        </div>

        {/* Footer CTA */}
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
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                Telegram
              </a>
            </div>
          </div>
          <p className="footer-cta-legal">Confidential &mdash; For intended recipient only. Not investment advice.</p>
        </div>

        {/* Share & Export Bar — identical to trade report */}
        <div className="report-share-bar">
          <img src="/sdm-logo-full.svg" alt="SDM" className="share-bar-logo" />
          <div className="share-group">
            <span className="share-label">Share</span>
            <button className="share-btn share-telegram" onClick={() => {
              const text = `SDM Lending Proposal: ${data.collateralAsset}-Backed Loan — ${data.borrowerName}`;
              window.open(`https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(text)}`);
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              Telegram
            </button>
            <button className="share-btn share-whatsapp" onClick={() => {
              const text = `SDM Lending Proposal: ${data.collateralAsset}-Backed Loan — ${data.borrowerName}\n${window.location.href}`;
              window.open(`https://wa.me/?text=${encodeURIComponent(text)}`);
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
              WhatsApp
            </button>
            <button className="share-btn share-email" onClick={() => {
              const subject = `SDM Lending Proposal: ${data.collateralAsset}-Backed Loan`;
              const body = `Lending proposal for ${data.borrowerName}\n\n${window.location.href}`;
              window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 4L12 13 2 4"/></svg>
              Email
            </button>
            <button className="share-btn share-pdf" onClick={() => handleExportPDF(reportRef)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              PDF
            </button>
          </div>
          <div className="share-group">
            <button className="btn-export-pdf" onClick={() => handleLendingShareLink(reportRef, data, setLinkText)}>
              {linkText}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="report-actions">
          {onBack && <button className="btn-back" onClick={onBack}>&larr; Edit Parameters</button>}
          <button className="btn-new-trade" onClick={onReset}>New Proposal</button>
        </div>
      </div>
    </>
  );
}
