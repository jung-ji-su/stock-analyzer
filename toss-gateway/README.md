# toss-gateway

토스증권 Open API 의 토큰/호출 제한을 한 곳에서 관리하는 개인용 게이트웨이 (Oracle VM 고정 IP에서 실행).

- 토큰 발급은 이 프로세스만 한다 (토스는 클라이언트당 토큰 1개만 유효).
- Firebase ID 토큰 검증 + `OWNER_EMAIL` 일치만 통과 (토스 데이터는 본인 전용).
- 현재 단계는 **조회(GET) 전용**. 주문 등 그 외 메서드는 403.
- 그룹별 TPS 제한, TTL 캐시, 동일 요청 합치기 내장.
- 경로 허용 목록은 `src/policy.js`. 토스 실제 경로와 다르면 VM 에서 확인 후 이 파일만 고친다.

개발: `npm install && npm test` (모의 토스 서버로 테스트).
배포: `deploy/setup.sh`.
