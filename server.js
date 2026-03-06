require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
app.use(cors({ origin: "http://localhost:3001", credentials: true }));
app.use(express.json());

const {
  CANVA_CLIENT_ID,
  CANVA_CLIENT_SECRET,
  CANVA_REDIRECT_URI,
  PORT = 3002,
} = process.env;

const CANVA_API = "https://api.canva.com/rest/v1";
const CANVA_AUTH_URL = "https://www.canva.com/api/oauth/authorize";
const CANVA_TOKEN_URL = "https://www.canva.com/api/oauth/token";

// In-memory token store (single user, local dev)
let tokenStore = {
  access_token: null,
  refresh_token: null,
  expires_at: 0,
};

let codeVerifier = null;

// ─── PKCE helpers ───
function base64url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateCodeVerifier() {
  return base64url(crypto.randomBytes(32));
}

function generateCodeChallenge(verifier) {
  return base64url(crypto.createHash("sha256").update(verifier).digest());
}

// ─── OAuth Routes ───

// Step 1: Start OAuth flow
app.get("/auth/canva", (req, res) => {
  codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CANVA_CLIENT_ID,
    redirect_uri: CANVA_REDIRECT_URI,
    scope: "design:content:read design:content:write design:meta:read asset:read brandtemplate:content:read brandtemplate:meta:read",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state: crypto.randomBytes(16).toString("hex"),
  });

  res.redirect(`${CANVA_AUTH_URL}?${params.toString()}`);
});

// Step 2: OAuth callback
app.get("/auth/canva/callback", async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    return res.send(`<html><body><h2>Authorization failed</h2><p>${error || "No code received"}</p><script>window.close();</script></body></html>`);
  }

  try {
    const tokenRes = await fetch(CANVA_TOKEN_URL, {
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
      console.error("Token exchange failed:", err);
      return res.send(`<html><body><h2>Token exchange failed</h2><pre>${err}</pre><script>setTimeout(()=>window.close(),3000);</script></body></html>`);
    }

    const data = await tokenRes.json();
    tokenStore = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
    };

    console.log("Canva OAuth successful");
    res.send(`<html><body style="background:#080c10;color:#4ADE80;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2>Connected to Canva</h2><p>You can close this window.</p></div></body></html>`);
  } catch (err) {
    console.error("OAuth error:", err);
    res.status(500).send("OAuth error");
  }
});

// ─── Token refresh ───
async function getAccessToken() {
  if (!tokenStore.access_token) return null;

  if (Date.now() > tokenStore.expires_at - 60000 && tokenStore.refresh_token) {
    try {
      const res = await fetch(CANVA_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + Buffer.from(`${CANVA_CLIENT_ID}:${CANVA_CLIENT_SECRET}`).toString("base64"),
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokenStore.refresh_token,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        tokenStore = {
          access_token: data.access_token,
          refresh_token: data.refresh_token || tokenStore.refresh_token,
          expires_at: Date.now() + data.expires_in * 1000,
        };
      }
    } catch (err) {
      console.error("Token refresh failed:", err);
    }
  }

  return tokenStore.access_token;
}

// ─── API helper ───
async function canvaFetch(path, options = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Not authenticated with Canva");

  const res = await fetch(`${CANVA_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Canva API ${res.status}: ${err}`);
  }

  return res.json();
}

// ─── API Routes ───

// Check auth status
app.get("/api/canva/status", (req, res) => {
  res.json({
    connected: !!tokenStore.access_token && Date.now() < tokenStore.expires_at,
  });
});

// List user's designs (to find/verify templates)
app.get("/api/canva/designs", async (req, res) => {
  try {
    const data = await canvaFetch("/designs?ownership=owned&sort_by=modified_descending");
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List brand templates
app.get("/api/canva/brand-templates", async (req, res) => {
  try {
    const data = await canvaFetch("/brand-templates");
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get a specific design's details
app.get("/api/canva/designs/:id", async (req, res) => {
  try {
    const data = await canvaFetch(`/designs/${req.params.id}`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export: Clone template + inject trade data via autofill
app.post("/api/canva/export", async (req, res) => {
  const { templateId, tradeData } = req.body;

  if (!templateId || !tradeData) {
    return res.status(400).json({ error: "templateId and tradeData required" });
  }

  try {
    // Step 1: Create autofill job from brand template
    const autofillRes = await canvaFetch(`/brand-templates/${templateId}/autofill`, {
      method: "POST",
      body: JSON.stringify({
        title: `SDM — ${tradeData.trade_label} — ${new Date().toLocaleDateString()}`,
        data: tradeData.replacements || {},
      }),
    });

    // Step 2: Poll for job completion
    const jobId = autofillRes.job?.id;
    if (!jobId) {
      return res.json({ warning: "No job ID returned", raw: autofillRes });
    }

    let design = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const status = await canvaFetch(`/brand-templates/${templateId}/autofill/${jobId}`);
      if (status.job?.status === "success") {
        design = status.job.result?.design;
        break;
      }
      if (status.job?.status === "failed") {
        throw new Error(`Autofill failed: ${JSON.stringify(status.job.error)}`);
      }
    }

    if (!design) {
      throw new Error("Autofill timed out");
    }

    res.json({
      designId: design.id,
      editUrl: design.urls?.edit_url,
      viewUrl: design.urls?.view_url,
      title: tradeData.trade_label,
    });
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ───
app.listen(PORT, () => {
  console.log(`SDM Trade Studio API running on http://localhost:${PORT}`);
  console.log(`Connect Canva: http://localhost:${PORT}/auth/canva`);
});
