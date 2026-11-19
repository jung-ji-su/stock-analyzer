#!/usr/bin/env bash
# 1분마다 실행: main 에 toss-gateway 변경이 있으면 /opt 로 반영하고 서비스 재시작. 수집기(collector) 변경이면 수집기 재시작.
# 실행 중 파일이 바뀌어도 안전하도록 전체를 함수로 감싸고 마지막에 exit 한다.
main() {
  set -euo pipefail
  # 어느 단계에서 실패하든 시스템 로그에 남긴다 (journalctl -t toss-gateway-update)
  trap 'logger -t toss-gateway-update "update FAILED at line $LINENO"' ERR
  cd "$HOME/stock-analyzer"
  git fetch -q origin main
  [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && return 0
  local changed col_changed col_deps
  changed=$(git diff --name-only HEAD origin/main -- toss-gateway | wc -l)
  # 수집기는 저장소에서 바로 실행된다. 수집기 코드나 수집기가 가져다 쓰는 앱 엔진 파일이 바뀌면 재시작
  col_changed=$(git diff --name-only HEAD origin/main -- collector stock-analyzer/lib/analysisEngine.js stock-analyzer/lib/indicators.js stock-analyzer/lib/marketEvents.js | wc -l)
  col_deps=$(git diff --name-only HEAD origin/main -- collector/package.json | wc -l)
  git merge -q --ff-only origin/main
  if [ "$col_changed" -gt 0 ] && systemctl is-enabled --quiet stock-collector 2>/dev/null; then
    [ "$col_deps" -gt 0 ] && (cd collector && npm install --omit=dev --silent)
    sudo systemctl restart stock-collector
    logger -t toss-gateway-update "collector restarted $(git rev-parse --short HEAD)"
  fi
  [ "$changed" -eq 0 ] && return 0
  sudo rsync -a --delete --exclude node_modules --exclude .env toss-gateway/ /opt/toss-gateway/
  (cd /opt/toss-gateway && npm install --omit=dev --silent)
  sudo systemctl restart toss-gateway
  sleep 3
  if curl -fsS localhost:8787/healthz >/dev/null; then
    logger -t toss-gateway-update "deployed $(git rev-parse --short HEAD)"
  else
    logger -t toss-gateway-update "FAILED health check after $(git rev-parse --short HEAD)"
  fi
}
main
exit $?
