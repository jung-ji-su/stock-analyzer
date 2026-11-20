'use client';

// 관리자 운영 콘솔: 시스템 상태판 · AI 호출 현황 · 데이터 정리
import { useCallback, useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { fetchGatewayHealth, fetchCollectorStatus } from '@/lib/toss';
import { isKrMarketDay } from '@/lib/marketEvents';
import { CARD, H2, MUTED } from '@/components/ui';

const H = 3600_000;
const COLOR = { ok: '#16a34a', warn: '#f59e0b', bad: '#dc2626', none: '#cbd5e1' };
const COL_NAME = {
  profiles: '프로필', holdings: '보유 종목', trades: '거래 내역', orders: '대기 주문', analysisHistory: 'AI 분석 기록', briefings: '브리핑 캐시',
  aiTrader: 'AI 트레이더', aiTransactions: 'AI 매매 기록', aiPortfolioHistory: 'AI 일일 스냅샷', dartCorpCache: 'DART 캐시',
  krx_cache: 'KRX 캐시', market_suffix: '시장 구분 캐시', aiStats: 'AI 호출 통계', opsRuns: '작업 기록',
};

// 한국시간 기준 날짜·요일·시각
const kst = (ms) => { const d = new Date(ms + 9 * H); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay(), min: d.getUTCHours() * 60 + d.getUTCMinutes(), day: d.toISOString().slice(0, 10) }; };
const atKst = (k, h, m) => Date.UTC(k.y, k.m, k.d, h, m) - 9 * H;

// 일정(요일·시각, KST) 중 ref 이전의 가장 최근 예정 시각. ok(dayStr, dow) 로 날짜 조건을 더할 수 있다
function lastScheduled(specs, ref, ok = () => true) {
  let best = 0;
  for (let i = 0; i < 10; i++) {
    const k = kst(ref - i * 24 * H);
    for (const { dows, h, m } of specs) {
      const t = atKst(k, h, m);
      if (dows.includes(k.dow) && ok(k.day) && t <= ref && t > best) best = t;
    }
  }
  return best;
}

const ago = (iso) => {
  if (!iso) return '-';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
};
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');

// Vercel Cron(무료 요금제는 정시 후 1시간 안에 실행) — 예정 시각 + 70분이 지났는데 그 뒤 기록이 없으면 놓친 것
const CRONS = [
  { job: 'morningBrief', name: '시황 브리핑', when: '평일 08:00', specs: [{ dows: [1, 2, 3, 4, 5], h: 8, m: 0 }] },
  { job: 'aiTrader', name: 'AI 트레이더', when: '평일 17:30 · 23:00', specs: [{ dows: [1, 2, 3, 4, 5], h: 17, m: 30 }, { dows: [1, 2, 3, 4, 5], h: 23, m: 0 }] },
  { job: 'dailySnapshot', name: '일일 스냅샷', when: '화~토 00:00', specs: [{ dows: [2, 3, 4, 5, 6], h: 0, m: 0 }] },
];

function cronState(run, specs) {
  if (!run) return ['none', '기록 없음 (다음 실행부터 기록돼요)'];
  if (!run.ok) return ['bad', `실패 · ${run.summary}`];
  const expected = lastScheduled(specs, Date.now() - 70 * 60_000);
  if (expected && Date.parse(run.at) < expected - 5 * 60_000) return ['warn', `${fmtTime(new Date(expected).toISOString())} 실행 누락? · 마지막: ${run.summary}`];
  return ['ok', run.summary];
}

