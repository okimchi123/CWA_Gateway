# WhatsApp Gateway

## What this is
A self-hosted, multi-tenant WhatsApp gateway service built with Baileys.
Customers scan a QR code to connect their WhatsApp, and all messages are routed to the correct SaaS backend.

## Purpose
This is a standalone microservice shared by multiple SaaS projects.
It manages WhatsApp sessions per customer and routes incoming messages to each project's webhook based on per-session configuration.

## Tech Stack
- Node.js + Express 5
- Baileys (@whiskeysockets/baileys) for WhatsApp Web connections
- File-based session persistence (`storage/{customerId}/`)

## Architecture
- Each customer has ONE Baileys session on this server
- Sessions are stored in `storage/{customerId}/` (auth creds + config.json)
- SaaS backends call this service to SEND messages via REST API
- This service forwards incoming/outgoing messages to the session's `webhookUrl` (or `MAIN_SAAS_WEBHOOK_URL` fallback)

### Multi-Tenant Routing
- Each session can have its own `webhookUrl` (passed in `POST /api/session/start/:customerId` body)
- The URL is persisted to `storage/{customerId}/config.json` and survives restarts
- Sessions without a `webhookUrl` fall back to the `MAIN_SAAS_WEBHOOK_URL` env var

## Project Structure
```
src/
  index.js                    # Express entry point, health check, API key auth middleware
  sessions/sessionManager.js  # Baileys session lifecycle, QR, reconnection, webhookUrl persistence
  handlers/messageHandler.js  # Message extraction, image download, webhook forwarding
  routes/sessions.js          # REST API endpoints (start, status, send, send-file, send-buttons, delete)
storage/                      # Per-customer auth credentials + config.json (gitignored)
```

## API Endpoints
All `/api/*` endpoints require `x-api-key` header when `API_KEY` env var is set.

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/api/session/start/:customerId` | `{ webhookUrl? }` | Start session, returns QR code |
| GET | `/api/session/status/:customerId` | - | Check connection status |
| POST | `/api/session/send/:customerId` | `{ to, message }` | Send text message |
| POST | `/api/session/send-file/:customerId` | Form: `chatId`, `file`, `caption?` | Send image/file (max 16MB) |
| POST | `/api/session/send-buttons/:customerId` | `{ to, body, buttons, header?, footer? }` | Send interactive buttons (max 10) |
| DELETE | `/api/session/:customerId` | - | Disconnect and delete session |
| GET | `/health` | - | Health check (no auth) |

## Environment Variables
- `PORT` — server port (default 3000)
- `MAIN_SAAS_WEBHOOK_URL` — default webhook for sessions without a per-session URL
- `API_KEY` — shared secret for API authentication (empty = auth disabled)

## Commands
- `npm run dev` — start with file watching (development)
- `npm start` — start without watching (production)

## Important Notes
- This runs on a VPS (not serverless) — sessions must stay alive 24/7
- Use PM2 to keep the process running in production
- Each session uses ~50-100MB RAM
- WhatsApp may disconnect sessions randomly — auto-reconnection handles this (3 retries)
- CommonJS modules throughout
- Async/await everywhere
- Session logic in `src/sessions/`, message handling in `src/handlers/`, routes in `src/routes/`
