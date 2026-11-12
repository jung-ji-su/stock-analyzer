'use client';

import { useEffect, useState } from 'react';
import { fetchInvestorTrading, fetchInvestorRanking, fetchSupplyTrend, loadStockList } from '@/lib/toss';

const num = (v) => parseFloat(v) || 0;
const WHO = [
  { key: 'foreigner', label: '외국인' },
  { key: 'institution', label: '기관' },
  { key: 'individual', label: '개인' },
];
const fmt = (n) => (n > 0 ? '+' : '') + n.toLocaleString('ko-KR');
const fmtEok = (n) => `${Math.round(n / 1e8).toLocaleString('ko-KR')}억`;
const fmtN = (v) => num(v).toLocaleString('ko-KR');
const fmtPct = (v) => (v == null ? '-' : `${(num(v) * 100).toFixed(2)}%`);

// 프로그램/공매도/신용/대차 추이 표 정의 (토스 응답 필드 기준)
const TRENDS = {
  program: {
    label: '프로그램', kind: 'program-trades', note: '프로그램 순매수 수량(주). 빨강 순매수·파랑 순매도.',
    cols: ['차익', '비차익'],
    row: (r) => [
      { v: fmt(num(r.arbitrage?.netBuyVolume)), c: num(r.arbitrage?.netBuyVolume) >= 0 ? '#fca5a5' : '#93c5fd' },
      { v: fmt(num(r.nonArbitrage?.netBuyVolume)), c: num(r.nonArbitrage?.netBuyVolume) >= 0 ? '#fca5a5' : '#93c5fd' },
    ],
  },
  short: {
    label: '공매도', kind: 'short-selling', note: '공매도 거래량(주)·거래대금 비중. 비중이 높을수록 하락 베팅이 많다는 뜻.',
    cols: ['거래량', '거래량 비중', '금액'],
    row: (r) => [{ v: fmtN(r.shortSellingVolume) }, { v: fmtPct(r.shortSellingVolumeRate) }, { v: fmtEok(num(r.shortSellingAmount)) }],
  },
  credit: {
    label: '신용', kind: 'credit-trades', note: '신용융자 신규·상환·잔고(주)와 잔고율. 잔고가 늘면 빚투 증가.',
    cols: ['신규', '상환', '잔고', '잔고율'],
    row: (r) => [{ v: fmtN(r.marginLoan?.newQuantity) }, { v: fmtN(r.marginLoan?.returnQuantity) }, { v: fmtN(r.marginLoan?.balanceQuantity) }, { v: fmtPct(r.marginLoan?.balanceRate) }],
  },
  lending: {
    label: '대차', kind: 'securities-lending', note: '대차거래 체결·상환·잔고(주). 잔고가 늘면 공매도 대기 물량 증가.',
    cols: ['체결', '상환', '잔고'],
    row: (r) => [{ v: fmtN(r.executionQuantity) }, { v: fmtN(r.repaymentQuantity) }, { v: fmtN(r.balanceQuantity) }],
  },
};

