'use client';

// 타임머신 매매 게임: 과거 어느 날까지의 차트만 보고 산다/관망/판다 → 1주 뒤 결과와 같은 날 AI 엔진의 판단을 공개.
// 문제·결과는 VM 수집기(Oracle DB의 3년치 일봉 + 분석 엔진, collector/src/timemachine.js), 누적 점수는 profiles/{uid}.timeMachine.
import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { Page, PageHeader, Skel, CARD, MUTED, UP, DOWN, signColor } from '@/components/ui';
import { fetchTmRound, fetchTmReveal } from '@/lib/toss';

const CHOICES = [['buy', '📈 산다', UP], ['hold', '✋ 관망', '#64748b'], ['sell', '📉 판다', DOWN]];
const LABEL = { buy: '산다', hold: '관망', sell: '판다(공매도)' };
const fmt = (v) => `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}%`;
const EMPTY = { played: 0, me: 0, ai: 0, meWins: 0, aiWins: 0 };

export default function TimeMachine() {
  const { user } = useAuth();
  const [round, setRound] = useState(null);
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const next = async () => {
    setBusy(true); setErr(''); setResult(null);
    try {
      const r = await fetchTmRound();
      if (r.error) throw new Error(r.error);
      setRound(r);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'profiles', user.uid)).then((s) => setStats({ ...EMPTY, ...(s.data()?.timeMachine || {}) })).catch(() => {});
    next();
  }, [user]);

  const choose = async (choice) => {
    setBusy(true); setErr('');
    try {
      const r = await fetchTmReveal(round.round, choice);
      if (r.error) throw new Error(r.error);
      setResult(r);
      // 승리 = 상대보다 수익이 높을 때 (같으면 둘 다 아님)
      const d = { played: 1, me: r.me.pnl, ai: r.ai.pnl, meWins: r.me.pnl > r.ai.pnl ? 1 : 0, aiWins: r.ai.pnl > r.me.pnl ? 1 : 0 };
      setStats((s) => Object.fromEntries(Object.keys(EMPTY).map((k) => [k, Math.round(((s[k] || 0) + d[k]) * 100) / 100])));
      updateDoc(doc(db, 'profiles', user.uid), Object.fromEntries(Object.entries(d).map(([k, v]) => [`timeMachine.${k}`, increment(v)]))).catch(() => {});
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <Page>
      <PageHeader title="⏳ 타임머신" sub="과거의 어느 날로 갑니다. 이 종목, 1주일 뒤 오를까?" />

      <div style={{ ...CARD, marginTop: 14, padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', textAlign: 'center' }}>
        <Side label="🙋 나" total={stats.me} wins={stats.meWins} />
        <span style={{ fontSize: 11, color: MUTED }}>{stats.played}판<br />VS</span>
        <Side label="🤖 AI 엔진" total={stats.ai} wins={stats.aiWins} />
      </div>

      {err && <div style={{ ...CARD, marginTop: 12 }}><p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>{err}</p></div>}
      {!round && !err && <div style={{ ...CARD, marginTop: 12 }}><Skel h={220} /></div>}

      {round && (
        <div style={{ ...CARD, marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{result ? `${result.name}` : '❓ 어떤 종목일까요'}</span>
            <span style={{ fontSize: 11, color: MUTED }}>{result ? result.date : '날짜 비공개'}</span>
          </div>
          <Candles bars={round.bars} future={result?.future} />
          <p style={{ fontSize: 10, color: MUTED, margin: '4px 0 0' }}>
            {result ? `실제 가격: 그날 종가 ${Math.round(result.price).toLocaleString()}원 · 점선 오른쪽이 그 뒤 20거래일 (진한 5개가 1주)` : '최근 6개월 일봉 · 가격은 마지막 날 종가를 10,000으로 바꿔서 보여줘요'}
          </p>

          {!result ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
              {CHOICES.map(([k, label, c]) => (
                <button key={k} onClick={() => choose(k)} disabled={busy}
                  style={{ padding: '14px 0', borderRadius: 14, border: `1.5px solid ${c}`, background: 'white', color: c, fontSize: 15, fontWeight: 800, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>{label}</button>
              ))}
            </div>
          ) : (
            <Reveal r={result} onNext={next} busy={busy} />
          )}
        </div>
      )}

      <p style={{ fontSize: 10, color: MUTED, margin: '10px 4px 20px', lineHeight: 1.6 }}>
        시총 상위 100종목의 3년치 일봉에서 무작위로 문제를 내요. 산다 = 1주(5거래일) 뒤 등락만큼, 판다 = 반대로(공매도), 관망 = 0%.
        AI는 같은 날까지의 일봉만으로 엔진을 돌려 1주 전망이 상승이면 사고, 하락이면 팔고, 횡보면 관망해요.
      </p>
    </Page>
  );
}

function Side({ label, total, wins }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: '#475569', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: signColor(total) }}>{fmt(total || 0)}</div>
      <div style={{ fontSize: 10, color: MUTED }}>{wins || 0}승</div>
    </div>
  );
}

function Reveal({ r, onNext, busy }) {
  const meWin = r.me.pnl > r.ai.pnl, aiWin = r.ai.pnl > r.me.pnl;
  const row = (who, x, win) => (
    <div style={{ flex: 1, background: win ? '#fef2f2' : '#f8fafc', border: win ? '1.5px solid #fecaca' : '1.5px solid transparent', borderRadius: 14, padding: '10px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: '#64748b' }}>{who} {win && '🏆'}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '2px 0' }}>{LABEL[x.choice]}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: signColor(x.pnl) }}>{fmt(x.pnl)}</div>
    </div>
  );
  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ fontSize: 13, color: '#0f172a', margin: '0 0 8px', textAlign: 'center' }}>
        1주 뒤 <b style={{ color: signColor(r.ret), fontSize: 16 }}>{fmt(r.ret)}</b> {meWin ? '— 이겼어요! 🎉' : aiWin ? '— AI가 이겼어요' : '— 비겼어요'}
      </p>
      <div style={{ display: 'flex', gap: 8 }}>{row('🙋 나', r.me, meWin)}{row('🤖 AI', r.ai, aiWin)}</div>
      <div style={{ marginTop: 10, background: '#f8fafc', borderRadius: 12, padding: '10px 12px' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#334155', margin: '0 0 4px' }}>
          AI의 판단: 1주 {r.ai.prediction} (상승 {r.ai.probs.up}% · 횡보 {r.ai.probs.side}% · 하락 {r.ai.probs.down}%) · 매수점수 {r.ai.score}
        </p>
        {r.ai.reasons.map((s) => (
          <p key={s.label} style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>
            <span style={{ color: s.type === 'bullish' ? UP : DOWN }}>{s.type === 'bullish' ? '▲' : '▼'}</span> {s.easy}
          </p>
        ))}
      </div>
      <button onClick={onNext} disabled={busy}
        style={{ marginTop: 12, width: '100%', padding: '13px 0', borderRadius: 14, border: 'none', background: '#0f172a', color: 'white', fontSize: 14, fontWeight: 800, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
        {busy ? '시간 여행 중…' : '⏳ 다음 문제'}
      </button>
    </div>
  );
}

// 캔들 차트 (SVG). future 가 있으면 점선 오른쪽에 이어서, 1주(5개)는 진하게 나머지는 흐리게
function Candles({ bars, future = null }) {
  const W = 340, H = 200, PAD = { l: 4, r: 40, t: 8, b: 8 };
  const all = future ? [...bars, ...future] : bars;
  const slots = bars.length + (future ? 20 : 0);
  const lo = Math.min(...all.map((b) => b.low)), hi = Math.max(...all.map((b) => b.high));
  const step = (W - PAD.l - PAD.r) / slots;
  const x = (i) => PAD.l + step * (i + 0.5);
  const y = (v) => PAD.t + ((hi - v) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const bw = Math.max(1, step * 0.7);
  const ticks = [hi, (hi + lo) / 2, lo];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#f1f5f9" />
          <text x={W - PAD.r + 3} y={y(t) + 3} fontSize="9" fill={MUTED}>{Math.round(t).toLocaleString()}</text>
        </g>
      ))}
      {future && <line x1={x(bars.length - 0.5)} x2={x(bars.length - 0.5)} y1={PAD.t} y2={H - PAD.b} stroke="#94a3b8" strokeDasharray="3 3" />}
      {all.map((b, i) => {
        const up = b.close >= b.open, c = up ? UP : DOWN;
        const fut = i >= bars.length, op = fut && i >= bars.length + 5 ? 0.35 : 1;
        return (
          <g key={i} opacity={op}>
            <line x1={x(i)} x2={x(i)} y1={y(b.high)} y2={y(b.low)} stroke={c} strokeWidth="0.8" />
            <rect x={x(i) - bw / 2} y={y(Math.max(b.open, b.close))} width={bw} height={Math.max(0.8, Math.abs(y(b.open) - y(b.close)))} fill={c} />
          </g>
        );
      })}
    </svg>
  );
}
