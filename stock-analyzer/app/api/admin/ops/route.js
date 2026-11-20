// 관리자 운영 콘솔: 정기 작업 기록, AI 호출 통계, 컬렉션 크기, 오래된 데이터 정리 (role=admin 만)
import { getAdminFirestore, admin } from '@/lib/firebase-admin';
import { requireUser, unauthorized } from '@/lib/verifyAuth';
import { kstDay } from '@/lib/evalUtils';

const COLLECTIONS = ['profiles', 'holdings', 'trades', 'orders', 'analysisHistory', 'briefings', 'aiTrader', 'aiTransactions',
  'aiPortfolioHistory', 'dartCorpCache', 'krx_cache', 'market_suffix', 'aiStats', 'opsRuns'];

// 정리 대상: 문서 ID 가 날짜(YYYY-MM-DD)인 것은 ID 로, 분석 기록은 analyzedAt 으로 자른다. min = 최소 보관 일수
const CLEANUP = {
  briefings: { min: 7, byId: true },
  aiStats: { min: 30, byId: true },
  analysisHistory: { min: 90, field: 'analyzedAt' },
};

async function requireAdmin(request) {
  const u = await requireUser(request);
  if (!u) return null;
  const p = await getAdminFirestore().collection('profiles').doc(u.uid).get();
  return p.exists && p.data().role === 'admin' ? u : null;
}

const latestById = async (db, col) => {
  const s = await db.collection(col).orderBy(admin.firestore.FieldPath.documentId(), 'desc').limit(1).get();
  return s.empty ? null : { id: s.docs[0].id, ...s.docs[0].data() };
};

async function openRouterKey() {
  try {
    const r = await fetch('https://openrouter.ai/api/v1/key', {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` }, signal: AbortSignal.timeout(8000),
    });
    const { data } = await r.json();
    return data ? { usage: data.usage, limit: data.limit, limitRemaining: data.limit_remaining, isFreeTier: data.is_free_tier } : null;
  } catch { return null; }
}

export async function GET(request) {
  if (!(await requireAdmin(request))) return unauthorized();
  const db = getAdminFirestore();
  const [runs, stats, key, counts, briefing, lastTx] = await Promise.all([
    db.collection('opsRuns').get().then((s) => Object.fromEntries(s.docs.map((d) => [d.id, d.data()]))),
    db.collection('aiStats').orderBy(admin.firestore.FieldPath.documentId(), 'desc').limit(7).get()
      .then((s) => s.docs.map((d) => ({ date: d.id, ...d.data() }))),
    openRouterKey(),
    Promise.all(COLLECTIONS.map((c) => db.collection(c).count().get().then((s) => [c, s.data().count]).catch(() => [c, null])))
      .then(Object.fromEntries),
    latestById(db, 'briefings').then((b) => b && { date: b.id, generatedAt: b.generatedAt }),
    db.collection('aiTransactions').orderBy('date', 'desc').limit(1).get()
      .then((s) => (s.empty ? null : { date: s.docs[0].data().date, action: s.docs[0].data().action, name: s.docs[0].data().name })).catch(() => null),
  ]);
  return Response.json({ runs, stats, key, counts, briefing, lastTx, today: kstDay(Date.now()) });
}

// { target, days, dryRun } → 기준보다 오래된 문서 수 (dryRun) 또는 삭제
export async function POST(request) {
  if (!(await requireAdmin(request))) return unauthorized();
  const { target, days, dryRun = true } = await request.json().catch(() => ({}));
  const rule = CLEANUP[target];
  if (!rule || !(days >= rule.min)) return Response.json({ error: `${target} 은(는) ${rule?.min ?? '?'}일 이상만 정리할 수 있어요` }, { status: 400 });

  const db = getAdminFirestore();
  const cutoff = Date.now() - days * 86400000;
  const q = rule.byId
    ? db.collection(target).where(admin.firestore.FieldPath.documentId(), '<', kstDay(cutoff))
    : db.collection(target).where(rule.field, '<', admin.firestore.Timestamp.fromMillis(cutoff));
  if (dryRun) return Response.json({ count: (await q.count().get()).data().count });

  let deleted = 0;
  for (;;) {
    const s = await q.limit(400).get();
    if (s.empty) break;
    const batch = db.batch();
    s.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += s.size;
  }
  return Response.json({ deleted });
}
