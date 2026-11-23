'use client';

// 수급 > 원인 분석: 최근 1·5·20거래일 등락에 외국인·기관·개인·프로그램·공매도·신용 중 어느 쪽이 크게 작용했나 (lib/supplyDrivers.js)
import { useEffect, useMemo, useState } from 'react';
import { fetchInvestorTrading, fetchSupplyTrend } from '@/lib/toss';
import { analyzeDrivers, FACTORS } from '@/lib/supplyDrivers';

const COUNT = 45; // 20거래일 + 공매도 평소 비중(그 전 20거래일)
const PERIODS = [[1, '1일'], [5, '5일'], [20, '20일']];
const LABEL = Object.fromEntries(FACTORS.map((f) => [f.key, f.label]));
const sign = (v) => (v > 0 ? '+' : '');
const TONE = ['#86efac', '#e2e8f0', '#fdba74', '#fca5a5'];

export default function SupplyDrivers({ symbol }) {
  const [raw, setRaw] = useState(null); // { symbol, bars, investor, ... } | { symbol, error }
  const [days, setDays] = useState(5);

  useEffect(() => {
    let alive = true;
    const recs = (p) => p.then((r) => r?.records || []).catch(() => []);
    Promise.all([
      fetch(`/api/stock?symbol=${encodeURIComponent(symbol)}&timeframe=daily`).then((r) => r.json()).then((d) => d.chartData || []).catch(() => []),
      recs(fetchInvestorTrading(symbol, COUNT)),
      recs(fetchSupplyTrend(symbol, 'program-trades', COUNT)),
      recs(fetchSupplyTrend(symbol, 'short-selling', COUNT)),
      recs(fetchSupplyTrend(symbol, 'credit-trades', COUNT)),
      recs(fetchSupplyTrend(symbol, 'securities-lending', COUNT)),
    ]).then(([bars, investor, program, short, credit, lending]) => {
      if (alive) setRaw({ symbol, bars, investor, program, short, credit, lending });
    });
    return () => { alive = false; };
  }, [symbol]);

  const r = useMemo(() => (raw?.symbol === symbol ? analyzeDrivers({ ...raw, days }) : undefined), [raw, symbol, days]);

  const empty = { fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '14px 0' };
  if (r === undefined) return <p style={empty}>수급과 주가를 맞춰 보는 중…</p>;
  if (!r) return <p style={empty}>원인을 계산할 수급 데이터가 부족해요</p>;

  const up = r.dir > 0, down = r.dir < 0;
  const ranked = r.weights ? FACTORS.filter((f) => r.weights[f.key] > 0).sort((a, b) => r.weights[b.key] - r.weights[a.key]) : [];
  const maxFlow = Math.max(1, ...['foreigner', 'institution', 'individual', 'program', 'credit'].map((k) => Math.abs(r.flows[k] || 0)));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 3 }}>
          {PERIODS.map(([d, l]) => (
            <button key={d} onClick={() => setDays(d)} style={{ padding: '4px 12px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              background: days === d ? 'rgba(255,255,255,0.16)' : 'transparent', color: days === d ? '#fff' : 'rgba(255,255,255,0.5)' }}>{l}</button>
          ))}
        </div>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{r.from === r.to ? r.to.slice(5).replace('-', '/') : `${r.from.slice(5).replace('-', '/')}~${r.to.slice(5).replace('-', '/')}`}</span>
      </div>

      {/* 한 줄 결론 */}
      <div style={{ background: up ? 'rgba(239,68,68,0.12)' : down ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.06)', borderRadius: 14, padding: '12px 14px', marginBottom: 12 }}>
        <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: up ? '#fca5a5' : down ? '#93c5fd' : '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>
          {sign(r.change)}{r.change}%
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#e2e8f0', lineHeight: 1.55 }}>{r.summary}</p>
      </div>

      {/* 원인 비중 */}
      {ranked.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)', margin: '0 0 6px' }}>{up ? '오른' : '내린'} 원인 비중</p>
          <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', background: 'rgba(255,255,255,0.06)' }}>
            {ranked.map((f) => <div key={f.key} style={{ width: `${r.weights[f.key]}%`, background: f.color }} title={f.label} />)}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 8 }}>
            {ranked.map((f, i) => (
              <span key={f.key} style={{ fontSize: i === 0 ? 13 : 11, fontWeight: i === 0 ? 800 : 600, color: i === 0 ? '#fff' : 'rgba(255,255,255,0.7)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: f.color }} />{f.label} {r.weights[f.key]}%
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 세력별 순매수 (거래량 대비) */}
      <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)', margin: '0 0 4px' }}>누가 사고 팔았나 <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.35)' }}>· 같은 기간 거래량 대비</span></p>
      {['foreigner', 'institution', 'individual', 'program', 'credit'].filter((k) => r.flows[k] != null).map((k) => {
        const v = r.flows[k];
        const w = (Math.abs(v) / maxFlow) * 50;
        const word = k === 'credit' ? (v >= 0 ? '빚투 잔고 증가' : '빚투 잔고 감소') : v >= 0 ? '순매수' : '순매도';
        return (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 92px', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 11 }}>
            <span style={{ color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>{LABEL[k]}</span>
            <div style={{ position: 'relative', height: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 5 }}>
              <div style={{ position: 'absolute', top: -2, bottom: -2, left: '50%', width: 1, background: 'rgba(255,255,255,0.2)' }} />
              <div style={{ position: 'absolute', top: 0, bottom: 0, borderRadius: 5, left: v >= 0 ? '50%' : `${50 - w}%`, width: `${w}%`, background: v >= 0 ? '#ef4444' : '#3b82f6', opacity: 0.85 }} />
            </div>
            <span style={{ textAlign: 'right', fontWeight: 700, color: v >= 0 ? '#fca5a5' : '#93c5fd', fontVariantNumeric: 'tabular-nums' }}>{sign(v)}{v}% <span style={{ fontWeight: 400, fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>{word}</span></span>
          </div>
        );
      })}

      {/* 상태: 빚투 · 공매도 · 대차 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 12 }}>
        <Stat icon="💳" title="빚투(신용)"
          value={r.credit?.rate != null ? `${r.credit.rate}%` : '-'}
          tone={r.credit?.level ? TONE[r.credit.level.tone] : null}
          sub={r.credit ? `${r.credit.level ? `${r.credit.level.label} · ` : ''}기간 중 ${sign(r.credit.changePct)}${r.credit.changePct ?? 0}%` : '데이터 없음'} />
        <Stat icon="📉" title="공매도 비중"
          value={r.short ? `${r.short.rate}%` : '-'}
          tone={r.short?.times >= 2 ? TONE[3] : r.short?.times >= 1.3 ? TONE[2] : null}
          sub={r.short?.times ? `평소의 ${r.short.times}배` : r.short ? '평소 비교 불가' : '데이터 없음'} />
        <Stat icon="🏦" title="대차잔고"
          value={r.lending?.changePct != null ? `${sign(r.lending.changePct)}${r.lending.changePct}%` : '-'}
          tone={r.lending?.changePct >= 5 ? TONE[2] : null}
          sub={r.lending ? (r.lending.change > 0 ? '공매도 대기 물량 ↑' : r.lending.change < 0 ? '공매도 대기 물량 ↓' : '변화 없음') : '데이터 없음'} />
      </div>
      {r.credit?.level?.tone >= 2 && (
        <p style={{ margin: '8px 0 0', fontSize: 11, color: '#fdba74', lineHeight: 1.5 }}>
          ⚠️ 상장주식의 {r.credit.rate}%가 빚(신용)으로 산 물량이에요. 주가가 빠지면 반대매매로 매물이 더 나올 수 있어요.
        </p>
      )}

      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '10px 0 0', lineHeight: 1.6 }}>
        주가와 같은 방향으로 움직인 매매를 원인으로 보고, 크기를 같은 기간 거래량 대비로 맞춰 비중을 냈어요(공매도는 내린 날만, 신용은 잔고 변화).
        수급으로 본 추정이라 뉴스·시장 전체 흐름은 빠져 있어요. 프로그램 매매는 대부분 외국인·기관 주문이라 서로 겹칠 수 있어요. 신용 잔고율은 상장주식 대비.
      </p>
    </div>
  );
}

function Stat({ icon, title, value, sub, tone }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '8px 9px' }}>
      <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{icon} {title}</p>
      <p style={{ margin: '3px 0 1px', fontSize: 15, fontWeight: 800, color: tone || '#fff', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      <p style={{ margin: 0, fontSize: 9, color: 'rgba(255,255,255,0.45)', lineHeight: 1.35 }}>{sub}</p>
    </div>
  );
}
