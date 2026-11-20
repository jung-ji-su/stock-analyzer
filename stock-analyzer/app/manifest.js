// PWA 설정: 홈 화면에 추가했을 때 이름·아이콘·색 (아이콘 원본: scripts/app-icon.svg)
export default function manifest() {
  return {
    name: '주식 AI 분석기',
    short_name: 'stock',
    start_url: '/',
    display: 'standalone',
    background_color: '#F0F4F8',
    theme_color: '#F0F4F8',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
