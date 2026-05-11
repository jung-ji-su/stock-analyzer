# 🚀 AI 트레이더 최종 배포 가이드

## 📦 파일 배치

### 1. API Routes 복사

```bash
# 종목 풀 생성 API
app/api/ai-trader/stock-pool/route.js

# AI 분석 API
app/api/ai-trader/analyze/route.js

# 매수/매도 실행 API
app/api/ai-trader/execute/route.js

# Cron 스케줄러 API
app/api/ai-trader/cron/route.js
```

### 2. 페이지 복사

```bash
# AI 트레이더 메인 페이지
app/ai-trader/page.js
```

### 3. BottomNav 업데이트

```bash
# 네비게이션 (AI 트레이더 메뉴 추가)
components/BottomNav.js
```

---

## 🔐 환경 변수 설정

`.env.local` 파일에 다음 추가:

```env
# OpenRouter API (이미 있음)
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxx

# Base URL (Vercel 배포 후 실제 URL로 변경)
NEXT_PUBLIC_BASE_URL=https://stock-analyzer-opal-seven.vercel.app

# Vercel Cron 인증 (랜덤 문자열 생성)
CRON_SECRET=ai_trader_2026_secret_xyz_YOUR_RANDOM_STRING
```

**CRON_SECRET 생성 방법:**
```bash
# 터미널에서 실행
openssl rand -base64 32
```

---

## 🔥 Firebase 규칙 업데이트

Firebase Console → Firestore Database → Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() {
      return request.auth != null &&
        get(/databases/$(database)/documents/profiles/$(request.auth.uid)).data.role == 'admin';
    }
    
    match /profiles/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
      allow delete: if isAdmin();
    }
    
    match /holdings/{docId} {
      allow read, write, delete: if request.auth != null;
    }
    
    match /trades/{docId} {
      allow read, write, delete: if request.auth != null;
    }
    
    match /analysisHistory/{docId} {
      allow read, write, delete: if request.auth != null;
    }
    
    // ✅ AI Trader (수정됨)
    match /aiTrader/{docId} {
      allow read, write, delete: if request.auth != null && 
        (resource == null || resource.data.userId == request.auth.uid);
      allow create: if request.auth != null && 
        request.resource.data.userId == request.auth.uid;
    }
    
    match /aiTransactions/{docId} {
      allow read: if request.auth != null && 
        (resource == null || resource.data.userId == request.auth.uid);
      allow create: if request.auth != null && 
        request.resource.data.userId == request.auth.uid;
    }
  }
}
```

---

## ⏰ Vercel Cron 설정

프로젝트 루트에 `vercel.json` 파일 생성:

```json
{
  "crons": [
    {
      "path": "/api/ai-trader/cron",
      "schedule": "30 8 * * 1-5"
    },
    {
      "path": "/api/ai-trader/cron?action=sell",
      "schedule": "0 14 * * 1-5"
    }
  ]
}
```

**스케줄 설명:**
- `30 8 * * 1-5`: 평일 오전 8:30 (매수 스크리닝)
- `0 14 * * 1-5`: 평일 오후 2:00 (매도 점검)

---

## 🚀 배포 순서

### 1. 로컬 테스트

```bash
# 개발 서버 실행
npm run dev

# 브라우저에서 확인
http://localhost:3000/ai-trader
```

### 2. Git 커밋 & 푸시

```bash
git add .
git commit -m "feat: AI 트레이더 완성 (안정화 버전)"
git push origin main
```

### 3. Vercel 환경 변수 설정

Vercel Dashboard → 프로젝트 → Settings → Environment Variables:

1. `OPENROUTER_API_KEY` 추가
2. `NEXT_PUBLIC_BASE_URL` 추가 (배포 후 실제 URL로)
3. `CRON_SECRET` 추가

### 4. Vercel 재배포

```bash
# Vercel CLI 사용 시
vercel --prod

# 또는 Vercel Dashboard에서 Redeploy 버튼 클릭
```

### 5. Cron 작동 확인

Vercel Dashboard → 프로젝트 → Cron Jobs:
- 2개의 Cron이 보여야 함
- 다음 실행 시간 확인

---

## ✅ 동작 확인 체크리스트

### 1. 종목 풀 생성 테스트

```javascript
fetch('/api/ai-trader/stock-pool')
  .then(r => r.json())
  .then(console.log);
