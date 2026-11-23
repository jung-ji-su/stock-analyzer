'use client';

// 수익자 비율: "지금(또는 그날) 이 주식을 들고 있는 물량의 몇 %가 수익 중인가" 추정.
// 거래량으로 매수단가 분포를 쌓는 방식(증권사 매물대/筹码分布, Glassnode Percent Supply in Profit 과 같은 정의) — lib/holderProfit.js
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Page, PageHeader, Chip, Skel, Segmented, CARD, DARK_CARD, H2, MUTED, UP, DOWN } from '@/components/ui';
import { buildCostModel, bandsAt } from '@/lib/holderProfit';
import { fmtPx } from '@/lib/currency';

const PICKS = [['005930', '삼성전자'], ['000660', 'SK하이닉스'], ['005380', '현대차'], ['035420', 'NAVER'], ['035720', '카카오'], ['373220', 'LG에너지솔루션'], ['NVDA', '엔비디아'], ['TSLA', '테슬라']];
const RANGES = [['126', '6개월'], ['252', '1년'], ['500', '2년']];
const BAND_COLORS = ['#1d4ed8', '#3b82f6', '#93c5fd', '#fca5a5', '#ef4444', '#b91c1c'];
const sign = (v) => (v > 0 ? '+' : '');

export default function ProfitPage() {
  return <Suspense><Profit /></Suspense>;
}

