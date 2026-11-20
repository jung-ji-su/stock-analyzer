'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchScreens } from '@/lib/toss';

const TABS = [
  ['foreign', '외국인 연속', '외국인이 며칠째 연속으로 순매수 중인 종목'],
  ['institution', '기관 연속', '기관이 며칠째 연속으로 순매수 중인 종목'],
  ['both', '동반 순매수', '외국인과 기관이 같은 날 함께 순매수한 날이 이어지는 종목'],
  ['nearHigh', '52주 신고가', '1년 최고가에서 5% 안쪽까지 올라온 종목'],
];
const pct = (v) => (v == null ? '-' : `${v > 0 ? '+' : ''}${v}%`);
const col = (v) => (v > 0 ? '#ef4444' : v < 0 ? '#3b82f6' : '#64748b');
const card = { background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(15,23,42,0.06)', padding: 14, marginBottom: 12 };

// 시총 상위 100종목, VM 수집기가 Oracle DB 에 쌓은 일봉·수급으로 계산 (하루 한 번, 장 마감 후 갱신)
export default function DbScreens() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('foreign');
  useEffect(() => { fetchScreens().then(setData).catch((e) => setErr(e.message)); }, []);

  const [, , desc] = TABS.find((t) => t[0] === tab);
  const rows = data?.[tab] || [];
  const open = (s) => router.push(`/?stock=${s.code}&name=${encodeURIComponent(s.name)}`);

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10 }}>
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ flexShrink: 0, padding: '7px 13px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none',
              background: tab === k ? '#0f172a' : 'white', color: tab === k ? 'white' : '#475569', boxShadow: tab === k ? 'none' : '0 1px 3px rgba(15,23,42,0.08)' }}>{label}</button>
        ))}
      </div>

      <div style={card}>
        <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 8px' }}>{desc}</p>
        {err && <p style={{ fontSize: 12, color: '#dc2626' }}>불러오지 못했어요 ({err})</p>}
        {!data && !err && <p style={{ fontSize: 12, color: '#94a3b8' }}>불러오는 중…</p>}
        {data && !rows.length && <p style={{ fontSize: 12, color: '#94a3b8' }}>조건에 맞는 종목이 없어요.</p>}
        {rows.map((s, i) => (
          <button key={s.code} onClick={() => open(s)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 2px', background: 'none', border: 'none', borderTop: i ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ width: 20, fontSize: 12, fontWeight: 800, color: '#94a3b8' }}>{i + 1}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.name}{s.newHigh && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: '#ef4444', background: '#fef2f2', padding: '1px 6px', borderRadius: 6 }}>신고가</span>}
              </span>
              <span style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                {tab === 'nearHigh'
                  ? `최고가 대비 ${pct(s.fromHigh)} · 거래량 평소의 ${s.volRatio ?? '-'}배`
                  : `${s.streak}일 연속 · 순매수 ${Math.round(s.netSum).toLocaleString()}주${s.strength != null ? ` (하루 거래량의 ${s.strength}%)` : ''}`}
              </span>
            </span>
            <span style={{ textAlign: 'right' }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{s.price ? Math.round(s.price).toLocaleString() : '-'}</span>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: col(s.change) }}>{pct(s.change)}</span>
            </span>
          </button>
        ))}
      </div>

      {data && (
        <p style={{ fontSize: 10, color: '#94a3b8', margin: '0 4px 12px', lineHeight: 1.6 }}>
          시가총액 상위 100종목 · 수급 {data.flowDate} 기준(최근 {data.flowDays}거래일 보관) · 가격 {data.barDate} 종가 기준. 매일 장 마감 후 갱신돼요.
          {tab !== 'nearHigh' && ' 연속 일수는 보관 중인 기간 안에서만 세요.'}
        </p>
      )}
    </div>
  );
}
