import { useRef, useState, useCallback, useEffect } from "react";
import { fmt, fmtInt } from "./lendingEngine";

// ─── Light theme tokens ───
const THEME = {
  bg: "#FDFCF7",
  bg2: "#F5F4EF",
  border: "#E8E7E2",
  borderLight: "#E8E7E2",
  text: "#1A1A18",
  textMuted: "#8A8A88",
  gold: "#FFC32C",
  positive: "#16a34a",
  negative: "#dc2626",
};

const sectionLabel = { fontFamily: "'Montserrat',sans-serif", fontSize: 11, letterSpacing: 2, color: "#8A8A88", textTransform: "uppercase", fontWeight: 600 };
const sectionTitle = { fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 16, color: "#1A1A18" };

// ─── RICH TEXT TOOLBAR ───
function RichTextToolbar() {
  const exec = (cmd, val) => document.execCommand(cmd, false, val || null);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 10px", background: "#F5F4EF", border: "1px solid #E8E7E2", borderBottom: "none" }}>
      <button type="button" onMouseDown={e => { e.preventDefault(); exec("bold"); }} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 8px", fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#4A4A48", borderRadius: 4 }}><strong>B</strong></button>
      <button type="button" onMouseDown={e => { e.preventDefault(); exec("italic"); }} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 8px", fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#4A4A48", borderRadius: 4 }}><em>I</em></button>
      <button type="button" onMouseDown={e => { e.preventDefault(); exec("underline"); }} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 8px", fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#4A4A48", borderRadius: 4 }}><u>U</u></button>
      <div style={{ width: 1, height: 16, background: "#E8E7E2", margin: "0 4px" }} />
      <button type="button" onMouseDown={e => { e.preventDefault(); exec("formatBlock", "<h3>"); }} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 8px", fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#4A4A48", borderRadius: 4 }}>H</button>
      <button type="button" onMouseDown={e => { e.preventDefault(); exec("formatBlock", "<p>"); }} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 8px", fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#4A4A48", borderRadius: 4 }}>P</button>
      <div style={{ width: 1, height: 16, background: "#E8E7E2", margin: "0 4px" }} />
      <button type="button" onMouseDown={e => { e.preventDefault(); exec("insertUnorderedList"); }} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 8px", color: "#4A4A48", borderRadius: 4 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="3" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="3" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>
      </button>
    </div>
  );
}

