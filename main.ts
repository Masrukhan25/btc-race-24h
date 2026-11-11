// BTC dip-buyer for make.fun btc-race-24h-20261111-0801 (agent-fun/bars-replay/v1).
//
// Strategy: long-only, one asset (CBBTC). Stays in cash through the drift and
// buys only a sharp 60-minute dislocation, then sells the bounce.
//   - Entry: the latest close is at least DROP_BPS below the close 60 bars ago
//     (a 60-minute drop), and at least COOLDOWN_BARS since the last buy.
//   - Exit: the whole position when the close is TP_BPS above the entry, or
//     SL_BPS below it.
//   - Size: the whole cash on entry (one open position, 100% of equity).
//   - Orders fill at the next bar's open; a full round trip costs about 26 bps
//     (4 fee + 2 slippage + impact), so the entry needs a dislocation larger
//     than that and the exit a bounce larger than that.
//   - Deterministic: no clock, no environment, no unseeded random; the only
//     inputs are the hello and batch messages the harness sends.
//
// Laid out like an entrant's repository: the grader runs `node /bot/main.ts`
// with this directory mounted at /bot; vendor/makefun-bars.ts is a
// byte-identical copy of the kit's sdk/makefun-bars.ts.

import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const DROP_BPS = 60; // buy when the 60-minute return is at or below -60 bps
const TP_BPS = 50; // sell when the close is 50 bps above the entry
const SL_BPS = 150; // sell when the close is 150 bps below the entry
const COOLDOWN_BARS = 30; // bars to wait after a buy before another entry
const MAX_SLIPPAGE_BPS = 1000;

/** Latest close per batch, as a float in USDC (price_scale 5). */
const closes: number[] = [];
let entry: number | null = null;
let lastBuyBar = -1e9;

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
      if (close >= entry * (1 + TP_BPS / 10000)) {
        entry = null;
        const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [sell];
      }
      if (close <= entry * (1 - SL_BPS / 10000)) {
        entry = null;
        const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [sell];
      }
      return [];
    }
    if (closes.length < 61) return [];
    if (batch.seq - lastBuyBar < COOLDOWN_BARS) return [];
    const ret60Bps = (close / closes[closes.length - 61] - 1) * 10000;
    if (ret60Bps <= -DROP_BPS) {
      const amt = state.cash;
      if (amt < BigInt(state.hello.fees.min_notional_quote_units)) return [];
      entry = close;
      lastBuyBar = batch.seq;
      const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: amt, max_slippage_bps: MAX_SLIPPAGE_BPS };
      return [buy];
    }
    return [];
  },
});
