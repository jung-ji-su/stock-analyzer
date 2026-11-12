import { fetchIndices } from '@/lib/indices';

export const dynamic = 'force-dynamic';

// 코스피·코스닥·미국 3대 지수: 현재가, 등락, 미니 차트용 최근 종가
export async function GET() {
  try {
    const indices = await fetchIndices();
    return Response.json({ indices }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
