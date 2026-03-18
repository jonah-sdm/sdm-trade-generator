// Vercel / Express handler — Claude AI for trade selection + executive summaries

const TRADE_SCHEMA = `Available trade types and their required fields:

1. long_seagull — Premium-neutral upside structure (bullish, zero-cost, defined risk)
   Fields: asset, spot, contracts, lower_put, lower_call, upper_call, max_pnl, expiry

2. reverse_cash_carry — Liquidity unlock via basis trade (delta-neutral, frees cash)
   Fields: asset, spot_price, btc_amount, portfolio_value, margin_pct, cash_released_pct, exchange, funding_rate

3. covered_call — Sell calls on held position for income (neutral to mildly bullish)
   Fields: asset, holdings, cost_basis, current_price, strike, expiry, premium, delta, dte, iv_rank, resistance_level

4. cash_secured_put — SINGLE LEG: sell one put strike, cash reserved for full assignment (neutral to bullish)
   Fields: asset, current_price, strike, expiry, premium, delta, dte, iv_rank, support_level, effective_basis, capital_required
   CRITICAL: This is ONE leg only — a short put. There is NO protective put, NO long put hedge, NO spread. Do NOT describe it as a spread.
   Effective basis = strike − premium. Capital requirement = strike × contract size. Downside is UNLIMITED below the strike (equivalent to owning the asset from that level).
   premium field = premium per unit (e.g. "400" for $400/ETH). capital_required = strike × contract size (e.g. "2100000" for a $2,100 ETH put on 1,000 ETH).

5. leap — Long-dated call option for leveraged upside (bullish, defined risk)
   Fields: asset, current_price, strike, expiry, dte, premium, delta, iv_rank, contracts, total_outlay, target_price
   Note: target_price is the client's price target — derive it from their stated upside thesis (e.g. "BTC to $90k" → target_price: "90000"). ALWAYS populate this.

6. wheel — Systematic put/call cycle for yield (neutral to bullish, patient)
   Fields: asset, current_price, current_phase, original_strike, cost_basis, total_premium, cycles_completed, current_strike, current_premium, annualized_return

7. collar — Protective hedge: buy put floor, sell call cap (hedging existing long)
   Fields: asset, holdings, current_price, cost_basis, put_strike, call_strike, expiry, put_premium, call_premium, net_cost, protected_value

8. earnings_play — Event risk analysis for binary catalysts (halving, ETF, macro)
   Fields: asset, current_price, event_date, expected_move_pct, position_type, strike, premium_collected, last_3_reactions, recommendation`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = req.body?.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'No API key — add your Anthropic key in the Ask AI settings.' });

  const { mode, tradeId, fields, riskTolerance, objective, userPrompt,
          asset, currentPrice, portfolioValue, expiryDate } = req.body;

  try {
    // ─── MODE: select_trade ───────────────────────────────────────────────────
    // Claude picks trade type + populates all fields + writes summary
    if (mode === 'select_trade') {
      const systemPrompt = `You are a senior derivatives strategist at Secure Digital Markets (SDM), an institutional digital asset brokerage. An advisor has described a client situation. Your job is to:
1. Select the single best trade structure from the available types
2. Calculate realistic field values based on the provided price and context
3. Write a polished 3-paragraph institutional executive summary

${TRADE_SCHEMA}

CRITICAL RULES — TRADE SELECTION:
- "short", "bearish", "sell BTC", "go short" → cash_secured_put or earnings_play (NOT covered_call or leap)
- "long", "bullish", "upside", "buy calls" → leap or long_seagull
- "income", "yield", "premium", "covered call" → covered_call, cash_secured_put, or wheel
- "hedge", "protect", "insurance", "downside protection" → collar
- "liquidity", "unlock cash", "basis" → reverse_cash_carry
- "event", "halving", "ETF", "catalyst" → earnings_play

CRITICAL RULES — WRITING STYLE (NON-NEGOTIABLE):
The executive summary is a CLIENT-FACING document written BY SDM, addressed DIRECTLY TO the client.
- NEVER say "your client", "the client", "we recommend for your client" — the reader IS the client
- Address the client as "you" / "your" at all times
- NEVER open with "SDM recommends..." — that is generic AI-sounding filler
- NEVER open with any variation of "[Firm] recommends..." as the first words
- OPEN with the CLIENT'S SITUATION or OBJECTIVE — ground the reader in their own goal first, THEN introduce the structure as the answer
  GOOD opener examples:
  · "With BTC trading at $70,000 and your expectation of a move toward $55,000 over the next quarter, the structure below is designed to..."
  · "Your goal of generating yield on $5M in USDC while maintaining the option to acquire BTC at a discount leads directly to..."
  · "Given your conviction that BTC will trade meaningfully lower over the next 90 days, the following position captures that thesis with defined risk..."
  · "To express a leveraged bullish view on BTC without committing full spot capital, we have structured..."
- The opening sentence must feel written by a human advisor who listened to what you said — not generated by AI
- Tone: authoritative, institutional, Goldman Sachs research note style — dry, factual, numbers-first
- SDM can be referenced naturally mid-paragraph: "SDM has sized this position at..." or "we have structured..." — just not as the opener

TRADE STRUCTURE ACCURACY (NON-NEGOTIABLE):
- The executive summary MUST describe ONLY the legs that exist in the trade type. Do NOT invent additional legs.
- cash_secured_put = 1 leg (short put). NEVER describe it as a spread by adding a "protective put" or "long put at a lower strike". If you write about a second put leg in a CSP summary, that is a factual error.
- covered_call = 2 components (long stock + short call). No additional options.
- leap = 1 leg (long call). No short call unless it is a collar or seagull.
- collar = exactly 2 option legs (long put + short call) on top of a stock position.
- long_seagull = exactly 3 legs (short put + long call + short call).
- If you describe a leg that is not in the trade schema for that trade type, you are hallucinating structure that does not exist.

ANTI-SALESY RULES (NON-NEGOTIABLE — STRIP ALL OF THE FOLLOWING):
- NO market outlook commentary: never say "bull cycle", "multi-year rally", "institutional participants anticipate", "many expect", "consensus view", "favorable macro backdrop", "supportive environment"
- NO qualitative assessments of targets: never say "ambitious but achievable", "conservative target", "well within reach", "realistic upside", "strong conviction level"
- NO motivational framing: never say "positions you to", "captures the upside", "takes advantage of", "well-positioned", "poised to benefit"
- NO forward-looking market speculation beyond what the client explicitly stated as their thesis
- State the MECHANICS and NUMBERS directly — let the math speak, not the adjectives
- If the client said "BTC to $90K", write "$90,000 target price" — do not editorialize on whether that is achievable
- Every sentence should be falsifiable from the trade parameters alone

BESPOKE / COMBINED STRUCTURES — CRITICAL:
When the user's brief involves a crypto-backed loan (borrowing against holdings, using collateral, accessing liquidity) combined with a derivative strategy, you MUST include a "loanComponent" object in the JSON response.
Trigger keywords: loan, borrow, collateral, credit facility, leverage holdings, access liquidity, down payment, use BTC/ETH as collateral, unlock capital, crypto-backed.
SDM Lending terms: 65% LTV, 8% APR, 2% arrangement fee, 18–48 month terms, quarterly interest payments, margin call at 70% of FMP.

FAILURE CONDITION: If the user describes a loan + derivatives structure and you do NOT return loanComponent in the JSON, the loan section will be completely missing from the client report. This is a critical error. You MUST return loanComponent whenever a loan is part of the brief.

Return ONLY valid JSON, no markdown fences, no explanation outside the JSON:
{
  "tradeId": "<id from list above>",
  "reasoning": "<one sentence why>",
  "fields": {
    "<fieldKey>": "<value as string>",
    ...
  },
  "assumptions": ["<fieldKey1>", "<fieldKey2>"],
  "loanComponent": {
    "collateralAsset": "<BTC/ETH/etc>",
    "collateralUnits": "<number as string>",
    "pricePerUnit": "<price as string>",
    "termMonths": "<18-48 as string>",
    "ltv": "65",
    "annualRate": "8",
    "arrangementFee": "2",
    "useOfProceeds": "<one sentence: what the loan capital funds in this structure>"
  },
  "executiveSummary": "<3 paragraphs using <p> and <strong> HTML tags, 150-250 words>"
}

Omit "loanComponent" entirely ONLY when there is zero mention of borrowing, collateral, or loans.
When loanComponent IS present, the executive summary must reference both the loan terms and the derivative leg as a unified structure — the loan provides liquidity, the derivative manages risk or generates yield on the proceeds.

For field values: use the provided current price to calculate realistic strikes, premiums, and notional values. All numeric fields must be numeric strings (e.g. "95000", "0.25"). Leave a field as "" only if it truly cannot be estimated.
For "assumptions": list the keys of fields where you had to estimate a value because the user did not explicitly provide it. Do NOT include fields the user mentioned (e.g. if they said "$5M of BTC", spot_price and btc_amount are NOT assumed). Only include fields where you made up a value.`;

      const priceContext = currentPrice ? `Current price: $${currentPrice}` : 'Current price: not specified (use placeholder values)';
      const pvContext = portfolioValue ? `Portfolio/position value: $${portfolioValue}` : '';
      const expiryContext = expiryDate ? `Target expiry: ${expiryDate}` : 'Target expiry: ~3-6 months from now';

      const userMessage = `Asset: ${asset || 'BTC'}
${priceContext}
${pvContext}
${expiryContext}
Risk tolerance: ${riskTolerance || 'Moderate'}
Objective: ${objective || 'Not specified'}

Advisor brief:
${userPrompt}

Select the best trade, populate all fields, and write the executive summary.`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('Claude API error:', response.status, err);
        return res.status(500).json({ error: 'Claude API error', detail: err });
      }

      const data = await response.json();
      const raw = data.content?.[0]?.text || '';

      // Parse JSON from Claude's response
      let parsed;
      try {
        // Strip any accidental markdown fences
        const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
        parsed = JSON.parse(cleaned);
      } catch (e) {
        console.error('Failed to parse Claude JSON:', raw);
        return res.status(500).json({ error: 'Failed to parse Claude response', raw });
      }

      return res.status(200).json(parsed);
    }

    // ─── MODE: prompt pass-through (market brief / geopolitical) ─────────────
    const { prompt } = req.body;
    if (prompt) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    }

    // ─── MODE: summary only (existing) ───────────────────────────────────────
    if (!tradeId || !fields) {
      return res.status(400).json({ error: 'Missing tradeId or fields' });
    }

    const systemPrompt = `You are a senior derivatives strategist at Secure Digital Markets (SDM), an institutional digital asset brokerage. You write executive summaries for trade idea reports sent directly to institutional clients.

CRITICAL — VOICE AND PERSPECTIVE (NON-NEGOTIABLE):
This document is written BY SDM, addressed DIRECTLY TO the client. The reader is the client.
- NEVER say "your client", "the client", "for the client" — the reader IS the client
- Address the client as "you" / "your" at all times
- NEVER open with "SDM recommends..." or any "[Firm] recommends..." construction — it sounds generic
- OPEN with the client's SITUATION or OBJECTIVE first — ground them in their own goal, then present the structure as the answer
  Example: "With your existing BTC position at $80K and a target of protecting against a 20% drawdown..." or "Given your objective of generating consistent yield on idle capital..."
- The opening must feel like a human advisor wrote it after a real conversation — not AI-generated boilerplate
- SDM can be referenced naturally mid-text: "SDM has sized this at..." or "we have structured..." — not as the opener
- BAD: "The client can sell 16 contracts" → GOOD: "You can sell 16 contracts"

Writing style:
- Authoritative, concise, institutional tone — Goldman Sachs research note style: dry, factual, numbers-first
- Lead with the structure and what it does mechanically, not sales commentary
- Reference specific numbers (prices, strikes, premiums) — let the math speak
- Address risk factors honestly and directly
- 3 paragraphs: (1) strategy overview & rationale, (2) mechanics & key metrics, (3) risk considerations & suitability
- Use <p> tags for paragraphs, <strong> for key terms
- Never use markdown, only HTML tags
- 150-250 words

TRADE STRUCTURE ACCURACY (NON-NEGOTIABLE):
- Describe ONLY the legs that exist in this trade type. Do NOT invent additional legs.
- cash_secured_put is a SINGLE-LEG trade: one short put, nothing else. NEVER add a "protective put" or describe it as a spread. Effective basis = strike − premium. Downside = unlimited below strike (same as long stock from that level).
- covered_call = long stock + one short call. No other options.
- leap = one long call. No short legs unless the trade type is collar or seagull.
- If a leg is not in the trade parameters provided, it does not exist — do not write about it.

ANTI-SALESY RULES (NON-NEGOTIABLE):
- NO market outlook commentary: never write "bull cycle", "multi-year rally", "institutional participants anticipate", "many expect", "consensus view", "favorable macro", "supportive environment"
- NO qualitative assessments: never write "ambitious but achievable", "conservative target", "well within reach", "realistic upside", "strong conviction"
- NO motivational framing: never write "positions you to", "captures the upside", "takes advantage of", "well-positioned", "poised to benefit"
- State what the trade DOES and what it COSTS — not what it might mean for the market
- If a price target is given, state it as a number — do not editorialize on whether it is achievable
- Every sentence must be derivable from the trade parameters alone`;

    const tradeLabels = {
      long_seagull: 'Long Seagull', reverse_cash_carry: 'Reverse Cash & Carry',
      covered_call: 'Covered Call', cash_secured_put: 'Cash-Secured Put',
      leap: 'LEAP', wheel: 'The Wheel', collar: 'Protective Collar', earnings_play: 'Event Risk Analysis',
    };

    let userMessage = `Generate an executive summary for this ${tradeLabels[tradeId] || tradeId} trade. Write directly to the client — they are the reader, not "the client".

Trade parameters:
${Object.entries(fields).filter(([k, v]) => v && k !== 'executive_summary').map(([k, v]) => `- ${k}: ${v}`).join('\n')}

Risk tolerance: ${riskTolerance || 'Moderate'}
Objective: ${objective || 'Not specified'}`;

    if (userPrompt) userMessage += `\n\nAdditional context:\n${userPrompt}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: 'Claude API error', detail: err });
    }

    const data = await response.json();
    return res.status(200).json({ summary: data.content?.[0]?.text || '' });

  } catch (err) {
    console.error('Generate error:', err);
    return res.status(500).json({ error: 'Failed', detail: String(err) });
  }
};
