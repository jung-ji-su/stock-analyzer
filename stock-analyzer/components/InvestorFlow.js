'use client';

import { useEffect, useState } from 'react';
import { fetchInvestorTrading, fetchInvestorRanking, loadStockList } from '@/lib/toss';

const num = (v) => parseFloat(v) || 0;
const WHO = [
  { key: 'foreigner', label: '외국인' },
  { key: 'institution', label: '기관' },
  { key: 'individual', label: '개인' },
];
const fmt = (n) => (n > 0 ? '+' : '') + n.toLocaleString('ko-KR');
const fmtEok = (n) => `${Math.round(n / 1e8).toLocaleString('ko-KR')}억`;

// 수급: 종목별 최근 10일 순매수(주) + 투자자별 순매수/순매도 상위. 국내 종목 전용.
export default function InvestorFlow({ symbol, onPick }) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState('stock');
  const [rows, setRows] = useState(null);
  const [rank, setRank] = useState(null);
  const [who, setWho] = useState('foreigner');
  const [side, setSide] = useState('buy');
  const [names, setNames] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!open || tab !== 'stock') return;
    let alive = true;
    fetchInvestorTrading(symbol, 10).then((r) => { if (alive) setRows(r?.records || []); }).catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [symbol, open, tab]);

  useEffect(() => {
    if (!open || tab !== 'rank' || rank) return;
    let alive = true;
    Promise.all([fetchInvestorRanking(10), loadStockList().catch(() => [])]).then(([r, list]) => {
      if (!alive) return;
      setNames(new Map((list || []).map((x) => [x[0], x[1]])));
      setRank(r || {});
    }).catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [open, tab, rank]);

  const maxAbs = Math.max(1, ...(rows || []).flatMap((r) => WHO.map((w) => Math.abs(num(r[w.key]?.netBuyVolume)))));
  const list = rank?.[who]?.[side === 'buy' ? 'netBuyRankings' : 'netSellRankings'] || [];

  const pill = (active) => ({
    padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none',
    background: active ? '#6366f1' : 'rgba(255,255,255,0.07)', color: active ? '#fff' : 'rgba(255,255,255,0.6)',
  });
  const empty = { fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '14px 0' };

  return (
    <div style={{ background: '#0F172A', borderRadius: 22, border: '1px solid rgba(255,255,255,0.08)', padding: '14px 4px 10px', marginTop: 12 }}>
      <button onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', color: '#fff', padding: '0 14px 8px', cursor: 'pointer' }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>🏦 수급</span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{open ? '접기' : '펼치기'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 10px' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button style={pill(tab === 'stock')} onClick={() => setTab('stock')}>이 종목</button>
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
      )}
    </div>
  );
}
