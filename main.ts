// BTC dip-buyer v3 for make.fun btc-race-24h-20261111-0801 (agent-fun/bars-replay/v1).
//
// Strategy: long-only, one asset (CBBTC). Stays in cash through the drift and
// buys sharp dislocations, then sells the bounce. Three setups, first match
// wins (checked in order P1, P2, P3); one open position, full cash on entry.
//   - P1 (primary): the latest close is at least 85 bps below the close 90
//     bars ago, AND the same 90-minute return 4 bars ago was also at or
//     below -85 bps (the drop persisted for 4 bars, so it is not a 1-bar
//     wick). Exit TP +130 / SL -200. Cooldown 30 bars after a buy.
//   - P2 (deep drop): the 90-minute return is at or below -130 bps (no
//     confirm needed — a drop that deep is already a dislocation). It fires
//     a bar earlier than P1 at a lower price when the fall is steep. Exit
//     TP +140 / SL -200. Its lower TP (vs P1's +150) frees the capital in
//     time for P3 to trade the later dips.
//   - P3 (slow grind): only after 2 buys, the 240-minute return is at or
//     below -70 bps. The later dips of the day are slow grinds, not sharp
//     drops, so a 90-minute window misses them; the 4-hour window catches
//     them. Exit TP +78 / SL -150.
//   - Fallback (insurance for a quiet day): if no trade has been made yet
//     and 1000 bars have passed, buy on the original 60-minute rule
//     (return at or below -60 bps) with TP +50 / SL -150, so the bot still
//     trades at least once and clears the >=1-trade guardrail.
//   - Orders fill at the next bar's open; a full round trip costs about
//     26 bps (4 fee + 2 slippage + impact), so every entry needs a
//     dislocation larger than that and every exit a bounce larger than it.
//   - Deterministic: no clock, no environment, no unseeded random; the only
//     inputs are the hello and batch messages the harness sends.
//
// Dev grade (frozen 24h dev window, verified by grade-local): +$34.87 net,
// 8 fills (4 round trips, all won), max drawdown 1.00%, still +$29.93 at
// 2x fees. Parameter plateau: tp2 130-142, win3 240, drop3 68-72, tp3 76-80
// all score +$33-35, so the pick sits mid-plateau, not on a knife-edge.
// The v2 bot scored +$22.53, v1 +$8.56.
//
// Laid out like an entrant's repository: the grader runs `node /bot/main.ts`
// with this directory mounted at /bot; vendor/makefun-bars.ts is a
// byte-identical copy of the kit's sdk/makefun-bars.ts.

import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const WINDOW = 90; // bars for the P1/P2 dip window
const DROP_BPS = 85; // P1: buy when the 90-minute return is at or below -85 bps
const CONFIRM_BARS = 4; // P1: the drop must also have held this many bars ago
const TP_BPS = 130; // P1: sell when the close is 130 bps above the entry
const SL_BPS = 200; // P1/P2: sell when the close is 200 bps below the entry
const DEEP_DROP_BPS = 130; // P2: buy when the 90-minute return is at or below -130 bps
const TP2_BPS = 140; // P2: sell when the close is 140 bps above the entry
const LONG_WINDOW = 240; // bars for the P3 slow-grind window
const DROP3_BPS = 70; // P3: buy when the 240-minute return is at or below -70 bps
const TP3_BPS = 78; // P3: sell when the close is 78 bps above the entry
const SL3_BPS = 150; // P3: sell when the close is 150 bps below the entry
const COOLDOWN_BARS = 30; // bars to wait after a buy before another entry
const FB_BAR = 1000; // fallback: if no trade yet by this batch, relax the entry
const FB_WINDOW = 60; // fallback dip window
const FB_DROP_BPS = 60; // fallback dip threshold
const FB_TP_BPS = 50; // fallback take-profit
const FB_SL_BPS = 150; // fallback stop-loss
const MAX_SLIPPAGE_BPS = 1000;

/** Latest close per batch, as a float in USDC (price_scale 5). */
const closes: number[] = [];
let entry: number | null = null;
let entryTpBps = TP_BPS;
let entrySlBps = SL_BPS;
let lastBuyBar = -1e9;
let buys = 0;

function closeUsd(state: BarsState): number | null {
  const c = state.close(SYMBOL);
  const s = state.symbols.get(SYMBOL);
  if (c === null || s === undefined) return null;
  return Number(c) / 10 ** s.price_scale;
}

await runBars({
  onBatch(state, batch) {
    const close = closeUsd(state);
    if (close === null) return [];
    closes.push(close);
    const held = state.positions.get(SYMBOL);
    if (held !== undefined && entry !== null) {
      if (close >= entry * (1 + entryTpBps / 10000)) {
        entry = null;
        const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [sell];
      }
      if (close <= entry * (1 - entrySlBps / 10000)) {
        entry = null;
        const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [sell];
      }
      return [];
    }
    if (batch.seq - lastBuyBar < COOLDOWN_BARS) return [];
    const n = closes.length;
    const amt = state.cash;
    if (amt < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    // P1: sustained 90-minute drop.
    if (n >= WINDOW + CONFIRM_BARS + 1) {
      const ret90Bps = (close / closes[n - 1 - WINDOW] - 1) * 10000;
      const ret90AgoBps = (closes[n - 1 - CONFIRM_BARS] / closes[n - 1 - CONFIRM_BARS - WINDOW] - 1) * 10000;
      if (ret90Bps <= -DROP_BPS && ret90AgoBps <= -DROP_BPS) {
        entry = close;
        entryTpBps = TP_BPS;
        entrySlBps = SL_BPS;
        lastBuyBar = batch.seq;
        buys += 1;
        const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: amt, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [buy];
      }
    }
    // P2: deep 90-minute drop (no confirm needed).
    if (n >= WINDOW + 1) {
      const ret90Bps = (close / closes[n - 1 - WINDOW] - 1) * 10000;
      if (ret90Bps <= -DEEP_DROP_BPS) {
        entry = close;
        entryTpBps = TP2_BPS;
        entrySlBps = SL_BPS;
        lastBuyBar = batch.seq;
        buys += 1;
        const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: amt, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [buy];
      }
    }
    // P3: slow grind, only after 2 buys (240-minute window).
    if (buys >= 2 && n >= LONG_WINDOW + 1) {
      const ret240Bps = (close / closes[n - 1 - LONG_WINDOW] - 1) * 10000;
      if (ret240Bps <= -DROP3_BPS) {
        entry = close;
        entryTpBps = TP3_BPS;
        entrySlBps = SL3_BPS;
        lastBuyBar = batch.seq;
        buys += 1;
        const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: amt, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [buy];
      }
    }
    // Fallback: no trade yet and the day is mostly gone.
    if (buys === 0 && batch.seq >= FB_BAR && n >= FB_WINDOW + 1) {
      const ret60Bps = (close / closes[n - 1 - FB_WINDOW] - 1) * 10000;
      if (ret60Bps <= -FB_DROP_BPS) {
        entry = close;
        entryTpBps = FB_TP_BPS;
        entrySlBps = FB_SL_BPS;
        lastBuyBar = batch.seq;
        buys += 1;
        const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: amt, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [buy];
      }
    }
    return [];
  },
});
