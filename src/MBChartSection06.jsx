// Section 06 — BTC Technical Analysis (Daily + 4H candlesticks)
// Uses lightweight-charts loaded from CDN
import { useEffect, useRef, useState } from "react";

const CHART_THEME = {
  layout: { background: { color: "#F9F9F9" }, textColor: "#4A4A48", fontSize: 10 },
  grid: { vertLines: { color: "#E8E7E2" }, horzLines: { color: "#E8E7E2" } },
  crosshair: {
    vertLine: { color: "#8A8A88", labelBackgroundColor: "#1A1A18" },
    horzLine: { color: "#8A8A88", labelBackgroundColor: "#1A1A18" },
  },
  timeScale: { borderColor: "#E8E7E2", timeVisible: true },
  rightPriceScale: { borderColor: "#E8E7E2" },
};

const SR_LEVELS = [
  { price: 84250, color: "#16a34a" },
  { price: 79500, color: "#16a34a" },
  { price: 65500, color: "#dc2626" },
  { price: 63000, color: "#dc2626" },
  { price: 60250, color: "#dc2626" },
];

async function cgFetch(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) { await new Promise(r => setTimeout(r, 1400 * (i + 1))); continue; }
      if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
      return res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error("CoinGecko rate limited after retries");
}

const toCandles = raw => raw.map(([ts, o, h, l, c]) => ({
  time: Math.floor(ts / 1000), open: o, high: h, low: l, close: c,
}));

function calcEMA(candles, period) {
  const k = 2 / (period + 1);
  let ema = null;
  const out = [];
  for (const c of candles) {
    ema = ema === null ? c.close : c.close * k + ema * (1 - k);
    out.push({ time: c.time, value: ema });
  }
  return out.slice(Math.max(0, period - 1));
}

function calcRSI(candles, period = 14) {
  const gains = [], losses = [];
  for (let i = 1; i < candles.length; i++) {
    const d = candles[i].close - candles[i - 1].close;
    gains.push(d > 0 ? d : 0);
    losses.push(d < 0 ? -d : 0);
  }
  if (gains.length < period) return [];
  let ag = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let al = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const rsi = [];
  for (let i = period; i < gains.length; i++) {
    const rs = al === 0 ? 100 : ag / al;
    rsi.push({ time: candles[i + 1].time, value: 100 - 100 / (1 + rs) });
    ag = (ag * (period - 1) + gains[i]) / period;
    al = (al * (period - 1) + losses[i]) / period;
  }
  return rsi;
}

// ── Drawing tools ─────────────────────────────────────────────────────────
const DRAW_TOOLS = [
  { key: "cursor",    icon: "↖",  label: "Select",  title: "Pan / select mode (scroll to zoom)" },
  { key: "hline",     icon: "—",  label: "H-Line",  title: "Click chart to draw a horizontal support/resistance line" },
  { key: "trendline", icon: "⟋",  label: "Trend",   title: "Click two points to draw a trend line" },
  { key: "ray",       icon: "→",  label: "Ray",     title: "Click two points to draw a ray (extends right)" },
];

// Drawing line colour palette (cycles through these)
const DRAW_COLOURS = ["#FFC32C", "#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#f97316"];

