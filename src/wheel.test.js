// Unit tests for Wheel strategy computation — acceptance cases from BTC wheel report feedback
// Run: node src/wheel.test.js

import { computeTradeAnalysis } from "./payoffEngine.js";

const INPUTS = {
  asset: "BTC",
  current_price: "95000",
  current_phase: "Selling Covered Calls",
  original_strike: "88000",
  cost_basis: "82000",       // Already adjusted for historical premium
  total_premium: "9500",     // Informational — NOT used in P&L
  current_premium: "4200",   // Current cycle premium — the only additive income
  current_strike: "100000",
  cycles_completed: "3",
  annualized_return: "32",
};

const analysis = computeTradeAnalysis("wheel", INPUTS);

function approxEq(a, b, tol = 1) {
  if (Math.abs(a - b) > tol) {
    throw new Error(`FAIL: expected ${b}, got ${a} (diff ${Math.abs(a - b)})`);
  }
}

function exactEq(a, b) {
  if (a !== b) throw new Error(`FAIL: expected "${b}", got "${a}"`);
}

console.log("=== Wheel Strategy Acceptance Tests ===\n");

// --- 1. Verify no double-counting ---
console.log("1. Core values — no premium double-counting");

// Breakeven = adjBasis - currentPremium = 82000 - 4200 = 77800
const breakeven = analysis.breakevens[0];
approxEq(breakeven, 77800, 1);
console.log(`   breakeven = ${breakeven} (82000 - 4200 = 77800) ✓`);

// Max profit = (strike - adjBasis) + currentPremium = (100000 - 82000) + 4200 = 22200
// NOT 31700 (which was the old double-counted value)
const maxProfitMetric = analysis.metrics.find(m => m.label === "Max Profit");
if (!maxProfitMetric) throw new Error("FAIL: Max Profit metric not found");
exactEq(maxProfitMetric.value, "$22,200");
console.log(`   maxProfit = ${maxProfitMetric.value} (should be $22,200 NOT $31,700) ✓`);

// --- 2. Verify pnlAtPrice analytical function ---
console.log("\n2. Analytical P&L function");
if (!analysis.pnlAtPrice) throw new Error("FAIL: pnlAtPrice not present");

// Below strike: pnl = (price - 82000) + 4200
const pnlAt70k = analysis.pnlAtPrice(70000);
approxEq(pnlAt70k, (70000 - 82000) + 4200, 1); // -7800
console.log(`   @ $70,000: P&L = ${pnlAt70k} (expected -7800) ✓`);

const pnlAt82k = analysis.pnlAtPrice(82000);
approxEq(pnlAt82k, 4200, 1); // exactly current premium
console.log(`   @ $82,000 (adj basis): P&L = ${pnlAt82k} (expected 4200) ✓`);

const pnlAt95k = analysis.pnlAtPrice(95000);
approxEq(pnlAt95k, (95000 - 82000) + 4200, 1); // 17200
console.log(`   @ $95,000 (spot): P&L = ${pnlAt95k} (expected 17200) ✓`);

// Above strike: capped
const pnlAt100k = analysis.pnlAtPrice(100000);
approxEq(pnlAt100k, (100000 - 82000) + 4200, 1); // 22200
console.log(`   @ $100,000 (strike): P&L = ${pnlAt100k} (expected 22200) ✓`);

const pnlAt120k = analysis.pnlAtPrice(120000);
approxEq(pnlAt120k, 22200, 1); // capped at 22200
console.log(`   @ $120,000 (above strike): P&L = ${pnlAt120k} (still capped at 22200) ✓`);

// At breakeven
const pnlAtBe = analysis.pnlAtPrice(77800);
approxEq(pnlAtBe, 0, 1);
console.log(`   @ $77,800 (breakeven): P&L = ${pnlAtBe} (expected ~0) ✓`);

// --- 3. Verify return on notional ---
console.log("\n3. Return on notional");
const notional = 95000; // 1 BTC
const ronAt95k = (pnlAt95k / notional) * 100;
approxEq(ronAt95k, 18.11, 0.1); // 17200/95000 = 18.1%
console.log(`   @ $95,000: RoN = ${ronAt95k.toFixed(2)}% (NOT 2.80%) ✓`);

// --- 4. Verify metrics labels ---
console.log("\n4. Metric labels");
const adjBasisMetric = analysis.metrics.find(m => m.label === "Adj. Cost Basis");
if (!adjBasisMetric) throw new Error("FAIL: Adj. Cost Basis metric not found");
exactEq(adjBasisMetric.value, "$82,000");
console.log(`   Adj. Cost Basis: ${adjBasisMetric.value} ✓`);
if (!adjBasisMetric.sub.includes("88,000")) throw new Error(`FAIL: sub should reference original strike, got "${adjBasisMetric.sub}"`);
console.log(`   Sub shows original: "${adjBasisMetric.sub}" ✓`);

const premMetric = analysis.metrics.find(m => m.label === "Current Premium");
if (!premMetric) throw new Error("FAIL: Current Premium metric not found");
exactEq(premMetric.value, "$4,200");
console.log(`   Current Premium: ${premMetric.value} ✓`);
if (!premMetric.sub.includes("9,500")) throw new Error(`FAIL: sub should show total collected, got "${premMetric.sub}"`);
console.log(`   Sub shows total: "${premMetric.sub}" ✓`);

// --- 5. Verify the old wrong values are NOT present ---
console.log("\n5. Regression checks — old wrong values must NOT appear");

// Old breakeven was 68300 (triple-counted premium)
if (Math.abs(breakeven - 68300) < 100) throw new Error("FAIL: breakeven is still 68300 (triple-counted)");
console.log(`   breakeven ≠ 68300 ✓`);

// Old max profit was 31700 (double-counted premium)
if (maxProfitMetric.value === "$31,700") throw new Error("FAIL: max profit is still $31,700 (double-counted)");
console.log(`   maxProfit ≠ $31,700 ✓`);

// Old effective basis was 72500 (costBasis - totalPremium, which is wrong)
const allMetricValues = analysis.metrics.map(m => m.value + " " + (m.sub || "")).join(" ");
if (allMetricValues.includes("72,500")) throw new Error("FAIL: $72,500 still appears (costBasis - totalPremium double-count)");
console.log(`   $72,500 does not appear anywhere ✓`);

console.log("\n=== ALL WHEEL TESTS PASSED ===");
