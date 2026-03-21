// Vercel serverless — check if Canva token cookie is present and valid
function parseCookies(req) {
  const raw = req.headers.cookie || "";
  return Object.fromEntries(raw.split(";").map(c => {
    const idx = c.indexOf("=");
    if (idx < 0) return [c.trim(), ""];
    return [c.slice(0, idx).trim(), decodeURIComponent(c.slice(idx + 1).trim())];
  }));
}

module.exports = function handler(req, res) {
  const cookies = parseCookies(req);
  let connected = false;
  try {
    const data = JSON.parse(cookies["canva_token"] || "");
    connected = !!data.access_token && Date.now() < data.expires_at;
  } catch {}
  res.json({ connected });
};
