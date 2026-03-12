/**
 * fieldExtractor.js
 * Scans executive summary text to fill in missing trade fields.
 * Called before navigating to the report when fields are blank.
 */

// Parse "$95,000", "$95K", "$1.2M", "95000" → numeric string
function parseMoney(raw) {
  if (!raw) return null;
  const s = raw.replace(/,/g, "").trim();
  if (/K$/i.test(s)) return String(parseFloat(s) * 1000);
  if (/M$/i.test(s)) return String(parseFloat(s) * 1000000);
  const n = parseFloat(s);
  return isNaN(n) ? null : String(n);
}

// Try each regex in order, return first match group as a money string
function matchMoney(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const raw = m[1] || m[0];
      const val = parseMoney(raw.replace(/\$/, ""));
      if (val) return val;
    }
  }
  return null;
}

// Try each regex, return first match group as-is (for text fields)
function matchText(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return (m[1] || m[0]).trim();
  }
  return null;
}

// ─── Per-field extraction rules ────────────────────────────────────────────

const MONEY_RULES = {
  // Current / spot price
  current_price: [
    /currently\s+(?:trading\s+)?at\s+\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /current\s+(?:price|spot)\s+(?:is\s+|of\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /(?:spot|price)\s+(?:of\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /\$?([\d,]+(?:\.\d{1,2})?[KM]?)\s+(?:current|spot|today)/i,
  ],
  spot: [
    /currently\s+(?:trading\s+)?at\s+\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /(?:spot|current\s+price)\s+(?:of\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
  ],
  spot_price: [
    /currently\s+(?:trading\s+)?at\s+\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /(?:spot|current\s+price)\s+(?:of\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
  ],

  // Strike prices
  strike: [
    /strike\s+(?:price\s+)?(?:of\s+|at\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /at\s+a\s+strike\s+of\s+\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /(?:sell(?:ing)?\s+(?:the\s+)?(?:put|call)\s+at\s+)\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /\$?([\d,]+(?:\.\d{1,2})?[KM]?)\s+strike/i,
  ],
  call_strike: [
    /call\s+strike\s+(?:of\s+|at\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /sell(?:ing)?\s+(?:the\s+)?call\s+at\s+\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /upside\s+(?:cap|ceiling)\s+(?:at\s+|of\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
  ],
  put_strike: [
    /put\s+strike\s+(?:of\s+|at\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /sell(?:ing)?\s+(?:the\s+)?put\s+at\s+\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /(?:floor|downside\s+protection)\s+(?:at\s+|of\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /protected?\s+(?:down\s+to|at)\s+\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
  ],
  lower_put: [
    /(?:short\s+put|lower\s+put)\s+(?:strike\s+)?(?:at\s+|of\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /downside\s+(?:risk|floor)\s+(?:at|below)\s+\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
  ],
  lower_call: [
    /(?:long\s+call|lower\s+call)\s+(?:strike\s+)?(?:at\s+|of\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /upside\s+(?:participation\s+)?(?:from|above)\s+\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
  ],
  upper_call: [
    /(?:short\s+call|upper\s+call|capped?\s+at)\s+(?:strike\s+)?(?:at\s+|of\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /upside\s+(?:capped?|limited)\s+(?:at|to)\s+\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
  ],

  // Premium
  premium: [
    /(?:collect(?:ing|s)?\s+|premium\s+(?:of\s+|is\s+)?)\$?([\d,]+(?:\.\d{1,2})?[KM]?)\s*(?:in\s+premium|per\s+(?:unit|contract))?/i,
    /premium\s+(?:income|collected|received)\s+(?:of\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /\$?([\d,]+(?:\.\d{1,2})?[KM]?)\s+(?:in\s+)?premium/i,
  ],
  put_premium: [
    /put\s+premium\s+(?:of\s+|paid\s+(?:of\s+)?)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /(?:cost|pay(?:ing)?)\s+\$?([\d,]+(?:\.\d{1,2})?[KM]?)\s+for\s+the\s+put/i,
  ],
  call_premium: [
    /call\s+premium\s+(?:of\s+|received\s+(?:of\s+)?)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /(?:sell(?:ing)?\s+the\s+call\s+for\s+|call\s+generates?\s+)\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
  ],

  // Capital / cost
  capital_required: [
    /capital\s+(?:required|needed|committed)\s+(?:of\s+|is\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /(?:reserve|hold(?:ing)?)\s+\$?([\d,]+(?:\.\d{1,2})?[KM]?)\s+(?:in\s+)?capital/i,
    /\$?([\d,]+(?:\.\d{1,2})?[KM]?)\s+(?:in\s+)?(?:capital|cash)\s+(?:required|reserved)/i,
  ],
  total_outlay: [
    /total\s+(?:outlay|cost|capital\s+at\s+risk)\s+(?:of\s+|is\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /(?:risk(?:ing)?|spend(?:ing)?)\s+\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
  ],
  cost_basis: [
    /cost\s+basis\s+(?:of\s+|at\s+|is\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /basis\s+(?:of\s+|at\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /(?:adjusted\s+)?cost\s+basis\s+(?:falls?\s+to\s+|becomes?\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
  ],
  effective_basis: [
    /effective\s+(?:cost\s+)?basis\s+(?:of\s+|at\s+|is\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /effective\s+purchase\s+price\s+(?:of\s+|would\s+be\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
  ],
  support_level: [
    /support\s+(?:level\s+)?(?:at\s+|of\s+|near\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /key\s+support\s+(?:at\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
  ],
  resistance_level: [
    /resistance\s+(?:level\s+)?(?:at\s+|of\s+|near\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /key\s+resistance\s+(?:at\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
  ],
  max_pnl: [
    /max(?:imum)?\s+(?:profit|p(?:&|and)l|gain)\s+(?:of\s+|is\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /profit\s+(?:capped?\s+at|potential\s+of)\s+\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
  ],
  portfolio_value: [
    /portfolio\s+(?:value\s+)?(?:of\s+|worth\s+|is\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /\$?([\d,]+(?:\.\d{1,2})?[KM]?)\s+(?:portfolio|in\s+(?:assets?|holdings?))/i,
  ],
  protected_value: [
    /protect(?:ing|ed)?\s+\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /protected?\s+value\s+(?:of\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
  ],
  net_cost: [
    /net\s+cost\s+(?:of\s+|is\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /zero.?cost|premium.?neutral/i,  // signals net_cost ≈ 0
  ],
  total_premium: [
    /total\s+premium\s+(?:collected\s+)?(?:of\s+|is\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
    /cumulative\s+premium\s+(?:of\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
  ],
  current_premium: [
    /current\s+premium\s+(?:of\s+|is\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
  ],
  original_strike: [
    /original\s+(?:put\s+)?strike\s+(?:of\s+|at\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
  ],
  current_strike: [
    /current\s+(?:active\s+)?strike\s+(?:of\s+|at\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
  ],
  premium_collected: [
    /premium\s+collected\s+(?:of\s+|is\s+)?\$?([\d,]+(?:\.\d{1,2})?[KM]?)/i,
  ],
};

const TEXT_RULES = {
  asset: [
    /\b(BTC|ETH|SOL|BNB|XRP|DOGE|ADA|AVAX|MATIC|DOT|LINK|UNI|AAVE|LTC|BCH)\b/i,
    /(?:Bitcoin|Ethereum|Solana|Ripple|Cardano|Avalanche|Polkadot)\b/,
  ],
  expiry: [
    /expir(?:y|es?|ing)\s+(?:on\s+)?(\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4})/i,
    /(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}/i,
    /(\d{1,2}\/\d{1,2}\/\d{4})/,
  ],
  event_date: [
    /event\s+(?:date\s+)?(?:is\s+|on\s+)?(\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4})/i,
  ],
  last_3_reactions: [
    /((?:[+-]\d+(?:\.\d+)?%,?\s*){2,}[+-]\d+(?:\.\d+)?%)/,
  ],
  exchange: [
    /(?:via|on|through|at)\s+(Deribit|Binance|OKX|Bybit|CME|Kraken|Coinbase|BitMEX)/i,
    /\b(Deribit|Binance|OKX|Bybit|CME|Kraken)\b/,
  ],
};

const NUMBER_RULES = {
  dte: [
    /(\d+)\s*-?\s*(?:day|DTE|days?\s+to\s+expiry)/i,
    /(?:DTE\s+of\s+|expires?\s+in\s+)(\d+)\s*days?/i,
  ],
  delta: [
    /(?:delta\s+(?:of\s+)?)(-?0\.\d+)/i,
    /(-?0\.\d+)\s*delta/i,
    /(?:~|approximately\s+)(-?0\.\d+)\s+delta/i,
  ],
  iv_rank: [
    /IV\s+(?:rank\s+)?(?:of\s+)?(\d+)%/i,
    /(\d+)%\s+IV\s+(?:rank|percentile)/i,
    /implied\s+volatility\s+(?:rank\s+)?(?:of\s+)?(\d+)/i,
  ],
  expected_move_pct: [
    /expected\s+move\s+(?:of\s+)?(\d+(?:\.\d+)?)%/i,
    /(\d+(?:\.\d+)?)%\s+expected\s+move/i,
  ],
  annualized_return: [
    /(\d+(?:\.\d+)?)%\s+(?:annualized|ann\.?)/i,
    /annualized\s+(?:return|yield)\s+(?:of\s+)?(\d+(?:\.\d+)?)%/i,
  ],
  cycles_completed: [
    /(\d+)\s+cycles?\s+completed/i,
  ],
  holdings: [
    /(\d+(?:\.\d+)?)\s+(?:units?|BTC|ETH|SOL|coins?)\s+(?:of\s+)?(?:BTC|ETH|SOL|the\s+underlying)?/i,
    /hold(?:ing|s)?\s+(\d+(?:\.\d+)?)\s+(?:units?|BTC|ETH|SOL)/i,
  ],
  contracts: [
    /(\d+)\s+contracts?/i,
    /(\d+)\s+options?\s+contracts?/i,
  ],
  funding_rate: [
    /funding\s+rate\s+(?:of\s+)?(\d+(?:\.\d+)?)%/i,
    /(\d+(?:\.\d+)?)%\s+(?:funding|carry)\s+rate/i,
  ],
  margin_pct: [
    /(\d+(?:\.\d+)?)%\s+margin/i,
    /margin\s+(?:of\s+)?(\d+(?:\.\d+)?)%/i,
  ],
  cash_released_pct: [
    /(\d+(?:\.\d+)?)%\s+(?:cash|liquidity)\s+released/i,
    /release\s+(\d+(?:\.\d+)?)%/i,
  ],
  btc_amount: [
    /(\d+(?:\.\d+)?)\s+BTC/i,
    /(\d+(?:\.\d+)?)\s+(?:units?|coins?)\s+of\s+(?:BTC|Bitcoin)/i,
  ],
};

// ─── Main extraction function ───────────────────────────────────────────────

export function extractFieldsFromSummary(summaryText, tradeFields, existingFields) {
  if (!summaryText || !summaryText.trim()) return existingFields;

  const text = summaryText.replace(/<[^>]+>/g, " "); // strip HTML tags
  const result = { ...existingFields };

  // Only fill fields that belong to this trade type and are blank
  const fieldKeys = new Set(tradeFields.map(f => f.key));

  for (const key of fieldKeys) {
    if (key === "executive_summary") continue;
    // Skip if already has a non-empty value
    const existing = result[key];
    if (existing && String(existing).trim() !== "") continue;

    // Try money patterns
    if (MONEY_RULES[key]) {
      // Special case: net_cost with zero-cost pattern
      if (key === "net_cost" && /zero.?cost|premium.?neutral/i.test(text)) {
        result[key] = "0";
        continue;
      }
      const val = matchMoney(text, MONEY_RULES[key]);
      if (val) { result[key] = val; continue; }
    }

    // Try text patterns
    if (TEXT_RULES[key]) {
      const val = matchText(text, TEXT_RULES[key]);
      if (val) { result[key] = val; continue; }
    }

    // Try number patterns
    if (NUMBER_RULES[key]) {
      const val = matchText(text, NUMBER_RULES[key]);
      if (val) { result[key] = val; continue; }
    }
  }

  return result;
}
