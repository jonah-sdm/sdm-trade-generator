// One-shot repair: surgically rewrite a previously-published Market Brief HTML
// file in the sdm-reports GitHub repo to remove the "AI commentary failed"
// error banner that was baked in when the Anthropic model ID was stale.
//
// The fix to /api/generate (commit a6deb3c) only affects future generations;
// already-published briefs are static HTML files with the error visible.
// This endpoint patches them in place — same filename, same Webflow URL,
// no re-publish needed.
//
// Usage:
//   GET  /api/repair-brief?date=2026-06-22       → dry run, returns the diff
//   POST /api/repair-brief { date, confirm:true } → applies the patch
//   POST /api/repair-brief { all:true, confirm:true } → patches ALL briefs
//        in reports/ that contain the failure banner
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ghToken = process.env.GH_REPORTS_TOKEN;
  const ghRepo  = process.env.GH_REPORTS_REPO   || 'jonah-sdm/sdm-reports';
  const ghBranch = process.env.GH_REPORTS_BRANCH || 'main';
  if (!ghToken) return res.status(500).json({ error: 'GH_REPORTS_TOKEN not configured' });

  const body = req.body || {};
  const dryRun = req.method === 'GET' || !(body.confirm === true);
  const wantAll = body.all === true;
  const date = typeof body.date === 'string' ? body.date : (req.query && req.query.date);

  // ── Strip the error-banner block out of a brief's HTML ──────────────────
  // The banner is rendered by App.jsx ~line 1689: a red rounded box with
  // "AI commentary failed" as the first child. Its background and border
  // colors are unique enough to match safely. We delete the full <div>...</div>.
  const stripBanner = (html) => {
    if (!html || typeof html !== 'string') return { changed: false, html, hits: 0 };
    let out = html;
    let hits = 0;
    // Loop: there should only be one, but defensively handle multiple.
    while (true) {
      // Match: <div ...background:#fee2e2...AI commentary failed...</div>
      // The depth is exactly 1 inner div ("AI commentary failed" header)
      // followed by 1 inner div (the error message), then the wrapper closes.
      const m = out.match(/<div\s+style="[^"]*background:\s*#fee2e2[^"]*">[\s\S]*?AI commentary failed[\s\S]*?<\/div>\s*<\/div>/);
      if (!m) break;
      out = out.slice(0, m.index) + out.slice(m.index + m[0].length);
      hits++;
      if (hits > 5) break; // safety
    }
    return { changed: hits > 0, html: out, hits };
  };

  // GitHub API helpers
  const ghHeaders = {
    'Authorization': `Bearer ${ghToken}`,
    'Accept': 'application/vnd.github+json',
  };

  // Resolve the list of files to operate on
  const resolveTargets = async () => {
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return [`reports/SDM-MarketBrief-${date}.html`];
    }
    if (!wantAll) return [];
    // List everything in reports/
    const listRes = await fetch(
      `https://api.github.com/repos/${ghRepo}/contents/reports?ref=${ghBranch}`,
      { headers: ghHeaders }
    );
    if (!listRes.ok) throw new Error(`GitHub list failed: ${listRes.status}`);
    const items = await listRes.json();
    return items
      .filter(i => i.type === 'file' && /^SDM-MarketBrief-\d{4}-\d{2}-\d{2}\.html$/.test(i.name))
      .map(i => i.path);
  };

  const fetchFile = async (path) => {
    const r = await fetch(`https://api.github.com/repos/${ghRepo}/contents/${path}?ref=${ghBranch}`,
      { headers: ghHeaders });
    if (!r.ok) return null;
    const j = await r.json();
    const html = Buffer.from(j.content, 'base64').toString('utf-8');
    return { sha: j.sha, html, path };
  };

  const putFile = async (path, sha, html, message) => {
    const r = await fetch(`https://api.github.com/repos/${ghRepo}/contents/${path}`, {
      method: 'PUT',
      headers: { ...ghHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        content: Buffer.from(html, 'utf-8').toString('base64'),
        sha,
        branch: ghBranch,
      }),
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`GitHub PUT failed (${r.status}): ${err}`);
    }
    return await r.json();
  };

  try {
    if (!date && !wantAll) {
      return res.status(400).json({
        error: 'Pass ?date=YYYY-MM-DD for a single brief, or POST { all:true, confirm:true } to patch every brief in reports/.',
      });
    }

    const targets = await resolveTargets();
    if (targets.length === 0) {
      return res.status(200).json({ message: 'No matching briefs found.', targets: [] });
    }

    const results = [];
    for (const path of targets) {
      const file = await fetchFile(path);
      if (!file) {
        results.push({ path, status: 'not_found' });
        continue;
      }
      const { changed, html: newHtml, hits } = stripBanner(file.html);
      if (!changed) {
        results.push({ path, status: 'clean', hits: 0 });
        continue;
      }
      if (dryRun) {
        results.push({ path, status: 'would_patch', hits, beforeBytes: file.html.length, afterBytes: newHtml.length });
        continue;
      }
      try {
        await putFile(path, file.sha, newHtml, `Repair: strip AI commentary failed banner (${path.split('/').pop()})`);
        results.push({ path, status: 'patched', hits, beforeBytes: file.html.length, afterBytes: newHtml.length });
      } catch (err) {
        results.push({ path, status: 'error', error: String(err) });
      }
    }

    return res.status(200).json({
      dryRun,
      total: targets.length,
      patched: results.filter(r => r.status === 'patched').length,
      wouldPatch: results.filter(r => r.status === 'would_patch').length,
      clean: results.filter(r => r.status === 'clean').length,
      errors: results.filter(r => r.status === 'error').length,
      results,
      howToApply: dryRun ? 'POST to this endpoint with { confirm:true } (and date or all:true) to apply.' : undefined,
    });
  } catch (err) {
    console.error('repair-brief error:', err);
    return res.status(500).json({ error: 'Repair failed', detail: String(err) });
  }
};
