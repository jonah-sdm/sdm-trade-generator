// Canva integration — uses Vercel serverless API routes in production,
// falls back to localhost:3002 for local dev when running server.js
const isDev = process.env.NODE_ENV === "development" && window.location.port === "3001";
const API_BASE = isDev ? "http://localhost:3002" : "";

export async function checkCanvaStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/canva/status`);
    const data = await res.json();
    return data.connected;
  } catch {
    return false;
  }
}

export function startCanvaAuth() {
  const w = 600, h = 700;
  const left = (window.innerWidth - w) / 2 + window.screenX;
  const top  = (window.innerHeight - h) / 2 + window.screenY;
  window.open(
    `${API_BASE}/api/canva-auth`,
    "canva-auth",
    `width=${w},height=${h},left=${left},top=${top}`
  );
}

async function canvaProxy(path, options = {}) {
  const url = `${API_BASE}/api/canva-proxy?path=${encodeURIComponent(path)}`;
  const res  = await fetch(url, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Canva API ${res.status}`);
  }
  return res.json();
}

export async function listBrandTemplates() {
  return canvaProxy("/brand-templates");
}

export async function listDesigns() {
  return canvaProxy("/designs?ownership=owned&sort_by=modified_descending");
}

export async function exportToCanva(templateId, tradeData) {
  return canvaProxy("/export", { method: "POST", body: { templateId, tradeData } });
}

// Build the replacement map for template autofill
export function buildReplacements(tradeId, fields, metrics) {
  const replacements = {
    trade_type:   getTradeTitle(tradeId),
    date:         new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    generated_by: "SDM Trade Idea Studio",
  };

  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== "") replacements[key] = String(value);
  });

  if (metrics) {
    metrics.forEach(m => {
      const key = m.label.toLowerCase().replace(/[^a-z0-9]/g, "_");
      replacements[key] = m.value;
    });
  }

  return replacements;
}

function getTradeTitle(tradeId) {
  const titles = {
    long_seagull:       "Long Seagull Upside Structure",
    reverse_cash_carry: "Reverse Cash & Carry Basis Trade",
    covered_call:       "Covered Call Income Strategy",
    cash_secured_put:   "Cash-Secured Put Strategy",
    leap:               "Long-Dated Option — Leveraged Directional Exposure",
    wheel:              "The Wheel — Systematic Premium Collection",
    collar:             "Protective Collar Strategy",
    earnings_play:      "Event Risk Analysis",
  };
  return titles[tradeId] || tradeId;
}
