#!/usr/bin/env bash
# VM 에서 한 번만 실행: bash ~/stock-analyzer/collector/deploy/install.sh
set -euo pipefail
D="$(cd "$(dirname "$0")/.." && pwd)"
cd "$D" && npm install --omit=dev --silent

# 게이트웨이 ↔ 수집기 내부 키: 없으면 만들어서 양쪽 설정에 같은 값으로 넣는다 (화면에 출력하지 않음)
if ! sudo grep -q '^INTERNAL_KEY=.\{32,\}' /etc/toss-gateway.env; then
  KEY=$(openssl rand -hex 32)
  sudo sed -i '/^INTERNAL_KEY=/d' /etc/toss-gateway.env
  echo "INTERNAL_KEY=$KEY" | sudo tee -a /etc/toss-gateway.env >/dev/null
fi
KEY=$(sudo grep '^INTERNAL_KEY=' /etc/toss-gateway.env | cut -d= -f2-)

if [ ! -f /etc/stock-collector.env ]; then
  sudo install -m 600 -o root -g root "$D/deploy/collector.env.example" /etc/stock-collector.env
fi
sudo sed -i "s|^INTERNAL_KEY=.*|INTERNAL_KEY=$KEY|" /etc/stock-collector.env

sudo cp "$D/deploy/stock-collector.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable stock-collector >/dev/null
# 게이트웨이가 내부 키를 읽도록 재시작 (몇 초 끊김)
sudo systemctl restart toss-gateway

if sudo grep -q '^DB_PASSWORD=$' /etc/stock-collector.env; then
  echo ">>> sudo nano /etc/stock-collector.env 로 DB_PASSWORD, DB_CONNECT_STRING, APP_URL, CRON_SECRET 을 채운 뒤"
  echo ">>> sudo systemctl restart stock-collector"
else
  sudo systemctl restart stock-collector
  echo "수집기 시작. 로그: sudo journalctl -u stock-collector -f"
fi
