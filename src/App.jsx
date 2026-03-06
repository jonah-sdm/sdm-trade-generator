import { useState, useCallback, useEffect, useRef, memo } from "react";
import { TRADE_TYPES } from "./tradeTypes";
import { checkCanvaStatus, startCanvaAuth, exportToCanva, buildReplacements } from "./canvaService";
import { computeTradeAnalysis } from "./payoffEngine";
import TradeReport from "./TradeReport";
import "./index.css";

const PHASES = {
  HOME: "home",
  SELECT: "select",
  UPLOAD: "upload",
  CONFIGURE: "configure",
  GENERATING: "generating",
  RESULT: "result",
};

const PHASE_TITLES = {
  [PHASES.HOME]: "SDM Trade Idea Studio",
  [PHASES.SELECT]: "Select Trade — SDM Trade Idea Studio",
  [PHASES.UPLOAD]: "Upload — SDM Trade Idea Studio",
  [PHASES.CONFIGURE]: "Configure — SDM Trade Idea Studio",
  [PHASES.GENERATING]: "Generating — SDM Trade Idea Studio",
  [PHASES.RESULT]: "Report — SDM Trade Idea Studio",
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
  return (
    <div className="field-group">
      <label className="field-label">{field.label}</label>
      <input
        className="field-input"
        type={field.type === "number" ? "text" : field.type}
        inputMode={field.type === "number" ? "decimal" : undefined}
        placeholder={field.placeholder}
        value={value || ""}
        onChange={e => onChange(field.key, e.target.value)}
      />
    </div>
  );
}

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
  const skipPushRef = useRef(false);

  // ─── Phase history (browser back/forward) ───
  const navigateTo = useCallback((newPhase) => {
    setPhase(newPhase);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (!skipPushRef.current) {
      window.history.pushState({ phase: newPhase }, "", `#${newPhase}`);
    }
    skipPushRef.current = false;
  }, []);

  // Set initial history entry
  useEffect(() => {
    window.history.replaceState({ phase: PHASES.HOME }, "", "#home");
  }, []);

  // Listen for browser back/forward
  useEffect(() => {
    const onPopState = (e) => {
      const targetPhase = e.state?.phase || PHASES.HOME;
      skipPushRef.current = true;
      // For phases that need selected trade context, fall back gracefully
      if ((targetPhase === PHASES.CONFIGURE || targetPhase === PHASES.RESULT || targetPhase === PHASES.GENERATING) && !selectedTrade) {
        setPhase(PHASES.HOME);
      } else {
        setPhase(targetPhase);
      }
      setError(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [selectedTrade]);

  // Update document title on phase change
  useEffect(() => {
    document.title = PHASE_TITLES[phase] || "SDM Trade Idea Studio";
  }, [phase]);

  // Check Canva connection status
  useEffect(() => {
    checkCanvaStatus().then(setCanvaConnected).catch(() => {});
    // Re-check when window regains focus (after OAuth popup)
    const onFocus = () => checkCanvaStatus().then(setCanvaConnected).catch(() => {});
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

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

  const handleGenerate = () => {
    setError(null);
    navigateTo(PHASES.GENERATING);
    setGeneratingStep(0);

    const steps = [
      "Analyzing trade structure...",
      "Computing payoff matrix...",
      "Building risk profile...",
      "Rendering report...",
    ];

    let i = 0;
    const interval = setInterval(() => {
      i++;
      setGeneratingStep(i);
      if (i >= steps.length - 1) {
        clearInterval(interval);
        setTimeout(() => navigateTo(PHASES.RESULT), 400);
      }
    }, 500);
  };

  const handleExportCanva = async () => {
    if (!canvaConnected) {
      startCanvaAuth();
      return;
    }

    setCanvaExporting(true);
    try {
      // Template ID — set this to your SDM Canva brand template
      const templateId = localStorage.getItem("sdm_canva_template") || prompt("Enter your Canva Brand Template ID:");
      if (!templateId) { setCanvaExporting(false); return; }
      localStorage.setItem("sdm_canva_template", templateId);

      const analysis = computeTradeAnalysis(selectedTrade.id, fieldValues);
      const replacements = buildReplacements(selectedTrade.id, fieldValues, analysis?.metrics);

      const res = await exportToCanva(templateId, {
        trade_label: selectedTrade.label,
        replacements,
      });
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

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-inner">
          <div className="header-brand" onClick={handleReset} style={{ cursor: "pointer" }}>
            <div className="header-logo">
              <img src="/sdm-logo-white.svg" alt="SDM" width="28" height="30" />
            </div>
            <span className="header-title">Trade Idea Studio</span>
          </div>
          <div className="header-badge" onClick={() => !canvaConnected && startCanvaAuth()} style={{ cursor: canvaConnected ? "default" : "pointer" }}>
            <span className={`badge-dot ${canvaConnected ? "" : "badge-dot-off"}`} />
            <span className="badge-text">{canvaConnected ? "Canva Connected" : "Connect Canva"}</span>
          </div>
        </div>

        {/* Breadcrumb — hidden on home */}
        {phase !== PHASES.HOME && (
          <div className="breadcrumb">
            <button className="crumb crumb-home" onClick={handleReset}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </button>
            <span className="crumb-sep">›</span>
            <button
              className={`crumb ${phase === PHASES.SELECT ? "active" : ""} ${phase === PHASES.UPLOAD ? "active" : ""}`}
              onClick={phase !== PHASES.SELECT ? () => navigateTo(PHASES.SELECT) : undefined}
              disabled={phase === PHASES.SELECT}
            >
              01 — Select Trade
            </button>
            <span className="crumb-sep">›</span>
            <button
              className={`crumb ${phase === PHASES.CONFIGURE ? "active" : ""}`}
              onClick={phase === PHASES.RESULT || phase === PHASES.GENERATING ? () => navigateTo(PHASES.CONFIGURE) : undefined}
              disabled={phase === PHASES.CONFIGURE || phase === PHASES.SELECT || phase === PHASES.UPLOAD}
            >
              02 — Configure
            </button>
            <span className="crumb-sep">›</span>
            <span className={`crumb ${phase === PHASES.RESULT || phase === PHASES.GENERATING ? "active" : ""}`}>
              03 — Report
            </span>
          </div>
        )}
      </header>

      <main className="main">
        {/* PHASE: HOME — Choose workflow */}
        {phase === PHASES.HOME && (
          <div className="phase-home">
            <div className="home-header">
              <img src="/sdm-logo.svg" alt="SDM" className="home-logo" />
              <h1 className="home-title">Trade Idea Studio</h1>
              <p className="home-sub">Generate institutional-grade trade reports in seconds.</p>
            </div>

            <div className="home-cta-label">
              <span className="home-cta-line" />
              <span className="home-cta-text">Get Started</span>
              <span className="home-cta-line" />
            </div>

            <div className="home-options">
              <button className="home-card" onClick={() => navigateTo(PHASES.SELECT)}>
                <div className="home-card-top">
                  <div className="home-card-icon-ring">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
                  </div>
                  <span className="home-card-badge">REPORT</span>
                </div>
                <h2 className="home-card-title">Create a Trade Report</h2>
                <p className="home-card-desc">Select a structure, configure parameters, and generate a full analysis with payoff diagrams, KPIs, and executive summary.</p>
                <div className="home-card-cta">
                  <span>Select trade type</span>
                  <span className="home-card-arrow">→</span>
                </div>
              </button>
              <div className="home-card home-card-upload-container">
                <div className="home-card-top">
                  <div className="home-card-icon-ring">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 12 15 15"/></svg>
                  </div>
                  <span className="home-card-badge">IMPORT</span>
                </div>
                <h2 className="home-card-title">Import a Document</h2>
                <p className="home-card-desc">Upload a file or paste a link to a Google Doc, Sheet, Slides, PDF, PowerPoint, or any document to generate a branded report.</p>

                <label className="upload-file-btn">
                  <input type="file" accept=".csv,.xlsx,.xls,.json,.pdf,.doc,.docx,.ppt,.pptx,.txt,.rtf,.numbers,.key,.pages" onChange={handleFileUpload} hidden />
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  <span>Upload file</span>
                </label>

                <div className="upload-or-divider">
                  <span className="upload-or-line" />
                  <span className="upload-or-text">or paste a link</span>
                  <span className="upload-or-line" />
                </div>

                <form className="upload-url-form" onSubmit={(e) => { e.preventDefault(); handleUrlSubmit(e.target.elements.docUrl.value); }}>
                  <input
                    name="docUrl"
                    className="upload-url-input"
                    type="url"
                    placeholder="https://docs.google.com/..."
                  />
                  <button type="submit" className="upload-url-btn">→</button>
                </form>

                <div className="upload-supported">
                  <span>Supports: Google Docs, Sheets, Slides, PDF, Excel, PowerPoint, CSV, Word</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PHASE: UPLOAD — File or URL uploaded */}
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
                <button className="btn-back" onClick={handleReset}>← Back to Home</button>
                <button className="btn-generate" style={{ "--accent": "var(--blue)" }} onClick={() => navigateTo(PHASES.SELECT)}>
                  <span>Create manually instead</span>
                  <span className="btn-arrow">→</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PHASE: SELECT */}
        {phase === PHASES.SELECT && (
          <div className="phase-select">
            <div className="phase-header">
              <button className="btn-back" onClick={handleReset}>← Back to Home</button>
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

        {/* PHASE: CONFIGURE */}
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
                <div className="output-preview-item">
                  <span className="output-icon">◈</span>
                  <span>Payoff Diagram</span>
                </div>
                <div className="output-preview-item">
                  <span className="output-icon">▣</span>
                  <span>Risk/Reward KPIs</span>
                </div>
                <div className="output-preview-item">
                  <span className="output-icon">⧉</span>
                  <span>Trade Structure Breakdown</span>
                </div>
                <div className="output-preview-item">
                  <span className="output-icon">↗</span>
                  <span>Canva Export (optional)</span>
                </div>
              </div>

              <button className="btn-back" onClick={() => navigateTo(PHASES.SELECT)}>← Back to Trade Types</button>
            </div>

            <div className="configure-form">
              <div className="form-header">
                <h2 className="form-title">Configure Trade Details</h2>
                <p className="form-sub">Fill in the deal-specific inputs. These power the payoff calculations and report generation.</p>
              </div>

              <div className="fields-grid">
                {selectedTrade.fields.map(field => (
                  <FieldInput
                    key={field.key}
                    field={field}
                    value={fieldValues[field.key]}
                    onChange={handleFieldChange}
                  />
                ))}
              </div>

              {error && (
                <div className="error-banner">
                  <span className="error-icon">⚠</span>
                  {error}
                </div>
              )}

              <div className="form-actions">
                <div className="form-action-note" />
                <button
                  className="btn-generate"
                  onClick={handleGenerate}
                  style={{ "--accent": selectedTrade.color }}
                >
                  <span>Generate Report</span>
                  <span className="btn-arrow">→</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PHASE: GENERATING */}
        {phase === PHASES.GENERATING && selectedTrade && (
          <div className="phase-generating">
            <div className="generating-inner">
              <div className="generating-glyph" style={{ "--accent": selectedTrade.color }}>
                {selectedTrade.icon}
              </div>
              <h2 className="generating-title">Building your report</h2>
              <div className="generating-steps">
                {[
                  "Analyzing trade structure",
                  "Computing payoff matrix",
                  "Building risk profile",
                  "Rendering report",
                ].map((step, i) => (
                  <div key={i} className={`gen-step ${i <= generatingStep ? "done" : ""} ${i === generatingStep ? "active" : ""}`}>
                    <div className="gen-step-dot" />
                    <span>{step}</span>
                    {i < generatingStep && <span className="gen-check">✓</span>}
                    {i === generatingStep && <span className="gen-spinner" />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PHASE: RESULT — Full Trade Report */}
        {phase === PHASES.RESULT && selectedTrade && (
          <TradeReport
            trade={selectedTrade}
            fieldValues={fieldValues}
            onBack={() => navigateTo(PHASES.CONFIGURE)}
            onReset={handleReset}
          />
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
            <span className="canva-toast-check">✓</span>
            <span>Exported to Canva</span>
            <a href={canvaResult.editUrl} target="_blank" rel="noreferrer" className="canva-toast-link">Open →</a>
            <button className="canva-toast-close" onClick={() => setCanvaResult(null)}>×</button>
          </div>
        </div>
      )}

      <footer className="footer">
        <span>SDM — Internal Use Only</span>
        <span className="footer-dot">·</span>
        <span>Trade Idea Studio v1.0</span>
        <span className="footer-dot">·</span>
        <span>Powered by Claude + Canva</span>
      </footer>
    </div>
  );
}
