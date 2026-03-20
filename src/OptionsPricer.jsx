import { useState, useEffect, useRef, useCallback } from "react";
import { computeLegs, scenarioTable, fmtPrice, fmtGreek, fmtPnl, fmt } from "./utils/blackScholes";

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  bg:      "#0D0D0D",
  surface: "#161616",
  card:    "#1C1C1C",
  border:  "#2A2A2A",
  gold:    "#FFC32C",
  goldDim: "#A07A10",
  text:    "#F0F0F0",
  muted:   "#888888",
  dim:     "#555555",
  green:   "#22c55e",
  red:     "#ef4444",
  input:   "#111111",
  inputBorder: "#333333",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
let _legCounter = 0;
function newLegId() { return ++_legCounter; }

function defaultLeg(legNum, spot = 95000) {
  return {
    id:          newLegId(),
    legNum,
    type:        "call",
    side:        "buy",
    spot,
    strike:      legNum === 1 ? spot : Math.round(spot * 1.05 / 1000) * 1000,
    tenor:       30,
    iv:          75,
    rate:        0,
    qty:         1,
    spotLinked:  true,
  };
}

// ─── Styled sub-components ────────────────────────────────────────────────────
function SectionHeader({ children }) {
  return (
    <div style={{
      fontFamily: "'Montserrat',sans-serif",
      fontSize: 10,
      letterSpacing: 2.5,
      color: T.muted,
      textTransform: "uppercase",
      fontWeight: 600,
      marginBottom: 16,
    }}>
      {children}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: T.card,
      border: `1px solid ${T.border}`,
      borderRadius: 3,
      padding: "24px",
      ...style,
    }}>
      {children}
    </div>
  );
}

