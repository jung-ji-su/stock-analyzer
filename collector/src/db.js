// Oracle Autonomous Database 연결과 스키마 (thin 모드: 별도 클라이언트·지갑 없이 TLS 로 접속)
import oracledb from 'oracledb';

oracledb.fetchAsString = [oracledb.CLOB];
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

let pool = null;

export async function openPool({ user, password, connectString }) {
  pool = await oracledb.createPool({ user, password, connectString, poolMin: 0, poolMax: 4, poolIncrement: 1 });
  return pool;
}
export const closePool = () => pool?.close(5);

export async function withConn(fn) {
  const conn = await pool.getConnection();
  try { return await fn(conn); } finally { await conn.close(); }
}

export const query = (sql, binds = {}, opts = {}) => withConn(async (c) => (await c.execute(sql, binds, opts)).rows);
// 변경 문장 (바로 커밋)
export const exec = (sql, binds = {}) => withConn(async (c) => (await c.execute(sql, binds, { autoCommit: true })).rowsAffected);

// executeMany 는 첫 행으로 자료형을 추측해서 null 이 섞이면 실패한다 → 모든 행을 보고 정한다
function bindDefsOf(rows) {
  const defs = {};
  for (const k of Object.keys(rows[0])) {
    const strs = rows.map((r) => r[k]).filter((v) => typeof v === 'string');
    defs[k] = strs.length
      ? { type: oracledb.STRING, maxSize: Math.max(1, ...strs.map((s) => Buffer.byteLength(s))) }
      : { type: oracledb.NUMBER };
  }
  return defs;
}

// 여러 행 한 번에 (1000행씩 나눠서). rows 는 bind 객체 배열
export async function many(sql, rows) {
  if (!rows.length) return 0;
  const bindDefs = bindDefsOf(rows);
  return withConn(async (c) => {
    let n = 0;
    for (let i = 0; i < rows.length; i += 1000) {
      const r = await c.executeMany(sql, rows.slice(i, i + 1000), { autoCommit: true, bindDefs });
      n += r.rowsAffected || 0;
    }
    return n;
  });
}

// ─── 스키마 ─────────────────────────────────────────────────────────────────
// 이미 있으면 건너뛴다 (ORA-00955: 이름이 이미 사용 중, ORA-01430: 열이 이미 있음)
const DDL = [
  `CREATE TABLE stocks (
     code        VARCHAR2(12) PRIMARY KEY,
     name        VARCHAR2(100) NOT NULL,
     market      VARCHAR2(10)  NOT NULL,
     active      NUMBER(1) DEFAULT 1 NOT NULL,
     updated_at  TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL)`,
  `CREATE TABLE daily_bars (
     code        VARCHAR2(12) NOT NULL,
     trade_date  DATE NOT NULL,
     open_price  NUMBER NOT NULL,
     high_price  NUMBER NOT NULL,
     low_price   NUMBER NOT NULL,
     close_price NUMBER NOT NULL,
     volume      NUMBER NOT NULL,
     CONSTRAINT pk_daily_bars PRIMARY KEY (code, trade_date))`,
  `CREATE TABLE investor_flow (
     code        VARCHAR2(12) NOT NULL,
     trade_date  DATE NOT NULL,
     foreign_net NUMBER,
     inst_net    NUMBER,
     indiv_net   NUMBER,
     CONSTRAINT pk_investor_flow PRIMARY KEY (code, trade_date))`,
  `CREATE TABLE engine_signals (
     code        VARCHAR2(12) NOT NULL,
     signal_date DATE NOT NULL,
     horizon     VARCHAR2(10) NOT NULL,
     close_price NUMBER NOT NULL,
     total_score NUMBER,
     prediction  VARCHAR2(10) NOT NULL,
     confidence  NUMBER(3) NOT NULL,
     prob_up     NUMBER(3),
     prob_side   NUMBER(3),
     prob_down   NUMBER(3),
     engine_ver  VARCHAR2(16) NOT NULL,
     h_score     NUMBER,
     sigma_d     NUMBER,
     CONSTRAINT pk_engine_signals PRIMARY KEY (code, signal_date, horizon))`,
  // 확률 실험용: 기간 점수와 일간 변동성 (처음 만든 테이블에는 없어서 추가)
  `ALTER TABLE engine_signals ADD (h_score NUMBER, sigma_d NUMBER)`,
  // 닮은꼴 차트: 20거래일 모양 벡터 (Oracle AI Vector Search) + 그 뒤 20거래일 흐름
  `CREATE TABLE chart_shapes (
     code       VARCHAR2(12) NOT NULL,
     end_date   DATE NOT NULL,
     shape      VECTOR(20, FLOAT32) NOT NULL,
     past_path  VARCHAR2(400) NOT NULL,
     next_path  VARCHAR2(400) NOT NULL,
     fwd5       NUMBER,
     fwd20      NUMBER,
     CONSTRAINT pk_chart_shapes PRIMARY KEY (code, end_date))`,
  `CREATE TABLE collector_meta (
     k VARCHAR2(50) PRIMARY KEY,
     v VARCHAR2(4000))`,
  // 신호 평가: 신호일 종가 대비 N 거래일 뒤 종가로 상승/횡보/하락 판정 (앱의 적중 기준과 같은 ±1/2/4%)
  `CREATE OR REPLACE VIEW v_signal_eval AS
   WITH fut AS (
     SELECT code, trade_date,
            LEAD(close_price, 1)  OVER (PARTITION BY code ORDER BY trade_date) AS c1,
            LEAD(close_price, 5)  OVER (PARTITION BY code ORDER BY trade_date) AS c5,
            LEAD(close_price, 20) OVER (PARTITION BY code ORDER BY trade_date) AS c20
       FROM daily_bars),
   ev AS (
     SELECT s.code, s.signal_date, s.horizon, s.prediction, s.confidence, s.total_score, s.engine_ver,
            s.prob_up, s.prob_side, s.prob_down, s.close_price, s.h_score, s.sigma_d,
            CASE s.horizon WHEN 'daily' THEN 1 WHEN 'weekly' THEN 2 ELSE 4 END AS band,
            CASE s.horizon WHEN 'daily' THEN f.c1 WHEN 'weekly' THEN f.c5 ELSE f.c20 END AS eval_close
       FROM engine_signals s
       JOIN fut f ON f.code = s.code AND f.trade_date = s.signal_date)
   SELECT ev.*,
          ROUND((eval_close / close_price - 1) * 100, 3) AS change_pct,
          CASE WHEN eval_close IS NULL THEN NULL
               WHEN (eval_close / close_price - 1) * 100 >  band THEN '상승'
               WHEN (eval_close / close_price - 1) * 100 < -band THEN '하락'
               ELSE '횡보' END AS outcome
     FROM ev`,
];

export async function migrate() {
  await withConn(async (c) => {
    for (const sql of DDL) {
      try { await c.execute(sql); } catch (e) { if (!/ORA-00955|ORA-01430/.test(e.message)) throw e; }
    }
  });
}

export async function getMeta(k) {
  const r = await query('SELECT v FROM collector_meta WHERE k = :k', { k });
  return r[0]?.V ?? null;
}
export async function setMeta(k, v) {
  await withConn((c) => c.execute(
    `MERGE INTO collector_meta t USING (SELECT :k k, :v v FROM dual) s ON (t.k = s.k)
     WHEN MATCHED THEN UPDATE SET t.v = s.v WHEN NOT MATCHED THEN INSERT (k, v) VALUES (s.k, s.v)`,
    { k, v: String(v) }, { autoCommit: true }));
}
