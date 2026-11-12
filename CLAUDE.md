# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Production build
npm start        # Start production server
npm run lint     # Run ESLint
```

No test suite exists in this project.

## Architecture

Korean stock analysis app built with **Next.js App Router** (JavaScript, no TypeScript). Core features: AI-powered technical analysis, paper trading simulation, and prediction accuracy tracking.

### Tech Stack

- **Next.js 16** + React 19, App Router, `'use client'` on interactive components
- **Tailwind CSS 4** via PostCSS (`@tailwindcss/postcss`)
- **Firebase** (Firestore for user data/trades/history, Auth for login)
- **Lightweight Charts 5** for candlestick charts
- **OpenRouter API** for LLM-based stock analysis
- HTML scraping of Naver Finance/News via regex parsing (no cheerio)
- **Yahoo Finance 2** as fallback data source

Path alias: `@/*` maps to the project root (set in `jsconfig.json`).

### API Routes (`/app/api/`)

| Route | Purpose |
|-------|---------|
| `/api/stock` | Historical OHLC + current price (Naver primary, Yahoo fallback) |
| `/api/analyze` | 3-layer scoring engine → OpenRouter LLM → predictions |
| `/api/search` | Ticker/company name search |
| `/api/top` | Top 30 stocks by volume/amount/cap/rate |
| `/api/stock-detail` | 종목정보 탭 data (intro, sales mix, indicators, consensus, peers, disclosures) |
| `/api/news` | Naver News scraping |
| `/api/news/analyze` | News sentiment scoring |

### Analysis Engine (`/lib/analysisEngine.js` + `/app/api/analyze/route.js`)

The core of the app. The engine (pure functions in `lib/analysisEngine.js`) decides everything numeric from **daily bars**; the LLM only writes the explanations. The route overrides any prediction/target the LLM returns and fills missing text from `buildFallbackTexts()`.

- Each layer is normalized to -10..+10, then weighted:
  - **Tech** — RSI, MACD, MA alignment, Bollinger position, volume (direction-aware, intraday-adjusted), volume-profile support/resistance. RSI/Bollinger are dampened when they go against a clear MA trend.
  - **Quant** — 5-day return vs volatility (short-term reversal), 20-day VWAP gap, 1M/3M momentum, 52-week high/low proximity
  - **News** — keyword sentiment (phrases first, related articles only), blended with the LLM news-sentiment score when the user ran it
  - **Supply** (KR only, optional) — foreign + institution net buying as a share of volume (Toss data sent by the client)
- Weights: 35/40/25 (tech/quant/news) without supply, 30/35/15/20 with supply.
- Total score → sigmoid (k=0.12) → bullish/bearish probability.
- Per horizon (1d/5d/20d): signals are re-weighted by kind (reversion short, trend long), then P(up)/P(sideways)/P(down) is computed against the same hit band as `EVAL_BAND` (±1/2/4%) using recent daily volatility. Prediction = most likely outcome, confidence = its probability, target = volatility-based.

### Pages

- `/` — Main: stock search, chart, watchlist, AI analysis, paper trading
- `/invest` — Portfolio + trade history
- `/ranking` — User leaderboard by prediction accuracy
- `/scanner` — Technical screener
- `/wiki` — Stock encyclopedia
- `/history` — Analysis history + accuracy metrics
- `/admin` — Admin panel (role-gated)

### State & Data Flow

- `AuthContext` (`/lib/AuthContext.js`) — Firebase Auth wrapped in React Context
- Component-level `useState` for most UI state; no global state library
- Firestore stores: user profiles, holdings, trades, analysis history, watchlists
- Prediction evaluation in `/lib/evalUtils.js`: `addBusinessDays()`, `judgeResult()` (hit/miss band by horizon: 1d ±1%, 5d ±2%, 20d ±4%), `evalCloseFor()` (close on the due date), `calcAccuracy()`, `calcCalibration()`

### Conventions

- All UI text and analysis output is in Korean
- Mobile-first responsive layout with bottom navigation (`/components/BottomNav.js`)
- Emoji used as icons throughout (no image assets for icons)
- `Promise.all` for parallel API calls; 300ms debounce on search input
- Chart instance managed via `useRef` to prevent recreation on re-render
