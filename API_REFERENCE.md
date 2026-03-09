# WClixAPI - Custom WhatsApp Gateway API Reference

> This replaces Green API. Use this reference when building or updating Supabase edge functions.

**Base URL:** `https://wa.clixwapp.online`

**Auth:** All `/api/*` endpoints require header: `x-api-key: <your-api-key>`

---

## Endpoints

### 1. Start Session (Get QR Code)

```
POST /api/session/start/:customerId
```

**Response (first time - needs QR scan):**
```json
{
  "status": "qr_generated",
  "qr": "data:image/png;base64,..."
}
```

**Response (already connected):**
```json
{
  "status": "already_connected"
}
```

---

### 2. Check Session Status

```
GET /api/session/status/:customerId
```

**Response:**
```json
{
  "status": "connected"
}
```

Possible statuses: `connected`, `connecting`, `qr_generated`, `not_found`

---

### 3. Send Text Message

```
POST /api/session/send/:customerId
Content-Type: application/json
```

**Body:**
```json
{
  "to": "63XXXXXXXXXX",
  "message": "Hello from our SaaS!"
}
```

**Response:**
```json
{
  "status": "sent"
}
```

> Note: `to` is just the phone number (no @s.whatsapp.net needed — the gateway adds it automatically).

---

### 4. Send Image/File

```
POST /api/session/send-file/:customerId
Content-Type: multipart/form-data
```

**Form fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `chatId` | string | Yes | Phone number (e.g. `63XXXXXXXXXX`) |
| `file` | file | Yes | The image/file to send (max 16MB) |
| `fileName` | string | No | Custom file name |
| `caption` | string | No | Caption text for images |

**Response:**
```json
{
  "status": "sent"
}
```

---

### 5. Send Interactive Buttons

```
POST /api/session/send-buttons/:customerId
Content-Type: application/json
```

