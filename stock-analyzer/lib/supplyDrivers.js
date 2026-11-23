// 수급으로 본 등락 원인 (순수 함수, 국내 종목). 토스 수급 응답 + 일봉으로
// "최근 N거래일 주가가 오른/내린 데 어느 쪽 매매가 가장 크게 작용했나"를 추정한다.
//
// 모든 양을 '같은 기간 거래량 대비 %'로 맞춰 비교한다 (주 단위끼리라 종목 크기와 상관없이 비교 가능).
//   외국인·기관·개인·프로그램: 순매수 ÷ 거래량. 주가와 같은 방향(내렸으면 순매도)일 때만 원인으로 센다
//   공매도: 공매도 거래량 ÷ 거래량. 내렸을 때만 원인으로 센다 (팔고 나중에 되사므로 순매도와 같은 크기로 보진 않지만 매도 압력)
//   신용(빚투): 신용잔고 변화 ÷ 거래량. 올랐을 때 잔고 증가(빚내서 매수), 내렸을 때 잔고 감소(상환·반대매매)
// 이건 상관을 보여주는 추정이지 인과가 아니다 — 뉴스·시장 전체 흐름은 들어 있지 않다.

const n = (v) => {
  const x = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(x) ? x : 0;
};
const r1 = (v) => Math.round(v * 10) / 10;

export const FACTORS = [
  { key: 'foreigner', label: '외국인', color: '#60a5fa' },
  { key: 'institution', label: '기관', color: '#f59e0b' },
  { key: 'individual', label: '개인', color: '#a78bfa' },
  { key: 'program', label: '프로그램', color: '#22d3ee' },
  { key: 'short', label: '공매도', color: '#f87171' },
  { key: 'credit', label: '신용(빚투)', color: '#fb923c' },
];

// 날짜 ≤ d 인 가장 최근 기록
const atOrBefore = (map, dates, d) => {
  for (let i = dates.length - 1; i >= 0; i--) if (dates[i] <= d) return map.get(dates[i]);
  return null;
};

// 신용잔고율(상장주식 대비, %) 대략적 단계
export function debtLevel(rate) {
  if (rate == null) return null;
  if (rate < 2) return { label: '낮음', tone: 0 };
  if (rate < 5) return { label: '보통', tone: 1 };
  if (rate < 8) return { label: '높음', tone: 2 };
  return { label: '매우 높음', tone: 3 };
}

/**
 * bars: 일봉 [{ time:'YYYY-MM-DD', close, volume }] (순서 무관)
 * investor/program/short/credit/lending: 토스 응답 records (최신순, 값은 문자열일 수 있음)
 * days: 1 | 5 | 20
 * 반환 null = 계산할 데이터 부족
 */
