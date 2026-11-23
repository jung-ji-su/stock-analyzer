'use client';

// 종목 관계 지도: 시총 상위 100종목이 최근 몇 달 동안 얼마나 같이 움직였는지(일별 수익률 상관계수)를 네트워크로 그린다.
// 상관 계산(약 4,950쌍)과 무리 나누기는 VM 수집기에서 Oracle CORR() 로 (collector/src/network.js), 배치는 브라우저에서 힘 기반 시뮬레이션.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { Page, PageHeader, Segmented, Skel, CARD, H2, MUTED, UP, DOWN } from '@/components/ui';
import { fetchNetwork } from '@/lib/toss';

const PALETTE = ['#2563eb', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#a855f7'];
const colorOf = (c) => (c < 0 ? '#cbd5e1' : PALETTE[c % PALETTE.length]);
const EDGE_MIN = 0.55; // 이 이상 같이 움직이면 선으로 잇는다
const W = 360;

// 배치: 무리마다 해바라기 씨앗 모양(황금각 나선)으로 모으고, 무리를 3열 격자로 늘어놓는다. 혼자 움직이는 종목은 맨 아래 줄에.
// (힘 기반 배치는 모바일 폭에서 무리가 뭉개지거나 가장자리로 밀려 읽기 어려웠다)
function layout(data) {
  const pos = Array(data.nodes.length);
  const COLS = 3, cw = W / COLS;
  const blocks = data.clusters.map((c) => ({ c, r: 8 + Math.sqrt(c.size) * 8 }));
  const labels = [];
  let y = 0;
  for (let k = 0; k < blocks.length; k += COLS) {
    const row = blocks.slice(k, k + COLS);
    const rowH = Math.max(...row.map((b) => b.r)) * 2 + 26;
    row.forEach((b, col) => {
      const cx = cw * col + cw / 2, cy = y + 18 + rowH / 2 - 9;
      b.c.members.forEach((i, m) => {
        const rr = 7.5 * Math.sqrt(m), a = m * 2.39996;
        pos[i] = { x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr };
      });
      labels.push({ id: b.c.id, x: cx, y: y + 11, text: data.nodes[b.c.members[0]].name });
    });
    y += rowH;
  }
  const alone = data.nodes.map((nd, i) => (nd.cluster < 0 ? i : -1)).filter((i) => i >= 0);
  if (alone.length) {
    labels.push({ id: -1, x: W / 2, y: y + 14, text: '혼자 움직이는 종목' });
    const per = 14;
    alone.forEach((i, k) => { pos[i] = { x: 14 + (k % per) * ((W - 28) / (per - 1)), y: y + 30 + Math.floor(k / per) * 18 }; });
    y += 30 + Math.ceil(alone.length / per) * 18;
  }
  return { pos, labels, H: y + 6 };
}

export default function NetworkPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [days, setDays] = useState(120);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState(null);       // 고른 종목 index
  const [selCl, setSelCl] = useState(null);   // 고른 무리 id
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!user) return;
    let off = false;
    fetchNetwork(days).then((d) => { if (!off) { setData(d); setErr(''); } }).catch((e) => { if (!off) setErr(e.message); });
    return () => { off = true; };
  }, [user, days]);

  const { corr, edges, pos, labels, H } = useMemo(() => {
    if (!data) return {};
    const n = data.nodes.length;
    const corr = Array.from({ length: n }, () => new Map());
    for (const [i, j, c] of data.pairs) { corr[i].set(j, c); corr[j].set(i, c); }
    return { corr, edges: data.pairs.filter(([, , c]) => c >= EDGE_MIN), ...layout(data) };
  }, [data]);

  const partners = (i) => [...corr[i].entries()].sort((a, b) => b[1] - a[1]);
  const focus = sel != null ? new Set([sel, ...partners(sel).slice(0, 5).map(([j]) => j)]) : null;
  const dim = (i) => (focus ? !focus.has(i) : selCl != null ? data.nodes[i].cluster !== selCl : false);
  const hits = q.trim() && data ? data.nodes.map((nd, i) => [nd, i]).filter(([nd]) => nd.name.includes(q.trim())).slice(0, 6) : [];
  const pickNode = (i) => { setSel(sel === i ? null : i); setSelCl(null); setQ(''); };

  return (
    <Page>
      <PageHeader title="🕸️ 종목 관계 지도" sub="같이 오르고 같이 내리는 종목끼리 모아 봤어요" />
      <div style={{ marginTop: 12 }}>
        <Segmented items={[[60, '3개월'], [120, '6개월'], [250, '1년']]} value={days} onChange={(v) => { setDays(v); setData(null); setSel(null); setSelCl(null); }} />
      </div>

      {err && <div style={{ ...CARD, marginTop: 12 }}><p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>불러오지 못했어요 ({err})</p></div>}
      {!data && !err && <div style={{ ...CARD, marginTop: 12 }}><Skel h={340} /></div>}

      {data && (
        <>
          <div style={{ ...CARD, marginTop: 12, padding: 10 }}>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
              {labels.map((l) => (
                <text key={`l${l.id}`} x={l.x} y={l.y} fontSize="10" fontWeight="700" textAnchor="middle" fill={l.id < 0 ? MUTED : colorOf(l.id)}
                  opacity={selCl != null && selCl !== l.id ? 0.3 : 1} onClick={() => { if (l.id >= 0) { setSelCl(selCl === l.id ? null : l.id); setSel(null); } }}
                  style={{ cursor: 'pointer' }}>{l.text}{l.id >= 0 ? ' 무리' : ''}</text>
              ))}
              {/* 선: 고른 종목과 같이 움직이는 5종목, 또는 고른 무리 안의 강한 쌍 */}
              {sel != null && partners(sel).slice(0, 5).map(([j, c]) => (
                <line key={`s${j}`} x1={pos[sel].x} y1={pos[sel].y} x2={pos[j].x} y2={pos[j].y} stroke="#0f172a" strokeWidth={(c - 0.3) * 3} opacity="0.55" />
              ))}
              {sel == null && selCl != null && edges.filter(([i, j]) => data.nodes[i].cluster === selCl && data.nodes[j].cluster === selCl).map(([i, j, c]) => (
                <line key={`${i}-${j}`} x1={pos[i].x} y1={pos[i].y} x2={pos[j].x} y2={pos[j].y} stroke={colorOf(selCl)} strokeWidth={(c - 0.4) * 2.5} opacity="0.35" />
              ))}
              {data.nodes.map((nd, i) => (
                <circle key={nd.code} cx={pos[i].x} cy={pos[i].y} r={sel === i ? 7 : 4.6} fill={colorOf(nd.cluster)}
                  stroke="white" strokeWidth="1.5" opacity={dim(i) ? 0.18 : 1} onClick={() => pickNode(i)} style={{ cursor: 'pointer' }} />
              ))}
              {/* 이름은 고른 종목만 (같은 무리 안 종목은 서로 가까워 이름이 겹친다 — 짝 종목은 아래 목록에) */}
              {data.nodes.map((nd, i) => sel === i && (
                <text key={`t${i}`} x={pos[i].x} y={pos[i].y - 9} fontSize="9" fontWeight={sel === i ? 800 : 600} fill="#0f172a" textAnchor="middle"
                  style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: 3, pointerEvents: 'none' }}>{nd.name}</text>
              ))}
            </svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="종목 찾기"
              style={{ width: '100%', marginTop: 6, padding: '8px 10px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} />
            {hits.map(([nd, i]) => (
              <button key={nd.code} onClick={() => pickNode(i)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 4px', background: 'none', border: 'none', borderTop: '1px solid #f1f5f9', fontSize: 13, cursor: 'pointer' }}>
                <span style={{ color: colorOf(nd.cluster) }}>●</span> {nd.name}
              </button>
            ))}
            <p style={{ fontSize: 10, color: MUTED, margin: '6px 2px 0' }}>점을 누르면 그 종목과 가장 같이 움직이는 5종목이 선으로 이어져요 · 무리 이름을 누르면 그 무리만 보여요</p>
          </div>

          {sel != null && <Detail i={sel} data={data} partners={partners(sel)} onPick={pickNode} onOpen={(nd) => router.push(`/?stock=${nd.code}&name=${encodeURIComponent(nd.name)}`)} />}

          <div style={{ ...CARD, marginTop: 12, padding: '12px 14px' }}>
            <p style={{ ...H2, fontSize: 14, marginBottom: 4 }}>같이 움직이는 무리 {data.clusters.length}개</p>
            <p style={{ fontSize: 10, color: MUTED, margin: '0 0 6px' }}>업종 정보 없이 주가 움직임만으로 묶었어요. 이름은 무리를 가장 잘 대표하는 두 종목</p>
            {data.clusters.map((c) => (
              <button key={c.id} onClick={() => { setSelCl(selCl === c.id ? null : c.id); setSel(null); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 6px', background: selCl === c.id ? '#f8fafc' : 'none', border: 'none', borderTop: '1px solid #f1f5f9', borderRadius: 8, cursor: 'pointer' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 10, background: colorOf(c.id), flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{c.label} 무리</span>
                  <span style={{ fontSize: 11, color: MUTED }}>{c.size}종목 · 평균 상관 {c.corr}</span>
                </span>
                {selCl === c.id && (
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6, paddingLeft: 18 }}>
                    {c.members.map((i) => (
                      <span key={i} onClick={(e) => { e.stopPropagation(); pickNode(i); }}
                        style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'white', border: '1px solid #e2e8f0', color: '#334155' }}>{data.nodes[i].name}</span>
                    ))}
                  </span>
                )}
              </button>
            ))}
            {data.nodes.some((nd) => nd.cluster < 0) && (
              <p style={{ fontSize: 11, color: MUTED, margin: '8px 0 0' }}>
                <span style={{ color: '#cbd5e1' }}>●</span> 혼자 움직이는 종목 {data.nodes.filter((nd) => nd.cluster < 0).length}개 (어느 무리와도 평균 상관 0.45 미만)
              </p>
            )}
          </div>

          <p style={{ fontSize: 10, color: MUTED, margin: '10px 4px 20px', lineHeight: 1.6 }}>
            상관계수: 두 종목의 하루 등락이 얼마나 같은 방향으로 움직였는지 (1 = 똑같이, 0 = 상관없음, −1 = 정반대).
            시총 상위 {data.nodes.length}종목 · {data.from} ~ {data.to} ({days}거래일) · Oracle DB 에서 {data.pairs.length.toLocaleString()}쌍 계산
          </p>
        </>
      )}
    </Page>
  );
}

