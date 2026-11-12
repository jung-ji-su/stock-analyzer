// VM 에서 실행: sudo node --env-file=/etc/toss-gateway.env deploy/verify.mjs
// 토스 호출 확인용. 키/계좌번호는 출력하지 않는다.
import { TokenManager } from '../src/token.js';

const base = process.env.TOSS_BASE_URL || 'https://openapi.tossinvest.com';
const tm = new TokenManager({ baseUrl: base, clientId: process.env.TOSS_CLIENT_ID, clientSecret: process.env.TOSS_CLIENT_SECRET });

let tok;
try { tok = await tm.get(); console.log('토큰 발급: OK'); }
catch (e) { console.log('토큰 발급 실패:', e.message, e.detail); process.exit(1); }

const H = { authorization: `Bearer ${tok}` };
const t = async (name, path, headers = H, show = 300) => {
  const r = await fetch(base + path, { headers });
  const b = await r.text();
  console.log(`\n[${name}] ${r.status}  ${path}`);
  console.log(show ? b.slice(0, show) : '(본문 생략)');
  return b;
};

await t('시세', '/api/v1/prices?symbols=005930');
await t('캔들(symbol)', '/api/v1/candles?symbol=005930&interval=1d&count=2');
await t('캔들(symbols)', '/api/v1/candles?symbols=005930&interval=1d&count=2');
const a = await t('계좌', '/api/v1/accounts', H, 0);
try {
  const j = JSON.parse(a);
  console.log('계좌 필드:', Object.keys(Array.isArray(j.result) ? j.result[0] || {} : j.result || {}));
} catch {}
