'use client';

// 종목 관계 지도: 시총 상위 100종목이 최근 몇 달 동안 얼마나 같이 움직였는지(일별 수익률 상관계수)로 그룹을 나눠 보여준다.
// 상관 계산(약 4,950쌍)·그룹 나누기·기간 수익률은 VM 수집기에서 Oracle CORR() 로 (collector/src/network.js).
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Page, PageHeader, Segmented, Skel, Sheet, Avatar, CARD, DARK_CARD, MUTED, UP, DOWN, signColor } from '@/components/ui';
import { fetchNetwork } from '@/lib/toss';

const PALETTE = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#a855f7'];
const colorOf = (id) => (id == null || id < 0 ? '#94a3b8' : PALETTE[id % PALETTE.length]);
const PERIOD = { 60: '3개월', 120: '6개월', 250: '1년' };
const pct = (v) => (v == null ? '-' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`);
const bond = (c) => (c >= 0.7 ? '매우 강하게' : c >= 0.55 ? '강하게' : '꽤');
const groupName = (data, c) => `${data.nodes[c.members[0]].name} 그룹`;

export default function NetworkPage() {
  const router = useRouter();
  const [days, setDays] = useState(120);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [sort, setSort] = useState('ret');
  const [open, setOpen] = useState(null);  // 시트로 연 그룹 id
  const [sel, setSel] = useState(null);    // 고른 종목 index
  const [q, setQ] = useState('');
  const [showSmall, setShowSmall] = useState(false); // 2종목짜리 작은 그룹 펼치기

  useEffect(() => {
    let off = false;
    fetchNetwork(days).then((d) => { if (!off) { setData(d); setErr(''); } }).catch((e) => { if (!off) setErr(e.message); });
    return () => { off = true; };
  }, [days]);

  const corr = useMemo(() => {
    if (!data) return null;
    const m = Array.from({ length: data.nodes.length }, () => new Map());
    for (const [i, j, c] of data.pairs) { m[i].set(j, c); m[j].set(i, c); }
    return m;
  }, [data]);

  const groups = useMemo(() => {
    if (!data) return [];
    const key = { ret: (c) => -(c.ret ?? -999), size: (c) => -c.size, corr: (c) => -c.corr }[sort];
    return [...data.clusters].sort((a, b) => key(a) - key(b));
  }, [data, sort]);

  const goStock = (i) => router.push(`/?stock=${data.nodes[i].code}&name=${encodeURIComponent(data.nodes[i].name)}`);
  const pick = (i) => { setSel(i); setQ(''); setOpen(null); setTimeout(() => document.getElementById('stock-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); };
  const hits = q.trim() && data ? data.nodes.map((nd, i) => [nd, i]).filter(([nd]) => nd.name.includes(q.trim())).slice(0, 6) : [];
  const alone = data ? data.nodes.map((nd, i) => [nd, i]).filter(([nd]) => nd.cluster < 0) : [];

  return (
    <Page>
      <PageHeader title="관계 지도" sub="같이 오르고 같이 내리는 종목끼리 묶어 봤어요" />
      <div style={{ marginTop: 14 }}>
        <Segmented items={Object.entries(PERIOD).map(([k, v]) => [Number(k), v])} value={days}
          onChange={(v) => { setDays(v); setData(null); setSel(null); setOpen(null); }} />
      </div>

      {err && <div style={{ ...CARD, marginTop: 12 }}><p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>불러오지 못했어요 ({err})</p></div>}
      {!data && !err && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skel h={150} r={20} /><Skel h={86} r={20} /><Skel h={86} r={20} /><Skel h={86} r={20} />
        </div>
      )}

      {data && (
        <>
          <Hero data={data} days={days} onOpen={setOpen} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '22px 2px 10px' }}>
            <span style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>그룹 {data.clusters.length}개</span>
            <Segmented small items={[['ret', '수익률순'], ['corr', '결속력순'], ['size', '크기순']]} value={sort} onChange={setSort} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {groups.filter((c) => c.size >= 3 || showSmall).map((c) => <GroupCard key={c.id} c={c} data={data} onClick={() => setOpen(c.id)} />)}
          </div>
          {groups.some((c) => c.size < 3) && (
            <button onClick={() => setShowSmall((v) => !v)} style={{ marginTop: 10, width: '100%', padding: '12px 0', borderRadius: 14, border: 'none', background: 'white', fontSize: 13, fontWeight: 700, color: '#64748b', cursor: 'pointer' }}>
              {showSmall ? '작은 그룹 접기 ▲' : `2종목짜리 작은 그룹 ${groups.filter((c) => c.size < 3).length}개 더 보기 ▼`}
            </button>
          )}

          <p style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', margin: '26px 2px 10px' }}>종목으로 찾기</p>
          <div style={{ ...CARD, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f1f5f9', borderRadius: 12, padding: '0 12px' }}>
              <span style={{ fontSize: 14 }}>🔍</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="삼성전자, 카카오…"
                style={{ flex: 1, padding: '11px 0', border: 'none', background: 'transparent', fontSize: 14, outline: 'none' }} />
            </div>
            {hits.map(([nd, i]) => (
              <button key={nd.code} onClick={() => pick(i)} style={rowBtn}>
                <Avatar name={nd.name} symbol={nd.code} size={30} />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{nd.name}</span>
                <span style={{ fontSize: 12, color: MUTED }}>{nd.cluster >= 0 ? groupName(data, data.clusters.find((c) => c.id === nd.cluster)) : '혼자 움직임'}</span>
              </button>
            ))}
            {!q && sel == null && <p style={{ fontSize: 12, color: MUTED, margin: '10px 2px 0' }}>종목을 고르면 가장 같이 움직이는 종목과 반대로 움직이는 종목을 보여줘요</p>}
          </div>
          {sel != null && <StockCard i={sel} data={data} corr={corr} onPick={pick} onGo={goStock} onGroup={setOpen} onClose={() => setSel(null)} />}

          {alone.length > 0 && (
            <div style={{ ...CARD, marginTop: 12, padding: 14 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: '0 0 2px' }}>어느 그룹에도 없는 종목 {alone.length}개</p>
              <p style={{ fontSize: 12, color: MUTED, margin: '0 0 10px' }}>다른 종목과 따로, 자기 재료로 움직였어요</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {alone.map(([nd, i]) => (
                  <button key={nd.code} onClick={() => pick(i)} style={{ padding: '6px 11px', borderRadius: 999, border: 'none', background: '#f1f5f9', fontSize: 12, fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                    {nd.name} <span style={{ color: signColor(nd.ret), fontWeight: 700 }}>{pct(nd.ret)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <p style={{ fontSize: 11, color: MUTED, margin: '14px 4px 24px', lineHeight: 1.7 }}>
            시총 상위 {data.nodes.length}종목의 {data.from} ~ {data.to} 하루 등락률로 모든 짝({data.pairs.length.toLocaleString()}쌍)의 상관계수를 계산하고,
            평균 0.45 이상으로 같이 움직인 종목끼리 묶었어요. 업종 정보는 쓰지 않았어요. 수익률은 이 기간 첫날 종가 대비예요.
          </p>

          <Sheet open={open != null} onClose={() => setOpen(null)}>
            {open != null && <GroupSheet c={data.clusters.find((x) => x.id === open)} data={data} corr={corr} onPick={pick} />}
          </Sheet>
        </>
      )}
    </Page>
  );
}

const rowBtn = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 2px', background: 'none', border: 'none', borderTop: '1px solid #f1f5f9', cursor: 'pointer', textAlign: 'left' };

// 상단 요약: 가장 많이 오른 / 덜 오른 / 가장 똘똘 뭉친 그룹
function Hero({ data, days, onOpen }) {
  const cs = data.clusters.filter((c) => c.ret != null);
  if (!cs.length) return null;
  const top = cs.reduce((a, b) => (b.ret > a.ret ? b : a));
  const low = cs.reduce((a, b) => (b.ret < a.ret ? b : a));
  const tight = data.clusters.reduce((a, b) => (b.corr > a.corr ? b : a));
  const item = (label, c, value, color) => (
    <button onClick={() => onOpen(c.id)} style={{ flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 14, padding: '10px 10px', textAlign: 'left', cursor: 'pointer' }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'white', margin: '3px 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{groupName(data, c)}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color }}>{value}</div>
    </button>
  );
  return (
    <div style={{ ...DARK_CARD, marginTop: 14, padding: 18 }}>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: 0 }}>최근 {PERIOD[days]}</p>
      <p style={{ fontSize: 20, fontWeight: 800, color: 'white', margin: '4px 0 14px', lineHeight: 1.35 }}>
        시총 상위 100종목은<br /><span style={{ color: '#93c5fd' }}>{data.clusters.length}개 그룹</span>으로 움직였어요
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        {item('🚀 최고 상승', top, pct(top.ret), '#fca5a5')}
        {item(low.ret < 0 ? '🧊 최대 하락' : '🐢 최저 상승', low, pct(low.ret), low.ret < 0 ? '#93c5fd' : '#fca5a5')}
        {item('🤝 최고 결속', tight, `상관 ${tight.corr}`, '#fde68a')}
      </div>
    </div>
  );
}

function GroupCard({ c, data, onClick }) {
  const mem = c.members;
  return (
    <button onClick={onClick} style={{ ...CARD, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer', border: '1px solid #e2e8f0' }}>
      <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: colorOf(c.id), flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{groupName(data, c)}</div>
        <div style={{ fontSize: 12, color: MUTED, margin: '2px 0 8px' }}>{c.size}종목이 {bond(c.corr)} 같이 움직여요</div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {mem.slice(0, 5).map((i, k) => (
            <div key={i} style={{ marginLeft: k ? -8 : 0, border: '2px solid white', borderRadius: '50%' }}><Avatar name={data.nodes[i].name} symbol={data.nodes[i].code} size={24} /></div>
          ))}
          <span style={{ fontSize: 11, color: '#64748b', marginLeft: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {mem.slice(0, 3).map((i) => data.nodes[i].name).join(', ')}{mem.length > 3 ? ` 외 ${mem.length - 3}` : ''}
          </span>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: signColor(c.ret) }}>{pct(c.ret)}</div>
        <div style={{ fontSize: 11, color: MUTED }}>평균 수익률</div>
      </div>
    </button>
  );
}

// 그룹 상세 (바텀 시트): 요약 → 서로 얼마나 같이 움직였나(히트맵) → 종목 목록
function GroupSheet({ c, data, corr, onPick }) {
  const mem = c.members;
  const top = mem.slice(0, 7);
  const toGroup = (i) => { const o = mem.filter((j) => j !== i); return o.length ? o.reduce((a, j) => a + (corr[i].get(j) ?? 0), 0) / o.length : 0; };
  const cell = (v) => `rgba(${hex(colorOf(c.id))},${Math.max(0.06, Math.min(1, (v - 0.2) / 0.7))})`;
  return (
    <div style={{ maxHeight: '78vh', overflowY: 'auto' }}>
      <div style={{ width: 40, height: 4, borderRadius: 4, background: '#e2e8f0', margin: '-6px auto 14px' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: 10, background: colorOf(c.id) }} />
        <span style={{ fontSize: 19, fontWeight: 800, color: '#0f172a' }}>{groupName(data, c)}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, margin: '14px 0 18px' }}>
        {[['종목 수', `${c.size}개`, '#0f172a'], ['평균 수익률', pct(c.ret), signColor(c.ret)], ['결속력', `상관 ${c.corr}`, '#0f172a']].map(([l, v, col]) => (
          <div key={l} style={{ background: '#f8fafc', borderRadius: 14, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: MUTED }}>{l}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: col, marginTop: 2 }}>{v}</div>
          </div>
        ))}
      </div>

      {top.length >= 3 && (
        <>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: '0 0 2px' }}>얼마나 같이 움직였을까</p>
          <p style={{ fontSize: 11, color: MUTED, margin: '0 0 10px' }}>칸이 진할수록 같은 날 같은 방향으로 움직였어요</p>
          <div style={{ display: 'grid', gridTemplateColumns: `76px repeat(${top.length}, 1fr)`, gap: 3, marginBottom: 18 }}>
            <span />
            {top.map((j) => <span key={j} style={{ display: 'flex', justifyContent: 'center' }}><Avatar name={data.nodes[j].name} symbol={data.nodes[j].code} size={22} /></span>)}
            {top.map((i) => [
              <span key={`n${i}`} style={{ fontSize: 11, fontWeight: 600, color: '#334155', alignSelf: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.nodes[i].name}</span>,
              ...top.map((j) => {
                const v = i === j ? 1 : corr[i].get(j) ?? 0;
                return (
                  <span key={`${i}-${j}`} style={{ aspectRatio: '1', borderRadius: 6, background: i === j ? '#e2e8f0' : cell(v), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: v > 0.6 && i !== j ? 'white' : '#475569' }}>
                    {i === j ? '' : v.toFixed(1)}
                  </span>
                );
              }),
            ])}
          </div>
        </>
      )}

      <p style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>종목 {c.size}개</p>
      {mem.map((i) => (
        <button key={i} onClick={() => onPick(i)} style={rowBtn}>
          <Avatar name={data.nodes[i].name} symbol={data.nodes[i].code} size={34} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{data.nodes[i].name}</span>
            <span style={{ display: 'block', fontSize: 11, color: MUTED }}>그룹과의 상관 {toGroup(i).toFixed(2)}</span>
          </span>
          <span style={{ fontSize: 15, fontWeight: 800, color: signColor(data.nodes[i].ret) }}>{pct(data.nodes[i].ret)}</span>
        </button>
      ))}
    </div>
  );
}

function StockCard({ i, data, corr, onPick, onGo, onGroup, onClose }) {
  const nd = data.nodes[i];
  const g = data.clusters.find((c) => c.id === nd.cluster);
  const ps = [...corr[i].entries()].sort((a, b) => b[1] - a[1]);
  const line = (j, c) => (
    <button key={j} onClick={() => onPick(j)} style={rowBtn}>
      <Avatar name={data.nodes[j].name} symbol={data.nodes[j].code} size={30} />
      <span style={{ width: 96, fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.nodes[j].name}</span>
      <span style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${Math.max(3, Math.abs(c) * 100)}%`, background: c >= 0 ? UP : DOWN, borderRadius: 6 }} />
      </span>
      <span style={{ width: 34, textAlign: 'right', fontSize: 13, fontWeight: 800, color: c >= 0.3 ? UP : c <= -0.1 ? DOWN : '#64748b' }}>{c.toFixed(2)}</span>
    </button>
  );
  return (
    <div id="stock-card" style={{ ...CARD, marginTop: 12, scrollMarginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar name={nd.name} symbol={nd.code} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>{nd.name}</div>
          {g ? (
            <button onClick={() => onGroup(g.id)} style={{ fontSize: 12, fontWeight: 700, color: colorOf(g.id), background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>{groupName(data, g)} ›</button>
          ) : <span style={{ fontSize: 12, color: MUTED }}>어느 그룹에도 없이 혼자 움직여요</span>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: signColor(nd.ret) }}>{pct(nd.ret)}</div>
          <button onClick={onClose} style={{ fontSize: 11, color: MUTED, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>닫기 ✕</button>
        </div>
      </div>
      <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', margin: '16px 0 0' }}>가장 같이 움직이는 종목</p>
      {ps.slice(0, 5).map(([j, c]) => line(j, c))}
      <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', margin: '16px 0 0' }}>가장 따로 움직이는 종목</p>
      <p style={{ fontSize: 11, color: MUTED, margin: '2px 0 0' }}>같이 들고 있으면 위험을 나눠 줄 수 있는 종목이에요</p>
      {ps.slice(-3).reverse().map(([j, c]) => line(j, c))}
      <button onClick={() => onGo(i)} style={{ marginTop: 14, width: '100%', padding: '13px 0', borderRadius: 14, border: 'none', background: '#f1f5f9', fontSize: 14, fontWeight: 800, color: '#0f172a', cursor: 'pointer' }}>{nd.name} 차트·분석 보기</button>
    </div>
  );
}

const hex = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)).join(',');
