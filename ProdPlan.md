# Production Deployment Plan - WhatsApp Gateway

## Architecture Overview

```
Vercel (Frontend) --> Supabase Edge Functions --> VPS (WhatsApp Gateway)
|
+--> WhatsApp (via Baileys)
|
VPS (incoming msg) --> Supabase Edge Function (webhook)
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
ssh root@5.161.49.166

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git

# Install PM2 (process manager - keeps app alive 24/7)
npm install -g pm2

# Clone the repo
git clone https://github.com/okimchi123/W_app-gateway.git
cd W_app-gateway
npm install

# Create .env file
cat > .env << 'EOF'
PORT=3000
MAIN_SAAS_WEBHOOK_URL=https://YOUR-PROJECT.supabase.co/functions/v1/whatsapp-incoming
API_KEY=GENERATE_A_RANDOM_SECRET_HERE
REDIS_URL=
DATABASE_URL=
EOF

# Start with PM2
pm2 start src/index.js --name wa-gateway
pm2 save
pm2 startup   # auto-start on server reboot
```

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
Add a DNS A record: `wa.clixwapp.online` --> `5.161.49.166`

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
    server_name wa.clixwapp.online;

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
sudo certbot --nginx -d wa.clixwapp.online
```

Certbot auto-renews. Verify: `curl https://wa.clixwapp.online/health`

---

## Step 4: Generate API Key

```bash
# Generate a random key
openssl rand -hex 32
```

Put this in:
1. **VPS `.env`** as `API_KEY=your-generated-key`
2. **Supabase secrets** as `WA_GATEWAY_API_KEY`

All API calls must include the header: `x-api-key: your-generated-key`

---

## Step 5: Supabase Integration

### 5a. Sending messages (SaaS --> Gateway)

Create a Supabase edge function your frontend/backend calls:

```typescript
// supabase/functions/send-whatsapp/index.ts
import { serve } from "https://deno.land/std/http/server.ts";

serve(async (req) => {
  const { customerId, to, message } = await req.json();

  const res = await fetch(
    `https://wa.clixwapp.online/api/session/send/${customerId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("WA_GATEWAY_API_KEY")!,
      },
      body: JSON.stringify({ to, message }),
    }
  );

  const data = await res.json();
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
});
```

### 5b. Receiving messages (Gateway --> SaaS)

The gateway already forwards incoming messages to `MAIN_SAAS_WEBHOOK_URL`. Create the receiving edge function:

```typescript
// supabase/functions/whatsapp-incoming/index.ts
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

serve(async (req) => {
  const payload = await req.json();
  // payload = { customerId, from, pushName, message, timestamp }

  // Example: save to database
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  await supabase.from("messages").insert({
    customer_id: payload.customerId,
    from_number: payload.from,
    sender_name: payload.pushName,
    body: payload.message,
    received_at: new Date(payload.timestamp * 1000).toISOString(),
  });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

### 5c. Session management (Connect WhatsApp from frontend)

```typescript
// supabase/functions/wa-session-start/index.ts
// Called when a customer clicks "Connect WhatsApp" in your SaaS UI

const res = await fetch(
  `https://wa.clixwapp.online/api/session/start/${customerId}`,
  {
    method: "POST",
    headers: { "x-api-key": Deno.env.get("WA_GATEWAY_API_KEY")! },
  }
);
// Returns: { status: "qr_generated", qr: "data:image/png;base64,..." }
// Display the QR in your frontend for the customer to scan
```

---

## Step 6: Updating the Gateway

When you push new code:

```bash
ssh root@5.161.49.166
cd W_app-gateway
git pull
npm install        # if dependencies changed
pm2 restart wa-gateway
```

---

## API Endpoints Reference

All endpoints require `x-api-key` header when `API_KEY` is set.

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/api/session/start/:customerId` | - | Start session, returns QR code |
| GET | `/api/session/status/:customerId` | - | Check connection status |
| POST | `/api/session/send/:customerId` | `{ to, message }` | Send text message |
| POST | `/api/session/send-file/:customerId` | Form: `chatId`, `file`, `fileName?`, `caption?` | Send image/file |
| POST | `/api/session/send-buttons/:customerId` | `{ to, body, buttons, header?, footer? }` | Send interactive buttons (max 10) |
| DELETE | `/api/session/:customerId` | - | Disconnect and delete session |
| GET | `/health` | - | Health check (no auth needed) |

---

## Checklist

- [ ] VPS provisioned (Ubuntu 22.04, 2GB RAM)
- [ ] Node.js 20 + PM2 installed
- [ ] Repo cloned and `npm install` done
- [ ] `.env` configured with webhook URL and API key
- [ ] PM2 running and set to auto-start
- [ ] DNS subdomain pointing to VPS
- [ ] NGINX configured with SSL via Certbot
- [ ] `curl https://wa.clixwapp.online/health` returns `{"status":"ok"}`
- [ ] Supabase secrets set (`WA_GATEWAY_API_KEY`)
- [ ] Supabase edge functions deployed
- [ ] Test: start session, scan QR, send message, receive message
