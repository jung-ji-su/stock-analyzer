'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { onStreamState, streamState, reconnectStream } from '@/lib/toss';

// 실시간 연결 상태: 'idle' | 'connecting' | 'live' | 'down'
export function useStreamState() {
  return useSyncExternalStore(onStreamState, streamState, () => 'idle');
}

const BADGE = { live: ['#22c55e', '실시간'], connecting: ['#94a3b8', '연결 중'], down: ['#ef4444', '끊김'] };

// 시세 옆에 붙이는 작은 상태 점
export function StreamBadge() {
  const s = useStreamState();
  if (!BADGE[s]) return null;
  const [color, label] = BADGE[s];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: color, boxShadow: s === 'live' ? `0 0 6px ${color}` : 'none' }} />
      {label}
    </span>
  );
}

// 화면 위쪽 알림: 4초 넘게 실시간이 안 붙어 있으면 보여주고, 다시 붙으면 2초간 '다시 연결됨'
export default function StreamStatus() {
  const [show, setShow] = useState(null); // null | 'down' | 'connecting' | 'back'

  useEffect(() => {
    let timer = null, shown = null;
    const set = (v) => { shown = v; setShow(v); };
    const off = onStreamState((s) => {
      clearTimeout(timer);
      if (s === 'live') {
        if (shown === 'down' || shown === 'connecting') { set('back'); timer = setTimeout(() => set(null), 2000); }
        else set(null);
      } else if (s === 'idle') set(null);
      else if (shown && shown !== 'back') set(s); // 이미 떠 있으면 문구만 바꾼다
      else timer = setTimeout(() => set(s), 4000); // 종목 바꿀 때처럼 잠깐 끊기는 건 보여주지 않는다
    });
    return () => { off(); clearTimeout(timer); };
  }, []);

  if (!show) return null;
  const back = show === 'back';
  return (
    <div role="status" style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 10px)', left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
      background: back ? '#065f46' : '#0f172a', color: '#fff', boxShadow: '0 6px 20px rgba(15,23,42,0.25)' }}>
      <span>{back ? '✅ 실시간 다시 연결됐어요' : show === 'down' ? '📡 실시간 연결이 끊겼어요 · 다시 연결 중' : '📡 실시간 연결 중…'}</span>
      {!back && (
        <button onClick={() => reconnectStream({ force: true })}
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          지금 연결
        </button>
      )}
    </div>
  );
}
