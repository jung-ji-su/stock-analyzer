'use client';

import { useEffect, useState } from 'react';
import { fetchOrderbook, subscribeToss } from '@/lib/toss';

const LEVELS = 10;
const num = (v) => parseFloat(v) || 0;

// 호가창: 매도(파랑)는 위, 매수(빨강)는 아래. 스냅샷 1회 + 실시간 갱신(0.3초 간격)
export default function Orderbook({ symbol, us }) {
  const [open, setOpen] = useState(true);
  const [book, setBook] = useState(null);

  useEffect(() => {
    if (!open) return;
    let alive = true, live = false, timer = null, pending = null;
    const apply = (d) => {
      pending = d;
      if (timer) return;
      timer = setTimeout(() => { timer = null; if (alive) setBook(pending); }, 300);
    };
    fetchOrderbook(symbol).then((r) => { if (alive && !live && r?.asks && r?.bids) setBook(r); }).catch(() => {});
    const unsub = subscribeToss([{ type: `orderbook:${us ? 'us' : 'kr'}`, codes: [symbol] }], (m) => { live = true; apply(m.data); });
    return () => { alive = false; clearTimeout(timer); unsub(); };
  }, [symbol, us, open]);

  const asks = (book?.asks || []).slice(0, LEVELS);
  const bids = (book?.bids || []).slice(0, LEVELS);
  const maxVol = Math.max(1, ...asks.map((a) => num(a.volume)), ...bids.map((b) => num(b.volume)));
  const sumAsk = asks.reduce((s, a) => s + num(a.volume), 0);
  const sumBid = bids.reduce((s, b) => s + num(b.volume), 0);
  const bidRatio = sumAsk + sumBid > 0 ? (sumBid / (sumAsk + sumBid)) * 100 : 50;
  const fmtPrice = (p) => (us ? num(p).toFixed(2) : num(p).toLocaleString('ko-KR'));

  const Row = ({ item, color }) => (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '5px 10px', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
      <div style={{ position: 'absolute', top: 0, bottom: 0, [color === 'ask' ? 'right' : 'left']: 0, width: `${(num(item.volume) / maxVol) * 100}%`, background: color === 'ask' ? 'rgba(59,130,246,0.18)' : 'rgba(239,68,68,0.18)' }} />
      <span style={{ position: 'relative', fontWeight: 700, color: color === 'ask' ? '#93c5fd' : '#fca5a5' }}>{fmtPrice(item.price)}</span>
      <span style={{ position: 'relative', color: 'rgba(255,255,255,0.75)' }}>{num(item.volume).toLocaleString()}</span>
    </div>
  );

  return (
    <div style={{ background: '#0F172A', borderRadius: 22, border: '1px solid rgba(255,255,255,0.08)', padding: '14px 4px 10px', marginTop: 12 }}>
      <button onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', color: '#fff', padding: '0 14px 8px', cursor: 'pointer' }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>📒 호가</span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{open ? '접기' : '펼치기'}</span>
      </button>
      {open && (!asks.length && !bids.length ? (
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '14px 0' }}>호가를 불러오는 중… (장이 닫혀 있으면 비어 있을 수 있어요)</p>
      ) : (
        <>
          {[...asks].reverse().map((a, i) => <Row key={`a${i}`} item={a} color="ask" />)}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.12)', margin: '3px 10px' }} />
          {bids.map((b, i) => <Row key={`b${i}`} item={b} color="bid" />)}
          <div style={{ margin: '8px 10px 0' }}>
            <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${100 - bidRatio}%`, background: '#3b82f6' }} />
              <div style={{ width: `${bidRatio}%`, background: '#ef4444' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
              <span>매도 잔량 {sumAsk.toLocaleString()}</span><span>매수 잔량 {sumBid.toLocaleString()}</span>
            </div>
          </div>
        </>
      ))}
    </div>
  );
}
