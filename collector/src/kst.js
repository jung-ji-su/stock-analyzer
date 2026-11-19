// 한국시간 도우미
const KST = 'Asia/Seoul';
export const kstDate = (ms = Date.now()) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: KST }); // YYYY-MM-DD
export function kstMinutes(ms = Date.now()) {
  const [h, m] = new Date(ms).toLocaleTimeString('en-GB', { timeZone: KST, hour: '2-digit', minute: '2-digit', hour12: false }).split(':').map(Number);
  return h * 60 + m;
}
// 그날 장 마감 뒤 시각 (엔진이 '장중' 으로 보정하지 않게)
export const afterClose = (date) => Date.parse(`${date}T16:00:00+09:00`);
