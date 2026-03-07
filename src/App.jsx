import { useState, useCallback, useEffect, useRef, memo } from "react";
import { TRADE_TYPES } from "./tradeTypes";
import { checkCanvaStatus, startCanvaAuth, exportToCanva, buildReplacements } from "./canvaService";
import { computeTradeAnalysis } from "./payoffEngine";
import { computeLendingProposal, SUPPORTED_ASSETS } from "./lendingEngine";
import TradeReport from "./TradeReport";
import LendingReport from "./LendingReport";
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

function FieldInput({ field, value, onChange }) {
  const editorRef = useRef(null);

  if (field.type === "textarea") {
    return (
      <div className="field-group field-group-wide">
        <label className="field-label">{field.label}</label>
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
      <div className="field-group">
        <label className="field-label">{field.label}</label>
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
  const displayValue = isNum && value
    ? value.replace(/,/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    : (value || "");
  return (
    <div className="field-group">
      <label className="field-label">{field.label}</label>
      <input
        className="field-input"
        type="text"
        inputMode={isNum ? "decimal" : undefined}
        placeholder={field.placeholder}
        value={displayValue}
        onChange={e => {
          const raw = isNum ? e.target.value.replace(/,/g, "") : e.target.value;
          if (isNum && raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
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

  const skipPushRef = useRef(false);

  const isLendingPhase = phase === PHASES.LENDING_CONFIGURE || phase === PHASES.LENDING_GENERATING || phase === PHASES.LENDING_RESULT;
  const isTradingPhase = [PHASES.SELECT, PHASES.UPLOAD, PHASES.CONFIGURE, PHASES.GENERATING, PHASES.RESULT].includes(phase);
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

      <main className="main">
        {/* ═══ PHASE: HOME — Product Selection ═══ */}
        {phase === PHASES.HOME && (
          <div className="phase-home">
            <div className="home-header">
              <img src="/sdm-logo-full.svg" alt="Secure Digital Markets" className="home-logo-full" />
              <h1 className="home-title">SDM Studio</h1>
              <p className="home-sub">Institutional-grade tools for digital asset trading, lending, and derivatives.</p>
            </div>

            <div className="home-cta-label">
              <span className="home-cta-line" />
              <span className="home-cta-text">Select a Product</span>
              <span className="home-cta-line" />
            </div>

            <div className="product-grid">
              {/* Sales Library */}
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

              {/* Trading Desk — Coming Soon */}
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

              {/* Derivatives */}
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

              {/* Lending */}
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
                <div className="output-preview-item"><span className="output-icon">&nearr;</span><span>Canva Export (optional)</span></div>
              </div>
              <button className="btn-back" onClick={() => navigateTo(PHASES.SELECT)}>&larr; Back to Trade Types</button>
            </div>
            <div className="configure-form">
              <div className="form-header">
                <h2 className="form-title">Configure Trade Details</h2>
                <p className="form-sub">Fill in the deal-specific inputs. These power the payoff calculations and report generation.</p>
              </div>
              <div className="fields-grid">
                {selectedTrade.fields.map(field => (
                  <FieldInput key={field.key} field={field} value={fieldValues[field.key]} onChange={handleFieldChange} />
                ))}
              </div>
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
              <h2 className="generating-title">Building your report</h2>
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
                <div className="output-preview-item"><span className="output-icon">&nearr;</span><span>Executive Summary</span></div>
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
              <h2 className="generating-title">Building your lending proposal</h2>
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
        <div className="footer-nav">
          <button className="footer-nav-link" onClick={handleReset}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            Home
          </button>
          <button className="footer-nav-link" onClick={() => { setSelectedTrade(null); navigateTo(PHASES.SELECT); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
            Derivatives Studio
          </button>
          <button className="footer-nav-link" onClick={() => navigateTo(PHASES.LENDING_CONFIGURE)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
            Lending
          </button>
          <button className="footer-nav-link" onClick={() => navigateTo(PHASES.SALES_LIBRARY)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            Sales Library
          </button>
          <button className="footer-nav-link" onClick={() => setShowFeedback(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Feedback
          </button>
        </div>
        <div className="footer-meta">
          <span>SDM &mdash; Internal Use Only</span>
          <span className="footer-dot">&middot;</span>
          <span>SDM Studio v1.0</span>
        </div>
      </footer>

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
