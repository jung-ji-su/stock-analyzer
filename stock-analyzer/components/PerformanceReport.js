'use client';
import { useState, useEffect, useMemo } from 'react';
import { fetchDailyCloses } from '@/lib/toss';
import { buildEquity, calcStats } from '@/lib/performance';

const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
const sign = (n) => (n >= 0 ? '+' : '');
const RANGES = [{ k: 30, l: '1M' }, { k: 90, l: '3M' }, { k: 0, l: '전체' }];
const W = 320, H = 150, PAD = 6;

function Tile({ label, value, sub, color }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: color || '#111827' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function PerformanceReport({ trades, holdings, prices, initial, fx }) {
  const [closes, setCloses] = useState(null);
  const [range, setRange] = useState(0);
  const [hover, setHover] = useState(null);

  const symKey = [...new Set(trades.map((t) => t.symbol))].sort().join(',');
  useEffect(() => {
    let off = false;
    if (!symKey) return;
    fetchDailyCloses(symKey.split(',')).then((m) => { if (!off) setCloses(m); });
    return () => { off = true; };
  }, [symKey]);

  const ready = closes || !symKey;
  const equityAll = useMemo(() => (ready ? buildEquity(trades, closes || new Map(), initial, undefined, fx) : []), [trades, closes, ready, initial, fx]);
  const stats = useMemo(() => (equityAll.length ? calcStats(trades, equityAll, initial) : null), [trades, equityAll, initial]);

  if (!ready) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>성과 계산 중…</div>;
  if (!stats) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>거래 기록이 생기면 성과가 표시돼요</div>;

  const eq = range ? equityAll.slice(-range) : equityAll;
  const vals = eq.map((p) => p.equity);
  const lo = Math.min(...vals, initial), hi = Math.max(...vals, initial);
  const span = hi - lo || 1;
  const x = (i) => PAD + (eq.length > 1 ? (i / (eq.length - 1)) * (W - PAD * 2) : 0);
  const y = (v) => PAD + (1 - (v - lo) / span) * (H - PAD * 2);
  const line = eq.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`).join(' ');
  const up = stats.totalAsset >= initial;
  const col = up ? '#ef4444' : '#3b82f6';
  const pt = hover != null ? eq[hover] : eq[eq.length - 1];

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (eq.length - 1));
    setHover(Math.max(0, Math.min(eq.length - 1, i)));
  };

  // 종목별: 실현 + 미실현(현재 보유분)
  const unreal = new Map(holdings.map((h) => [h.symbol, ((prices[h.symbol] || h.avgPrice) * h.quantity) - h.totalInvested]));
  const rows = new Map(stats.bySymbol.map((s) => [s.symbol, { ...s, unreal: 0 }]));
  for (const h of holdings) {
    const r = rows.get(h.symbol) || { symbol: h.symbol, name: h.name, realized: 0, count: 0, wins: 0 };
    rows.set(h.symbol, { ...r, unreal: unreal.get(h.symbol) || 0 });
  }
  const list = [...rows.values()].sort((a, b) => (b.realized + b.unreal) - (a.realized + a.unreal));
  const pf = stats.profitFactor;

  return (
    <div>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 22, padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 10, color: '#9ca3af' }}>{pt.date}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#111827' }}>{fmt(pt.equity)}원</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: pt.equity >= initial ? '#ef4444' : '#3b82f6' }}>
              {sign(pt.equity - initial)}{fmt(pt.equity - initial)}원 ({sign(pt.equity - initial)}{(((pt.equity - initial) / initial) * 100).toFixed(2)}%)
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {RANGES.map((r) => (
              <button key={r.k} onClick={() => { setRange(r.k); setHover(null); }}
                style={{ padding: '4px 9px', borderRadius: 10, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: range === r.k ? '#2563eb' : '#f1f5f9', color: range === r.k ? '#fff' : '#6b7280' }}>{r.l}</button>
            ))}
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 150, marginTop: 10, touchAction: 'pan-y' }}
          onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
          <line x1={PAD} x2={W - PAD} y1={y(initial)} y2={y(initial)} stroke="#9ca3af" strokeWidth="1" strokeDasharray="4 3" />
          <path d={line} fill="none" stroke={col} strokeWidth="2" strokeLinejoin="round" />
          {hover != null && <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD} y2={H - PAD} stroke="#d1d5db" strokeWidth="1" />
            <circle cx={x(hover)} cy={y(eq[hover].equity)} r="4" fill={col} />
          </>}
        </svg>
        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>점선 = 시작 자산 · 일봉 종가 기준 추정 (장중 변동 제외)</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <Tile label="총 수익률" value={`${sign(stats.totalReturn)}${stats.totalReturn.toFixed(2)}%`} color={stats.totalReturn >= 0 ? '#ef4444' : '#3b82f6'} sub={`${fmt(stats.totalAsset)}원`} />
        <Tile label="실현 손익" value={`${sign(stats.realized)}${fmt(stats.realized)}원`} color={stats.realized >= 0 ? '#ef4444' : '#3b82f6'} sub={`매도 ${stats.sellCount}건`} />
        <Tile label="승률" value={stats.winRate == null ? '-' : `${stats.winRate.toFixed(0)}%`}
          sub={stats.avgWin != null || stats.avgLoss != null ? `평균 +${fmt(stats.avgWin || 0)} / ${fmt(stats.avgLoss || 0)}` : '매도 기록 없음'} />
        <Tile label="손익비 (Profit Factor)" value={pf == null ? '-' : pf === Infinity ? '∞' : pf.toFixed(2)} sub="총이익 ÷ 총손실" />
        <Tile label="최대낙폭 (MDD)" value={`${stats.mdd.pct.toFixed(2)}%`} color={stats.mdd.pct < 0 ? '#3b82f6' : undefined}
          sub={stats.mdd.peakDate ? `${stats.mdd.peakDate} → ${stats.mdd.troughDate}` : '낙폭 없음'} />
        <Tile label="수수료·세금" value={`${fmt(stats.costs)}원`} sub={`거래 ${stats.tradeCount}건`} />
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 22, padding: '6px 16px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#9ca3af', padding: '10px 0 4px' }}>종목별 손익 (실현 + 보유분 평가)</div>
        {list.map((r) => {
          const tot = r.realized + r.unreal;
          return (
            <div key={`perf-${r.symbol}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid #f1f5f9' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{r.name || r.symbol}</div>
                <div style={{ fontSize: 10, color: '#9ca3af' }}>실현 {sign(r.realized)}{fmt(r.realized)} · 평가 {sign(r.unreal)}{fmt(r.unreal)}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: tot >= 0 ? '#ef4444' : '#3b82f6' }}>{sign(tot)}{fmt(tot)}원</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
