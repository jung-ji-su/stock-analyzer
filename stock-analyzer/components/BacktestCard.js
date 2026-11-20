'use client';

import { useEffect, useState } from 'react';
import { fetchBacktestStats, fetchExperiment } from '@/lib/toss';

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
