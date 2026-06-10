# 📊 주식 AI 분석기

한국 주식 기술적 분석 + AI 예측 웹 앱.
실시간 차트, 다층 퀀트 스코어링, OpenRouter LLM 예측, 모의투자까지 통합 제공.

🔗 **Live Demo**: [stock-analyzer-opal-seven.vercel.app](https://stock-analyzer-opal-seven.vercel.app)

📄 **Portfolio**: [jung-ji-su.github.io/stock-analyzer/portfolio.html](https://jung-ji-su.github.io/stock-analyzer/portfolio.html)

---

## 🚀 빠른 시작

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # 프로덕션 빌드
npm run deploy   # git commit + push → Vercel 자동 배포
```

### 필수 환경변수 (`.env.local`)

```env
# OpenRouter (AI 분석 전체)
OPENROUTER_API_KEY=

# Naver 검색 API (뉴스)
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=

# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin (서버사이드)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# 기타
NEXT_PUBLIC_BASE_URL=https://your-domain.vercel.app
```

---

## 🗺 메뉴 구성

| 경로 | 이름 | 설명 |
|------|------|------|
| `/` | 📊 홈 (AI 분석) | 종목 검색·차트·AI 분석·모의거래 |
| `/deep-analysis` | 🔬 딥분석 | 15개 지표 + 수급 + 뉴스 통합 AI 리포트 |
| `/scanner` | 🔍 스캐너 | 기술적 조건 기반 종목 스크리닝 |
| `/briefing` | 📰 아침 브리핑 | 당일 시황 + AI 코멘트 |
| `/market-map` | 🗺 시장 지도 | 시가총액 트리맵 히트맵 |
| `/financial` | 💹 재무분석 | DART 재무제표 + AI 해석 |
| `/wiki` | 📚 테마 위키 | 테마/섹터별 종목 백과사전 |
| `/invest` | 💰 모의투자 | 포트폴리오 · 거래 내역 |
| `/history` | 🤖 AI 기록 | 예측 이력 + 적중률 통계 |
| `/ranking` | 🏆 랭킹 | 유저 예측 정확도 리더보드 |
| `/ai-trader` | 🤖 AI 트레이더 | 자동 매매 시뮬레이션 |
| `/admin` | ⚙️ 관리자 | 관리자 전용 (role-gated) |

---

## 🧩 핵심 기능 상세

### 1. 홈 — 종목 분석 (`/`)

- **종목 검색**: 300ms 디바운스, 자동완성, 최근 검색 기록
- **캔들스틱 차트**: Lightweight Charts v5, 일봉/주봉/월봉/년봉 전환
- **차트 오버레이** (토글 가능):
  - 📊 매물대 (Volume Profile) — 상위 5개 구간 강도별 시각화
  - 〰 이동평균선 MA 5/20/60
  - 🔵 볼린저 밴드 (20일, 2σ)
  - 🎯 VWAP (최근 20일)
  - 📏 기간 고점/저점 라인
- **실시간 현재가**: Naver 모바일 API → Yahoo Finance fallback
- **AI 분석** (3레이어 퀀트 스코어링):
  - Layer 1 (35%): 기술지표 — RSI, MACD, 볼린저밴드, MA, 거래량, 매물대
  - Layer 2 (40%): 퀀트팩터 — Z-Score, VWAP 이탈, 모멘텀, ATR
  - Layer 3 (25%): 뉴스 감성 키워드 스코어
  - Sigmoid 함수 → 상승/하락 확률 + 신뢰도 %
  - OpenRouter (Gemini 2.0 Flash) → 일봉·주봉·월봉 목표가 예측
  - 30초 타임아웃, 파싱 실패 시 퀀트 기반 Fallback 자동 적용
- **뉴스**: Naver 뉴스 API (화면용 5건 + AI 분석용 50건)
- **뉴스 AI 감성분석**: 긍정/부정/중립 점수 + 쉬운 설명
- **모의거래**: 시장가/지정가 매수·매도, 보유현황, 평단가 차트 표시
- **관심종목**: 위시리스트 등록·삭제, 등록가 대비 수익률 표시

---

### 2. 딥분석 (`/deep-analysis`)

15개 이상 지표 + 수급 + 뉴스를 통합한 프리미엄 AI 리포트.

| 지표 그룹 | 항목 |
|-----------|------|
| 이동평균 | MA5 / MA20 / MA60 / MA120 / MA200, 배열 상태 |
| 모멘텀 | RSI(14), Stochastic RSI, MACD / Signal / Histogram |
| 변동성 | 볼린저밴드(20, 2σ), ATR(14), MDD(1년) |
| 추세 | 일목균형표 (전환선·기준선·선행스팬A/B·구름대 성격) |
| 거래량 | OBV 추이 (매집/분산), 베타(vs KOSPI/KOSDAQ) |
| 수익률 | 1개월 / 3개월 / 6개월 / 12개월 |
| 지지·저항 | 피보나치 되돌림 (52주 기준), 피벗 포인트 R1/R2/S1/S2 |
| 수급 | 외국인·기관·개인 20일 순매수, 연속 매수/매도일 |
| 재무 | PER / Forward PER / PBR / ROE / 부채비율 / 영업이익률 |
| 뉴스 | 최근 7일 헤드라인 |

AI 리포트 구성: 기술분석 · 수급분석 · 뉴스감성 · 독자 인사이트 · 최종 판단 (1주일/1개월 목표가, 손절가)

---

### 3. 스캐너 (`/scanner`)

- KRX 전체 종목 대상 기술적 조건 필터링
- RSI, MACD, MA 배열, 볼린저밴드, 거래량 비율 등 다중 조건 조합
- 관심 종목 즐겨찾기 (`FavoritesContext`)
- Toast 알림

---

### 4. 아침 브리핑 (`/briefing`)

- Vercel Cron (매일 오전 8시 KST): KOSPI·KOSDAQ 지수 + 상승률 상위 + 뉴스 + AI 코멘트 자동 생성
- Firestore 캐시 (당일 재요청 시 즉시 반환)
- 홈 화면 상단 미니 브리핑 위젯

---

### 5. 시장 지도 (`/market-map`)

- 시가총액 기반 트리맵 히트맵
- 섹터별 그룹핑, 등락률 색상 시각화 (상승=빨강, 하락=파랑)
- `MarketTreemap` 컴포넌트 분리

---

### 6. 재무분석 (`/financial`)

- DART 전자공시 API: 코드 매핑 캐시 (`dartCorpCache`)
- 재무제표 (매출·영업이익·순이익·부채비율) 차트 시각화
- AI 재무 해석 (OpenRouter)
- 즐겨찾기 연동

---

### 7. 테마 위키 (`/wiki`)

- IT(반도체·AI·2차전지 등) / BIO / 산업재 / 소비 / 그린 / 금융 / 모빌리티 / 농업 8개 대분류
- 테마별 주요 종목, 수혜 조건, 투자 타이밍 설명
- 종목 클릭 → 홈 분석 페이지 연결

---

### 8. 모의투자 (`/invest`)

- Firebase Firestore: `holdings`, `trades`, `profiles` 컬렉션
- 초기 자본금 1,000만원, 시장가/지정가 매수·매도
- 포트폴리오 현황 (평가금액, 수익률, 보유주수)
- 거래 내역 전체 조회

---

### 9. AI 기록·적중률 (`/history`)

- 분석 시 Firestore `analysisHistory` 자동 저장
- 예측 평가: `addBusinessDays()` 기준 1일/5일/20일 후 실제 가격 비교
- `judgeResult()`: ±1% 이내 적중 판정
- `calcAccuracy()`: 전체 적중률 계산

---

### 10. 랭킹 (`/ranking`)

- 전 유저 예측 적중률 순위
- 분석 횟수 / 적중 횟수 / 정확도 % 표시

---

### 11. AI 트레이더 (`/ai-trader`)

- 퀀트 조건으로 종목 풀 선정 (`/api/ai-trader/stock-pool`)
- 기술지표 조회 후 OpenRouter AI 매수 판단 (점수 75+ 매수)
- 손절가(-7%) / 익절가(+20%) 자동 설정
- Vercel Cron 기반 자동 실행 (평일 장 시작/마감 전)
- 실시간 수익률, 보유 종목, 거래 이력 시각화 (Recharts)

---

## 🗄 API 라우트 정리

| 경로 | 메서드 | 설명 |
|------|--------|------|
| `/api/stock` | GET | 캔들 OHLCV + 현재가 (Naver+Yahoo) |
| `/api/analyze` | POST | 3레이어 퀀트 + AI 예측 |
| `/api/deep-analysis` | GET | 15개 지표 + 수급 + AI 리포트 |
| `/api/search` | GET | 종목명/코드 검색 |
| `/api/top` | GET | 거래량/거래대금/시총/등락률 상위 30 |
| `/api/stock-info` | GET | 기업 기본정보 + 재무지표 + AI 번역 |
| `/api/investor` | GET | 외국인·기관·개인 수급 |
| `/api/news` | GET | Naver 뉴스 (5건 표시 + 50건 AI용) |
| `/api/news/analyze` | POST | 뉴스 AI 감성분석 |
| `/api/financial` | GET | DART 재무제표 |
| `/api/morning-brief` | GET | 당일 시황 브리핑 (캐시) |
| `/api/morning-brief/cron` | GET | 브리핑 자동 생성 (Vercel Cron) |
| `/api/market-overview` | GET | 시장 전체 개요 데이터 |
| `/api/technical-indicators` | GET | 스캐너용 기술지표 |
| `/api/naver-stock` | GET | Naver 주가 전용 API |
| `/api/ai-trader/analyze` | POST | AI 매수·매도 판단 |
| `/api/ai-trader/execute` | POST | 매매 실행 |
| `/api/ai-trader/cron` | GET | AI 트레이더 자동 실행 |
| `/api/ai-trader/stock-pool` | GET | 매수 후보 종목 풀 |
| `/api/ai-trader/check-stops` | POST | 손절·익절 체크 |
| `/api/ai-trader/reset` | POST | AI 트레이더 초기화 |
| `/api/ai-trader/manual-start` | POST | 수동 트리거 |
| `/api/daily-snapshot` | GET | 일일 스냅샷 저장 |

---

## 🏗 아키텍처

```
stock-analyzer/
├── app/
│   ├── page.js                  # 홈 (차트·AI분석·모의거래)
│   ├── deep-analysis/page.js    # 딥분석
│   ├── scanner/page.js          # 기술적 스캐너
│   ├── briefing/page.js         # 아침 브리핑
│   ├── market-map/page.js       # 시장 지도 (트리맵)
│   ├── financial/page.js        # 재무분석
│   ├── wiki/page.js             # 테마 위키
│   ├── invest/page.js           # 모의투자
│   ├── history/page.js          # AI 예측 기록
│   ├── ranking/page.js          # 랭킹
│   ├── ai-trader/page.js        # AI 자동매매
│   └── api/                     # API 라우트 (위 표 참고)
├── components/
│   ├── BottomNav.js             # 하단 네비게이션
│   ├── MarketTreemap.js         # 트리맵 컴포넌트
│   ├── AILoadingModal.js        # AI 로딩 모달
│   └── Toast.js                 # 토스트 알림
├── lib/
│   ├── firebase.js              # Firebase 클라이언트
│   ├── firebase-admin.js        # Firebase Admin (서버사이드)
│   ├── AuthContext.js           # 인증 컨텍스트
│   ├── FavoritesContext.js      # 즐겨찾기 컨텍스트
│   ├── evalUtils.js             # 예측 평가 유틸 (addBusinessDays, judgeResult)
│   └── krx-cache.js             # KRX 데이터 캐시
└── vercel.json                  # Cron 스케줄 설정
```

---

## 🛠 기술 스택

| 분류 | 기술 |
|------|------|
| 프레임워크 | Next.js 15 (App Router) + React 19 |
| 스타일링 | Tailwind CSS 4 (PostCSS) |
| 애니메이션 | Framer Motion |
| 차트 | Lightweight Charts v5 (캔들), Recharts (재무·수익률) |
| DB / Auth | Firebase Firestore + Firebase Auth |
| AI | OpenRouter API (Gemini 2.0 Flash, `openrouter/auto` fallback) |
| 주가 데이터 | Naver Finance API (현재가), Yahoo Finance 2 (OHLCV) |
| 공시 데이터 | DART 전자공시 API |
| 뉴스 | Naver 검색 API |
| HTML 파싱 | Cheerio, iconv-lite (EUC-KR 디코딩) |
| 배포 | Vercel (자동 배포 + Cron Jobs) |

---

## ⏱ Vercel Cron 스케줄

| 경로 | 스케줄 (UTC) | 설명 |
|------|-------------|------|
| `/api/morning-brief/cron` | `0 23 * * 0-4` | 매일 오전 8시 KST 브리핑 생성 |
| `/api/ai-trader/cron` | `30 8 * * 1-5` | 오후 5시 30분 KST AI 매수 실행 |
| `/api/ai-trader/cron` | `0 14 * * 1-5` | 오후 11시 KST AI 포지션 점검 |
| `/api/ai-trader/daily-snapshot` | `0 15 * * 1-5` | 자정 KST 일일 스냅샷 저장 |

---

## 🗃 Firestore 컬렉션

| 컬렉션 | 용도 |
|--------|------|
| `profiles` | 유저 프로필 (현금, 관심종목) |
| `holdings` | 보유 종목 (`{uid}_{symbol}` 키) |
| `trades` | 거래 내역 |
| `analysisHistory` | AI 예측 이력 + 평가 결과 |
| `briefings` | 아침 브리핑 캐시 (날짜별) |
| `dartCorpCache` | DART 종목 코드 캐시 |
