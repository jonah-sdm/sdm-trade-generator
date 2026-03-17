import { useState, useCallback, useEffect, useRef, memo } from "react";
import { TRADE_TYPES } from "./tradeTypes";
import { checkCanvaStatus, startCanvaAuth, exportToCanva, buildReplacements } from "./canvaService";
import { computeTradeAnalysis } from "./payoffEngine";
import { computeLendingProposal, SUPPORTED_ASSETS } from "./lendingEngine";
import TradeReport from "./TradeReport";
import LendingReport from "./LendingReport";
import "./index.css";

const ASK_AI_PRESETS = [
  { id: "strategy-selector", label: "Help me pick the right strategy", prompt: "Client is ready to act but unsure which strategy fits current market conditions. They want the AI to evaluate the setup and recommend the right structure \u2014 whether that\u2019s a cash-secured put, a LEAP, a combination of both, or no trade at all. Walk through the decision in order: IV environment first, then conviction level, then available capital. Do not force a strategy that doesn\u2019t fit the setup. If conditions don\u2019t justify a trade, say so." },
  { id: "put-strike-optimizer", label: "I want to sell a put \u2014 where should I set the strike?", prompt: "Client is considering selling a cash-secured put and wants to find the right strike. Identify key support levels on both the daily and weekly chart based on historical price action. Recommend a strike at or below those levels that still offers meaningful premium, targeting roughly 80% probability of the premium being kept. Calculate the effective cost basis if assigned (strike minus premium). If no available strike offers a risk/reward worth taking, recommend skipping the trade entirely." },
  { id: "covered-call-timing", label: "Should I sell a covered call right now?", prompt: "Client owns shares and wants to know if now is the right time to sell a covered call. Check RSI on both daily and weekly timeframes for overbought signals. Identify the nearest resistance levels where price has historically stalled. Recommend a strike above the client\u2019s cost basis that sits near a resistance level, targeting approximately 0.20 delta at 30 DTE. Calculate total profit including capital gains and all premium collected if shares are called away at that strike. If the trend is still strong and capping upside would be a mistake, recommend waiting rather than selling for the sake of activity." },
  { id: "leap-entry-check", label: "Is it a good time to buy a long-dated option?", prompt: "Client wants to buy a LEAP and needs confirmation that all entry conditions are aligned before committing capital. Check: daily and weekly RSI for oversold signals; whether price is at a meaningful support level with historical buyer activity; IV rank relative to its recent range (low IV preferred); and whether the options chain is liquid at the strikes being considered. For a 360+ day contract, recommend a strike that balances leverage with a realistic probability of profit. Return a clear go / no-go verdict. If conditions are not aligned, specify exactly what the client should be waiting for." },
  { id: "position-sizing", label: "How big should this position be?", prompt: "Client wants to open an options position and needs a position sizing stress test before entering. Calculate what percentage of the total portfolio would be locked into this position if assigned after a 30% adverse move. Flag any sector concentration or overlap with existing holdings. Determine how many contracts or shares at the strike price can be held while keeping sufficient capital available for other opportunities. Recommend a maximum allocation size where a worst-case outcome is painful but not catastrophic. Client has a known tendency to oversize when conviction is high \u2014 factor that in." },
  { id: "wheel-tracker", label: "Review my wheel strategy and plan the next move", prompt: "Client is running a wheel strategy and wants a full cycle P&L review and next-step recommendation. Using the current position details (whether in the put-selling, assigned, or covered call phase), calculate: adjusted cost basis after all premium collected to date; total cycles completed and cumulative premium; annualized return at the current pace. If currently selling covered calls, identify a strike above cost basis near a resistance level. Assess whether it makes more sense to let shares get called away now or to continue collecting premium for additional cycles." },
  { id: "early-exit-analysis", label: "Should I take profit now or wait until expiry?", prompt: "Client has sold an option and wants to model the optimal exit strategy. Calculate the buyback price that locks in 50% of premium collected. Estimate how many days it should take to reach that target based on typical theta decay at the current DTE. Compare annualized return for closing at 50% profit in 7\u201310 days vs. holding to expiration. If the position moves against the client before hitting the 50% target, define the specific price point where rolling becomes preferable to waiting \u2014 and model what a roll looks like (expiration, strike, and whether it can be executed for a net credit)." },
  { id: "earnings-risk", label: "Is it safe to hold this position through an upcoming event?", prompt: "Client has an open options position with an upcoming earnings event and needs a risk assessment before the report. Calculate the expected move currently priced into the options market. Review the last 3\u20134 earnings reactions \u2014 gap up, gap down, or flat. If the client is short a put, assess whether a negative earnings gap could take price below the strike overnight. Determine whether the premium collected is sufficient to cushion a worst-case move. Recommend whether to close before earnings, hold through, or roll to a later expiration. If the risk/reward doesn\u2019t justify holding through a binary event, recommend closing." },
  { id: "leap-tax-timing", label: "Should I wait to sell for better tax treatment?", prompt: "Client holds a LEAP with unrealized gains and wants to optimize the exit timing around long-term capital gains tax treatment. Calculate the exact date the one-year holding period is reached. Estimate the tax difference between selling today at short-term rates vs. waiting for long-term rates, using the client\u2019s tax bracket. Assess how quickly theta decay is accelerating at the current DTE and how much time value is being lost per week. Check whether price is approaching overbought conditions or a resistance zone before the one-year mark. Given the tax savings vs. the risk of holding longer, recommend whether to hold or take profits now." },
  { id: "exit-plan-builder", label: "Write me an exit plan before I enter this trade", prompt: "Client is about to open a position and wants a complete exit plan written before entering, so they can reference it objectively if the trade becomes emotional. Build the plan for all three scenarios: (1) Trade works \u2014 at what profit level to close, and whether to scale out or exit all at once; (2) Trade moves against the client \u2014 the specific price at which to roll vs. cut the loss, and what would invalidate the original thesis; (3) Nothing happens \u2014 stock goes sideways and the position approaches expiration. Also flag any earnings dates, ex-dividend dates, or other catalysts between entry and expiration that could affect the position." },
];

const AI_RESPONSE_THEMES = {
  light: { bg: "#FFFFFF", surface: "#FAFAFA", card: "#FFFFFF", border: "#E8E8E8", accent: "#FFC32C", text: "#111111", muted: "#888888" },
};

const PHASES = {
  HOME: "home",
  SELECT: "select",
  UPLOAD: "upload",
  CONFIGURE: "configure",
  GENERATING: "generating",
  RESULT: "result",
  LENDING_CONFIGURE: "lending_configure",
  LENDING_GENERATING: "lending_generating",
  LENDING_RESULT: "lending_result",
  SALES_LIBRARY: "sales_library",
  AI_CONFIGURE: "ai_configure",
  AI_GENERATING: "ai_generating",
  AI_REVIEW: "ai_review",
};

const PHASE_TITLES = {
  [PHASES.HOME]: "SDM Trade Idea Studio",
  [PHASES.SELECT]: "Select Trade — SDM Trade Idea Studio",
  [PHASES.UPLOAD]: "Upload — SDM Trade Idea Studio",
  [PHASES.CONFIGURE]: "Configure — SDM Trade Idea Studio",
  [PHASES.GENERATING]: "Generating — SDM Trade Idea Studio",
  [PHASES.RESULT]: "Report — SDM Trade Idea Studio",
  [PHASES.LENDING_CONFIGURE]: "Lending Calculator — SDM",
  [PHASES.LENDING_GENERATING]: "Generating Proposal — SDM",
  [PHASES.LENDING_RESULT]: "Lending Proposal — SDM",
  [PHASES.SALES_LIBRARY]: "Sales Library — SDM",
  [PHASES.AI_CONFIGURE]: "Ask AI — Derivatives Studio",
  [PHASES.AI_GENERATING]: "Analyzing — Ask AI",
  [PHASES.AI_REVIEW]: "Review AI Trade — Derivatives Studio",
};

// ─── SDM Logo ───
function SDMLogo({ width = 140 }) {
  return (
    <div style={{ display: "block", flexShrink: 0, overflow: "visible", lineHeight: 0 }}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 245"
        width={width} overflow="visible" style={{ display: "block" }}>
        <path fill="#FFC32C" d="M69.38,81.61v-7.42c33.16-14.24,62.06-14.24,95.18,0v23.5l-9.22-3.66v-12.26c-21.14-8.77-45.06-12.1-66.81-3.46l75.87,30.17c-.2,3.5-.61,6.98-1.23,10.43l-93.8-37.3Z"/>
        <path fill="#FFC32C" d="M114.54,166.32c-18.96-11.01-38.57-25.45-44.76-47.42l12.5,4.69c6.45,13.09,18.95,22.5,34.78,32.07,12.24-7.48,20.63-13.77,26.86-20.6l-74.37-29.54c-.21-3.28-.17-7.66-.17-11,6.98,2.83,86.09,34.19,90.19,35.95-9.28,16.75-25.99,28.02-42.52,37.13l-2.52-1.29Z"/>
        <g fill="#111111">
          <path d="M201.37,113.41l4.17-8.34c5.67,3.76,12.33,5.75,19.13,5.74,7.44,0,11.33-1.78,11.33-5.12s-2.38-4.16-11.81-4.99c-15.44-1.36-20.69-4.99-20.69-14.34s7.79-14.55,20.97-14.55c7.06-.23,14.01,1.71,19.94,5.54l-3.83,8.06c-4.68-3.02-10.14-4.59-15.71-4.52-6.63,0-10.54,1.85-10.54,4.99s2.39,4.17,11.81,4.99c15.44,1.37,20.69,4.99,20.69,14.35s-7.53,14.67-21.99,14.67c-9.32,0-16.9-2.11-23.47-6.48Z"/>
          <path d="M270.19,100.29h26.9v-9.14h-37.55v27.92h41.99v-9.16h-31.34v-9.62Z"/>
          <path d="M259.54,72.64v9.14h41.99v-9.14h-41.99Z"/>
          <path d="M314.77,96.06c0-15.06,10.17-24.25,26.15-24.25,6.01-.15,11.93,1.49,17,4.71l-3.13,8.62c-3.89-2.52-8.41-3.87-13.04-3.9-9.97,0-16.12,5.66-16.12,14.68s6.21,14.55,16.57,14.55c4.91.01,9.72-1.39,13.86-4.04l3.49,8.6c-4.52,3.21-10.86,4.85-18.07,4.85-16.81,0-26.7-9.01-26.7-23.83Z"/>
          <path d="M372.26,101.93v-29.29h10.65v27.58c0,7.03,3.77,10.32,11.69,10.32s11.67-3.28,11.67-10.32v-27.58h10.18v29.29c0,11.48-8,17.95-22.13,17.95s-22.07-6.48-22.07-17.95Z"/>
          <path d="M463.12,119.07l-11.54-17.08h-11.72v17.08h-10.65v-46.43h27.65c10.8,0,16.57,5.12,16.57,14.68,0,7.37-3.42,12.05-9.97,13.86l12.21,17.89h-12.56ZM439.86,92.85h15.81c4.71,0,6.9-1.78,6.9-5.53s-2.18-5.54-6.9-5.54h-15.81v11.07Z"/>
          <path d="M499.28,100.29h26.9v-9.14h-37.55v27.92h41.99v-9.16h-31.34v-9.62Z"/>
          <path d="M488.63,72.64v9.14h41.99v-9.14h-41.99Z"/>
          <text x="201.5" y="159" fontFamily="'Montserrat','Helvetica Neue',Arial,sans-serif"
            fontSize="13.5" fontWeight="600" letterSpacing="3.2" fill="#111111">DIGITAL MARKETS</text>
        </g>
      </svg>
    </div>
  );
}

