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
  - **Supply** (KR only, optional) — foreign + institution net buying as a share of volume (Toss data sent by the client). Shown as a reference signal only (0 points) since the `/stats/supply-engine` comparison showed no gain; `runAnalysis({ scoreSupply: true })` restores the old 20% weighting for experiments.
- Weights: 35/40/25 (tech/quant/news); 30/35/15/20 only with `scoreSupply`.
- Total score → sigmoid (k=0.12) → bullish/bearish probability.
- Per horizon (1d/5d/20d): signals are re-weighted by kind (reversion short, trend long), then P(up)/P(sideways)/P(down) is computed against the same hit band as `EVAL_BAND` (±1/2/4%) using recent daily volatility. Prediction = most likely outcome, confidence = its probability, target = volatility-based.

### AI Trader

`/api/ai-trader/analyze` scores candidates with the same engine (`runAnalysis` on ~1y daily bars from `lib/yahooDaily.js`), not an LLM: score = 50 + total×5 ± 10 by the 1-week outlook; `BUY_THRESHOLD` (85, chosen from `/stats/buyscore`: the first score band where the 5-day +2% rate clearly beats the base without a higher −2% rate) and above is bought. The score/grade live in `lib/engineScore.js` (`buyScore`, `scoreGrade`) and the `/scanner` 지표 스캔 uses the same engine + score (no news), so scanner and AI trader always agree. Stops are ATR-based (−2ATR / +3ATR).

### Pages

- `/` — Main: stock search, chart, watchlist, AI analysis, paper trading. `app/page.js` keeps state, data loading and chart creation; the screen pieces live in `components/home/HomeScreen.js` and `components/stock/*` (PriceHero, ChartCard, OrderCard, AIAnalysisCard, MarketCard, NewsCard, StockModals) and receive everything as props.
- `/invest` — Portfolio + trade history
- `/ranking` — User leaderboard by prediction accuracy
- `/scanner` — Technical screener
- `/wiki` — Stock encyclopedia
- `/calendar` — Market calendar: KR/US holidays, FOMC/BOK/CPI/jobs, option expiries (static data in `lib/marketEvents.js`, covers through 2027 — refill yearly), plus earnings/dividend dates for wishlist + paper holdings via `/api/calendar-events` (Yahoo)
- `/history` — Analysis history + accuracy metrics
- `/similar` — 닮은꼴 차트: last 20 daily closes → most similar past 20-day windows (top-100 × 3y) via Oracle AI Vector Search in `collector/src/similar.js` (table `chart_shapes`, `VECTOR(20, FLOAT32)`, cosine distance, rebuilt after each daily pipeline) through gateway `/stats/similar`; overlays what happened next
- `/network` — 종목 관계 지도: daily-return correlation for every top-100 pair via Oracle `CORR()` (60/120/250 trading days) + average-linkage clusters (`collector/src/network.js`, gateway `/stats/network?days=`); shown as group cards (avg period return, members, bond strength) with a bottom-sheet heatmap, plus per-stock most/least correlated peers
- `/whales` — 고래 추적기: foreign/institution net buying in KRW (net shares × close) over 20/60/120 trading days per top-100 stock, top buys/sells and '조용히 모으는 중' (net bought, price ≤ +3%), detail sheet with price vs cumulative net-buy lines — `collector/src/whales.js`, gateway `/stats/whales?days=` + `/stats/whales/stock?code=&days=`
- `/admin` — Admin panel (role-gated)

### Shared modules (use these instead of re-implementing)

- `lib/indicators.js` — SMA/EMA/RSI/MACD/Bollinger/ATR/OBV (engine, deep-analysis, scanner)
- `lib/openrouter.js` — `askAI()` (free-model retry/fallback, deadline) + `parseJSON()`; every LLM call goes through it
- `lib/naver.js` — server-side Naver quote (`fetchNaverBasic`, `naverBasicRaw`); `lib/yahooDaily.js` — KR daily bars (KS/KQ)
- `lib/quotes.js` — client: `fetchKrQuotes`, `fetchHoldingQuotes` (KR Naver + US Toss + FX; pair with `toKrwView`)
- `lib/wishlist.js` — account watchlist (`profiles.wishlist`) load/save/toggle
- `lib/format.js` — `toNum`, `fmtWon`, `fmtQuote`; `kstDay` lives in `lib/evalUtils.js`

### VM services (Oracle Cloud, `jisu-willberich.duckdns.org`)

- `toss-gateway/` — Toss Open API proxy + WebSocket relay (owner-only, read-only). Auto-updates from `main` every minute.
- `collector/` — data collector into Oracle Autonomous DB: top-100 KR daily bars (3y backfill), Toss investor flow, engine signals for every date (= backtest, recomputed when engine files change), and 1-min AI-trader stop checks in market hours. Stats via gateway `/stats/*`: `backtest` + `experiment` (probability-param grid) → `components/BacktestCard.js` (default export = plain-language summary on `/history`; `BacktestDetails` = every table, in `/admin` 🧪 검증 tab); `buyscore` (scanner/AI-trader buy score 0~100 by bucket vs 5-day outcome — basis for `BUY_THRESHOLD` in `lib/engineScore.js`) → `BacktestCard`; `supply` (foreign+institution 5-day net buy ÷ volume, the engine's supply definition, by bucket and buy-score band × direction vs 5-day outcome; investor flow is backfilled once via Toss `until`/`nextUntil` paging, meta `flow_backfill`) → `BacktestCard`; `supply-engine` (`collector/src/supplyEngine.js`: engine run twice per date, without vs with the 20% supply layer the home analysis uses; hit/Brier/overconfidence per horizon + buy-score filters; computed in the background, `{pending}` while running) → `BacktestCard`; `screens` (foreign/institution net-buy streaks, near 52-week high; SQL window functions in `collector/src/screens.js`) → `components/DbScreens.js` in `/scanner`. Engine probability params (`PROB_PARAMS`, per horizon) were chosen from the experiment — re-run it before changing them. Runs from the repo checkout and imports `stock-analyzer/lib/analysisEngine.js`, `indicators.js`, `marketEvents.js` directly — keep those dependency-free ES modules.

### State & Data Flow

- `AuthContext` (`/lib/AuthContext.js`) — Firebase Auth wrapped in React Context
- Component-level `useState` for most UI state; no global state library
- Firestore stores: user profiles, holdings, trades, analysis history, watchlists
- Prediction evaluation in `/lib/evalUtils.js`: `addBusinessDays()`, `judgeResult()` (hit/miss band by horizon: 1d ±1%, 5d ±2%, 20d ±4%), `evalCloseFor()` (close on the due date), `calcAccuracy()`, `calcCalibration()`

### Conventions

- All UI text and analysis output is in Korean
- Shared UI pieces (card, segmented tabs, sheet, skeleton, avatar) in `components/ui.js`; page background `#F0F4F8`, cards radius 20
- Mobile-first responsive layout with bottom navigation (`/components/BottomNav.js`)
- Emoji used as icons throughout (no image assets for icons)
- `Promise.all` for parallel API calls; 300ms debounce on search input
- Chart instance managed via `useRef` to prevent recreation on re-render