function DarkSelect({ value, onChange, options, style }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        background: T.input,
        color: T.text,
        border: `1px solid ${T.inputBorder}`,
        borderRadius: 2,
        padding: "6px 28px 6px 10px",
        fontSize: 13,
        fontFamily: "'Poppins',sans-serif",
        cursor: "pointer",
        outline: "none",
        appearance: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='7' viewBox='0 0 10 7'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' strokeWidth='1.5' fill='none' strokeLinecap='round'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 10px center",
        ...style,
      }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function DarkInput({ value, onChange, placeholder, style }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        background: T.input,
        color: T.text,
        border: `1px solid ${focused ? T.gold : T.inputBorder}`,
        borderRadius: 2,
        padding: "6px 10px",
        fontSize: 13,
        fontFamily: "'Poppins',sans-serif",
        outline: "none",
        width: "100%",
        boxSizing: "border-box",
        transition: "border-color 0.15s",
        ...style,
      }}
    />
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function OptionsPricer({ onBack }) {
  const [underlying, setUnderlying] = useState("BTC");
  const [customTicker, setCustomTicker] = useState("");
  const [globalSpot, setGlobalSpot] = useState(95000);
  const [syncSpot, setSyncSpot] = useState(true);
  const [legs, setLegs] = useState(() => [defaultLeg(1, 95000), defaultLeg(2, 95000)]);
  const [results, setResults] = useState(null);
  const debounceRef = useRef(null);

  // ─── Recalculate on change (debounced 300ms) ───────────────────────────────
  const recalculate = useCallback(() => {
    try {
      const legsToCalc = legs.map(l => ({
        ...l,
        spot: syncSpot ? globalSpot : l.spot,
      }));
      const { pricedLegs, netPremium, netDelta, netGamma, netVega, netTheta } =
        computeLegs(legsToCalc, syncSpot ? globalSpot : null);
      const scenarios = scenarioTable(pricedLegs, netPremium);
      setResults({ pricedLegs, netPremium, netDelta, netGamma, netVega, netTheta, scenarios });
    } catch (e) {
      console.error("Pricing error:", e);
    }
  }, [legs, globalSpot, syncSpot]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(recalculate, 300);
    return () => clearTimeout(debounceRef.current);
  }, [recalculate]);

  // ─── Leg mutators ──────────────────────────────────────────────────────────
  const updateLeg = (id, field, value) => {
    setLegs(prev => prev.map(l =>
      l.id === id ? { ...l, [field]: value } : l
    ));
  };

  const addLeg = () => {
    setLegs(prev => {
      const legNum = prev.length + 1;
      return [...prev, defaultLeg(legNum, globalSpot)];
    });
  };

  const removeLeg = (id) => {
    setLegs(prev => {
      const next = prev.filter(l => l.id !== id);
      return next.map((l, i) => ({ ...l, legNum: i + 1 }));
    });
  };

  // ─── Global spot sync ──────────────────────────────────────────────────────
  const handleGlobalSpot = (val) => {
    const n = parseFloat(val.replace(/,/g, ""));
    if (!isNaN(n)) {
      setGlobalSpot(n);
      if (syncSpot) {
        setLegs(prev => prev.map(l => l.spotLinked ? { ...l, spot: n } : l));
      }
    } else if (val === "" || val === "-") {
      setGlobalSpot(0);
    }
  };

  const underlyingLabel = underlying === "Other" ? (customTicker || "—") : underlying;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: T.bg, minHeight: "100vh", fontFamily: "'Poppins',sans-serif" }}>

      {/* ── Page header ── */}
      <div style={{
        background: T.surface,
        borderBottom: `1px solid ${T.border}`,
        padding: "0 48px",
      }}>
        <div style={{ maxWidth: 1300, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <button
                onClick={onBack}
                style={{
                  background: "transparent",
                  border: `1px solid ${T.border}`,
                  borderRadius: 2,
                  color: T.muted,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontFamily: "'Poppins',sans-serif",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                ← Back
              </button>
              <div style={{ width: 1, height: 24, background: T.border }} />
              <div>
                <span style={{
                  fontFamily: "'Montserrat',sans-serif",
                  fontSize: 10,
                  letterSpacing: 2,
                  color: T.gold,
                  textTransform: "uppercase",
                  fontWeight: 600,
                  display: "block",
                  marginBottom: 2,
                }}>
                  SDM / Options
                </span>
                <span style={{
                  fontFamily: "'Montserrat',sans-serif",
                  fontSize: 18,
                  fontWeight: 700,
                  color: T.text,
                  letterSpacing: -0.3,
                }}>
                  Options Pricer
                </span>
              </div>
            </div>
            <div style={{
              fontFamily: "'Montserrat',sans-serif",
              fontSize: 10,
              letterSpacing: 2,
              color: T.dim,
              textTransform: "uppercase",
            }}>
              Black-Scholes · European Vanilla
            </div>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "40px 48px", display: "flex", flexDirection: "column", gap: 28 }}>

        {/* ── Config bar ── */}
        <Card style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
            {/* Underlying */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 10, letterSpacing: 2, color: T.muted, textTransform: "uppercase", fontWeight: 600 }}>
                Underlying
              </label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {["BTC", "ETH", "SOL", "Other"].map(u => (
                  <button
                    key={u}
                    onClick={() => setUnderlying(u)}
                    style={{
                      background: underlying === u ? T.gold : "transparent",
                      color: underlying === u ? "#111" : T.muted,
                      border: `1px solid ${underlying === u ? T.gold : T.border}`,
                      borderRadius: 2,
                      padding: "5px 14px",
                      fontSize: 12,
                      fontFamily: "'Montserrat',sans-serif",
                      fontWeight: 600,
                      letterSpacing: 1,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {u}
                  </button>
                ))}
                {underlying === "Other" && (
                  <DarkInput
                    value={customTicker}
                    onChange={setCustomTicker}
                    placeholder="Ticker"
                    style={{ width: 90 }}
                  />
                )}
              </div>
            </div>

            {/* Global spot */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 10, letterSpacing: 2, color: T.muted, textTransform: "uppercase", fontWeight: 600 }}>
                {underlyingLabel} Spot Price (USD)
              </label>
              <DarkInput
                value={globalSpot === 0 ? "" : globalSpot.toLocaleString("en-US")}
                onChange={handleGlobalSpot}
                placeholder="95,000"
                style={{ width: 160 }}
              />
            </div>

            {/* Spot sync toggle */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 10, letterSpacing: 2, color: T.muted, textTransform: "uppercase", fontWeight: 600 }}>
                Sync Spot Across Legs
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {[true, false].map(v => (
                  <button
                    key={String(v)}
                    onClick={() => setSyncSpot(v)}
                    style={{
                      background: syncSpot === v ? T.gold : "transparent",
                      color: syncSpot === v ? "#111" : T.muted,
                      border: `1px solid ${syncSpot === v ? T.gold : T.border}`,
                      borderRadius: 2,
                      padding: "5px 14px",
                      fontSize: 12,
                      fontFamily: "'Montserrat',sans-serif",
                      fontWeight: 600,
                      letterSpacing: 1,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {v ? "On" : "Off"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* ── Leg Input Table ── */}
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${T.border}` }}>
            <SectionHeader>Option Legs</SectionHeader>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr style={{ background: "#111111" }}>
                  {["Leg", "Type", "Side", "Spot (S)", "Strike (K)", "Tenor (Days)", "IV (%)", "Rate (%)", "Qty", ""].map((h, i) => (
                    <th key={i} style={{
                      padding: "10px 14px",
                      textAlign: i === 0 ? "center" : "left",
                      fontFamily: "'Montserrat',sans-serif",
                      fontSize: 10,
                      letterSpacing: 1.5,
                      color: T.muted,
                      textTransform: "uppercase",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      borderBottom: `1px solid ${T.border}`,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {legs.map((leg, idx) => (
                  <LegRow
                    key={leg.id}
                    leg={leg}
                    idx={idx}
                    syncSpot={syncSpot}
                    globalSpot={globalSpot}
                    onChange={updateLeg}
                    onRemove={removeLeg}
                    canRemove={legs.length > 1}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "16px 24px", borderTop: `1px solid ${T.border}` }}>
            <button
              onClick={addLeg}
              style={{
                background: "transparent",
                color: T.gold,
                border: `1px solid ${T.gold}`,
                borderRadius: 2,
                padding: "8px 20px",
                fontSize: 12,
                fontFamily: "'Montserrat',sans-serif",
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: "uppercase",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                transition: "background 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,195,44,0.08)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              + Add Leg
            </button>
          </div>
        </Card>

        {/* ── Results ── */}
        {results && results.pricedLegs.length > 0 && (
          <>
            {/* Per-leg results */}
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${T.border}` }}>
                <SectionHeader>Pricing Results</SectionHeader>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                  <thead>
                    <tr style={{ background: "#111111" }}>
                      {["Leg", "Type", "Side", "Strike", "BS Price", "Delta", "Gamma", "Vega", "Theta / Day", "Leg P&L"].map((h, i) => (
                        <th key={i} style={{
                          padding: "10px 14px",
                          textAlign: i === 0 ? "center" : "left",
                          fontFamily: "'Montserrat',sans-serif",
                          fontSize: 10,
                          letterSpacing: 1.5,
                          color: T.muted,
                          textTransform: "uppercase",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          borderBottom: `1px solid ${T.border}`,
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.pricedLegs.map((leg, idx) => {
                      const isEven = idx % 2 === 0;
                      const sideColor = leg.side === "buy" ? T.green : T.red;
                      return (
                        <tr key={leg.id} style={{ background: isEven ? T.card : "#181818" }}>
                          <td style={{ padding: "11px 14px", textAlign: "center", color: T.gold, fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13 }}>
                            {leg.legNum}
                          </td>
                          <td style={{ padding: "11px 14px", color: T.text, fontSize: 13, textTransform: "capitalize" }}>
                            {leg.type}
                          </td>
                          <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 600, color: sideColor, textTransform: "capitalize" }}>
                            {leg.side}
                          </td>
                          <td style={{ padding: "11px 14px", color: T.text, fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>
                            ${fmt(leg.strike)}
                          </td>
                          <td style={{ padding: "11px 14px", color: T.gold, fontSize: 13, fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>
                            {fmtPrice(leg.bsPrice)}
                          </td>
                          <td style={{ padding: "11px 14px", color: T.text, fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>
                            {fmtGreek(leg.delta)}
                          </td>
                          <td style={{ padding: "11px 14px", color: T.text, fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>
                            {fmtGreek(leg.gamma)}
                          </td>
                          <td style={{ padding: "11px 14px", color: T.text, fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>
                            {fmtGreek(leg.vega)}
                          </td>
                          <td style={{ padding: "11px 14px", color: leg.theta < 0 ? T.red : T.green, fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>
                            {fmtGreek(leg.theta)}
                          </td>
                          <td style={{
                            padding: "11px 14px",
                            fontSize: 13,
                            fontFamily: "'JetBrains Mono',monospace",
                            fontWeight: 600,
                            color: leg.legCost >= 0 ? T.green : T.red,
                          }}>
                            {fmtPnl(leg.legCost)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Net Summary */}
            <div style={{
              background: T.card,
              border: `1px solid ${T.gold}`,
              borderRadius: 3,
              padding: "24px 32px",
            }}>
              <SectionHeader>Net Position Summary</SectionHeader>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 24 }}>
                {[
                  { label: "Net Premium", value: fmtPnl(results.netPremium), color: results.netPremium >= 0 ? T.green : T.red, hint: results.netPremium >= 0 ? "Net Credit" : "Net Debit" },
                  { label: "Net Delta",   value: fmtGreek(results.netDelta),  color: T.text },
                  { label: "Net Gamma",   value: fmtGreek(results.netGamma),  color: T.text },
                  { label: "Net Vega",    value: fmtGreek(results.netVega),   color: T.text },
                  { label: "Net Theta",   value: fmtGreek(results.netTheta),  color: results.netTheta >= 0 ? T.green : T.red, hint: results.netTheta >= 0 ? "Time earner" : "Time buyer" },
                ].map(({ label, value, color, hint }) => (
                  <div key={label}>
                    <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 10, letterSpacing: 2, color: T.muted, textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
                      {label}
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 700, color, letterSpacing: -0.5 }}>
                      {value}
                    </div>
                    {hint && (
                      <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, color: T.muted, marginTop: 4 }}>
                        {hint}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Scenario Analysis */}
            {results.scenarios && results.scenarios.length > 0 && (
              <Card style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${T.border}` }}>
                  <SectionHeader>Scenario Analysis — P&amp;L at Expiry</SectionHeader>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#111111" }}>
                        {["Scenario", `${underlyingLabel} at…`, "Net P&L", "Notes"].map((h, i) => (
                          <th key={i} style={{
                            padding: "10px 20px",
                            textAlign: "left",
                            fontFamily: "'Montserrat',sans-serif",
                            fontSize: 10,
                            letterSpacing: 1.5,
                            color: T.muted,
                            textTransform: "uppercase",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            borderBottom: `1px solid ${T.border}`,
                          }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.scenarios.map((row, idx) => {
                        const isEven = idx % 2 === 0;
                        const isProfit = row.pnl > 0;
                        const isLoss   = row.pnl < 0;
                        return (
                          <tr key={idx} style={{ background: isEven ? T.card : "#181818" }}>
                            <td style={{ padding: "13px 20px", color: T.muted, fontSize: 13, fontFamily: "'Montserrat',sans-serif", fontWeight: 600, letterSpacing: 0.5 }}>
                              {row.scenario}
                            </td>
                            <td style={{ padding: "13px 20px", color: T.text, fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>
                              ${fmt(Math.round(row.price))}
                            </td>
                            <td style={{
                              padding: "13px 20px",
                              fontSize: 14,
                              fontFamily: "'JetBrains Mono',monospace",
                              fontWeight: 700,
                              color: isProfit ? T.green : isLoss ? T.red : T.muted,
                            }}>
                              {fmtPnl(row.pnl)}
                            </td>
                            <td style={{ padding: "13px 20px", color: T.muted, fontSize: 12 }}>
                              {row.notes}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: "12px 24px", borderTop: `1px solid ${T.border}` }}>
                  <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, color: T.dim }}>
                    P&L calculated at expiry using intrinsic value only. Net premium {results.netPremium >= 0 ? "received" : "paid"} of {fmtPrice(Math.abs(results.netPremium))} per unit included.
                  </div>
                </div>
              </Card>
            )}
          </>
        )}

        {/* Footer */}
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, color: T.dim }}>
            Black-Scholes model for European-style options. For indicative pricing only.
          </div>
          <div style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 10, letterSpacing: 2, color: T.dim, textTransform: "uppercase" }}>
            SDM Options Pricer v1.0
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── LegRow ───────────────────────────────────────────────────────────────────
function LegRow({ leg, idx, syncSpot, globalSpot, onChange, onRemove, canRemove }) {
  const isEven = idx % 2 === 0;
  const sideColor = leg.side === "buy" ? T.green : T.red;

  const cell = (content, opts = {}) => (
    <td style={{
      padding: "8px 10px",
      verticalAlign: "middle",
      ...opts,
    }}>
      {content}
    </td>
  );

  const numVal = (v) => (v === 0 ? "" : String(v));

  return (
    <tr style={{ background: isEven ? T.card : "#181818", borderBottom: `1px solid ${T.border}` }}>
      {/* Leg # */}
      {cell(
        <div style={{ textAlign: "center", fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13, color: T.gold }}>
          {leg.legNum}
        </div>
      )}

      {/* Type */}
      {cell(
        <DarkSelect
          value={leg.type}
          onChange={v => onChange(leg.id, "type", v)}
          options={[{ value: "call", label: "Call" }, { value: "put", label: "Put" }]}
          style={{ width: 90 }}
        />
      )}

      {/* Side */}
      {cell(
        <DarkSelect
          value={leg.side}
          onChange={v => onChange(leg.id, "side", v)}
          options={[{ value: "buy", label: "Buy" }, { value: "sell", label: "Sell" }]}
          style={{ width: 90, color: sideColor }}
        />
      )}

      {/* Spot */}
      {cell(
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <DarkInput
            value={syncSpot && leg.spotLinked ? globalSpot.toLocaleString("en-US") : numVal(leg.spot)}
            onChange={v => {
              const n = parseFloat(v.replace(/,/g, ""));
              if (!isNaN(n)) onChange(leg.id, "spot", n);
            }}
            placeholder="95000"
            style={{ width: 110, opacity: syncSpot && leg.spotLinked ? 0.5 : 1 }}
          />
          {!syncSpot && (
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: T.muted, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={leg.spotLinked}
                onChange={e => onChange(leg.id, "spotLinked", e.target.checked)}
                style={{ accentColor: T.gold, width: 12, height: 12 }}
              />
              Sync
            </label>
          )}
        </div>
      )}

      {/* Strike */}
      {cell(
        <DarkInput
          value={numVal(leg.strike)}
          onChange={v => {
            const n = parseFloat(v.replace(/,/g, ""));
            if (!isNaN(n)) onChange(leg.id, "strike", n);
          }}
          placeholder="100000"
          style={{ width: 110 }}
        />
      )}

      {/* Tenor */}
      {cell(
        <DarkInput
          value={numVal(leg.tenor)}
          onChange={v => {
            const n = parseFloat(v);
            if (!isNaN(n)) onChange(leg.id, "tenor", Math.max(0, n));
          }}
          placeholder="30"
          style={{ width: 80 }}
        />
      )}

      {/* IV */}
      {cell(
        <DarkInput
          value={numVal(leg.iv)}
          onChange={v => {
            const n = parseFloat(v);
            if (!isNaN(n)) onChange(leg.id, "iv", n);
          }}
          placeholder="75"
          style={{ width: 80 }}
        />
      )}

      {/* Rate */}
      {cell(
        <DarkInput
          value={numVal(leg.rate)}
          onChange={v => {
            const n = parseFloat(v);
            if (!isNaN(n)) onChange(leg.id, "rate", n);
          }}
          placeholder="0"
          style={{ width: 70 }}
        />
      )}

      {/* Qty */}
      {cell(
        <DarkInput
          value={numVal(leg.qty)}
          onChange={v => {
            const n = parseFloat(v);
            if (!isNaN(n)) onChange(leg.id, "qty", n);
          }}
          placeholder="1"
          style={{ width: 70 }}
        />
      )}

      {/* Remove */}
      {cell(
        canRemove ? (
          <button
            onClick={() => onRemove(leg.id)}
            title="Remove leg"
            style={{
              background: "transparent",
              border: "none",
              color: T.dim,
              cursor: "pointer",
              fontSize: 16,
              padding: "4px 8px",
              lineHeight: 1,
              borderRadius: 2,
              transition: "color 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.color = T.red}
            onMouseLeave={e => e.currentTarget.style.color = T.dim}
          >
            ✕
          </button>
        ) : <span />
      )}
    </tr>
  );
}
