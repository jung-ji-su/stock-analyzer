'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { Page, PageHeader, Chip, Skel, CARD, H2, MUTED } from '@/components/ui';
import { marketEvents, COVERAGE_END } from '@/lib/marketEvents';
import { kstDay } from '@/lib/evalUtils';
import { loadStockList } from '@/lib/toss';

const KINDS = { holiday: ['휴장', '#f97316'], macro: ['경제지표', '#8b5cf6'], expiry: ['만기', '#0ea5e9'], stock: ['내 종목', '#10b981'] };
const FLAG = { KR: '🇰🇷', US: '🇺🇸' };
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n) => String(n).padStart(2, '0');
const isUs = (s) => /^[A-Z]{1,5}([.-][A-Z])?$/.test(s);

// 관심종목 + 모의투자 보유 종목의 실적·배당 일정
function stockEvents(stocks, data, today) {
  const ev = [];
  for (const { symbol, name } of stocks) {
    const d = data[symbol];
    if (!d) continue;
    const base = { kind: 'stock', country: isUs(symbol) ? 'US' : 'KR', symbol, name, note: '현지 날짜 · 야후 파이낸스 기준' };
    if (d.earnings) ev.push({ ...base, date: d.earnings, title: `${name} 실적 발표${d.earningsEstimate ? ' (예상일)' : ''}`, impact: '시장 예상치보다 좋으면 상승, 못 미치면 하락하기 쉬워요 · 발표 전후 변동성 큼' });
    if (d.exDividend) ev.push({ ...base, date: d.exDividend, title: `${name} 배당락일`, note: '전날까지 보유해야 배당을 받아요 · 야후 파이낸스 기준', impact: '이날은 배당금만큼 낮은 가격에서 시작하는 게 정상이에요' });
    if (d.dividendPay) ev.push({ ...base, date: d.dividendPay, title: `${name} 배당금 지급` });
  }
  return ev.filter((e) => e.date >= today);
}

function dday(date, today) {
  const n = Math.round((Date.parse(date) - Date.parse(today)) / 86400000);
  return n === 0 ? '오늘' : n === 1 ? '내일' : `D-${n}`;
}

function EventRow({ e, today, onOpen }) {
  const [label, color] = KINDS[e.kind];
  return (
    <button onClick={e.symbol ? () => onOpen(e) : undefined}
      style={{ display: 'flex', gap: 10, width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '10px 0', borderTop: '1px solid #f1f5f9', cursor: e.symbol ? 'pointer' : 'default' }}>
      <span style={{ width: 4, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{FLAG[e.country]} {e.title}</span>
        <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 2 }}>
          {label}{e.time ? ` · 한국시간 ${e.time}` : ''}{e.note ? ` · ${e.note}` : ''}
        </span>
        {e.impact && (
          <span style={{ display: 'block', fontSize: 12, color: '#475569', background: '#f8fafc', borderRadius: 8, padding: '6px 8px', marginTop: 6, lineHeight: 1.5 }}>📌 {e.impact}</span>
        )}
      </span>
      <span style={{ fontSize: 11, fontWeight: 700, color: e.date === today ? '#ef4444' : '#64748b', flexShrink: 0 }}>{dday(e.date, today)}</span>
    </button>
  );
}