**Body:**
```json
{
  "to": "63XXXXXXXXXX",
  "body": "Please choose an option:",
  "header": "Welcome",
  "footer": "Tap a button to reply",
  "buttons": [
    { "buttonId": "1", "buttonText": "Option A" },
    { "buttonId": "2", "buttonText": "Option B" },
    { "buttonId": "3", "buttonText": "Option C" }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `to` | string | Yes | Phone number |
| `body` | string | Yes | Message text |
| `buttons` | array | Yes | 1-10 button objects |
| `header` | string | No | Title text above body |
| `footer` | string | No | Footer text below buttons |

Each button: `{ "buttonId": "unique-id", "buttonText": "Label (max 25 chars)" }`

**Response:**
```json
{
  "status": "sent"
}
```

> Note: Maximum 10 buttons per message. Uses native flow format via `relayMessage`.

---

### 6. Delete/Disconnect Session

```
DELETE /api/session/:customerId
```

**Response:**
```json
{
  "success": true
}
```

---

### 7. Health Check (no auth needed)

```
GET /health
```

**Response:**
```json
{
  "status": "ok"
}
```

---

## Message Webhook

The gateway forwards **both incoming and outgoing** messages to `MAIN_SAAS_WEBHOOK_URL` via POST.

### Private text message
```json
{
  "customerId": "customer1",
  "type": "incoming",
  "chatType": "private",
  "from": "639516185785",
  "pushName": "John Doe",
  "message": "Hi there!",
  "messageType": "text",
  "timestamp": 1709812345
}
```

### Private image message
```json
{
  "customerId": "customer1",
  "type": "incoming",
  "chatType": "private",
  "from": "639516185785",
  "pushName": "John Doe",
  "message": "check this out",
  "messageType": "image",
  "timestamp": 1709812345,
  "image": {
    "base64": "/9j/4AAQSkZJRg...",
    "mimetype": "image/jpeg",
    "caption": "check this out"
  }
}
```

### Group message
```json
{
  "customerId": "customer1",
  "type": "incoming",
  "chatType": "group",
  "from": "120363044555888777",
  "participant": "639516185785",
  "pushName": "John Doe",
  "message": "hello everyone",
  "messageType": "text",
  "timestamp": 1709812345
}
```

### Outgoing message
```json
{
  "customerId": "customer1",
  "type": "outgoing",
  "chatType": "private",
  "from": "639516185785",
  "pushName": null,
  "message": "Thanks for reaching out!",
  "messageType": "text",
  "timestamp": 1709812350
}
```

### Webhook Fields

| Field | Type | Description |
|-------|------|-------------|
| `customerId` | string | The session/customer ID |
| `type` | string | `"incoming"` or `"outgoing"` |
| `chatType` | string | `"private"` or `"group"` |
| `from` | string | Phone number (private) or group ID (group chat) |
| `participant` | string\|undefined | Only in group messages — phone number of the sender |
| `pushName` | string\|null | Sender's WhatsApp display name (usually null for outgoing) |
| `message` | string | Message text, button display text, or image caption |
| `messageType` | string | `"text"` or `"image"` |
| `timestamp` | number | Unix seconds |
| `image` | object\|undefined | Only when `messageType` is `"image"` |
| `image.base64` | string | Base64-encoded image data (not saved to disk) |
| `image.mimetype` | string | e.g. `"image/jpeg"`, `"image/png"` |
| `image.caption` | string\|null | Image caption if provided |

> `from` is a clean phone number (e.g. `639516185785`), not a JID. The gateway resolves LIDs to phone numbers automatically.
> Button/interactive replies are forwarded as regular text messages with the button's display text in `message`.
> Images are sent as base64 in the payload — nothing is stored on disk.

---

## Migration from Green API

| Green API | WClixAPI (ours) |
|-----------|-----------------|
| `POST /waInstance.../sendMessage` | `POST /api/session/send/:customerId` |
| `POST /waInstance.../SendFileByUpload` | `POST /api/session/send-file/:customerId` |
| `POST /waInstance.../getQRCode` | `POST /api/session/start/:customerId` |
| `GET /waInstance.../getStateInstance` | `GET /api/session/status/:customerId` |
| `POST /waInstance.../logout` | `DELETE /api/session/:customerId` |
| Webhook: `stateInstanceChanged` | `GET /api/session/status/:customerId` (poll) |
| Webhook: `incomingMessageReceived` | Our gateway POSTs to `MAIN_SAAS_WEBHOOK_URL` (type: `incoming`) |
| Webhook: `outgoingMessageStatus` | Our gateway POSTs to `MAIN_SAAS_WEBHOOK_URL` (type: `outgoing`) |

### Key differences from Green API:
1. **No instance creation** — just call `/api/session/start/:customerId` with any customer ID
2. **Single API key** for all sessions (not per-instance like Green API)
3. **QR code returned as base64 PNG** directly in the response (no separate getQRCode call)
4. **Phone number format** — send `to` as plain number (`63XXXXXXXXXX`), no need for `@c.us` suffix
5. **Webhook payload** — includes `chatType`, `messageType`, `from` as clean phone number, and `image` for photos
6. **Clean phone numbers** — `from` is always a phone number (e.g. `639516185785`), not a JID or LID. Group messages include `participant` for the sender's number.

---

## Example: Supabase Edge Function - Send Message

```typescript
const res = await fetch(
  `https://wa.clixwapp.online/api/session/send/${customerId}`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": Deno.env.get("WA_GATEWAY_API_KEY")!,
    },
    body: JSON.stringify({ to: phoneNumber, message: text }),
  }
);
const data = await res.json();
```

## Example: Supabase Edge Function - Start Session

```typescript
const res = await fetch(
  `https://wa.clixwapp.online/api/session/start/${customerId}`,
  {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("WA_GATEWAY_API_KEY")!,
    },
  }
);
const data = await res.json();
// data.qr = "data:image/png;base64,..." (display this in your frontend)
```

## Example: Supabase Edge Function - Receive Messages

```typescript
// This edge function URL goes in the gateway's MAIN_SAAS_WEBHOOK_URL env var
const payload = await req.json();
// payload = { customerId, type, chatType, from, pushName, message, messageType, timestamp, image?, participant? }

if (payload.type === "incoming") {
  // payload.from = phone number (e.g. "639516185785")
  // payload.chatType = "private" or "group"
  // payload.participant = sender's phone (only in group chats)

  if (payload.messageType === "image" && payload.image) {
    // payload.image.base64 = base64-encoded image data
    // payload.image.mimetype = "image/jpeg", "image/png", etc.
    // payload.image.caption = caption text or null
  }
}
```
