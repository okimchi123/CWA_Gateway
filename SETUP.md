# Setup & Testing Guide

## Prerequisites

- Node.js installed
- A WhatsApp account on a real phone

## 1. Install Dependencies

```bash
npm install
```

## 2. Configure Environment

Copy the example env file and fill it in:

```bash
cp .env.example .env
```

```
PORT=3000
MAIN_SAAS_WEBHOOK_URL=https://webhook.site/<your-unique-id>
```

Go to https://webhook.site to get a free temporary webhook URL for testing incoming messages.

## 3. Start the Server

```bash
npm run dev
```

You should see: `WhatsApp Gateway running on port 3000`

## 4. Start a Session (Get QR Code)

```bash
curl -X POST http://localhost:3000/api/session/start/customer1
```

The response contains a `qr` field with a base64 data URL. Paste it into your browser address bar to view the QR image.

## 5. Scan the QR Code

On your phone: **WhatsApp → Settings → Linked Devices → Link a Device** → scan the QR.

> The QR expires in ~60 seconds. If it does, call the start endpoint again.

## 6. Verify Connection

```bash
curl http://localhost:3000/api/session/status/customer1
```

Expected response:

```json
{ "status": "connected" }
```

## 7. Send a Message

```bash
curl -X POST http://localhost:3000/api/session/send/customer1 \
  -H "Content-Type: application/json" \
  -d '{"to": "63XXXXXXXXXX", "message": "Hello from gateway!"}'
```

Replace `63XXXXXXXXXX` with a real phone number (country code + number, no `+`).

## 8. Test Incoming Messages

Send a WhatsApp message TO the connected number from another phone. Check your webhook.site dashboard — the forwarded payload should appear with this structure:

```json
{
  "customerId": "customer1",
  "from": "63XXXXXXXXXX@s.whatsapp.net",
  "message": "the message text",
  "timestamp": 1709827200
}
```

## 9. Delete a Session

```bash
curl -X DELETE http://localhost:3000/api/session/customer1
```

## Notes

- Credentials are saved in `storage/customer1/` so you won't need to rescan after a server restart.
- If `MAIN_SAAS_WEBHOOK_URL` is not set, the server still runs but webhook forwarding will log errors.
- For production, use `npm start` with PM2: `pm2 start npm -- start`
