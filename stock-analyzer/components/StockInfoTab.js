'use client';

import { useEffect, useState } from 'react';

const RED = '#ef4444', BLUE = '#3b82f6';
const card = { background: 'white', borderRadius: 22, border: '1px solid #e2e8f0', boxShadow: '0 2px 16px rgba(0,0,0,0.06)', padding: 18, marginBottom: 12 };
const h3 = { fontSize: 15, fontWeight: 800, color: '#0f172a', margin: '0 0 12px' };
const colorOf = (n) => (n > 0 ? RED : n < 0 ? BLUE : '#64748b');
const fmtShares = (n) => {
  if (n == null) return '-';
  const a = Math.abs(n), s = n > 0 ? '+' : n < 0 ? '-' : '';
  return a >= 10000 ? `${s}${Math.round(a / 10000).toLocaleString()}만` : `${s}${a.toLocaleString()}`;
};
const fmtEok = (n) => (n >= 10000 ? `${Math.floor(n / 10000).toLocaleString()}조${n % 10000 ? ` ${(n % 10000).toLocaleString()}억` : ''}` : `${n.toLocaleString()}억`);
const RECOMM = (m) => (m >= 4.5 ? '적극 매수' : m >= 3.5 ? '매수' : m >= 2.5 ? '중립' : m >= 1.5 ? '매도' : '적극 매도');