export function analyzeDrivers({ bars, investor = [], program = [], short = [], credit = [], lending = [], days = 5 }) {
  const b = [...(bars || [])].filter((x) => x?.time && x.close > 0).sort((a, c) => (a.time < c.time ? -1 : 1));
  // 외국인·기관·개인이 모두 있는 날만 (당일 잠정치는 개인이 비어 있을 수 있다)
  const inv = new Map(investor.filter((r) => r.foreigner && r.institution && r.individual).map((r) => [r.date, r]));
  let end = b.length - 1;
  while (end >= 0 && !inv.has(b[end].time)) end--;
  if (end < 1) return null;
  const start = Math.max(1, end - days + 1);
  const win = b.slice(start, end + 1);
  const vol = win.reduce((a, x) => a + n(x.volume), 0);
  if (!vol) return null;
  const chg = (b[end].close / b[start - 1].close - 1) * 100;
  const dir = chg > 0.5 ? 1 : chg < -0.5 ? -1 : 0;
  const dates = win.map((x) => x.time);
  const pct = (v) => (v / vol) * 100;

  const prog = new Map(program.map((r) => [r.date, r]));
  const sh = new Map(short.map((r) => [r.date, r]));
  const sum = (fn) => dates.reduce((a, d) => a + fn(d), 0);
  const net = {
    foreigner: sum((d) => n(inv.get(d)?.foreigner?.netBuyVolume)),
    institution: sum((d) => n(inv.get(d)?.institution?.netBuyVolume)),
    individual: sum((d) => n(inv.get(d)?.individual?.netBuyVolume)),
    program: sum((d) => n(prog.get(d)?.arbitrage?.netBuyVolume) + n(prog.get(d)?.nonArbitrage?.netBuyVolume)),
  };
  const hasProgram = dates.some((d) => prog.has(d));

  // 공매도: 기간 비중과 그 전 20거래일 평균 비중
  const shortVol = sum((d) => n(sh.get(d)?.shortSellingVolume));
  const hasShort = dates.some((d) => sh.has(d));
  const before = short.filter((r) => r.date < dates[0]).slice(0, 20);
  const baseRate = before.length ? (before.reduce((a, r) => a + n(r.shortSellingVolumeRate), 0) / before.length) * 100 : null;

  // 신용·대차 잔고: 기간 끝 vs 기간 시작 전날
  const balance = (records, get) => {
    const m = new Map(records.map((r) => [r.date, r]));
    const ds = [...m.keys()].sort();
    const now = atOrBefore(m, ds, dates.at(-1));
    const then = atOrBefore(m, ds, b[start - 1].time);
    if (!now || !then) return null;
    return { now: n(get(now)), change: n(get(now)) - n(get(then)), rate: get(now, true) };
  };
  const cr = balance(credit, (r, rate) => (rate ? n(r.marginLoan?.balanceRate) * 100 : r.marginLoan?.balanceQuantity));
  const ln = balance(lending, (r, rate) => (rate ? null : r.balanceQuantity));

  const flows = {
    foreigner: pct(net.foreigner), institution: pct(net.institution), individual: pct(net.individual),
    program: hasProgram ? pct(net.program) : null,
    short: hasShort ? pct(shortVol) : null,
    credit: cr ? pct(cr.change) : null,
  };
  // 원인 점수: 주가와 같은 방향으로 작용한 크기 (거래량 대비 %)
  const score = (k) => {
    const v = flows[k];
    if (v == null || !dir) return 0;
    if (k === 'short') return dir < 0 ? v : 0;
    return Math.max(0, v * dir);
  };
  const scores = Object.fromEntries(FACTORS.map((f) => [f.key, score(f.key)]));
  const total = Object.values(scores).reduce((a, v) => a + v, 0);
  const weights = total > 0 ? Object.fromEntries(FACTORS.map((f) => [f.key, Math.round((scores[f.key] / total) * 100)])) : null;
  const top = weights ? FACTORS.filter((f) => weights[f.key] > 0).sort((a, c) => weights[c.key] - weights[a.key]) : [];

  // 반대로 받아낸 쪽 (내릴 때 산 쪽 / 오를 때 판 쪽)
  const counter = dir ? ['foreigner', 'institution', 'individual']
    .map((k) => ({ key: k, v: -flows[k] * dir })).filter((x) => x.v > 0).sort((a, c) => c.v - a.v)[0] || null : null;

  const out = {
    from: dates[0], to: dates.at(-1), days: dates.length, change: r1(chg), dir,
    volume: vol, net, flows: Object.fromEntries(Object.entries(flows).map(([k, v]) => [k, v == null ? null : r1(v)])),
    weights, top: top.map((f) => f.key),
    counter: counter ? { key: counter.key, pct: r1(counter.v) } : null,
    short: hasShort ? { rate: r1(pct(shortVol)), base: baseRate == null ? null : r1(baseRate), times: baseRate ? r1(pct(shortVol) / baseRate) : null } : null,
    credit: cr ? { balance: cr.now, change: cr.change, changePct: cr.now - cr.change ? r1((cr.change / (cr.now - cr.change)) * 100) : null, rate: cr.rate == null ? null : r1(cr.rate), level: debtLevel(cr.rate) } : null,
    lending: ln ? { balance: ln.now, change: ln.change, changePct: ln.now - ln.change ? r1((ln.change / (ln.now - ln.change)) * 100) : null } : null,
  };
  out.summary = summarize(out);
  return out;
}

const LABEL = Object.fromEntries(FACTORS.map((f) => [f.key, f.label]));

// 한 줄 요약 (쉬운 말)
export function summarize(r) {
  const span = r.days === 1 ? '이날' : `최근 ${r.days}거래일`;
  if (!r.dir) return `${span} 주가는 거의 그대로였어요 (${r.change > 0 ? '+' : ''}${r.change}%). 사고판 쪽이 서로 비슷하게 맞섰어요.`;
  const up = r.dir > 0;
  const head = `${span} ${up ? '+' : ''}${r.change}% ${up ? '올랐어요' : '내렸어요'}`;
  if (!r.top.length) return `${head}. 수급에서는 뚜렷한 원인이 안 보여요 — 뉴스나 시장 전체 흐름 영향일 수 있어요.`;
  const main = r.top[0];
  const why = {
    foreigner: up ? '외국인이 사들인 영향이 가장 커요' : '외국인이 판 영향이 가장 커요',
    institution: up ? '기관이 사들인 영향이 가장 커요' : '기관이 판 영향이 가장 커요',
    individual: up ? '개인이 사들인 힘이 가장 컸어요' : '개인이 판 영향이 가장 커요',
    program: up ? '프로그램(기계적 매매) 매수 영향이 가장 커요' : '프로그램(기계적 매매) 매도 영향이 가장 커요',
    short: '공매도(하락에 거는 매도) 영향이 가장 커요',
    credit: up ? '빚을 내서 산(신용) 매수가 가장 크게 늘었어요' : '빚투 물량이 정리(상환·반대매매)된 영향이 가장 커요',
  }[main];
  const cnt = r.counter ? ` 반대로 ${LABEL[r.counter.key]}이 ${up ? '팔면서' : '사들이며'} 받아냈어요.` : '';
  return `${head}. ${why} (원인 중 ${r.weights[main]}%).${cnt}`;
}
