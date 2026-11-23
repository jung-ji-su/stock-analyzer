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
const ROWS = ['foreigner', 'institution', 'individual', 'program', 'credit'];
// 주 수량: 12.3만주, 1.2억주
const fmtShares = (v) => {
  if (v == null) return '';
  const a = Math.abs(v), s = v > 0 ? '+' : v < 0 ? '−' : '';
  if (a >= 1e8) return `${s}${(a / 1e8).toFixed(1)}억주`;
  if (a >= 1e4) return `${s}${(a / 1e4).toFixed(1)}만주`;
  return `${s}${a.toLocaleString('ko-KR')}주`;
};

function Section({ title, sub, children }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: '12px 12px 10px', marginBottom: 10 }}>
      <p style={{ fontSize: 12, fontWeight: 800, color: '#fff', margin: '0 0 10px' }}>{title} <span style={{ fontWeight: 400, fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>· {sub}</span></p>
      {children}
    </div>
  );
}

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
  const maxFlow = Math.max(1, ...ROWS.map((k) => Math.abs(r.flows[k] || 0)));
  // 주가 반대 방향으로 사고판 쪽 (내릴 때 산 쪽)
  const support = r.dir ? ['foreigner', 'institution', 'individual', 'program'].map((k) => ({ key: k, v: r.flows[k] })).filter((x) => x.v != null && x.v * r.dir < 0).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)) : [];

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
      <div style={{ background: up ? 'rgba(239,68,68,0.12)' : down ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.06)', borderRadius: 14, padding: '12px 14px', marginBottom: 10 }}>
        <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: up ? '#fca5a5' : down ? '#93c5fd' : '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>
          {sign(r.change)}{r.change}%
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#e2e8f0', lineHeight: 1.55 }}>{r.summary}</p>
      </div>

      {/* 원인 비중: 주가와 같은 방향으로 사고판 쪽 */}
      {ranked.length > 0 && (
        <Section title={up ? '올린 쪽' : '내린 쪽'} sub={up ? '산 쪽만 원인으로 쳐요' : '판 쪽만 원인으로 쳐요'}>
          <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
            {ranked.map((f) => <div key={f.key} style={{ width: `${r.weights[f.key]}%`, background: f.color }} />)}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 10 }}>
            {ranked.map((f) => (
              <span key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#fff', fontWeight: 700 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: f.color, flexShrink: 0 }} />
                <span style={{ color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>{f.label}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.weights[f.key]}%</span>
              </span>
            ))}
          </div>
          {support.length > 0 && (
            <p style={{ margin: '10px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
              {up ? '반대로 판 쪽' : '반대로 산 쪽(받친 쪽)'}: {support.map((x) => `${LABEL[x.key]} ${Math.abs(x.v).toFixed(1)}%`).join(' · ')}
            </p>
          )}
        </Section>
      )}

      {/* 쪽별 순매수 (거래량 대비) */}
      <Section title="누가 사고 팔았나" sub="같은 기간 거래량 대비">
        {ROWS.filter((k) => r.flows[k] != null).map((k) => {
          const v = r.flows[k];
          const w = (Math.abs(v) / maxFlow) * 50;
          const shares = k === 'credit' ? r.credit?.change : r.net[k];
          return (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 48px 58px', alignItems: 'center', gap: 8, height: 26, fontSize: 12 }}>
              <span style={{ color: 'rgba(255,255,255,0.75)', fontWeight: 600, whiteSpace: 'nowrap' }}>{LABEL[k]}</span>
              <div style={{ position: 'relative', height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }}>
                <div style={{ position: 'absolute', top: -3, bottom: -3, left: '50%', width: 1, background: 'rgba(255,255,255,0.25)' }} />
                {v !== 0 && <div style={{ position: 'absolute', top: 0, bottom: 0, borderRadius: 4, left: v > 0 ? '50%' : `${50 - w}%`, width: `${Math.max(w, 1)}%`, background: v > 0 ? '#ef4444' : '#3b82f6' }} />}
              </div>
              <span style={{ textAlign: 'right', fontWeight: 700, color: v > 0 ? '#fca5a5' : v < 0 ? '#93c5fd' : 'rgba(255,255,255,0.5)', fontVariantNumeric: 'tabular-nums' }}>{sign(v)}{v.toFixed(1)}%</span>
              <span style={{ textAlign: 'right', fontSize: 10, color: 'rgba(255,255,255,0.4)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtShares(shares)}</span>
            </div>
          );
        })}
        <p style={{ margin: '6px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>빨강 순매수 · 파랑 순매도 (신용은 빚투 잔고 증감). 오른쪽은 실제 수량</p>
      </Section>

      {/* 상태: 빚투 · 공매도 · 대차 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
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
