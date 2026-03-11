// Serverless function — proxies AI brief to Claude and returns trade analysis
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

  const { asset, currentPrice, portfolioValue, objective, riskTolerance, prompt: userPrompt } = req.body;
  if (!userPrompt) return res.status(400).json({ error: "Missing prompt" });

  const systemPrompt = `You are a senior derivatives advisor at Secure Digital Markets (SDM), an institutional digital asset trading firm. When given a client brief, provide a concise, professional trade analysis: what the client needs, which strategy fits best, key parameters to consider, and why it matches their profile. Be specific with numbers when provided. Write like a senior institutional advisor — direct, confident, no filler. 2-3 short paragraphs maximum.`;

  const lines = [
    `Asset: ${asset || "BTC"}`,
    currentPrice ? `Current price: $${currentPrice}` : null,
    portfolioValue ? `Portfolio value: $${portfolioValue}` : null,
    objective && objective !== "Not Sure — Detect from Notes" ? `Objective: ${objective}` : null,
    `Risk tolerance: ${riskTolerance || "Moderate"}`,
    `\nClient notes:\n${userPrompt}`,
  ].filter(Boolean).join("\n");

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        system: systemPrompt,
        messages: [{ role: "user", content: lines }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Claude API error:", response.status, err);
      return res.status(500).json({ error: "Claude API error", detail: err });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    return res.status(200).json({ response: text });
  } catch (err) {
    console.error("ask-ai error:", err);
    return res.status(500).json({ error: "Request failed", detail: String(err) });
  }
};
