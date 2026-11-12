// 그룹별 토큰 버킷. 초당 tps 개 보충, 버스트 = tps. 대기 한도 초과 시 거절.
export class Limiter {
  constructor(tpsByGroup, maxWaitMs = 3000, now = () => Date.now()) {
    this.tps = tpsByGroup; this.maxWaitMs = maxWaitMs; this.now = now; this.b = new Map();
  }
  async acquire(group) {
    const rate = this.tps[group];
    if (!rate) return;
    const t = this.now();
    const s = this.b.get(group) || { tokens: rate, at: t };
    s.tokens = Math.min(rate, s.tokens + ((t - s.at) / 1000) * rate);
    s.at = t;
    s.tokens -= 1; // 음수면 미래 슬롯을 예약한 것
    this.b.set(group, s);
    if (s.tokens >= 0) return;
    const wait = Math.ceil((-s.tokens / rate) * 1000);
    if (wait > this.maxWaitMs) { s.tokens += 1; throw Object.assign(new Error('rate_limited'), { status: 429 }); }
    await new Promise((r) => setTimeout(r, wait));
  }
}
