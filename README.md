# BTC dip-buyer v2

A bot that trades Coinbase Wrapped BTC (cbBTC) on 1-minute on-chain prices for the make.fun bounty "Race a BTC trading bot live for 24 hours" (btc-race-24h-20261111-0801).

Long-only, one asset. It stays in cash through the drift and buys only a sharp, sustained 90-minute dislocation: the latest close at least 85 bps below the close 90 bars ago, and the same 90-minute return 4 bars ago also at or below -85 bps, so the drop is not a one-bar wick. It sells the bounce at take-profit +130 bps or stop-loss -200 bps. A fallback entry (60-minute drop of -60 bps, TP +50 / SL -150) fires only if no trade has been made by bar 1000, so the bot still trades at least once on a quiet day. See main.ts.

Dev grade on the kit's frozen 24-hour window (verified by grade-local): +$22.53 net PnL, 4 fills (2 round trips, both won), max drawdown 1.01%, still +$20.90 at double fees. The v1 bot scored +$8.56.
