# 📈 Stock Analyzer

> AI 기반 한국 주식 시장 분석 플랫폼

🔗 **Live Demo**: [stock-analyzer-opal-seven.vercel.app](https://stock-analyzer-opal-seven.vercel.app)

## 📋 프로젝트 개요

개인 투자자들이 데이터 기반으로 합리적인 투자 결정을 내릴 수 있도록 돕는 웹 애플리케이션입니다. AI 기술과 퀀트 분석을 결합하여 객관적인 종목 평가 시스템을 제공합니다.

### 🎯 핵심 가치

- **데이터 기반 의사결정**: 감정이 아닌 수치와 지표를 통한 종목 분석
- **AI 인사이트**: 대량의 시장 데이터를 AI가 분석하여 방향성 제시
- **효율적인 스크리닝**: 수천 개 종목 중 조건에 맞는 종목 빠른 필터링

## ✨ 주요 기능

### 1. AI 주가 분석
- OpenRouter API를 활용한 종목별 단기 방향성 예측
- 기술적 지표와 패턴 분석 기반 근거 제시
- 상승/하락/보합 방향성과 신뢰도 표시

### 2. Quant 스코어링 시스템
- 여러 재무/기술적 지표를 종합한 정량 평가
- 데이터 중심의 객관적인 종목 비교 분석
- 맞춤형 가중치 설정 가능

### 3. 종목 스캐너
- 실시간 종목 스크리닝 및 필터링
- 다양한 조건 조합으로 종목 탐색
- 빠른 정렬 및 비교 기능

### 4. Volume Profile 차트
- 가격대별 거래량 분포 시각화
- 주요 지지/저항 구간 파악
- 시장 참여자들의 심리 분석

## 🛠 기술 스택

### Frontend
- **Next.js 14** (App Router) - 최신 React 프레임워크
- **TypeScript** - 타입 안정성 및 개발 생산성
- **Tailwind CSS** - 효율적인 스타일링
- **lightweight-charts** - 고성능 차트 라이브러리

### Backend & Infrastructure
- **Firebase Authentication** - 안전한 사용자 인증
- **Firestore** - NoSQL 데이터베이스
- **Vercel** - CI/CD 자동화 배포

### Data & AI
- **OpenRouter API** - AI 분석 엔진
- **yahoo-finance2** - 글로벌 시장 데이터
- **Naver Finance API** - 한국 주식 실시간 데이터

## 💡 핵심 기술 구현

### 1. 한국 주식 데이터 처리
한국 주식 시장의 특수성을 고려한 데이터 파이프라인 구축

```javascript
// Naver Mobile JSON API를 활용한 정확한 한글 종목명 처리
const naverUrl = `https://m.stock.naver.com/api/stock/${ticker}/basic`;
const response = await fetch(naverUrl);
const data = await response.json();
const koreanName = data.stockName;
```

**해결한 문제**: Yahoo Finance API는 한글 종목명을 제공하지 않아 사용자 경험 저하  
**솔루션**: Naver API와 Yahoo Finance API를 조합하여 완전한 데이터 제공

### 2. Yahoo Finance v3 마이그레이션
라이브러리 버전 업그레이드 과정에서 Breaking Change 대응

```javascript
import YahooFinance from 'yahoo-finance2';

// v3 정식 지원 import 패턴 적용
const quote = await YahooFinance.quote('005930.KS');
const historical = await YahooFinance.historical(ticker, options);
```

**해결한 문제**: yahoo-finance2 v3 업데이트 시 기존 코드 호환성 문제  
**솔루션**: 공식 문서 분석 및 정확한 import 패턴 적용으로 안정성 확보

### 3. AI 예측 정확도 개선
초기 모델의 방향성 예측 오류 수정

**해결한 문제**: AI가 가격 변화 방향을 반대로 예측하는 버그  
**솔루션**: 프롬프트 엔지니어링 개선 및 응답 파싱 로직 재설계

## 🏗 아키텍처

```
stock-analyzer/
├── app/
│   ├── (auth)/              # 인증 관련 페이지
│   ├── scanner/             # 종목 스캐너
│   ├── chart/               # 차트 분석
│   ├── api/                 # API 라우트
│   └── layout.tsx           # 글로벌 레이아웃
├── components/
│   ├── ui/                  # 공통 UI 컴포넌트
│   ├── charts/              # 차트 컴포넌트
│   └── navigation/          # 네비게이션
├── lib/
│   ├── firebase/            # Firebase 설정
│   ├── api/                 # 외부 API 클라이언트
│   └── utils/               # 유틸리티 함수
└── types/                   # TypeScript 타입 정의
```

## 🚀 배포 및 CI/CD

- **플랫폼**: Vercel
- **자동 배포**: `main` 브랜치 push 시 프로덕션 배포
- **Preview 환경**: PR 생성 시 자동 Preview URL 생성
- **환경 변수 관리**: Vercel Dashboard를 통한 안전한 시크릿 관리

## 📊 프로젝트 성과

- ✅ Next.js 14 App Router를 활용한 모던 웹 아키텍처 구현
- ✅ Firebase 연동으로 안전한 사용자 인증 시스템 구축
- ✅ 복잡한 외부 API 통합 및 데이터 파이프라인 설계
- ✅ AI 모델 통합 및 프롬프트 엔지니어링 경험
- ✅ 반응형 UI/UX 및 모바일 최적화
- ✅ Vercel CI/CD 파이프라인 구축

## 🔧 개발 환경 설정

```bash
# 저장소 클론
git clone https://github.com/jung-ji-su/stock-analyzer.git
cd stock-analyzer

# 의존성 설치
npm install

# 환경 변수 설정 (.env.local)
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
OPENROUTER_API_KEY=your_openrouter_key

# 개발 서버 실행
npm run dev
```

## 📄 라이선스

MIT License

---

**Disclaimer**: 본 프로젝트는 교육 및 연구 목적으로 개발되었으며, 투자 조언을 제공하지 않습니다.
