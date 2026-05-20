// Proxies a published report HTML file from the GitHub reports repo.
//
// Why this exists:
//   raw.githubusercontent.com sets `Content-Security-Policy: default-src 'none'; sandbox`
//   which prevents JS execution and iframe embedding. The previous solution piped through
//   htmlpreview.github.io to strip those headers, but that service is unreliable and
//   has gone down repeatedly (HTTP 000 / timeout). This endpoint replaces it by serving
//   the raw HTML directly from our own Vercel domain with clean headers we control.
//
// Usage:
//   /api/report?date=2026-05-13          → reports/SDM-MarketBrief-2026-05-13.html
//   /api/report?path=reports/foo.html    → arbitrary path inside the reports repo
//
// Security: only the configured GH_REPORTS_REPO is allowed (no SSRF to arbitrary repos).
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  const repo = process.env.GH_REPORTS_REPO || 'jonah-sdm/sdm-reports';
  const branch = process.env.GH_REPORTS_BRANCH || 'main';
  const { date, path } = req.query || {};

  // Resolve the file path inside the repo
  let filePath = null;
  if (path && typeof path === 'string') {
    // Only allow paths inside reports/ — block path traversal and ../ escapes
    if (path.includes('..') || !path.startsWith('reports/')) {
      return res.status(400).send('Invalid path');
    }
    filePath = path;
  } else if (date && /^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    filePath = `reports/SDM-MarketBrief-${date}.html`;
  } else {
    return res.status(400).send('Missing or invalid ?date=YYYY-MM-DD or ?path=reports/...');
  }

  const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${filePath}`;

  try {
    const upstream = await fetch(rawUrl);
    if (!upstream.ok) {
      return res.status(upstream.status).send(`Report not found: ${filePath}`);
    }
    const html = await upstream.text();

    // Serve as inline HTML, embeddable in an iframe, cacheable on Vercel's edge.
    // - 5 min fresh on CDN, 1 day stale-while-revalidate so transient GitHub blips don't break embeds
    // - No X-Frame-Options → Webflow iframe embedding works
    // - No CSP sandbox → JS in the report runs normally
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
    return res.status(200).send(html);
  } catch (err) {
    console.error('Report proxy error:', err);
    return res.status(502).send('Upstream fetch failed');
  }
};
