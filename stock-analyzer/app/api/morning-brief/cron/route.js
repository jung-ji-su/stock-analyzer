import { generateAndSave } from '../route';

function getKSTDateKey() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const dateKey = getKSTDateKey();
    const briefing = await generateAndSave(dateKey);
    return Response.json({ ok: true, date: dateKey, generatedAt: briefing.generatedAt });
  } catch (error) {
    console.error('Morning brief cron error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
