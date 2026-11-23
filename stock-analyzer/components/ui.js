'use client';

// 화면 공통 스타일 (홈·종목·재무분석 화면 기준). 새 화면은 이 조각을 가져다 쓴다.
import { motion } from 'framer-motion';

const BG = '#F0F4F8';
export const UP = '#ef4444', DOWN = '#3b82f6';
export const CARD = { background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(15,23,42,0.06)', padding: 16 };
export const DARK_CARD = { borderRadius: 20, overflow: 'hidden', position: 'relative', background: 'linear-gradient(145deg, #0f172a 0%, #1e3a5f 55%, #1e40af 100%)', boxShadow: '0 8px 24px rgba(15,23,42,0.18)' };
export const H2 = { fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0 };
export const MUTED = '#94a3b8';
export const fade = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } };
export const signColor = (v) => (v > 0 ? UP : v < 0 ? DOWN : '#64748b');

// 페이지 바탕 + 세로 간격 12
export function Page({ children, max = 640 }) {
  return (
    <main style={{ minHeight: '100vh', background: BG, paddingBottom: 96 }}>
      <div style={{ maxWidth: max, margin: '0 auto', padding: '20px 14px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </main>
  );
}

export function PageHeader({ title, sub, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 2px', letterSpacing: '-0.4px' }}>{title}</h1>
        {sub && <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

// 회색 바탕 세그먼트 탭. items: [[key, label], ...]
export function Segmented({ items, value, onChange, small = false }) {
  return (
    <div style={{ display: 'flex', background: small ? '#f1f5f9' : '#e2e8f0', borderRadius: small ? 10 : 14, padding: small ? 2 : 3 }}>
      {items.map(([k, label]) => (
        <button key={k} onClick={() => onChange(k)}
          style={{ flex: small ? 'none' : 1, padding: small ? '5px 12px' : '9px 0', borderRadius: small ? 8 : 11, fontSize: small ? 12 : 13, fontWeight: small ? 700 : 800, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
            transition: 'background 0.2s ease, color 0.2s ease',
            background: value === k ? 'white' : 'transparent', color: value === k ? '#0f172a' : '#64748b', boxShadow: value === k ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
          {label}
        </button>
      ))}
    </div>
  );
}

// 둥근 칩 (필터용)
export function Chip({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      style={{ flexShrink: 0, padding: '6px 13px', borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', border: 'none', cursor: 'pointer', background: active ? '#0f172a' : '#f1f5f9', color: active ? '#fff' : '#64748b' }}>
      {children}
    </button>
  );
}

export function Empty({ icon = '📭', title, sub }) {
  return (
    <div style={{ ...CARD, textAlign: 'center', padding: '36px 16px' }}>
      <p style={{ fontSize: 30, margin: '0 0 8px' }}>{icon}</p>
      <p style={{ fontSize: 14, fontWeight: 700, color: '#475569', margin: '0 0 4px' }}>{title}</p>
      {sub && <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>{sub}</p>}
    </div>
  );
}

// 로딩 자리표시 (반짝이는 회색 상자)
// 게스트(로그인 안 함)에게 보여주는 안내: 이 화면은 로그인해야 볼 수 있어요
export function LoginNeeded({ title = '로그인이 필요한 화면이에요', sub, onLogin }) {
  return (
    <div style={{ ...CARD, marginTop: 14, textAlign: 'center', padding: 28 }}>
      <div style={{ fontSize: 40 }}>🔒</div>
      <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '8px 0 4px' }}>{title}</p>
      {sub && <p style={{ fontSize: 12, color: MUTED, margin: 0, lineHeight: 1.6 }}>{sub}</p>}
      <button onClick={onLogin} style={{ marginTop: 14, padding: '10px 18px', borderRadius: 12, border: 'none', background: '#2563eb', color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>로그인하기</button>
    </div>
  );
}

export function Skel({ h = 16, w = '100%', r = 12, style }) {
  return (
    <>
      <div className="ui-sk" style={{ height: h, width: w, borderRadius: r, ...style }} />
      <style>{`.ui-sk{background:linear-gradient(90deg,#e9eef5 25%,#f4f7fb 50%,#e9eef5 75%);background-size:200% 100%;animation:uiSk 1.4s infinite}@keyframes uiSk{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </>
  );
}

// 아래에서 올라오는 시트
export function Sheet({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <motion.div onClick={(e) => e.stopPropagation()} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        style={{ width: '100%', maxWidth: 480, background: 'white', borderRadius: '22px 22px 0 0', padding: '18px 18px calc(18px + env(safe-area-inset-bottom, 0px))' }}>
        {children}
      </motion.div>
    </div>
  );
}

// 종목 이니셜 원형 아바타 (이름으로 색을 고른다)
const PALETTES = [['#6366F1', '#8B5CF6'], ['#0EA5E9', '#06B6D4'], ['#10B981', '#34D399'], ['#F59E0B', '#F97316'], ['#EF4444', '#EC4899'], ['#14B8A6', '#06B6D4']];
export function Avatar({ name = '', symbol = '', size = 38 }) {
  const seed = [...String(symbol || name)].reduce((a, c) => a + c.charCodeAt(0), 0);
  const [c1, c2] = PALETTES[seed % PALETTES.length];
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, background: `linear-gradient(135deg,${c1},${c2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.4), fontWeight: 800, color: 'white' }}>
      {String(name || symbol).charAt(0)}
    </div>
  );
}
