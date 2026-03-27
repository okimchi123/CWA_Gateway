# WhatsApp Gateway API Reference

> Multi-tenant WhatsApp gateway. Each SaaS project passes its own webhook URL when starting sessions.

**Auth:** All `/api/*` endpoints require header: `x-api-key: <your-api-key>`

---

## Endpoints

### 1. Start Session (Get QR Code)

```
POST /api/session/start/:customerId
Content-Type: application/json
```

**Body (optional):**
```json
{
  "webhookUrl": "https://your-project.supabase.co/functions/v1/flow-webhook"
}
```

If `webhookUrl` is provided, it is persisted to `storage/{customerId}/config.json` and used for all message forwarding for this session. If omitted, the session falls back to the `MAIN_SAAS_WEBHOOK_URL` env var.

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

The gateway forwards **both incoming and outgoing** messages to the session's `webhookUrl` (or `MAIN_SAAS_WEBHOOK_URL` fallback) via POST.

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

## Multi-Tenant Usage

Multiple SaaS projects can share a single gateway instance. Each project passes its own `webhookUrl` when starting sessions:

```typescript
// Project A's edge function — starts session with its own webhook
const res = await fetch(
  `https://your-gateway-domain.com/api/session/start/${customerId}`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": Deno.env.get("WA_GATEWAY_API_KEY")!,
    },
    body: JSON.stringify({
      webhookUrl: "https://project-a.supabase.co/functions/v1/flow-webhook"
    }),
  }
);
```

Sessions without a `webhookUrl` fall back to `MAIN_SAAS_WEBHOOK_URL` env var.

## Example: Send Message from Edge Function

```typescript
const res = await fetch(
  `https://your-gateway-domain.com/api/session/send/${customerId}`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": Deno.env.get("WA_GATEWAY_API_KEY")!,
    },
    body: JSON.stringify({ to: phoneNumber, message: text }),
  }
);
```
