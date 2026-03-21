// Vercel serverless — starts Canva OAuth PKCE flow
const crypto = require("crypto");

function base64url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

module.exports = async function handler(req, res) {
  const { CANVA_CLIENT_ID, CANVA_REDIRECT_URI } = process.env;
  if (!CANVA_CLIENT_ID || !CANVA_REDIRECT_URI) {
    return res.status(500).json({ error: "Canva credentials not configured" });
  }

  const codeVerifier  = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(crypto.createHash("sha256").update(codeVerifier).digest());
  const state         = crypto.randomBytes(16).toString("hex");

  // Store code_verifier in a short-lived httpOnly cookie
  res.setHeader("Set-Cookie", [
    `canva_cv=${codeVerifier}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
    `canva_st=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
  ]);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CANVA_CLIENT_ID,
    redirect_uri: CANVA_REDIRECT_URI,
    scope: "design:content:read design:content:write design:meta:read asset:read brandtemplate:content:read brandtemplate:meta:read",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });

  res.redirect(`https://www.canva.com/api/oauth/authorize?${params.toString()}`);
};