// ─── MarketBeat Header ───
function AppHeader({ onReset }) {
  return (
    <header style={{ background: "#FFFFFF", borderBottom: "1px solid #E8E8E8" }}>
      <div style={{ height: 3, background: "#111" }} />
      <div style={{ height: 2, background: "#FFC32C" }} />
      <div style={{ padding: "16px 48px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div onClick={onReset}>
          <SDMLogo width={140} />
        </div>
        <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 11, letterSpacing: 2, color: "#888", textTransform: "uppercase" }}>
          Trade Idea Studio
        </div>
      </div>
      <div style={{ height: 2, background: "#FFC32C" }} />
      <div style={{ height: 3, background: "#111" }} />
    </header>
  );
}

function TradeCard({ trade, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "#FFFFFF",
        border: selected ? "2px solid #111" : "1px solid #E8E8E8",
        borderTop: selected ? "3px solid #FFC32C" : "3px solid transparent",
        borderRadius: 2,
        padding: "24px 20px",
        textAlign: "left",
        cursor: "pointer",
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: selected ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
      onMouseEnter={e => { if (!selected) { e.currentTarget.style.borderColor = "#111"; e.currentTarget.style.borderTopColor = "#FFC32C"; } }}
      onMouseLeave={e => { if (!selected) { e.currentTarget.style.borderColor = "#E8E8E8"; e.currentTarget.style.borderTopColor = "transparent"; } }}
    >
      <div style={{ fontSize: 22, marginBottom: 4 }}>{trade.icon}</div>
      <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 10, letterSpacing: 2, color: "#888", textTransform: "uppercase", fontWeight: 600 }}>{trade.tag}</div>
      <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 15, color: "#111", lineHeight: 1.2 }}>{trade.label}</div>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#888", fontWeight: 400 }}>{trade.category}</div>
      <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#555", lineHeight: 1.5, marginTop: 4 }}>{trade.description}</div>
      {selected && <div style={{ marginTop: 8, height: 2, background: "#FFC32C", borderRadius: 1 }} />}
    </button>
  );
}

function RichTextFieldToolbar() {
  const exec = (cmd, val) => document.execCommand(cmd, false, val || null);
  return (
    <div className="rt-toolbar rt-toolbar-field">
      <button type="button" className="rt-btn rt-btn-bold" onMouseDown={e => { e.preventDefault(); exec("bold"); }} title="Bold">B</button>
      <button type="button" className="rt-btn rt-btn-italic" onMouseDown={e => { e.preventDefault(); exec("italic"); }} title="Italic"><em>I</em></button>
      <button type="button" className="rt-btn rt-btn-underline" onMouseDown={e => { e.preventDefault(); exec("underline"); }} title="Underline"><u>U</u></button>
      <div className="rt-sep" />
      <button type="button" className="rt-btn" onMouseDown={e => { e.preventDefault(); exec("insertUnorderedList"); }} title="Bullet list">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="3" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="3" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>
      </button>
      <button type="button" className="rt-btn" onMouseDown={e => { e.preventDefault(); exec("insertOrderedList"); }} title="Numbered list">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="2" y="8" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text><text x="2" y="14" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text><text x="2" y="20" fontSize="8" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text></svg>
      </button>
      <div className="rt-sep" />
      <select className="rt-select" onChange={e => { exec("fontSize", e.target.value); e.target.value = ""; }} defaultValue="">
        <option value="" disabled>Size</option>
        <option value="2">Small</option>
        <option value="3">Normal</option>
        <option value="4">Large</option>
      </select>
    </div>
  );
}

function FieldInput({ field, value, onChange }) {
  const editorRef = useRef(null);

  const inputStyle = {
    width: "100%",
    background: "#FFFFFF",
    border: "1px solid #E8E8E8",
    borderRadius: 2,
    padding: "10px 12px",
    fontSize: 13,
    color: "#111",
    fontFamily: "'Poppins',sans-serif",
    outline: "none",
    transition: "border-color 0.15s",
  };

  if (field.type === "textarea") {
    return (
      <div className="field-group field-group-wide">
        <label style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 11, letterSpacing: 1.5, color: "#888", textTransform: "uppercase", fontWeight: 600, display: "block", marginBottom: 6 }}>{field.label}</label>
        <RichTextFieldToolbar />
        <div
          ref={editorRef}
          className="rt-editor rt-editor-field"
          contentEditable
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{ __html: value ? `<p>${String(value).replace(/\n/g, "</p><p>")}</p>` : "" }}
          onBlur={() => {
            if (editorRef.current) onChange(field.key, editorRef.current.innerHTML);
          }}
          style={{ ...inputStyle, minHeight: 100, padding: "10px 12px" }}
        />
      </div>
    );
  }
  if (field.type === "select") {
    return (
      <div className="field-group">
        <label style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 11, letterSpacing: 1.5, color: "#888", textTransform: "uppercase", fontWeight: 600, display: "block", marginBottom: 6 }}>{field.label}</label>
        <select
          style={{ ...inputStyle, appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23888' strokeWidth='1.5' fill='none' strokeLinecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
          value={value || ""}
          onChange={e => onChange(field.key, e.target.value)}
        >
          <option value="">Select...</option>
          {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>
    );
  }
  const isNum = field.type === "number";
  const displayValue = isNum && value
    ? value.replace(/,/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    : (value || "");
  return (
    <div className="field-group">
      <label style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 11, letterSpacing: 1.5, color: "#888", textTransform: "uppercase", fontWeight: 600, display: "block", marginBottom: 6 }}>{field.label}</label>
      <input
        style={inputStyle}
        type="text"
        inputMode={isNum ? "decimal" : undefined}
        placeholder={field.placeholder}
        value={displayValue}
        onFocus={e => { e.target.style.borderColor = "#111"; e.target.style.outline = "none"; }}
        onBlur={e => { e.target.style.borderColor = "#E8E8E8"; }}
        onChange={e => {
          const raw = isNum ? e.target.value.replace(/,/g, "") : e.target.value;
          if (isNum && raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
          onChange(field.key, raw);
        }}
      />
    </div>
  );
}

const DOC_TYPE_MAP = [
  { match: /deck|pitch/i, type: "Pitch Deck", icon: "deck", color: "#2563eb", desc: "Presentation deck for client meetings and pitches" },
  { match: /1\s*pager|one.pager/i, type: "One-Pager", icon: "page", color: "#16a34a", desc: "Single-page product summary and key highlights" },
  { match: /overview/i, type: "Overview", icon: "overview", color: "#7c3aed", desc: "Comprehensive product overview and terms" },
  { match: /lending|loan/i, type: "Lending", icon: "lending", color: "#059669", desc: "Lending product details, terms, and structures" },
  { match: /corporate/i, type: "Corporate", icon: "corp", color: "#d97706", desc: "Company overview, structure, and capabilities" },
  { match: /derivative|option|call|put|carry/i, type: "Derivatives", icon: "deriv", color: "#db2777", desc: "Derivatives strategy breakdown and trade examples" },
  { match: /algo|trading/i, type: "Trading", icon: "trade", color: "#0891b2", desc: "Trading product details and execution strategies" },
  { match: /tax|planning/i, type: "Tax", icon: "tax", color: "#ea580c", desc: "Tax planning strategies and compliance frameworks" },
  { match: /payment/i, type: "Payments", icon: "pay", color: "#65a30d", desc: "Payment infrastructure and settlement solutions" },
  { match: /miner|mining/i, type: "Mining", icon: "mine", color: "#ca8a04", desc: "Mining operations, treasury, and financing solutions" },
  { match: /treasury|bitcoin/i, type: "Treasury", icon: "treasury", color: "#b45309", desc: "Bitcoin treasury strategy and corporate adoption" },
  { match: /product/i, type: "Product", icon: "product", color: "#9333ea", desc: "Full product suite overview and service catalogue" },
  { match: /welcome/i, type: "Welcome", icon: "welcome", color: "#0e7490", desc: "Introduction to SDM and onboarding guide" },
  { match: /spot/i, type: "Spot Trading", icon: "spot", color: "#0284c7", desc: "Spot trading execution and OTC desk capabilities" },
  { match: /auto.sell/i, type: "Auto Sell", icon: "auto", color: "#7c3aed", desc: "Automated selling strategies and DCA programs" },
  { match: /ecosystem/i, type: "Ecosystem", icon: "eco", color: "#0f766e", desc: "SDM ecosystem map and integrated service overview" },
  { match: /property|real.estate/i, type: "Real Estate", icon: "property", color: "#be123c", desc: "Crypto-backed lending for property acquisitions" },
];

function getDocMeta(name) {
  for (const entry of DOC_TYPE_MAP) {
    if (entry.match.test(name)) return entry;
  }
  return { type: "Document", icon: "doc", color: "#888888", desc: "SDM sales and marketing collateral" };
}

