# BTC dip-buyer

A bot that trades Coinbase Wrapped BTC (cbBTC) on 1-minute on-chain prices for the make.fun bounty "Race a BTC trading bot live for 24 hours" (btc-race-24h-20261111-0801).

Long-only, one asset. It stays in cash through the drift and buys only a sharp 60-minute dislocation, then sells the bounce (take-profit 50 bps, stop-loss 150 bps). See main.ts.
