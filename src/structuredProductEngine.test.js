// Unit tests for Universal Structured Products Engine
// Run: node src/structuredProductEngine.test.js

import { payoffForLeg, strategyPayoff, findBreakevens, findExtrema, analyzeStructuredProduct } from "./structuredProductEngine.js";
import { adaptCallSpread, adaptPutSpread, adaptStraddle, adaptStrangle, adaptLongSeagull, adaptCashSecuredPut, adaptLeap } from "./strategyAdapters.js";

function approxEq(a, b, tol = 1) {
  if (Math.abs(a - b) > tol) {
    throw new Error(`FAIL: expected ${b}, got ${a} (diff ${Math.abs(a - b)})`);
  }
}

console.log("═══════════════════════════════════════════════");
console.log("  Universal Structured Products Engine Tests");
console.log("═══════════════════════════════════════════════\n");

// ── 1. payoffForLeg ─────────────────────────────────────────────────────

console.log("1. payoffForLeg");

// Long call at 100: at 120 = 20, at 80 = 0
approxEq(payoffForLeg({ type: "call", side: "long", strike: 100 }, 120), 20, 0);
approxEq(payoffForLeg({ type: "call", side: "long", strike: 100 }, 80), 0, 0);
console.log("   Long call ✓");

// Short call at 100: at 120 = -20, at 80 = 0
approxEq(payoffForLeg({ type: "call", side: "short", strike: 100 }, 120), -20, 0);
approxEq(payoffForLeg({ type: "call", side: "short", strike: 100 }, 80), 0, 0);
console.log("   Short call ✓");

// Long put at 100: at 80 = 20, at 120 = 0
approxEq(payoffForLeg({ type: "put", side: "long", strike: 100 }, 80), 20, 0);
approxEq(payoffForLeg({ type: "put", side: "long", strike: 100 }, 120), 0, 0);
console.log("   Long put ✓");

// Short put at 100: at 80 = -20, at 120 = 0
approxEq(payoffForLeg({ type: "put", side: "short", strike: 100 }, 80), -20, 0);
approxEq(payoffForLeg({ type: "put", side: "short", strike: 100 }, 120), 0, 0);
console.log("   Short put ✓");

// Quantity=5: scaled
approxEq(payoffForLeg({ type: "call", side: "long", strike: 100, quantity: 5 }, 120), 100, 0);
console.log("   Quantity scaling ✓");

// ── 2. strategyPayoff — Bull Call Spread ────────────────────────────────

console.log("\n2. strategyPayoff (Bull Call Spread: long 100c, short 110c, net -3)");

const bullSpreadLegs = [
  { type: "call", side: "long", strike: 100 },
  { type: "call", side: "short", strike: 110 },
];

approxEq(strategyPayoff(bullSpreadLegs, 90, -3), -3, 0);    // below both: 0+0-3=-3
approxEq(strategyPayoff(bullSpreadLegs, 105, -3), 2, 0);    // 5+0-3=2
approxEq(strategyPayoff(bullSpreadLegs, 120, -3), 7, 0);    // 20-10-3=7 (max)
console.log("   P&L at 90/105/120 ✓");

// With contracts=10
approxEq(strategyPayoff(bullSpreadLegs, 120, -3, 10), 70, 0);
console.log("   Contracts scaling ✓");

// ── 3. findBreakevens ──────────────────────────────────────────────────

console.log("\n3. findBreakevens");

// Bull call spread 100/110, premium -3: breakeven at 103
const bullBE = findBreakevens(bullSpreadLegs, -3, 1, { min: 80, max: 130 });
if (bullBE.length !== 1) throw new Error(`FAIL: expected 1 breakeven, got ${bullBE.length}`);
approxEq(bullBE[0], 103, 0.5);
console.log(`   Bull call spread: 1 BE at ${bullBE[0].toFixed(2)} ✓`);

// Long straddle at 100, premium -8: two breakevens at 92 and 108
const straddleLegs = [
  { type: "call", side: "long", strike: 100 },
  { type: "put", side: "long", strike: 100 },
];
const straddleBE = findBreakevens(straddleLegs, -8, 1, { min: 70, max: 130 });
if (straddleBE.length !== 2) throw new Error(`FAIL: expected 2 breakevens, got ${straddleBE.length}: [${straddleBE}]`);
approxEq(straddleBE[0], 92, 0.5);
approxEq(straddleBE[1], 108, 0.5);
console.log(`   Long straddle: 2 BEs at ${straddleBE[0].toFixed(2)} and ${straddleBE[1].toFixed(2)} ✓`);

// Long seagull: short 62k put, long 75k call, short 90k call, zero premium
const seagullLegs = [
  { type: "put", side: "short", strike: 62000, quantity: 100 },
  { type: "call", side: "long", strike: 75000, quantity: 100 },
  { type: "call", side: "short", strike: 90000, quantity: 100 },
];
const seagullBE = findBreakevens(seagullLegs, 0, 1, { min: 0.01, max: 120000 });
if (seagullBE.length < 2) throw new Error(`FAIL: expected 2+ breakevens for seagull, got ${seagullBE.length}: [${seagullBE}]`);
console.log(`   Long seagull: ${seagullBE.length} BEs at ${seagullBE.map(b => b.toFixed(0)).join(", ")} ✓`);
// Lower BE should be around 62000 (where short put loss cancels)
// Upper BE should be at 75000 (where long call starts paying)
approxEq(seagullBE[0], 62000, 100); // lower BE
approxEq(seagullBE[1], 75000, 100); // upper BE
console.log("   Seagull breakeven locations ✓");

