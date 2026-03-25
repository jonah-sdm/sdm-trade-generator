// Unit tests for Covered Call computation — acceptance cases from ETH trade feedback
// Run: node src/coveredCall.test.js

import { computeTradeAnalysis } from "./payoffEngine.js";

const INPUTS = {
  asset: "ETH",
  holdings: "150",
  cost_basis: "2400",
  current_price: "2750",
  strike: "3200",
  expiry: "21 Jun 2026",
  dte: "28",
  premium: "6200",
  iv_rank: "62",
};

const analysis = computeTradeAnalysis("covered_call", INPUTS);

function approxEq(a, b, tol = 1) {
  if (Math.abs(a - b) > tol) {
    throw new Error(`FAIL: expected ${b}, got ${a} (diff ${Math.abs(a - b)})`);
  }
}

function exactEq(a, b) {
  if (a !== b) throw new Error(`FAIL: expected "${b}", got "${a}"`);
}

// --- Test headline metrics ---
console.log("=== Covered Call Acceptance Tests ===\n");

console.log("1. Core computed values");
const breakeven = analysis.breakevens[0];
approxEq(breakeven, 2358.67, 0.01);
console.log(`   breakeven = ${breakeven.toFixed(2)} ✓`);

approxEq(analysis.currentNotional, 412500, 1);
console.log(`   currentNotional = ${analysis.currentNotional} ✓`);

approxEq(analysis.costBasis, 2400, 0);
console.log(`   costBasis = ${analysis.costBasis} ✓`);

approxEq(analysis.spot, 2750, 0);
console.log(`   spot = ${analysis.spot} ✓`);

// --- Test metrics labels ---
console.log("\n2. Metric labels & formatting");
const premiumMetric = analysis.metrics.find(m => m.label === "Premium Income");
exactEq(premiumMetric.value, "$6,200");
console.log(`   Premium: ${premiumMetric.value} ✓`);

if (!premiumMetric.sub.includes("ann. premium yield")) throw new Error(`FAIL: sub should contain "ann. premium yield", got "${premiumMetric.sub}"`);
if (!premiumMetric.sub.startsWith("19.6%")) throw new Error(`FAIL: sub should start with "19.6%", got "${premiumMetric.sub}"`);
console.log(`   Annualized label: "${premiumMetric.sub}" ✓`);

const gainMetric = analysis.metrics.find(m => m.label === "Unrealized Gain");
exactEq(gainMetric.value, "$52,500");
console.log(`   Unrealized Gain: ${gainMetric.value} ✓`);

if (!gainMetric.sub.includes("IV Rank")) throw new Error(`FAIL: sub should contain "IV Rank", got "${gainMetric.sub}"`);
console.log(`   IV label: "${gainMetric.sub}" ✓`);

const beMetric = analysis.metrics.find(m => m.label === "Breakeven");
exactEq(beMetric.value, "$2,358.67");
console.log(`   Breakeven display: ${beMetric.value} ✓`);

// --- Test analytical pnlAtPrice function ---
console.log("\n3. Analytical P&L function (pnlAtPrice)");
if (!analysis.pnlAtPrice) throw new Error("FAIL: pnlAtPrice not present on analysis");

const units = 150;
const costBasis = 2400;
const strike = 3200;
const premiumTotal = 6200;
const currentNotional = 412500;

const scenarios = [
  { price: 1654,    expectedSpot: -111900, expectedStrategy: -105700, expectedDiff: 6200,   expectedRoN: -25.62 },
  { price: 2071,    expectedSpot: -49350,  expectedStrategy: -43150,  expectedDiff: 6200,   expectedRoN: -10.46 },
  { price: 2358.67, expectedSpot: -6199.5, expectedStrategy: 0.5,      expectedDiff: 6200,   expectedRoN: 0.00 },
  { price: 2489,    expectedSpot: 13350,   expectedStrategy: 19550,   expectedDiff: 6200,   expectedRoN: 4.74 },
  { price: 2750,    expectedSpot: 52500,   expectedStrategy: 58700,   expectedDiff: 6200,   expectedRoN: 14.23 },
  { price: 3046,    expectedSpot: 96900,   expectedStrategy: 103100,  expectedDiff: 6200,   expectedRoN: 24.99 },
  { price: 3464,    expectedSpot: 159600,  expectedStrategy: 126200,  expectedDiff: -33400, expectedRoN: 30.59 },
  { price: 3882,    expectedSpot: 222300,  expectedStrategy: 126200,  expectedDiff: -96100, expectedRoN: 30.59 },
];

for (const s of scenarios) {
  const pnl = analysis.pnlAtPrice(s.price);
  const spotPnl = (s.price - costBasis) * units;
  const diff = pnl - spotPnl;
  const ron = (pnl / currentNotional) * 100;

  approxEq(spotPnl, s.expectedSpot, 1);
  approxEq(pnl, s.expectedStrategy, 1);
  approxEq(diff, s.expectedDiff, 1);
  approxEq(ron, s.expectedRoN, 0.02);

  console.log(`   @ $${s.price}: spot=${spotPnl.toFixed(0)} strategy=${pnl.toFixed(0)} diff=${diff.toFixed(0)} RoN=${ron.toFixed(2)}% ✓`);
}

// --- Test that max P&L is capped correctly ---
console.log("\n4. Max P&L cap verification");
const maxPnl = analysis.pnlAtPrice(5000);
const expectedMax = (strike - costBasis) * units + premiumTotal; // 126200
approxEq(maxPnl, expectedMax, 0);
console.log(`   Max P&L at $5000 = ${maxPnl} (capped at ${expectedMax}) ✓`);

const maxPnl2 = analysis.pnlAtPrice(10000);
approxEq(maxPnl2, expectedMax, 0);
console.log(`   Max P&L at $10000 = ${maxPnl2} (still capped) ✓`);

console.log("\n=== ALL TESTS PASSED ===");
