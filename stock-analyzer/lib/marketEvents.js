// 증시 일정: 휴장일·경제지표·옵션 만기 (2026년 11월 ~ 2027년 12월).
// 출처: 한국거래소 공지, NYSE 휴장일 공지, 연준 FOMC 일정, 한국은행 2027 금통위 일정(2026-10-29 의결), 미 노동통계국(BLS) 발표 일정.
// 날짜·시각은 모두 한국시간(KST). 해가 바뀌면 이 파일의 목록만 새로 채운다.
export const COVERAGE_END = '2027-12-31';

const KR_HOLIDAYS = {
  '2026-12-25': '성탄절', '2026-12-31': '연말 휴장',
  '2027-01-01': '신정', '2027-02-08': '설날', '2027-02-09': '설날 대체휴일', '2027-03-01': '삼일절',
  '2027-05-03': '노동절 대체휴일', '2027-05-05': '어린이날', '2027-05-13': '부처님오신날', '2027-07-19': '제헌절 대체휴일',
  '2027-08-16': '광복절 대체휴일', '2027-09-14': '추석', '2027-09-15': '추석', '2027-09-16': '추석',
  '2027-10-04': '개천절 대체휴일', '2027-10-11': '한글날 대체휴일', '2027-12-27': '성탄절 대체휴일', '2027-12-31': '연말 휴장',
};
const KR_NOTICES = { '2026-11-19': '수능일: 정규장 10:00~16:30 (1시간 늦게 열고 닫음)' };

// 미국 휴장일은 현지 날짜 기준
const US_HOLIDAYS = {
  '2026-11-26': '추수감사절', '2026-12-25': '크리스마스',
  '2027-01-01': '새해 첫날', '2027-01-18': '마틴 루터 킹 데이', '2027-02-15': '대통령의 날', '2027-03-26': '성금요일',
  '2027-05-31': '메모리얼 데이', '2027-06-18': '준틴스 데이 (대체)', '2027-07-05': '독립기념일 (대체)', '2027-09-06': '노동절',
  '2027-11-25': '추수감사절', '2027-12-24': '크리스마스 (대체)',
};
const US_EARLY_CLOSE = { '2026-11-27': '추수감사절 다음 날', '2026-12-24': '크리스마스 이브', '2027-11-26': '추수감사절 다음 날' };

// 미국 현지 발표일 (FOMC 는 결정 발표일, * = 경제전망·점도표 함께 발표)
const FOMC = ['2026-12-09*', '2027-01-27', '2027-03-17*', '2027-04-28', '2027-06-09*', '2027-07-28', '2027-09-15*', '2027-10-27', '2027-12-08*'];
const CPI = ['2026-12-10', '2027-01-13', '2027-02-11', '2027-03-10', '2027-04-13', '2027-05-12', '2027-06-10', '2027-07-14', '2027-08-11', '2027-09-14', '2027-10-14', '2027-11-10', '2027-12-10'];
const JOBS = ['2026-12-04', '2027-01-08', '2027-02-05', '2027-03-05', '2027-04-02', '2027-05-07', '2027-06-04', '2027-07-02', '2027-08-06', '2027-09-03', '2027-10-08', '2027-11-05', '2027-12-03'];
// 한국은행 통화정책방향 결정회의 (기준금리 발표)
const BOK = ['2026-11-26', '2027-01-14', '2027-02-25', '2027-04-09', '2027-05-27', '2027-07-15', '2027-08-26', '2027-10-15', '2027-11-25'];

