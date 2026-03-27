# Production Deployment Plan - WhatsApp Gateway

## Architecture Overview

```
Frontend --> Supabase Edge Functions --> VPS (WhatsApp Gateway)
                                        |
                                        +--> WhatsApp (via Baileys)
                                        |
VPS (incoming msg) --> Session's webhookUrl (per-project edge function)
```

---

## Step 1: Get a VPS

**Recommended:** Hetzner CX22 (~$4/mo) or DigitalOcean ($6/mo)
- OS: Ubuntu 22.04
- RAM: 2GB (handles ~20 concurrent WhatsApp sessions)
- Each Baileys session uses ~50-100MB RAM

---

## Step 2: Server Setup

```bash
# SSH into your VPS
ssh root@YOUR_VPS_IP

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git

# Install PM2 (process manager - keeps app alive 24/7)
npm install -g pm2

# Clone the repo
git clone YOUR_REPO_URL
cd W_app-gateway
npm install

# Create .env file
cat > .env << 'EOF'
PORT=3000
MAIN_SAAS_WEBHOOK_URL=https://YOUR-DEFAULT-PROJECT.supabase.co/functions/v1/flow-webhook
API_KEY=GENERATE_A_RANDOM_SECRET_HERE
EOF

# Start with PM2
pm2 start src/index.js --name wa-gateway
pm2 save
pm2 startup   # auto-start on server reboot
```

> `MAIN_SAAS_WEBHOOK_URL` is the fallback for sessions started without a `webhookUrl`. Projects that pass their own `webhookUrl` at session start don't use this.

### Useful PM2 Commands
```bash
pm2 status              # check if running
pm2 logs wa-gateway     # view logs
pm2 restart wa-gateway  # restart after code changes
```

---

## Step 3: NGINX + SSL (HTTPS)

Your Supabase edge functions need to call the gateway over HTTPS.

### 3a. Point a subdomain to your VPS
Add a DNS A record: `your-gateway-domain.com` --> `YOUR_VPS_IP`

### 3b. Install NGINX + Certbot
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 3c. Create NGINX config
```bash
sudo nano /etc/nginx/sites-available/wa-gateway
```

Paste:
```nginx
server {
    server_name your-gateway-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        client_max_body_size 16M;
    }
}
```

### 3d. Enable and get SSL
```bash
sudo ln -s /etc/nginx/sites-available/wa-gateway /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d your-gateway-domain.com
```

Certbot auto-renews. Verify: `curl https://your-gateway-domain.com/health`

---

## Step 4: Generate API Key

```bash
# Generate a random key
openssl rand -hex 32
```

Put this in:
1. **VPS `.env`** as `API_KEY=your-generated-key`
2. **Supabase secrets** for each project as `WA_GATEWAY_API_KEY`

All API calls must include the header: `x-api-key: your-generated-key`

---

## Step 5: Supabase Integration (Per Project)

Each SaaS project that uses this gateway needs to:

1. Set `WA_GATEWAY_API_KEY` in its Supabase secrets
2. Update its session-start edge function to pass `webhookUrl`:

```typescript
const res = await fetch(
  `https://your-gateway-domain.com/api/session/start/${customerId}`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": Deno.env.get("WA_GATEWAY_API_KEY")!,
    },
    body: JSON.stringify({
      webhookUrl: `${Deno.env.get("SUPABASE_URL")}/functions/v1/flow-webhook`
    }),
  }
);
// Returns: { status: "qr_generated", qr: "data:image/png;base64,..." }
```

3. Update its `wa-messaging.ts` shared module to use the correct gateway domain
4. Have a `flow-webhook` edge function deployed to receive forwarded messages

---

## Step 6: Updating the Gateway

When you push new code:

```bash
ssh root@YOUR_VPS_IP
cd W_app-gateway
git pull
npm install        # if dependencies changed
pm2 restart wa-gateway
```

---

## Checklist

- [ ] VPS provisioned (Ubuntu 22.04, 2GB RAM)
- [ ] Node.js 20 + PM2 installed
- [ ] Repo cloned and `npm install` done
- [ ] `.env` configured with fallback webhook URL and API key
- [ ] PM2 running and set to auto-start
- [ ] DNS subdomain pointing to VPS
- [ ] NGINX configured with SSL via Certbot
- [ ] `curl https://your-gateway-domain.com/health` returns `{"status":"ok"}`
- [ ] Each project: Supabase secrets set (`WA_GATEWAY_API_KEY`)
- [ ] Each project: Edge functions deployed and passing `webhookUrl`
- [ ] Test: start session, scan QR, send message, receive message
