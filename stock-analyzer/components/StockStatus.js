'use client';

import { useEffect, useState } from 'react';
import { fetchMarketCalendar, fetchStockWarnings, fetchPriceLimits } from '@/lib/toss';

const WARN = {
  LIQUIDATION_TRADING: '정리매매', OVERHEATED: '단기과열', INVESTMENT_WARNING: '투자경고', INVESTMENT_RISK: '투자위험',
  VI_STATIC: '정적VI', VI_DYNAMIC: '동적VI', VI_STATIC_AND_DYNAMIC: '정적·동적VI', STOCK_WARRANTS: '신주인수권',
};
const kstTime = (iso) => new Date(iso).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
const kstDate = (iso) => new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' });
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }); // YYYY-MM-DD

// 오늘 세션 목록 → 지금 상태. 세션은 { label, startTime, endTime } (없는 값은 건너뜀)
function statusOf(cal, us, now) {
  const day = cal?.today;
  const s = us
    ? [['데이-마켓', day?.dayMarket], ['프리마켓', day?.preMarket], ['정규장', day?.regularMarket], ['애프터마켓', day?.afterMarket]]
    : [['프리마켓', day?.integrated?.preMarket], ['정규장', day?.integrated?.regularMarket], ['애프터마켓', day?.integrated?.afterMarket]];
  const sessions = s.filter(([, v]) => v?.startTime && v?.endTime).map(([label, v]) => ({ label, ...v, a: +new Date(v.startTime), b: +new Date(v.endTime) }));
  if (!sessions.length) {
    const nx = cal?.nextBusinessDay?.date;
    return { text: '휴장', tone: 'closed', sub: nx ? `다음 거래일 ${nx.slice(5).replace('-', '/')}` : '' };
  }
  const cur = sessions.find((x) => now >= x.a && now < x.b);
  if (cur) {
    const auction = cur.singlePriceAuctionStartTime && now >= +new Date(cur.singlePriceAuctionStartTime);
    return { text: auction ? '종가 단일가' : cur.label, tone: cur.label === '정규장' ? 'open' : 'ext', sub: `${kstTime(cur.endTime)} 종료` };
  }
  const next = sessions.find((x) => now < x.a);
  if (next) return { text: '개장 전', tone: 'closed', sub: `${next.label} ${kstTime(next.startTime)} 시작` };
  return { text: '장 마감', tone: 'closed', sub: cal?.nextBusinessDay?.date ? `다음 거래일 ${kstDate(cal.nextBusinessDay.date)}` : '' };
}

const TONE = {
  open: { bg: 'rgba(34,197,94,0.15)', fg: '#4ade80' },
  ext: { bg: 'rgba(245,158,11,0.15)', fg: '#fbbf24' },
  closed: { bg: 'rgba(255,255,255,0.08)', fg: 'rgba(255,255,255,0.6)' },
};

// 시장 상태 + 경고(VI·과열 등) + 상·하한가. 경고/가격제한은 국내 종목만.
export default function StockStatus({ symbol, us }) {
  const [cal, setCal] = useState(null);
  const [warns, setWarns] = useState([]);
  const [limits, setLimits] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    fetchMarketCalendar(us ? 'US' : 'KR').then((r) => { if (alive) setCal(r); }).catch(() => {});
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => { alive = false; clearInterval(id); };
  }, [us]);

  useEffect(() => {
    if (us) return;
    let alive = true;
    fetchStockWarnings(symbol).then((r) => {
      const t = today();
      if (alive) setWarns((r || []).filter((w) => (!w.startDate || w.startDate <= t) && (!w.endDate || w.endDate >= t)));
    }).catch(() => {});
    fetchPriceLimits(symbol).then((r) => { if (alive) setLimits(r); }).catch(() => {});
    return () => { alive = false; };
  }, [symbol, us]);

  if (!cal) return null;
  const st = statusOf(cal, us, now);
  const tone = TONE[st.tone];
  const up = parseFloat(limits?.upperLimitPrice), lo = parseFloat(limits?.lowerLimitPrice);

  return (
    <div style={{ background: '#0F172A', borderRadius: 18, border: '1px solid rgba(255,255,255,0.08)', padding: '10px 14px', marginTop: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800, background: tone.bg, color: tone.fg }}>{us ? '미국 ' : ''}{st.text}</span>
      {st.sub && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{st.sub}</span>}
      {warns.map((w, i) => (
        <span key={`${w.warningType}-${i}`} style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 800, background: 'rgba(239,68,68,0.15)', color: '#fca5a5' }}>
          {WARN[w.warningType] || w.warningType}
        </span>
      ))}
      {up > 0 && lo > 0 && (
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.5)', fontVariantNumeric: 'tabular-nums' }}>
          상한 <b style={{ color: '#fca5a5' }}>{up.toLocaleString('ko-KR')}</b> · 하한 <b style={{ color: '#93c5fd' }}>{lo.toLocaleString('ko-KR')}</b>
        </span>
      )}
    </div>
  );
}
