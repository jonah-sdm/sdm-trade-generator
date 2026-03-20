import { useState, useRef, useCallback } from "react";

const GOLD  = "#ffcc36";
const BLACK = "#111111";
const GREY  = "#EFEFEF";

// Parse CSV text → array of objects
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim().toLowerCase());
  return lines.slice(1).map(line => {
    // Handle quoted fields with commas
    const values = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === "," && !inQ) { values.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    values.push(cur.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = (values[i] || "").replace(/^"|"$/g, ""); });
    return row;
  }).filter(r => r.name || r.company);
}

// Convert array of objects → CSV string
function toCSV(rows) {
  if (!rows.length) return "";
  const headers = ["name", "title", "company", "website_url", "company_linkedin_url", "person_linkedin_url", "industry"];
  const escape = v => `"${(v || "").replace(/"/g, '""')}"`;
  return [
    headers.join(","),
    ...rows.map(r => headers.map(h => escape(r[h] || "")).join(","))
  ].join("\n");
}

export default function ConferenceLeads({ onBack }) {
  const [tab, setTab] = useState("scrape"); // "scrape" | "enrich"
  const [csvData, setCsvData] = useState(null);   // parsed rows
  const [csvName, setCsvName] = useState("");
  const [dragging, setDragging] = useState(false);

  // Enrichment state
  const [enriching, setEnriching]       = useState(false);
  const [enrichedRows, setEnrichedRows] = useState(null);
  const [progress, setProgress]         = useState({ done: 0, total: 0, log: [] });
  const [enrichError, setEnrichError]   = useState(null);

  const fileRef = useRef(null);

  const handleCSV = useCallback((file) => {
    if (!file || !file.name.endsWith(".csv")) {
      alert("Please upload a .csv file");
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const rows = parseCSV(e.target.result);
      if (!rows.length) { alert("CSV appears empty or missing name/company columns."); return; }
      setCsvData(rows);
      setCsvName(file.name);
      setEnrichedRows(null);
      setProgress({ done: 0, total: 0, log: [] });
      setEnrichError(null);
      setTab("enrich");
    };
    reader.readAsText(file);
  }, []);

  const onDrop = useCallback(e => {
    e.preventDefault(); setDragging(false);
    handleCSV(e.dataTransfer.files[0]);
  }, [handleCSV]);

  const runEnrichment = useCallback(async () => {
    if (!csvData?.length) return;
    setEnriching(true);
    setEnrichedRows(null);
    setEnrichError(null);

    const BATCH = 50;
    const total = csvData.length;
    setProgress({ done: 0, total, log: [`Starting enrichment of ${total} attendees…`] });

    const allEnriched = [];

    for (let offset = 0; offset < total; offset += BATCH) {
      const batch = csvData.slice(offset, offset + BATCH);
      const batchNum = Math.floor(offset / BATCH) + 1;
      const totalBatches = Math.ceil(total / BATCH);

      setProgress(p => ({
        ...p,
        log: [...p.log, `Batch ${batchNum}/${totalBatches} — enriching ${batch.length} attendees…`]
      }));

      try {
        const res = await fetch("/api/enrich-leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attendees: batch }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        allEnriched.push(...data.enriched);

        const filled = data.enriched.filter(r => r.website_url || r.person_linkedin_url).length;
        setProgress(p => ({
          done: allEnriched.length,
          total,
          log: [...p.log, `  ✓ Batch ${batchNum} done — ${filled}/${batch.length} records enriched`]
        }));
      } catch (err) {
        setEnrichError(err.message);
        setEnriching(false);
        return;
      }
    }

    setEnrichedRows(allEnriched);
    setProgress(p => ({
      ...p,
      log: [...p.log, `\nComplete! ${allEnriched.filter(r => r.website_url || r.person_linkedin_url).length} of ${total} records enriched.`]
    }));
    setEnriching(false);
  }, [csvData]);

  const downloadCSV = () => {
    const csv = toCSV(enrichedRows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = csvName.replace(".csv", "") + "_enriched.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const S = {
    wrap:    { fontFamily: "'Poppins',sans-serif", maxWidth: 900, margin: "0 auto", padding: "40px 48px" },
    back:    { background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#888", display: "flex", alignItems: "center", gap: 6, marginBottom: 24, padding: 0 },
    header:  { marginBottom: 32 },
    h1:      { fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 28, color: BLACK, marginBottom: 8 },
    sub:     { color: "#888", fontSize: 14 },
    tabs:    { display: "flex", gap: 0, borderBottom: "2px solid #E8E8E8", marginBottom: 32 },
    tab:     (active) => ({
      background: "none", border: "none", cursor: "pointer",
      padding: "10px 24px", fontFamily: "'Montserrat',sans-serif",
      fontSize: 13, fontWeight: 600, letterSpacing: 0.5,
      color: active ? BLACK : "#888",
      borderBottom: `2px solid ${active ? GOLD : "transparent"}`,
      marginBottom: -2, transition: "color 0.15s",
    }),
    card:    { background: "#fff", border: "1px solid #E8E8E8", borderRadius: 2, padding: 28, marginBottom: 20 },
    pill:    (color, bg) => ({ background: bg, color, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", padding: "3px 8px", borderRadius: 2 }),
    btn:     (primary) => ({
      background: primary ? BLACK : "#fff",
      color: primary ? "#fff" : BLACK,
      border: primary ? "none" : "1px solid #111",
      borderRadius: 2, padding: "11px 22px",
      fontFamily: "'Montserrat',sans-serif", fontSize: 12, fontWeight: 700,
      letterSpacing: 1, textTransform: "uppercase", cursor: "pointer",
      transition: "opacity 0.15s",
    }),
    uploadArea: (active) => ({
      border: `2px dashed ${active ? GOLD : "#D1D1D6"}`,
      borderRadius: 4, padding: 36, textAlign: "center", cursor: "pointer",
      background: active ? "#fffbeb" : "#FAFAFA",
      transition: "all 0.15s",
    }),
    table:   { width: "100%", borderCollapse: "collapse", fontSize: 12 },
    th:      { background: GREY, padding: "8px 10px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #E8E8E8", fontFamily: "'Montserrat',sans-serif", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" },
    td:      { padding: "7px 10px", borderBottom: "1px solid #F5F5F5", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    log:     { background: "#1c1c1e", color: "#d1d1d6", borderRadius: 4, padding: 16, fontFamily: "monospace", fontSize: 12, lineHeight: 1.7, maxHeight: 200, overflowY: "auto", whiteSpace: "pre-wrap" },
    badge:   (color, bg) => ({ display: "inline-flex", alignItems: "center", gap: 4, background: bg, color, padding: "3px 8px", borderRadius: 2, fontSize: 11, fontWeight: 600, marginRight: 6 }),
  };

  return (
    <div style={S.wrap}>
      <button style={S.back} onClick={onBack}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Home
      </button>

      <div style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ width: 40, height: 40, background: BLACK, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <h1 style={S.h1}>Conference Leads</h1>
          <span style={S.pill("#111", GOLD)}>SALES</span>
        </div>
        <p style={S.sub}>Scrape attendee data from conference videos, then enrich with company websites, LinkedIn URLs, and industry tags.</p>
      </div>

      {/* Tabs */}
      <div style={S.tabs}>
        <button style={S.tab(tab === "scrape")} onClick={() => setTab("scrape")}>
          Step 1 — Scrape Leads
        </button>
        <button style={S.tab(tab === "enrich")} onClick={() => setTab("enrich")}>
          Step 2 — Enrich Leads {csvData ? `(${csvData.length})` : ""}
        </button>
      </div>

      {/* ── Tab 1: Scrape ── */}
      {tab === "scrape" && (
        <div>
          <div style={{ ...S.card, borderTop: `3px solid ${GOLD}` }}>
            <h2 style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 8 }}>How it works</h2>
            <p style={{ fontSize: 13, color: "#555", lineHeight: 1.7, marginBottom: 20 }}>
              The video scraper runs locally on your Mac using AI to read each frame and extract attendee names, titles, and companies.
              Once done, upload the CSV here to enrich it with LinkedIn URLs and company data.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
              {[
                ["1", "Run the local scraper", "Open Terminal and run the conference extractor on your video file (~2 min for 30-min video)"],
                ["2", "Download the CSV", "The scraper outputs a CSV with name, title, and company for every attendee found"],
                ["3", "Upload & Enrich", "Come back here, upload the CSV, and run enrichment to add LinkedIn + company data"],
              ].map(([n, title, desc]) => (
                <div key={n} style={{ background: GREY, borderRadius: 2, padding: 16 }}>
                  <div style={{ width: 24, height: 24, background: BLACK, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                    <span style={{ color: GOLD, fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 12 }}>{n}</span>
                  </div>
                  <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 12, marginBottom: 6 }}>{title}</div>
                  <div style={{ fontSize: 12, color: "#666", lineHeight: 1.6 }}>{desc}</div>
                </div>
              ))}
            </div>

            <div style={{ background: "#1c1c1e", borderRadius: 4, padding: "14px 18px", marginBottom: 20 }}>
              <div style={{ fontFamily: "monospace", fontSize: 12, color: "#ffcc36", marginBottom: 4 }}># In Terminal, run:</div>
              <div style={{ fontFamily: "monospace", fontSize: 12, color: "#d1d1d6" }}>python3 ~/Downloads/conference-extractor/app.py</div>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: "#888", marginTop: 4 }}># Then open http://localhost:8080</div>
            </div>
          </div>

          <div style={S.card}>
            <h2 style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Already have a CSV? Upload it to enrich</h2>
            <div
              style={S.uploadArea(dragging)}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="1.5" style={{ marginBottom: 8 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                {csvData ? `✓ ${csvName} (${csvData.length} attendees)` : "Click or drag a CSV file here"}
              </div>
              <div style={{ fontSize: 12, color: "#888" }}>Must have name, title, company columns</div>
            </div>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={e => handleCSV(e.target.files[0])} />
            {csvData && (
              <button style={{ ...S.btn(true), marginTop: 16, width: "100%" }} onClick={() => setTab("enrich")}>
                Continue to Enrichment →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Tab 2: Enrich ── */}
      {tab === "enrich" && (
        <div>
          {!csvData ? (
            <div style={{ ...S.card, textAlign: "center", padding: 48 }}>
              <p style={{ color: "#888", fontSize: 14, marginBottom: 20 }}>No CSV loaded yet. Go to Step 1 to upload your scraped leads.</p>
              <button style={S.btn(false)} onClick={() => setTab("scrape")}>← Go to Step 1</button>
            </div>
          ) : (
            <>
              {/* What gets added */}
              <div style={{ ...S.card, borderTop: `3px solid ${GOLD}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <h2 style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
                      {csvName} — {csvData.length} attendees
                    </h2>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <span style={S.badge("#2e7d32", "#e8f5e9")}>✦ Website URL (Claude)</span>
                      <span style={S.badge("#2e7d32", "#e8f5e9")}>✦ Company LinkedIn (Claude)</span>
                      <span style={S.badge("#2e7d32", "#e8f5e9")}>✦ Industry (Claude)</span>
                      <span style={S.badge("#1565c0", "#e3f2fd")}>✦ Person LinkedIn (Apollo)</span>
                    </div>
                  </div>
                  <button style={{ ...S.btn(false), fontSize: 11 }} onClick={() => setTab("scrape")}>← Change CSV</button>
                </div>

                {/* Preview table */}
                <div style={{ overflowX: "auto", maxHeight: 220, overflowY: "auto", borderRadius: 2, border: "1px solid #E8E8E8" }}>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        {["Name", "Title", "Company"].map(h => <th key={h} style={S.th}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {csvData.slice(0, 8).map((r, i) => (
                        <tr key={i}>
                          <td style={S.td}>{r.name}</td>
                          <td style={S.td}>{r.title}</td>
                          <td style={S.td}>{r.company}</td>
                        </tr>
                      ))}
                      {csvData.length > 8 && (
                        <tr><td colSpan={3} style={{ ...S.td, color: "#888", textAlign: "center" }}>…and {csvData.length - 8} more</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {!enriching && !enrichedRows && (
                  <button style={{ ...S.btn(true), marginTop: 20, width: "100%" }} onClick={runEnrichment}>
                    Run Enrichment
                  </button>
                )}
              </div>

              {/* Progress */}
              {(enriching || progress.log.length > 0) && (
                <div style={S.card}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    {enriching && (
                      <div style={{ width: 16, height: 16, border: "2px solid #E8E8E8", borderTopColor: GOLD, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                    )}
                    <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13 }}>
                      {enriching ? `Enriching… ${progress.done}/${progress.total}` : enrichedRows ? "Done!" : ""}
                    </span>
                    {progress.total > 0 && !enriching && (
                      <span style={S.pill("#111", GOLD)}>{progress.done} processed</span>
                    )}
                  </div>
                  <div style={S.log} ref={el => el && (el.scrollTop = el.scrollHeight)}>
                    {progress.log.join("\n")}
                  </div>
                  {enrichError && (
                    <div style={{ background: "#fff2f2", border: "1px solid #ff3b30", borderRadius: 4, padding: 12, marginTop: 12, fontSize: 13, color: "#c0392b" }}>
                      Error: {enrichError}
                    </div>
                  )}
                </div>
              )}

              {/* Results */}
              {enrichedRows && (
                <div style={{ ...S.card, borderTop: `3px solid #16a34a` }}>
                  <h2 style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 16 }}>
                    Enrichment Complete
                  </h2>
                  <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
                    {[
                      ["Website URLs", enrichedRows.filter(r => r.website_url).length],
                      ["Company LinkedIn", enrichedRows.filter(r => r.company_linkedin_url).length],
                      ["Person LinkedIn", enrichedRows.filter(r => r.person_linkedin_url).length],
                      ["Industry Tags", enrichedRows.filter(r => r.industry).length],
                    ].map(([label, count]) => (
                      <div key={label} style={{ background: GREY, borderRadius: 2, padding: "12px 16px", flex: 1, textAlign: "center" }}>
                        <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 22, color: BLACK }}>{count}</div>
                        <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{label}</div>
                      </div>
                    ))}
                  </div>
                  <button style={{ ...S.btn(true), width: "100%" }} onClick={downloadCSV}>
                    Download Enriched CSV
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