// 수급: 종목별 최근 10일 순매수(주) + 투자자별 순매수/순매도 상위. 국내 종목 전용.
export default function InvestorFlow({ symbol, onPick }) {
  const [tab, setTab] = useState('stock');
  const [rows, setRows] = useState(null);
  const [rank, setRank] = useState(null);
  const [who, setWho] = useState('foreigner');
  const [side, setSide] = useState('buy');
  const [names, setNames] = useState(null);
  const [err, setErr] = useState(false);
  const [trend, setTrend] = useState(null); // { symbol, tab, rows } | { symbol, tab, error }

  useEffect(() => {
    const def = TRENDS[tab];
    if (!def) return;
    let alive = true;
    fetchSupplyTrend(symbol, def.kind, 10)
      .then((r) => { if (alive) setTrend({ symbol, tab, rows: r?.records || [] }); })
      .catch(() => { if (alive) setTrend({ symbol, tab, error: true }); });
    return () => { alive = false; };
  }, [symbol, tab]);

  useEffect(() => {
    if (tab !== 'stock') return;
    let alive = true;
    fetchInvestorTrading(symbol, 10).then((r) => { if (alive) setRows(r?.records || []); }).catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [symbol, tab]);

  useEffect(() => {
    if (tab !== 'rank' || rank) return;
    let alive = true;
    Promise.all([fetchInvestorRanking(10), loadStockList().catch(() => [])]).then(([r, list]) => {
      if (!alive) return;
      setNames(new Map((list || []).map((x) => [x[0], x[1]])));
      setRank(r || {});
    }).catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [tab, rank]);

  const maxAbs = Math.max(1, ...(rows || []).flatMap((r) => WHO.map((w) => Math.abs(num(r[w.key]?.netBuyVolume)))));
  const list = rank?.[who]?.[side === 'buy' ? 'netBuyRankings' : 'netSellRankings'] || [];

  const pill = (active) => ({
    padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none',
    background: active ? '#6366f1' : 'rgba(255,255,255,0.07)', color: active ? '#fff' : 'rgba(255,255,255,0.6)',
  });
  const empty = { fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '14px 0' };

  return (
    <div>
      <div style={{ padding: '0 10px' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <button style={pill(tab === 'stock')} onClick={() => setTab('stock')}>이 종목</button>
            {Object.entries(TRENDS).map(([k, d]) => <button key={k} style={pill(tab === k)} onClick={() => setTab(k)}>{d.label}</button>)}
            <button style={pill(tab === 'rank')} onClick={() => setTab('rank')}>투자자 순위</button>
          </div>

          {tab === 'stock' && (err ? <p style={empty}>수급을 불러오지 못했어요</p> : !rows ? <p style={empty}>불러오는 중…</p> : !rows.length ? <p style={empty}>데이터가 없어요</p> : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(3, 1fr)', gap: 4, fontSize: 10, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>
                <span>날짜</span>{WHO.map((w) => <span key={w.key} style={{ textAlign: 'center' }}>{w.label}</span>)}
              </div>
              {rows.map((r) => (
                <div key={r.date} style={{ display: 'grid', gridTemplateColumns: '44px repeat(3, 1fr)', gap: 4, alignItems: 'center', padding: '3px 0', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>{r.date.slice(5).replace('-', '/')}</span>
                  {WHO.map((w) => {
                    const o = r[w.key];
                    if (!o) return <span key={w.key} style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)' }}>잠정 -</span>;
                    const v = num(o.netBuyVolume);
                    return (
                      <div key={w.key} style={{ position: 'relative', textAlign: 'center', padding: '3px 0' }}>
                        <div style={{ position: 'absolute', top: 0, bottom: 0, left: v >= 0 ? '50%' : `${50 - (Math.abs(v) / maxAbs) * 50}%`, width: `${(Math.abs(v) / maxAbs) * 50}%`, background: v >= 0 ? 'rgba(239,68,68,0.22)' : 'rgba(59,130,246,0.22)' }} />
                        <span style={{ position: 'relative', fontWeight: 700, color: v >= 0 ? '#fca5a5' : '#93c5fd' }}>{fmt(v)}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '8px 0 0' }}>순매수 수량(주), 빨강 순매수·파랑 순매도. 당일은 잠정치라 개인이 비어 있을 수 있어요.</p>
            </>
          ))}

          {TRENDS[tab] && (() => {
            const def = TRENDS[tab];
            const cur = trend?.symbol === symbol && trend?.tab === tab ? trend : null;
            if (!cur) return <p style={empty}>불러오는 중…</p>;
            if (cur.error) return <p style={empty}>{def.label} 데이터를 불러오지 못했어요</p>;
            if (!cur.rows.length) return <p style={empty}>데이터가 없어요</p>;
            const grid = `44px repeat(${def.cols.length}, 1fr)`;
            return (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: grid, gap: 4, fontSize: 10, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>
                  <span>날짜</span>{def.cols.map((c) => <span key={c} style={{ textAlign: 'right' }}>{c}</span>)}
                </div>
                {cur.rows.map((r) => (
                  <div key={r.date} style={{ display: 'grid', gridTemplateColumns: grid, gap: 4, padding: '3px 0', fontSize: 11 }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>{r.date.slice(5).replace('-', '/')}</span>
                    {def.row(r).map((x, i) => <span key={i} style={{ textAlign: 'right', fontWeight: 700, color: x.c || '#fff' }}>{x.v}</span>)}
                  </div>
                ))}
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '8px 0 0' }}>{def.note}</p>
              </>
            );
          })()}

          {tab === 'rank' && (err ? <p style={empty}>순위를 불러오지 못했어요</p> : !rank ? <p style={empty}>불러오는 중…</p> : (
            <>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                {WHO.map((w) => <button key={w.key} style={pill(who === w.key)} onClick={() => setWho(w.key)}>{w.label}</button>)}
                <span style={{ width: 8 }} />
                <button style={pill(side === 'buy')} onClick={() => setSide('buy')}>순매수</button>
                <button style={pill(side === 'sell')} onClick={() => setSide('sell')}>순매도</button>
              </div>
              {!list.length ? <p style={empty}>데이터가 없어요</p> : list.map((it) => {
                const amt = num(it.netBuyAmount ?? it.netSellAmount);
                return (
                  <div key={it.symbol} onClick={() => onPick?.({ symbol: it.symbol, name: names?.get(it.symbol) || it.symbol })}
                    style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 4px', fontSize: 12, cursor: onPick ? 'pointer' : 'default' }}>
                    <span><span style={{ color: 'rgba(255,255,255,0.4)', marginRight: 8 }}>{it.rank}</span>{names?.get(it.symbol) || it.symbol}</span>
                    <span style={{ fontWeight: 700, color: side === 'buy' ? '#fca5a5' : '#93c5fd' }}>{side === 'buy' ? '+' : '-'}{fmtEok(amt)}</span>
                  </div>
                );
              })}
              {rank?.[who]?.rankedAt && <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '8px 0 0' }}>{rank[who].rankedAt.slice(0, 16).replace('T', ' ')} 기준</p>}
            </>
          ))}
      </div>
    </div>
  );
}
