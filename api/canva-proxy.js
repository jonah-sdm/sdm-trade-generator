// Vercel serverless — proxies all Canva REST API calls
// Handles token refresh automatically

const CANVA_API = "https://api.canva.com/rest/v1";

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  return Object.fromEntries(raw.split(";").map(c => {
    const idx = c.indexOf("=");
    if (idx < 0) return [c.trim(), ""];
    return [c.slice(0, idx).trim(), decodeURIComponent(c.slice(idx + 1).trim())];
  }));
}

async function refreshToken(clientId, clientSecret, refreshToken) {
  const res = await fetch("https://www.canva.com/api/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!res.ok) return null;
  return res.json();
}

module.exports = async function handler(req, res) {
  const { CANVA_CLIENT_ID, CANVA_CLIENT_SECRET } = process.env;

  const cookies = parseCookies(req);
  let tokenData = null;
  try { tokenData = JSON.parse(cookies["canva_token"] || ""); } catch {}

  if (!tokenData?.access_token) {
    return res.status(401).json({ error: "Not connected to Canva", connected: false });
  }

  // Refresh if expiring within 60s
  let { access_token, refresh_token, expires_at } = tokenData;
  let newCookie = null;

  if (Date.now() > expires_at - 60000 && refresh_token) {
    const refreshed = await refreshToken(CANVA_CLIENT_ID, CANVA_CLIENT_SECRET, refresh_token);
    if (refreshed) {
      access_token = refreshed.access_token;
      const newPayload = JSON.stringify({
        access_token,
        refresh_token: refreshed.refresh_token || refresh_token,
        expires_at: Date.now() + refreshed.expires_in * 1000,
      });
      newCookie = `canva_token=${encodeURIComponent(newPayload)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`;
    }
  }

  // Get the target path from query param
  const canvaPath = req.query.path || "";
  const method    = req.method;

  try {
    const canvaRes = await fetch(`${CANVA_API}${canvaPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: method !== "GET" && method !== "HEAD" ? JSON.stringify(req.body) : undefined,
    });

    const data = await canvaRes.json().catch(() => ({}));

    if (newCookie) res.setHeader("Set-Cookie", newCookie);
    res.status(canvaRes.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
