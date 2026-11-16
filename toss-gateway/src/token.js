// 토스는 클라이언트당 토큰 1개만 유효(새로 발급하면 이전 것 폐기) → 이 프로세스만 발급한다.
export class TokenManager {
  constructor({ baseUrl, clientId, clientSecret, fetchImpl = fetch, now = () => Date.now() }) {
    Object.assign(this, { baseUrl, clientId, clientSecret, fetchImpl, now });
    this.token = null; this.expiresAt = 0; this.inflight = null; this.failedAt = 0;
  }
  // 상태 확인용 (/healthz): 값은 노출하지 않는다
  status() {
    if (this.token && this.now() < this.expiresAt) return 'valid';
    return this.failedAt ? 'failing' : 'none';
  }
  async get() {
    if (this.token && this.now() < this.expiresAt - 5 * 60_000) return this.token;
    return this.refresh();
  }
  invalidate(bad) { if (this.token === bad) { this.token = null; this.expiresAt = 0; } }
  refresh() {
    // 발급이 실패한 직후 10초 동안은 다시 시도하지 않는다 (키가 틀렸을 때 토스에 요청을 쏟아붓지 않게)
    if (!this.inflight && this.failedAt && this.now() - this.failedAt < 10_000) {
      return Promise.reject(Object.assign(new Error('token_issue_failed'), { status: 502 }));
    }
    if (!this.inflight) {
      this.inflight = this.#issue().finally(() => { this.inflight = null; });
    }
    return this.inflight;
  }
  async #issue() {
    const res = await this.fetchImpl(`${this.baseUrl}/oauth2/token`, {
      signal: AbortSignal.timeout(10_000),
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials', client_id: this.clientId, client_secret: this.clientSecret,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.access_token) {
      this.failedAt = this.now();
      throw Object.assign(new Error('token_issue_failed'), { status: 502, detail: j?.error?.code || res.status });
    }
    this.failedAt = 0;
    this.token = j.access_token;
    this.expiresAt = this.now() + (j.expires_in || 86400) * 1000;
    return this.token;
  }
}
