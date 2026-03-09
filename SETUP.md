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
API_KEY=your-secret-api-key
```

Go to https://webhook.site to get a free temporary webhook URL for testing incoming messages.

> If `API_KEY` is set, all `/api/*` endpoints require the `x-api-key` header.

## 3. Start the Server

```bash
npm run dev
```

You should see: `WhatsApp Gateway running on port 3000`

## 4. Start a Session (Get QR Code)

```bash
curl -X POST http://localhost:3000/api/session/start/customer1 -H "x-api-key: RO0iItMSu6ydgYXKEGrO7k9y7oWxhlDbAeVQdtTU9lbAk0ISm3a6BkFpvl8c3dOO"
```

The response contains a `qr` field with a base64 data URL. Paste it into your browser address bar to view the QR image.

## 5. Scan the QR Code

On your phone: **WhatsApp → Settings → Linked Devices → Link a Device** → scan the QR.

> The QR expires in ~60 seconds. If it does, call the start endpoint again.

## 6. Verify Connection

```bash
curl http://localhost:3000/api/session/status/customer1 -H "x-api-key: RO0iItMSu6ydgYXKEGrO7k9y7oWxhlDbAeVQdtTU9lbAk0ISm3a6BkFpvl8c3dOO"
```

Expected response:

```json
{ "status": "connected" }
```

## 7. Send a Text Message

```bash
curl -X POST http://localhost:3000/api/session/send/customer1 \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-secret-api-key" \
  -d '{"to": "63XXXXXXXXXX", "message": "Hello from gateway!"}'
```

One-liner (Windows-friendly):
```
curl -X POST http://localhost:3000/api/session/send/customer1 -H "Content-Type: application/json" -H "x-api-key: RO0iItMSu6ydgYXKEGrO7k9y7oWxhlDbAeVQdtTU9lbAk0ISm3a6BkFpvl8c3dOO" -d "{\"to\": \"639516185785\", \"message\": \"Hello from gateway!\"}"
```

Replace `63XXXXXXXXXX` with a real phone number (country code + number, no `+`).

## 8. Send a Photo/File

```bash
curl -X POST http://localhost:3000/api/session/send-file/customer1 \
  -H "x-api-key: RO0iItMSu6ydgYXKEGrO7k9y7oWxhlDbAeVQdtTU9lbAk0ISm3a6BkFpvl8c3dOO" \
  -F "chatId=639516185785" \
  -F "file=@photo.jpg" \
  -F "caption=Check this out"
```

## 9. Send Interactive Buttons

```bash
curl -X POST http://localhost:3000/api/session/send-buttons/customer1 \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-secret-api-key" \
  -d '{
    "to": "639516185785",
    "body": "Choose an option:",
    "header": "Welcome",
    "footer": "Tap a button to reply",
    "buttons": [
      {"buttonId": "1", "buttonText": "Yes"},
      {"buttonId": "2", "buttonText": "No"},
      {"buttonId": "3", "buttonText": "Maybe"}
    ]
  }'
```

curl -X POST http://localhost:3000/api/session/send-buttons/customer1 -H "Content-Type: application/json" -H "x-api-key: RO0iItMSu6ydgYXKEGrO7k9y7oWxhlDbAeVQdtTU9lbAk0ISm3a6BkFpvl8c3dOO" -d "{\"to\":\"639516185785\",\"body\":\"Choose an option:\",\"header\":\"Welcome\",\"footer\":\"Tap a button to reply\",\"buttons\":[{\"buttonId\":\"1\",\"buttonText\":\"Yes\"},{\"buttonId\":\"2\",\"buttonText\":\"No\"},{\"buttonId\":\"3\",\"buttonText\":\"Maybe\"}]}"


> Max 10 buttons per message. Uses native flow format via `relayMessage`.

## 10. Test Message Webhooks

Both incoming and outgoing messages are forwarded to your webhook URL. Check your webhook.site dashboard.

**Incoming text (private chat):**

```json
{
  "customerId": "customer1",
  "type": "incoming",
  "chatType": "private",
  "from": "639516185785",
  "pushName": "Sender Name",
  "message": "the message text",
  "messageType": "text",
  "timestamp": 1709827200
}
```

**Incoming image (private chat):**

```json
{
  "customerId": "customer1",
  "type": "incoming",
  "chatType": "private",
  "from": "639516185785",
  "pushName": "Sender Name",
  "message": "caption text or empty string",
  "messageType": "image",
  "timestamp": 1709827200,
  "image": {
    "base64": "/9j/4AAQSkZJRg...",
    "mimetype": "image/jpeg",
    "caption": "caption text"
  }
}
```

**Incoming message (group chat):**

```json
{
  "customerId": "customer1",
  "type": "incoming",
  "chatType": "group",
  "from": "120363044555888777",
  "participant": "639516185785",
  "pushName": "Sender Name",
  "message": "hello everyone",
  "messageType": "text",
  "timestamp": 1709827200
}
```

**Outgoing message:**

```json
{
  "customerId": "customer1",
  "type": "outgoing",
  "chatType": "private",
  "from": "639516185785",
  "pushName": null,
  "message": "the reply text",
  "messageType": "text",
  "timestamp": 1709827210
}
```

> `from` is a phone number (e.g. `639516185785`) for private chats, or a group ID for group chats.
> `participant` is only present in group messages — it's the phone number of who sent the message.
> `chatType` is `"private"` or `"group"`.
> `messageType` is `"text"` or `"image"`. Images include a `base64` field (no files saved to disk).
> Button replies are detected and forwarded as text messages with the button's display text.

## 11. Delete a Session

```bash
curl -X DELETE http://localhost:3000/api/session/customer1 -H "x-api-key: your-secret-api-key"
```

## Notes

- Credentials are saved in `storage/customer1/` so you won't need to rescan after a server restart.
- If `MAIN_SAAS_WEBHOOK_URL` is not set, the server still runs but webhook forwarding will log errors.
- If `API_KEY` is empty or not set, auth is disabled (useful for local dev).
- For production, use PM2: `pm2 start src/index.js --name wa-gateway`
