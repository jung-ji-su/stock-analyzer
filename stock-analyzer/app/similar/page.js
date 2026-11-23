'use client';

// 닮은꼴 차트: 지금 종목의 최근 20거래일 모양과 가장 비슷했던 과거 구간(시총 상위 100종목 × 3년)을 찾아
// 그 뒤 20거래일이 어떻게 흘러갔는지 겹쳐 보여준다. 검색은 VM 수집기의 Oracle AI 벡터 검색(collector/src/similar.js).
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { Page, PageHeader, Chip, Skel, CARD, H2, MUTED, UP, DOWN, signColor } from '@/components/ui';
import { fetchSimilar, loadStockList } from '@/lib/toss';

const LEN = 20;
const KR = new Set(['KOSPI', 'KOSDAQ', 'KR_ETC']);
const sign = (v) => (v > 0 ? '+' : '');
const fmtPct = (v) => (v == null ? '-' : `${sign(v)}${Number(v).toFixed(1)}%`);
// 시작 대비 누적 % 경로 → '마지막 날 = 0' 기준 % (과거와 미래를 오늘에서 이어 그리기 위해)
const relToEnd = (path) => { const e = 1 + path.at(-1) / 100; return path.map((p) => ((1 + p / 100) / e - 1) * 100); };

export default function SimilarPage() {
  return <Suspense><Similar /></Suspense>;
}

// 게스트용 예시 종목 (토스 종목 검색·관심종목은 로그인해야 써서)
const GUEST_PICKS = [['005930', '삼성전자'], ['000660', 'SK하이닉스'], ['005380', '현대차'], ['035420', 'NAVER'], ['035720', '카카오'], ['373220', 'LG에너지솔루션']];

function Similar() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [master, setMaster] = useState([]);
  const [wish, setWish] = useState([]);
  const [q, setQ] = useState('');
  const [stock, setStock] = useState(null); // { code, name }
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadStockList().then((l) => setMaster(l.filter(([, , m]) => KR.has(m)))).catch(() => {});
    // 관심종목(Firestore)은 로그인했을 때만 따로 받는다 (게스트는 Firestore 를 안 받게)
    import('@/lib/wishlist').then(({ loadWishlist }) => loadWishlist(user.uid)).then((w) => setWish(w.filter((x) => /^[0-9A-Z]{6}$/.test(x.symbol)))).catch(() => {});
  }, [user]);

  useEffect(() => {
    const code = params.get('stock');
    if (code) setStock({ code, name: params.get('name') || code });
  }, [params]);

  useEffect(() => {
    if (!stock) return;
    let off = false;
    (async () => {
      setLoading(true); setErr(''); setRes(null);
      try {
        const r = await fetch(`/api/stock?symbol=${stock.code}&timeframe=daily`);
        const d = await r.json();
        const bars = d.chartData || [];
        if (bars.length < LEN) throw new Error('일봉이 20개보다 적어서 비교할 수 없어요');
        const last = bars.slice(-LEN);
        const out = await fetchSimilar(last.map((b) => b.close), stock.code, last.at(-1).time);
        if (out.error) throw new Error(out.error);
        if (!off) setRes({ ...out, asOf: last.at(-1).time });
      } catch (e) { if (!off) setErr(e.message); }
      if (!off) setLoading(false);
    })();
    return () => { off = true; };
  }, [stock]);

  // 관심종목·주소에 저장된 이름은 깨져 있거나 영문일 수 있어서 토스 종목 목록의 한글 이름을 먼저 쓴다 (증시일정과 같은 방식)
  const names = useMemo(() => new Map(master.map(([c, n]) => [c, n])), [master]);
  const nameOf = (code, saved) => names.get(code) || (saved && !saved.includes('\uFFFD') ? saved : code);

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return master.filter(([c, n]) => c.includes(s) || n.toLowerCase().includes(s)).slice(0, 8);
  }, [q, master]);

  const pick = (code, name) => { setQ(''); setStock({ code, name }); router.replace(`/similar?stock=${code}&name=${encodeURIComponent(name)}`); };

  return (
    <Page>
      <PageHeader title="🔮 닮은꼴 차트" sub="지금 차트와 모양이 가장 비슷했던 과거, 그 다음엔?" />

      {!user && (
        <div style={{ ...CARD, marginTop: 14, padding: 12 }}>
          <p style={{ fontSize: 12, color: MUTED, margin: '0 0 8px' }}>둘러보기 중이에요 · 예시 종목에서 골라 보세요 (검색은 로그인 후)</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {GUEST_PICKS.map(([c, n]) => <Chip key={c} active={stock?.code === c} onClick={() => pick(c, n)}>{n}</Chip>)}
          </div>
        </div>
      )}
      {user && <div style={{ ...CARD, marginTop: 14, padding: 12 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="종목명 또는 코드 검색"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
        {hits.map(([c, n]) => (
          <button key={c} onClick={() => pick(c, n)} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '10px 4px', background: 'none', border: 'none', borderTop: '1px solid #f1f5f9', cursor: 'pointer', fontSize: 13 }}>
            <span style={{ fontWeight: 700, color: '#0f172a' }}>{n}</span><span style={{ color: MUTED }}>{c}</span>
          </button>
        ))}
        {!q && wish.length > 0 && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginTop: 10 }}>
            {wish.slice(0, 12).map((w) => <Chip key={w.symbol} active={stock?.code === w.symbol} onClick={() => pick(w.symbol, nameOf(w.symbol, w.name))}>{nameOf(w.symbol, w.name)}</Chip>)}
          </div>
        )}
      </div>}

      {!stock && (
        <div style={{ ...CARD, marginTop: 12, textAlign: 'center', padding: 28 }}>
          <div style={{ fontSize: 40 }}>🔮</div>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '8px 0 4px' }}>종목을 골라 보세요</p>
          <p style={{ fontSize: 12, color: MUTED, margin: 0, lineHeight: 1.6 }}>최근 20거래일 주가 흐름과 모양이 가장 비슷했던<br />과거 구간 12개를 찾아, 그 뒤 흐름을 겹쳐 보여줘요</p>
        </div>
      )}

      {stock && loading && <div style={{ ...CARD, marginTop: 12 }}><Skel h={200} /><div style={{ height: 10 }} /><Skel h={60} /></div>}
      {stock && err && <div style={{ ...CARD, marginTop: 12 }}><p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>{err}</p></div>}
      {stock && res && <Result stock={{ ...stock, name: nameOf(stock.code, stock.name) }} res={res} />}
    </Page>
  );
}

