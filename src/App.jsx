import { useState, useCallback, useEffect, useRef, memo } from "react";
import { TRADE_TYPES } from "./tradeTypes";
import { checkCanvaStatus, startCanvaAuth, exportToCanva, buildReplacements } from "./canvaService";
import { computeTradeAnalysis } from "./payoffEngine";
import { computeLendingProposal, SUPPORTED_ASSETS } from "./lendingEngine";
import { extractFieldsFromSummary } from "./fieldExtractor";
import TradeReport from "./TradeReport";
import LendingReport from "./LendingReport";
import PayoffChart from "./PayoffChart";
import "./index.css";


const PHASES = {
  HOME: "home",
  SELECT: "select",
  UPLOAD: "upload",
  CONFIGURE: "configure",
  GENERATING: "generating",
  RESULT: "result",
  // Lending phases
  LENDING_CONFIGURE: "lending_configure",
  LENDING_GENERATING: "lending_generating",
  LENDING_RESULT: "lending_result",
  // Sales Library
  SALES_LIBRARY: "sales_library",
  // AI Trade Advisor
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

function TradeCard({ trade, selected, onClick }) {
  return (
    <button
      className={`trade-card ${selected ? "selected" : ""}`}
      onClick={onClick}
      style={{ "--accent": trade.color }}
    >
      <div className="trade-card-icon">{trade.icon}</div>
      <div className="trade-card-tag">{trade.tag}</div>
      <div className="trade-card-label">{trade.label}</div>
      <div className="trade-card-category">{trade.category}</div>
      <div className="trade-card-desc">{trade.description}</div>
      <div className="trade-card-accent-bar" />
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

function FieldInput({ field, value, onChange, assumed }) {
  const editorRef = useRef(null);

  if (field.type === "textarea") {
    return (
      <div className={`field-group field-group-wide${assumed ? " field-group-assumed" : ""}`}>
        <label className="field-label">{field.label}{assumed && <span className="assumed-badge-inline" style={{marginLeft: 8}}>Assumed</span>}</label>
        <RichTextFieldToolbar />
        <div
          ref={editorRef}
          className="rt-editor rt-editor-field"
          contentEditable
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{ __html: value ? `<p>${String(value).replace(/\n/g, "</p><p>")}</p>` : "" }}
          onBlur={() => {
            if (editorRef.current) {
              onChange(field.key, editorRef.current.innerHTML);
            }
          }}
        />
      </div>
    );
  }
  if (field.type === "select") {
    return (
      <div className={`field-group${assumed ? " field-group-assumed" : ""}`}>
        <label className="field-label">{field.label}{assumed && <span className="assumed-badge-inline" style={{marginLeft: 8}}>Assumed</span>}</label>
        <select
          className="field-select"
          value={value || ""}
          onChange={e => onChange(field.key, e.target.value)}
        >
          <option value="">Select...</option>
          {field.options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }
  const isNum = field.type === "number";
  // Never show "NaN" in inputs — treat it as empty
  const cleanVal = isNum && (value === "NaN" || value === "nan" || value === "undefined") ? "" : value;
  const displayValue = isNum && cleanVal
    ? String(cleanVal).replace(/,/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    : (cleanVal || "");
  return (
    <div className={`field-group${assumed ? " field-group-assumed" : ""}`}>
      <label className="field-label">{field.label}{assumed && <span className="assumed-badge-inline" style={{marginLeft: 8}}>Assumed</span>}</label>
      <input
        className="field-input"
        type="text"
        inputMode={isNum ? "decimal" : undefined}
        placeholder={field.placeholder}
        value={displayValue}
        onChange={e => {
          const raw = isNum ? e.target.value.replace(/,/g, "") : e.target.value;
          if (isNum && raw !== "" && !/^-?\d*\.?\d*$/.test(raw)) return;
          onChange(field.key, raw);
        }}
      />
    </div>
  );
}

// ─── Sales Library: auto-detect doc type from name ───
const DOC_TYPE_MAP = [
  { match: /deck|pitch/i, type: "Pitch Deck", icon: "deck", color: "#60a5fa", desc: "Presentation deck for client meetings and pitches" },
  { match: /1\s*pager|one.pager/i, type: "One-Pager", icon: "page", color: "#4ade80", desc: "Single-page product summary and key highlights" },
  { match: /overview/i, type: "Overview", icon: "overview", color: "#a78bfa", desc: "Comprehensive product overview and terms" },
  { match: /lending|loan/i, type: "Lending", icon: "lending", color: "#34d399", desc: "Lending product details, terms, and structures" },
  { match: /corporate/i, type: "Corporate", icon: "corp", color: "#f59e0b", desc: "Company overview, structure, and capabilities" },
  { match: /derivative|option|call|put|carry/i, type: "Derivatives", icon: "deriv", color: "#f472b6", desc: "Derivatives strategy breakdown and trade examples" },
  { match: /algo|trading/i, type: "Trading", icon: "trade", color: "#38bdf8", desc: "Trading product details and execution strategies" },
  { match: /tax|planning/i, type: "Tax", icon: "tax", color: "#fb923c", desc: "Tax planning strategies and compliance frameworks" },
  { match: /payment/i, type: "Payments", icon: "pay", color: "#a3e635", desc: "Payment infrastructure and settlement solutions" },
  { match: /miner|mining/i, type: "Mining", icon: "mine", color: "#facc15", desc: "Mining operations, treasury, and financing solutions" },
  { match: /treasury|bitcoin/i, type: "Treasury", icon: "treasury", color: "#fbbf24", desc: "Bitcoin treasury strategy and corporate adoption" },
  { match: /product/i, type: "Product", icon: "product", color: "#c084fc", desc: "Full product suite overview and service catalogue" },
  { match: /welcome/i, type: "Welcome", icon: "welcome", color: "#67e8f9", desc: "Introduction to SDM and onboarding guide" },
  { match: /spot/i, type: "Spot Trading", icon: "spot", color: "#22d3ee", desc: "Spot trading execution and OTC desk capabilities" },
  { match: /auto.sell/i, type: "Auto Sell", icon: "auto", color: "#a78bfa", desc: "Automated selling strategies and DCA programs" },
  { match: /ecosystem/i, type: "Ecosystem", icon: "eco", color: "#2dd4bf", desc: "SDM ecosystem map and integrated service overview" },
  { match: /property|real.estate/i, type: "Real Estate", icon: "property", color: "#fb7185", desc: "Crypto-backed lending for property acquisitions" },
];

function getDocMeta(name) {
  for (const entry of DOC_TYPE_MAP) {
    if (entry.match.test(name)) return entry;
  }
  return { type: "Document", icon: "doc", color: "#8b8b9a", desc: "SDM sales and marketing collateral" };
}

// Lending form fields definition
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
  // Lending state
  const [lendingValues, setLendingValues] = useState({ termMonths: "1", loanCurrency: "USD", collateralAsset: "BTC", ltv: "65", annualRate: "8", arrangementFee: "2" });
  const [lendingData, setLendingData] = useState(null);
  const [lendingError, setLendingError] = useState(null);
  // Sales Library state
  const [salesDocs, setSalesDocs] = useState([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesFilter, setSalesFilter] = useState("");
  const [salesCategory, setSalesCategory] = useState("All");
  // AI Trade Advisor state
  const [aiPrompt, setAiPrompt] = useState("");
  const [assumedFields, setAssumedFields] = useState([]);
  const [loanComponent, setLoanComponent] = useState(null);
  const [showLoanPanel, setShowLoanPanel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const skipPushRef = useRef(false);
  const [navExpanded, setNavExpanded] = useState(false);


  const isLendingPhase = phase === PHASES.LENDING_CONFIGURE || phase === PHASES.LENDING_GENERATING || phase === PHASES.LENDING_RESULT;
  const isTradingPhase = [PHASES.SELECT, PHASES.UPLOAD, PHASES.CONFIGURE, PHASES.GENERATING, PHASES.RESULT, PHASES.AI_CONFIGURE, PHASES.AI_GENERATING, PHASES.AI_REVIEW].includes(phase);
  const isSalesPhase = phase === PHASES.SALES_LIBRARY;

  // ─── Fetch Sales Library from Google Sheet ───
  const SALES_SHEET_ID = "1dr-_tWxb1AS4RHbblugFs4KuTaNruep_viKwTjpqstA"; // Replace with actual Sheet ID
  const fetchSalesDocs = useCallback(async () => {
    setSalesLoading(true);
    try {
      const url = `https://docs.google.com/spreadsheets/d/${SALES_SHEET_ID}/gviz/tq?tqx=out:json`;
      const res = await fetch(url);
      const text = await res.text();
      const json = JSON.parse(text.substring(47).slice(0, -2));
      const rows = json.table.rows;
      // Skip header row (first row), columns: A=Name, B=URL, C=Category (optional), D=Description (optional)
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

  // ─── Phase history (browser back/forward) ───
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
    const hash = window.location.hash;
    if (hash.startsWith("#share/")) {
      try {
        const encoded = hash.slice("#share/".length);
        const payload = JSON.parse(decodeURIComponent(escape(atob(encoded))));
        const trade = TRADE_TYPES.find(t => t.id === payload.tradeId);
        if (trade && payload.fieldValues) {
          setSelectedTrade(trade);
          setFieldValues(payload.fieldValues);
          setLoanComponent(payload.loanComponent || null);
          setPhase(PHASES.RESULT);
          window.history.replaceState({ phase: PHASES.RESULT }, "", "#result");
          return;
        }
      } catch (e) {
        // Invalid share link — fall through to home
      }
    }
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

  useEffect(() => {
    document.title = PHASE_TITLES[phase] || "SDM";
  }, [phase]);

  useEffect(() => {
    checkCanvaStatus().then(setCanvaConnected).catch(() => {});
    const onFocus = () => checkCanvaStatus().then(setCanvaConnected).catch(() => {});
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    if (phase === PHASES.SALES_LIBRARY && salesDocs.length === 0) {
      fetchSalesDocs();
    }
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
    // Extract any missing fields from the executive summary before generating
    if (selectedTrade) {
      const summary = fieldValues.executive_summary || "";
      const filled = extractFieldsFromSummary(summary, selectedTrade.fields, fieldValues);
      if (filled !== fieldValues) setFieldValues(filled);
    }
    navigateTo(PHASES.GENERATING);
    setGeneratingStep(0);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setGeneratingStep(i);
      if (i >= 3) {
        clearInterval(interval);
        setTimeout(() => navigateTo(PHASES.RESULT), 400);
      }
    }, 500);
  };

  const handleGenerateLending = () => {
    setLendingError(null);
    const result = computeLendingProposal(lendingValues);
    if (result.error) {
      setLendingError(result.error);
      return;
    }
    setLendingData(result);
    navigateTo(PHASES.LENDING_GENERATING);
    setGeneratingStep(0);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setGeneratingStep(i);
      if (i >= 3) {
        clearInterval(interval);
        setTimeout(() => navigateTo(PHASES.LENDING_RESULT), 400);
      }
    }, 500);
  };

  // ─── AI Summary Generator: turns raw notes into polished copy ───
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
      collar: `<p>This trade is structured as a <strong>Protective Collar</strong> on ${asset}, designed for a client seeking ${riskAdj}. The client currently holds a position valued at approximately $${$f(pv)} and requires downside protection while maintaining participation in further upside.</p>
<p>The collar is implemented by purchasing a put at the $${$f(autoFields.put_strike)} strike to establish a hard floor, funded in part by selling a call at $${$f(autoFields.call_strike)}, resulting in a near-zero net premium outlay. This creates a defined range of outcomes: losses are capped below the put strike, while gains are retained up to the call strike.</p>
<p>With ${asset} currently trading at $${$f(price)}, this structure provides approximately ${Math.round((1 - parseFloat(autoFields.put_strike) / price) * 100)}% downside protection while allowing ${Math.round((parseFloat(autoFields.call_strike) / price - 1) * 100)}% of further upside. The position expires ${expiry}, at which point it can be rolled or allowed to settle. This is well-suited for clients with near-term liquidity concerns, tax events, or macro uncertainty who want to remain invested in ${asset} without bearing unlimited downside risk.</p>`,

      covered_call: `<p>This trade implements a <strong>Covered Call</strong> strategy on the client's existing ${asset} position, targeting systematic income generation. With ${asset} at $${$f(price)}, the client sells calls at the $${$f(autoFields.strike)} strike — approximately ${Math.round((parseFloat(autoFields.strike) / price - 1) * 100)}% above current market — collecting premium of $${$f(autoFields.premium)} per unit.</p>
<p>The strategy is designed for a client with a ${riskTolerance.toLowerCase()} risk profile who believes ${asset} will trade range-bound to modestly higher over the near term. Premium collected provides immediate yield and reduces the effective cost basis, while the short call caps upside above the strike price.</p>
<p>This is an institutional-grade income overlay appropriate for holders seeking to monetize volatility without liquidating their core ${asset} position. The trade expires ${expiry} and can be systematically rolled at expiry for continued income generation.</p>`,

      cash_secured_put: `<p>This trade deploys a <strong>Cash-Secured Put</strong> on ${asset}, allowing the client to either generate premium income or acquire ${asset} at a discount to current market price. The put is sold at the $${$f(autoFields.strike)} strike, approximately ${Math.round((1 - parseFloat(autoFields.strike) / price) * 100)}% below the current price of $${$f(price)}.</p>
<p>If ${asset} remains above $${$f(autoFields.strike)} at expiry, the client retains the full premium of $${$f(autoFields.premium)} as income — representing an attractive annualized yield on committed capital. If assigned, the client acquires ${asset} at an effective cost basis of $${$f(autoFields.effective_basis)}, well below current market levels.</p>
<p>This structure suits a ${riskTolerance.toLowerCase()} investor who is constructive on ${asset} at lower levels and comfortable with the obligation to purchase if the market corrects. The trade expires ${expiry}.</p>`,

      wheel: `<p>This report outlines an active <strong>Wheel Strategy</strong> on ${asset}, a systematic premium-collection approach that cycles between selling puts and covered calls. The client has completed ${$n(autoFields.cycles_completed)} full cycles to date, collecting $${$f(autoFields.total_premium)} in cumulative premium.</p>
<p>The strategy has reduced the client's effective cost basis to $${$f(autoFields.cost_basis)}, well below the current market price of $${$f(price)}. The current phase involves selling at the $${$f(autoFields.current_strike)} strike, generating $${$f(autoFields.current_premium)} in premium.</p>
<p>With a ${riskTolerance.toLowerCase()} risk posture, the wheel is calibrated for consistency over aggressiveness — strike selection balances premium capture against assignment probability. This is a high-conviction strategy for long-term ${asset} holders seeking to compound returns through disciplined options selling.</p>`,

      long_seagull: `<p>This trade is structured as a <strong>Long Seagull</strong> on ${asset} — a premium-neutral options strategy that provides leveraged upside exposure between $${$f(autoFields.lower_call)} and $${$f(autoFields.upper_call)}, with defined downside risk below $${$f(autoFields.lower_put)}.</p>
<p>With ${asset} trading at $${$f(price)}, the structure is implemented at zero or near-zero net premium by selling a put at $${$f(autoFields.lower_put)} to fund the purchase of a call spread. This is well-suited for a client with a bullish near-term outlook who wants meaningful upside participation without committing significant capital.</p>
<p>The maximum payoff of $${$f(autoFields.max_pnl)} is realized if ${asset} trades at or above the upper call strike at expiry (${expiry}). The ${riskTolerance.toLowerCase()} risk profile is reflected in the strike selection — the put floor is set at a level the client would be comfortable acquiring ${asset}.</p>`,

      leap: `<p>This trade establishes a <strong>Long-Dated Call Option (LEAP)</strong> on ${asset}, providing leveraged directional exposure with strictly defined risk. The client pays $${$f(autoFields.premium)} per contract in premium for calls struck at $${$f(autoFields.strike)}, expiring ${expiry}.</p>
<p>The total capital at risk is limited to the premium outlay of $${$f(autoFields.total_outlay)} across ${$n(autoFields.contracts)} contracts — significantly less than the equivalent spot exposure. If ${asset} appreciates materially, the option provides leveraged upside. If the trade moves against the client, losses are capped at the premium paid.</p>
<p>This structure is appropriate for a client with a ${riskTolerance.toLowerCase()} risk posture who holds a high-conviction bullish view on ${asset} over the medium term and prefers to allocate a defined amount of capital rather than take full spot risk.</p>`,

      reverse_cash_carry: `<p>This trade implements a <strong>Reverse Cash & Carry</strong> on the client's ${asset} holdings, unlocking approximately $${$f(parseFloat(autoFields.portfolio_value) * 0.85)} in immediate liquidity while maintaining full ${asset} price exposure via perpetual futures.</p>
<p>The client sells their spot ${asset} position and simultaneously opens a long perpetual futures position with ${$n(autoFields.margin_pct)}% margin, releasing ${$n(autoFields.cash_released_pct)}% of the portfolio value as deployable capital. Execution is routed through ${autoFields.exchange}.</p>
<p>This is an ideal structure for a client who needs near-term liquidity — whether for tax obligations, business operations, real estate purchases, or portfolio diversification — without triggering a taxable disposition or losing ${asset} upside. The estimated funding rate of ${$n(autoFields.funding_rate)}% APR represents the carry cost of maintaining the position.</p>`,

      earnings_play: `<p>This report provides an <strong>Event Risk Analysis</strong> for ${asset} ahead of a significant catalyst on ${autoFields.event_date}. The market is currently pricing an expected move of ${$n(autoFields.expected_move_pct)}%, based on implied volatility levels and historical event reactions of ${autoFields.last_3_reactions}.</p>
<p>With ${asset} trading at $${$f(price)}, the analysis evaluates the risk-reward of the client's positioning relative to the binary outcome. The recommendation is to <strong>${(autoFields.recommendation || "").toLowerCase()}</strong> based on the probability-weighted expected value and the client's ${riskTolerance.toLowerCase()} risk tolerance.</p>
<p>Event-driven volatility in ${asset} has historically provided asymmetric opportunities for properly positioned portfolios. This analysis arms the client with the data needed to make an informed decision ahead of the event.</p>`,
    };

    return summaries[tradeId] || `<p>SDM proposes a derivatives structure on ${asset} based on the client's ${objective.toLowerCase()} objective and ${riskTolerance.toLowerCase()} risk profile. With ${asset} at $${$f(price)}, this trade is calibrated to deliver optimal risk-adjusted outcomes aligned with the client's stated goals.</p>`;
  };

  // ─── AI Trade Advisor: Claude picks trade type + fields + summary ───
  const handleAiGenerate = () => {
    if (!aiPrompt.trim()) { setError("Please describe what the client is looking for."); return; }
    setError(null);

    // Start animation immediately
    navigateTo(PHASES.AI_GENERATING);
    setGeneratingStep(0);

    let animStep = 0;
    const interval = setInterval(() => {
      animStep++;
      setGeneratingStep(animStep);
      if (animStep >= 3) clearInterval(interval);
    }, 800);

    // Fire Claude API — it does everything: trade selection, field values, summary
    fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "select_trade",
        userPrompt: aiPrompt,
      }),
    })
      .then(r => r.ok ? r.json() : r.json().catch(() => ({})).then(body => Promise.reject({ status: r.status, body })))
      .then(data => {
        clearInterval(interval);
        setGeneratingStep(4);

        const tradeId = data.tradeId;
        const trade = TRADE_TYPES.find(t => t.id === tradeId);
        if (!trade) throw new Error(`Unknown trade type: ${tradeId}`);

        // Merge defaults → Claude fields
        const defaults = {};
        trade.fields.forEach(f => { if (f.default) defaults[f.key] = f.default; });
        const merged = {
          ...defaults,
          ...data.fields,
          ...(data.executiveSummary ? { executive_summary: data.executiveSummary } : {}),
        };

        setSelectedTrade(trade);
        setFieldValues(merged);
        setAssumedFields(data.assumptions || []);
        setLoanComponent(data.loanComponent || null);
        setShowLoanPanel(!!data.loanComponent);
        setTimeout(() => navigateTo(PHASES.AI_REVIEW), 400);
      })
      .catch(err => {
        clearInterval(interval);
        console.error("AI generate failed:", err);
        // Use setPhase directly — navigateTo calls setError(null) which would wipe the error
        setPhase(PHASES.AI_CONFIGURE);
        const status = err?.status;
        const detail = err?.body?.detail || err?.body?.error || "";
        const msg = status === 401 || status === 403 || detail.includes("authentication")
          ? "Invalid API key. Open Settings (gear icon) and paste your Anthropic key."
          : status === 500
            ? `AI call failed. ${detail || "Check your Anthropic API key in Settings."}`
            : "AI analysis failed. Is the API server running? (npm run server)";
        setError(msg);
      });
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

  // Breadcrumb for lending flow
  const renderLendingBreadcrumb = () => (
    <div className="breadcrumb">
      <button className="crumb crumb-home" onClick={handleReset}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      </button>
      <span className="crumb-sep">&rsaquo;</span>
      <button className={`crumb ${phase === PHASES.LENDING_CONFIGURE ? "active" : ""}`}
        onClick={phase !== PHASES.LENDING_CONFIGURE ? () => navigateTo(PHASES.LENDING_CONFIGURE) : undefined}
        disabled={phase === PHASES.LENDING_CONFIGURE}>
        01 — Configure Loan
      </button>
      <span className="crumb-sep">&rsaquo;</span>
      <span className={`crumb ${phase === PHASES.LENDING_RESULT || phase === PHASES.LENDING_GENERATING ? "active" : ""}`}>
        02 — Proposal
      </span>
    </div>
  );

  // Breadcrumb for trading flow
  const renderTradingBreadcrumb = () => (
    <div className="breadcrumb">
      <button className="crumb crumb-home" onClick={handleReset}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      </button>
      <span className="crumb-sep">&rsaquo;</span>
      <button className={`crumb ${phase === PHASES.SELECT ? "active" : ""} ${phase === PHASES.UPLOAD ? "active" : ""}`}
        onClick={phase !== PHASES.SELECT ? () => navigateTo(PHASES.SELECT) : undefined}
        disabled={phase === PHASES.SELECT}>
        01 — Select Trade
      </button>
      <span className="crumb-sep">&rsaquo;</span>
      <button className={`crumb ${phase === PHASES.CONFIGURE ? "active" : ""}`}
        onClick={phase === PHASES.RESULT || phase === PHASES.GENERATING ? () => navigateTo(PHASES.CONFIGURE) : undefined}
        disabled={phase === PHASES.CONFIGURE || phase === PHASES.SELECT || phase === PHASES.UPLOAD}>
        02 — Configure
      </button>
      <span className="crumb-sep">&rsaquo;</span>
      <span className={`crumb ${phase === PHASES.RESULT || phase === PHASES.GENERATING ? "active" : ""}`}>
        03 — Report
      </span>
    </div>
  );

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-inner">
          <div className="header-brand" onClick={handleReset} style={{ cursor: "pointer" }}>
            <img src="/sdm-logo-full.svg" alt="Secure Digital Markets" className="header-logo-full" />
          </div>
        </div>

        {/* Breadcrumb */}
        {isTradingPhase && renderTradingBreadcrumb()}
        {isLendingPhase && renderLendingBreadcrumb()}
        {isSalesPhase && (
          <div className="breadcrumb">
            <button className="crumb crumb-home" onClick={handleReset}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </button>
            <span className="crumb-sep">&rsaquo;</span>
            <span className="crumb active">Sales Library</span>
          </div>
        )}
      </header>

      {/* Floating Pill Navigation */}
      <nav className="pill-nav" onMouseEnter={() => setNavExpanded(true)} onMouseLeave={() => setNavExpanded(false)}>
        <button className={`pill-nav-item ${phase === PHASES.HOME ? 'active' : ''}`} onClick={handleReset} title="Home">
          <span className="pill-nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></span>
          <span className="pill-nav-label">Home</span>
        </button>
        <button className={`pill-nav-item ${phase === PHASES.AI_CONFIGURE || phase === PHASES.AI_GENERATING || phase === PHASES.AI_REVIEW ? 'active' : ''}`} onClick={() => navigateTo(PHASES.AI_CONFIGURE)} title="Ask AI">
          <span className="pill-nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L9 9l-7 3 7 3 3 7 3-7 7-3-7-3z"/></svg></span>
          <span className="pill-nav-label">Ask AI</span>
        </button>
        <button className={`pill-nav-item ${isTradingPhase && phase !== PHASES.AI_CONFIGURE && phase !== PHASES.AI_GENERATING && phase !== PHASES.AI_REVIEW ? 'active' : ''}`} onClick={() => { setSelectedTrade(null); navigateTo(PHASES.SELECT); }} title="Derivatives">
          <span className="pill-nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg></span>
          <span className="pill-nav-label">Derivatives</span>
        </button>
        <button className={`pill-nav-item ${isLendingPhase ? 'active' : ''}`} onClick={() => navigateTo(PHASES.LENDING_CONFIGURE)} title="Lending">
          <span className="pill-nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg></span>
          <span className="pill-nav-label">Lending</span>
        </button>
        <button className={`pill-nav-item ${isSalesPhase ? 'active' : ''}`} onClick={() => navigateTo(PHASES.SALES_LIBRARY)} title="Sales">
          <span className="pill-nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></span>
          <span className="pill-nav-label">Sales Library</span>
        </button>
        <button className="pill-nav-item" onClick={() => setShowFeedback(true)} title="Feedback">
          <span className="pill-nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
          <span className="pill-nav-label">Feedback</span>
        </button>
        <button className="pill-nav-item" onClick={() => setShowSettings(true)} title="Settings">
          <span className="pill-nav-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </span>
          <span className="pill-nav-label">Settings</span>
        </button>
      </nav>

      <main className="main">
        {/* ═══ PHASE: HOME — Product Selection ═══ */}
        {phase === PHASES.HOME && (
          <div className="phase-home">
            <div className="home-header">
              <img src="/sdm-logo-full.svg" alt="Secure Digital Markets" className="home-logo-full" />
              <h1 className="home-title">Trade Idea Studio</h1>
              <p className="home-sub">Upload a document or configure a trade to generate institutional-grade reports in seconds.</p>
            </div>

            <div className="home-cta-label">
              <span className="home-cta-line" />
              <span className="home-cta-text">Select a Product</span>
              <span className="home-cta-line" />
            </div>

            <div className="bento-grid">
              {/* Ask AI — Special branded */}
              <div className="bento-ai product-card-ai-wrap">
                <div className="ai-card-glow" />
                <button className="product-card product-card-ai" onClick={() => navigateTo(PHASES.AI_CONFIGURE)}>
                  <div className="product-card-icon-ring product-ring-violet">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z"/>
                    </svg>
                  </div>
                  <span className="product-card-badge badge-violet">AI <span className="badge-beta">BETA</span></span>
                  <h2 className="product-card-title">Ask AI</h2>
                  <p className="product-card-desc">Paste meeting notes and let AI recommend the optimal trade structure, strikes, and summary.</p>
                  <div className="product-card-cta">
                    <span>Start AI analysis</span>
                    <span className="product-card-arrow">&rarr;</span>
                  </div>
                </button>
              </div>

              {/* Sales Library */}
              <div className="bento-sales card-wrap card-wrap-amber">
                <div className="card-border-glow" />
                <button className="product-card product-card-sales" onClick={() => navigateTo(PHASES.SALES_LIBRARY)}>
                  <div className="product-card-icon-ring product-ring-amber">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                      <line x1="9" y1="7" x2="16" y2="7"/>
                      <line x1="9" y1="11" x2="14" y2="11"/>
                    </svg>
                  </div>
                  <span className="product-card-badge badge-amber">SALES</span>
                  <h2 className="product-card-title">Sales Library</h2>
                  <p className="product-card-desc">Browse and share pitch decks, one-pagers, and sales collateral from the SDM document vault.</p>
                  <div className="product-card-cta">
                    <span>Browse documents</span>
                    <span className="product-card-arrow">&rarr;</span>
                  </div>
                </button>
              </div>

              {/* Derivatives */}
              <div className="bento-deriv card-wrap card-wrap-blue">
                <div className="card-border-glow" />
                <button className="product-card product-card-blue" onClick={() => navigateTo(PHASES.SELECT)}>
                  <div className="product-card-icon-ring product-ring-blue">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
                      <polyline points="16 7 22 7 22 13"/>
                    </svg>
                  </div>
                  <span className="product-card-badge badge-blue">DERIVATIVES</span>
                  <h2 className="product-card-title">Derivatives Studio</h2>
                  <p className="product-card-desc">Generate institutional-grade trade reports with payoff diagrams, risk metrics, and executive summaries.</p>
                  <div className="product-card-cta">
                    <span>Create a trade report</span>
                    <span className="product-card-arrow">&rarr;</span>
                  </div>
                </button>
              </div>

              {/* Lending */}
              <div className="bento-lending card-wrap card-wrap-green">
                <div className="card-border-glow" />
                <button className="product-card product-card-lending" onClick={() => navigateTo(PHASES.LENDING_CONFIGURE)}>
                  <div className="product-card-icon-ring product-ring-green">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="2" y="6" width="20" height="14" rx="2"/>
                      <path d="M2 10h20"/>
                      <circle cx="12" cy="16" r="2"/>
                    </svg>
                  </div>
                  <span className="product-card-badge badge-green">LENDING</span>
                  <h2 className="product-card-title">Lending Calculator</h2>
                  <p className="product-card-desc">Calculate collateralized loan terms, generate branded lending proposals with payment schedules and risk analysis.</p>
                  <div className="product-card-cta">
                    <span>Build a lending proposal</span>
                    <span className="product-card-arrow">&rarr;</span>
                  </div>
                </button>
              </div>

              {/* Trading Desk — Coming Soon */}
              <div className="bento-trading card-wrap card-wrap-purple">
                <div className="card-border-glow" />
                <div className="product-card product-card-disabled">
                  <div className="product-card-icon-ring product-ring-purple">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                      <path d="M2 17l10 5 10-5"/>
                      <path d="M2 12l10 5 10-5"/>
                    </svg>
                  </div>
                  <span className="product-card-badge badge-purple">TRADING</span>
                  <h2 className="product-card-title">Trading Desk</h2>
                  <p className="product-card-desc">Spot and OTC execution, block trades, and institutional order routing for digital assets.</p>
                  <div className="product-card-coming-soon">Coming Soon</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ PHASE: UPLOAD ═══ */}
        {phase === PHASES.UPLOAD && (uploadedFile || uploadedUrl) && (
          <div className="phase-upload">
            <div className="upload-card">
              {uploadedFile ? (
                <>
                  <div className="upload-file-icon">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  </div>
                  <h2 className="upload-title">{uploadedFile.name}</h2>
                  <p className="upload-meta">{(uploadedFile.size / 1024).toFixed(1)} KB — {uploadedFile.type || "document"}</p>
                </>
              ) : (
                <>
                  <div className="upload-file-icon">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                  </div>
                  <h2 className="upload-title">
                    {uploadedUrl.includes("docs.google.com") ? "Google Document" :
                     uploadedUrl.includes("sheets.google.com") ? "Google Sheet" :
                     uploadedUrl.includes("slides.google.com") ? "Google Slides" :
                     uploadedUrl.includes("drive.google.com") ? "Google Drive File" :
                     "Linked Document"}
                  </h2>
                  <p className="upload-meta upload-url-preview">{uploadedUrl}</p>
                </>
              )}
              <p className="upload-status">
                {uploadedFile ? "File uploaded successfully." : "Link attached successfully."} Branded report generation for imported documents is coming soon.
              </p>
              <div className="upload-actions">
                <button className="btn-back" onClick={handleReset}>&larr; Back to Home</button>
                <button className="btn-generate" style={{ "--accent": "var(--blue)" }} onClick={() => navigateTo(PHASES.SELECT)}>
                  <span>Create manually instead</span>
                  <span className="btn-arrow">&rarr;</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ PHASE: SELECT (Trading) ═══ */}
        {phase === PHASES.SELECT && (
          <div className="phase-select">
            <div className="phase-header">
              <button className="btn-back" onClick={handleReset}>&larr; Back to Home</button>
              <h1 className="phase-title">Select a Trade Type</h1>
              <p className="phase-sub">Choose the structure you want to build. We'll generate a full trade analysis report with payoff diagrams and risk metrics.</p>
            </div>

            {/* Ask AI Banner */}
            <button className="ai-banner" onClick={() => navigateTo(PHASES.AI_CONFIGURE)}>
              <div className="ai-banner-left">
                <div className="ai-banner-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L9 9l-7 3 7 3 3 7 3-7 7-3-7-3z"/></svg>
                </div>
                <div>
                  <div className="ai-banner-title">
                    Ask AI
                    <span className="ai-beta-badge">BETA</span>
                  </div>
                  <div className="ai-banner-desc">Describe what your client needs and let AI suggest the best trade structure</div>
                </div>
              </div>
              <span className="ai-banner-arrow">&rarr;</span>
            </button>

            <div className="trade-grid">
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
          <div className="phase-ai phase-ai-chat">
            <div className="ai-chat-container">
              <div className="ai-chat-header">
                <div className="ai-chat-title">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5"><path d="M12 2L9 9l-7 3 7 3 3 7 3-7 7-3-7-3z"/></svg>
                  <span>Ask AI</span>
                  <span className="ai-beta-badge">BETA</span>
                </div>
                <button className="btn-back" onClick={() => navigateTo(PHASES.SELECT)}>&larr; Back</button>
              </div>

              <p className="ai-chat-sub">Describe your client's situation in plain language. AI will select the right trade structure and fill in all the parameters.</p>

              {error && <div className="error-banner"><span className="error-icon">!</span> {error}</div>}


              <div className="ai-chat-examples">
                <div className="ai-chat-examples-label">Try an example:</div>
                <div className="ai-chat-examples-list">
                  {[
                    "My client wants to short $5M of BTC — what's the best structure?",
                    "Client holds 50 BTC at $80k avg and wants downside protection for 3 months",
                    "Generate income on a 10 BTC position, client is neutral to slightly bullish",
                    "Client wants leveraged upside on ETH with defined risk, $200k budget",
                  ].map(ex => (
                    <button key={ex} className="ai-chat-example-chip" onClick={() => setAiPrompt(ex)}>
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ai-chat-input-area">
                <textarea
                  className="ai-chat-textarea"
                  placeholder="e.g. My client wants to short $5M of BTC. They're bearish for the next 6 months and can tolerate moderate risk. What's the best structure?"
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAiGenerate();
                  }}
                  rows={5}
                  autoFocus
                />
                <div className="ai-chat-actions">
                  <span className="ai-chat-hint">⌘ + Enter to send</span>
                  <button className="ai-chat-send" onClick={handleAiGenerate} disabled={!aiPrompt.trim()}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L9 9l-7 3 7 3 3 7 3-7 7-3-7-3z"/></svg>
                    Generate Trade
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ PHASE: AI GENERATING ═══ */}
        {phase === PHASES.AI_GENERATING && (
          <div className="phase-generating phase-ai-generating">
            <div className="generating-inner">
              <div className="generating-glyph">
                <img src="/sdm-logo-full.svg" alt="SDM" className="generating-logo" />
              </div>
              <h2 className="generating-title"><span className="typewriter-title">AI is Structuring Your Trade</span></h2>
              <div className="generating-steps">
                {AI_GENERATING_STEPS.map((step, idx) => (
                  <div key={idx} className={`gen-step ${generatingStep > idx ? "done" : generatingStep === idx ? "active" : ""}`}>
                    <div className="gen-step-dot" />
                    {step}
                    {generatingStep > idx && <span className="gen-check">{"\u2713"}</span>}
                    {generatingStep === idx && <div className="gen-spinner" />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ PHASE: AI REVIEW ═══ */}
        {phase === PHASES.AI_REVIEW && selectedTrade && (
          <div className="phase-configure phase-ai-review">
            <div className="configure-sidebar">
              {/* AI Review header */}
              <div className="ai-review-card">
                <div className="ai-review-card-header">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L9 9l-7 3 7 3 3 7 3-7 7-3-7-3z"/></svg>
                  <span>AI-Suggested Trade</span>
                  <span className="ai-beta-badge">BETA</span>
                </div>
                <div className="ai-review-card-body">
                  <div className="sidebar-icon" style={{ "--accent": selectedTrade.color }}>{selectedTrade.icon}</div>
                  <div className="sidebar-tag" style={{ color: selectedTrade.color }}>{selectedTrade.tag}</div>
                  <div className="sidebar-label">{selectedTrade.label}</div>
                  <div className="sidebar-category">{selectedTrade.category}</div>
                </div>
              </div>

              <div className="sidebar-desc">
                {selectedTrade.description}
              </div>

              <div className="sidebar-output-preview">
                <div className="output-preview-label">Report Includes</div>
                <div className="output-preview-item"><span className="output-icon">✦</span> Payoff Diagram</div>
                <div className="output-preview-item"><span className="output-icon">◼</span> Risk/Reward KPIs</div>
                <div className="output-preview-item"><span className="output-icon">◫</span> Trade Structure Breakdown</div>
                {showLoanPanel && <div className="output-preview-item" style={{ color: "#4ade80" }}><span className="output-icon">⬡</span> Loan Structure</div>}
                <div className="output-preview-item"><span className="output-icon">⊡</span> AI Executive Summary</div>
              </div>

              <button className="btn-back" onClick={() => navigateTo(PHASES.AI_CONFIGURE)}>&larr; Back to Ask AI</button>
            </div>

            <div className="configure-form">
              <div className="ai-review-header">
                <div className="ai-review-badge-row">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5"><path d="M12 2L9 9l-7 3 7 3 3 7 3-7 7-3-7-3z"/></svg>
                  <span className="ai-beta-badge">AI GENERATED</span>
                </div>
                <h2 className="form-title">Review & Confirm Trade</h2>
                <p className="form-sub">AI has suggested a <strong>{selectedTrade.label}</strong> based on your client brief. Review the parameters below — edit anything that needs adjusting, then generate your report.</p>
                {assumedFields.length > 0 && (
                  <div className="ai-assumed-banner">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L9 9l-7 3 7 3 3 7 3-7 7-3-7-3z"/></svg>
                    Fields marked <span className="assumed-badge-inline">Assumed</span> were estimated by AI — verify before sending to client.
                  </div>
                )}
              </div>

              <div className="fields-grid">
                {[...selectedTrade.fields].sort((a, b) => (a.key === "executive_summary" ? -1 : b.key === "executive_summary" ? 1 : 0)).map(field => (
                  <FieldInput key={field.key} field={field} value={fieldValues[field.key] || ""} onChange={handleFieldChange} assumed={assumedFields.includes(field.key)} />
                ))}
              </div>

              {/* Missing required fields warning */}
              {(() => {
                const nanFields = selectedTrade.fields.filter(f => {
                  if (f.type !== "number" || f.key === "executive_summary") return false;
                  const v = fieldValues[f.key];
                  return !v || v === "NaN" || v === "0" || v === "" || isNaN(Number(v));
                });
                if (nanFields.length === 0) return null;
                return (
                  <div className="missing-fields-panel" style={{ marginTop: 16, marginBottom: 0 }}>
                    <div className="missing-fields-header">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <span>Fill in the highlighted fields above to complete the report. If the values are in the executive summary, they'll be detected automatically on generate.</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {nanFields.map(f => (
                        <span key={f.key} style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--gold)", background: "rgba(255,195,44,0.1)", border: "1px solid rgba(255,195,44,0.2)", borderRadius: 6, padding: "3px 10px" }}>
                          {f.label}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* ─── Loan Component Panel ─── */}
              <div className="loan-panel-section">
                <div className="loan-panel-toggle-row">
                  <button
                    className={`loan-panel-toggle${showLoanPanel ? " active" : ""}`}
                    onClick={() => {
                      const next = !showLoanPanel;
                      setShowLoanPanel(next);
                      if (next && !loanComponent) {
                        setLoanComponent({
                          collateralAsset: fieldValues.asset || "BTC",
                          collateralUnits: "",
                          pricePerUnit: fieldValues.current_price || fieldValues.spot || fieldValues.spot_price || "",
                          termMonths: "24",
                          ltv: "65",
                          annualRate: "8",
                          arrangementFee: "2",
                          useOfProceeds: "",
                        });
                      } else if (!next) {
                        setLoanComponent(null);
                      }
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>
                    {showLoanPanel ? "Remove Loan Component" : "Add Loan Component"}
                  </button>
                  {!showLoanPanel && <span className="loan-panel-hint">Combine with an SDM crypto-backed loan</span>}
                </div>

                {showLoanPanel && loanComponent && (
                  <div className="loan-panel-fields">
                    <div className="loan-panel-label">Loan Parameters</div>
                    <div className="loan-panel-grid">
                      {[
                        { key: "collateralAsset", label: "Collateral Asset" },
                        { key: "collateralUnits", label: "Collateral Units" },
                        { key: "pricePerUnit", label: "Price Per Unit ($)" },
                        { key: "termMonths", label: "Term (months)" },
                        { key: "ltv", label: "LTV (%)" },
                        { key: "annualRate", label: "Annual Rate (%)" },
                        { key: "arrangementFee", label: "Arrangement Fee (%)" },
                      ].map(({ key, label }) => (
                        <div key={key} className="loan-panel-field">
                          <label className="loan-panel-field-label">{label}</label>
                          <input
                            className="loan-panel-input"
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
                          <div className="loan-panel-preview">
                            <span>Gross Loan: <strong>${gross.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
                            <span>Net Proceeds: <strong>${net.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}
              </div>

              {["call_spread", "put_spread", "straddle", "strangle"].includes(selectedTrade.id) &&
                fieldValues.spot &&
                (fieldValues.long_strike || fieldValues.atm_strike || fieldValues.call_strike) && (
                  <PayoffChart
                    strategy={selectedTrade.id}
                    direction={fieldValues.direction || "Long"}
                    spot={Number(fieldValues.spot)}
                    long_strike={Number(fieldValues.long_strike) || 0}
                    short_strike={Number(fieldValues.short_strike) || 0}
                    atm_strike={Number(fieldValues.atm_strike) || 0}
                    call_strike={Number(fieldValues.call_strike) || 0}
                    put_strike={Number(fieldValues.put_strike) || 0}
                    premium={Number(fieldValues.premium) || Number(fieldValues.total_premium) || 0}
                  />
                )
              }
              <div className="form-actions">
                <div className="form-action-note">
                  <span style={{ fontSize: 12, color: "var(--text-dim)" }}>You can edit any field before generating. The AI suggestion is a starting point.</span>
                </div>
                <button className="btn-generate" onClick={handleGenerate} style={{ "--accent": selectedTrade.color }}>
                  Generate Report
                  <span className="btn-arrow">&rarr;</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ PHASE: CONFIGURE (Trading) ═══ */}
        {phase === PHASES.CONFIGURE && selectedTrade && (
          <div className="phase-configure">
            <div className="configure-sidebar">
              <div className="sidebar-trade-badge" style={{ "--accent": selectedTrade.color }}>
                <div className="sidebar-icon">{selectedTrade.icon}</div>
                <div className="sidebar-tag">{selectedTrade.tag}</div>
                <div className="sidebar-label">{selectedTrade.label}</div>
                <div className="sidebar-category">{selectedTrade.category}</div>
              </div>
              <div className="sidebar-desc">{selectedTrade.description}</div>
              <div className="sidebar-output-preview">
                <div className="output-preview-label">Report Includes</div>
                <div className="output-preview-item"><span className="output-icon">&#x25C8;</span><span>Payoff Diagram</span></div>
                <div className="output-preview-item"><span className="output-icon">&#x25A3;</span><span>Risk/Reward KPIs</span></div>
                <div className="output-preview-item"><span className="output-icon">&#x29C9;</span><span>Trade Structure Breakdown</span></div>
                <div className="output-preview-item"><span className="output-icon">{"\u2197"}</span><span>Canva Export (optional)</span></div>
              </div>
              <button className="btn-back" onClick={() => navigateTo(PHASES.SELECT)}>&larr; Back to Trade Types</button>
            </div>
            <div className="configure-form">
              <div className="form-header">
                <h2 className="form-title">Configure Trade Details</h2>
                <p className="form-sub">Fill in the deal-specific inputs. These power the payoff calculations and report generation.</p>
              </div>
              <div className="fields-grid">
                {[...selectedTrade.fields].sort((a, b) => (a.key === "executive_summary" ? -1 : b.key === "executive_summary" ? 1 : 0)).map(field => (
                  <FieldInput key={field.key} field={field} value={fieldValues[field.key]} onChange={handleFieldChange} />
                ))}
              </div>
              {["call_spread", "put_spread", "straddle", "strangle"].includes(selectedTrade.id) &&
                fieldValues.spot &&
                (fieldValues.long_strike || fieldValues.atm_strike || fieldValues.call_strike) && (
                  <PayoffChart
                    strategy={selectedTrade.id}
                    direction={fieldValues.direction || "Long"}
                    spot={Number(fieldValues.spot)}
                    long_strike={Number(fieldValues.long_strike) || 0}
                    short_strike={Number(fieldValues.short_strike) || 0}
                    atm_strike={Number(fieldValues.atm_strike) || 0}
                    call_strike={Number(fieldValues.call_strike) || 0}
                    put_strike={Number(fieldValues.put_strike) || 0}
                    premium={Number(fieldValues.premium) || Number(fieldValues.total_premium) || 0}
                  />
                )
              }
              {error && (
                <div className="error-banner"><span className="error-icon">&#x26A0;</span>{error}</div>
              )}
              <div className="form-actions">
                <div className="form-action-note" />
                <button className="btn-generate" onClick={handleGenerate} style={{ "--accent": selectedTrade.color }}>
                  <span>Generate Report</span>
                  <span className="btn-arrow">&rarr;</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ PHASE: GENERATING (Trading) ═══ */}
        {phase === PHASES.GENERATING && selectedTrade && (
          <div className="phase-generating">
            <div className="generating-inner">
              <div className="generating-glyph">
                <img src="/sdm-logo-full.svg" alt="Secure Digital Markets" className="generating-logo" />
              </div>
              <h2 className="generating-title"><span className="typewriter-title">Building your report</span></h2>
              <div className="generating-steps">
                {["Analyzing trade structure", "Computing payoff matrix", "Building risk profile", "Rendering report"].map((step, i) => (
                  <div key={i} className={`gen-step ${i <= generatingStep ? "done" : ""} ${i === generatingStep ? "active" : ""}`}>
                    <div className="gen-step-dot" />
                    <span>{step}</span>
                    {i < generatingStep && <span className="gen-check">{"\u2713"}</span>}
                    {i === generatingStep && <span className="gen-spinner" />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ PHASE: RESULT (Trading) ═══ */}
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
          <div className="phase-configure">
            <div className="configure-sidebar">
              <div className="sidebar-trade-badge" style={{ "--accent": "#4ade80" }}>
                <div className="sidebar-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="6" width="20" height="14" rx="2"/>
                    <path d="M2 10h20"/>
                    <circle cx="12" cy="16" r="2"/>
                  </svg>
                </div>
                <div className="sidebar-tag">LENDING</div>
                <div className="sidebar-label">Lending Calculator</div>
                <div className="sidebar-category">Collateralized Loans</div>
              </div>
              <div className="sidebar-desc">
                SDM Lending offers collateralized borrowing against the top 50 digital assets. Customizable LTV, interest rate, and term length.
              </div>
              <div className="sidebar-output-preview">
                <div className="output-preview-label">Proposal Includes</div>
                <div className="output-preview-item"><span className="output-icon">&#x25C8;</span><span>Loan Structure & Pricing</span></div>
                <div className="output-preview-item"><span className="output-icon">&#x25A3;</span><span>Payment Schedule</span></div>
                <div className="output-preview-item"><span className="output-icon">&#x29C9;</span><span>Risk & Margin Analysis</span></div>
                <div className="output-preview-item"><span className="output-icon">{"\u2197"}</span><span>Executive Summary</span></div>
              </div>
              <button className="btn-back" onClick={handleReset}>&larr; Back to Home</button>
            </div>
            <div className="configure-form">
              <div className="form-header">
                <h2 className="form-title">Configure Loan Parameters</h2>
                <p className="form-sub">Enter the collateral details and loan terms. We'll generate a complete lending proposal with payment schedule and risk analysis.</p>
              </div>
              <div className="fields-grid">
                {LENDING_FIELDS.map(field => (
                  <FieldInput key={field.key} field={field} value={lendingValues[field.key]} onChange={handleLendingFieldChange} />
                ))}
              </div>

              {/* Quick summary preview */}
              {lendingValues.collateralUnits && lendingValues.pricePerUnit && (
                <div className="lending-preview-strip">
                  <div className="lending-preview-item">
                    <span className="lending-preview-label">Collateral Value</span>
                    <span className="lending-preview-value">${(parseFloat(lendingValues.collateralUnits.replace(/,/g,"")) * parseFloat(lendingValues.pricePerUnit.replace(/,/g,""))).toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                  </div>
                  <div className="lending-preview-item">
                    <span className="lending-preview-label">Est. Net Proceeds</span>
                    <span className="lending-preview-value">${(parseFloat(lendingValues.collateralUnits.replace(/,/g,"")) * parseFloat(lendingValues.pricePerUnit.replace(/,/g,"")) * 0.65 * 0.98).toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                  </div>
                </div>
              )}

              {lendingError && (
                <div className="error-banner"><span className="error-icon">&#x26A0;</span>{lendingError}</div>
              )}
              <div className="form-actions">
                <div className="form-action-note" />
                <button className="btn-generate" onClick={handleGenerateLending} style={{ "--accent": "#4ade80" }}>
                  <span>Generate Proposal</span>
                  <span className="btn-arrow">&rarr;</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ PHASE: LENDING GENERATING ═══ */}
        {phase === PHASES.LENDING_GENERATING && (
          <div className="phase-generating">
            <div className="generating-inner">
              <div className="generating-glyph">
                <img src="/sdm-logo-full.svg" alt="Secure Digital Markets" className="generating-logo" />
              </div>
              <h2 className="generating-title"><span className="typewriter-title">Building your lending proposal</span></h2>
              <div className="generating-steps">
                {["Validating collateral parameters", "Computing loan structure", "Building payment schedule", "Rendering proposal"].map((step, i) => (
                  <div key={i} className={`gen-step ${i <= generatingStep ? "done" : ""} ${i === generatingStep ? "active" : ""}`}>
                    <div className="gen-step-dot" />
                    <span>{step}</span>
                    {i < generatingStep && <span className="gen-check">{"\u2713"}</span>}
                    {i === generatingStep && <span className="gen-spinner" />}
                  </div>
                ))}
              </div>
            </div>
          </div>
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
          <div className="phase-sales-library">
            <div className="sales-header">
              <div className="sales-header-left">
                <h1 className="phase-title">Sales Library</h1>
                <p className="phase-sub">Browse and share SDM sales collateral. Documents sync live from the team sheet.</p>
              </div>
              <button className="btn-back" onClick={handleReset}>{"\u2190"} Back to Home</button>
            </div>

            <div className="sales-controls">
              <div className="sales-search-wrap">
                <svg className="sales-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  className="sales-search"
                  type="text"
                  placeholder="Search documents..."
                  value={salesFilter}
                  onChange={e => setSalesFilter(e.target.value)}
                />
              </div>
              <div className="sales-category-pills">
                {["All", ...Array.from(new Set(salesDocs.map(d => d.category)))].map(cat => (
                  <button
                    key={cat}
                    className={`sales-pill ${salesCategory === cat ? "active" : ""}`}
                    onClick={() => setSalesCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {salesLoading ? (
              <div className="sales-loading">
                <div className="gen-spinner" style={{ width: 24, height: 24, margin: "0 auto" }} />
                <p style={{ color: "var(--text-muted)", marginTop: 12, fontSize: 13 }}>Loading documents...</p>
              </div>
            ) : (
              <div className="sales-doc-grid">
                {salesDocs
                  .filter(d => salesCategory === "All" || d.category === salesCategory)
                  .filter(d => !salesFilter || d.name.toLowerCase().includes(salesFilter.toLowerCase()) || (d.description || getDocMeta(d.name).desc).toLowerCase().includes(salesFilter.toLowerCase()))
                  .map((doc, i) => {
                    const meta = getDocMeta(doc.name);
                    const desc = doc.description || meta.desc;
                    return (
                      <a key={i} href={doc.url} target="_blank" rel="noreferrer" className="sales-doc-card">
                        <div className="sales-doc-thumb" style={{ background: `linear-gradient(135deg, ${meta.color}18, ${meta.color}08)`, borderColor: `${meta.color}25` }}>
                          <div className="sales-doc-thumb-icon" style={{ color: meta.color }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>
                          </div>
                          <span className="sales-doc-type-badge" style={{ background: `${meta.color}20`, color: meta.color, borderColor: `${meta.color}30` }}>{meta.type}</span>
                        </div>
                        <div className="sales-doc-card-body">
                          <span className="sales-doc-name">{doc.name}</span>
                          <span className="sales-doc-desc">{desc}</span>
                        </div>
                        <div className="sales-doc-card-footer">
                          <span className="sales-doc-domain">docsend.com</span>
                          <svg className="sales-doc-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        </div>
                      </a>
                    );
                  })
                }
                {salesDocs.length > 0 && salesDocs
                  .filter(d => salesCategory === "All" || d.category === salesCategory)
                  .filter(d => !salesFilter || d.name.toLowerCase().includes(salesFilter.toLowerCase()))
                  .length === 0 && (
                  <div className="sales-empty">No documents match your search.</div>
                )}
                {salesDocs.length === 0 && !salesLoading && (
                  <div className="sales-empty">
                    No documents found. Make sure the Google Sheet is shared publicly and the Sheet ID is configured.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Canva Exporting Overlay */}
      {canvaExporting && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ textAlign: "center" }}>
            <div className="gen-spinner" style={{ margin: "0 auto 16px", width: 28, height: 28 }} />
            <h3 className="modal-title">Exporting to Canva</h3>
            <p className="modal-sub">Cloning template and injecting trade data...</p>
          </div>
        </div>
      )}

      {/* Canva Result Toast */}
      {canvaResult && (
        <div className="canva-toast">
          <div className="canva-toast-inner">
            <span className="canva-toast-check">{"\u2713"}</span>
            <span>Exported to Canva</span>
            <a href={canvaResult.editUrl} target="_blank" rel="noreferrer" className="canva-toast-link">Open &rarr;</a>
            <button className="canva-toast-close" onClick={() => setCanvaResult(null)}>&times;</button>
          </div>
        </div>
      )}

      <footer className="footer">
        <div className="footer-meta">
          <span>SDM &mdash; Internal Use Only</span>
          <span className="footer-dot">&middot;</span>
          <span>SDM Studio v2.0</span>
        </div>
      </footer>

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowSettings(false)}>
          <div className="settings-modal">
            <div className="settings-header">
              <h3 className="settings-title">Settings</h3>
              <button className="feedback-close" onClick={() => setShowSettings(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>


            <div className="settings-footer">
              <button className="btn-generate" style={{width:"100%", justifyContent:"center"}} onClick={() => setShowSettings(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {showFeedback && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowFeedback(false)}>
          <div className="feedback-modal">
            <div className="feedback-header">
              <h3 className="feedback-title">Feedback & Bug Reports</h3>
              <button className="feedback-close" onClick={() => { setShowFeedback(false); setFeedbackSent(false); setFeedbackText(""); setFeedbackFiles([]); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {feedbackSent ? (
              <div className="feedback-success">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <p>Thank you for your feedback!</p>
                <button className="feedback-done-btn" onClick={() => { setShowFeedback(false); setFeedbackSent(false); setFeedbackText(""); setFeedbackFiles([]); }}>Done</button>
              </div>
            ) : (
              <>
                <div className="feedback-type-row">
                  <button className={`feedback-type-btn ${feedbackType === "feedback" ? "active" : ""}`} onClick={() => setFeedbackType("feedback")}>Feedback</button>
                  <button className={`feedback-type-btn ${feedbackType === "bug" ? "active" : ""}`} onClick={() => setFeedbackType("bug")}>Bug Report</button>
                  <button className={`feedback-type-btn ${feedbackType === "feature" ? "active" : ""}`} onClick={() => setFeedbackType("feature")}>Feature Request</button>
                </div>
                <textarea
                  className="feedback-textarea"
                  placeholder={feedbackType === "bug" ? "Describe the bug..." : feedbackType === "feature" ? "Describe the feature you'd like to see..." : "Share your thoughts..."}
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  rows={5}
                />
                <div className="feedback-attach">
                  <label className="feedback-attach-btn">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                    Attach files
                    <input type="file" multiple hidden onChange={(e) => setFeedbackFiles(prev => [...prev, ...Array.from(e.target.files)])} />
                  </label>
                  {feedbackFiles.length > 0 && (
                    <div className="feedback-file-list">
                      {feedbackFiles.map((f, i) => (
                        <span key={i} className="feedback-file-tag">
                          {f.name}
                          <button onClick={() => setFeedbackFiles(prev => prev.filter((_, j) => j !== i))}>&times;</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  className="feedback-submit-btn"
                  disabled={!feedbackText.trim()}
                  onClick={() => {
                    console.log("Feedback submitted:", { type: feedbackType, text: feedbackText, files: feedbackFiles.map(f => f.name) });
                    setFeedbackSent(true);
                  }}
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
