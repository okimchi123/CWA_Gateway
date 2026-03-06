const axios = require('axios');

async function forwardToWebhook(payload) {
  const url = process.env.MAIN_SAAS_WEBHOOK_URL;
  if (!url) {
    console.error('[webhook] MAIN_SAAS_WEBHOOK_URL is not set, skipping');
    return;
  }

  try {
    await axios.post(url, payload, { timeout: 10000 });
  } catch (err) {
    console.error(`[webhook] First attempt failed: ${err.message}. Retrying...`);
    await new Promise((r) => setTimeout(r, 2000));
    try {
      await axios.post(url, payload, { timeout: 10000 });
    } catch (retryErr) {
      console.error(`[webhook] Retry failed: ${retryErr.message}`);
    }
  }
}

async function handleIncomingMessage(customerId, { messages, type }) {
  if (type !== 'notify') return;

  for (const msg of messages) {
    if (msg.key.fromMe) continue;

    const text = msg.message?.conversation
      || msg.message?.extendedTextMessage?.text;

    if (!text) continue;

    const payload = {
      customerId,
      from: msg.key.remoteJid,
      pushName: msg.pushName || null,
      message: text,
      timestamp: msg.messageTimestamp,
    };

    console.log(`[${customerId}] Incoming from ${payload.from}`);
    forwardToWebhook(payload);
  }
}

module.exports = { handleIncomingMessage };
