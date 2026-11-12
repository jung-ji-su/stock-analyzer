'use client';

import { useEffect, useState } from 'react';
import { fetchTrades, subscribeToss } from '@/lib/toss';

const MAX = 40;   // 상승·하락 비중과 대량체결 기준 계산용
const SHOW = 10;  // 화면에 보여 줄 줄 수
const num = (v) => parseFloat(v) || 0;
const keyOf = (t) => `${t.timestamp}|${t.price}|${t.volume}`;
const timeOf = (ts) => new Date(ts).toLocaleTimeString('ko-KR', { hour12: false });

// 체결 내역: 스냅샷(최근 50건) + 실시간 체결. 토스는 매수/매도 구분을 주지 않아 직전 체결가 대비 상승·하락으로 색을 정한다.
export default function TradeTape({ symbol, us }) {
  const [open, setOpen] = useState(true);
  const [trades, setTrades] = useState(null); // 최신순

  useEffect(() => {
    if (!open) return;
    let alive = true, timer = null, buf = [];
    const merge = (incoming) => setTrades((prev) => {
      const seen = new Set((prev || []).map(keyOf));
      const add = incoming.filter((t) => !seen.has(keyOf(t)));
      return [...add, ...(prev || [])].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, MAX);
    });
    fetchTrades(symbol, 50).then((r) => { if (alive) merge(r || []); }).catch(() => { if (alive) setTrades((p) => p || []); });
    const unsub = subscribeToss([{ type: `trade:${us ? 'us' : 'kr'}`, codes: [symbol] }], (m) => {
      const d = m.data;
      if (!d?.price) return;
      buf.unshift({ price: d.price, volume: d.volume, timestamp: d.timestamp || new Date().toISOString() });
      if (timer) return;
      timer = setTimeout(() => { timer = null; const b = buf; buf = []; if (alive) merge(b); }, 300);
    });
    return () => { alive = false; clearTimeout(timer); unsub(); };
  }, [symbol, us, open]);

  const list = trades || [];
  const rows = list.map((t, i) => {
    const prev = list[i + 1];
    const dir = prev ? Math.sign(num(t.price) - num(prev.price)) : 0;
    return { ...t, dir };
  });
  const avgVol = rows.length ? rows.reduce((s, t) => s + num(t.volume), 0) / rows.length : 0;
  const upVol = rows.filter((t) => t.dir > 0).reduce((s, t) => s + num(t.volume), 0);
  const downVol = rows.filter((t) => t.dir < 0).reduce((s, t) => s + num(t.volume), 0);
  const upRatio = upVol + downVol > 0 ? (upVol / (upVol + downVol)) * 100 : 50;
  const fmtPrice = (p) => (us ? num(p).toFixed(2) : num(p).toLocaleString('ko-KR'));

  return (
    <div style={{ background: '#0F172A', borderRadius: 22, border: '1px solid rgba(255,255,255,0.08)', padding: '14px 4px 10px', marginTop: 12 }}>
      <button onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', color: '#fff', padding: '0 14px 8px', cursor: 'pointer' }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>🧾 체결</span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{open ? '접기' : '펼치기'}</span>
      </button>
      {open && (!trades ? (
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '14px 0' }}>불러오는 중…</p>
      ) : !rows.length ? (
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '14px 0' }}>체결 내역이 없어요 (장이 닫혀 있으면 비어 있을 수 있어요)</p>
      ) : (
        <div style={{ padding: '0 10px' }}>
          <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${upRatio}%`, background: '#ef4444' }} />
            <div style={{ width: `${100 - upRatio}%`, background: '#3b82f6' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.45)', margin: '4px 0 8px' }}>
            <span>상승 체결 {upRatio.toFixed(0)}%</span><span>하락 체결 {(100 - upRatio).toFixed(0)}%</span>
          </div>
          {rows.slice(0, SHOW).map((t) => {
            const big = avgVol > 0 && num(t.volume) >= avgVol * 5;
            const color = t.dir > 0 ? '#fca5a5' : t.dir < 0 ? '#93c5fd' : '#fff';
            return (
              <div key={keyOf(t)} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 2px', fontSize: 12, fontVariantNumeric: 'tabular-nums', background: big ? 'rgba(250,204,21,0.12)' : 'none', borderRadius: 4 }}>
                <span style={{ color: 'rgba(255,255,255,0.45)', width: 62 }}>{timeOf(t.timestamp)}</span>
                <span style={{ fontWeight: 700, color }}>{fmtPrice(t.price)}</span>
                <span style={{ color: big ? '#facc15' : 'rgba(255,255,255,0.75)', fontWeight: big ? 800 : 400, width: 70, textAlign: 'right' }}>{num(t.volume).toLocaleString()}</span>
              </div>
            );
          })}
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '8px 0 0' }}>직전 체결가 대비 상승(빨강)·하락(파랑)이에요. 노란 줄은 최근 평균의 5배 이상 대량 체결이에요.</p>
        </div>
      ))}
    </div>
  );
}
