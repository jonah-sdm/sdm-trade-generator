// Publishes Market Brief as an iframe embed in Webflow CMS
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const wfToken = process.env.WEBFLOW_API_TOKEN;
  const collectionId = process.env.WEBFLOW_COLLECTION_ID;
  const ghToken = process.env.GH_REPORTS_TOKEN;
  const ghRepo = process.env.GH_REPORTS_REPO || 'jonah-sdm/sdm-reports';
  const ghBranch = process.env.GH_REPORTS_BRANCH || 'main';

  if (!wfToken) return res.status(500).json({ error: 'WEBFLOW_API_TOKEN not configured' });
  if (!collectionId) return res.status(500).json({ error: 'WEBFLOW_COLLECTION_ID not configured' });
  if (!ghToken) return res.status(500).json({ error: 'GH_REPORTS_TOKEN not configured' });

  try {
    const { html, title, date, slug } = req.body;
    if (!html) return res.status(400).json({ error: 'Missing html' });

    const itemTitle = title || `Daily Market Brief — ${date || new Date().toISOString().slice(0, 10)}`;
    const itemSlug = slug || `daily-market-brief-${date || new Date().toISOString().slice(0, 10)}`;
    const itemDate = date ? `${date}T00:00:00Z` : new Date().toISOString();
    const d = date || new Date().toISOString().slice(0, 10);
    const ghFilename = `SDM-MarketBrief-${d}.html`;
    const ghPath = `reports/${ghFilename}`;

    // Step 1: Upload full styled HTML to GitHub
    const content = Buffer.from(html).toString('base64');
    const ghApiUrl = `https://api.github.com/repos/${ghRepo}/contents/${ghPath}`;

    // Check if file exists (for update)
    let sha;
    try {
      const checkRes = await fetch(ghApiUrl + `?ref=${ghBranch}`, {
        headers: { 'Authorization': `Bearer ${ghToken}`, 'Accept': 'application/vnd.github+json' },
      });
      if (checkRes.ok) sha = (await checkRes.json()).sha;
    } catch (e) { /* doesn't exist */ }

    const ghBody = { message: `Market Brief: ${ghFilename}`, content, branch: ghBranch };
    if (sha) ghBody.sha = sha;

    const ghRes = await fetch(ghApiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${ghToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json',
      },
      body: JSON.stringify(ghBody),
    });

    if (!ghRes.ok) {
      const err = await ghRes.text();
      console.error('GitHub API error:', ghRes.status, err);
      return res.status(500).json({ error: 'Failed to upload to GitHub', detail: err });
    }

    const rawUrl = `https://raw.githubusercontent.com/${ghRepo}/${ghBranch}/${ghPath}`;
    const viewUrl = `https://htmlpreview.github.io/?${rawUrl}`;

    // Step 2: Delete ALL existing Webflow items with same slug (live + staged)
    const deleteExisting = async (endpoint) => {
      try {
        const listRes = await fetch(
          `https://api.webflow.com/v2/collections/${collectionId}/items${endpoint}?limit=50`,
          { headers: { 'Authorization': `Bearer ${wfToken}`, 'Accept': 'application/json' } }
        );
        if (listRes.ok) {
          const matches = ((await listRes.json()).items || []).filter(i => i.fieldData?.slug === itemSlug);
          for (const item of matches) {
            // Try deleting from live first, then staged
            await fetch(
              `https://api.webflow.com/v2/collections/${collectionId}/items/${item.id}/live`,
              { method: 'DELETE', headers: { 'Authorization': `Bearer ${wfToken}` } }
            ).catch(() => {});
            await fetch(
              `https://api.webflow.com/v2/collections/${collectionId}/items/${item.id}`,
              { method: 'DELETE', headers: { 'Authorization': `Bearer ${wfToken}` } }
            ).catch(() => {});
          }
        }
      } catch (e) { /* skip */ }
    };
    await deleteExisting('/live');
    await deleteExisting('');

    // Step 2.5: Inject auto-resize script into the HTML before uploading
    const resizeScript = `<script>window.addEventListener('load',function(){var h=document.body.scrollHeight;window.parent.postMessage({type:'sdm-resize',height:h},'*');});<\/script>`;
    const injectedHtml = html.replace('</body>', resizeScript + '</body>');

    // Re-upload with the resize script injected
    const content2 = Buffer.from(injectedHtml).toString('base64');
    const ghBody2 = { message: `Market Brief: ${ghFilename}`, content: content2, branch: ghBranch };
    // Get sha for update
    try {
      const checkRes2 = await fetch(ghApiUrl + `?ref=${ghBranch}`, {
        headers: { 'Authorization': `Bearer ${ghToken}`, 'Accept': 'application/vnd.github+json' },
      });
      if (checkRes2.ok) ghBody2.sha = (await checkRes2.json()).sha;
    } catch (e) { /* skip */ }
    await fetch(ghApiUrl, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${ghToken}`, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github+json' },
      body: JSON.stringify(ghBody2),
    });

    // Step 3: Create Webflow CMS item with iframe embed + auto-resize listener
    const iframeId = `sdm-brief-${Date.now()}`;
    const iframeEmbed = `<div data-rt-embed-type="true"><iframe id="${iframeId}" src="${viewUrl}" width="100%" height="8000px" style="border:none;" scrolling="no"></iframe><script>window.addEventListener('message',function(e){if(e.data&&e.data.type==='sdm-resize'){document.getElementById('${iframeId}').style.height=e.data.height+'px';}});<\/script></div>`;

    const fieldData = {
      name: itemTitle,
      slug: itemSlug,
      'insights-description': iframeEmbed,
      'date': itemDate,
      'pdf-blog-switch': false,
    };

    const wfRes = await fetch(
      `https://api.webflow.com/v2/collections/${collectionId}/items/live`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${wfToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ fieldData }),
      }
    );

    if (!wfRes.ok) {
      const errText = await wfRes.text();
      console.error('Webflow API error:', wfRes.status, errText);
      return res.status(500).json({ error: 'Webflow API error', status: wfRes.status, detail: errText });
    }

    const result = await wfRes.json();
    return res.status(200).json({
      success: true,
      itemId: result.id,
      slug: result.fieldData?.slug || itemSlug,
      reportUrl: viewUrl,
    });
  } catch (err) {
    console.error('Webflow publish error:', err);
    return res.status(500).json({ error: 'Failed to publish', detail: String(err) });
  }
};
