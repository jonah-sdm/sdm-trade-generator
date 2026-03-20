// Vercel serverless — enriches a batch of conference attendees
// Claude: website_url, company_linkedin_url, industry (per unique company)
// Apollo: person_linkedin_url (per person)

const Anthropic = require("@anthropic-ai/sdk");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const APOLLO_API_KEY    = process.env.APOLLO_API_KEY;
const APOLLO_PERSON_URL = "https://api.apollo.io/v1/people/match";

const COMPANY_PROMPT = `You are a research assistant with deep knowledge of crypto, fintech, TradFi, banking, and capital markets.

For the company below, return its website domain, LinkedIn company page URL, and a short industry label.

Company: "{company}"

Return ONLY valid JSON — no other text:
{"website_url": "example.com", "company_linkedin_url": "https://www.linkedin.com/company/example", "industry": "Crypto Exchange"}

Rules:
- website_url: domain only, no https:// (e.g. "coinbase.com", "gsr.io", "jpmorgan.com")
- company_linkedin_url: full URL (e.g. "https://www.linkedin.com/company/coinbase")
- industry: short specific label, e.g. "Crypto Exchange", "DeFi Protocol", "Market Maker", "Investment Bank", "Fintech SaaS", "Blockchain Infrastructure", "Asset Manager", "Payments", "Custody & Prime", "Hedge Fund", "Consulting"
- Context: this is from a crypto/fintech/TradFi conference — skew towards those industries
- If not confident about a field, return ""

Return ONLY the JSON.`;

async function enrichCompanyClaude(client, company) {
  const result = { website_url: "", company_linkedin_url: "", industry: "" };
  if (!company || !company.trim()) return result;
  try {
    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 200,
      temperature: 0,
      messages: [{ role: "user", content: COMPANY_PROMPT.replace("{company}", company) }],
    });
    let text = response.content[0].text.trim();
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const parsed = JSON.parse(text);
    result.website_url          = parsed.website_url          || "";
    result.company_linkedin_url = parsed.company_linkedin_url || "";
    result.industry             = parsed.industry             || "";
  } catch (e) {
    console.error(`Claude failed for company "${company}":`, e.message);
  }
  return result;
}

async function enrichPersonApollo(name, company) {
  const result = { person_linkedin_url: "" };
  if (!name || !name.trim() || !APOLLO_API_KEY) return result;
  const parts = name.trim().split(" ");
  const first = parts[0] || "";
  const last  = parts.slice(1).join(" ") || "";
  try {
    const res = await fetch(APOLLO_PERSON_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": APOLLO_API_KEY },
      body: JSON.stringify({ first_name: first, last_name: last, organization_name: company || undefined, reveal_personal_emails: false }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      result.person_linkedin_url = data?.person?.linkedin_url || "";
    }
  } catch (e) {
    console.error(`Apollo failed for "${name}":`, e.message);
  }
  return result;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { attendees } = req.body;
  if (!Array.isArray(attendees) || attendees.length === 0) {
    return res.status(400).json({ error: "attendees array required" });
  }

  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  // Step 1: Enrich unique companies with Claude (parallel)
  const uniqueCompanies = [...new Set(
    attendees.map(a => (a.company || "").trim()).filter(Boolean)
  )];

  const companyCache = {};
  await Promise.all(
    uniqueCompanies.map(async company => {
      companyCache[company.toLowerCase()] = await enrichCompanyClaude(client, company);
    })
  );

  // Step 2: Enrich people with Apollo (parallel, 5 at a time)
  const CONCURRENCY = 5;
  const personResults = new Array(attendees.length);

  for (let i = 0; i < attendees.length; i += CONCURRENCY) {
    const batch = attendees.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(a => enrichPersonApollo(a.name, a.company))
    );
    results.forEach((r, j) => { personResults[i + j] = r; });
  }

  // Step 3: Merge
  const enriched = attendees.map((a, i) => {
    const companyData = companyCache[(a.company || "").trim().toLowerCase()] || {};
    const personData  = personResults[i] || {};
    return {
      name:                 a.name    || "",
      title:                a.title   || "",
      company:              a.company || "",
      website_url:          companyData.website_url          || "",
      company_linkedin_url: companyData.company_linkedin_url || "",
      person_linkedin_url:  personData.person_linkedin_url   || "",
      industry:             companyData.industry             || "",
    };
  });

  return res.status(200).json({ enriched });
};
