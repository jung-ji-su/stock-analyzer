#!/usr/bin/env bash
# 1분마다 실행: main 에 toss-gateway 변경이 있으면 /opt 로 반영하고 서비스 재시작.
# 실행 중 파일이 바뀌어도 안전하도록 전체를 함수로 감싸고 마지막에 exit 한다.
main() {
  set -euo pipefail
  cd "$HOME/stock-analyzer"
  git fetch -q origin main
  [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && return 0
  local changed
  changed=$(git diff --name-only HEAD origin/main -- toss-gateway | wc -l)
  git merge -q --ff-only origin/main
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
