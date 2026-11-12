// TTL 캐시 + 동일 키 동시요청 합치기(single-flight)
export class Cache {
  constructor(now = () => Date.now()) { this.m = new Map(); this.f = new Map(); this.now = now; }
  async wrap(key, ttlSec, load) {
    const hit = this.m.get(key);
    if (hit && hit.exp > this.now()) return hit.v;
    if (this.f.has(key)) return this.f.get(key);
    const p = load().then((v) => {
      if (ttlSec > 0 && v.status === 200) this.m.set(key, { exp: this.now() + ttlSec * 1000, v });
      if (this.m.size > 2000) this.m.delete(this.m.keys().next().value);
      return v;
    }).finally(() => this.f.delete(key));
    this.f.set(key, p);
    return p;
  }
}
