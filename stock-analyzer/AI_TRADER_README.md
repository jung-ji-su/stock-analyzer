# 🤖 AI 트레이더 구현 완료!

## 📦 생성된 파일들

```
app/
├── ai-trader/
│   └── page.js                    # AI 트레이더 메인 페이지 (3개 탭)
│
├── api/
│   └── ai-trader/
│       ├── stock-pool/route.js     # 종목 풀 생성 API
│       ├── analyze/route.js        # AI 판단 엔진 API
│       ├── execute/route.js        # 가상 매매 실행 API
│       └── cron/route.js           # 자동 실행 스케줄러

components/
└── BottomNav.js                   # 업데이트됨 (AI 메뉴 추가)

vercel.json                        # Cron 설정
```

---

## 🚀 설치 및 설정

### 1단계: 파일 복사

생성된 파일들을 프로젝트에 복사:

```bash
# ai-trader 페이지
cp ai-trader/page.js app/ai-trader/page.js

# API routes
mkdir -p app/api/ai-trader
cp api/ai-trader/stock-pool/route.js app/api/ai-trader/stock-pool/route.js
cp api/ai-trader/analyze/route.js app/api/ai-trader/analyze/route.js
cp api/ai-trader/execute/route.js app/api/ai-trader/execute/route.js
cp api/ai-trader/cron/route.js app/api/ai-trader/cron/route.js

# BottomNav 업데이트
cp components/BottomNav.js components/BottomNav.js

# Vercel 설정
cp vercel.json vercel.json
```

### 2단계: 환경 변수 추가

`.env.local` 파일에 추가:

```env
# 기존 환경 변수들...
OPENROUTER_API_KEY=your_openrouter_key
NEXT_PUBLIC_BASE_URL=https://stock-analyzer-opal-seven.vercel.app

# Vercel Cron 인증 (랜덤 문자열)
CRON_SECRET=your_random_secret_string_here
```

### 3단계: Firebase Firestore 규칙 업데이트

Firebase Console → Firestore Database → Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 기존 규칙들...
    
    // AI Trader
    match /aiTrader/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    match /aiTransactions/{docId} {
      allow read: if request.auth != null && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
    }
  }
}
```

### 4단계: 패키지 설치 (이미 있으면 skip)

```bash
npm install recharts lucide-react
```

---

## 🎯 사용 방법

### 초기 설정

1. 앱 실행 후 "AI" 메뉴 클릭
2. 최초 접속 시 자동으로 가상 계좌 생성 (1000만원)
3. AI 트레이더 활성화 상태 확인

### 수동 테스트

개발자 도구 Console에서:

```javascript
// 1. 종목 풀 생성 테스트
fetch('/api/ai-trader/stock-pool')
  .then(r => r.json())
  .then(console.log);

// 2. AI 매수 분석 테스트
fetch('/api/ai-trader/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'analyze_buy',
    candidates: [
      { code: '005930', name: '삼성전자', quantScore: 85 }
    ],
    holdings: []
  })
}).then(r => r.json()).then(console.log);

// 3. 매수 실행 테스트
fetch('/api/ai-trader/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'YOUR_USER_ID',
    action: 'buy',
    orders: [{
      code: '005930',
      name: '삼성전자',
      quantity: 10,
      aiScore: 82,
      aiReasons: ['테스트'],
    }]
  })
}).then(r => r.json()).then(console.log);
```

### Cron 작동 확인

Vercel Dashboard → Project → Cron Jobs:
- 평일 오전 8:30: 매수 스크리닝 실행
- 평일 오후 2:00: 매도 점검 실행

로그 확인:
```
Vercel Dashboard → Deployments → Functions → ai-trader/cron
```

---

## 📊 데이터 구조

### aiTrader Collection
```javascript
{
  userId: "user123",
  cash: 7000000,
  totalAsset: 10500000,
  holdings: [
    {
      code: "005930",
      name: "삼성전자",
      quantity: 50,
      avgPrice: 68000,
      buyDate: "2026-05-01",
      buyQuantScore: 85,
      aiScore: 82,
      aiReasons: ["반도체 섹터 강세", "..."]
    }
  ],
  status: {
    active: true,
    lastRun: "2026-05-08T08:30:00",
    nextRun: "2026-05-09T08:30:00",
    pauseReason: null
  },
  statistics: {
    totalTrades: 15,
    winRate: 0.65,
    avgProfit: 3.5,
    maxDrawdown: -8.0
  }
}
```

### aiTransactions Collection
```javascript
{
  userId: "user123",
  date: "2026-05-08T14:30:00",
  action: "sell",
  code: "005930",
  name: "삼성전자",
  price: 70000,
  quantity: 50,
  buyPrice: 68000,
  profitRate: 2.94,
  holdDays: 3,
  aiScore: 45,
  aiReason: "단기 과열 징후",
  triggerType: "AI" // or "auto_stop_loss", "auto_take_profit"
}
```

---

## 🔧 커스터마이징

### AI 판단 기준 변경

`app/api/ai-trader/analyze/route.js`:
- `getBuyAnalysisPrompt()`: 매수 판단 프롬프트 수정
- `getSellAnalysisPrompt()`: 매도 판단 프롬프트 수정

### 리스크 관리 규칙 변경

`app/api/ai-trader/execute/route.js`:
- 초기 자금: `cash: 10000000` 변경
- 매수 비중: `availableCash * 0.2` 변경 (현재 20%)

`app/api/ai-trader/analyze/route.js`:
- 손절선: `profitRate <= -7` 변경
- 익절선: `profitRate >= 20` 변경

### 실행 타이밍 변경

`vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/ai-trader/cron",
      "schedule": "30 8 * * 1-5"  // 평일 오전 8:30
    }
  ]
}
```

Cron 문법: `분 시 일 월 요일`
- `30 8 * * 1-5`: 평일 오전 8:30
- `0 14 * * 1-5`: 평일 오후 2:00
- `0 9 * * *`: 매일 오전 9:00

---

## 🐛 트러블슈팅

### 1. "현금 부족" 오류
- 초기 자금 확인: Firestore → aiTrader → cash
- 매수 비중 줄이기: `availableCash * 0.1`로 변경

### 2. Cron이 실행 안됨
- Vercel Dashboard에서 Cron 활성화 확인
- CRON_SECRET 환경 변수 설정 확인
- 로그 확인: Functions → ai-trader/cron

### 3. AI 분석 실패
- OPENROUTER_API_KEY 확인
- API 크레딧 잔액 확인
- 프롬프트 길이 확인 (너무 길면 실패)

### 4. 종목 데이터 없음
- yahoo-finance2 API 확인
- 종목 코드 형식: `005930.KS` (KOSPI), `005930.KQ` (KOSDAQ)

---

## 📈 다음 단계

### Phase 2: 고도화
- [ ] 실제 Quant Score API 연동
- [ ] 섹터별 모멘텀 계산
- [ ] 뉴스 감성 분석 추가
- [ ] Trailing Stop 구현

### Phase 3: UI 개선
- [ ] 실시간 차트 업데이트
- [ ] 푸시 알림 (매수/매도 시)
- [ ] 주간/월간 리포트 자동 생성
- [ ] 백테스팅 모드

---

## 🎉 완료!

AI 트레이더가 이제 작동합니다!

1. `/ai-trader` 페이지에서 성과 확인
2. 매일 자동으로 매수/매도 실행
3. 사람 vs AI 수익률 비교

궁금한 점이나 버그가 있으면 언제든지 말해주세요! 🚀