function Detail({ i, data, partners, onPick, onOpen }) {
  const nd = data.nodes[i];
  const cl = data.clusters.find((c) => c.id === nd.cluster);
  const bar = (j, c) => (
    <button key={j} onClick={() => onPick(j)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 0', background: 'none', border: 'none', cursor: 'pointer' }}>
      <span style={{ width: 92, fontSize: 12, fontWeight: 600, color: '#0f172a', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.nodes[j].name}</span>
      <span style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 4, position: 'relative' }}>
        <span style={{ position: 'absolute', top: 0, bottom: 0, left: c >= 0 ? '50%' : `${50 + c * 50}%`, width: `${Math.abs(c) * 50}%`, background: c >= 0 ? UP : DOWN, borderRadius: 4 }} />
      </span>
      <span style={{ width: 36, textAlign: 'right', fontSize: 12, fontWeight: 800, color: c >= 0 ? UP : DOWN }}>{c.toFixed(2)}</span>
    </button>
  );
  return (
    <div style={{ ...CARD, marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <p style={{ ...H2 }}><span style={{ color: colorOf(nd.cluster) }}>●</span> {nd.name}</p>
        <button onClick={() => onOpen(nd)} style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>종목 보기 ›</button>
      </div>
      <p style={{ fontSize: 11, color: MUTED, margin: '2px 0 10px' }}>{cl ? `${cl.label} 무리 (${cl.size}종목)` : '어느 무리에도 속하지 않고 혼자 움직여요'}</p>
      <p style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', margin: '0 0 2px' }}>가장 같이 움직이는 종목</p>
      {partners.slice(0, 5).map(([j, c]) => bar(j, c))}
      <p style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', margin: '10px 0 2px' }}>가장 따로 움직이는 종목</p>
      {partners.slice(-3).reverse().map(([j, c]) => bar(j, c))}
    </div>
  );
}