function collectorStates(st) {
  if (!st) return [];
  const now = Date.now();
  const k = kst(now);
  // 장 마감 후 수집: 거래일 16:30 이후 (수집에 몇 분 걸리므로 40분 여유)
  const expected = lastScheduled([{ dows: [1, 2, 3, 4, 5], h: 16, m: 30 }], now - 40 * 60_000, isKrMarketDay);
  const p = st.pipeline;
  const pipe = !p ? ['none', `재시작(${fmtTime(st.started)}) 이후 아직 실행 안 함`]
    : Date.parse(p.at) < expected ? ['warn', `오늘 수집 전 · 마지막 ${fmtTime(p.at)}`]
    : ['ok', `${p.reason} · ${p.seconds}초`];
  const market = isKrMarketDay(k.day) && k.min >= 9 * 60 + 2 && k.min <= 15 * 60 + 30;
  const s = st.stops;
  const stops = market
    ? (s && now - Date.parse(s.at) < 3 * 60_000 ? ['ok', `발동 ${s.triggered ?? 0}건`] : ['bad', `장중인데 체크가 멈춤 · 마지막 ${s ? ago(s.at) : '없음'}`])
    : ['ok', s ? `장 마감 · 마지막 ${fmtTime(s.at)}` : '장 마감'];
  return [
    { name: '장 마감 후 수집', when: '거래일 16:30~', state: pipe, at: p?.at },
    { name: '장중 손절·익절 체크', when: '장중 1분마다', state: stops, at: s?.at },
  ];
}

function Row({ name, when, state: [lv, text], at }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderTop: '1px solid #f1f5f9' }}>
      <span style={{ width: 9, height: 9, borderRadius: 9, background: COLOR[lv], marginTop: 5, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{name}</span>
          <span style={{ fontSize: 11, color: MUTED, flexShrink: 0 }}>{at ? ago(at) : when}</span>
        </div>
        <p style={{ fontSize: 11, color: lv === 'bad' ? COLOR.bad : '#64748b', margin: '2px 0 0', wordBreak: 'break-all' }}>{text}</p>
      </div>
    </div>
  );
}

async function api(method, body) {
  const token = await auth.currentUser.getIdToken();
  const r = await fetch('/api/admin/ops', {
    method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `오류 ${r.status}`);
  return j;
}

const fetchAll = () => Promise.allSettled([api('GET'), fetchGatewayHealth(), fetchCollectorStatus()]);

export default function OpsConsole({ showToast }) {
  const [ops, setOps] = useState(null);
  const [gw, setGw] = useState(null);
  const [col, setCol] = useState(null);
  const [errs, setErrs] = useState({});
  const [loading, setLoading] = useState(true);
  const [showErrors, setShowErrors] = useState(false);

  const apply = useCallback(([o, g, c]) => {
    setOps(o.value ?? null); setGw(g.value ?? null); setCol(c.value ?? null);
    setErrs({ ops: o.reason?.message, gw: g.reason?.message, col: c.reason?.message });
    setLoading(false);
  }, []);
  useEffect(() => { fetchAll().then(apply); }, [apply]);
  const load = () => { setLoading(true); fetchAll().then(apply); };

  // ── 상태판 ──
  const gwState = errs.gw ? ['bad', `연결 안 됨 (${errs.gw})`]
    : !gw ? ['none', '확인 중']
    : gw.token === 'failing' ? ['bad', '토스 토큰 발급 실패']
    : [gw.token === 'valid' ? 'ok' : 'warn', `토큰 ${gw.token === 'valid' ? '정상' : '아직 없음'} · 실시간 ${gw.stream?.upstream ?? '-'} · 접속 ${gw.stream?.clients ?? 0} · 구독 ${gw.stream?.subscriptions ?? 0}`];
  const colRows = errs.col ? [{ name: '수집기', when: '', state: ['bad', `연결 안 됨 (${errs.col})`] }] : collectorStates(col);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={H2}>🩺 시스템 상태</h2>
          <button onClick={load} disabled={loading} style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>{loading ? '확인 중…' : '🔄 새로고침'}</button>
        </div>
        <Row name="토스 게이트웨이" when="VM" state={gwState} />
        {colRows.map((r) => <Row key={r.name} {...r} />)}
        {CRONS.map((c) => <Row key={c.job} name={c.name} when={c.when} state={cronState(ops?.runs?.[c.job], c.specs)} at={ops?.runs?.[c.job]?.at} />)}
        {errs.ops && <p style={{ fontSize: 11, color: COLOR.bad, marginTop: 8 }}>운영 정보를 못 불러왔어요: {errs.ops}</p>}

        {col && (
          <div style={{ marginTop: 10, padding: 12, background: '#f8fafc', borderRadius: 12 }}>
            <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>
              Oracle DB · 종목 {col.data?.stocks} · 일봉 {col.data?.bars?.toLocaleString()} · 수급 {col.data?.flows?.toLocaleString()} · 신호 {col.data?.signals?.toLocaleString()}
              {col.running && ' · 지금 수집 중'}
            </p>
            {ops?.briefing && <p style={{ fontSize: 11, color: '#64748b', margin: '4px 0 0' }}>최신 브리핑 {ops.briefing.date}</p>}
            {ops?.lastTx && <p style={{ fontSize: 11, color: '#64748b', margin: '4px 0 0' }}>AI 트레이더 마지막 매매 {fmtTime(ops.lastTx.date)} · {ops.lastTx.name} {ops.lastTx.action === 'buy' ? '매수' : '매도'}</p>}
            <button onClick={() => setShowErrors((v) => !v)} style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: col.errors?.length ? COLOR.bad : '#64748b', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
              수집기 최근 에러 {col.errors?.length ?? 0}건 {col.errors?.length ? (showErrors ? '▲' : '▼') : ''}
            </button>
            {showErrors && col.errors?.map((e, i) => (
              <p key={i} style={{ fontSize: 10, color: '#475569', margin: '4px 0 0', wordBreak: 'break-all' }}>{fmtTime(e.at)} [{e.where}] {e.message}</p>
            ))}
          </div>
        )}
      </div>

      <AiStats ops={ops} />
      <DataCard ops={ops} showToast={showToast} onDone={load} />
    </div>
  );
}

