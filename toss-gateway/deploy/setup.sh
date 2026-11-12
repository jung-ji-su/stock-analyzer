#!/usr/bin/env bash
# VM(Ubuntu 24.04)에서 실행: bash deploy/setup.sh  (저장소의 toss-gateway 폴더 안에서)
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"

# 1) 80/443 (OCI Ubuntu 이미지는 iptables 로 기본 차단)
sudo iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 5 -p tcp --dport 80 -j ACCEPT
sudo iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 5 -p tcp --dport 443 -j ACCEPT
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent >/dev/null
sudo netfilter-persistent save

# 2) Node 22
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# 3) Caddy (공식 apt 저장소)
if ! command -v caddy >/dev/null; then
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update
  sudo apt-get install -y caddy
fi

# 4) 앱 배치
sudo mkdir -p /opt/toss-gateway
sudo rsync -a --delete --exclude node_modules --exclude .env "$SRC/" /opt/toss-gateway/
sudo chown -R ubuntu:ubuntu /opt/toss-gateway
(cd /opt/toss-gateway && npm install --omit=dev --silent)

# 5) 환경변수 파일 (값은 직접 채움)
if [ ! -f /etc/toss-gateway.env ]; then
  sudo install -m 600 -o root -g root "$SRC/.env.example" /etc/toss-gateway.env
  echo ">>> sudo nano /etc/toss-gateway.env 로 값을 채운 뒤 'sudo systemctl restart toss-gateway' 하세요."
fi

# 6) 서비스
sudo cp /opt/toss-gateway/deploy/toss-gateway.service /etc/systemd/system/
sudo cp /opt/toss-gateway/deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl daemon-reload
sudo systemctl enable toss-gateway
sudo systemctl restart caddy
echo "설치 완료. env 를 채운 뒤: sudo systemctl restart toss-gateway && curl -s localhost:8787/healthz"