// ── ChartPanel ────────────────────────────────────────────────────────────
function ChartPanel({ title, candles, showLevels, defaultDays, maxDays }) {
  // DOM refs
  const chartDomRef  = useRef(null);
  const rsiDomRef    = useRef(null);
  const containerRef = useRef(null);

  // LWC instance refs (accessed by React handlers without causing re-renders)
  const chartRef       = useRef(null);
  const candleSeriesRef = useRef(null);
  const timeScaleRef   = useRef(null);

  // Drawing state refs (avoid stale closures in LWC callbacks)
  const drawModeRef  = useRef("cursor");
  const pendingRef   = useRef(null);           // first click of in-progress line
  const drawingsRef  = useRef([]);             // {type, priceLine?, series?}
  const colourIdxRef = useRef(0);

  // React UI state (toolbar rendering only)
  const [drawMode,   setDrawMode]   = useState("cursor");
  const [hasPending, setHasPending] = useState(false);
  const [drawCount,  setDrawCount]  = useState(0); // bump to show clear button
  const [visibleDays, setVisibleDays] = useState(defaultDays);

  // ── helpers ──────────────────────────────────────────────────────────────

  const nextColour = () => {
    const c = DRAW_COLOURS[colourIdxRef.current % DRAW_COLOURS.length];
    colourIdxRef.current += 1;
    return c;
  };

  const setMode = (mode) => {
    drawModeRef.current = mode;
    setDrawMode(mode);
    if (mode !== "trendline" && mode !== "ray") {
      pendingRef.current = null;
      setHasPending(false);
    }
    // Toggle chart pan/zoom based on mode:
    //  - cursor mode: pan & scale ON (mouse drag pans the chart, wheel zooms)
    //  - any draw mode: pan & scale OFF (so click events aren't eaten by drag-to-pan)
    const chart = chartRef.current;
    if (chart) {
      const interactive = mode === "cursor";
      chart.applyOptions({
        handleScroll: interactive,
        handleScale:  interactive,
      });
    }
  };

  const clearAll = () => {
    const chart = chartRef.current;
    const cs    = candleSeriesRef.current;
    if (!chart || !cs) return;
    drawingsRef.current.forEach(d => {
      try {
        if (d.priceLine) cs.removePriceLine(d.priceLine);
        if (d.series)    chart.removeSeries(d.series);
      } catch (_) {}
    });
    drawingsRef.current = [];
    colourIdxRef.current = 0;
    pendingRef.current = null;
    setHasPending(false);
    setDrawCount(0);
  };

  const zoomTo = (days) => {
    const ts = timeScaleRef.current;
    if (!ts) return;
    if (days === 0) { ts.fitContent(); return; }
    const now = Math.floor(Date.now() / 1000);
    ts.setVisibleRange({ from: now - days * 86400, to: now + 7200 });
  };

  // ── Chart lifecycle ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!candles?.length || !window.LightweightCharts) return;
    const LWC = window.LightweightCharts;

    // ── Main chart (scroll + scale ENABLED)
    const chart = LWC.createChart(chartDomRef.current, {
      ...CHART_THEME,
      width:        chartDomRef.current.clientWidth,
      height:       280,
      handleScroll: true,
      handleScale:  true,
      crosshair:    { mode: 1 },
    });
    chartRef.current       = chart;
    timeScaleRef.current   = chart.timeScale();

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#16a34a", downColor: "#dc2626",
      borderUpColor: "#16a34a", borderDownColor: "#dc2626",
      wickUpColor: "#16a34a", wickDownColor: "#dc2626",
    });
    candleSeries.setData(candles);
    candleSeriesRef.current = candleSeries;

    // EMAs
    const ema20 = chart.addLineSeries({ color: "#2563eb", lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false });
    ema20.setData(calcEMA(candles, 20));
    const ema50 = chart.addLineSeries({ color: "#d97706", lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false });
    ema50.setData(calcEMA(candles, 50));
    if (showLevels) {
      const ema200 = chart.addLineSeries({ color: "#7c3aed", lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false });
      ema200.setData(calcEMA(candles, 200));
    }

    // S/R levels (daily only)
    if (showLevels) {
      SR_LEVELS.forEach(l => {
        candleSeries.createPriceLine({ price: l.price, color: l.color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true });
      });
    }

    // Apply initial time range from slider state
    const initDays = defaultDays;
    if (initDays > 0) {
      const now = Math.floor(Date.now() / 1000);
      chart.timeScale().setVisibleRange({ from: now - initDays * 86400, to: now + 7200 });
    } else {
      chart.timeScale().fitContent();
    }

    // ── RSI chart
    const rsiChart = LWC.createChart(rsiDomRef.current, {
      ...CHART_THEME,
      width:  rsiDomRef.current.clientWidth,
      height: 72,
      rightPriceScale: { borderColor: "#dde1e6", scaleMargins: { top: 0.1, bottom: 0.1 } },
      handleScroll: true,
      handleScale:  false,
      crosshair: { mode: 1 },
    });
    const rsiSeries = rsiChart.addLineSeries({
      color: "#1a3a5c", lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false,
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
    });
    rsiSeries.setData(calcRSI(candles));
    [{ val: 30, color: "#dc2626", title: "OS" }, { val: 50, color: "#aaa", title: "" }, { val: 70, color: "#dc2626", title: "OB" }].forEach(l => {
      rsiSeries.createPriceLine({ price: l.val, color: l.color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: l.title });
    });
    rsiChart.timeScale().fitContent();

    // Sync scroll between main + RSI
    chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) rsiChart.timeScale().setVisibleLogicalRange(range);
    });
    rsiChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) chart.timeScale().setVisibleLogicalRange(range);
    });

    // ── Drawing tool click handler ──────────────────────────────────────────
    chart.subscribeClick((param) => {
      const mode = drawModeRef.current;
      if (mode === "cursor" || !param.point || !param.time) return;

      const cs    = candleSeriesRef.current;
      const price = cs?.coordinateToPrice(param.point.y);
      if (price == null) return;

      const time  = typeof param.time === "number" ? param.time : Number(param.time);
      const colour = nextColour();

      if (mode === "hline") {
        const pl = cs.createPriceLine({
          price, color: colour, lineWidth: 1.5, lineStyle: 2, axisLabelVisible: true,
        });
        drawingsRef.current.push({ type: "hline", priceLine: pl });
        setDrawCount(n => n + 1);

      } else if (mode === "trendline" || mode === "ray") {
        const pending = pendingRef.current;
        if (!pending) {
          pendingRef.current = { time, price, colour };
          setHasPending(true);
        } else {
          // Build data points — sort chronologically
          const pts = [
            { time: pending.time, value: pending.price },
            { time,               value: price },
          ].sort((a, b) => a.time - b.time);

          if (pts[0].time !== pts[1].time) {
            // For a ray: extend end point far into future (+ 10 years)
            const farFuture = pts[1].time + 365 * 86400 * 10;
            const slope = (pts[1].value - pts[0].value) / (pts[1].time - pts[0].time);

            const data = mode === "ray"
              ? [pts[0], { time: farFuture, value: pts[0].value + slope * (farFuture - pts[0].time) }]
              : pts;

            const tl = chart.addLineSeries({
              color: pending.colour, lineWidth: 1.5, lineStyle: 0,
              priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
            });
            tl.setData(data);
            drawingsRef.current.push({ type: mode, series: tl });
            setDrawCount(n => n + 1);
          }
          pendingRef.current = null;
          setHasPending(false);
          // cycle colour for next line
          colourIdxRef.current += 1;
        }
      }
    });

    // Responsive resize
    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        chart.applyOptions({ width: w });
        rsiChart.applyOptions({ width: w });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      drawingsRef.current  = [];
      pendingRef.current   = null;
      chartRef.current     = null;
      candleSeriesRef.current = null;
      timeScaleRef.current = null;
      colourIdxRef.current = 0;
      chart.remove();
      rsiChart.remove();
    };
  }, [candles, showLevels]); // eslint-disable-line

  const last = candles?.[candles.length - 1];
  const prev = candles?.[candles.length - 2];
  const pct  = last && prev ? ((last.close - prev.close) / prev.close * 100).toFixed(2) : null;

  // Toolbar button styles
  const pillActive = { padding: "3px 9px", borderRadius: 20, cursor: "pointer", fontFamily: "'Montserrat',sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", border: "none", background: "#1A1A18", color: "#fff", transition: "all 0.12s" };
  const pillInactive = { ...pillActive, border: "0.5px solid #E8E7E2", background: "transparent", color: "#8A8A88" };
  const zoomBtn = { padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontFamily: "'Montserrat',sans-serif", fontSize: 8, fontWeight: 700, border: "0.5px solid #E8E7E2", background: "transparent", color: "#8A8A88", transition: "all 0.12s" }; // used by clear button

  return (
    <div ref={containerRef} style={{ background: "#F9F9F9", border: "0.5px solid #E8E7E2", borderRadius: 14, padding: 12, minWidth: 0 }}>

      {/* Row 1: title + last price */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 11, fontWeight: 700, color: "#1A1A18", textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</span>
        {last && (
          <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 12, fontWeight: 700 }}>
            ${last.close.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            {pct && <span style={{ marginLeft: 6, color: parseFloat(pct) >= 0 ? "#16a34a" : "#dc2626", fontSize: 11 }}>{parseFloat(pct) >= 0 ? "+" : ""}{pct}%</span>}
          </span>
        )}
      </div>

      {/* Row 2: zoom presets (left) + draw tools (right) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
        {/* Zoom range slider */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8A8A88", whiteSpace: "nowrap" }}>
            Range {visibleDays}D
          </span>
          <input
            type="range"
            min={1}
            max={maxDays}
            step={1}
            value={visibleDays}
            onChange={e => {
              const d = Number(e.target.value);
              setVisibleDays(d);
              zoomTo(d);
            }}
            style={{ width: 100, accentColor: "#FFC32C", cursor: "pointer" }}
          />
        </div>

        {/* Draw tools */}
        <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
          <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", color: "#8A8A88", marginRight: 2, textTransform: "uppercase" }}>Draw</span>
          {DRAW_TOOLS.map(t => (
            <button key={t.key} title={t.title} style={drawMode === t.key ? pillActive : pillInactive} onClick={() => setMode(t.key)}>
              {t.icon} {t.label}
            </button>
          ))}
          {drawCount > 0 && (
            <button style={{ ...zoomBtn, marginLeft: 4, color: "#dc2626", borderColor: "#fca5a5" }} onClick={clearAll} title="Clear all drawings">
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      {/* Pending trendline / ray hint */}
      {hasPending && (
        <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 9, color: "#FFC32C", marginBottom: 6 }}>
          {drawMode === "ray" ? "→" : "⟋"} Click a second point to complete — or press <strong>Select</strong> to cancel
        </div>
      )}

      {/* Chart area — crosshair cursor in draw mode */}
      <div style={{ cursor: drawMode === "cursor" ? "default" : "crosshair" }}>
        <div ref={chartDomRef} />
        <div style={{ fontFamily: "'Courier New',monospace", fontSize: 9, color: "#8A8A88", margin: "4px 0 2px", textAlign: "center" }}>RSI (14)</div>
        <div ref={rsiDomRef} />
      </div>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────
export default function MBChartSection06() {
  const [daily,     setDaily]     = useState(null);
  const [fourH,     setFourH]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [lwcLoaded, setLwcLoaded] = useState(!!window.LightweightCharts);

  // Load lightweight-charts from CDN
  useEffect(() => {
    if (window.LightweightCharts) { setLwcLoaded(true); return; }
    const s = document.createElement("script");
    s.src = "https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js";
    s.onload  = () => setLwcLoaded(true);
    s.onerror = () => setError("Failed to load chart library");
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    if (!lwcLoaded) return;
    setLoading(true);

    const krakenOHLC = (interval, days) =>
      fetch(`https://api.kraken.com/0/public/OHLC?pair=XXBTZUSD&interval=${interval}&since=${Math.floor(Date.now()/1000) - days*86400}`)
        .then(r => r.json())
        .then(json => {
          const key  = Object.keys(json.result || {}).find(k => k !== "last");
          const rows = json.result?.[key] || [];
          if (!rows.length) throw new Error("Kraken returned empty data");
          return rows.map(([ts,o,h,l,c]) => ({ time: Number(ts), open: +o, high: +h, low: +l, close: +c }));
        });

    const fetchDaily = krakenOHLC(1440, 90).catch(() =>
      cgFetch("https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=90").then(d => toCandles(d)));

    const fetch4H = krakenOHLC(240, 30).catch(() =>
      cgFetch("https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=30").then(d => toCandles(d)));

    Promise.allSettled([fetchDaily, fetch4H]).then(([dailyResult, fourHResult]) => {
      const d90 = dailyResult.status === "fulfilled" && dailyResult.value?.length ? dailyResult.value : null;
      const d30 = fourHResult.status === "fulfilled" && fourHResult.value?.length ? fourHResult.value : null;
      if (!d90 && !d30) { setError("Unable to load chart data — CoinGecko and Kraken both unavailable"); setLoading(false); return; }
      setDaily(d90);
      setFourH(d30);
      setLoading(false);
    });
  }, [lwcLoaded]);


  return (
    <>
      {/* Key levels strip */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {SR_LEVELS.map(l => (
            <span key={l.price} style={{
              fontFamily: "'Montserrat',sans-serif", fontSize: 10, fontWeight: 600,
              padding: "3px 8px", borderRadius: 3,
              background: l.color === "#16a34a" ? "#dcfce7" : "#fef2f2",
              color: l.color, border: `1px solid ${l.color}22`,
            }}>
              ${l.price.toLocaleString()}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {[{ label: "EMA 20", color: "#2563eb" }, { label: "EMA 50", color: "#d97706" }, { label: "EMA 200", color: "#7c3aed" }].map(e => (
            <span key={e.label} style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "'Poppins',sans-serif", fontSize: 10, color: "#4A4A48" }}>
              <span style={{ width: 16, height: 2, background: e.color, display: "inline-block" }} />
              {e.label}
            </span>
          ))}
        </div>
      </div>

      {loading && <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#8A8A88", padding: 20, textAlign: "center" }}>Loading BTC charts from Kraken / CoinGecko…</div>}
      {error   && <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#dc2626", padding: 20 }}>Chart error: {error}</div>}

      {!loading && !error && (daily || fourH) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
          {daily && <ChartPanel title="BTC Daily — 90 Days" candles={daily} showLevels={true}  defaultDays={30} maxDays={90} />}
          {fourH && <ChartPanel title="BTC 4H — 30 Days"   candles={fourH} showLevels={false} defaultDays={7}  maxDays={30} />}
        </div>
      )}

      <div style={{ fontFamily: "'Courier New',monospace", fontSize: 9, color: "#8A8A88", marginTop: 12 }}>
        Source: Kraken Public OHLC API · EMA &amp; RSI computed client-side · Key levels are indicative only
      </div>
    </>
  );
}
