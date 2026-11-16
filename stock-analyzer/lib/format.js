// 숫자 변환·표기 공통 도우미
export const toNum = (v) => parseFloat(v) || 0; // 토스 응답처럼 숫자가 문자열로 오는 값 (없으면 0)
export const fmtWon = (n) => Math.round(n || 0).toLocaleString('ko-KR'); // 원 단위 정수 (단위 글자 없음)
export const fmtQuote = (p, us) => (us ? toNum(p).toFixed(2) : toNum(p).toLocaleString('ko-KR')); // 호가·체결가 (미국은 센트까지)
