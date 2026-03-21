// Vercel serverless — handles Canva OAuth callback
function parseCookies(req) {
  const raw = req.headers.cookie || "";
  return Object.fromEntries(raw.split(";").map(c => c.trim().split("=").map(decodeURIComponent)));
}

module.exports = async function handler(req, res) {
  const { CANVA_CLIENT_ID, CANVA_CLIENT_SECRET, CANVA_REDIRECT_URI } = process.env;
  const { code, error } = req.query;

  if (error || !code) {
    return res.send(`<html><body><h2>Authorization failed</h2><p>${error || "No code"}</p><script>window.close();</script></body></html>`);
  }

  const cookies     = parseCookies(req);
  const codeVerifier = cookies["canva_cv"];
  if (!codeVerifier) {
    return res.status(400).send("Session expired. Please try connecting to Canva again.");
  }

  try {
    const tokenRes = await fetch("https://www.canva.com/api/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${CANVA_CLIENT_ID}:${CANVA_CLIENT_SECRET}`).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: CANVA_REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return res.send(`<html><body><h2>Token exchange failed</h2><pre>${err}</pre><script>setTimeout(()=>window.close(),3000);</script></body></html>`);
    }

    const data = await tokenRes.json();
    const tokenPayload = JSON.stringify({
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_at:    Date.now() + data.expires_in * 1000,
    });

    // Store tokens in httpOnly cookie (30 days)
    res.setHeader("Set-Cookie", [
      `canva_token=${encodeURIComponent(tokenPayload)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`,
      `canva_cv=; HttpOnly; Path=/; Max-Age=0`,
      `canva_st=; HttpOnly; Path=/; Max-Age=0`,
    ]);

    res.send(`<html><body style="background:#111;color:#ffcc36;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2 style="color:#fff">Connected to Canva</h2><p>You can close this window.</p></div><script>window.close();</script></body></html>`);
  } catch (err) {
    console.error("OAuth error:", err);
    res.status(500).send("OAuth error: " + err.message);
  }
};
