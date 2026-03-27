# Project Context

## Origin

This repo was cloned from `https://github.com/okimchi123/W_app-gateway` — the WhatsApp gateway used by the original **Clix** SaaS project (repo: `Shaharelhad/Clix-Saas`).

The user is building a new SaaS project called **Ortam** (local codebase: `Desktop/Claude Code/Ortam-SaaS`), which is a duplication of Clix with its own Supabase project, Inngest, and frontend. Both projects need to share a single WhatsApp gateway instance.

## What Was Changed (Multi-Tenant Support)

The original gateway forwarded ALL incoming WhatsApp messages to a single `MAIN_SAAS_WEBHOOK_URL` env var. This meant only one SaaS project could receive messages. We added **per-session webhook routing** so multiple projects can share one gateway.

### Changes Made

**`src/sessions/sessionManager.js`**
- `startSession(customerId, webhookUrl)` — now accepts optional `webhookUrl`
- Persists `webhookUrl` to `storage/{customerId}/config.json`
- On restore/reconnect, reads webhookUrl from config.json
- Passes webhookUrl through to `handleMessage()`
- Added `getSessionWebhookUrl()` export

**`src/handlers/messageHandler.js`**
- `handleMessage(customerId, upsert, socket, webhookUrl)` — accepts webhookUrl
- `forwardToWebhook(payload, webhookUrl)` — uses per-session URL, falls back to `MAIN_SAAS_WEBHOOK_URL`

**`src/routes/sessions.js`**
- `POST /api/session/start/:customerId` — reads `webhookUrl` from request body, passes to `startSession()`

### Backward Compatibility

- Existing sessions with no `config.json` → fall back to `MAIN_SAAS_WEBHOOK_URL` → original project works unchanged
- New sessions without `webhookUrl` in body → same fallback
- New sessions with `webhookUrl` → messages route to that URL

## Related: Ortam Edge Function Changes

In the Ortam-SaaS codebase (`Desktop/Claude Code/Ortam-SaaS`), the following was done:

- Renamed edge function `wclixapi-connect` → `wa-connect` (removed Clix branding)
- `wa-connect/index.ts` now passes `webhookUrl` when starting sessions:
  ```typescript
  body: JSON.stringify({ webhookUrl: `${supabaseUrl}/functions/v1/flow-webhook` })
  ```
- All frontend references updated: `callWClixAPIConnect` → `callWaConnect`
- Env var renamed: `VITE_EDGE_FN_WCLIXAPI_CONNECT` → `VITE_EDGE_FN_WA_CONNECT`
- Deployed `wa-connect` to Ortam Supabase, deleted old `wclixapi-connect`

## Ortam Supabase Project

- **Project ref:** `wkjinyqkvfszgbttmbit`
- **URL:** `https://wkjinyqkvfszgbttmbit.supabase.co`
- **Flow webhook:** `https://wkjinyqkvfszgbttmbit.supabase.co/functions/v1/flow-webhook`

## What's Next

1. **Deploy this gateway** to a VPS (see `ProdPlan.md`)
2. **Update Ortam's `_shared/wa-messaging.ts`** to point to the new gateway domain (currently still points to `wa.clixwapp.online`)
3. **Update Ortam's `wa-connect/index.ts`** `WA_GATEWAY_BASE` to the new gateway domain
4. **Generate a new API key** and set it in both the gateway `.env` and Ortam's Supabase secrets as `WA_GATEWAY_API_KEY`
5. **Test end-to-end:** start session from Ortam dashboard → scan QR → send/receive messages → verify they route to Ortam's `flow-webhook`
