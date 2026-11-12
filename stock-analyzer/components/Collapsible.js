'use client';

import { useState } from 'react';

// 접고 펼 수 있는 섹션. 접으면 내용은 렌더하지 않는다(호가 웹소켓 등도 끊김). 상태는 storageKey 로 기기에 기억.
export default function Collapsible({ title, storageKey, defaultOpen = true, children }) {
  const [open, setOpen] = useState(() => {
    try { const v = localStorage.getItem(`ui:${storageKey}`); if (v === '1') return true; if (v === '0') return false; } catch {}
    return defaultOpen;
  });
  const toggle = () => {
    setOpen((o) => { try { localStorage.setItem(`ui:${storageKey}`, o ? '0' : '1'); } catch {} return !o; });
  };
  return (
    <div style={{ marginBottom: open ? 0 : 12 }}>
      <button onClick={toggle} aria-expanded={open}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 6px', margin: '0 0 4px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 800, color: '#334155' }}>
        <span>{title}</span>
        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>{open ? '접기 ▲' : '펼치기 ▼'}</span>
      </button>
      {open && children}
    </div>
  );
}
