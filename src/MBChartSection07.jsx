// Section 07 — Top Coins 5-Day Normalized Performance
// Pure SVG chart, Kraken public API (no key, no rate limit)
import { useEffect, useState, useCallback, useRef } from "react";

const KRAKEN_COINS = [
  { sym: "BTC",  name: "Bitcoin",        pair: "XBTUSD"  },
  { sym: "ETH",  name: "Ethereum",       pair: "ETHUSD"  },
  { sym: "XRP",  name: "XRP",            pair: "XRPUSD"  },
  { sym: "SOL",  name: "Solana",         pair: "SOLUSD"  },
  { sym: "TRX",  name: "TRON",           pair: "TRXUSD"  },
  { sym: "DOGE", name: "Dogecoin",       pair: "DOGEUSD" },
  { sym: "ADA",  name: "Cardano",        pair: "ADAUSD"  },
  { sym: "AVAX", name: "Avalanche",      pair: "AVAXUSD" },
  { sym: "LINK", name: "Chainlink",      pair: "LINKUSD" },
  { sym: "SHIB", name: "Shiba Inu",      pair: "SHIBUSD" },
  { sym: "TON",  name: "Toncoin",        pair: "TONUSD"  },
  { sym: "SUI",  name: "Sui",            pair: "SUIUSD"  },
  { sym: "XLM",  name: "Stellar",        pair: "XLMUSD"  },
  { sym: "DOT",  name: "Polkadot",       pair: "DOTUSD"  },
  { sym: "LTC",  name: "Litecoin",       pair: "LTCUSD"  },
  { sym: "BCH",  name: "Bitcoin Cash",   pair: "BCHUSD"  },
  { sym: "HBAR", name: "Hedera",         pair: "HBARUSD" },
  { sym: "UNI",  name: "Uniswap",        pair: "UNIUSD"  },
  { sym: "AAVE", name: "Aave",           pair: "AAVEUSD" },
  { sym: "PEPE", name: "Pepe",           pair: "PEPEUSD" },
  { sym: "ICP",  name: "Internet Comp.", pair: "ICPUSD"  },
  { sym: "NEAR", name: "NEAR Protocol",  pair: "NEARUSD" },
  { sym: "APT",  name: "Aptos",          pair: "APTUSD"  },
  { sym: "TAO",  name: "Bittensor",      pair: "TAOUSD"  },
];

const LINE_COLORS = [
  "#1a3a5c","#c41e3a","#2e7d32","#6a1b9a","#e65100",
  "#0277bd","#558b2f","#ad1457","#00695c","#4527a0",
  "#1565c0","#d84315","#37474f","#6d4c41","#00838f",
  "#1b5e20","#880e4f","#bf360c","#263238","#4e342e",
  "#01579b","#827717","#b71c1c","#004d40",
];

function normalize(candles) {
  if (!candles.length) return [];
  const base = parseFloat(candles[0][4]);
  if (!base) return [];
  return candles.map(c => ({ t: c[0], v: ((parseFloat(c[4]) - base) / base) * 100 }));
}

const W = 860, H = 380, PL = 52, PR = 16, PT = 20, PB = 30;
const CW = W - PL - PR, CH = H - PT - PB;

