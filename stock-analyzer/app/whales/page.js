'use client';

// 고래 추적기: 외국인·기관(큰손)이 최근 1·3·6개월 동안 어떤 종목을 얼마어치 사고 팔았는지.
// 순매수 수량 × 그날 종가로 금액을 만들어 Oracle DB 에서 합산한다 (collector/src/whales.js, 수급은 토스 데이터 3년치).
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { Page, PageHeader, Segmented, Skel, Sheet, Avatar, CARD, DARK_CARD, MUTED, signColor } from '@/components/ui';
import { fetchWhales, fetchWhaleStock } from '@/lib/toss';

const PERIOD = { 20: '1개월', 60: '3개월', 120: '6개월' };
const SIDE = { foreign: ['🌍 외국인', '#2563eb'], inst: ['🏦 기관', '#f59e0b'], both: ['🐋 합계', '#0f172a'] };
const val = (s, side) => (side === 'foreign' ? s.foreign : side === 'inst' ? s.inst : s.foreign + s.inst);
// 원 → 조·억 단위
function bigWon(v, sign = true) {
  const a = Math.abs(v), sg = sign ? (v > 0 ? '+' : v < 0 ? '−' : '') : v < 0 ? '−' : '';
  if (a >= 1e12) return `${sg}${(a / 1e12).toFixed(a >= 1e13 ? 0 : 1)}조`;
  if (a >= 1e8) return `${sg}${Math.round(a / 1e8).toLocaleString()}억`;
  return `${sg}${Math.round(a / 1e4).toLocaleString()}만`;
}
const pct = (v) => (v == null ? '-' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`);

export default function WhalesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [days, setDays] = useState(60);
  const [side, setSide] = useState('both');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null); // 시트로 연 종목
  const [showSell, setShowSell] = useState(false);

  useEffect(() => {
    if (!user) return;
    let off = false;
    fetchWhales(days).then((d) => { if (!off) { setData(d); setErr(''); } }).catch((e) => { if (!off) setErr(e.message); });
    return () => { off = true; };
  }, [user, days]);

  const lists = useMemo(() => {
    if (!data) return null;
    const s = data.stocks;
    const by = [...s].sort((a, b) => val(b, side) - val(a, side));
    return {
      buy: by.filter((x) => val(x, side) > 0).slice(0, 10),
      sell: by.filter((x) => val(x, side) < 0).reverse().slice(0, 10),
      // 조용한 매집: 큰손 합계가 순매수인데 주가는 아직 3% 넘게 안 오른 종목 (거래대금 대비 매수 비중 순)
      quiet: s.filter((x) => x.foreign + x.inst > 0 && x.ret != null && x.ret <= 3 && x.trade > 0)
        .sort((a, b) => (b.foreign + b.inst) / b.trade - (a.foreign + a.inst) / a.trade).slice(0, 5),
      total: { foreign: s.reduce((a, x) => a + x.foreign, 0), inst: s.reduce((a, x) => a + x.inst, 0) },
    };
  }, [data, side]);

  return (
    <Page>
      <PageHeader title="고래 추적기" sub="외국인·기관 큰손들이 무엇을 사고 파는지" />
      <div style={{ marginTop: 14 }}>
        <Segmented items={Object.entries(PERIOD).map(([k, v]) => [Number(k), v])} value={days} onChange={(v) => { setDays(v); setData(null); }} />
      </div>

      {err && <div style={{ ...CARD, marginTop: 12 }}><p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>불러오지 못했어요 ({err})</p></div>}
      {!data && !err && <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}><Skel h={150} r={20} /><Skel h={300} r={20} /></div>}

      {data && lists && (
        <>
          <div style={{ ...DARK_CARD, marginTop: 14, padding: 18 }}>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: 0 }}>최근 {PERIOD[days]} · 시총 상위 {data.stocks.length}종목</p>
            <p style={{ fontSize: 19, fontWeight: 800, color: 'white', margin: '4px 0 14px', lineHeight: 1.4 }}>
              외국인은 <span style={{ color: lists.total.foreign >= 0 ? '#fca5a5' : '#93c5fd' }}>{bigWon(Math.abs(lists.total.foreign), false)} {lists.total.foreign >= 0 ? '샀고' : '팔았고'}</span>,<br />
              기관은 <span style={{ color: lists.total.inst >= 0 ? '#fca5a5' : '#93c5fd' }}>{bigWon(Math.abs(lists.total.inst), false)} {lists.total.inst >= 0 ? '샀어요' : '팔았어요'}</span>
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              {lists.buy.slice(0, 3).map((x, k) => (
                <button key={x.code} onClick={() => setOpen(x)} style={{ flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 14, padding: 10, textAlign: 'left', cursor: 'pointer' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{['🥇', '🥈', '🥉'][k]} 순매수</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'white', margin: '3px 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#fca5a5' }}>{bigWon(val(x, side))}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, margin: '20px 0 10px' }}>
            {Object.entries(SIDE).map(([k, [label]]) => (
              <button key={k} onClick={() => setSide(k)}
                style={{ padding: '8px 14px', borderRadius: 999, border: 'none', fontSize: 13, fontWeight: 800, cursor: 'pointer', background: side === k ? '#0f172a' : 'white', color: side === k ? 'white' : '#64748b' }}>{label}</button>
            ))}
          </div>

          <div style={{ ...CARD, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{showSell ? '가장 많이 판 종목' : '가장 많이 산 종목'}</span>
              <Segmented small items={[[false, '순매수'], [true, '순매도']]} value={showSell} onChange={setShowSell} />
            </div>
            {(showSell ? lists.sell : lists.buy).map((x, k) => <Row key={x.code} x={x} k={k} side={side} onClick={() => setOpen(x)} />)}
            {!(showSell ? lists.sell : lists.buy).length && <p style={{ fontSize: 13, color: MUTED, margin: '12px 0 4px' }}>해당 종목이 없어요</p>}
          </div>

          {lists.quiet.length > 0 && (
            <div style={{ ...CARD, padding: '14px 16px', marginTop: 12 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>🤫 조용히 모으는 중</span>
              <p style={{ fontSize: 12, color: MUTED, margin: '2px 0 4px' }}>외국인·기관이 사 모았는데 주가는 아직 크게 안 오른 종목이에요</p>
              {lists.quiet.map((x, k) => <Row key={x.code} x={x} k={k} side="both" onClick={() => setOpen(x)} quiet />)}
            </div>
          )}

          <p style={{ fontSize: 11, color: MUTED, margin: '14px 4px 24px', lineHeight: 1.7 }}>
            {data.from} ~ {data.to} · 날마다 순매수 수량 × 그날 종가로 금액을 계산했어요 (토스증권 투자자별 매매동향).
            지난 2년치를 검증해 보니 큰손 수급만으로 다음 주 주가를 맞히진 못했어요 — 누가 사고 있는지 참고로만 보세요.
          </p>

          <Sheet open={!!open} onClose={() => setOpen(null)}>
            {open && <Detail x={open} days={days} onGo={() => router.push(`/?stock=${open.code}&name=${encodeURIComponent(open.name)}`)} />}
          </Sheet>
        </>
      )}
    </Page>
  );
}

function Row({ x, k, side, onClick, quiet }) {
  const v = val(x, side);
  const share = x.trade ? Math.abs(v) / x.trade * 100 : 0;
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 0', background: 'none', border: 'none', borderTop: '1px solid #f1f5f9', cursor: 'pointer', textAlign: 'left' }}>
      <span style={{ width: 16, fontSize: 13, fontWeight: 800, color: k < 3 ? '#0f172a' : MUTED, textAlign: 'center' }}>{k + 1}</span>
      <Avatar name={x.name} symbol={x.code} size={34} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</span>
        <span style={{ display: 'block', fontSize: 11, color: MUTED }}>
          {quiet ? `${x.n}일 중 ${x.buyDays}일 매수 · 거래대금의 ${share.toFixed(1)}%` : `거래대금의 ${share.toFixed(1)}% · 주가 ${pct(x.ret)}`}
        </span>
      </span>
      <span style={{ textAlign: 'right' }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: signColor(v) }}>{bigWon(v)}</span>
        {quiet && <span style={{ display: 'block', fontSize: 11, color: signColor(x.ret) }}>주가 {pct(x.ret)}</span>}
      </span>
    </button>
  );
}

function Detail({ x, days, onGo }) {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { fetchWhaleStock(x.code, days).then((r) => setS(r.series)).catch((e) => setErr(e.message)); }, [x.code, days]);
  return (
    <div style={{ maxHeight: '80vh', overflowY: 'auto' }}>
      <div style={{ width: 40, height: 4, borderRadius: 4, background: '#e2e8f0', margin: '-6px auto 14px' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar name={x.name} symbol={x.code} size={40} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{x.name}</div>
          <div style={{ fontSize: 12, color: MUTED }}>최근 {PERIOD[days]} · 주가 <span style={{ color: signColor(x.ret), fontWeight: 700 }}>{pct(x.ret)}</span></div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '14px 0' }}>
        {[['foreign', x.foreign], ['inst', x.inst]].map(([k, v]) => (
          <div key={k} style={{ background: '#f8fafc', borderRadius: 14, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: MUTED }}>{SIDE[k][0]}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: signColor(v), marginTop: 2 }}>{bigWon(v)}</div>
          </div>
        ))}
      </div>
      {err && <p style={{ fontSize: 12, color: '#dc2626' }}>{err}</p>}
      {!s && !err && <Skel h={200} />}
      {s?.length > 1 && <FlowChart s={s} />}
      <button onClick={onGo} style={{ marginTop: 14, width: '100%', padding: '13px 0', borderRadius: 14, border: 'none', background: '#0f172a', fontSize: 14, fontWeight: 800, color: 'white', cursor: 'pointer' }}>{x.name} 차트·분석 보기</button>
    </div>
  );
}

// 위: 주가, 아래: 외국인·기관 누적 순매수 (같은 날짜축)
function FlowChart({ s }) {
  const W = 340, H1 = 90, H2 = 120, L = 6, R = 50;
  const x = (k) => L + (k / (s.length - 1)) * (W - L - R);
  const scale = (vals, h, pad = 6) => { const lo = Math.min(...vals), hi = Math.max(...vals); return (v) => pad + ((hi - v) / (hi - lo || 1)) * (h - pad * 2); };
  const yp = scale(s.map((p) => p.c), H1);
  const yf = scale([0, ...s.map((p) => p.f), ...s.map((p) => p.i)], H2);
  const path = (get, y) => s.map((p, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(get(p)).toFixed(1)}`).join('');
  const last = s.at(-1);
  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 700, color: '#334155', margin: '0 0 4px' }}>주가</p>
      <svg viewBox={`0 0 ${W} ${H1}`} style={{ width: '100%', display: 'block' }}>
        <path d={path((p) => p.c, yp)} fill="none" stroke="#0f172a" strokeWidth="2" />
        <text x={W - R + 4} y={yp(last.c) + 3} fontSize="10" fill="#0f172a" fontWeight="700">{Math.round(last.c).toLocaleString()}</text>
      </svg>
      <p style={{ fontSize: 12, fontWeight: 700, color: '#334155', margin: '10px 0 4px' }}>
        누적 순매수 <span style={{ color: SIDE.foreign[1] }}>● 외국인</span> <span style={{ color: SIDE.inst[1] }}>● 기관</span>
      </p>
      <svg viewBox={`0 0 ${W} ${H2}`} style={{ width: '100%', display: 'block' }}>
        <line x1={L} x2={W - R} y1={yf(0)} y2={yf(0)} stroke="#cbd5e1" strokeDasharray="3 3" />
        <text x={W - R + 4} y={yf(0) + 3} fontSize="9" fill={MUTED}>0</text>
        <path d={path((p) => p.f, yf)} fill="none" stroke={SIDE.foreign[1]} strokeWidth="2" />
        <path d={path((p) => p.i, yf)} fill="none" stroke={SIDE.inst[1]} strokeWidth="2" />
        <text x={W - R + 4} y={yf(last.f) + 3} fontSize="10" fill={SIDE.foreign[1]} fontWeight="700">{bigWon(last.f)}</text>
        <text x={W - R + 4} y={yf(last.i) + (Math.abs(yf(last.i) - yf(last.f)) < 12 ? 14 : 3)} fontSize="10" fill={SIDE.inst[1]} fontWeight="700">{bigWon(last.i)}</text>
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: MUTED, marginTop: 2, paddingRight: R }}>
        <span>{s[0].d}</span><span>{last.d}</span>
      </div>
    </div>
  );
}