// 결과에 따라 국내 증시가 어떻게 반응하기 쉬운지 (일반적인 경향)
const IMPACT = {
  cpi: '예상보다 낮으면 금리 인하 기대로 호재(반도체·성장주 강세), 높으면 달러 강세·외국인 매도로 악재',
  jobs: '고용이 적당히 둔화되면 호재, 너무 강하면 금리 인하가 늦어져 악재, 너무 약하면 경기 둔화 우려로 악재',
  fomc: '인하하거나 완화적 발언이면 호재(외국인 매수·원화 강세), 동결에 긴축적 발언이면 악재 · 다음날 국장 장 초반에 반영',
  bok: '인하면 건설·내수·성장주에 호재, 은행주엔 부담 · 예상대로 동결이면 영향 작음',
  expiry: '방향보다 변동성 주의: 장 막판 프로그램 매매로 지수가 출렁일 수 있어요',
  usHoliday: '그날 밤 미국 장이 없어 다음날 국장은 방향을 정할 재료가 적어요',
  krHoliday: '쉬는 동안의 미국 장 결과가 다음 거래일에 한꺼번에 반영돼요',
};

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const utc = (s) => new Date(`${s}T00:00:00Z`);
const addDays = (s, n) => { const d = utc(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const weekday = (s) => utc(s).getUTCDay();

// n번째 요일 (0=일요일)
function nthWeekday(y, m, wd, n) {
  const first = new Date(Date.UTC(y, m - 1, 1));
  return ymd(new Date(Date.UTC(y, m - 1, 1 + ((wd - first.getUTCDay() + 7) % 7) + (n - 1) * 7)));
}

// 미국 서머타임: 3월 둘째 일요일 ~ 11월 첫째 일요일
const isUsDst = (s) => { const y = +s.slice(0, 4); return s >= nthWeekday(y, 3, 0, 2) && s < nthWeekday(y, 11, 0, 1); };

// 뉴욕 시각 → 한국시간 (서머타임 13시간, 아니면 14시간 차이)
function etToKst(date, hh, mm) {
  const t = new Date(`${date}T${pad(hh)}:${pad(mm)}:00Z`);
  t.setUTCHours(t.getUTCHours() + (isUsDst(date) ? 13 : 14));
  return { date: ymd(t), time: `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}` };
}

const isOpen = (s, holidays) => weekday(s) % 6 !== 0 && !holidays[s];
const prevOpen = (s, holidays) => { while (!isOpen(s, holidays)) s = addDays(s, -1); return s; };

function expiries(from) {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  while (`${y}-${pad(m)}` <= COVERAGE_END.slice(0, 7)) {
    const quad = m % 3 === 0;
    out.push({ date: prevOpen(nthWeekday(y, m, 4, 2), KR_HOLIDAYS), kind: 'expiry', country: 'KR',
      title: quad ? '네 마녀의 날 (국내)' : '옵션 만기일 (국내)', note: quad ? '선물·옵션 동시 만기라 장 막판 변동이 커질 수 있어요' : '매월 둘째 목요일', impact: IMPACT.expiry });
    out.push({ date: prevOpen(nthWeekday(y, m, 5, 3), US_HOLIDAYS), kind: 'expiry', country: 'US',
      title: quad ? '네 마녀의 날 (미국)' : '옵션 만기일 (미국)', note: '현지 날짜 · 매월 셋째 금요일', impact: IMPACT.expiry });
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

// from(YYYY-MM-DD) 이후의 시장 일정, 날짜순
export function marketEvents(from) {
  const ev = [];
  for (const [date, name] of Object.entries(KR_HOLIDAYS)) ev.push({ date, kind: 'holiday', country: 'KR', title: `국내 휴장 · ${name}`, impact: IMPACT.krHoliday });
  for (const [date, note] of Object.entries(KR_NOTICES)) ev.push({ date, kind: 'holiday', country: 'KR', title: '국내 거래시간 변경', note });
  for (const [date, name] of Object.entries(US_HOLIDAYS)) ev.push({ date, kind: 'holiday', country: 'US', title: `미국 휴장 · ${name}`, note: '현지 날짜', impact: IMPACT.usHoliday });
  for (const [date, name] of Object.entries(US_EARLY_CLOSE)) ev.push({ date, kind: 'holiday', country: 'US', title: '미국 조기 폐장 (13시)', note: `현지 날짜 · ${name}` });
  for (const raw of FOMC) {
    const date = raw.replace('*', '');
    ev.push({ ...etToKst(date, 14, 0), kind: 'macro', country: 'US', title: 'FOMC 금리 결정', note: raw.endsWith('*') ? '경제전망·점도표 함께 발표, 30분 뒤 의장 기자회견' : '30분 뒤 의장 기자회견', impact: IMPACT.fomc });
  }
  for (const date of CPI) ev.push({ ...etToKst(date, 8, 30), kind: 'macro', country: 'US', title: '미국 소비자물가(CPI)', impact: IMPACT.cpi });
  for (const date of JOBS) ev.push({ ...etToKst(date, 8, 30), kind: 'macro', country: 'US', title: '미국 고용보고서', impact: IMPACT.jobs });
  for (const date of BOK) ev.push({ date, kind: 'macro', country: 'KR', title: '한국은행 기준금리 결정', note: '오전 중 발표', impact: IMPACT.bok });
  ev.push(...expiries(from));
  return ev.filter((e) => e.date >= from).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
}
