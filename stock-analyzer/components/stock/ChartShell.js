'use client';

import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';

// 차트 카드 껍데기: 평소엔 카드, 전체화면이면 화면 전체를 덮는 레이어(body 로 portal — 부모의 transform 영향 안 받게)
export default function ChartShell({ fs, children }) {
  if (fs) return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#0F172A', display: 'flex', flexDirection: 'column',
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}>
      {children}
    </div>, document.body);
  return (
    <motion.div custom={2} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
      style={{ borderRadius: 20, overflow: 'hidden', background: '#0F172A', boxShadow: '0 8px 24px rgba(15,23,42,0.18)' }}>
      {children}
    </motion.div>
  );
}