```

**기대 결과:**
```json
{
  "success": true,
  "pool": {
    "totalCount": 25,
    "stocks": [...]
  }
}
```

### 2. AI 분석 테스트

```javascript
fetch('/api/ai-trader/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'analyze_buy',
    candidates: [
      { code: '005930', name: '삼성전자', quantScore: 85, sector: '반도체' }
    ],
    holdings: []
  })
}).then(r => r.json()).then(console.log);
```

**기대 결과:**
```json
{
  "success": true,
  "results": [
    {
      "aiAnalysis": {
        "score": 78,
        "reasons": [...]
      }
    }
  ]
}
```

### 3. 매수 실행 테스트

```javascript
const userId = 'YOUR_USER_ID';

fetch('/api/ai-trader/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: userId,
    action: 'buy',
    orders: [{
      code: '005930',
      name: '삼성전자',
      quantity: 10,
      aiScore: 78,
      aiReasons: ['테스트']
    }]
  })
}).then(r => r.json()).then(console.log);
```

**기대 결과:**
```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "message": "삼성전자 10주 매수 완료"
    }
  ]
}
```

### 4. 포트폴리오 조회 테스트

```javascript
fetch(`/api/ai-trader/execute?userId=${userId}`)
  .then(r => r.json())
  .then(console.log);
```

**기대 결과:**
```json
{
  "success": true,
  "portfolio": {
    "cash": 7315000,
    "holdings": [
      {
        "name": "삼성전자",
        "quantity": 10,
        "profitRate": 0
      }
    ],
    "cashRate": "73.2",
    "returnRate": "-26.85"
  }
}
```

---

## 🐛 트러블슈팅

### 문제 1: Cron이 실행 안됨

**확인:**
1. `vercel.json` 파일이 프로젝트 루트에 있는지
2. Vercel Dashboard → Cron Jobs에 표시되는지
3. `CRON_SECRET` 환경 변수가 설정되었는지

**해결:**
```bash
# Vercel 재배포
vercel --prod
```

### 문제 2: AI 분석 실패

**확인:**
1. `OPENROUTER_API_KEY`가 올바른지
2. OpenRouter 크레딧이 남아있는지
3. 모델명이 `openrouter/auto`인지

**해결:**
- API 키 재발급
- 크레딧 충전
- 로그 확인: Vercel Dashboard → Functions

### 문제 3: Firebase 권한 에러

**확인:**
1. Firestore Rules가 업데이트되었는지
2. `resource == null` 조건이 포함되었는지

**해결:**
Firebase Console에서 Rules 재배포

### 문제 4: 매수/매도 실패

**확인:**
1. userId가 올바른지
2. 현금이 충분한지
3. 보유 종목 수가 5개 미만인지

**해결:**
- Console 로그 확인
- Vercel Functions 로그 확인

---

## 📊 운영 가이드

### 일일 점검

**매일 오전 9시:**
- AI 매수 실행 결과 확인
- 포트폴리오 현황 확인

**매일 오후 2시 30분:**
- AI 매도 실행 결과 확인
- 수익률 변화 확인

### 주간 점검

**매주 월요일:**
- Vercel Cron 로그 확인
- OpenRouter API 사용량 확인
- Firebase Storage 용량 확인

### 긴급 중지

AI 트레이더 일시 중지:

```javascript
// Firebase Console에서 직접 수정
aiTrader/{userId}/status/active = false
```

---

## 🎯 다음 단계

### Phase 3: 고도화 (선택)

1. **실제 Quant Score API 연동**
2. **실시간 시세 조회 (Yahoo Finance)**
3. **섹터 모멘텀 계산**
4. **뉴스 감성 분석**
5. **백테스팅 모드**
6. **푸시 알림 (매수/매도 시)**

---

## 💡 최종 확인

- [ ] 모든 API Routes 복사 완료
- [ ] 환경 변수 설정 완료
- [ ] Firebase Rules 업데이트 완료
- [ ] vercel.json 생성 완료
- [ ] Vercel 배포 완료
- [ ] Cron Jobs 활성화 확인
- [ ] 로컬 테스트 통과
- [ ] 실전 매수 1회 성공

---

## 🎉 완료!

모든 설정이 완료되면 AI 트레이더가 자동으로 작동합니다!

- 평일 오전 8:30: 자동 매수
- 평일 오후 2:00: 자동 매도
- 실시간 대시보드에서 성과 확인

**문제 발생 시:**
1. Vercel Functions 로그 확인
2. Firebase Console 데이터 확인
3. 브라우저 Console 에러 확인

**성공!** 🚀
