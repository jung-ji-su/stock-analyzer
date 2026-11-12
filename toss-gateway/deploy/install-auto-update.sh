#!/usr/bin/env bash
# VM 에서 한 번만 실행: bash deploy/install-auto-update.sh
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"
sudo cp "$D/toss-gateway-update.service" "$D/toss-gateway-update.timer" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now toss-gateway-update.timer
sudo systemctl start toss-gateway-update.service   # 지금 바로 한 번 반영
echo "자동 업데이트 설치 완료. 로그: sudo journalctl -t toss-gateway-update -n 5 --no-pager"