const SDM_LOGO_SVG = `data:image/svg+xml,${encodeURIComponent(`<?xml version="1.0" encoding="UTF-8"?><svg id="Camada_1" data-name="Camada 1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 600 231.11"><defs><style>.cls-1{fill:#fff;}.cls-1,.cls-2{stroke-width:0px;}.cls-2{fill:#eec13f;}.cls-3{filter:url(#outer-glow-1);}</style><filter id="outer-glow-1" filterUnits="userSpaceOnUse"><feOffset dx="0" dy="0"/><feGaussianBlur result="blur" stdDeviation="9.89"/><feFlood flood-color="#1851eb" flood-opacity=".28"/><feComposite in2="blur" operator="in"/><feComposite in="SourceGraphic"/></filter></defs><g class="cls-3"><path class="cls-2" d="M38.49,62.99v-12.32c55.08-23.68,103.1-23.66,158.16,0v39.04l-15.32-6.1v-20.36c-35.12-14.65-74.87-20.1-111-5.74l126.04,50.13c-.35,6.04-1.03,11.87-2.04,17.34L38.49,62.99Z"/><path class="cls-2" d="M113.53,203.69c-31.51-18.3-64.08-42.26-74.37-78.81l20.76,7.81c10.7,21.74,31.47,37.38,57.79,53.27,20.35-12.42,34.29-22.88,44.65-34.23l-123.57-49.15c-.36-5.44-.29-12.72-.29-18.27,11.62,4.64,143.04,56.81,149.86,59.74-15.41,27.83-43.18,46.57-70.64,61.69l-4.18-2.07Z"/></g><path class="cls-1" d="M295.28,159.49c-15.27,0-28-3.4-38.87-10.39l6.11-12.22c9.9,6.2,20.8,9.35,32.41,9.35,17.08,0,20.67-5.43,20.67-9.98,0-6.7-5.61-8.38-21.39-9.75-29-2.56-34.5-10.23-34.5-23.48,0-14.92,13.03-23.83,34.87-23.83,12.94,0,23.68,2.86,32.78,8.75l-5.56,11.72c-7.69-4.73-16.82-7.22-26.51-7.22-12.24,0-19.26,3.55-19.26,9.75,0,6.69,5.61,8.37,21.39,9.74,29,2.57,34.5,10.24,34.5,23.49,0,10.98-6.35,24.06-36.63,24.06Z"/><polygon class="cls-1" points="525.36 158.08 525.36 101.02 523.1 100.55 498.16 158.08 487.15 158.08 462.21 100.55 459.95 101.02 459.95 158.08 444.81 158.08 444.81 80.6 468.22 80.6 493.07 137.8 517.79 80.6 541.32 80.6 541.32 158.08 525.36 158.08"/><path class="cls-1" d="M389.06,80.59h-36.04v13.37h34.16c16.42,0,25.84,9.25,25.84,25.37s-9.42,25.37-25.84,25.37h-18.49v-39.9h-15.67v53.28h36.04c25.22,0,40.27-14.48,40.27-38.75s-15.06-38.74-40.27-38.74Z"/></svg>`)}`;

function handleExportPDF(reportRef) {
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
<title>Lending Proposal &mdash; SDM</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #FDFCF7; color: #1A1A18; font-family: 'Poppins', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
${cssText}
@media print {
  @page { size: A4; margin: 0 !important; }
  *, *::before, *::after { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { background: #FDFCF7 !important; padding: 12mm !important; }
  .noprint, .report-actions { display: none !important; }
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
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #FDFCF7; color: #1A1A18; font-family: 'Poppins', sans-serif; padding: 32px; }
.noprint, .report-actions { display: none !important; }
${cssText}
</style></head>
<body><div style="max-width:900px;margin:0 auto;padding:0 20px;">${reportHtml}</div></body></html>`;
}

async function handleLendingShareLink(reportRef, data, setLinkText) {
  if (!reportRef.current) return;
  setLinkText("Creating...");
  const fullHtml = buildLendingStandaloneHtml(reportRef);
  try {
    const date = new Date().toISOString().slice(0, 10);
    const borrower = (data?.borrowerName || "client").replace(/[^a-zA-Z0-9]+/g, "-");
    const filename = `SDM-Lending-${borrower}-${date}.html`;
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

export default function LendingReport({ data, fieldValues, onBack, onReset }) {
  const reportRef = useRef(null);
  const editorRef = useRef(null);
  const [execHtml, setExecHtml] = useState(fieldValues?.executive_summary ? `<p>${fieldValues.executive_summary.replace(/\n/g, "</p><p>")}</p>` : "");
  const [execHover, setExecHover] = useState(false);
  const [linkText, setLinkText] = useState("Link");

  const handleExecBlur = useCallback(() => {
    if (editorRef.current) setExecHtml(editorRef.current.innerHTML);
  }, []);

  if (!data || data.error) {
    return (
      <div style={{ textAlign: "center", padding: "40px", fontFamily: "'Poppins',sans-serif" }}>
        <p style={{ color: "#8A8A88", marginBottom: 16 }}>{data?.error || "No data"}</p>
        <button onClick={onBack} style={{ background: "#FDFCF7", border: "1px solid #E8E7E2", borderRadius: 6, padding: "8px 16px", color: "#1A1A18", cursor: "pointer", fontFamily: "'Poppins',sans-serif", fontSize: 13 }}>Back</button>
      </div>
    );
  }

  const $ = (v) => `$${fmt(v)}`;
  const $k = (v) => {
    const num = typeof v === "number" ? v : parseFloat(String(v).replace(/[,$\s]/g, ""));
    if (isNaN(num)) return `$${v}`;
    return `$${num.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const shareBarBtn = (label, onClick, icon) => (
    <button onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 2, color: "rgba(255,255,255,0.7)", padding: "7px 14px", fontFamily: "'Poppins',sans-serif", fontSize: 12, cursor: "pointer" }}>
      {icon}{label}
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
            <button onClick={onBack} style={{ background: "none", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "rgba(255,255,255,0.7)", padding: "7px 14px", fontFamily: "'Poppins',sans-serif", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              Edit
            </button>
          )}
          <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 11, letterSpacing: 2, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Lending</div>
          <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 13, fontWeight: 600, color: "#FFFFFF" }}>{data.collateralAsset}-Backed Loan Facility</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => window.open(`https://t.me/share/url?text=${encodeURIComponent(`SDM Lending Proposal: ${data.collateralAsset}-Backed Loan — ${data.borrowerName}`)}`, "_blank")} style={{ background: "none", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "rgba(255,255,255,0.7)", padding: "7px 14px", fontFamily: "'Poppins',sans-serif", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
            Telegram
          </button>
          <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`SDM Lending Proposal: ${data.collateralAsset}-Backed Loan — ${data.borrowerName}`)}`, "_blank")} style={{ background: "none", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "rgba(255,255,255,0.7)", padding: "7px 14px", fontFamily: "'Poppins',sans-serif", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
            WhatsApp
          </button>
          <button onClick={() => window.open(`mailto:?subject=${encodeURIComponent(`SDM Lending Proposal: ${data.collateralAsset}-Backed Loan`)}&body=${encodeURIComponent(`Lending proposal for ${data.borrowerName}`)}`, "_blank")} style={{ background: "none", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "rgba(255,255,255,0.7)", padding: "7px 14px", fontFamily: "'Poppins',sans-serif", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 4L12 13 2 4"/></svg>
            Email
          </button>
          <button onClick={() => handleExportPDF(reportRef)} style={{ background: "none", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "rgba(255,255,255,0.7)", padding: "7px 14px", fontFamily: "'Poppins',sans-serif", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            PDF
          </button>
          <button onClick={() => handleLendingShareLink(reportRef, data, setLinkText)} style={{ background: "#FFC32C", border: "none", borderRadius: 999, color: "#1A1A18", padding: "8px 20px", fontFamily: "'Montserrat',sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer" }}>
            {linkText}
          </button>
          <button onClick={onReset} style={{ background: "none", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "rgba(255,255,255,0.5)", padding: "7px 14px", fontFamily: "'Poppins',sans-serif", fontSize: 12, cursor: "pointer" }}>
            New Proposal
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
                <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)", letterSpacing: 1, textTransform: "uppercase" }}>Lending Proposal</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{dateStr}</div>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>Ref: SDM-LOAN-{new Date().getFullYear()}</div>
            </div>
          </div>
        </div>
        {/* Gold gradient rule */}
        <div style={{ height: 3, background: "linear-gradient(90deg, #FFC32C 0%, rgba(255,195,44,0.25) 60%, transparent 100%)" }} />
        {/* Hero */}
        <div style={{ padding: "36px 40px 32px", borderBottom: "0.5px solid #E8E7E2", background: "#FDFCF7" }}>
          <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 9, letterSpacing: 2, color: "#16a34a", textTransform: "uppercase", fontWeight: 700, background: "#dcfce7", padding: "5px 14px", borderRadius: 999, display: "inline-block", marginBottom: 20 }}>LENDING PROPOSAL</span>
          <h1 style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 800, fontSize: 30, color: "#1A1A18", marginBottom: 10, lineHeight: 1.1 }}>
            {data.collateralAsset}-Backed Loan Facility
          </h1>
          <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#8A8A88", fontWeight: 300 }}>
            Prepared for {data.borrowerName} &mdash; {data.termMonths}-Month Secured Lending Arrangement
          </p>
        </div>

        {/* ─── Padded report body ─── */}
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 48px" }}>

        {/* Metrics Strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", borderBottom: "0.5px solid #E8E7E2", marginBottom: 32, marginLeft: -48, marginRight: -48 }}>
          {[
            { label: "Net Loan Proceeds", value: $k(data.netLoanProceeds), sub: data.loanCurrency, color: "#16a34a" },
            { label: "Collateral Value", value: $k(data.collateralValue), sub: `${fmt(data.collateralUnits)} ${data.collateralAsset}`, color: "#FFC32C" },
            { label: "LTV Ratio", value: `${(data.ltv * 100).toFixed(0)}%`, sub: "Loan-to-Value", color: "#1A1A18" },
            { label: "Annual Rate", value: `${(data.annualRate * 100).toFixed(0)}%`, sub: "Paid quarterly in arrears", color: "#1A1A18" },
            { label: "All-In Cost", value: $k(data.totalCost), sub: "Fee + interest over term", color: "#dc2626" },
            { label: "Effective Rate", value: `${data.effectiveRate.toFixed(2)}%`, sub: "Annualized all-in cost", color: "#1A1A18" },
          ].map((kpi, i, arr) => (
            <div key={i} style={{
              padding: "18px 20px",
              borderRight: i < arr.length - 1 ? "0.5px solid #E8E7E2" : "none",
            }}>
              <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 8, letterSpacing: 1.5, color: "#8A8A88", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>{kpi.label}</div>
              <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 17, color: kpi.color, marginBottom: 4 }}>{kpi.value}</div>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 10, color: "#8A8A88" }}>{kpi.sub}</div>
            </div>
          ))}
        </div>

        {/* Executive Summary */}
        <div
          style={{ marginBottom: 32, padding: 24, background: "rgba(255,195,44,0.06)", border: "0.5px solid #E8E7E2", borderLeft: "3px solid #FFC32C", borderRadius: "0 10px 10px 0", position: "relative" }}
          onMouseEnter={() => setExecHover(true)}
          onMouseLeave={() => setExecHover(false)}
        >
          <div style={sectionLabel}>Executive Summary</div>
          <div style={{ transition: "opacity 0.15s, max-height 0.15s", opacity: execHover ? 1 : 0, maxHeight: execHover ? 40 : 0, overflow: "hidden", marginTop: execHover ? 12 : 0, marginBottom: execHover ? 8 : 0 }}>
            <RichTextToolbar />
          </div>
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            dangerouslySetInnerHTML={{ __html: execHtml || data.summary.split("\n\n").map(p => `<p>${p}</p>`).join("") }}
            onBlur={handleExecBlur}
            style={{
              fontFamily: "'Poppins',sans-serif", fontSize: 14, lineHeight: 1.7, color: "#1A1A18", outline: "none",
              background: execHover ? "#FDFCF7" : "transparent",
              border: execHover ? "1px solid #E8E7E2" : "1px solid transparent",
              borderRadius: 6, padding: "12px 14px", minHeight: 80, marginTop: 12,
              transition: "background 0.15s, border-color 0.15s",
              cursor: "text",
            }}
          />
        </div>

        {/* Loan Structure */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ ...sectionLabel, marginBottom: 12 }}>Loan Structure</div>
          <div style={{ border: "0.5px solid #E8E7E2", borderRadius: 10, overflow: "hidden" }}>
            {[
              { label: "Collateral Asset", value: data.collateralAsset },
              { label: "Collateral Units", value: fmt(data.collateralUnits) },
              { label: "Price Per Unit (FMP)", value: $(data.pricePerUnit) },
              { label: "Total Collateral Value", value: $(data.collateralValue) },
              { label: `Gross Loan (${(data.ltv * 100).toFixed(0)}% LTV)`, value: $(data.grossLoan) },
              { label: `Arrangement Fee (${(data.arrangementFeeRate * 100).toFixed(0)}%)`, value: `-${$(data.arrangementFeeAmount)}`, negative: true },
              { label: "Net Loan Proceeds", value: $(data.netLoanProceeds), highlight: true },
              { label: "Loan Term", value: `${data.termMonths} months` },
            ].map(({ label, value, negative, highlight }, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", padding: "12px 20px",
                borderBottom: "0.5px solid #E8E7E2",
                background: highlight ? "#f0fdf4" : "transparent",
              }}>
                <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#8A8A88" }}>{label}</span>
                <span style={{
                  fontFamily: "'Montserrat',sans-serif", fontSize: 13, fontWeight: highlight ? 700 : 600,
                  color: negative ? "#dc2626" : highlight ? "#16a34a" : "#1A1A18",
                }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Cost of Borrowing */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ ...sectionLabel, marginBottom: 12 }}>Cost of Borrowing</div>
          <div style={{ border: "0.5px solid #E8E7E2", borderRadius: 10, overflow: "hidden" }}>
            {[
              { label: "Arrangement Fee", value: $(data.arrangementFeeAmount) },
              { label: "Quarterly Interest Payment", value: $(data.quarterlyPayment) },
              { label: "Total Quarters", value: String(data.totalQuarters) },
              { label: "Total Interest", value: $(data.totalInterest) },
              { label: "All-In Cost", value: $(data.totalCost), highlight: true },
              { label: "Effective Annual Rate", value: `${data.effectiveRate.toFixed(2)}%` },
            ].map(({ label, value, highlight }, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", padding: "12px 20px",
                borderBottom: "0.5px solid #E8E7E2",
                background: highlight ? "#fef2f2" : "transparent",
              }}>
                <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#8A8A88" }}>{label}</span>
                <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 13, fontWeight: highlight ? 700 : 600, color: highlight ? "#dc2626" : "#1A1A18" }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Schedule */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ ...sectionLabel, marginBottom: 12 }}>Payment Schedule</div>
          <div style={{ border: "0.5px solid #E8E7E2", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Poppins',sans-serif", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F5F4EF" }}>
                  {["Quarter", "Month", "Interest Due", "Cumulative Interest", "Outstanding Principal"].map((h, i) => (
                    <th key={i} style={{ padding: "10px 16px", textAlign: i === 0 || i === 1 ? "left" : "right", ...sectionLabel, borderBottom: "0.5px solid #E8E7E2", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.schedule.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "0.5px solid #E8E7E2" }}>
                    <td style={{ padding: "10px 16px", color: "#1A1A18", fontWeight: 500 }}>Q{row.quarter}</td>
                    <td style={{ padding: "10px 16px", color: "#8A8A88" }}>Month {row.monthEnd}</td>
                    <td style={{ padding: "10px 16px", textAlign: "right", color: "#1A1A18" }}>{$(row.interestPayment)}</td>
                    <td style={{ padding: "10px 16px", textAlign: "right", color: "#4A4A48" }}>{$(row.cumulativeInterest)}</td>
                    <td style={{ padding: "10px 16px", textAlign: "right", color: "#4A4A48" }}>{$(row.outstandingPrincipal)}</td>
                  </tr>
                ))}
                <tr style={{ background: "#F5F4EF", borderTop: "1px solid #E8E7E2" }}>
                  <td colSpan="2" style={{ padding: "10px 16px", fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 12, color: "#1A1A18" }}>Maturity</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "'Montserrat',sans-serif", fontWeight: 700, color: "#1A1A18" }}>{$(data.totalInterest)}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "'Montserrat',sans-serif", fontWeight: 700, color: "#1A1A18" }}>{$(data.totalInterest)}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "'Montserrat',sans-serif", fontWeight: 700, color: "#16a34a" }}>{$(data.grossLoan)} (returned)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Risk Management */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ ...sectionLabel, marginBottom: 12 }}>Margin Call &amp; Risk Management</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Margin Call Trigger", value: $(data.marginCallPrice), sub: "70% of FMP for 3 consecutive business days", color: "#dc2626", bg: "#fef2f2", border: "#fca5a5" },
              { label: "Cure Period", value: `${data.marginCureDays} days`, sub: "Business days to remedy margin notice", color: "#1A1A18", bg: "#F5F4EF", border: "#E8E7E2" },
              { label: "Price Buffer", value: `${((1 - data.marginCallPrice / data.pricePerUnit) * 100).toFixed(1)}%`, sub: `Decline from ${$(data.pricePerUnit)} before trigger`, color: "#16a34a", bg: "#f0fdf4", border: "#86efac" },
            ].map((card, i) => (
              <div key={i} style={{ background: card.bg, border: `1px solid ${card.border}`, borderRadius: 10, padding: "16px 18px" }}>
                <div style={sectionLabel}>{card.label}</div>
                <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 22, color: card.color, margin: "8px 0 4px" }}>{card.value}</div>
                <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#8A8A88", lineHeight: 1.4 }}>{card.sub}</div>
              </div>
            ))}
          </div>

          <div style={{ border: "0.5px solid #E8E7E2", borderRadius: 10, padding: "20px 24px" }}>
            <div style={{ ...sectionLabel, marginBottom: 14 }}>Default Cure Options</div>
            {[
              { num: "1", title: "Partial Repayment", desc: "Return a portion of loan proceeds in stablecoins (USDC/USDT) or fiat (USD/CAD/EUR/GBP)" },
              { num: "2", title: "Additional Collateral", desc: `Transfer additional ${data.collateralAsset} to restore the margin threshold` },
              { num: "3", title: "Walk Away", desc: "Retain loan proceeds and forfeit collateral (all outstanding interest must be current)" },
            ].map((opt, i) => (
              <div key={i} style={{ display: "flex", gap: 14, padding: "12px 0", borderBottom: i < 2 ? "0.5px solid #E8E7E2" : "none" }}>
                <div style={{ width: 24, height: 24, background: "#1A1A18", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "'Montserrat',sans-serif", fontSize: 11, fontWeight: 700, color: "#FFFFFF" }}>{opt.num}</div>
                <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#4A4A48", lineHeight: 1.5 }}>
                  <strong style={{ color: "#1A1A18" }}>{opt.title}</strong> &mdash; {opt.desc}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Key Terms */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ ...sectionLabel, marginBottom: 12 }}>Key Terms &amp; Conditions</div>
          <div style={{ border: "0.5px solid #E8E7E2", borderRadius: 10, padding: "20px 24px" }}>
            {[
              "Minimum loan size: $500,000 USD",
              "No collateral rebalancing on the upside — if collateral appreciates, no automatic withdrawal",
              "No early repayment option on the loan",
              "3-day pricing model (Fair Market Price) based on average of last sale price on 3 consecutive business days",
              "Collateral returned at maturity assuming all interest paid and principal returned within 7 days",
              "Settlement: test transfer followed by final balance to dedicated SDM Lending Wallet",
            ].map((term, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: i < 5 ? "0.5px solid #E8E7E2" : "none", alignItems: "flex-start" }}>
                <span style={{ width: 4, height: 4, background: "#FFC32C", borderRadius: "50%", marginTop: 7, flexShrink: 0 }} />
                <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#4A4A48", lineHeight: 1.5 }}>{term}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <div style={{ padding: "16px 20px", background: "#F5F4EF", border: "0.5px solid #E8E7E2", borderRadius: 10, marginBottom: 24 }}>
          <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#8A8A88", lineHeight: 1.6 }}>
            This material is for informational use only and does not constitute financial or investment advice. The terms, conditions, and policies outlined herein are subject to change without notice. Digital assets used as collateral may fluctuate significantly due to market volatility. Crypto-backed lending involves substantial risk and may not be suitable for all borrowers.
          </p>
        </div>

        {/* Footer */}
        <div style={{ borderTop: "3px solid #1A1A18", paddingTop: 2 }}>
          <div style={{ height: 2, background: "#FFC32C", marginBottom: 20 }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: 2, color: "#1A1A18" }}>SECURE DIGITAL MARKETS</div>
              <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#8A8A88", marginTop: 4 }}>
                The Institutional Choice for <strong style={{ color: "#FFC32C" }}>Digital</strong> Asset Trading
              </p>
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              <a href="mailto:sales@sdm.co" style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#4A4A48", textDecoration: "none" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 4L12 13 2 4"/></svg>
                sales@sdm.co
              </a>
              <a href="https://twitter.com/SD_Markets" target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#4A4A48", textDecoration: "none" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                @SD_Markets
              </a>
              <a href="https://t.me/SecureDigitalMarkets" target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#4A4A48", textDecoration: "none" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                Telegram
              </a>
            </div>
          </div>
          <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#8A8A88", marginTop: 16 }}>Confidential — For intended recipient only. Not investment advice.</p>
        </div>
        </div>
      </div>
    </div>
  );
}
