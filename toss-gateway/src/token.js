// 토스는 클라이언트당 토큰 1개만 유효(새로 발급하면 이전 것 폐기) → 이 프로세스만 발급한다.
export class TokenManager {
  constructor({ baseUrl, clientId, clientSecret, fetchImpl = fetch, now = () => Date.now() }) {
    Object.assign(this, { baseUrl, clientId, clientSecret, fetchImpl, now });
    this.token = null; this.expiresAt = 0; this.inflight = null;
  }
  async get() {
    if (this.token && this.now() < this.expiresAt - 5 * 60_000) return this.token;
    return this.refresh();
  }
  invalidate(bad) { if (this.token === bad) { this.token = null; this.expiresAt = 0; } }
  refresh() {
    if (!this.inflight) {
      this.inflight = this.#issue().finally(() => { this.inflight = null; });
    }
    return this.inflight;
  }
  async #issue() {
    const res = await this.fetchImpl(`${this.baseUrl}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials', client_id: this.clientId, client_secret: this.clientSecret,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.access_token) {
      throw Object.assign(new Error('token_issue_failed'), { status: 502, detail: j?.error?.code || res.status });
    }
    this.token = j.access_token;
    this.expiresAt = this.now() + (j.expires_in || 86400) * 1000;
    return this.token;
  }
}