function AiStats({ ops }) {
  if (!ops) return null;
  const today = ops.stats?.[0]?.date === ops.today ? ops.stats[0] : null;
  const models = Object.entries(today?.models || {}).map(([name, m]) => {
    const n = (m.ok || 0) + (m.fail || 0);
    return { name, ok: m.ok || 0, fail: m.fail || 0, rate: n ? Math.round((m.ok || 0) / n * 100) : 0, avg: n ? (m.ms / n / 1000).toFixed(1) : '-', lastError: m.lastError, lastErrorAt: m.lastErrorAt };
  }).sort((a, b) => (b.ok + b.fail) - (a.ok + a.fail));
  const total = models.reduce((s, m) => s + m.ok + m.fail, 0);
  const ok = models.reduce((s, m) => s + m.ok, 0);
  const tags = Object.entries(today?.tags || {}).map(([k, v]) => `${k} ${v.ok || 0}/${(v.ok || 0) + (v.fail || 0)}`).join(' · ');
  const k = ops.key;
  // 무료 모델 하루 한도(OpenRouter 기준, 바뀔 수 있음): 크레딧을 산 적 없으면 50회, $10 이상 샀으면 1000회
  const cap = k ? (k.isFreeTier ? 50 : 1000) : null;

  return (
    <div style={CARD}>
      <h2 style={{ ...H2, marginBottom: 10 }}>🤖 AI 호출 (오늘)</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
        <Stat label="호출" value={total} sub={cap ? `무료 한도 약 ${cap}회` : ''} warn={cap && total >= cap * 0.8} />
        <Stat label="성공률" value={total ? `${Math.round(ok / total * 100)}%` : '-'} warn={total >= 5 && ok / total < 0.5} />
        <Stat label="OpenRouter" value={k ? (k.isFreeTier ? '무료' : '크레딧') : '-'} sub={k ? `사용 $${Number(k.usage || 0).toFixed(2)}` : '조회 실패'} />
      </div>
      {!total && <p style={{ fontSize: 12, color: MUTED }}>오늘 기록된 호출이 없어요.</p>}
      {models.map((m) => (
        <div key={m.name} style={{ padding: '8px 0', borderTop: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', wordBreak: 'break-all' }}>{m.name}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: m.rate >= 70 ? COLOR.ok : m.rate >= 40 ? COLOR.warn : COLOR.bad, flexShrink: 0 }}>{m.rate}%</span>
          </div>
          <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>성공 {m.ok} · 실패 {m.fail} · 평균 {m.avg}초</p>
          {m.lastError && <p style={{ fontSize: 10, color: COLOR.bad, margin: '2px 0 0', wordBreak: 'break-all' }}>{fmtTime(m.lastErrorAt)} {m.lastError}</p>}
        </div>
      ))}
      {tags && <p style={{ fontSize: 11, color: '#64748b', margin: '8px 0 0' }}>용도별 성공/전체: {tags}</p>}
      {ops.stats?.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto' }}>
          {ops.stats.map((d) => {
            const v = Object.values(d.models || {});
            const n = v.reduce((s, m) => s + (m.ok || 0) + (m.fail || 0), 0);
            const f = v.reduce((s, m) => s + (m.fail || 0), 0);
            return (
              <div key={d.date} style={{ flexShrink: 0, padding: '6px 9px', background: '#f8fafc', borderRadius: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: MUTED }}>{d.date.slice(5)}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>{n}</div>
                <div style={{ fontSize: 10, color: f ? COLOR.bad : MUTED }}>실패 {f}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, warn }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: MUTED }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: warn ? COLOR.bad : '#0f172a' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: MUTED }}>{sub}</div>}
    </div>
  );
}

const CLEAN = [
  { target: 'briefings', name: '브리핑 캐시', options: [14, 30, 90] },
  { target: 'aiStats', name: 'AI 호출 통계', options: [60, 90, 180] },
  { target: 'analysisHistory', name: 'AI 분석 기록', options: [180, 365], note: '적중률·랭킹 계산에서도 빠져요' },
];

function DataCard({ ops, showToast, onDone }) {
  const [days, setDays] = useState({});
  const [preview, setPreview] = useState({});
  const [busy, setBusy] = useState('');
  if (!ops) return null;

  const run = async (c, dryRun) => {
    const d = days[c.target] ?? c.options[0];
    if (!dryRun && !window.confirm(`${c.name} 중 ${d}일보다 오래된 ${preview[c.target]?.count}건을 삭제할까요? 되돌릴 수 없어요.`)) return;
    setBusy(c.target);
    try {
      const r = await api('POST', { target: c.target, days: d, dryRun });
      if (dryRun) setPreview((p) => ({ ...p, [c.target]: { days: d, count: r.count } }));
      else { showToast(`${c.name} ${r.deleted}건 삭제`); setPreview((p) => ({ ...p, [c.target]: null })); onDone(); }
    } catch (e) { showToast(e.message, 'error'); }
    setBusy('');
  };

  return (
    <div style={CARD}>
      <h2 style={{ ...H2, marginBottom: 10 }}>🗄 데이터 (Firestore)</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px 12px', marginBottom: 12 }}>
        {Object.entries(ops.counts || {}).map(([c, n]) => (
          <div key={c} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
            <span style={{ color: '#64748b' }}>{COL_NAME[c] || c}</span>
            <span style={{ fontWeight: 700, color: '#0f172a' }}>{n == null ? '-' : n.toLocaleString()}</span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>오래된 데이터 정리</p>
      {CLEAN.map((c) => {
        const d = days[c.target] ?? c.options[0];
        const pv = preview[c.target];
        const ready = pv && pv.days === d;
        return (
          <div key={c.target} style={{ padding: '8px 0', borderTop: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{c.name}</span>
              <select value={d} onChange={(e) => setDays((v) => ({ ...v, [c.target]: Number(e.target.value) }))}
                style={{ fontSize: 12, padding: '4px 6px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                {c.options.map((o) => <option key={o} value={o}>{o}일 이전</option>)}
              </select>
              {ready && pv.count > 0
                ? <button onClick={() => run(c, false)} disabled={!!busy} style={btn('#dc2626')}>{busy === c.target ? '삭제 중…' : `${pv.count}건 삭제`}</button>
                : <button onClick={() => run(c, true)} disabled={!!busy} style={btn('#2563eb')}>{busy === c.target ? '확인 중…' : ready ? '0건' : '몇 건?'}</button>}
            </div>
            {c.note && <p style={{ fontSize: 10, color: MUTED, margin: '3px 0 0' }}>{c.note}</p>}
          </div>
        );
      })}
    </div>
  );
}

const btn = (bg) => ({ fontSize: 12, fontWeight: 700, color: 'white', background: bg, border: 'none', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', minWidth: 64 });
