# SDM Trade Idea Studio

Internal tool for generating branded Canva trade idea documents from structured inputs.

## What It Does

Select a trade type → fill in deal-specific inputs → click Generate → get a live Canva document with a shareable link.

## Trade Types Supported

| Trade | Category | Asset Class |
|-------|----------|-------------|
| Long Seagull | Options Structure | Crypto |
| Reverse Cash & Carry | Basis Trade | BTC |
| Covered Call | Income Strategy | Equities |
| Cash-Secured Put | Income Strategy | Equities |
| LEAP Entry | Long Directional | Equities |
| The Wheel | Income Strategy | Equities |
| Protective Collar | Hedging | Equities |
| Earnings Risk Analysis | Event-Driven | Equities |

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Run locally

```bash
npm start
```

### 3. Get a Canva API Access Token

1. Go to [canva.com/developers](https://www.canva.com/developers/)
2. Open your app → Authentication → Generate a token
3. Paste it into the **Canva API Token** field in the app header

---

## Deploy to Vercel

### Option A: CLI (recommended)

```bash
npm install -g vercel
vercel login
vercel --prod
```

### Option B: GitHub + Vercel Dashboard

1. Push to a GitHub repo
2. Import in [vercel.com/new](https://vercel.com/new)
3. No env vars needed — token is entered in the UI at runtime

---

## Canva Template Setup (Important)

Currently the app uses the DigiPay design (`DAHC7DRbNJw`) as a base template for all trade types.

**To get full functionality:**

1. In Canva, create a master trade idea template for each trade type
2. Add placeholder text fields using the `{{PLACEHOLDER}}` pattern (e.g. `{{TICKER}}`, `{{STRIKE}}`, `{{EXPIRY}}`)
3. Update the `TEMPLATE_MAP` in `src/canvaService.js` with each template's design ID

Example:
```js
const TEMPLATE_MAP = {
  long_seagull:      "DAHC_your_seagull_template_id",
  reverse_cash_carry: "DAHC_your_basis_trade_template_id",
  covered_call:      "DAHC_your_covered_call_template_id",
  // etc.
};
```

The `buildReplacements()` function in `canvaService.js` already maps all form fields to the correct `{{PLACEHOLDER}}` keys for each trade type.

---

## Project Structure

```
src/
  App.jsx          — Main UI (phase flow: select → configure → generate → result)
  canvaService.js  — Canva API integration (editing sessions, text replacement, publish)
  tradeTypes.js    — Trade type definitions and form field configs
  index.css        — All styles
```

## Adding a New Trade Type

1. Add a new entry to `TRADE_TYPES` in `tradeTypes.js` with `id`, `label`, `fields`, etc.
2. Add a case in `buildReplacements()` in `canvaService.js` mapping fields to `{{PLACEHOLDERS}}`
3. Add the template design ID to `TEMPLATE_MAP` in `canvaService.js`

That's it — the UI picks it up automatically.

---

## Architecture Notes

- **No file downloads** — all output is Canva document links
- **No backend** — Canva API is called directly from the browser with the user's token
- **Token security** — the access token is entered at runtime and never stored or transmitted anywhere other than Canva's API
- **Stateless** — no database, no auth, fully static deployment

---

*SDM Financial — Internal Use Only*