const LENDING_FIELDS = [
  { key: "borrowerName", label: "Borrower / Client Name", type: "text", placeholder: "e.g. Acme Capital" },
  { key: "collateralAsset", label: "Collateral Asset", type: "select", options: SUPPORTED_ASSETS },
  { key: "collateralUnits", label: "Collateral Units", type: "number", placeholder: "e.g. 10" },
  { key: "pricePerUnit", label: "Price Per Unit (USD)", type: "number", placeholder: "e.g. 95000" },
  { key: "ltv", label: "Loan-to-Value (%)", type: "number", placeholder: "e.g. 65" },
  { key: "annualRate", label: "Annual Interest Rate (%)", type: "number", placeholder: "e.g. 8" },
  { key: "arrangementFee", label: "Arrangement Fee (%)", type: "number", placeholder: "e.g. 2" },
  { key: "termMonths", label: "Loan Term (Months)", type: "select", options: ["1", "3", "6", "12", "18", "24", "36"] },
  { key: "loanCurrency", label: "Loan Currency", type: "select", options: ["USD", "CAD", "EUR", "GBP"] },
  { key: "executive_summary", label: "Executive Summary (optional)", type: "textarea", placeholder: "Add custom notes, context, or override the auto-generated summary..." },
];

// ─── Styles ───
const S = {
  page: { background: "#FFFFFF", minHeight: "100vh", fontFamily: "'Poppins',sans-serif" },
  main: { maxWidth: 1100, margin: "0 auto", padding: "40px 48px" },
  mainWide: { maxWidth: 1200, margin: "0 auto", padding: "40px 48px" },
  sectionLabel: { fontFamily: "'Montserrat',sans-serif", fontSize: 11, letterSpacing: 2, color: "#888", textTransform: "uppercase", fontWeight: 600 },
  heading1: { fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 28, color: "#111", letterSpacing: -0.5 },
  heading2: { fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 20, color: "#111" },
  subtext: { fontFamily: "'Poppins',sans-serif", fontSize: 14, color: "#888", fontWeight: 300, lineHeight: 1.6 },
  card: { background: "#FFFFFF", border: "1px solid #E8E8E8", borderRadius: 2, padding: "24px" },
  btnPrimary: {
    background: "#111", color: "#FFFFFF", border: "none", borderRadius: 2,
    padding: "12px 28px", fontFamily: "'Montserrat',sans-serif", fontWeight: 600,
    fontSize: 13, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 8,
  },
  btnSecondary: {
    background: "#FFFFFF", color: "#111", border: "1px solid #111", borderRadius: 2,
    padding: "10px 20px", fontFamily: "'Montserrat',sans-serif", fontWeight: 600,
    fontSize: 12, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 6,
  },
  btnBack: {
    background: "#FFFFFF", color: "#888", border: "1px solid #E8E8E8", borderRadius: 2,
    padding: "8px 16px", fontFamily: "'Poppins',sans-serif", fontWeight: 400,
    fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
  },
  divider: { height: 1, background: "#E8E8E8", margin: "32px 0" },
  pill: { display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 2, fontSize: 10, fontFamily: "'Montserrat',sans-serif", fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase" },
  genStep: { display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid #E8E8E8", fontFamily: "'Poppins',sans-serif", fontSize: 14, color: "#888" },
  genStepDone: { color: "#111" },
};

export default function App() {
  const [phase, setPhase] = useState(PHASES.HOME);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [fieldValues, setFieldValues] = useState({});
  const [error, setError] = useState(null);
  const [generatingStep, setGeneratingStep] = useState(0);
  const [canvaConnected, setCanvaConnected] = useState(false);
  const [canvaResult, setCanvaResult] = useState(null);
  const [canvaExporting, setCanvaExporting] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackType, setFeedbackType] = useState("feedback");
  const [feedbackFiles, setFeedbackFiles] = useState([]);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [lendingValues, setLendingValues] = useState({ termMonths: "1", loanCurrency: "USD", collateralAsset: "BTC", ltv: "65", annualRate: "8", arrangementFee: "2" });
  const [lendingData, setLendingData] = useState(null);
  const [lendingError, setLendingError] = useState(null);
  const [salesDocs, setSalesDocs] = useState([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesFilter, setSalesFilter] = useState("");
  const [salesCategory, setSalesCategory] = useState("All");
  const [loanComponent, setLoanComponent] = useState(null);
  const [showLoanPanel, setShowLoanPanel] = useState(false);
  const [aiForm, setAiForm] = useState({
    asset: "BTC", currentPrice: "", portfolioValue: "", expiryDate: "",
    riskTolerance: "Moderate", objective: "Not Sure — Detect from Notes", prompt: "",
  });
  const [activePreset, setActivePreset] = useState(null);
  const [presetsExpanded, setPresetsExpanded] = useState(false);
  const aiPromptRef = useRef(null);
  const [aiResponse, setAiResponse] = useState("");
  const [aiResponseLoading, setAiResponseLoading] = useState(false);

  const skipPushRef = useRef(false);

  const isLendingPhase = phase === PHASES.LENDING_CONFIGURE || phase === PHASES.LENDING_GENERATING || phase === PHASES.LENDING_RESULT;
  const isTradingPhase = [PHASES.SELECT, PHASES.UPLOAD, PHASES.CONFIGURE, PHASES.GENERATING, PHASES.RESULT, PHASES.AI_CONFIGURE, PHASES.AI_GENERATING, PHASES.AI_REVIEW].includes(phase);
  const isSalesPhase = phase === PHASES.SALES_LIBRARY;

  const SALES_SHEET_ID = "1dr-_tWxb1AS4RHbblugFs4KuTaNruep_viKwTjpqstA";
  const fetchSalesDocs = useCallback(async () => {
    setSalesLoading(true);
    try {
      const url = `https://docs.google.com/spreadsheets/d/${SALES_SHEET_ID}/gviz/tq?tqx=out:json`;
      const res = await fetch(url);
      const text = await res.text();
      const json = JSON.parse(text.substring(47).slice(0, -2));
      const rows = json.table.rows;
      const docs = rows.slice(1).map(r => ({
        name: r.c[0]?.v || "",
        url: r.c[1]?.v || "",
        category: r.c[2]?.v || "General",
        description: r.c[3]?.v || "",
      })).filter(d => d.name && d.url);
      setSalesDocs(docs);
    } catch (e) {
      console.error("Failed to fetch sales docs:", e);
      setSalesDocs([]);
    }
    setSalesLoading(false);
  }, [SALES_SHEET_ID]);

  const navigateTo = useCallback((newPhase) => {
    setPhase(newPhase);
    setError(null);
    setLendingError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (!skipPushRef.current) {
      window.history.pushState({ phase: newPhase }, "", `#${newPhase}`);
    }
    skipPushRef.current = false;
  }, []);

  useEffect(() => {
    window.history.replaceState({ phase: PHASES.HOME }, "", "#home");
  }, []);

  useEffect(() => {
    const onPopState = (e) => {
      const targetPhase = e.state?.phase || PHASES.HOME;
      skipPushRef.current = true;
      if ((targetPhase === PHASES.CONFIGURE || targetPhase === PHASES.RESULT || targetPhase === PHASES.GENERATING) && !selectedTrade) {
        setPhase(PHASES.HOME);
      } else if ((targetPhase === PHASES.LENDING_RESULT || targetPhase === PHASES.LENDING_GENERATING) && !lendingData) {
        setPhase(PHASES.LENDING_CONFIGURE);
      } else {
        setPhase(targetPhase);
      }
      setError(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [selectedTrade, lendingData]);

  useEffect(() => { document.title = PHASE_TITLES[phase] || "SDM"; }, [phase]);

  useEffect(() => {
    checkCanvaStatus().then(setCanvaConnected).catch(() => {});
    const onFocus = () => checkCanvaStatus().then(setCanvaConnected).catch(() => {});
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    if (phase === PHASES.SALES_LIBRARY && salesDocs.length === 0) fetchSalesDocs();
  }, [phase, salesDocs.length, fetchSalesDocs]);

  const handleSelectTrade = (trade) => {
    setSelectedTrade(trade);
    const defaults = {};
    trade.fields.forEach(f => { if (f.default) defaults[f.key] = f.default; });
    setFieldValues(defaults);
    navigateTo(PHASES.CONFIGURE);
  };

  const handleFieldChange = useCallback((key, val) => {
    setFieldValues(prev => ({ ...prev, [key]: val }));
  }, []);

  const handleLendingFieldChange = useCallback((key, val) => {
    setLendingValues(prev => ({ ...prev, [key]: val }));
  }, []);

  const handleGenerate = () => {
    setError(null);
    navigateTo(PHASES.GENERATING);
    setGeneratingStep(0);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setGeneratingStep(i);
      if (i >= 3) { clearInterval(interval); setTimeout(() => navigateTo(PHASES.RESULT), 400); }
    }, 500);
  };

  const handleGenerateLending = () => {
    setLendingError(null);
    const result = computeLendingProposal(lendingValues);
    if (result.error) { setLendingError(result.error); return; }
    setLendingData(result);
    navigateTo(PHASES.LENDING_GENERATING);
    setGeneratingStep(0);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setGeneratingStep(i);
      if (i >= 3) { clearInterval(interval); setTimeout(() => navigateTo(PHASES.LENDING_RESULT), 400); }
    }, 500);
  };

  const generateAiSummary = ({ tradeId, asset, price, pv, expiry, riskTolerance, objective, userPrompt, autoFields }) => {
    const $f = (n) => {
      const v = parseFloat(n || 0);
      if (v === 0) return "0";
      if (Math.abs(v) < 1) return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
      if (Math.abs(v) < 100) return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    };
    const $n = (n) => parseFloat(n || 0).toLocaleString();
    const riskAdj = riskTolerance === "Conservative" ? "capital preservation and downside protection" : riskTolerance === "Aggressive" ? "maximizing upside participation with defined risk" : "a balanced risk-reward profile with controlled downside";

    const summaries = {
      collar: `<p>This trade is structured as a <strong>Protective Collar</strong> on ${asset}, designed for a client seeking ${riskAdj}. The client currently holds a position valued at approximately $${$f(pv)} and requires downside protection while maintaining participation in further upside.</p><p>The collar is implemented by purchasing a put at the $${$f(autoFields.put_strike)} strike to establish a hard floor, funded in part by selling a call at $${$f(autoFields.call_strike)}, resulting in a near-zero net premium outlay. This creates a defined range of outcomes: losses are capped below the put strike, while gains are retained up to the call strike.</p><p>With ${asset} currently trading at $${$f(price)}, this structure provides approximately ${Math.round((1 - parseFloat(autoFields.put_strike) / price) * 100)}% downside protection while allowing ${Math.round((parseFloat(autoFields.call_strike) / price - 1) * 100)}% of further upside. The position expires ${expiry}, at which point it can be rolled or allowed to settle.</p>`,
      covered_call: `<p>This trade implements a <strong>Covered Call</strong> strategy on the client's existing ${asset} position, targeting systematic income generation. With ${asset} at $${$f(price)}, the client sells calls at the $${$f(autoFields.strike)} strike, collecting premium of $${$f(autoFields.premium)} per unit.</p><p>The strategy is designed for a client with a ${riskTolerance.toLowerCase()} risk profile who believes ${asset} will trade range-bound to modestly higher over the near term. Premium collected provides immediate yield and reduces the effective cost basis, while the short call caps upside above the strike price.</p><p>This is an institutional-grade income overlay appropriate for holders seeking to monetize volatility without liquidating their core ${asset} position. The trade expires ${expiry} and can be systematically rolled at expiry for continued income generation.</p>`,
      cash_secured_put: `<p>This trade deploys a <strong>Cash-Secured Put</strong> on ${asset}, allowing the client to either generate premium income or acquire ${asset} at a discount to current market price. The put is sold at the $${$f(autoFields.strike)} strike, approximately ${Math.round((1 - parseFloat(autoFields.strike) / price) * 100)}% below the current price of $${$f(price)}.</p><p>If ${asset} remains above $${$f(autoFields.strike)} at expiry, the client retains the full premium of $${$f(autoFields.premium)} as income. If assigned, the client acquires ${asset} at an effective cost basis of $${$f(autoFields.effective_basis)}, well below current market levels.</p><p>This structure suits a ${riskTolerance.toLowerCase()} investor who is constructive on ${asset} at lower levels and comfortable with the obligation to purchase if the market corrects. The trade expires ${expiry}.</p>`,
      wheel: `<p>This report outlines an active <strong>Wheel Strategy</strong> on ${asset}, a systematic premium-collection approach that cycles between selling puts and covered calls. The client has completed ${$n(autoFields.cycles_completed)} full cycles to date, collecting $${$f(autoFields.total_premium)} in cumulative premium.</p><p>The strategy has reduced the client's effective cost basis to $${$f(autoFields.cost_basis)}, well below the current market price of $${$f(price)}. The current phase involves selling at the $${$f(autoFields.current_strike)} strike, generating $${$f(autoFields.current_premium)} in premium.</p>`,
      long_seagull: `<p>This trade is structured as a <strong>Long Seagull</strong> on ${asset} — a premium-neutral options strategy that provides leveraged upside exposure between $${$f(autoFields.lower_call)} and $${$f(autoFields.upper_call)}, with defined downside risk below $${$f(autoFields.lower_put)}.</p><p>With ${asset} trading at $${$f(price)}, the structure is implemented at zero or near-zero net premium by selling a put at $${$f(autoFields.lower_put)} to fund the purchase of a call spread. The maximum payoff of $${$f(autoFields.max_pnl)} is realized if ${asset} trades at or above the upper call strike at expiry (${expiry}).</p>`,
      leap: `<p>This trade establishes a <strong>Long-Dated Call Option (LEAP)</strong> on ${asset}, providing leveraged directional exposure with strictly defined risk. The client pays $${$f(autoFields.premium)} per contract in premium for calls struck at $${$f(autoFields.strike)}, expiring ${expiry}.</p><p>The total capital at risk is limited to the premium outlay of $${$f(autoFields.total_outlay)} across ${$n(autoFields.contracts)} contracts — significantly less than the equivalent spot exposure.</p>`,
      reverse_cash_carry: `<p>This trade implements a <strong>Reverse Cash &amp; Carry</strong> on the client's ${asset} holdings, unlocking approximately $${$f(parseFloat(autoFields.portfolio_value) * 0.85)} in immediate liquidity while maintaining full ${asset} price exposure via perpetual futures.</p><p>The client sells their spot ${asset} position and simultaneously opens a long perpetual futures position with ${$n(autoFields.margin_pct)}% margin, releasing ${$n(autoFields.cash_released_pct)}% of the portfolio value as deployable capital. Execution is routed through ${autoFields.exchange}.</p>`,
      earnings_play: `<p>This report provides an <strong>Event Risk Analysis</strong> for ${asset} ahead of a significant catalyst on ${autoFields.event_date}. The market is currently pricing an expected move of ${$n(autoFields.expected_move_pct)}%, based on implied volatility levels and historical event reactions of ${autoFields.last_3_reactions}.</p><p>With ${asset} trading at $${$f(price)}, the recommendation is to <strong>${(autoFields.recommendation || "").toLowerCase()}</strong> based on the probability-weighted expected value and the client's ${riskTolerance.toLowerCase()} risk tolerance.</p>`,
    };
    return summaries[tradeId] || `<p>SDM proposes a derivatives structure on ${asset} based on the client's ${objective.toLowerCase()} objective and ${riskTolerance.toLowerCase()} risk profile. With ${asset} at $${$f(price)}, this trade is calibrated to deliver optimal risk-adjusted outcomes aligned with the client's stated goals.</p>`;
  };

  const proceedToAiReview = () => {
    navigateTo(PHASES.AI_GENERATING);
    setGeneratingStep(0);
    const steps = ["Analyzing client requirements", "Matching optimal trade structure", "Calculating strikes & premiums", "Building executive summary"];
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setGeneratingStep(i);
      if (i >= steps.length) { clearInterval(interval); setTimeout(() => navigateTo(PHASES.AI_REVIEW), 500); }
    }, 700);
  };

  const handleAiGenerate = () => {
    const { asset, currentPrice, portfolioValue, expiryDate, riskTolerance, objective, prompt: userPrompt } = aiForm;
    if (!currentPrice) { setError("Please enter the current asset price."); return; }
    if (!userPrompt.trim()) { setError("Please describe what the client is looking for."); return; }
    setError(null);

    const price = parseFloat(currentPrice.replace(/,/g, ""));
    const pv = parseFloat((portfolioValue || "0").replace(/,/g, "")) || price * 10;
    const expiry = expiryDate || "26 Jun 2026";
    const prompt = userPrompt.toLowerCase();
    const R = (v) => {
      if (Math.abs(v) < 0.01) return v.toPrecision(2);
      if (Math.abs(v) < 1) return v.toFixed(4);
      if (Math.abs(v) < 100) return v.toFixed(2);
      return String(Math.round(v));
    };

    let tradeId = "covered_call";
    let autoFields = {};
    const autoDetect = objective === "Not Sure — Detect from Notes";

    if ((!autoDetect && objective === "Hedge") || /hedge|protect|downside|insurance|collar|floor/i.test(prompt)) {
      tradeId = "collar";
      autoFields = { asset, current_price: R(price), holdings: String(Math.round(pv / price)), cost_basis: R(price * 0.85), put_strike: R(price * 0.9), call_strike: R(price * 1.15), expiry, put_premium: R(price * 0.04), call_premium: R(price * 0.038), net_cost: R(price * 0.002), protected_value: R(pv) };
    } else if ((!autoDetect && objective === "Income") || /income|yield|premium|sell.*call|covered|wheel/i.test(prompt)) {
      if (/wheel|cycle|systematic/i.test(prompt)) {
        tradeId = "wheel";
        autoFields = { asset, current_price: R(price), current_phase: "Selling Puts", original_strike: R(price * 0.92), cost_basis: R(price * 0.88), total_premium: R(price * 0.1), cycles_completed: "2", current_strike: R(price * 0.92), current_premium: R(price * 0.045), annualized_return: "28" };
      } else if (/put|sell.*put|cash.secured/i.test(prompt)) {
        tradeId = "cash_secured_put";
        autoFields = { asset, current_price: R(price), strike: R(price * 0.9), expiry, premium: R(price * 0.035), delta: "-0.22", dte: "30", iv_rank: "65", support_level: R(price * 0.86), effective_basis: R(price * 0.865), capital_required: R(price * 0.9) };
      } else {
        tradeId = "covered_call";
        autoFields = { asset, holdings: String(Math.round(pv / price)), cost_basis: R(price * 0.85), current_price: R(price), strike: R(price * 1.1), expiry, premium: R(price * 0.025), delta: "0.25", dte: "30", iv_rank: "60", resistance_level: R(price * 1.08) };
      }
    } else if ((!autoDetect && objective === "Go Long") || /long|bull|upside|call|seagull|leap/i.test(prompt)) {
      if (/seagull|zero.cost|premium.neutral/i.test(prompt)) {
        tradeId = "long_seagull";
        autoFields = { asset, spot: R(price), contracts: String(Math.round(pv / price)), lower_put: R(price * 0.85), lower_call: R(price * 1.05), upper_call: R(price * 1.25), max_pnl: R(pv * 0.2), expiry };
      } else {
        tradeId = "leap";
        autoFields = { asset, current_price: R(price), strike: R(price), expiry, dte: "180", premium: R(price * 0.12), delta: "0.55", iv_rank: "35", contracts: String(Math.max(1, Math.round(pv / price / 10))), total_outlay: R(price * 0.12 * Math.max(1, Math.round(pv / price / 10))) };
      }
    } else if ((!autoDetect && objective === "Liquidity") || /liquidity|unlock|cash|carry|basis/i.test(prompt)) {
      tradeId = "reverse_cash_carry";
      autoFields = { asset, spot_price: R(price), btc_amount: String(Math.round(pv / price)), portfolio_value: R(pv), margin_pct: "15", cash_released_pct: "85", exchange: "Deribit", funding_rate: "10", client_use_case: "Liquidity Unlock" };
    } else if ((!autoDetect && objective === "Event") || /event|halving|etf|catalyst|binary|macro/i.test(prompt)) {
      tradeId = "earnings_play";
      autoFields = { asset, current_price: R(price), event_date: expiry, expected_move_pct: "8.5", position_type: "No Position", strike: R(price * 0.92), premium_collected: "0", last_3_reactions: "+10%, -5%, +8%", recommendation: "Hold Through Event" };
    }

    autoFields.executive_summary = generateAiSummary({ tradeId, asset, price, pv, expiry, riskTolerance, objective, userPrompt, autoFields });

    const trade = TRADE_TYPES.find(t => t.id === tradeId);
    if (!trade) return;

    setSelectedTrade(trade);
    const defaults = {};
    trade.fields.forEach(f => { if (f.default) defaults[f.key] = f.default; });
    setFieldValues({ ...defaults, ...autoFields });

    setAiResponseLoading(true);
    setAiResponse("");
    fetch("/api/ask-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset, currentPrice, portfolioValue, objective, riskTolerance, prompt: userPrompt }),
    })
      .then(r => r.json())
      .then(d => { setAiResponse(d.response || ""); setAiResponseLoading(false); })
      .catch(() => { setAiResponseLoading(false); proceedToAiReview(); });
  };

  const AI_GENERATING_STEPS = [
    "Analyzing client requirements",
    "Matching optimal trade structure",
    "Calculating strikes & premiums",
    "Building executive summary",
  ];

  const handleExportCanva = async () => {
    if (!canvaConnected) { startCanvaAuth(); return; }
    setCanvaExporting(true);
    try {
      const templateId = localStorage.getItem("sdm_canva_template") || prompt("Enter your Canva Brand Template ID:");
      if (!templateId) { setCanvaExporting(false); return; }
      localStorage.setItem("sdm_canva_template", templateId);
      const analysis = computeTradeAnalysis(selectedTrade.id, fieldValues);
      const replacements = buildReplacements(selectedTrade.id, fieldValues, analysis?.metrics);
      const res = await exportToCanva(templateId, { trade_label: selectedTrade.label, replacements });
      setCanvaResult(res);
    } catch (err) {
      setError(`Canva export failed: ${err.message}`);
    } finally {
      setCanvaExporting(false);
    }
  };

  const handleReset = () => {
    navigateTo(PHASES.HOME);
    setSelectedTrade(null);
    setFieldValues({});
    setCanvaResult(null);
    setUploadedFile(null);
    setUploadedUrl(null);
    setLendingData(null);
    setLendingValues({ termMonths: "1", loanCurrency: "USD", collateralAsset: "BTC", ltv: "65", annualRate: "8" });
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadedFile(file);
    setUploadedUrl(null);
    navigateTo(PHASES.UPLOAD);
  };

  const handleUrlSubmit = (url) => {
    if (!url || !url.trim()) return;
    setUploadedUrl(url.trim());
    setUploadedFile(null);
    navigateTo(PHASES.UPLOAD);
  };

  // ─── Breadcrumb ───
  const Breadcrumb = ({ items }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 48px", borderBottom: "1px solid #E8E8E8", background: "#FAFAFA" }}>
      <button style={S.btnBack} onClick={handleReset}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      </button>
      {items.map((item, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#E8E8E8", fontSize: 12 }}>&rsaquo;</span>
          {item.onClick ? (
            <button onClick={item.onClick} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'Poppins',sans-serif", fontSize: 12, color: item.active ? "#111" : "#888", fontWeight: item.active ? 500 : 400 }}>{item.label}</button>
          ) : (
            <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: item.active ? "#111" : "#888", fontWeight: item.active ? 500 : 400 }}>{item.label}</span>
          )}
        </span>
      ))}
    </div>
  );

  const renderLendingBreadcrumb = () => (
    <Breadcrumb items={[
      { label: "Configure Loan", active: phase === PHASES.LENDING_CONFIGURE, onClick: phase !== PHASES.LENDING_CONFIGURE ? () => navigateTo(PHASES.LENDING_CONFIGURE) : undefined },
      { label: "Proposal", active: phase === PHASES.LENDING_RESULT || phase === PHASES.LENDING_GENERATING },
    ]} />
  );

  const renderTradingBreadcrumb = () => (
    <Breadcrumb items={[
      { label: "Select Trade", active: phase === PHASES.SELECT || phase === PHASES.UPLOAD, onClick: phase !== PHASES.SELECT ? () => navigateTo(PHASES.SELECT) : undefined },
      { label: "Configure", active: phase === PHASES.CONFIGURE, onClick: (phase === PHASES.RESULT || phase === PHASES.GENERATING) ? () => navigateTo(PHASES.CONFIGURE) : undefined },
      { label: "Report", active: phase === PHASES.RESULT || phase === PHASES.GENERATING },
    ]} />
  );

  // ─── Sidebar (configure screens) ───
  const ConfigureSidebar = ({ icon, tag, label, category, description, outputItems, backLabel, onBack }) => (
    <div style={{ width: 280, flexShrink: 0, borderRight: "1px solid #E8E8E8", padding: "32px 28px", background: "#FAFAFA" }}>
      <div style={{ borderTop: "3px solid #FFC32C", paddingTop: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
        <div style={S.sectionLabel}>{tag}</div>
        <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 16, color: "#111", marginTop: 6 }}>{label}</div>
        <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#888", marginTop: 2 }}>{category}</div>
      </div>
      <p style={{ ...S.subtext, fontSize: 13, marginBottom: 24 }}>{description}</p>
      {outputItems && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ ...S.sectionLabel, marginBottom: 10 }}>Report Includes</div>
          {outputItems.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #F0F0F0", fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#555" }}>
              <span style={{ width: 4, height: 4, background: "#FFC32C", borderRadius: "50%", flexShrink: 0 }} />
              {item}
            </div>
          ))}
        </div>
      )}
      {onBack && (
        <button style={S.btnBack} onClick={onBack}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          {backLabel || "Back"}
        </button>
      )}
    </div>
  );

  // ─── Generating screen ───
  const GeneratingScreen = ({ title, steps, currentStep }) => (
    <div style={{ ...S.main, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", textAlign: "center" }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ width: 60, height: 60, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="48" height="58" viewBox="0 0 40 48" fill="none">
            <path d="M20 0L40 12V36L20 48L0 36V12L20 0Z" fill="#FFC32C"/>
            <path d="M20 8L32 15V29L20 36L8 29V15L20 8Z" fill="#111"/>
            <path d="M14 20L20 16L26 20V28L20 32L14 28V20Z" fill="#FFC32C"/>
          </svg>
        </div>
        <h2 style={{ ...S.heading2, marginBottom: 8 }}>{title}</h2>
      </div>
      <div style={{ width: "100%", maxWidth: 420 }}>
        {steps.map((step, i) => (
          <div key={i} style={{ ...S.genStep, ...(currentStep > i ? S.genStepDone : {}), borderBottom: i < steps.length - 1 ? "1px solid #F0F0F0" : "none" }}>
            <div style={{
              width: 20, height: 20, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              background: currentStep > i ? "#111" : currentStep === i ? "#FFC32C" : "#F0F0F0",
              color: currentStep > i ? "#fff" : "#111",
              fontSize: 10, fontWeight: 700,
            }}>
              {currentStep > i ? "✓" : currentStep === i ? (
                <span style={{ width: 8, height: 8, border: "2px solid #111", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />
              ) : i + 1}
            </div>
            <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13 }}>{step}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const inputStyle = {
    width: "100%", background: "#FFFFFF", border: "1px solid #E8E8E8", borderRadius: 2,
    padding: "10px 12px", fontSize: 13, color: "#111", fontFamily: "'Poppins',sans-serif", outline: "none",
  };

  return (
    <div style={S.page}>
      <AppHeader onReset={handleReset} />

      {/* Breadcrumbs */}
      {isTradingPhase && renderTradingBreadcrumb()}
      {isLendingPhase && renderLendingBreadcrumb()}
      {isSalesPhase && (
        <Breadcrumb items={[{ label: "Sales Library", active: true }]} />
      )}

      {/* ═══ PHASE: HOME ═══ */}
      {phase === PHASES.HOME && (
        <div style={{ ...S.mainWide, paddingTop: 56 }}>
          <div style={{ marginBottom: 48, textAlign: "center" }}>
            <div style={{ ...S.sectionLabel, marginBottom: 12 }}>Institutional Digital Asset Structuring</div>
            <h1 style={{ ...S.heading1, fontSize: 36, marginBottom: 12 }}>Trade Idea Studio</h1>
            <p style={{ ...S.subtext, maxWidth: 520, margin: "0 auto" }}>Generate institutional-grade trade reports, lending proposals, and sales collateral in seconds.</p>
          </div>

          <div style={{ height: 1, background: "#E8E8E8", marginBottom: 40 }} />

          <div style={{ ...S.sectionLabel, marginBottom: 24, textAlign: "center" }}>Select a Product</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            {/* Ask AI */}
            <button
              onClick={() => navigateTo(PHASES.AI_CONFIGURE)}
              style={{
                background: "#FFFFFF", border: "1px solid #E8E8E8", borderTop: "3px solid #111", borderRadius: 2,
                padding: "28px 24px", textAlign: "left", cursor: "pointer", transition: "box-shadow 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; e.currentTarget.style.borderTopColor = "#FFC32C"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderTopColor = "#111"; }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, background: "#111", borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFC32C" strokeWidth="1.5"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z"/></svg>
                </div>
                <span style={{ ...S.pill, background: "#111", color: "#FFC32C" }}>AI BETA</span>
              </div>
              <h2 style={{ ...S.heading2, fontSize: 17, marginBottom: 6 }}>Ask AI</h2>
              <p style={{ ...S.subtext, fontSize: 13, marginBottom: 16 }}>Paste meeting notes and let AI recommend the optimal trade structure, strikes, and summary.</p>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Montserrat',sans-serif", fontSize: 11, fontWeight: 600, color: "#111", letterSpacing: 1, textTransform: "uppercase" }}>
                Start AI analysis <span>&rarr;</span>
              </div>
            </button>

            {/* Sales Library */}
            <button
              onClick={() => navigateTo(PHASES.SALES_LIBRARY)}
              style={{
                background: "#FFFFFF", border: "1px solid #E8E8E8", borderTop: "3px solid #FFC32C", borderRadius: 2,
                padding: "28px 24px", textAlign: "left", cursor: "pointer", transition: "box-shadow 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"}
              onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, background: "#FAFAFA", border: "1px solid #E8E8E8", borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="9" y1="7" x2="16" y2="7"/><line x1="9" y1="11" x2="14" y2="11"/></svg>
                </div>
                <span style={{ ...S.pill, background: "#FFC32C", color: "#111" }}>SALES</span>
              </div>
              <h2 style={{ ...S.heading2, fontSize: 17, marginBottom: 6 }}>Sales Library</h2>
              <p style={{ ...S.subtext, fontSize: 13, marginBottom: 16 }}>Browse and share pitch decks, one-pagers, and sales collateral from the SDM document vault.</p>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Montserrat',sans-serif", fontSize: 11, fontWeight: 600, color: "#111", letterSpacing: 1, textTransform: "uppercase" }}>
                Browse documents <span>&rarr;</span>
              </div>
            </button>

            {/* Derivatives */}
            <button
              onClick={() => navigateTo(PHASES.SELECT)}
              style={{
                background: "#FFFFFF", border: "1px solid #E8E8E8", borderTop: "3px solid #111", borderRadius: 2,
                padding: "28px 24px", textAlign: "left", cursor: "pointer", transition: "box-shadow 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; e.currentTarget.style.borderTopColor = "#FFC32C"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderTopColor = "#111"; }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, background: "#FAFAFA", border: "1px solid #E8E8E8", borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.5"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
                </div>
                <span style={{ ...S.pill, background: "#F0F0F0", color: "#111" }}>DERIVATIVES</span>
              </div>
              <h2 style={{ ...S.heading2, fontSize: 17, marginBottom: 6 }}>Derivatives Studio</h2>
              <p style={{ ...S.subtext, fontSize: 13, marginBottom: 16 }}>Generate institutional-grade trade reports with payoff diagrams, risk metrics, and executive summaries.</p>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Montserrat',sans-serif", fontSize: 11, fontWeight: 600, color: "#111", letterSpacing: 1, textTransform: "uppercase" }}>
                Create a trade report <span>&rarr;</span>
              </div>
            </button>

            {/* Lending */}
            <button
              onClick={() => navigateTo(PHASES.LENDING_CONFIGURE)}
              style={{
                background: "#FFFFFF", border: "1px solid #E8E8E8", borderTop: "3px solid #16a34a", borderRadius: 2,
                padding: "28px 24px", textAlign: "left", cursor: "pointer", transition: "box-shadow 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"}
              onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, background: "#FAFAFA", border: "1px solid #E8E8E8", borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.5"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20"/><circle cx="12" cy="16" r="2"/></svg>
                </div>
                <span style={{ ...S.pill, background: "#dcfce7", color: "#16a34a" }}>LENDING</span>
              </div>
              <h2 style={{ ...S.heading2, fontSize: 17, marginBottom: 6 }}>Lending Calculator</h2>
              <p style={{ ...S.subtext, fontSize: 13, marginBottom: 16 }}>Calculate collateralized loan terms, generate branded lending proposals with payment schedules and risk analysis.</p>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'Montserrat',sans-serif", fontSize: 11, fontWeight: 600, color: "#16a34a", letterSpacing: 1, textTransform: "uppercase" }}>
                Build a lending proposal <span>&rarr;</span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ═══ PHASE: UPLOAD ═══ */}
      {phase === PHASES.UPLOAD && (uploadedFile || uploadedUrl) && (
        <div style={{ ...S.main, display: "flex", justifyContent: "center", paddingTop: 60 }}>
          <div style={{ ...S.card, maxWidth: 480, width: "100%", textAlign: "center" }}>
            <div style={{ marginBottom: 16 }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FFC32C" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <h2 style={{ ...S.heading2, marginBottom: 8 }}>{uploadedFile ? uploadedFile.name : "Linked Document"}</h2>
            {uploadedFile && <p style={{ ...S.subtext, marginBottom: 8 }}>{(uploadedFile.size / 1024).toFixed(1)} KB</p>}
            <p style={{ ...S.subtext, marginBottom: 24 }}>Branded report generation for imported documents is coming soon.</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button style={S.btnBack} onClick={handleReset}>Back to Home</button>
              <button style={S.btnPrimary} onClick={() => navigateTo(PHASES.SELECT)}>
                Create manually <span>&rarr;</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PHASE: SELECT ═══ */}
      {phase === PHASES.SELECT && (
        <div style={S.mainWide}>
          <div style={{ marginBottom: 32, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ ...S.sectionLabel, marginBottom: 8 }}>Step 01</div>
              <h1 style={S.heading1}>Select a Trade Type</h1>
              <p style={{ ...S.subtext, marginTop: 6 }}>Choose the structure you want to build. We'll generate a full trade analysis report with payoff diagrams and risk metrics.</p>
            </div>
            <button style={S.btnBack} onClick={handleReset}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              Back to Home
            </button>
          </div>

          {/* Ask AI Banner */}
          <button
            onClick={() => navigateTo(PHASES.AI_CONFIGURE)}
            style={{
              width: "100%", background: "#111", border: "none", borderRadius: 2,
              padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
              cursor: "pointer", marginBottom: 32, color: "#FFFFFF",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFC32C" strokeWidth="1.5"><path d="M12 2L9 9l-7 3 7 3 3 7 3-7 7-3-7-3z"/></svg>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14, color: "#FFFFFF", display: "flex", alignItems: "center", gap: 10 }}>
                  Ask AI
                  <span style={{ ...S.pill, background: "#FFC32C", color: "#111", fontSize: 9 }}>BETA</span>
                </div>
                <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>Describe what your client needs and let AI suggest the best trade structure</div>
              </div>
            </div>
            <span style={{ color: "#FFC32C", fontSize: 18 }}>&rarr;</span>
          </button>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            {TRADE_TYPES.map(trade => (
              <TradeCard
                key={trade.id}
                trade={trade}
                selected={selectedTrade?.id === trade.id}
                onClick={() => handleSelectTrade(trade)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ═══ PHASE: AI CONFIGURE ═══ */}
      {phase === PHASES.AI_CONFIGURE && (
        <div style={S.main}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 32 }}>
            <div>
              <div style={{ ...S.sectionLabel, marginBottom: 8 }}>AI Trade Advisor</div>
              <h1 style={{ ...S.heading1, display: "flex", alignItems: "center", gap: 12 }}>
                Ask AI
                <span style={{ ...S.pill, background: "#111", color: "#FFC32C", fontSize: 9 }}>BETA</span>
              </h1>
              <p style={{ ...S.subtext, marginTop: 6 }}>Tell us about your client and what they're looking for. AI will suggest the best derivatives structure and pre-fill the report.</p>
            </div>
            <button style={S.btnBack} onClick={() => navigateTo(PHASES.SELECT)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              Back to Trade Types
            </button>
          </div>

          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 2, padding: "12px 16px", marginBottom: 20, color: "#dc2626", fontFamily: "'Poppins',sans-serif", fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 28 }}>
            {[
              { key: "asset", label: "Asset / Underlying", type: "select", options: ["BTC","ETH","SOL","XRP","ADA","AVAX","DOT","MATIC","LINK","UNI","LTC","DOGE","AAVE","ARB","OP"], value: aiForm.asset },
              { key: "currentPrice", label: "Current Price ($)", type: "text", placeholder: "e.g. 95000", value: aiForm.currentPrice },
              { key: "portfolioValue", label: "Portfolio / Position Value ($)", type: "text", placeholder: "e.g. 5000000", value: aiForm.portfolioValue },
              { key: "expiryDate", label: "Target Expiry Date", type: "text", placeholder: "e.g. 26 Jun 2026", value: aiForm.expiryDate },
              { key: "objective", label: "Client Objective", type: "select", options: ["Not Sure — Detect from Notes","Hedge","Income","Go Long","Liquidity","Event"], value: aiForm.objective },
              { key: "riskTolerance", label: "Risk Tolerance", type: "select", options: ["Conservative","Moderate","Aggressive"], value: aiForm.riskTolerance },
            ].map(f => (
              <div key={f.key}>
                <label style={{ ...S.sectionLabel, display: "block", marginBottom: 6 }}>{f.label}</label>
                {f.type === "select" ? (
                  <select style={{ ...inputStyle, appearance: "none" }} value={f.value} onChange={e => setAiForm(p => ({ ...p, [f.key]: e.target.value }))}>
                    {f.options.map(o => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input style={inputStyle} type="text" placeholder={f.placeholder} value={f.value} onChange={e => setAiForm(p => ({ ...p, [f.key]: e.target.value }))} />
                )}
              </div>
            ))}
          </div>

          {/* Presets */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ ...S.sectionLabel, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L9 9l-7 3 7 3 3 7 3-7 7-3-7-3z"/></svg>
              Start from a template
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {(presetsExpanded ? ASK_AI_PRESETS : ASK_AI_PRESETS.slice(0, 3)).map(p => (
                <button
                  key={p.id}
                  onClick={() => {
                    if (activePreset === p.id) {
                      setActivePreset(null);
                      setAiForm(f => ({ ...f, prompt: "" }));
                      if (aiPromptRef.current) aiPromptRef.current.innerHTML = "";
                    } else {
                      setActivePreset(p.id);
                      setAiForm(f => ({ ...f, prompt: p.prompt }));
                      if (aiPromptRef.current) aiPromptRef.current.innerHTML = `<p>${p.prompt}</p>`;
                    }
                  }}
                  style={{
                    background: activePreset === p.id ? "#111" : "#FAFAFA",
                    color: activePreset === p.id ? "#FFFFFF" : "#555",
                    border: activePreset === p.id ? "1px solid #111" : "1px solid #E8E8E8",
                    borderRadius: 2, padding: "7px 14px",
                    fontFamily: "'Poppins',sans-serif", fontSize: 12,
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setPresetsExpanded(v => !v)}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#888", display: "flex", alignItems: "center", gap: 6 }}
            >
              {presetsExpanded ? "Show less" : "More templates"}
              <svg style={{ transform: presetsExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} width="12" height="12" viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1 1.5l5 5 5-5"/></svg>
            </button>
          </div>

          <div style={{ ...S.divider }} />

          <div style={{ marginBottom: 24 }}>
            <label style={{ ...S.sectionLabel, display: "block", marginBottom: 8 }}>Describe what the client is looking for</label>
            <RichTextFieldToolbar />
            <div
              ref={aiPromptRef}
              contentEditable
              suppressContentEditableWarning
              data-placeholder="e.g. Client holds 50 BTC and wants to protect against a 15% drawdown over the next 3 months while keeping upside exposure..."
              onInput={() => { if (aiPromptRef.current) setAiForm(p => ({ ...p, prompt: aiPromptRef.current.innerText })); setActivePreset(null); }}
              style={{
                ...inputStyle, minHeight: 120, padding: "12px", lineHeight: 1.6,
                border: "1px solid #E8E8E8", outline: "none",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button style={{ ...S.btnPrimary, padding: "14px 32px", fontSize: 13 }} onClick={handleAiGenerate}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L9 9l-7 3 7 3 3 7 3-7 7-3-7-3z"/></svg>
              Generate Trade Idea
              <span>&rarr;</span>
            </button>
          </div>

          {/* AI Response */}
          {(aiResponseLoading || aiResponse) && (
            <div style={{ marginTop: 28, border: "1px solid #E8E8E8", borderTop: "3px solid #FFC32C", borderRadius: 2, background: "#FAFAFA" }}>
              {aiResponseLoading ? (
                <div style={{ padding: "24px", display: "flex", alignItems: "center", gap: 12, color: "#888", fontFamily: "'Poppins',sans-serif", fontSize: 13 }}>
                  <span style={{ width: 16, height: 16, border: "2px solid #E8E8E8", borderTopColor: "#111", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />
                  Analyzing your brief with Claude AI...
                </div>
              ) : (
                <div style={{ padding: "24px" }}>
                  <div style={{ ...S.sectionLabel, marginBottom: 12 }}>AI Analysis</div>
                  <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#555", lineHeight: 1.7 }}>
                    {aiResponse.split("\n").filter(Boolean).map((para, i) => <p key={i} style={{ marginBottom: 10 }}>{para}</p>)}
                  </div>
                  <button style={{ ...S.btnPrimary, marginTop: 16 }} onClick={proceedToAiReview}>
                    Review Trade &rarr;
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ PHASE: AI GENERATING ═══ */}
      {phase === PHASES.AI_GENERATING && (
        <GeneratingScreen
          title="AI is Structuring Your Trade"
          steps={AI_GENERATING_STEPS}
          currentStep={generatingStep}
        />
      )}

      {/* ═══ PHASE: AI REVIEW ═══ */}
      {phase === PHASES.AI_REVIEW && selectedTrade && (
        <div style={{ display: "flex", minHeight: "calc(100vh - 120px)" }}>
          <ConfigureSidebar
            icon={selectedTrade.icon}
            tag={selectedTrade.tag}
            label={selectedTrade.label}
            category={selectedTrade.category}
            description={selectedTrade.description}
            outputItems={["Payoff Diagram", "Risk/Reward KPIs", "Trade Structure Breakdown", "AI Executive Summary"]}
            backLabel="Back to Ask AI"
            onBack={() => navigateTo(PHASES.AI_CONFIGURE)}
          />
          <div style={{ flex: 1, padding: "40px 48px", overflowY: "auto" }}>
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFC32C" strokeWidth="1.5"><path d="M12 2L9 9l-7 3 7 3 3 7 3-7 7-3-7-3z"/></svg>
                <span style={{ ...S.pill, background: "#111", color: "#FFC32C" }}>AI GENERATED</span>
              </div>
              <h2 style={S.heading2}>Review & Confirm Trade</h2>
              <p style={{ ...S.subtext, marginTop: 6 }}>AI has suggested a <strong>{selectedTrade.label}</strong> based on your client brief. Review the parameters below — edit anything that needs adjusting, then generate your report.</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
              {selectedTrade.fields.map(field => (
                <FieldInput key={field.key} field={field} value={fieldValues[field.key] || ""} onChange={handleFieldChange} />
              ))}
            </div>

            {/* Loan Component Panel */}
            <div style={{ marginBottom: 28, padding: 20, background: "#FAFAFA", border: "1px solid #E8E8E8", borderRadius: 2 }}>
              <button
                onClick={() => {
                  const next = !showLoanPanel;
                  setShowLoanPanel(next);
                  if (next && !loanComponent) {
                    setLoanComponent({
                      collateralAsset: fieldValues.asset || "BTC",
                      collateralUnits: "",
                      pricePerUnit: fieldValues.current_price || fieldValues.spot || fieldValues.spot_price || "",
                      termMonths: "24", ltv: "65", annualRate: "8", arrangementFee: "2", useOfProceeds: "",
                    });
                  } else if (!next) { setLoanComponent(null); }
                }}
                style={{ ...S.btnSecondary, marginBottom: showLoanPanel ? 16 : 0 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>
                {showLoanPanel ? "Remove Loan Component" : "Add Loan Component"}
              </button>
              {!showLoanPanel && <p style={{ ...S.subtext, fontSize: 12, marginTop: 6 }}>Combine with an SDM crypto-backed loan</p>}
              {showLoanPanel && loanComponent && (
                <div>
                  <div style={{ ...S.sectionLabel, marginBottom: 12 }}>Loan Parameters</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    {[
                      { key: "collateralAsset", label: "Collateral Asset" },
                      { key: "collateralUnits", label: "Collateral Units" },
                      { key: "pricePerUnit", label: "Price Per Unit ($)" },
                      { key: "termMonths", label: "Term (months)" },
                      { key: "ltv", label: "LTV (%)" },
                      { key: "annualRate", label: "Annual Rate (%)" },
                      { key: "arrangementFee", label: "Arrangement Fee (%)" },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <label style={{ ...S.sectionLabel, display: "block", marginBottom: 6 }}>{label}</label>
                        <input
                          style={inputStyle}
                          value={loanComponent[key] || ""}
                          onChange={e => setLoanComponent(prev => ({ ...prev, [key]: e.target.value }))}
                          placeholder={key === "ltv" ? "65" : key === "annualRate" ? "8" : key === "arrangementFee" ? "2" : ""}
                        />
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const units = parseFloat(loanComponent.collateralUnits);
                    const price = parseFloat(loanComponent.pricePerUnit);
                    const ltv = parseFloat(loanComponent.ltv) / 100 || 0.65;
                    const fee = parseFloat(loanComponent.arrangementFee) / 100 || 0.02;
                    if (!isNaN(units) && !isNaN(price) && units > 0 && price > 0) {
                      const gross = units * price * ltv;
                      const net = gross * (1 - fee);
                      return (
                        <div style={{ display: "flex", gap: 24, marginTop: 12, padding: "12px 16px", background: "#FFFFFF", border: "1px solid #E8E8E8", borderRadius: 2 }}>
                          <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#555" }}>Gross Loan: <strong style={{ color: "#111" }}>${gross.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
                          <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, color: "#555" }}>Net Proceeds: <strong style={{ color: "#111" }}>${net.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button style={{ ...S.btnPrimary, padding: "14px 32px" }} onClick={handleGenerate}>
                Generate Report <span>&rarr;</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PHASE: CONFIGURE ═══ */}
      {phase === PHASES.CONFIGURE && selectedTrade && (
        <div style={{ display: "flex", minHeight: "calc(100vh - 120px)" }}>
          <ConfigureSidebar
            icon={selectedTrade.icon}
            tag={selectedTrade.tag}
            label={selectedTrade.label}
            category={selectedTrade.category}
            description={selectedTrade.description}
            outputItems={["Payoff Diagram", "Risk/Reward KPIs", "Trade Structure Breakdown", "Canva Export (optional)"]}
            backLabel="Back to Trade Types"
            onBack={() => navigateTo(PHASES.SELECT)}
          />
          <div style={{ flex: 1, padding: "40px 48px", overflowY: "auto" }}>
            <div style={{ marginBottom: 28 }}>
              <div style={{ ...S.sectionLabel, marginBottom: 8 }}>Step 02</div>
              <h2 style={S.heading2}>Configure Trade Details</h2>
              <p style={{ ...S.subtext, marginTop: 6 }}>Fill in the deal-specific inputs. These power the payoff calculations and report generation.</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
              {selectedTrade.fields.map(field => (
                <FieldInput key={field.key} field={field} value={fieldValues[field.key]} onChange={handleFieldChange} />
              ))}
            </div>
            {error && (
              <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 2, padding: "12px 16px", marginBottom: 20, color: "#dc2626", fontFamily: "'Poppins',sans-serif", fontSize: 13 }}>
                {error}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button style={{ ...S.btnPrimary, padding: "14px 32px" }} onClick={handleGenerate}>
                Generate Report <span>&rarr;</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PHASE: GENERATING ═══ */}
      {phase === PHASES.GENERATING && selectedTrade && (
        <GeneratingScreen
          title="Building your report"
          steps={["Analyzing trade structure", "Computing payoff matrix", "Building risk profile", "Rendering report"]}
          currentStep={generatingStep}
        />
      )}

      {/* ═══ PHASE: RESULT ═══ */}
      {phase === PHASES.RESULT && selectedTrade && (
        <TradeReport
          trade={selectedTrade}
          fieldValues={fieldValues}
          loanComponent={loanComponent}
          onBack={() => navigateTo(PHASES.CONFIGURE)}
          onReset={handleReset}
        />
      )}

      {/* ═══ PHASE: LENDING CONFIGURE ═══ */}
      {phase === PHASES.LENDING_CONFIGURE && (
        <div style={{ display: "flex", minHeight: "calc(100vh - 120px)" }}>
          <ConfigureSidebar
            icon={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.5"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20"/><circle cx="12" cy="16" r="2"/></svg>}
            tag="LENDING"
            label="Lending Calculator"
            category="Collateralized Loans"
            description="SDM Lending offers collateralized borrowing against the top 50 digital assets. Customizable LTV, interest rate, and term length."
            outputItems={["Loan Structure & Pricing", "Payment Schedule", "Risk & Margin Analysis", "Executive Summary"]}
            backLabel="Back to Home"
            onBack={handleReset}
          />
          <div style={{ flex: 1, padding: "40px 48px", overflowY: "auto" }}>
            <div style={{ marginBottom: 28 }}>
              <div style={{ ...S.sectionLabel, marginBottom: 8 }}>Step 01</div>
              <h2 style={S.heading2}>Configure Loan Parameters</h2>
              <p style={{ ...S.subtext, marginTop: 6 }}>Enter the collateral details and loan terms. We'll generate a complete lending proposal with payment schedule and risk analysis.</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
              {LENDING_FIELDS.map(field => (
                <FieldInput key={field.key} field={field} value={lendingValues[field.key]} onChange={handleLendingFieldChange} />
              ))}
            </div>

            {lendingValues.collateralUnits && lendingValues.pricePerUnit && (
              <div style={{ display: "flex", gap: 24, padding: "16px 20px", background: "#FAFAFA", border: "1px solid #E8E8E8", borderRadius: 2, marginBottom: 20 }}>
                <div>
                  <div style={S.sectionLabel}>Collateral Value</div>
                  <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 16, color: "#111", marginTop: 4 }}>
                    ${(parseFloat(lendingValues.collateralUnits.replace(/,/g,"")) * parseFloat(lendingValues.pricePerUnit.replace(/,/g,""))).toLocaleString(undefined, {maximumFractionDigits: 0})}
                  </div>
                </div>
                <div style={{ width: 1, background: "#E8E8E8" }} />
                <div>
                  <div style={S.sectionLabel}>Est. Net Proceeds</div>
                  <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 16, color: "#16a34a", marginTop: 4 }}>
                    ${(parseFloat(lendingValues.collateralUnits.replace(/,/g,"")) * parseFloat(lendingValues.pricePerUnit.replace(/,/g,"")) * 0.65 * 0.98).toLocaleString(undefined, {maximumFractionDigits: 0})}
                  </div>
                </div>
              </div>
            )}

            {lendingError && (
              <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 2, padding: "12px 16px", marginBottom: 20, color: "#dc2626", fontFamily: "'Poppins',sans-serif", fontSize: 13 }}>
                {lendingError}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button style={{ ...S.btnPrimary, background: "#16a34a", padding: "14px 32px" }} onClick={handleGenerateLending}>
                Generate Proposal <span>&rarr;</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PHASE: LENDING GENERATING ═══ */}
      {phase === PHASES.LENDING_GENERATING && (
        <GeneratingScreen
          title="Building your lending proposal"
          steps={["Validating collateral parameters", "Computing loan structure", "Building payment schedule", "Rendering proposal"]}
          currentStep={generatingStep}
        />
      )}

      {/* ═══ PHASE: LENDING RESULT ═══ */}
      {phase === PHASES.LENDING_RESULT && lendingData && (
        <LendingReport
          data={lendingData}
          fieldValues={lendingValues}
          onBack={() => navigateTo(PHASES.LENDING_CONFIGURE)}
          onReset={handleReset}
        />
      )}

      {/* ═══ PHASE: SALES LIBRARY ═══ */}
      {phase === PHASES.SALES_LIBRARY && (
        <div style={S.mainWide}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 32 }}>
            <div>
              <div style={{ ...S.sectionLabel, marginBottom: 8 }}>SDM Document Vault</div>
              <h1 style={S.heading1}>Sales Library</h1>
              <p style={{ ...S.subtext, marginTop: 6 }}>Browse and share SDM sales collateral. Documents sync live from the team sheet.</p>
            </div>
            <button style={S.btnBack} onClick={handleReset}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              Back to Home
            </button>
          </div>

          <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
              <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                style={{ ...inputStyle, paddingLeft: 40 }}
                type="text"
                placeholder="Search documents..."
                value={salesFilter}
                onChange={e => setSalesFilter(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["All", ...Array.from(new Set(salesDocs.map(d => d.category)))].map(cat => (
                <button
                  key={cat}
                  onClick={() => setSalesCategory(cat)}
                  style={{
                    background: salesCategory === cat ? "#111" : "#FAFAFA",
                    color: salesCategory === cat ? "#FFFFFF" : "#555",
                    border: salesCategory === cat ? "1px solid #111" : "1px solid #E8E8E8",
                    borderRadius: 2, padding: "8px 16px",
                    fontFamily: "'Montserrat',sans-serif", fontSize: 11, fontWeight: 600,
                    letterSpacing: 1, textTransform: "uppercase", cursor: "pointer",
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {salesLoading ? (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <span style={{ width: 24, height: 24, border: "2px solid #E8E8E8", borderTopColor: "#111", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />
              <p style={{ color: "#888", marginTop: 12, fontFamily: "'Poppins',sans-serif", fontSize: 13 }}>Loading documents...</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
              {salesDocs
                .filter(d => salesCategory === "All" || d.category === salesCategory)
                .filter(d => !salesFilter || d.name.toLowerCase().includes(salesFilter.toLowerCase()) || (d.description || getDocMeta(d.name).desc).toLowerCase().includes(salesFilter.toLowerCase()))
                .map((doc, i) => {
                  const meta = getDocMeta(doc.name);
                  const desc = doc.description || meta.desc;
                  return (
                    <a key={i} href={doc.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none", display: "flex", flexDirection: "column", background: "#FFFFFF", border: "1px solid #E8E8E8", borderTop: `3px solid ${meta.color}`, borderRadius: 2, overflow: "hidden", transition: "box-shadow 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"}
                      onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
                    >
                      <div style={{ padding: "20px 20px 12px", borderBottom: "1px solid #F0F0F0" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                          <div style={{ color: meta.color }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                          </div>
                          <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", color: meta.color }}>{meta.type}</span>
                        </div>
                        <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 600, fontSize: 14, color: "#111", marginBottom: 6 }}>{doc.name}</div>
                        <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#888", lineHeight: 1.5 }}>{desc}</div>
                      </div>
                      <div style={{ padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#888" }}>docsend.com</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      </div>
                    </a>
                  );
                })
              }
              {salesDocs.length === 0 && !salesLoading && (
                <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "60px 0", color: "#888", fontFamily: "'Poppins',sans-serif", fontSize: 13 }}>
                  No documents found. Make sure the Google Sheet is shared publicly and the Sheet ID is configured.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Canva Exporting Overlay ─── */}
      {canvaExporting && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", borderRadius: 2, padding: "40px", textAlign: "center", minWidth: 280 }}>
            <span style={{ width: 28, height: 28, border: "2px solid #E8E8E8", borderTopColor: "#111", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite", marginBottom: 16 }} />
            <h3 style={{ ...S.heading2, fontSize: 16, marginBottom: 8 }}>Exporting to Canva</h3>
            <p style={{ ...S.subtext, fontSize: 13 }}>Cloning template and injecting trade data...</p>
          </div>
        </div>
      )}

      {/* ─── Canva Result Toast ─── */}
      {canvaResult && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 1000 }}>
          <div style={{ background: "#111", color: "#FFFFFF", borderRadius: 2, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, fontFamily: "'Poppins',sans-serif", fontSize: 13 }}>
            <span style={{ color: "#16a34a" }}>&#10003;</span>
            <span>Exported to Canva</span>
            <a href={canvaResult.editUrl} target="_blank" rel="noreferrer" style={{ color: "#FFC32C", textDecoration: "none", fontWeight: 600 }}>Open &rarr;</a>
            <button onClick={() => setCanvaResult(null)} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>&times;</button>
          </div>
        </div>
      )}

      {/* ─── Footer ─── */}
      <footer style={{ borderTop: "1px solid #E8E8E8", padding: "20px 48px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FAFAFA" }}>
        <div style={{ height: 2, background: "#FFC32C", width: 24 }} />
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#888" }}>SDM — Internal Use Only</span>
          <span style={{ color: "#E8E8E8" }}>&middot;</span>
          <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#888" }}>SDM Studio v2.0</span>
        </div>
        <div style={{ height: 2, background: "#111", width: 24 }} />
      </footer>

      {/* ─── Feedback Modal ─── */}
      {showFeedback && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={(e) => e.target === e.currentTarget && setShowFeedback(false)}
        >
          <div style={{ background: "#FFFFFF", border: "1px solid #E8E8E8", borderRadius: 2, padding: "32px", width: 480, maxWidth: "90vw" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <h3 style={{ ...S.heading2, fontSize: 16 }}>Feedback & Bug Reports</h3>
              <button onClick={() => { setShowFeedback(false); setFeedbackSent(false); setFeedbackText(""); setFeedbackFiles([]); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#888" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {feedbackSent ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" style={{ marginBottom: 16 }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <p style={{ ...S.subtext, marginBottom: 20 }}>Thank you for your feedback!</p>
                <button style={S.btnPrimary} onClick={() => { setShowFeedback(false); setFeedbackSent(false); setFeedbackText(""); setFeedbackFiles([]); }}>Done</button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  {["feedback", "bug", "feature"].map(type => (
                    <button key={type} onClick={() => setFeedbackType(type)}
                      style={{
                        padding: "8px 16px", fontFamily: "'Poppins',sans-serif", fontSize: 12, cursor: "pointer", borderRadius: 2,
                        background: feedbackType === type ? "#111" : "#FAFAFA",
                        color: feedbackType === type ? "#FFFFFF" : "#555",
                        border: feedbackType === type ? "1px solid #111" : "1px solid #E8E8E8",
                        textTransform: "capitalize",
                      }}
                    >
                      {type === "bug" ? "Bug Report" : type === "feature" ? "Feature Request" : "Feedback"}
                    </button>
                  ))}
                </div>
                <textarea
                  style={{ ...inputStyle, minHeight: 120, resize: "vertical", marginBottom: 12 }}
                  placeholder={feedbackType === "bug" ? "Describe the bug..." : feedbackType === "feature" ? "Describe the feature you'd like to see..." : "Share your thoughts..."}
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  rows={5}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <label style={{ ...S.btnSecondary, cursor: "pointer" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                    Attach files
                    <input type="file" multiple hidden onChange={(e) => setFeedbackFiles(prev => [...prev, ...Array.from(e.target.files)])} />
                  </label>
                  {feedbackFiles.map((f, i) => (
                    <span key={i} style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, color: "#555", display: "flex", alignItems: "center", gap: 4, background: "#F0F0F0", padding: "4px 10px", borderRadius: 2 }}>
                      {f.name}
                      <button onClick={() => setFeedbackFiles(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#888", fontSize: 14 }}>&times;</button>
                    </span>
                  ))}
                </div>
                <button
                  style={{ ...S.btnPrimary, width: "100%", justifyContent: "center", opacity: !feedbackText.trim() ? 0.5 : 1 }}
                  disabled={!feedbackText.trim()}
                  onClick={() => { console.log("Feedback submitted:", { type: feedbackType, text: feedbackText, files: feedbackFiles.map(f => f.name) }); setFeedbackSent(true); }}
                >
                  Submit {feedbackType === "bug" ? "Bug Report" : feedbackType === "feature" ? "Feature Request" : "Feedback"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