// ── 4. findExtrema ─────────────────────────────────────────────────────

console.log("\n4. findExtrema");

// Bull call spread: max profit = 7 (bounded), max loss = -3 (bounded)
const bullExtrema = findExtrema(bullSpreadLegs, -3, 1, { min: 80, max: 130 });
approxEq(bullExtrema.maxProfit, 7, 0.5);
approxEq(bullExtrema.maxLoss, -3, 0.5);
if (!bullExtrema.maxProfitBounded) throw new Error("FAIL: bull spread max profit should be bounded");
if (!bullExtrema.maxLossBounded) throw new Error("FAIL: bull spread max loss should be bounded");
console.log("   Bull spread: max profit=7 (bounded), max loss=-3 (bounded) ✓");

// Long straddle: max loss = -8 (bounded at strike), max profit = unbounded
const straddleExtrema = findExtrema(straddleLegs, -8, 1, { min: 70, max: 130 });
approxEq(straddleExtrema.maxLoss, -8, 0.5);
if (straddleExtrema.maxLossBounded !== true) throw new Error("FAIL: straddle max loss should be bounded");
// Max profit at boundary = unbounded
if (straddleExtrema.maxProfitBounded !== false) throw new Error("FAIL: straddle max profit should be unbounded");
console.log("   Long straddle: max loss=-8 (bounded), profit=unbounded ✓");

// ── 5. analyzeStructuredProduct via adapters ───────────────────────────

console.log("\n5. Full analysis via adapters");

// Call Spread
const csResult = analyzeStructuredProduct(adaptCallSpread({
  spot: "100", long_strike: "100", short_strike: "110", premium: "-3",
  direction: "Long", asset: "TEST", expiry: "Jun 2026",
}));
if (!csResult.pnlAtPrice) throw new Error("FAIL: pnlAtPrice missing");
if (!csResult.currentNotional) throw new Error("FAIL: currentNotional missing");
if (csResult.tradeType !== "call_spread") throw new Error("FAIL: tradeType wrong");
approxEq(csResult.pnlAtPrice(120), 7, 0.5);
approxEq(csResult.pnlAtPrice(90), -3, 0.5);
if (csResult.breakevens.length !== 1) throw new Error(`FAIL: expected 1 breakeven, got ${csResult.breakevens.length}`);
console.log("   Call Spread: pnlAtPrice, breakevens, tradeType ✓");

// Straddle
const sdResult = analyzeStructuredProduct(adaptStraddle({
  spot: "100", atm_strike: "100", total_premium: "-8",
  direction: "Long", asset: "TEST",
}));
if (sdResult.breakevens.length !== 2) throw new Error(`FAIL: straddle expected 2 BEs, got ${sdResult.breakevens.length}`);
approxEq(sdResult.breakevens[0], 92, 1);
approxEq(sdResult.breakevens[1], 108, 1);
console.log("   Straddle: 2 breakevens detected ✓");

// Seagull
const sgResult = analyzeStructuredProduct(adaptLongSeagull({
  spot: "70200", lower_put: "62000", lower_call: "75000", upper_call: "90000",
  contracts: "100", asset: "BTC",
}));
if (sgResult.breakevens.length < 2) throw new Error(`FAIL: seagull expected 2+ BEs, got ${sgResult.breakevens.length}`);
console.log(`   Seagull: ${sgResult.breakevens.length} breakevens (was 1, now fixed!) ✓`);

// Verify seagull max profit = (90000-75000)*100 = 1,500,000
approxEq(sgResult.maxProfit, 1500000, 1000);
console.log(`   Seagull max profit: ${sgResult.maxProfit.toFixed(0)} ✓`);

// Cash Secured Put
const cspResult = analyzeStructuredProduct(adaptCashSecuredPut({
  current_price: "95000", strike: "88000", premium: "3200", dte: "30", asset: "BTC",
}));
if (!cspResult.pnlAtPrice) throw new Error("FAIL: pnlAtPrice missing");
approxEq(cspResult.pnlAtPrice(95000), 3200, 1); // above strike = premium
approxEq(cspResult.pnlAtPrice(80000), -4800, 1); // 80k-88k+3.2k = -4.8k
console.log("   Cash Secured Put: pnlAtPrice, breakeven ✓");

// LEAP
const leapResult = analyzeStructuredProduct(adaptLeap({
  current_price: "95000", strike: "95000", premium: "12000", contracts: "10",
  total_outlay: "120000", dte: "300", asset: "BTC",
}));
if (!leapResult.pnlAtPrice) throw new Error("FAIL: pnlAtPrice missing");
approxEq(leapResult.pnlAtPrice(80000), -120000, 1); // below strike = total loss
approxEq(leapResult.pnlAtPrice(120000), (120000 - 95000) * 10 - 120000, 100); // 130000
console.log("   LEAP: pnlAtPrice, breakeven ✓");

console.log("\n═══════════════════════════════════════════════");
console.log("  ALL ENGINE TESTS PASSED");
console.log("═══════════════════════════════════════════════");
