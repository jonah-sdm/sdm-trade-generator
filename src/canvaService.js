// Canva integration via local backend (OAuth flow handled by server.js)
const API_BASE = "http://localhost:3002";

export async function checkCanvaStatus() {
  const res = await fetch(`${API_BASE}/api/canva/status`);
  const data = await res.json();
  return data.connected;
}

export function startCanvaAuth() {
  // Open OAuth flow in popup
  const w = 600, h = 700;
  const left = (window.innerWidth - w) / 2 + window.screenX;
  const top = (window.innerHeight - h) / 2 + window.screenY;
  window.open(
    `${API_BASE}/auth/canva`,
    "canva-auth",
    `width=${w},height=${h},left=${left},top=${top}`
  );
}

export async function listBrandTemplates() {
  const res = await fetch(`${API_BASE}/api/canva/brand-templates`);
  if (!res.ok) throw new Error("Failed to fetch templates");
  return res.json();
}

export async function listDesigns() {
  const res = await fetch(`${API_BASE}/api/canva/designs`);
  if (!res.ok) throw new Error("Failed to fetch designs");
  return res.json();
}

export async function exportToCanva(templateId, tradeData) {
  const res = await fetch(`${API_BASE}/api/canva/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateId, tradeData }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Export failed");
  }
  return res.json();
}

// Build the replacement map for template autofill
// Keys match placeholder names in your Canva template
export function buildReplacements(tradeId, fields, metrics) {
  const replacements = {
    // Common fields
    trade_type: getTradeTitle(tradeId),
    date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    generated_by: "SDM Trade Idea Studio",
  };

  // Add all field values with their keys
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      replacements[key] = String(value);
    }
  });

  // Add computed metrics if provided
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
    long_seagull: "Long Seagull Upside Structure",
    reverse_cash_carry: "Reverse Cash & Carry Basis Trade",
    covered_call: "Covered Call Income Strategy",
    cash_secured_put: "Cash-Secured Put Strategy",
    leap: "Long-Dated Option — Leveraged Directional Exposure",
    wheel: "The Wheel — Systematic Premium Collection",
    collar: "Protective Collar Strategy",
    earnings_play: "Event Risk Analysis",
  };
  return titles[tradeId] || tradeId;
}
