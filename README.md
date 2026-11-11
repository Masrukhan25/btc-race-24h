# BTC dip-buyer v3

Dip-buyer for the make.fun bounty "Race a BTC trading bot live for 24 hours"
(btc-race-24h-20261111-0801). Long-only cbBTC vs USDC, $1,000 paper, 1-minute
bars, full cash per trade, one open position at a time.

Three setups, first match wins:

- **P1** — sustained 90-minute drop: close down ≥85 bps vs 90 bars ago, and
  the same 90-minute return 4 bars ago also ≤ -85 bps. Exit TP +130 / SL -200.
- **P2** — deep drop: 90-minute return ≤ -130 bps (no confirm needed).
  Fires a bar earlier than P1 at a lower price on steep falls. Exit TP +140 /
  SL -200; the lower TP frees capital in time for P3.
- **P3** — slow grind, only after 2 buys: 240-minute return ≤ -70 bps.
  The later dips of the day are slow grinds, so a 90-minute window misses
  them; the 4-hour window catches them. Exit TP +78 / SL -150.
- **Fallback** — if no trade by bar 1000, buy on the 60-minute rule
  (drop ≥60 bps, TP +50 / SL -150) so the bot always trades at least once.

30-bar cooldown after a buy. Deterministic: fixed rules, no clock, no
unseeded randomness.

Dev grade (frozen 24h dev window, verified by grade-local): **+$34.87 net**,
8 fills (4 round trips, all won), max drawdown 1.00%, still +$29.93 at 2x
fees. Parameter plateau (tp2 130–142, win3 240, drop3 68–72, tp3 76–80)
scores +$33–35, so the pick sits mid-plateau. v2 scored +$22.53, v1 +$8.56.

Run: the grader runs `node /bot/main.ts`; `vendor/makefun-bars.ts` is a
byte-identical copy of the kit's SDK.
