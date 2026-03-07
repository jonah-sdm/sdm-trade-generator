// Stores report HTML as a file in a GitHub repo → served via GitHub Pages
// Permanent URL that never expires

module.exports = async function handler(req, res) {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.GH_REPORTS_TOKEN;
  const repo = process.env.GH_REPORTS_REPO || 'jonah-sdm/sdm-reports';
  const branch = process.env.GH_REPORTS_BRANCH || 'main';

  if (!token) {
    return res.status(500).json({ error: 'GH_REPORTS_TOKEN not configured' });
  }

  try {
    const { html, filename } = req.body;
    if (!html) {
      return res.status(400).json({ error: 'Missing html' });
    }

    const safeName = (filename || `report-${Date.now()}.html`).replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `reports/${safeName}`;
    const content = Buffer.from(html).toString('base64');

    // Create/update file via GitHub Contents API
    const apiUrl = `https://api.github.com/repos/${repo}/contents/${path}`;

    // Check if file already exists (same filename = same trade on same day)
    let sha;
    try {
      const checkRes = await fetch(apiUrl + `?ref=${branch}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
        },
      });
      if (checkRes.ok) {
        const existing = await checkRes.json();
        sha = existing.sha;
      }
    } catch (e) {
      // File doesn't exist, that's fine
    }

    const body = {
      message: `Add report: ${safeName}`,
      content,
      branch,
    };
    if (sha) body.sha = sha; // Required for updates

    const ghRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json',
      },
      body: JSON.stringify(body),
    });

    if (!ghRes.ok) {
      const err = await ghRes.text();
      console.error('GitHub API error:', ghRes.status, err);
      return res.status(500).json({ error: 'Failed to save to GitHub', detail: err });
    }

    // Build the GitHub Pages URL
    const [org, repoName] = repo.split('/');
    const pagesUrl = `https://${org}.github.io/${repoName}/${path}`;

    return res.status(200).json({ url: pagesUrl });
  } catch (err) {
    console.error('Share error:', err);
    return res.status(500).json({ error: 'Failed to save report', detail: String(err) });
  }
};