// 종목정보 탭 (국내 종목). 토스 종목정보 화면 구성을 따른다. 종목이 바뀌면 부모에서 key로 다시 마운트한다.
export default function StockInfoTab({ symbol, name, onPick }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [news, setNews] = useState(null);
  const [feed, setFeed] = useState('news');

  useEffect(() => {
    let alive = true;
    fetch(`/api/stock-detail?symbol=${symbol}`).then((r) => r.json()).then((j) => {
      if (!alive) return;
      if (j.error) setErr(j.error); else setD(j);
    }).catch(() => alive && setErr('종목정보를 불러오지 못했습니다'));
    fetch(`/api/news?q=${encodeURIComponent(name)}`).then((r) => r.json()).then((j) => alive && setNews(j.articles || [])).catch(() => alive && setNews([]));
    return () => { alive = false; };
  }, [symbol, name]);

  if (err) return <div style={{ ...card, color: '#dc2626', fontSize: 13, fontWeight: 600 }}>⚠️ {err}</div>;
  if (!d) return <div style={{ ...card, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>종목정보 불러오는 중…</div>;

  const ind = d.indicators;
  const tiles = [
    ['시가총액', ind.marketValue], ['배당수익률', ind.dividendYield], ['PBR', ind.pbr],
    ['PER', ind.per], ['추정 PER', ind.cnsPer], ['ROE(EPS/BPS)', ind.roe],
    ['EPS', ind.eps], ['BPS', ind.bps], ['외국인소진율', ind.foreignRate],
  ];
  const inv = d.investorToday;
  const invMax = inv ? Math.max(Math.abs(inv.individual || 0), Math.abs(inv.foreigner || 0), Math.abs(inv.institution || 0), 1) : 1;
  const pos52 = d.price && ind.high52 > ind.low52 ? Math.min(100, Math.max(0, ((d.price - ind.low52) / (ind.high52 - ind.low52)) * 100)) : null;

  return (
    <div>
      <div style={card}>
        <h3 style={{ ...h3, marginBottom: 4 }}>투자 지표</h3>
        {ind.asOf && <p style={{ fontSize: 10, color: '#94a3b8', margin: '0 0 10px' }}>{ind.asOf} 기준 (출처: 네이버 금융)</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {tiles.map(([label, v]) => (
            <div key={label} style={{ background: '#f8fafc', borderRadius: 14, padding: '12px 6px', textAlign: 'center', border: '1px solid #f1f5f9' }}>
              <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, margin: '0 0 4px' }}>{label}</p>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', margin: 0 }}>{v || '-'}</p>
            </div>
          ))}
        </div>
        {pos52 !== null && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 6 }}>
              <span>52주 최저 {ind.low52.toLocaleString()}</span><span>52주 최고 {ind.high52.toLocaleString()}</span>
            </div>
            <div style={{ position: 'relative', height: 6, background: '#e2e8f0', borderRadius: 6 }}>
              <div style={{ position: 'absolute', left: `calc(${pos52}% - 6px)`, top: -3, width: 12, height: 12, borderRadius: '50%', background: '#6366f1', border: '2px solid white', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }} />
            </div>
          </div>
        )}
      </div>

      {inv && (
        <div style={card}>
          <h3 style={h3}>투자자 동향 <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>· 최근 거래일 순매수(주)</span></h3>
          {[['개인', inv.individual], ['외국인', inv.foreigner], ['기관', inv.institution]].map(([label, v]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ width: 44, fontSize: 12, color: '#64748b', fontWeight: 600 }}>{label}</span>
              <span style={{ width: 56, fontSize: 13, fontWeight: 800, color: colorOf(v), textAlign: 'right' }}>{fmtShares(v)}</span>
              <div style={{ flex: 1, position: 'relative', height: 8, background: '#f1f5f9', borderRadius: 8 }}>
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: `${(Math.abs(v || 0) / invMax) * 50}%`,
                  transform: v < 0 ? 'translateX(-100%)' : 'none', background: colorOf(v), borderRadius: 8 }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {d.consensus && (
        <div style={card}>
          <h3 style={h3}>증권사 컨센서스</h3>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, background: '#f8fafc', borderRadius: 14, padding: 12, textAlign: 'center' }}>
              <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, margin: '0 0 4px' }}>평균 목표주가</p>
              <p style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0 }}>{d.consensus.target.toLocaleString()}원</p>
              {d.price && <p style={{ fontSize: 11, fontWeight: 700, color: colorOf(d.consensus.target - d.price), margin: '2px 0 0' }}>
                현재가 대비 {((d.consensus.target / d.price - 1) * 100).toFixed(1)}%</p>}
            </div>
            {d.consensus.recomm && (
              <div style={{ flex: 1, background: '#f8fafc', borderRadius: 14, padding: 12, textAlign: 'center' }}>
                <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, margin: '0 0 4px' }}>투자의견 평균</p>
                <p style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0 }}>{d.consensus.recomm.toFixed(2)} / 5</p>
                <p style={{ fontSize: 11, fontWeight: 700, color: RED, margin: '2px 0 0' }}>{RECOMM(d.consensus.recomm)}</p>
              </div>
            )}
          </div>
          <p style={{ fontSize: 10, color: '#94a3b8', margin: '8px 0 0' }}>{d.consensus.date} 기준</p>
        </div>
      )}

      {d.peers.length > 0 && (
        <div style={card}>
          <h3 style={h3}>동일 업종 종목</h3>
          {d.peers.map((p) => (
            <button key={p.code} onClick={() => onPick?.({ symbol: p.code, name: p.name })}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', background: 'none', border: 'none', borderTop: '1px solid #f1f5f9', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0 }}>{p.name}</p>
                <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>시총 {fmtEok(p.marketValue || 0)}</p>
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{p.price?.toLocaleString()}원</span>
              <span style={{ width: 54, textAlign: 'right', fontSize: 12, fontWeight: 700, color: colorOf(p.rate) }}>{p.rate > 0 ? '+' : ''}{p.rate}%</span>
            </button>
          ))}
        </div>
      )}

      <div style={card}>
        <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 12, padding: 3, marginBottom: 12 }}>
          {[['news', '뉴스'], ['disc', '공시']].map(([k, label]) => (
            <button key={k} onClick={() => setFeed(k)}
              style={{ flex: 1, padding: '8px 0', fontSize: 13, fontWeight: 700, borderRadius: 10, border: 'none', cursor: 'pointer',
                background: feed === k ? 'white' : 'transparent', color: feed === k ? '#0f172a' : '#94a3b8',
                boxShadow: feed === k ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>{label}</button>
          ))}
        </div>
        {feed === 'news' ? (
          news === null ? <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>불러오는 중…</p>
          : news.length === 0 ? <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>뉴스가 없습니다</p>
          : news.map((a, i) => (
            <a key={i} href={a.link} target="_blank" rel="noopener noreferrer"
              style={{ display: 'block', textDecoration: 'none', padding: '10px 0', borderTop: i ? '1px solid #f1f5f9' : 'none' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.5, margin: '0 0 3px' }}>{a.title}</p>
              <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>{a.press} · {a.time}</p>
            </a>
          ))
        ) : d.disclosures.length === 0 ? (
          <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>공시가 없습니다</p>
        ) : d.disclosures.map((x, i) => (
          <div key={i} style={{ padding: '10px 0', borderTop: i ? '1px solid #f1f5f9' : 'none' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.5, margin: '0 0 3px' }}>{x.title}</p>
            <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>{x.author} · {x.datetime?.slice(0, 10).replace(/-/g, '.')}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
