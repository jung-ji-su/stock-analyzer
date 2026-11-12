// 모의투자 성과 계산 (순수 함수 — 거래 기록 + 종가표로 자산 추이를 다시 만든다)

const kstDay = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }); // YYYY-MM-DD
const tradeMs = (t) => t.createdAt?.toDate?.()?.getTime?.() ?? null;

// closes: Map(symbol → [[date, close], ...] 날짜 오름차순). 반환: [{ date, equity, cash }] (맨 앞에 시작점)
export function buildEquity(trades, closes, initial, today = kstDay(Date.now())) {
  const ev = trades.map((t) => ({ t, ms: tradeMs(t) })).filter((x) => x.ms).sort((a, b) => a.ms - b.ms)
    .map(({ t, ms }) => ({ ...t, day: kstDay(ms) }));
  if (!ev.length) return [];

  const first = ev[0].day;
  const set = new Set(ev.map((e) => e.day));
  set.add(today);
  for (const rows of closes.values()) for (const [d] of rows) if (d >= first && d <= today) set.add(d);
  const dates = [...set].sort();

  const idx = new Map(); // symbol → 가장 최근 종가 위치
  let cash = initial, i = 0;
  const qty = new Map(), lastTrade = new Map();
  const out = [{ date: '시작', equity: initial, cash: initial }];

  for (const d of dates) {
    while (i < ev.length && ev[i].day <= d) {
      const t = ev[i++];
      cash += t.cashDelta ?? (t.type === 'buy' ? -t.amount : t.amount);
      qty.set(t.symbol, (qty.get(t.symbol) || 0) + (t.type === 'buy' ? t.quantity : -t.quantity));
      lastTrade.set(t.symbol, t.price);
    }
    let stock = 0;
    for (const [sym, q] of qty) {
      if (q <= 0) continue;
      const rows = closes.get(sym) || [];
      let p = idx.get(sym) ?? -1;
      while (p + 1 < rows.length && rows[p + 1][0] <= d) p++;
      idx.set(sym, p);
      stock += q * (p >= 0 ? rows[p][1] : lastTrade.get(sym));
    }
    out.push({ date: d, equity: Math.round(cash + stock), cash: Math.round(cash) });
  }
  return out;
}

// 최대낙폭(MDD): 고점 대비 가장 크게 빠진 비율
export function maxDrawdown(equity) {
  let peak = -Infinity, peakDate = null, best = { pct: 0, peakDate: null, troughDate: null };
  for (const p of equity) {
    if (p.equity > peak) { peak = p.equity; peakDate = p.date; }
    const dd = peak > 0 ? ((p.equity - peak) / peak) * 100 : 0;
    if (dd < best.pct) best = { pct: dd, peakDate, troughDate: p.date };
  }
  return best;
}

export function calcStats(trades, equity, initial) {
  const sells = trades.filter((t) => t.type === 'sell');
  const wins = sells.filter((t) => (t.profit || 0) > 0), losses = sells.filter((t) => (t.profit || 0) < 0);
  const gross = (arr) => arr.reduce((s, t) => s + (t.profit || 0), 0);
  const grossWin = gross(wins), grossLoss = -gross(losses);
  const bySymbol = new Map();
  for (const t of sells) {
    const x = bySymbol.get(t.symbol) || { symbol: t.symbol, name: t.name, realized: 0, count: 0, wins: 0 };
    x.realized += t.profit || 0; x.count++; if ((t.profit || 0) > 0) x.wins++;
    bySymbol.set(t.symbol, x);
  }
  const last = equity.length ? equity[equity.length - 1].equity : initial;
  return {
    tradeCount: trades.length, sellCount: sells.length,
    totalReturn: ((last - initial) / initial) * 100, totalAsset: last,
    realized: gross(sells),
    winRate: sells.length ? (wins.length / sells.length) * 100 : null,
    avgWin: wins.length ? grossWin / wins.length : null,
    avgLoss: losses.length ? -grossLoss / losses.length : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : null),
    costs: trades.reduce((s, t) => s + (t.fee || 0) + (t.tax || 0), 0),
    mdd: maxDrawdown(equity),
    bySymbol: [...bySymbol.values()].sort((a, b) => b.realized - a.realized),
  };
}
