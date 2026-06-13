# VPS Setup Guide — Ubuntu

Step-by-step instructions to deploy this app on an Ubuntu server from a fresh clone.

---

## 1. Prerequisites

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git
```

## 2. Install Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v22.x
npm -v
```

## 3. Install Puppeteer / Chromium Dependencies

```bash
sudo apt install -y \
    ca-certificates fonts-liberation \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 \
    libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 \
    libu2f-udev libvulkan1 libxcomposite1 libxdamage1 \
    libxfixes3 libxkbcommon0 libxrandr2 xdg-utils \
    chromium-browser
```

## 4. Clone the Repository

```bash
git clone git@github.com:aliabbasbeing/bot.git /opt/whatsapp-bot
cd /opt/whatsapp-bot
```

Or via HTTPS (no SSH key required):

```bash
git clone https://github.com/aliabbasbeing/bot.git /opt/whatsapp-bot
cd /opt/whatsapp-bot
```

## 5. Create Environment File

```bash
cp .env.example .env
nano .env
```

Edit these values:

| Variable | Example | Description |
|---|---|---|
| `PORT` | `4000` | Server port |
| `NODE_ENV` | `production` | |
| `API_KEY` | `$(openssl rand -hex 32)` | Generate: `openssl rand -hex 32` |
| `WA_HEADLESS` | `true` | Always `true` on VPS |

Minimal `.env`:

```
PORT=4000
NODE_ENV=production
API_KEY=change_this_to_a_long_random_string
WA_HEADLESS=true
```

## 6. Install Dependencies

```bash
# Backend
npm install

# Frontend
cd client
npm install
cd ..
```

## 7. Build Frontend

```bash
npm run build:client
```

## 8. Create Data Directories

```bash
mkdir -p data logs uploads sessions
```

## 9. Test Run

```bash
npm start
```

Expected output:
```
Server running on port 4000 in production mode
Database initialized successfully
```

Visit `http://your-vps-ip:4000` — you should see the login page.

> **Note**: The first WhatsApp QR scan must be done from the browser. Open port 4000 in your firewall:
> ```bash
> sudo ufw allow 4000/tcp
> ```

Press `Ctrl+C` to stop the test server.

## 10. Install PM2 (Process Manager)

```bash
sudo npm install -g pm2
```

## 11. Start with PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # follow the instructions to enable on-boot restart
```

Commands:

```bash
pm2 status              # check status
pm2 logs wa-app         # view live logs
pm2 restart wa-app      # restart
pm2 stop wa-app         # stop
```

## 12. (Optional) Nginx Reverse Proxy

Expose on port 80 with a domain name:

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

        # Required for Socket.IO
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
```

Then open the firewall:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp   # if using HTTPS later
```

## 13. (Optional) HTTPS with Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 14. Usage — First Run

1. Open `http://your-vps-ip:4000` (or your domain)
2. The app auto-checks for a WhatsApp session — if none found, go to **Connect** page
3. Scan the QR code with your phone (WhatsApp → Linked Devices)
4. Once connected, create a campaign and upload contacts

## Troubleshooting

| Issue | Fix |
|---|---|
| `Error: Failed to launch browser` | Install missing deps (step 3). Run `sudo apt install --fix-broken` |
| `ECONNREFUSED` on port 4000 | Check `pm2 status`, restart if needed |
| WhatsApp keeps disconnecting | Check logs: `pm2 logs wa-app`. May need to re-scan QR |
| `EBUSY` errors on Windows only | Not applicable on Linux — file locking works properly |
| Port 4000 not accessible | `sudo ufw allow 4000/tcp` or check cloud firewall panel |
