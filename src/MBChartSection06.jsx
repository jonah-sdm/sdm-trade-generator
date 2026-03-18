// Section 06 — BTC Technical Analysis (Daily + 4H candlesticks)
// Uses lightweight-charts loaded from CDN
import { useEffect, useRef, useState } from "react";

const CHART_THEME = {
  layout: { background: { color: "#fafbfc" }, textColor: "#555e6b", fontSize: 10 },
  grid: { vertLines: { color: "#f0f3f5" }, horzLines: { color: "#f0f3f5" } },
  crosshair: { vertLine: { color: "#aab0b8", labelBackgroundColor: "#000" }, horzLine: { color: "#aab0b8", labelBackgroundColor: "#000" } },
  timeScale: { borderColor: "#dde1e6", timeVisible: true },
  rightPriceScale: { borderColor: "#dde1e6" },
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
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 1400 * (i + 1)));
        continue;
      }
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

function ChartPanel({ title, candles, showLevels }) {
  const chartRef = useRef(null);
  const rsiRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!candles?.length || !window.LightweightCharts) return;

    const LWC = window.LightweightCharts;

    // Main chart
    const chart = LWC.createChart(chartRef.current, {
      ...CHART_THEME,
      width: chartRef.current.clientWidth,
      height: 260,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#16a34a", downColor: "#dc2626",
      borderUpColor: "#16a34a", borderDownColor: "#dc2626",
      wickUpColor: "#16a34a", wickDownColor: "#dc2626",
    });
    candleSeries.setData(candles);

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
        candleSeries.createPriceLine({
          price: l.price,
          color: l.color,
          lineWidth: 1,
          lineStyle: 2, // dashed
          axisLabelVisible: true,
        });
      });
    }

    chart.timeScale().fitContent();

    // RSI chart
    const rsiChart = LWC.createChart(rsiRef.current, {
      ...CHART_THEME,
      width: rsiRef.current.clientWidth,
      height: 72,
      rightPriceScale: { borderColor: "#dde1e6", scaleMargins: { top: 0.1, bottom: 0.1 } },
    });

    const rsiSeries = rsiChart.addLineSeries({
      color: "#1a3a5c", lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false,
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
    });
    rsiSeries.setData(calcRSI(candles));

    // RSI reference lines
    [{ val: 30, color: "#dc2626", title: "OS" }, { val: 50, color: "#aaa", title: "" }, { val: 70, color: "#dc2626", title: "OB" }].forEach(l => {
      rsiSeries.createPriceLine({ price: l.val, color: l.color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: l.title });
    });

    rsiChart.timeScale().fitContent();

    // Sync scrolling
    chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) rsiChart.timeScale().setVisibleLogicalRange(range);
    });
    rsiChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) chart.timeScale().setVisibleLogicalRange(range);
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
      chart.remove();
      rsiChart.remove();
    };
  }, [candles, showLevels]);

  const last = candles?.[candles.length - 1];
  const prev = candles?.[candles.length - 2];
  const pct = last && prev ? ((last.close - prev.close) / prev.close * 100).toFixed(2) : null;

  return (
    <div ref={containerRef} style={{ background: "#fafbfc", border: "1px solid #e4e8ed", borderRadius: 4, padding: 12, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 11, fontWeight: 700, color: "#333", textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</span>
        {last && (
          <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 12, fontWeight: 700 }}>
            ${last.close.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            {pct && <span style={{ marginLeft: 6, color: parseFloat(pct) >= 0 ? "#16a34a" : "#dc2626", fontSize: 11 }}>{parseFloat(pct) >= 0 ? "+" : ""}{pct}%</span>}
          </span>
        )}
      </div>
      <div ref={chartRef} />
      <div style={{ fontFamily: "'Courier New',monospace", fontSize: 9, color: "#888", margin: "4px 0 2px", textAlign: "center" }}>RSI (14)</div>
      <div ref={rsiRef} />
    </div>
  );
}

export default function MBChartSection06() {
  const [daily, setDaily] = useState(null);
  const [fourH, setFourH] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lwcLoaded, setLwcLoaded] = useState(!!window.LightweightCharts);

  // Load lightweight-charts from CDN
  useEffect(() => {
    if (window.LightweightCharts) { setLwcLoaded(true); return; }
    const s = document.createElement("script");
    s.src = "https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js";
    s.onload = () => setLwcLoaded(true);
    s.onerror = () => setError("Failed to load chart library");
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    if (!lwcLoaded) return;
    setLoading(true);
    // Try CoinGecko first, fall back to Kraken OHLC (real data)
    const fetchDaily = cgFetch("https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=90")
      .then(d => toCandles(d))
      .catch(() =>
        fetch(`https://api.kraken.com/0/public/OHLC?pair=XXBTZUSD&interval=1440&since=${Math.floor(Date.now()/1000) - 90*86400}`)
          .then(r => r.json())
          .then(json => {
            const key = Object.keys(json.result).find(k => k !== "last");
            return (json.result[key] || []).map(([ts,o,h,l,c]) => ({ time: Number(ts), open: +o, high: +h, low: +l, close: +c }));
          })
      );
    const fetch4H = cgFetch("https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=30")
      .then(d => toCandles(d))
      .catch(() =>
        fetch(`https://api.kraken.com/0/public/OHLC?pair=XXBTZUSD&interval=240&since=${Math.floor(Date.now()/1000) - 30*86400}`)
          .then(r => r.json())
          .then(json => {
            const key = Object.keys(json.result).find(k => k !== "last");
            return (json.result[key] || []).map(([ts,o,h,l,c]) => ({ time: Number(ts), open: +o, high: +h, low: +l, close: +c }));
          })
      );
    Promise.all([fetchDaily, fetch4H]).then(([d90, d30]) => {
      if (!d90?.length && !d30?.length) { setError("Unable to load chart data — CoinGecko and Kraken both unavailable"); setLoading(false); return; }
      setDaily(d90?.length ? d90 : null);
      setFourH(d30?.length ? d30 : null);
      setLoading(false);
    }).catch(e => { setError(e.message); setLoading(false); });
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
            <span key={e.label} style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "'Poppins',sans-serif", fontSize: 10, color: "#555" }}>
              <span style={{ width: 16, height: 2, background: e.color, display: "inline-block" }} />
              {e.label}
            </span>
          ))}
        </div>
      </div>

      {loading && <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#888", padding: 20, textAlign: "center" }}>Loading BTC charts from CoinGecko...</div>}
      {error && <div style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#dc2626", padding: 20 }}>Chart error: {error}</div>}

      {!loading && !error && daily && fourH && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <ChartPanel title="BTC Daily — 90 Days" candles={daily} showLevels={true} />
          <ChartPanel title="BTC 4H — 30 Days" candles={fourH} showLevels={false} />
        </div>
      )}

      <div style={{ fontFamily: "'Courier New',monospace", fontSize: 9, color: "#888", marginTop: 12 }}>
        Source: CoinGecko OHLC API · EMA &amp; RSI computed client-side · Key levels are indicative only
      </div>
    </>
  );
}