export default function CalendarPage() {
  const { user } = useAuth();
  const router = useRouter();
  const today = kstDay(Date.now());
  const [month, setMonth] = useState(today.slice(0, 7));
  const [picked, setPicked] = useState(null);
  const [filter, setFilter] = useState('all');
  const [stocks, setStocks] = useState([]);
  const [stockData, setStockData] = useState(null); // null = 불러오는 중

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    (async () => {
      try {
        const [profile, holdings, master] = await Promise.all([
          getDoc(doc(db, 'profiles', user.uid)),
          getDocs(query(collection(db, 'holdings'), where('userId', '==', user.uid))),
          loadStockList().catch(() => []),
        ]);
        // 저장된 이름은 깨져 있거나 영문일 수 있어서, 토스 종목 목록의 이름을 먼저 쓴다
        const names = new Map(master.map(([s, n]) => [s, n]));
        const nameOf = (symbol, saved) => names.get(symbol) || (saved && !saved.includes('\uFFFD') ? saved : symbol);
        const map = new Map();
        for (const w of profile.data()?.wishlist || []) {
          const symbol = typeof w === 'string' ? w : w.symbol;
          if (symbol) map.set(symbol, { symbol, name: nameOf(symbol, typeof w === 'object' && w.name) });
        }
        for (const h of holdings.docs.map((d) => d.data())) if (h.symbol) map.set(h.symbol, { symbol: h.symbol, name: nameOf(h.symbol, h.name) });
        const list = [...map.values()];
        setStocks(list);
        if (!list.length) { setStockData({}); return; }
        const r = await fetch(`/api/calendar-events?symbols=${encodeURIComponent(list.map((s) => s.symbol).join(','))}`);
        setStockData((await r.json()).events || {});
      } catch { setStockData({}); }
    })();
  }, [user, router]);

  const all = useMemo(() => [...marketEvents(today), ...stockEvents(stocks, stockData || {}, today)]
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))), [today, stocks, stockData]);
  const shown = useMemo(() => (filter === 'all' ? all : all.filter((e) => e.kind === filter)), [all, filter]);
  const byDay = useMemo(() => {
    const m = new Map();
    for (const e of shown) m.set(e.date, [...(m.get(e.date) || []), e]);
    return m;
  }, [shown]);

  // 달력 칸: 앞쪽 빈칸 + 그 달 날짜
  const [y, mo] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${pad(i + 1)}`)];
  const move = (n) => {
    const d = new Date(Date.UTC(y, mo - 1 + n, 1));
    setMonth(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`); setPicked(null);
  };
  const canPrev = month > today.slice(0, 7), canNext = month < COVERAGE_END.slice(0, 7);

  const list = picked ? byDay.get(picked) || [] : shown.filter((e) => e.date <= kstDay(Date.now() + 30 * 86400000));
  const openStock = (e) => router.push(`/?stock=${encodeURIComponent(e.symbol)}&name=${encodeURIComponent(e.name)}`);

  return (
    <Page>
      <PageHeader title="증시 일정" sub="휴장일 · 금리·물가 발표 · 옵션 만기 · 내 종목 실적·배당" />

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>전체</Chip>
        {Object.entries(KINDS).map(([k, [label]]) => <Chip key={k} active={filter === k} onClick={() => setFilter(k)}>{label}</Chip>)}
      </div>

      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button onClick={() => move(-1)} disabled={!canPrev} aria-label="이전 달"
            style={{ width: 32, height: 32, borderRadius: 10, border: 'none', background: '#f1f5f9', fontSize: 16, cursor: canPrev ? 'pointer' : 'default', opacity: canPrev ? 1 : 0.3 }}>‹</button>
          <h2 style={H2}>{y}년 {mo}월</h2>
          <button onClick={() => move(1)} disabled={!canNext} aria-label="다음 달"
            style={{ width: 32, height: 32, borderRadius: 10, border: 'none', background: '#f1f5f9', fontSize: 16, cursor: canNext ? 'pointer' : 'default', opacity: canNext ? 1 : 0.3 }}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {WEEK.map((w, i) => <div key={w} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, padding: '4px 0', color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : MUTED }}>{w}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={`b${i}`} />;
            const ev = byDay.get(d) || [];
            const kinds = [...new Set(ev.map((e) => e.kind))];
            const sel = picked === d, isToday = d === today, wd = i % 7;
            return (
              <button key={d} onClick={() => setPicked(sel ? null : d)}
                style={{ aspectRatio: '1', border: 'none', borderRadius: 12, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                  background: sel ? '#0f172a' : isToday ? '#eff6ff' : 'transparent', opacity: d < today ? 0.35 : 1 }}>
                <span style={{ fontSize: 13, fontWeight: isToday || sel ? 800 : 600, color: sel ? '#fff' : wd === 0 ? '#ef4444' : wd === 6 ? '#3b82f6' : '#0f172a' }}>{+d.slice(8)}</span>
                <span style={{ display: 'flex', gap: 2, height: 5 }}>
                  {kinds.map((k) => <span key={k} style={{ width: 5, height: 5, borderRadius: 3, background: KINDS[k][1] }} />)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={H2}>{picked ? `${+picked.slice(5, 7)}월 ${+picked.slice(8)}일` : '앞으로 30일'}</h2>
          {picked && <button onClick={() => setPicked(null)} style={{ fontSize: 12, color: '#3b82f6', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}>30일 보기</button>}
        </div>
        {filter === 'stock' && stockData === null && <><Skel h={44} style={{ marginTop: 8 }} /><Skel h={44} style={{ marginTop: 8 }} /></>}
        {list.length === 0 && !(filter === 'stock' && stockData === null) && (
          <p style={{ fontSize: 13, color: MUTED, margin: '12px 0 4px' }}>
            {filter === 'stock' && !stocks.length ? '관심종목이나 모의투자 보유 종목이 없어요' : '일정이 없어요'}
          </p>
        )}
        {list.map((e, i) => (
          <div key={`${e.date}${e.title}${i}`}>
            {!picked && (i === 0 || list[i - 1].date !== e.date) && (
              <p style={{ fontSize: 12, fontWeight: 800, color: '#475569', margin: '12px 0 2px' }}>
                {+e.date.slice(5, 7)}/{+e.date.slice(8)} ({WEEK[new Date(`${e.date}T00:00:00Z`).getUTCDay()]})
              </p>
            )}
            <EventRow e={e} today={today} onOpen={openStock} />
          </div>
        ))}
      </div>

      <p style={{ fontSize: 11, color: MUTED, margin: '0 4px', lineHeight: 1.6 }}>
        경제지표 시각은 한국시간이에요. 미국 휴장·종목 일정은 현지 날짜예요. 내 종목 일정은 관심종목과 모의투자 보유 종목 기준이고, 야후 파이낸스에 없는 종목(특히 국내)은 빠질 수 있어요. 일정은 {COVERAGE_END.slice(0, 4)}년 말까지 들어 있어요.
      </p>
    </Page>
  );
}
