#!/bin/bash

set -e
LOG_FILE="$HOME/install.log"
FAILED_STEP=""

function log() {
  echo "[+] $1" | tee -a "$LOG_FILE"
}

function error_exit() {
  echo "[!] ERROR at step: $FAILED_STEP. See $LOG_FILE for details." | tee -a "$LOG_FILE"
  exit 1
}

trap 'error_exit' ERR

log "Starting Pi Bridge installation."

### 0. Ask for all necessary input at start
read -rp "Enter a valid system username for running the server (no spaces or special characters): " serverUser
if ! [[ "$serverUser" =~ ^[a-z_][a-z0-9_-]*[$]?$ ]]; then
  echo "Invalid username format."
  exit 1
fi

read -rp "Do you want to use existing SSL certs? (y/n): " sslChoice
if [[ "$sslChoice" == "y" ]]; then
  read -rp "Enter full path to existing SSL cert (.crt): " sslCertPath
  read -rp "Enter full path to existing SSL key (.key): " sslKeyPath
else
  sslCertPath="/home/$serverUser/server/ssl/server.crt"
  sslKeyPath="/home/$serverUser/server/ssl/server.key"
fi

read -rp "Install and configure Tailscale? (y/n): " enableTailscale

log "Checking WiFi connection..."
if ! ping -c 1 1.1.1.1 &>/dev/null; then
  echo "[!] No internet connection. Please connect to WiFi using 'raspi-config' and try again."
  exit 1
fi

### 1. Update system and install dependencies
FAILED_STEP="System Update & Dependencies"
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3 python3-venv python3-pip gcc-arm-none-eabi libusb-1.0-0-dev unzip curl git

### 2. Create directory structure
FAILED_STEP="Directory Setup"
sudo useradd -m -s /bin/bash "$serverUser" || true
sudo mkdir -p /home/$serverUser/server/{uploads,logs,ssl,compiled}
sudo chown -R "$serverUser" /home/$serverUser/server

### 3. Clone server files
FAILED_STEP="Clone Server Files"
TEMP_CLONE_DIR="/tmp/server-temp"
sudo -u "$serverUser" git clone https://github.com/DiamondJdev/VexV5PiServer.git "$TEMP_CLONE_DIR"
sudo cp "$TEMP_CLONE_DIR/main.py" "/home/$serverUser/server/main.py"
sudo cp "$TEMP_CLONE_DIR/compile_upload.sh" "/home/$serverUser/server/compile_upload.sh"
sudo chmod +x "/home/$serverUser/server/compile_upload.sh"
sudo rm -rf "$TEMP_CLONE_DIR"

### 4. Setup Python venv and install dependencies
FAILED_STEP="Python Environment"
sudo -u "$serverUser" bash -c '
  cd /home/$serverUser/server
  python3 -m venv .venv
  source .venv/bin/activate
  pip install fastapi[all] uvicorn[standard] pydantic pros-cli python-multipart
'

### 5. SSL Cert setup
FAILED_STEP="SSL Certificate Setup"
if [[ "$sslChoice" == "y" ]]; then
  sudo cp "$sslCertPath" "/home/$serverUser/server/ssl/server.crt"
  sudo cp "$sslKeyPath" "/home/$serverUser/server/ssl/server.key"
else
  log "Generating self-signed SSL cert..."
  sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "/home/$serverUser/server/ssl/server.key" \
    -out "/home/$serverUser/server/ssl/server.crt" \
    -subj "/CN=pi-bridge"
fi

sudo chmod 600 "/home/$serverUser/server/ssl/server.key"
sudo chown -R "$serverUser" "/home/$serverUser/server/ssl"

### 6. Setup systemd service
FAILED_STEP="Systemd Configuration"
SERVICE_FILE="/etc/systemd/system/vex-server.service"
sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Pi Bridge Server
After=network.target

[Service]
User=$serverUser
WorkingDirectory=/home/$serverUser/server
ExecStart=/home/$serverUser/server/.venv/bin/python3 -m uvicorn main:app --host 0.0.0.0 --port 8080 \
  --ssl-keyfile=/home/$serverUser/server/ssl/server.key \
  --ssl-certfile=/home/$serverUser/server/ssl/server.crt
Environment=PATH=/home/$serverUser/server/.venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reexec
sudo systemctl daemon-reload
sudo systemctl enable vex-server.service
sudo systemctl start vex-server.service

### 7. Optional Tailscale
if [[ "$enableTailscale" == "y" ]]; then
  FAILED_STEP="Tailscale Setup"
  curl -fsSL https://tailscale.com/install.sh | sh
  sudo tailscale up || {
    echo "[!] Tailscale login failed. Re-run 'sudo tailscale up' manually later.";
  }
  log "✅ Tailscale installed and initialized."
fi

log "🎉 Installation complete. Access your server at: https://<pi-ip>:8080"
echo "Use https://$(tailscale ip -4 | head -n 1):8080 if on Tailscale."
