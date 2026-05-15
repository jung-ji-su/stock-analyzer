import { getAdminFirestore } from '@/lib/firebase-admin';

const KRX_H = { 'AUTH_KEY': process.env.KRX_API_KEY };

const KRX_FIELDS = [
  'ISU_CD', 'ISU_NM', 'MKT_NM', 'TDD_CLSPRC', 'CMPPREVDD_PRC', 'FLUC_RT',
  'TDD_OPNPRC', 'TDD_HGPRC', 'TDD_LWPRC', 'ACC_TRDVOL', 'ACC_TRDVAL', 'MKTCAP',
];

function pick(obj, keys) {
  const r = {};
  for (const k of keys) r[k] = obj[k] ?? '';
  return r;
}

async function fetchKRXForDate(basDd) {
  const [r1, r2] = await Promise.all([
    fetch(`https://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd?basDd=${basDd}`, { headers: KRX_H }),
    fetch(`https://data-dbg.krx.co.kr/svc/apis/sto/ksq_bydd_trd?basDd=${basDd}`, { headers: KRX_H }),
  ]);
  const [d1, d2] = await Promise.all([r1.json(), r2.json()]);
  const kospi = (d1.OutBlock_1 || []).map(s => ({ ...pick(s, KRX_FIELDS), _mkt: 'KS' }));
  const kosdaq = (d2.OutBlock_1 || []).map(s => ({ ...pick(s, KRX_FIELDS), _mkt: 'KQ' }));
  return [...kospi, ...kosdaq];
}

/**
 * KRX 전체 종목 데이터 (KOSPI + KOSDAQ)를 반환한다.
 * 당일 기준 Firestore에 캐싱되며, 없으면 KRX API를 호출해 저장 후 반환.
 * @returns {{ stocks: object[], basDd: string }}
 */
export async function getKRXDailyStocks() {
  const db = getAdminFirestore();
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const todayKey = kst.toISOString().slice(0, 10);

  const cacheRef = db.collection('krx_cache').doc(todayKey);
  const cached = await cacheRef.get();
  if (cached.exists) {
    const data = cached.data();
    return { stocks: JSON.parse(data.stocksJson), basDd: data.basDd };
  }

  for (let i = 0; i < 7; i++) {
    const d = new Date(kst);
    d.setDate(d.getDate() - i);
    const basDd = d.toISOString().slice(0, 10).replace(/-/g, '');
    const stocks = await fetchKRXForDate(basDd);
    if (stocks.length > 0) {
      try {
        await cacheRef.set({ stocksJson: JSON.stringify(stocks), basDd, cachedAt: todayKey });
      } catch (e) {
        console.error('krx_cache write failed:', e.message);
      }
      return { stocks, basDd };
    }
  }
  throw new Error('KRX 데이터를 가져올 수 없습니다');
}

/**
 * 종목 코드의 시장 구분(KS/KQ)을 반환한다.
 * Firestore market_suffix 컬렉션에 영구 캐싱.
 * @param {string} code - 6자리 종목 코드
 * @returns {Promise<'KS'|'KQ'|null>}
 */
export async function getMarketSuffix(code) {
  const db = getAdminFirestore();
  const suffixRef = db.collection('market_suffix').doc(code);
  const cached = await suffixRef.get();
  if (cached.exists) return cached.data().suffix;

  try {
    const { stocks } = await getKRXDailyStocks();
    const stock = stocks.find(s => s.ISU_CD === code);
    const suffix = stock?._mkt || null;
    if (suffix) {
      await suffixRef.set({ suffix, updatedAt: new Date().toISOString() });
    }
    return suffix;
  } catch (e) {
    console.error('getMarketSuffix failed:', e.message);
    return null;
  }
}

/**
 * 당일 KRX 데이터에서 특정 종목의 OHLCV를 반환한다.
 * 장 종료 후에만 당일 데이터가 존재하므로, 미존재 시 null 반환.
 * @param {string} code - 6자리 종목 코드
 * @returns {Promise<{open,high,low,close,volume}|null>}
 */
export async function getKRXTodayCandle(code) {
  try {
    const kst = new Date(Date.now() + 9 * 3600 * 1000);
    const todayBasDd = kst.toISOString().slice(0, 10).replace(/-/g, '');
    const { stocks, basDd } = await getKRXDailyStocks();
    if (basDd !== todayBasDd) return null; // 장중이라 아직 당일 데이터 없음
    const s = stocks.find(st => st.ISU_CD === code);
    if (!s) return null;
    const n = (v) => parseInt((v || '0').replace(/,/g, '')) || 0;
    return { open: n(s.TDD_OPNPRC), high: n(s.TDD_HGPRC), low: n(s.TDD_LWPRC), close: n(s.TDD_CLSPRC), volume: n(s.ACC_TRDVOL) };
  } catch {
    return null;
  }
}
