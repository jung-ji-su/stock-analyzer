'use client';

import { useState } from 'react';
import { prepareOco, placeOco, snapTick, tickSize, calcCosts } from '@/lib/paperTrade';
import { fmtPx } from '@/lib/currency';

const num = (v) => parseFloat(v) || 0;
const chip = { padding: '8px 4px', background: '#f1f5f9', color: '#64748b', borderRadius: 12, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' };
const input = { width: '100%', padding: '12px 14px', borderRadius: 14, border: '1.5px solid #e2e8f0', fontSize: 15, fontWeight: 700, color: '#0f172a', outline: 'none', boxSizing: 'border-box', background: '#f8fafc' };
const label = { fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', margin: '12px 0 6px' };

// 손절·익절 예약: 보유 종목에 목표가/손절가를 걸어두면 앱이 열려 있을 때 확인해서 자동 매도한다.
// us: 미국 종목이면 가격은 달러, 예상 손익은 환율(fx)로 원화 환산
export default function OcoModal({ uid, symbol, name, currentPrice, holding, sellable, onClose, onDone, us = false, fx = 1 }) {
  const [qty, setQty] = useState(String(sellable));
  const [target, setTarget] = useState('');
  const [stop, setStop] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const q = Math.floor(num(qty));
  const costBasis = holding.totalInvested ? (holding.totalInvested * q) / holding.quantity : holding.avgPrice * q * (us ? fx : 1);
  const preview = (p) => {
    if (!(p > 0) || !(q > 0)) return null;
    const amount = p * q, { fee, tax } = calcCosts('sell', amount, us);
    const profit = Math.round((amount - fee - tax) * (us ? fx : 1) - costBasis);
    return { profit, rate: (profit / costBasis) * 100 };
  };
  const pct = (r) => String(snapTick(currentPrice * (1 + r / 100), name, us));
  const line = (p, color) => {
    const v = preview(num(p));
    return v ? <p style={{ fontSize: 11, color, margin: '5px 2px 0', fontWeight: 700 }}>예상 손익 {v.profit >= 0 ? '+' : ''}{v.profit.toLocaleString()}원 ({v.profit >= 0 ? '+' : ''}{v.rate.toFixed(2)}%, 수수료{us ? ' 반영, 현재 환율 기준' : '·세금 반영'})</p> : null;
  };

  const submit = async () => {
    setErr('');
    if (!(q > 0) || q > sellable) { setErr(`수량은 1~${sellable}주로 입력해주세요`); return; }
    setBusy(true);
    try {
      const { targetPrice, stopPrice } = await prepareOco({ symbol, name, targetPrice: target, stopPrice: stop, fallbackPrice: currentPrice, us });
      await placeOco({ uid, symbol, name, qty: q, targetPrice, stopPrice, us });
      window.dispatchEvent(new Event('paper-orders-changed'));
      onDone(`${name} 손절·익절 예약 등록 (${q}주)`);
    } catch (e) { setErr(e.message || '등록 실패'); } finally { setBusy(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 55 }}>
      <div style={{ background: 'white', borderRadius: '28px 28px 0 0', width: '100%', maxWidth: 480, padding: '18px 20px 28px', maxHeight: '92vh', overflowY: 'auto', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, margin: '0 0 3px' }}>손절·익절 예약</p>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', margin: 0 }}>{name}</h3>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '3px 0 0' }}>현재가 {fmtPx(currentPrice, us)} · 평균 {us ? fmtPx(holding.avgPrice, true) : fmtPx(Math.round(holding.totalInvested / holding.quantity || holding.avgPrice))}</p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', borderRadius: 12, padding: '6px 12px', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}>닫기</button>
        </div>

        <label style={label}>수량 (매도가능 {sellable}주)</label>
        <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} style={input} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginTop: 6 }}>
          {[25, 50, 100].map((p) => <button key={p} style={chip} onClick={() => setQty(String(Math.max(1, Math.floor((sellable * p) / 100))))}>{p === 100 ? '전량' : `${p}%`}</button>)}
        </div>

        <label style={label}>익절가 (이 가격 이상이 되면 매도)</label>
        <input type="number" step={tickSize(num(target) || currentPrice, name, us)} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="입력 안 하면 익절 없음" style={input} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginTop: 6 }}>
          {[5, 10, 20].map((r) => <button key={r} style={chip} onClick={() => setTarget(pct(r))}>+{r}%</button>)}
        </div>
        {line(target, '#dc2626')}

        <label style={label}>손절가 (이 가격 이하가 되면 매도)</label>
        <input type="number" step={tickSize(num(stop) || currentPrice, name, us)} value={stop} onChange={(e) => setStop(e.target.value)} placeholder="입력 안 하면 손절 없음" style={input} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginTop: 6 }}>
          {[3, 5, 10].map((r) => <button key={r} style={chip} onClick={() => setStop(pct(-r))}>-{r}%</button>)}
        </div>
        {line(stop, '#2563eb')}

        <p style={{ fontSize: 11, color: '#94a3b8', margin: '12px 2px 0', lineHeight: 1.5 }}>
          한쪽이 체결되면 다른 쪽은 자동 취소돼요. 앱이 열려 있을 때 확인하고, 닫혀 있던 동안은 다시 열 때 1분봉으로 따져요(같은 봉에서 둘 다 닿았다면 손절로 처리). 손절은 발동 시점 가격으로 체결돼 손절가보다 낮을 수 있어요.
        </p>
        {err && <p style={{ fontSize: 12, color: '#dc2626', textAlign: 'center', margin: '12px 0 0', fontWeight: 600 }}>⚠️ {err}</p>}
        <button onClick={submit} disabled={busy}
          style={{ width: '100%', marginTop: 14, padding: 15, borderRadius: 18, border: 'none', color: 'white', fontWeight: 800, fontSize: 15, cursor: busy ? 'not-allowed' : 'pointer', background: busy ? '#cbd5e1' : 'linear-gradient(135deg,#6366f1,#4f46e5)' }}>
          {busy ? '등록 중…' : '예약 등록'}
        </button>
      </div>
    </div>
  );
}
