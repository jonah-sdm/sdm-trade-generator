// One-shot migration: rewrite old htmlpreview.github.io iframe URLs in existing
// Webflow Market Brief CMS items to point at our new /api/report proxy.
//
// Old format:  <iframe src="https://htmlpreview.github.io/?https://raw.githubusercontent.com/jonah-sdm/sdm-reports/main/reports/SDM-MarketBrief-YYYY-MM-DD.html" ...>
// New format:  <iframe src="https://sdm-trade-generator.vercel.app/api/report?date=YYYY-MM-DD" ...>
//
// Usage:
//   GET  /api/migrate-webflow-reports                  → dry run, returns what WOULD change
//   POST /api/migrate-webflow-reports  { confirm: true } → actually patches the Webflow items
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const wfToken = process.env.WEBFLOW_API_TOKEN;
  const collectionId = process.env.WEBFLOW_COLLECTION_ID;
  if (!wfToken || !collectionId) {
    return res.status(500).json({ error: 'WEBFLOW_API_TOKEN or WEBFLOW_COLLECTION_ID not configured' });
  }

  const isDryRun = req.method === 'GET' || !(req.body && req.body.confirm === true);

  const host = req.headers['x-forwarded-host'] || req.headers.host || 'sdm-trade-generator.vercel.app';
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const newBaseUrl = `${proto}://${host}/api/report`;

  // Pull all items from the collection (page through up to 500 items)
  const fetchAllItems = async () => {
    const all = [];
    let offset = 0;
    const limit = 100;
    while (true) {
      const r = await fetch(
        `https://api.webflow.com/v2/collections/${collectionId}/items?limit=${limit}&offset=${offset}`,
        { headers: { 'Authorization': `Bearer ${wfToken}`, 'Accept': 'application/json' } }
      );
      if (!r.ok) throw new Error(`Webflow list failed: ${r.status} ${await r.text()}`);
      const json = await r.json();
      const items = json.items || [];
      all.push(...items);
      if (items.length < limit) break;
      offset += limit;
      if (offset >= 500) break; // safety cap
    }
    return all;
  };

  // Match an htmlpreview iframe and pull the report date out of the URL
  // Old src pattern: https://htmlpreview.github.io/?https://raw.githubusercontent.com/<owner>/<repo>/<branch>/reports/SDM-MarketBrief-YYYY-MM-DD.html
  const HTML_PREVIEW_RE = /https:\/\/htmlpreview\.github\.io\/\?https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/reports\/SDM-MarketBrief-(\d{4}-\d{2}-\d{2})\.html/g;

  const rewriteEmbed = (html) => {
    if (!html || typeof html !== 'string') return { changed: false, html, dates: [] };
    const dates = [];
    const out = html.replace(HTML_PREVIEW_RE, (_, date) => {
      dates.push(date);
      return `${newBaseUrl}?date=${date}`;
    });
    return { changed: out !== html, html: out, dates };
  };

  try {
    const items = await fetchAllItems();
    const plan = [];

    for (const item of items) {
      const fd = item.fieldData || {};
      const embed = fd['insights-description'] || '';
      const { changed, html: newEmbed, dates } = rewriteEmbed(embed);
      if (!changed) continue;
      plan.push({
        itemId: item.id,
        slug: fd.slug,
        name: fd.name,
        datesFound: [...new Set(dates)],
        newEmbedPreview: newEmbed.slice(0, 240) + (newEmbed.length > 240 ? '...' : ''),
      });
    }

    if (isDryRun) {
      return res.status(200).json({
        dryRun: true,
        totalItems: items.length,
        wouldUpdate: plan.length,
        newBaseUrl,
        plan,
        howToApply: 'POST to this same endpoint with body { "confirm": true }',
      });
    }

    // ── Apply: PATCH each item, then publish to live ──
    const results = [];
    for (const item of items) {
      const fd = item.fieldData || {};
      const embed = fd['insights-description'] || '';
      const { changed, html: newEmbed } = rewriteEmbed(embed);
      if (!changed) continue;

      // PATCH the staged item
      const patchRes = await fetch(
        `https://api.webflow.com/v2/collections/${collectionId}/items/${item.id}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${wfToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ fieldData: { 'insights-description': newEmbed } }),
        }
      );
      const patchOk = patchRes.ok;
      const patchDetail = patchOk ? null : await patchRes.text();

      // Publish to live so the change is visible on the site
      let publishOk = false;
      let publishDetail = null;
      if (patchOk) {
        const pubRes = await fetch(
          `https://api.webflow.com/v2/collections/${collectionId}/items/publish`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${wfToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify({ itemIds: [item.id] }),
          }
        );
        publishOk = pubRes.ok;
        publishDetail = publishOk ? null : await pubRes.text();
      }

      results.push({
        itemId: item.id,
        slug: fd.slug,
        name: fd.name,
        patched: patchOk,
        published: publishOk,
        error: patchDetail || publishDetail || null,
      });
    }

    return res.status(200).json({
      dryRun: false,
      totalItems: items.length,
      updated: results.filter(r => r.patched).length,
      published: results.filter(r => r.published).length,
      failed: results.filter(r => r.error).length,
      newBaseUrl,
      results,
    });
  } catch (err) {
    console.error('Migration error:', err);
    return res.status(500).json({ error: 'Migration failed', detail: String(err) });
  }
};
