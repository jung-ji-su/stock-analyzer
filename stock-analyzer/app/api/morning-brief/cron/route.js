import { generateAndSave } from '../route';
import { kstDay } from '@/lib/evalUtils';
import { recordRun } from '@/lib/opsLog';

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const dateKey = kstDay(Date.now());
    const briefing = await generateAndSave(dateKey);
    await recordRun('morningBrief', true, `${dateKey} 브리핑 생성`);
    return Response.json({ ok: true, date: dateKey, generatedAt: briefing.generatedAt });
  } catch (error) {
    console.error('Morning brief cron error:', error);
    await recordRun('morningBrief', false, error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