function Profit() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [data, setData] = useState(null); // { symbol, bars, shares, name, us } | { symbol, error }
  const code = params.get('stock') || '005930';
  const stock = useMemo(() => ({ code, name: params.get('name') || (code === '005930' ? '삼성전자' : code) }), [code, params]);

  // 검색 (300ms 디바운스)
  useEffect(() => {
    const s = q.trim();
    if (!s) return;
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(s)}`).then((r) => r.json()).then((d) => setHits((d.results || []).slice(0, 8))).catch(() => setHits([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let off = false;
    fetch(`/api/holder-profit?symbol=${encodeURIComponent(stock.code)}`).then((r) => r.json())
      .then((d) => { if (!off) setData(d.error ? { symbol: stock.code, error: d.error } : d); })
      .catch(() => { if (!off) setData({ symbol: stock.code, error: '불러오지 못했어요' }); });
    return () => { off = true; };
  }, [stock]);

  const model = useMemo(() => (data?.bars ? buildCostModel(data.bars, data.shares, { keep: 500 }) : null), [data]);
  const pick = (c, name) => { setQ(''); setHits([]); router.replace(`/profit?stock=${c}&name=${encodeURIComponent(name)}`); };

  return (
    <Page>
      <PageHeader title="🎯 수익자 비율" sub="이 주식을 들고 있는 사람들, 지금 몇 %가 수익 중일까?" />

      <div style={{ ...CARD, padding: 12 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="종목명 또는 코드 검색"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
        {q.trim() && hits.map((h) => (
          <button key={h.symbol} onClick={() => pick(h.symbol, h.name)} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '10px 4px', background: 'none', border: 'none', borderTop: '1px solid #f1f5f9', cursor: 'pointer', fontSize: 13 }}>
            <span style={{ fontWeight: 700, color: '#0f172a' }}>{h.name}</span><span style={{ color: MUTED }}>{h.symbol}</span>
          </button>
        ))}
        {!q && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginTop: 10, scrollbarWidth: 'none' }}>
            {PICKS.map(([c, n]) => <Chip key={c} active={stock.code === c} onClick={() => pick(c, n)}>{n}</Chip>)}
          </div>
        )}
      </div>

      {(!data || data.symbol !== stock.code) && <div style={CARD}><Skel h={150} /><div style={{ height: 10 }} /><Skel h={180} /></div>}
      {data?.error && data.symbol === stock.code && <div style={CARD}><p style={{ margin: 0, fontSize: 13, color: '#dc2626' }}>{data.error}</p></div>}
      {data?.bars && data.symbol === stock.code && !model && <div style={CARD}><p style={{ margin: 0, fontSize: 13, color: MUTED }}>상장한 지 얼마 안 돼서 거래 기록이 부족해요 (20거래일 이상 필요)</p></div>}
      {model && data.symbol === stock.code && <Result key={stock.code} data={data} model={model} />}

      <p style={{ fontSize: 10, color: MUTED, lineHeight: 1.7, margin: '0 4px' }}>
        실제 계좌가 아니라 거래량으로 만든 추정이에요. 그날 거래된 가격을 새 보유자의 매수단가로 보고, 거래량÷주식 수(회전율)만큼 예전 물량이 새 가격으로 바뀐다고 계산해요
        (증권사 앱의 &lsquo;매물대·筹码分布&rsquo;, 코인 분석 Glassnode의 &lsquo;Percent Supply in Profit&rsquo;과 같은 방식). 사람 수가 아니라 주식 수 기준이고,
        상장주식 수로 계산해 대주주처럼 거의 안 파는 물량까지 포함돼요. 최근 5년 일봉 기준.
      </p>
    </Page>
  );
}

function Result({ data, model }) {
  const [range, setRange] = useState(252);
  const [sel, setSel] = useState(null); // 고른 날짜 index (null = 마지막 날)
  const { days, snaps, mids, edges } = model;
  const n = days.length;
  const i = sel == null ? n - 1 : Math.min(sel, n - 1);
  const d = days[i];
  const us = data.us;
  const loss = Math.round((100 - d.profit) * 10) / 10;
  const gap = d.avgCost ? (d.close / d.avgCost - 1) * 100 : null;
  const bands = useMemo(() => bandsAt(snaps[i], mids, d.close), [snaps, mids, i, d.close]);
  const isLast = i === n - 1;

  const mood = d.profit >= 90 ? '거의 모두가 수익이라 차익 매물이 나오기 쉬운 구간이에요'
    : d.profit >= 60 ? '수익 중인 쪽이 많아요'
    : d.profit >= 40 ? '수익과 손실이 반반이에요'
    : d.profit >= 10 ? '손실 중인 쪽이 많아요 — 본전 근처에서 팔려는 물량이 생길 수 있어요'
    : '거의 모두가 손실 중이에요 — 바닥권에서 자주 보이는 모습이에요';

  return (
    <>
      {/* 핵심 숫자 */}
      <div style={{ ...DARK_CARD, padding: '18px 18px 16px', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{data.name}</p>
          <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{isLast ? `최근 (${d.time})` : d.time} · 종가 {fmtPx(d.close, us)}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
          <Gauge profit={d.profit} />
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>보유 물량 중</p>
            <p style={{ margin: '2px 0 0', fontSize: 30, fontWeight: 800, color: '#fca5a5', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{d.profit}% <span style={{ fontSize: 14 }}>수익 중</span></p>
            <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700, color: '#93c5fd', fontVariantNumeric: 'tabular-nums' }}>{loss}% 손실 중</p>
          </div>
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
          {mood}. 평균 매수단가(추정) <b>{fmtPx(d.avgCost, us)}</b>{gap != null && <> — 지금 가격이 <b style={{ color: gap >= 0 ? '#fca5a5' : '#93c5fd' }}>{sign(gap)}{gap.toFixed(1)}%</b> {gap >= 0 ? '위' : '아래'}</>}
        </p>
      </div>

      {/* 추이 차트: 날짜를 눌러 그 시점으로 */}
      <div style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <p style={H2}>수익 중인 비율 추이</p>
          <Segmented small items={RANGES} value={String(range)} onChange={(v) => { setRange(Number(v)); setSel(null); }} />
        </div>
        <TrendChart days={days} range={range} sel={i} onSel={setSel} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <span style={{ fontSize: 10, color: MUTED }}><b style={{ color: UP }}>━</b> 수익 중 % &nbsp;<b style={{ color: '#cbd5e1' }}>━</b> 주가</span>
          {!isLast ? <button onClick={() => setSel(null)} style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>최근으로 ↺</button>
            : <span style={{ fontSize: 10, color: MUTED }}>차트를 눌러 그날로 이동</span>}
        </div>
      </div>

      {/* 수익률 구간 */}
      <div style={CARD}>
        <p style={{ ...H2, marginBottom: 10 }}>얼마나 벌고 잃었나</p>
        <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', gap: 2 }}>
          {bands.map((b, k) => b.pct > 0 && <div key={k} style={{ width: `${b.pct}%`, background: BAND_COLORS[k] }} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', marginTop: 12 }}>
          {bands.map((b, k) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: BAND_COLORS[k], flexShrink: 0 }} />
              <span style={{ color: '#475569' }}>{b.label}</span>
              <span style={{ marginLeft: 'auto', fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{b.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* 매수 가격대 분포 */}
      <div style={CARD}>
        <p style={{ ...H2, marginBottom: 2 }}>어느 가격에 많이 샀나</p>
        <p style={{ fontSize: 11, color: MUTED, margin: '0 0 10px' }}>빨강 = 지금보다 싸게 산 물량(수익), 파랑 = 비싸게 산 물량(손실)</p>
        <CostChart dist={snaps[i]} edges={edges} mids={mids} price={d.close} us={us} />
      </div>
    </>
  );
}

// 반원 게이지 (빨강 = 수익 비율)
function Gauge({ profit }) {
  const r = 38, c = Math.PI * r, p = Math.max(0, Math.min(100, profit)) / 100;
  return (
    <svg width="96" height="56" viewBox="0 0 96 56">
      <path d="M10 50 A38 38 0 0 1 86 50" fill="none" stroke="#3b82f6" strokeWidth="10" strokeLinecap="round" opacity="0.85" />
      <path d="M10 50 A38 38 0 0 1 86 50" fill="none" stroke="#ef4444" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} />
    </svg>
  );
}

function TrendChart({ days, range, sel, onSel }) {
  const W = 340, H = 170, P = { l: 30, r: 8, t: 8, b: 20 };
  const start = Math.max(0, days.length - range);
  const view = days.slice(start);
  const x = (k) => P.l + (k / Math.max(1, view.length - 1)) * (W - P.l - P.r);
  const y = (v) => P.t + (1 - v / 100) * (H - P.t - P.b);
  const cMin = Math.min(...view.map((d) => d.close)), cMax = Math.max(...view.map((d) => d.close));
  const yc = (v) => P.t + (1 - (v - cMin) / (cMax - cMin || 1)) * (H - P.t - P.b);
  const line = (fy) => view.map((d, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${fy(d).toFixed(1)}`).join('');
  const ref = useRef(null);
  const at = (e) => {
    const box = ref.current.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const k = Math.round(((px - P.l) / (W - P.l - P.r)) * (view.length - 1));
    onSel(start + Math.max(0, Math.min(view.length - 1, k)));
  };
  const sk = sel - start;
  const ticks = [0, Math.floor((view.length - 1) / 2), view.length - 1];
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', touchAction: 'none', cursor: 'crosshair' }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); at(e); }} onPointerMove={(e) => e.buttons && at(e)}>
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke={v === 50 ? '#cbd5e1' : '#f1f5f9'} strokeDasharray={v === 50 ? '3 3' : ''} />
          <text x={P.l - 4} y={y(v) + 3} fontSize="9" fill={MUTED} textAnchor="end">{v}%</text>
        </g>
      ))}
      <path d={line((d) => yc(d.close))} fill="none" stroke="#cbd5e1" strokeWidth="1.5" />
      <path d={`${line((d) => y(d.profit))}L${x(view.length - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={UP} opacity="0.08" />
      <path d={line((d) => y(d.profit))} fill="none" stroke={UP} strokeWidth="2" />
      {ticks.map((k) => <text key={k} x={x(k)} y={H - 6} fontSize="9" fill={MUTED} textAnchor={k === 0 ? 'start' : k === view.length - 1 ? 'end' : 'middle'}>{view[k]?.time.slice(2).replace(/-/g, '.')}</text>)}
      {sk >= 0 && sk < view.length && (
        <g>
          <line x1={x(sk)} x2={x(sk)} y1={P.t} y2={H - P.b} stroke="#0f172a" strokeWidth="1" opacity="0.4" />
          <circle cx={x(sk)} cy={y(view[sk].profit)} r="4" fill={UP} stroke="#fff" strokeWidth="2" />
        </g>
      )}
    </svg>
  );
}

// 가격대별 보유 물량 (가로 막대, 위가 비싼 가격). 지금 가격 기준 ±60% 안쪽을 24줄 정도로 묶어서
function CostChart({ dist, edges, mids, price, us }) {
  const tot = dist.reduce((a, v) => a + v, 0);
  const inView = mids.map((m, k) => k).filter((k) => mids[k] > price * 0.4 && mids[k] < price * 1.6);
  const per = Math.max(1, Math.ceil(inView.length / 24));
  const rows = [];
  for (let j = 0; j < inView.length; j += per) {
    const ks = inView.slice(j, j + per);
    const lo = edges[ks[0]], hi = edges[ks.at(-1) + 1];
    rows.push({ lo, hi, m: Math.sqrt(lo * hi), w: ks.reduce((a, k) => a + dist[k], 0) });
  }
  const max = Math.max(...rows.map((r) => r.w), 1e-12);
  return (
    <div>
      {[...rows].reverse().map((r, k) => {
        const here = r.lo <= price && price < r.hi;
        const profit = r.hi <= price;
        const pct = tot ? (r.w / tot) * 100 : 0;
        return (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 38px', alignItems: 'center', gap: 8, height: 14 }}>
            <span style={{ fontSize: 10, color: here ? '#0f172a' : MUTED, fontWeight: here ? 800 : 400, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtPx(r.m, us)}</span>
            <div style={{ position: 'relative', height: 10 }}>
              <div style={{ height: 10, width: `${Math.max((r.w / max) * 100, r.w > 0 ? 1 : 0)}%`, background: here ? '#0f172a' : profit ? UP : DOWN, opacity: here ? 1 : 0.8, borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 10, color: here ? '#0f172a' : MUTED, fontWeight: here ? 800 : 400, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pct >= 0.05 ? `${pct.toFixed(1)}%` : ''}</span>
          </div>
        );
      })}
      <p style={{ margin: '8px 0 0', fontSize: 10, color: MUTED }}>검정 막대 = 지금 가격({fmtPx(price, us)})이 있는 구간</p>
    </div>
  );
}