function Result({ stock, res }) {
  const [sel, setSel] = useState(null); // 목록에서 고른 사례 (차트에서 강조)
  const { matches, w1, m1, base } = res;
  if (!matches.length) return <div style={{ ...CARD, marginTop: 12 }}><p style={{ fontSize: 13, color: MUTED, margin: 0 }}>비슷한 과거 구간을 찾지 못했어요.</p></div>;
  const avgSim = Math.round(matches.reduce((a, m) => a + m.similarity, 0) / matches.length);

  return (
    <>
      <div style={{ ...CARD, marginTop: 12 }}>
        <p style={{ ...H2, marginBottom: 2 }}>{stock.name}</p>
        <p style={{ fontSize: 11, color: MUTED, margin: '0 0 10px' }}>{res.asOf}까지 20거래일 · 닮은 구간 {matches.length}개 · 평균 유사도 {avgSim}%</p>
        <OverlayChart query={res.query} matches={matches} sel={sel} />
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', fontSize: 10, color: MUTED, marginTop: 6 }}>
          <span><b style={{ color: '#2563eb' }}>━</b> 지금</span><span><b style={{ color: '#cbd5e1' }}>━</b> 닮은 과거</span><span><b style={{ color: '#0f172a' }}>┅</b> 그 뒤 평균</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
        <Outcome label="1주 뒤" s={w1} base={base?.w1} />
        <Outcome label="1달 뒤" s={m1} base={base?.m1} />
      </div>

      <div style={{ ...CARD, marginTop: 12, padding: '12px 14px' }}>
        <p style={{ ...H2, fontSize: 14, marginBottom: 6 }}>닮은 과거 구간</p>
        {matches.map((m, i) => (
          <button key={`${m.code}${m.date}`} onClick={() => setSel(sel === i ? null : i)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 2px', background: sel === i ? '#eff6ff' : 'none', border: 'none', borderTop: i ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', textAlign: 'left', borderRadius: 8 }}>
            <Spark m={m} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
              <span style={{ display: 'block', fontSize: 10, color: MUTED }}>{m.date} · 유사도 {m.similarity}%</span>
            </span>
            <span style={{ textAlign: 'right', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ display: 'block', fontWeight: 800, color: signColor(m.fwd5) }}>1주 {fmtPct(m.fwd5)}</span>
              <span style={{ display: 'block', color: signColor(m.fwd20) }}>1달 {fmtPct(m.fwd20)}</span>
            </span>
          </button>
        ))}
      </div>

      <p style={{ fontSize: 10, color: MUTED, margin: '10px 4px 20px', lineHeight: 1.6 }}>
        시총 상위 100종목의 3년치 일봉에서 20거래일 구간 {base?.total?.toLocaleString() ?? ''}개를 모양(시작 대비 등락 흐름)만으로 비교했어요 (Oracle AI 벡터 검색, 코사인 거리).
        같은 종목의 겹치는 구간은 하나만 골랐어요. 과거 모양이 닮았다고 같은 결과가 나오진 않아요 — 참고용이에요.
      </p>
    </>
  );
}

// 과거 20일(왼쪽) + 그 뒤 20일(오른쪽)을 '오늘 = 0%' 기준으로 겹쳐 그린다
function OverlayChart({ query, matches, sel }) {
  const W = 340, H = 200, PAD = { l: 34, r: 8, t: 10, b: 18 };
  const q = relToEnd(query);
  const series = matches.map((m) => ({ past: relToEnd(m.past), next: m.next }));
  const avgNext = Array.from({ length: 20 }, (_, k) => {
    const v = series.map((s) => s.next[k]).filter((x) => x != null);
    return v.length >= Math.ceil(matches.length / 2) ? v.reduce((a, x) => a + x, 0) / v.length : null;
  }).filter((x) => x != null);
  const all = [...q, ...series.flatMap((s) => [...s.past, ...s.next])];
  const lo = Math.min(-2, ...all), hi = Math.max(2, ...all);
  const x = (i) => PAD.l + ((i + LEN - 1) / (LEN - 1 + 20)) * (W - PAD.l - PAD.r); // i: -19..20
  const y = (v) => PAD.t + ((hi - v) / (hi - lo)) * (H - PAD.t - PAD.b);
  const line = (vals, start) => vals.map((v, k) => `${k ? 'L' : 'M'}${x(start + k).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const ticks = [hi, 0, lo].map((v) => Math.round(v));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#f1f5f9" />
          <text x={PAD.l - 4} y={y(t) + 3} fontSize="9" fill={MUTED} textAnchor="end">{t > 0 ? '+' : ''}{t}%</text>
        </g>
      ))}
      <line x1={x(0)} x2={x(0)} y1={PAD.t} y2={H - PAD.b} stroke="#94a3b8" strokeDasharray="3 3" />
      <text x={x(0)} y={H - 4} fontSize="9" fill={MUTED} textAnchor="middle">오늘</text>
      <text x={x(-19)} y={H - 4} fontSize="9" fill={MUTED}>20일 전</text>
      <text x={x(20)} y={H - 4} fontSize="9" fill={MUTED} textAnchor="end">20일 뒤</text>
      {series.map((s, i) => (
        <g key={i} opacity={sel == null || sel === i ? 1 : 0.25}>
          <path d={line(s.past, -(LEN - 1))} fill="none" stroke="#cbd5e1" strokeWidth={sel === i ? 2 : 1} />
          {s.next.length > 0 && <path d={line([0, ...s.next], 0)} fill="none" stroke={(s.next.at(-1) ?? 0) >= 0 ? UP : DOWN} strokeWidth={sel === i ? 2.2 : 1} opacity={sel === i ? 1 : 0.45} />}
        </g>
      ))}
      {avgNext.length > 0 && <path d={line([0, ...avgNext], 0)} fill="none" stroke="#0f172a" strokeWidth="2.2" strokeDasharray="5 3" />}
      <path d={line(q, -(LEN - 1))} fill="none" stroke="#2563eb" strokeWidth="2.8" strokeLinejoin="round" />
    </svg>
  );
}

function Outcome({ label, s, base }) {
  if (!s?.n) return <div style={{ ...CARD, padding: 14 }}><p style={{ fontSize: 12, color: MUTED, margin: 0 }}>{label}: 결과가 아직 없어요</p></div>;
  const better = base?.upRate != null ? s.upRate - base.upRate : 0;
  return (
    <div style={{ ...CARD, padding: 14 }}>
      <p style={{ fontSize: 11, color: MUTED, margin: 0 }}>{label}</p>
      <p style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: '4px 0 2px' }}>{s.n}번 중 <span style={{ color: UP }}>{s.up}번</span> 상승</p>
      <p style={{ fontSize: 12, fontWeight: 700, color: signColor(s.avg), margin: 0 }}>평균 {fmtPct(s.avg)}</p>
      {base?.upRate != null && (
        <p style={{ fontSize: 10, color: MUTED, margin: '6px 0 0', lineHeight: 1.5 }}>
          보통은 {Math.round(base.upRate)}% 확률로 올라요{Math.abs(better) >= 10 ? (better > 0 ? ' → 닮은꼴이 더 자주 올랐어요' : ' → 닮은꼴이 덜 올랐어요') : ' → 큰 차이 없어요'}
        </p>
      )}
    </div>
  );
}

function Spark({ m }) {
  const p = relToEnd(m.past), n = m.next;
  const all = [...p, ...n, 0];
  const lo = Math.min(...all), hi = Math.max(...all) || 1;
  const W = 56, H = 24;
  const x = (i) => ((i + LEN - 1) / (LEN - 1 + 20)) * W;
  const y = (v) => 2 + ((hi - v) / (hi - lo || 1)) * (H - 4);
  const d = (vals, s) => vals.map((v, k) => `${k ? 'L' : 'M'}${x(s + k).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return (
    <svg width={W} height={H} style={{ flexShrink: 0 }}>
      <path d={d(p, -(LEN - 1))} fill="none" stroke="#94a3b8" strokeWidth="1.2" />
      {n.length > 0 && <path d={d([0, ...n], 0)} fill="none" stroke={(n.at(-1) ?? 0) >= 0 ? UP : DOWN} strokeWidth="1.4" />}
    </svg>
  );
}
