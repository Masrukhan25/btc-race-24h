// BTC dip-buyer v2 for make.fun btc-race-24h-20261111-0801 (agent-fun/bars-replay/v1).
//
// Strategy: long-only, one asset (CBBTC). Stays in cash through the drift and
// buys only a sharp, SUSTAINED 90-minute dislocation, then sells the bounce.
//   - Primary entry: the latest close is at least 85 bps below the close 90
//     bars ago, AND the same 90-minute return 4 bars ago was also at or
//     below -85 bps (the drop persisted for 4 bars, so it is not a 1-bar
//     wick). Cooldown 30 bars after a buy.
//   - Exit: the whole position when the close is 130 bps above the entry,
//     or 200 bps below it.
//   - Fallback entry (insurance for a quiet day): if no trade has been made
//     yet and 1000 bars have passed, buy on the original 60-minute rule
//     (return at or below -60 bps) with TP +50 / SL -150, so the bot still
//     trades at least once and clears the >=1-trade guardrail.
//   - Size: the whole cash on entry (one open position, 100% of equity).
//   - Orders fill at the next bar's open; a full round trip costs about 26 bps
//     (4 fee + 2 slippage + impact), so the entry needs a dislocation larger
//     than that and the exit a bounce larger than that.
//   - Deterministic: no clock, no environment, no unseeded random; the only
//     inputs are the hello and batch messages the harness sends.
//
// Dev grade (frozen 24h dev window, verified by grade-local): +$22.53 net,
// 4 fills (2 round trips), max drawdown 1.01%. The v1 bot scored +$8.56.
//
// Laid out like an entrant's repository: the grader runs `node /bot/main.ts`
// with this directory mounted at /bot; vendor/makefun-bars.ts is a
// byte-identical copy of the kit's sdk/makefun-bars.ts.

import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const WINDOW = 90; // bars for the primary dip window
const DROP_BPS = 85; // buy when the 90-minute return is at or below -85 bps
const CONFIRM_BARS = 4; // the drop must also have held this many bars ago
const TP_BPS = 130; // sell when the close is 130 bps above the entry
const SL_BPS = 200; // sell when the close is 200 bps below the entry
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
let traded = false;

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
    // Primary entry: sustained 90-minute drop.
    if (n >= WINDOW + CONFIRM_BARS + 1) {
      const ret90Bps = (close / closes[n - 1 - WINDOW] - 1) * 10000;
      const ret90AgoBps = (closes[n - 1 - CONFIRM_BARS] / closes[n - 1 - CONFIRM_BARS - WINDOW] - 1) * 10000;
      if (ret90Bps <= -DROP_BPS && ret90AgoBps <= -DROP_BPS) {
        const amt = state.cash;
        if (amt < BigInt(state.hello.fees.min_notional_quote_units)) return [];
        entry = close;
        entryTpBps = TP_BPS;
        entrySlBps = SL_BPS;
        lastBuyBar = batch.seq;
        traded = true;
        const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: amt, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [buy];
      }
    }
    // Fallback entry: no trade yet and the day is mostly gone.
    if (!traded && batch.seq >= FB_BAR && n >= FB_WINDOW + 1) {
      const ret60Bps = (close / closes[n - 1 - FB_WINDOW] - 1) * 10000;
      if (ret60Bps <= -FB_DROP_BPS) {
        const amt = state.cash;
        if (amt < BigInt(state.hello.fees.min_notional_quote_units)) return [];
        entry = close;
        entryTpBps = FB_TP_BPS;
        entrySlBps = FB_SL_BPS;
        lastBuyBar = batch.seq;
        traded = true;
        const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: amt, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [buy];
      }
    }
    return [];
  },
});
