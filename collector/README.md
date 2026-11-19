# stock-collector

Oracle Cloud VM 에 상주하는 데이터 수집기. 수집한 데이터는 Oracle Autonomous Database 에 쌓는다.

| 시각 (KST, 거래일) | 하는 일 |
|---|---|
| 16:30 이후 하루 1번 | 시총 상위 100종목(월요일 갱신) 일봉 수집(처음엔 3년치) → 토스 투자자 수급 → 엔진 신호 계산 |
| 09:00~15:30 1분마다 | 앱의 AI 트레이더 손절·익절 체크 호출 (`CRON_SECRET` 있을 때) |

- 엔진 신호 = 날짜마다 그날까지의 일봉으로 `stock-analyzer/lib/analysisEngine.js` 를 다시 돌린 결과. 엔진 파일이 바뀌면 전 기간을 자동으로 다시 계산한다(백테스트).
- 평가는 DB 뷰 `v_signal_eval` (LEAD 로 1/5/20 거래일 뒤 종가, ±1/2/4% 기준).
- 통계: `127.0.0.1:8788/stats/backtest`, `/stats/status` → 게이트웨이가 로그인 확인 뒤 `/stats/*` 로 중계.

## 설치 (VM, 한 번)

```bash
bash ~/stock-analyzer/collector/deploy/install.sh
sudo nano /etc/stock-collector.env   # DB_PASSWORD, DB_CONNECT_STRING, APP_URL, CRON_SECRET
sudo systemctl restart stock-collector
sudo journalctl -u stock-collector -f
```

이후에는 `toss-gateway` 자동 업데이트가 수집기 코드 변경도 반영한다.
