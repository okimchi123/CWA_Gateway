# WhatsApp Gateway

## What this is
A self-hosted WhatsApp gateway service built with Baileys.
It replaces Green API — customers scan a QR code to connect 
their WhatsApp, and all messages are handled internally.

## Purpose
This is a standalone microservice used by our SaaS platform.
It manages WhatsApp sessions per customer and routes incoming
messages to our main SaaS backend.

## Tech Stack
- Node.js + Express
- Baileys (@whiskeysockets/baileys)
- Redis (session state)
- PostgreSQL (customer/session records)

## Core Features to Build
1. Start a Baileys session per customer
2. Generate and display QR code
3. Persist session credentials (no rescan on restart)
4. Receive incoming messages → forward to main SaaS
5. Send message via API endpoint
6. Detect disconnection → update status in DB

## Architecture
- Each customer has ONE Baileys session on this server
- Sessions are stored in /storage/{customerId}/
- Main SaaS calls this service to SEND messages
- This service calls main SaaS webhook when messages ARRIVE

## API Endpoints to Build
- POST /session/start/:customerId → start session + return QR
- GET  /session/status/:customerId → check connection status
- POST /send/:customerId → send a WhatsApp message
- DELETE /session/:customerId → disconnect and remove session

## Environment Variables
- PORT
- MAIN_SAAS_WEBHOOK_URL  ← where to forward incoming messages
- REDIS_URL
- DATABASE_URL

## Important Notes
- This runs on a VPS (not serverless) — sessions must stay alive 24/7
- Use PM2 to keep the process running
- Each session uses ~50-100mb RAM
- WhatsApp may disconnect sessions randomly — handle reconnection gracefully
- Never log message content, only metadata

## Coding Style
- Node.js ESM or CommonJS (pick one, stay consistent)
- Async/await everywhere
- Always handle errors gracefully
- Keep session logic in /src/sessions/
- Keep routes thin, logic in handlers