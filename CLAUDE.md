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

- **Next.js 15** + React 19, App Router, `'use client'` on interactive components
- **Tailwind CSS 4** via PostCSS (`@tailwindcss/postcss`)
- **Firebase** (Firestore for user data/trades/history, Auth for login)
- **Lightweight Charts 5** for candlestick charts
- **OpenRouter API** for LLM-based stock analysis
- **Cheerio** for HTML scraping (Naver Finance, Naver News)
- **Yahoo Finance 2** as fallback data source

Path alias: `@/*` maps to the project root (set in `jsconfig.json`).

### API Routes (`/app/api/`)

| Route | Purpose |
|-------|---------|
| `/api/stock` | Historical OHLC + current price (Naver primary, Yahoo fallback) |
| `/api/analyze` | 4-layer scoring engine → OpenRouter LLM → predictions |
| `/api/search` | Ticker/company name search |
| `/api/top` | Top 30 stocks by volume/amount/cap/rate |
| `/api/stock-info` | Fundamentals (sector, PE, ROE, etc.) |
| `/api/investor` | Investor flow metrics |
| `/api/news` | Naver News scraping |
| `/api/news/analyze` | News sentiment scoring |

### Analysis Engine (`/app/api/analyze/route.js`)

The core of the app. Computes a weighted `totalScore` from 4 layers, passes it to OpenRouter for LLM prediction:

- **Layer 1 (30%)** — Technical: RSI, MACD, Bollinger Bands, MAs, Volume Profile
- **Layer 2 (40%)** — Quant: Z-Score, Stochastic RSI, VWAP, Momentum, ATR
- **Layer 3 (20%)** — News sentiment: keyword-based scoring
- **Layer 4 (10%)** — MTF: 5/20/60-day MA alignment

Score feeds into a sigmoid function → bullish/bearish probability + confidence %.

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
- Prediction evaluation in `/lib/evalUtils.js`: `addBusinessDays()`, `judgeResult()` (hit/miss at ±1%), `calcAccuracy()`

### Conventions

- All UI text and analysis output is in Korean
- Mobile-first responsive layout with bottom navigation (`/components/BottomNav.js`)
- Emoji used as icons throughout (no image assets for icons)
- `Promise.all` for parallel API calls; 300ms debounce on search input
- Chart instance managed via `useRef` to prevent recreation on re-render