export default function MBChartSection07() {
  const [coinData, setCoinData] = useState(null);
  const [status, setStatus] = useState("idle");
  const [hovered, setHovered] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const svgRef = useRef(null);

  const load = useCallback(async () => {
    setStatus("loading");
    const since = Math.floor(Date.now() / 1000) - 5 * 24 * 3600;

    const results = await Promise.allSettled(
      KRAKEN_COINS.map(c =>
        fetch(`https://api.kraken.com/0/public/OHLC?pair=${c.pair}&interval=60&since=${since}`)
          .then(r => r.json())
          .then(json => {
            const key = Object.keys(json.result).find(k => k !== "last");
            return { sym: c.sym, candles: json.result[key] || [] };
          })
      )
    );

    const data = {};
    let loaded = 0;
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value.candles.length) {
        data[r.value.sym] = normalize(r.value.candles);
        loaded++;
      }
    });

    setCoinData(data);
    setStatus(`Done \u2014 ${loaded}/${KRAKEN_COINS.length} coins loaded`);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Build SVG paths
  const allNorm = coinData ? Object.values(coinData).flat().map(p => p.v) : [];
  const yMin = allNorm.length ? Math.min(...allNorm) : -10;
  const yMax = allNorm.length ? Math.max(...allNorm) : 10;
  const yPad = Math.max((yMax - yMin) * 0.1, 1);
  const yLo = yMin - yPad, yHi = yMax + yPad;

  // Time range
  const allTs = coinData ? Object.values(coinData).flat().map(p => p.t) : [];
  const tMin = allTs.length ? Math.min(...allTs) : 0;
  const tMax = allTs.length ? Math.max(...allTs) : 1;

  const xp = t => PL + ((t - tMin) / (tMax - tMin)) * CW;
  const yp = v => PT + ((yHi - v) / (yHi - yLo)) * CH;

  // Y grid
  const yRange = yHi - yLo;
  let yStep = 1;
  if (yRange > 40) yStep = 10;
  else if (yRange > 20) yStep = 5;
  else if (yRange > 10) yStep = 2;
  const yTicks = [];
  for (let v = Math.ceil(yLo / yStep) * yStep; v <= yHi; v += yStep) yTicks.push(v);

  // X ticks (one per day)
  const xTicks = [];
  if (tMin && tMax) {
    const dayMs = 86400;
    let d = Math.ceil(tMin / dayMs) * dayMs;
    while (d <= tMax) { xTicks.push(d); d += dayMs; }
  }

  // Build path for each coin
  const paths = {};
  if (coinData) {
    KRAKEN_COINS.forEach((c, ci) => {
      const pts = coinData[c.sym];
      if (!pts?.length) return;
      const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${xp(p.t).toFixed(1)},${yp(p.v).toFixed(1)}`).join(" ");
      paths[c.sym] = { d, color: LINE_COLORS[ci], final: pts[pts.length - 1]?.v || 0 };
    });
  }

  // Sort legend by final % descending
  const legendOrder = Object.keys(paths).sort((a, b) => (paths[b]?.final || 0) - (paths[a]?.final || 0));

  const handleMouseMove = (e) => {
    if (!svgRef.current || !coinData) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width * W;
    if (mx < PL || mx > W - PR) { setTooltip(null); return; }
    const t = tMin + ((mx - PL) / CW) * (tMax - tMin);

    // Find closest timestamp and values for top 12 coins
    const entries = [];
    Object.entries(coinData).forEach(([sym, pts]) => {
      if (!pts.length) return;
      let closest = pts[0];
      for (const p of pts) { if (Math.abs(p.t - t) < Math.abs(closest.t - t)) closest = p; }
      const ci = KRAKEN_COINS.findIndex(c => c.sym === sym);
      entries.push({ sym, val: closest.v, color: LINE_COLORS[ci] });
    });
    entries.sort((a, b) => b.val - a.val);
    const date = new Date(t * 1000);
    setTooltip({ x: mx, entries: entries.slice(0, 12), date: date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) });
  };

  return (
    <>
      <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12.5, color: "#1A1A18", lineHeight: 1.7, marginBottom: 16 }}>
        Hourly close prices for 24 major cryptocurrencies, normalized to percentage change from the start of the 5-day window.
        Excludes stablecoins (flat line), BNB (not listed on Kraken), and HYPE/USDS/MNT (not available). Data: Kraken public OHLC API.
      </p>

      <div style={{ background: "#F5F4EF", border: "0.5px solid #E8E7E2", borderRadius: 14, padding: "12px 8px", position: "relative" }}>
        {/* Status bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "0 8px" }}>
          <span style={{ fontFamily: "'Courier New',monospace", fontSize: 10, color: "#8A8A88" }}>
            {status === "loading" ? "Fetching all coins in parallel\u2026" : status}
          </span>
          <button
            onClick={load}
            style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 10, fontWeight: 600, padding: "3px 10px", border: "0.5px solid #E8E7E2", borderRadius: 6, background: "#FDFCF7", cursor: "pointer", color: "#4A4A48" }}
          >
            Refresh
          </button>
        </div>

        {coinData && (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            style={{ display: "block", cursor: "crosshair" }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setTooltip(null)}
          >
            {/* Y grid + labels */}
            {yTicks.map(v => (
              <g key={v}>
                <line x1={PL} y1={yp(v)} x2={W - PR} y2={yp(v)} stroke={v === 0 ? "#8A8A88" : "#E8E7E2"} strokeWidth={v === 0 ? 0.8 : 0.5} strokeDasharray={v === 0 ? "4,3" : "none"} />
                <text x={PL - 4} y={yp(v) + 3.5} fontSize="9.5" fill="#8A8A88" textAnchor="end" fontFamily="'Courier New',monospace">{v >= 0 ? "+" : ""}{v.toFixed(0)}%</text>
              </g>
            ))}

            {/* X ticks */}
            {xTicks.map(t => {
              const d = new Date(t * 1000);
              return (
                <text key={t} x={xp(t)} y={H - PB + 16} fontSize="9" fill="#8A8A88" textAnchor="middle" fontFamily="'Courier New',monospace">
                  {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </text>
              );
            })}

            {/* Coin lines */}
            {KRAKEN_COINS.map((c, ci) => {
              const p = paths[c.sym];
              if (!p) return null;
              const isHov = hovered === c.sym;
              const anyHov = hovered !== null;
              return (
                <path
                  key={c.sym}
                  d={p.d}
                  stroke={p.color}
                  strokeWidth={isHov ? 2.5 : 1.3}
                  fill="none"
                  opacity={anyHov ? (isHov ? 1 : 0.12) : 0.85}
                  style={{ transition: "opacity 0.15s, stroke-width 0.15s" }}
                  onMouseEnter={() => setHovered(c.sym)}
                  onMouseLeave={() => setHovered(null)}
                />
              );
            })}

            {/* Tooltip crosshair */}
            {tooltip && (
              <>
                <line x1={tooltip.x} y1={PT} x2={tooltip.x} y2={H - PB} stroke="#aaa" strokeWidth={0.5} strokeDasharray="3,3" />
                <rect x={Math.min(tooltip.x + 8, W - 140)} y={PT} width={130} height={14 + tooltip.entries.length * 13} rx={3} fill="rgba(0,0,0,0.85)" />
                <text x={Math.min(tooltip.x + 14, W - 134)} y={PT + 11} fontSize="9" fill="#ccc" fontFamily="'Courier New',monospace">{tooltip.date}</text>
                {tooltip.entries.map((e, i) => (
                  <g key={e.sym}>
                    <circle cx={Math.min(tooltip.x + 16, W - 132)} cy={PT + 22 + i * 13} r={3} fill={e.color} />
                    <text x={Math.min(tooltip.x + 23, W - 125)} y={PT + 25 + i * 13} fontSize="9" fill="#eee" fontFamily="'Courier New',monospace">
                      {e.sym} {e.val >= 0 ? "+" : ""}{e.val.toFixed(1)}%
                    </text>
                  </g>
                ))}
              </>
            )}
          </svg>
        )}

        {status === "loading" && (
          <div style={{ padding: 40, textAlign: "center", fontFamily: "'Poppins',sans-serif", fontSize: 12, color: "#8A8A88" }}>
            Loading 24 coins from Kraken...
          </div>
        )}
      </div>

      {/* Legend grid */}
      {coinData && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 4, marginTop: 12 }}>
          {legendOrder.map(sym => {
            const p = paths[sym];
            if (!p) return null;
            const isHov = hovered === sym;
            return (
              <div
                key={sym}
                style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "4px 6px", borderRadius: 3, cursor: "pointer",
                  background: isHov ? "#E8E7E2" : "transparent",
                  transition: "background 0.15s",
                }}
                onMouseEnter={() => setHovered(sym)}
                onMouseLeave={() => setHovered(null)}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 10, fontWeight: 600, color: "#1A1A18" }}>{sym}</span>
                <span style={{ fontFamily: "'Courier New',monospace", fontSize: 10, color: p.final >= 0 ? "#16a34a" : "#dc2626", marginLeft: "auto" }}>
                  {p.final >= 0 ? "+" : ""}{p.final.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontFamily: "'Courier New',monospace", fontSize: 9, color: "#8A8A88", marginTop: 12 }}>
        Source: Kraken Public OHLC API · Hourly candles · 24 coins · Normalized to % from T-5 days
      </div>
    </>
  );
}
