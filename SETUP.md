# VPS Setup Guide — Ubuntu

Full procedure from GitHub push to running server.

---

## Part 1: Push Code to GitHub

Run on your local machine:

```bash
cd /path/to/project
git add -A
git commit -m "your message"
git push origin master
```

---

## Part 2: Deploy on Fresh Ubuntu VPS

### 1. System Packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git chromium-browser

# Chromium snap dependencies
sudo apt install -y \
    ca-certificates fonts-liberation \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 \
    libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 \
    libu2f-udev libvulkan1 libxcomposite1 libxdamage1 \
    libxfixes3 libxkbcommon0 libxrandr2 xdg-utils
```

### 2. Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # should be v22.x
npm -v
```

### 3. Clone Repository

```bash
git clone https://github.com/aliabbasbeing/bot.git /opt/whatsapp-bot
cd /opt/whatsapp-bot
```

### 4. Environment File

```bash
cp .env.example .env
# Generate a strong API key:
sed -i "s/change_this_to_a_long_random_string_min_32_chars/$(openssl rand -hex 32)/" .env
# Point to system Chromium:
echo "CHROME_PATH=/snap/bin/chromium" >> .env
```

Verify `.env` contents:

```bash
cat .env
```

Expected:

```
PORT=4000
NODE_ENV=production
API_KEY=<random-64-char-hex>
SESSION_PATH=./sessions
DB_PATH=./data/db.sqlite
LOG_PATH=./logs
UPLOAD_PATH=./uploads
WA_HEADLESS=true
CHROME_PATH=/snap/bin/chromium
DEFAULT_DELAY=8
```

### 5. Install Dependencies

```bash
# Backend
npm install

# Frontend
cd client
npm install
cd ..
```

### 6. Build Frontend

```bash
npm run build:client
```

### 7. Create Data Directories

```bash
mkdir -p data logs uploads sessions
```

### 8. Open Firewall

```bash
ufw allow 4000/tcp
ufw status   # verify OpenSSH + 4000/tcp are allowed
```

### 9. Test Run

```bash
npm start
```

Expected output (within 5 seconds):
```
Server running on port 4000 in production mode
Database initialized successfully
No WhatsApp session found — waiting for user to connect
```

Open `http://your-vps-ip:4000` in a browser — you should see the app.

If the page loads but shows only JSON or blank, the frontend wasn't built. Run `npm run build:client` again.

Press `Ctrl+C` to stop.

### 10. PM2 (Production Process Manager)

```bash
sudo npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # run the printed command to enable on-boot restart
```

Useful PM2 commands:

```bash
pm2 status               # list processes
pm2 logs wa-app          # live logs
pm2 restart wa-app       # restart
pm2 stop wa-app          # stop
pm2 delete wa-app        # remove from PM2
```

### 11. Verify Everything

```bash
pm2 logs wa-app
```

You should see:
```
info: Server running on port 4000 in production mode
info: No WhatsApp session found — waiting for user to connect
```

### 12. First WhatsApp Connection

1. Open `http://your-vps-ip:4000` in a browser
2. Go to **Connect** page
3. Scan the QR code with your phone (WhatsApp → Linked Devices → Link a Device)
4. Once connected, go to **Campaigns** → **Create Campaign**

---

## Part 3: Optional — Nginx + Domain + HTTPS

### 3a. Nginx Reverse Proxy

```bash
sudo apt install -y nginx
```

Create `/etc/nginx/sites-available/whatsapp`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

Enable and restart:

```bash
sudo ln -s /etc/nginx/sites-available/whatsapp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
sudo ufw allow 80/tcp
```

### 3b. HTTPS with Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
sudo ufw allow 443/tcp
```

---

## Quick Copy-Paste (All Steps)

Run these in order on a fresh Ubuntu VPS:

```bash
# === 1. System ===
apt update && apt upgrade -y
apt install -y curl git chromium-browser
apt install -y ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 \
  libatk1.0-0 libcups2 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 \
  libu2f-udev libvulkan1 libxcomposite1 libxdamage1 libxfixes3 \
  libxkbcommon0 libxrandr2 xdg-utils

# === 2. Node ===
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# === 3. App ===
git clone https://github.com/aliabbasbeing/bot.git /opt/whatsapp-bot
cd /opt/whatsapp-bot
cp .env.example .env
sed -i "s/change_this_to_a_long_random_string_min_32_chars/$(openssl rand -hex 32)/" .env
echo "CHROME_PATH=/snap/bin/chromium" >> .env
npm install
cd client && npm install && cd ..
npm run build:client
mkdir -p data logs uploads sessions
ufw allow 4000/tcp

# === 4. PM2 ===
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
pm2 logs wa-app
```

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `Could not find Chrome` | Ensure `CHROME_PATH=/snap/bin/chromium` is in `.env` and restart |
| Page loads blank/JSON | Run `npm run build:client` from `/opt/whatsapp-bot` |
| Port 4000 not accessible | `ufw allow 4000/tcp` and check cloud provider firewall panel |
| QR never appears (stuck on "Starting WhatsApp client...") | Chromium missing deps — run `apt install` from step 1 |
| WhatsApp disconnects | `pm2 logs wa-app` — check for `LOGOUT` or `disconnected`. Re-scan QR at `/connect` |
| `ECONNREFUSED` | `pm2 restart wa-app` |
