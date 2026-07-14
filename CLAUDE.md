# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

和谐交易顾问 (Harmonious Trading Advisor) — a single-page stock trading advisory dashboard. Pure frontend: HTML, vanilla CSS/JS, no framework. Fetches real-time A-share market data from EastMoney APIs, runs a three-pillar analysis engine (harmonic patterns + multi-factor scoring + statistical validation), and generates buy/hold/sell recommendations with position sizing.

## Commands

```bash
# Local development server (port 3000, or set PORT env var)
npm start

# Generate pre-baked market data for today (run before market open, 08:00+ CST)
npm run update

# Build a self-contained single-file HTML for sharing/deployment
bash build_bundle.sh          # outputs dist/index.html

# Deploy to GitHub Pages (after git commit)
git push
```

## Architecture

### Three-Pillar Analysis Engine

The core recommendation engine fuses three independent frameworks:

1. **Harmonic Pattern Detection** (`js/harmonic.js`) — ZigZag pivot detection → AB=CD and Gartley 222 pattern recognition with Fibonacci ratio matching. Returns confidence score, PRZ (potential reversal zone), stop-loss, and targets.

2. **Multi-Factor Scoring** (`js/factors.js`) — Weighted 5-factor model: Momentum (30%), Value/PE (20%), Quality/turnover stability (15%), Volatility/ATR (20%), Sentiment/volume ratio (15%). Every factor maps to 0-100.

3. **Statistical Validation** (`js/stats.js`) — Pearson correlation vs CSI 300, annualized Sharpe ratio (20-day), ATR-based dynamic position sizing. Pass/fail gate: Sharpe > 0.1 and position ≥ 50% of base.

These are fused with dynamic weights that shift based on anti-quant regime detection (`js/anti-quant.js`): in normal markets harmonic gets 40% weight; in high-quant regimes harmonic drops to 20% and anti-quant measures rise to 25%.

### Data Flow

```
EastMoney API (real-time)
  ├── ulist.np/get  → index prices, stock quotes
  ├── clist/get     → top-30 active stocks with PE, volume ratio
  └── kline/get     → daily OHLCV (60-70 bars for pattern detection)
        │
        ▼
  fetchIndices() / fetchStockKline() / apiFetchWithRetry()
        │
        ▼
  Three-Framework Analysis Pipeline
  (harmonic → factors → stats → anti-quant → weighted fusion)
        │
        ▼
  store.recommendations[] / store.positions[] / store.marketData[]
        │
        ▼
  UI rendering (ui.js → innerHTML with escapeHtml() XSS protection)
```

On API failure: multi-level fallback — live API → pre-generated `market_data.js` → hardcoded `FALLBACK_*` constants in `config.js`.

### JS Module Dependency Order

Scripts must load in this order (enforced by `<script>` tag order in `index.html`):

| Layer | Files | Depends On |
|-------|-------|------------|
| Config | `config.js` | nothing |
| Utils | `utils.js`, `store.js` | config |
| Engines | `harmonic.js`, `factors.js`, `stats.js`, `anti-quant.js` | utils (harmonic for ATR) |
| API | `api.js` | config, utils, store |
| UI | `ui.js`, `user-positions.js`, `backtest.js` | api, engines, store |
| Init | `init.js` | everything above |

All modules use `"use strict"` and share state through the global `store` object. Functions are declared in global scope (no ES modules) since scripts load via `<script>` tags with shared global namespace.

### Key Design Decisions

- **`escapeHtml()`** is mandatory for all DOM output. Every render function in `ui.js` and `user-positions.js` wraps external data (stock names, codes, API values) through it before inserting into innerHTML. Rationale texts from the analysis engine are the only exception — they are machine-generated HTML, not user input.

- **Correction factor loop**: Backtest results (`js/backtest.js`) feed back into the scoring pipeline via `applyCorrectionToScore()`. The factor ranges [-0.3, +0.3] and shifts the raw confluence score by up to ±30 points. Toggled on/off in the UI; persisted in localStorage.

- **Quant regime detection** (`js/anti-quant.js`) measures gap frequency, intraday reversal rate, volume CV, and fat-tail events from index K-lines. When `regime === 'high_quant'`, stop-losses widen to 3.0× ATR, position sizes get a 0.6× multiplier, and buy/hold signal thresholds rise.

- **Pre-generated data**: `update_data.js` is a Node script that runs the full analysis pipeline server-side and writes `market_data.js` as a static JS file. The browser loads this file if `pg.date === TODAY`, skipping live API calls. Triggered by cron or `npm run update`.

- **`dist/index.html`** is the bundled deployment artifact — all CSS and JS inlined into one file. Build with the script at `build_bundle.sh`. Both the source (multi-file) and bundled versions are committed; GitHub Pages serves from repo root.
