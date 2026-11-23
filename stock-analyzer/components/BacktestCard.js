'use client';

import { useEffect, useState } from 'react';
import { fetchBacktestStats, fetchExperiment, fetchBuyScoreStats, fetchSupplyStats, fetchSupplyEngine } from '@/lib/toss';
import { BUY_THRESHOLD } from '@/lib/engineScore';

const H_LABEL = { daily: '1일', weekly: '1주', monthly: '1달' };
const rateColor = (r) => (r == null ? '#94a3b8' : r >= 55 ? '#16a34a' : r >= 45 ? '#d97706' : '#dc2626');

// 시총 상위 종목의 과거 일봉으로 엔진을 날짜마다 다시 돌려 본 결과 (VM 수집기 · Oracle DB)
export default function BacktestCard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [h, setH] = useState('weekly');

  useEffect(() => { fetchBacktestStats().then(setData).catch((e) => setErr(e.message)); }, []);

  const card = { background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(15,23,42,0.06)', padding: '14px', marginBottom: 12 };
  if (err) return (
    <div style={card}>
      <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', margin: 0 }}>🧪 과거 데이터 백테스트</p>
      <p style={{ fontSize: 11, color: '#94a3b8', margin: '6px 0 0' }}>수집 서버에 연결하지 못했어요 ({err})</p>
    </div>
  );
  if (!data) return null;
  const x = data.horizons.find((v) => v.horizon === h);

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>🧪 과거 데이터 백테스트</span>
        <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 10, padding: 2 }}>
          {Object.entries(H_LABEL).map(([k, label]) => (
            <button key={k} onClick={() => setH(k)}
              style={{ padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer',
                background: h === k ? 'white' : 'transparent', color: h === k ? '#0f172a' : '#94a3b8', boxShadow: h === k ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>{label}</button>
          ))}
        </div>
      </div>

      {!x?.n ? (
        <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>아직 계산된 신호가 없어요. 첫 수집이 끝나면 채워져요.</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              ['엔진 적중률', `${x.hitRate}%`, rateColor(x.hitRate)],
              ['기준선', `${x.baseline}%`, '#64748b'],
              ['최근 60거래일', x.recent?.n ? `${x.recent.hitRate}%` : '-', rateColor(x.recent?.hitRate)],
            ].map(([label, val, c]) => (
              <div key={label} style={{ background: '#f8fafc', borderRadius: 12, padding: '8px 10px' }}>
                <p style={{ fontSize: 10, color: '#94a3b8', margin: '0 0 2px' }}>{label}</p>
                <p style={{ fontSize: 17, fontWeight: 800, margin: 0, color: c }}>{val}</p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: '#64748b', margin: '8px 0 0', lineHeight: 1.5 }}>
            {x.hitRate > x.baseline ? `가장 흔한 결과만 계속 찍는 것보다 ${(x.hitRate - x.baseline).toFixed(1)}%p 잘 맞혔어요.` : `가장 흔한 결과만 계속 찍는 것보다 ${(x.baseline - x.hitRate).toFixed(1)}%p 못 맞혔어요.`}
            {' '}실제 결과 비율: 상승 {x.dist.up}% · 횡보 {x.dist.side}% · 하락 {x.dist.down}%
          </p>

          <p style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', margin: '14px 0 4px' }}>예측별 적중률</p>
          {x.byPrediction.map((p) => (
            <div key={p.prediction} style={{ display: 'flex', alignItems: 'center', fontSize: 12, padding: '6px 0', borderTop: '1px solid #f1f5f9' }}>
              <span style={{ flex: 1, color: '#475569' }}>&lsquo;{p.prediction}&rsquo; 이라고 했을 때</span>
              <span style={{ width: 64, textAlign: 'right', color: '#94a3b8' }}>{p.n.toLocaleString()}건</span>
              <span style={{ width: 52, textAlign: 'right', fontWeight: 800, color: rateColor(p.hitRate) }}>{p.hitRate}%</span>
            </div>
          ))}

          <p style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', margin: '14px 0 4px' }}>신뢰도대로 맞았을까 <span style={{ fontWeight: 400, color: '#94a3b8' }}>· 두 값이 비슷해야 정상</span></p>
          {x.calibration.map((c) => (
            <div key={c.bucket} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '5px 0' }}>
              <span style={{ width: 54, color: '#475569' }}>{c.bucket}~{c.bucket + 9}%</span>
              <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 4, position: 'relative' }}>
                <div style={{ position: 'absolute', inset: 0, width: `${c.hitRate}%`, background: rateColor(c.hitRate), borderRadius: 4, opacity: 0.8 }} />
                <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${c.avgConf}%`, width: 2, background: '#0f172a' }} />
              </div>
              <span style={{ width: 92, textAlign: 'right', color: '#64748b' }}>실제 {c.hitRate}% · {c.n.toLocaleString()}건</span>
            </div>
          ))}

          <ExperimentTable horizon={h} />
          <BuyScoreTable />
          <SupplyTable />

          <p style={{ fontSize: 10, color: '#94a3b8', margin: '10px 0 0', lineHeight: 1.6 }}>
            시총 상위 {x.stocks}종목 · {x.from} ~ {x.to} · {x.n.toLocaleString()}건. 날짜마다 그날까지의 일봉만으로 엔진을 다시 돌린 결과예요 (뉴스·수급 점수 제외).
            막대의 검은 선은 엔진이 말한 평균 신뢰도예요.
          </p>
        </>
      )}
    </div>
  );
}

// 확률 설정 실험: 같은 신호로 설정만 바꿔 다시 채점한 결과 (상위 5개 + 지금 설정)
function ExperimentTable({ horizon }) {
  const [open, setOpen] = useState(false);
  const [exp, setExp] = useState(null);
  const [err, setErr] = useState('');
  // 서버가 계산 중이면 5초마다 다시 물어본다
  const load = () => {
    setOpen(true); setErr('');
    const ask = () => fetchExperiment().then((r) => (r?.pending ? setTimeout(ask, 5000) : setExp(r))).catch((e) => setErr(e.message));
    if (!exp) ask();
  };

  if (!open) return (
    <button onClick={load} style={{ marginTop: 14, width: '100%', padding: '10px 0', borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 12, fontWeight: 700, color: '#334155', cursor: 'pointer' }}>
      ⚙️ 확률 설정 실험 보기
    </button>
  );
  const rows = exp?.horizons?.[horizon] || [];
  const show = [...rows.slice(0, 5), ...rows.filter((x, i) => x.current && i >= 5)];
  const sk = (v) => (v == null ? '-' : `${v > 0 ? '+' : ''}${v}`);
  const skColor = (v) => (v == null ? '#94a3b8' : v > 0 ? '#16a34a' : '#dc2626');

  return (
    <div style={{ marginTop: 14 }}>
      <p style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', margin: '0 0 2px' }}>⚙️ 확률 설정 실험</p>
      <p style={{ fontSize: 10, color: '#94a3b8', margin: '0 0 6px', lineHeight: 1.5 }}>
        같은 신호로 설정만 바꿔 다시 채점했어요. 정렬은 앞·뒤 기간 중 나쁜 쪽의 확률 점수 기준 (한 기간에만 맞는 설정을 피하려고)
      </p>
      {err && <p style={{ fontSize: 11, color: '#dc2626' }}>불러오지 못했어요 ({err})</p>}
      {!exp && !err && <p style={{ fontSize: 11, color: '#94a3b8' }}>서버에서 계산 중이에요… (처음엔 1분쯤 걸려요)</p>}
      {show.map((x, i) => (
        <div key={i} style={{ padding: '8px 10px', borderRadius: 10, marginBottom: 6, background: x.current ? '#eff6ff' : '#f8fafc', border: x.current ? '1px solid #bfdbfe' : '1px solid transparent' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#475569' }}>
            <span>{x.current ? '📍 지금 설정 · ' : `${rows.indexOf(x) + 1}위 · `}방향 {x.params.driftK} · 변동성 ×{x.params.sigmaMult} · 최소 {x.params.minScore}점</span>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 3, fontSize: 12, flexWrap: 'wrap' }}>
            <span>적중 <b>{x.hitRate}%</b></span>
            <span>확률점수 <b style={{ color: skColor(x.skill) }}>{sk(x.skill)}</b> <span style={{ color: '#94a3b8' }}>(앞 {sk(x.early?.skill)} / 뒤 {sk(x.late?.skill)})</span></span>
            <span>보정오차 <b>{x.calibErr}%p</b></span>
            <span style={{ color: '#94a3b8' }}>방향 예측 {x.dirShare}%</span>
          </div>
        </div>
      ))}
      {exp && (
        <p style={{ fontSize: 10, color: '#94a3b8', margin: '4px 0 0', lineHeight: 1.6 }}>
          확률점수: 실제 결과 비율만 말했을 때보다 확률이 얼마나 나은지(%, 0보다 커야 의미 있음). 보정오차: 말한 신뢰도와 실제 적중률의 평균 차이. {exp.rows.toLocaleString()}건 · 계산 {exp.seconds}초
        </p>
      )}
    </div>
  );
}

// 검증 표 공통: 숫자 표시, 전체 대비 확실히 좋으면 초록·나쁘면 빨강
const num = (v, unit = '%', sign = false) => (v == null ? '-' : `${sign && v > 0 ? '+' : ''}${v}${unit}`);
const upColorOf = (v, base) => (v == null || !base ? '#94a3b8' : v >= base.up + 5 ? '#16a34a' : v <= base.up - 3 ? '#dc2626' : '#475569');
const downColorOf = (v, base) => (v == null || !base ? '#94a3b8' : v <= base.down - 5 ? '#16a34a' : v >= base.down + 3 ? '#dc2626' : '#475569');
const th = { fontSize: 10, color: '#94a3b8', fontWeight: 600, textAlign: 'right', padding: '4px 2px' };
const td = { fontSize: 11, textAlign: 'right', padding: '5px 2px', fontVariantNumeric: 'tabular-nums' };
const openBtn = { marginTop: 8, width: '100%', padding: '10px 0', borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 12, fontWeight: 700, color: '#334155', cursor: 'pointer' };

// 매수 점수 검증: 스캐너·AI 트레이더 점수(0~100)가 높을수록 5거래일 뒤 실제로 더 올랐나
function BuyScoreTable() {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const load = () => { setOpen(true); setErr(''); if (!d) fetchBuyScoreStats().then(setD).catch((e) => setErr(e.message)); };

  if (!open) return (
    <button onClick={load} style={openBtn}>
      🎯 매수 점수 검증 보기
    </button>
  );
  const upColor = (v) => upColorOf(v, d?.base);
  const downColor = (v) => downColorOf(v, d?.base);
  const row = ({ label, x, hl, sub }) => (
    <tr key={label} style={{ background: hl ? '#eff6ff' : 'transparent', borderTop: '1px solid #f1f5f9' }}>
      <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>{label}</td>
      <td style={{ ...td, color: '#64748b' }}>{x.n ? num(x.share) : '-'}</td>
      <td style={{ ...td, color: x.avg > 0 ? '#ef4444' : '#3b82f6' }}>{x.n ? num(x.avg, '%', true) : '-'}</td>
      <td style={{ ...td, fontWeight: 800, color: upColor(x.up) }}>{x.n ? num(x.up) : '-'}</td>
      <td style={{ ...td, fontWeight: 800, color: downColor(x.down) }}>{x.n ? num(x.down) : '-'}</td>
      {sub !== false && <td style={{ ...td, color: '#94a3b8' }}>{x.early?.n ? `${num(x.early.up, '')}/${num(x.late?.up, '')}` : '-'}</td>}
    </tr>
  );
  const head = (sub = true) => (
    <thead><tr>
      <th style={{ ...th, textAlign: 'left' }}>점수</th><th style={th}>비중</th><th style={th}>5일 평균</th>
      <th style={th}>+2%↑</th><th style={th}>−2%↓</th>{sub && <th style={th}>앞/뒤 ↑</th>}
    </tr></thead>
  );

  return (
    <div style={{ marginTop: 14 }}>
      <p style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', margin: '0 0 2px' }}>🎯 매수 점수 검증 <span style={{ fontWeight: 400, color: '#94a3b8' }}>· 5거래일 뒤</span></p>
      <p style={{ fontSize: 10, color: '#94a3b8', margin: '0 0 6px', lineHeight: 1.5 }}>
        스캐너·AI 트레이더 점수(50 + 종합×5 ± 1주 전망 10)를 과거 날짜마다 다시 매겨 그다음 주 결과와 비교했어요. 지금 기준: {BUY_THRESHOLD}점 이상 = 강력매수·AI 트레이더 매수
      </p>
      {err && <p style={{ fontSize: 11, color: '#dc2626' }}>불러오지 못했어요 ({err})</p>}
      {!d && !err && <p style={{ fontSize: 11, color: '#94a3b8' }}>계산 중이에요…</p>}
      {d && (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            {head()}
            <tbody>
              {row({ label: '전체', x: d.base })}
              {d.atLeast.map((x) => row({ label: `${x.min}점+`, x, hl: x.min === BUY_THRESHOLD }))}
            </tbody>
          </table>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', margin: '12px 0 2px' }}>구간별</p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            {head(false)}
            <tbody>
              {d.buckets.map((x) => row({ label: `${x.lo}~${x.hi}`, x, sub: false }))}
            </tbody>
          </table>
          <p style={{ fontSize: 10, color: '#94a3b8', margin: '6px 0 0', lineHeight: 1.6 }}>
            +2%↑ / −2%↓: 5거래일 뒤 2% 넘게 오른 / 내린 비율 (초록 = 전체보다 확실히 좋음). 앞/뒤: 기간을 반으로 나눠 앞·뒤 각각의 +2%↑ — 둘 다 높아야 우연이 아니에요.
            시총 상위 {d.stocks}종목 · {d.from} ~ {d.to} · {d.n.toLocaleString()}건 (뉴스 제외)
          </p>
        </>
      )}
    </div>
  );
}

// 수급 검증: 외국인+기관 5일 순매수(거래량 대비 %)가 5거래일 뒤 결과를 더 잘 가르나
function SupplyTable() {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const load = () => { setOpen(true); setErr(''); if (!d) fetchSupplyStats().then(setD).catch((e) => setErr(e.message)); };
  if (!open) return <button onClick={load} style={openBtn}>🏦 수급 검증 보기</button>;

  const base = d?.base;
  const cell = (x) => (!x?.n ? <span style={{ color: '#cbd5e1' }}>-</span> : (
    <>
      <span style={{ fontWeight: 800, color: upColorOf(x.up, base) }}>↑{x.up}</span>{' '}
      <span style={{ fontWeight: 800, color: downColorOf(x.down, base) }}>↓{x.down}</span>
      <span style={{ display: 'block', fontSize: 9, color: '#94a3b8' }}>{x.n.toLocaleString()}건</span>
    </>
  ));

  return (
    <div style={{ marginTop: 14 }}>
      <p style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', margin: '0 0 2px' }}>🏦 수급 검증 <span style={{ fontWeight: 400, color: '#94a3b8' }}>· 5거래일 뒤</span></p>
      <p style={{ fontSize: 10, color: '#94a3b8', margin: '0 0 6px', lineHeight: 1.5 }}>
        신호일까지 5거래일 외국인+기관 순매수를 그 5일 거래량으로 나눈 비율(홈 AI 분석의 수급 점수와 같은 정의)로 나눠 봤어요.
      </p>
      {err && <p style={{ fontSize: 11, color: '#dc2626' }}>불러오지 못했어요 ({err})</p>}
      {!d && !err && <p style={{ fontSize: 11, color: '#94a3b8' }}>계산 중이에요…</p>}
      {d && !d.n && <p style={{ fontSize: 11, color: '#94a3b8' }}>아직 겹치는 수급·신호 데이터가 없어요. 과거 수급을 받는 중이면 몇 분 뒤 다시 열어 주세요.</p>}
      {d?.n > 0 && (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...th, textAlign: 'left' }}>순매수 비율</th><th style={th}>비중</th><th style={th}>5일 평균</th>
              <th style={th}>+2%↑</th><th style={th}>−2%↓</th><th style={th}>앞/뒤 ↑</th>
            </tr></thead>
            <tbody>
              {[{ label: '전체', ...base }, ...d.buckets].map((x) => (
                <tr key={x.label} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>{x.label}</td>
                  <td style={{ ...td, color: '#64748b' }}>{x.n ? num(x.share) : '-'}</td>
                  <td style={{ ...td, color: x.avg > 0 ? '#ef4444' : '#3b82f6' }}>{x.n ? num(x.avg, '%', true) : '-'}</td>
                  <td style={{ ...td, fontWeight: 800, color: upColorOf(x.up, base) }}>{x.n ? num(x.up) : '-'}</td>
                  <td style={{ ...td, fontWeight: 800, color: downColorOf(x.down, base) }}>{x.n ? num(x.down) : '-'}</td>
                  <td style={{ ...td, color: '#94a3b8' }}>{x.early?.n ? `${num(x.early.up, '')}/${num(x.late?.up, '')}` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', margin: '12px 0 2px' }}>매수 점수대 × 수급 방향 <span style={{ fontWeight: 400, color: '#94a3b8' }}>· ↑ +2% 넘게 오름 / ↓ −2% 넘게 내림</span></p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...th, textAlign: 'left' }}>점수</th><th style={th}>순매도 (−2%↓)</th><th style={th}>중립</th><th style={th}>순매수 (+2%↑)</th>
            </tr></thead>
            <tbody>
              {d.cross.map((c) => (
                <tr key={c.key} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>{c.label}</td>
                  <td style={td}>{cell(c.sell)}</td><td style={td}>{cell(c.flat)}</td><td style={td}>{cell(c.buy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 10, color: '#94a3b8', margin: '6px 0 0', lineHeight: 1.6 }}>
            같은 점수대 안에서 순매수 칸이 순매도 칸보다 확실히 좋으면, 수급이 엔진에 없는 정보를 더해준다는 뜻이에요.
            수급 {d.flowFrom} ~ {d.flowTo} · {d.stocks}종목 · {d.n.toLocaleString()}건
          </p>
          <SupplyEngineTable />
        </>
      )}
    </div>
  );
}

// 수급 포함 엔진 비교: 홈 AI 분석처럼 수급을 20% 넣었을 때 예측 성적이 실제로 좋아지나
function SupplyEngineTable() {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const load = () => {
    setOpen(true); setErr('');
    const ask = () => fetchSupplyEngine().then((r) => (r?.pending ? setTimeout(ask, 5000) : setD(r))).catch((e) => setErr(e.message));
    if (!d) ask();
  };
  if (!open) return <button onClick={load} style={openBtn}>⚖️ 수급 넣은 엔진과 비교</button>;

  const better = (a, b, lowerIsBetter) => (a == null || b == null || a === b ? '#475569' : (lowerIsBetter ? b < a : b > a) ? '#16a34a' : '#dc2626');
  const H_LABEL = { daily: '1일', weekly: '1주', monthly: '1달' };
  const B = d?.buy;
  const buyRows = B ? [
    ['전체', B.all], [`지금 ${B.threshold}+`, B.base85], [`수급 포함 ${B.threshold}+`, B.sup85], [`지금 ${B.threshold}+ · 순매도 제외`, B.filter85],
    ['지금 70+', B.base70], ['수급 포함 70+', B.sup70], ['지금 70+ · 순매도 제외', B.filter70],
  ] : [];

  return (
    <div style={{ marginTop: 14 }}>
      <p style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', margin: '0 0 2px' }}>⚖️ 수급 넣은 엔진 vs 지금 엔진</p>
      <p style={{ fontSize: 10, color: '#94a3b8', margin: '0 0 6px', lineHeight: 1.5 }}>
        같은 날짜에 엔진을 수급 없이(지금 백테스트·스캐너·AI 트레이더) / 수급 20% 포함(홈 AI 분석 방식)으로 두 번 돌려 비교했어요. 초록 = 수급 포함이 나음
      </p>
      {err && <p style={{ fontSize: 11, color: '#dc2626' }}>불러오지 못했어요 ({err})</p>}
      {!d && !err && <p style={{ fontSize: 11, color: '#94a3b8' }}>엔진을 두 번씩 돌리는 중이에요 (1~3분)…</p>}
      {d && (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...th, textAlign: 'left' }}>기간</th><th style={th}>적중률</th><th style={th}>Brier↓</th><th style={th}>과신</th><th style={th}>방향 적중</th><th style={th}>앞/뒤 적중</th>
            </tr></thead>
            <tbody>
              {Object.entries(d.horizons).flatMap(([h, { base, sup }]) => [['지금', base, null], ['+수급', sup, base]].map(([lbl, x, ref]) => (
                <tr key={h + lbl} style={{ borderTop: lbl === '지금' ? '1px solid #e2e8f0' : 'none' }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>{lbl === '지금' ? `${H_LABEL[h]} 지금` : '　+수급'}</td>
                  <td style={{ ...td, fontWeight: 800, color: ref ? better(ref.hit, x.hit) : '#475569' }}>{num(x.hit)}</td>
                  <td style={{ ...td, color: ref ? better(ref.brier, x.brier, true) : '#475569' }}>{x.brier ?? '-'}</td>
                  <td style={{ ...td, color: ref ? better(Math.abs(ref.overconf), Math.abs(x.overconf), true) : '#475569' }}>{num(x.overconf, '%p', true)}</td>
                  <td style={{ ...td, color: ref ? better(ref.dirHit, x.dirHit) : '#475569' }}>{num(x.dirHit)}<span style={{ fontSize: 9, color: '#94a3b8' }}> ({x.dirShare}%)</span></td>
                  <td style={{ ...td, color: '#94a3b8' }}>{x.early?.n ? `${x.early.hit}/${x.late.hit}` : '-'}</td>
                </tr>
              )))}
            </tbody>
          </table>

          <p style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', margin: '12px 0 2px' }}>매수 점수 기준별 1주 뒤</p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={{ ...th, textAlign: 'left' }}>조건</th><th style={th}>건수</th><th style={th}>5일 평균</th><th style={th}>+2%↑</th><th style={th}>−2%↓</th></tr></thead>
            <tbody>
              {buyRows.map(([lbl, x]) => (
                <tr key={lbl} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>{lbl}</td>
                  <td style={{ ...td, color: '#64748b' }}>{x.n?.toLocaleString() ?? 0}</td>
                  <td style={{ ...td, color: x.avg > 0 ? '#ef4444' : '#3b82f6' }}>{x.n ? num(x.avg, '%', true) : '-'}</td>
                  <td style={{ ...td, fontWeight: 800, color: upColorOf(x.up, B.all) }}>{x.n ? num(x.up) : '-'}</td>
                  <td style={{ ...td, fontWeight: 800, color: downColorOf(x.down, B.all) }}>{x.n ? num(x.down) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 10, color: '#94a3b8', margin: '6px 0 0', lineHeight: 1.6 }}>
            Brier: 확률 예측 오차(낮을수록 좋음). 과신: 평균 신뢰도 − 실제 적중률(0에 가까울수록 정직). 방향 적중: 상승·하락이라고 말한 경우의 적중률(괄호는 그렇게 말한 비중).
            순매도 제외: 외국인+기관 5일 순매수가 거래량의 −2% 미만인 날을 뺌. {d.stocks}종목 · {d.from} ~ {d.to} · {d.signals?.toLocaleString()}일 · 계산 {d.seconds}초
          </p>
        </>
      )}
    </div>
  );
}
