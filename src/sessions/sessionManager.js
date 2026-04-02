const path = require('path');
const qrcode = require('qrcode');
const pino = require('pino');
const axios = require('axios');
const { handleMessage } = require('../handlers/messageHandler');

const STORAGE_DIR = path.join(__dirname, '..', '..', 'storage');
const logger = pino({ level: 'warn' });

const PERIODIC_RETRY_INTERVAL = 5 * 60 * 1000; // 5 minutes
const MAX_PERIODIC_RETRIES = 288; // 24 hours at 5-min intervals
const HEALTH_CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes

// In-memory store of active sessions
// Map<customerId, { socket, status, qr, webhookUrl, retryIntervalId, periodicRetryCount }>
const sessions = new Map();

let baileys = null;

async function loadBaileys() {
  if (!baileys) {
    baileys = await import('@whiskeysockets/baileys');
  }
  return baileys;
}

async function notifyStatusChange(customerId, status, webhookUrl) {
  const url = webhookUrl || process.env.MAIN_SAAS_WEBHOOK_URL;
  if (!url) return;

  const payload = {
    type: 'status_change',
    customerId,
    status,
    timestamp: Date.now(),
  };

  try {
    await axios.post(url, payload, { timeout: 10000 });
    console.log(`[${customerId}] Status notification sent: ${status}`);
  } catch (err) {
    console.error(`[${customerId}] Status notification failed: ${err.message}`);
  }
}

function clearRetryInterval(session) {
  if (session.retryIntervalId) {
    clearInterval(session.retryIntervalId);
    session.retryIntervalId = null;
    session.periodicRetryCount = 0;
  }
}

async function startSession(customerId, webhookUrl) {
  if (sessions.has(customerId)) {
    const existing = sessions.get(customerId);
    if (existing.status === 'connected') {
      return { status: 'already_connected', phoneNumber: getConnectedPhoneNumber(existing.socket) };
    }
  }

  const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestWaWebVersion } = await loadBaileys();

  const authDir = path.join(STORAGE_DIR, customerId);
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const { version } = await fetchLatestWaWebVersion();
  console.log(`[${customerId}] Using WA web version: ${version}`);

  const socket = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger,
    version,
  });

  // Resolve webhookUrl: use provided value, or load from persisted config, or null (fallback to env)
  const configPath = path.join(authDir, 'config.json');
  if (webhookUrl) {
    const fs2 = require('fs');
    if (!fs2.existsSync(authDir)) fs2.mkdirSync(authDir, { recursive: true });
    fs2.writeFileSync(configPath, JSON.stringify({ webhookUrl }));
  } else if (!webhookUrl) {
    try {
      const fs2 = require('fs');
      const cfg = JSON.parse(fs2.readFileSync(configPath, 'utf8'));
      webhookUrl = cfg.webhookUrl || null;
    } catch { webhookUrl = null; }
  }

  const session = sessions.get(customerId) || { socket: null, status: 'connecting', qr: null, webhookUrl, retryIntervalId: null, periodicRetryCount: 0 };
  session.socket = socket;
  session.status = 'connecting';
  session.qr = null;
  session.webhookUrl = webhookUrl;
  sessions.set(customerId, session);

  return new Promise((resolve) => {
    let resolved = false;

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('messages.upsert', (upsert) => {
      handleMessage(customerId, upsert, socket, session.webhookUrl);
    });

    socket.ev.on('connection.update', async (update) => {
      console.log(`[${customerId}] connection.update:`, JSON.stringify(update, null, 2));
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        const qrDataUrl = await qrcode.toDataURL(qr);
        session.qr = qrDataUrl;
        session.status = 'waiting_for_qr';

        if (!resolved) {
          resolved = true;
          resolve({ status: 'qr_generated', qr: qrDataUrl });
        }
      }

      if (connection === 'open') {
        session.status = 'connected';
        session.qr = null;
        clearRetryInterval(session);
        console.log(`[${customerId}] Connected`);

        notifyStatusChange(customerId, 'connected', session.webhookUrl);

        if (!resolved) {
          resolved = true;
          resolve({ status: 'connected' });
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        console.log(`[${customerId}] Disconnected (code: ${statusCode}, loggedOut: ${loggedOut})`);

        if (loggedOut) {
          clearRetryInterval(session);
          sessions.delete(customerId);
          const fs = require('fs/promises');
          await fs.rm(authDir, { recursive: true, force: true }).catch(() => {});
          session.status = 'logged_out';

          notifyStatusChange(customerId, 'logged_out', session.webhookUrl);
        } else {
          session.status = 'disconnected';
          console.log(`[${customerId}] Disconnected, attempting fast reconnection...`);

          // Tier 1: 3 fast retries
          const MAX_RETRIES = 3;
          let reconnected = false;
          for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            console.log(`[${customerId}] Fast reconnect attempt ${attempt}/${MAX_RETRIES}`);
            try {
              const result = await startSession(customerId, session.webhookUrl);
              if (result.status === 'connected' || result.status === 'qr_generated' || result.status === 'already_connected') {
                console.log(`[${customerId}] Reconnected on fast attempt ${attempt}`);
                reconnected = true;
                break;
              }
            } catch (err) {
              console.error(`[${customerId}] Fast reconnect attempt ${attempt} failed:`, err.message);
            }

            if (attempt < MAX_RETRIES) {
              await new Promise((r) => setTimeout(r, 3000 * attempt));
            }
          }

          // Tier 2: Periodic retry every 5 minutes if fast retries failed
          if (!reconnected) {
            console.log(`[${customerId}] Fast retries exhausted. Starting periodic retry every 5 minutes (up to 24 hours).`);
            notifyStatusChange(customerId, 'disconnected', session.webhookUrl);

            const current = sessions.get(customerId);
            if (current && !current.retryIntervalId) {
              current.periodicRetryCount = 0;
              current.retryIntervalId = setInterval(async () => {
                const s = sessions.get(customerId);
                if (!s || s.status === 'connected') {
                  clearRetryInterval(s || current);
                  return;
                }

                s.periodicRetryCount = (s.periodicRetryCount || 0) + 1;
                console.log(`[${customerId}] Periodic reconnect attempt ${s.periodicRetryCount}/${MAX_PERIODIC_RETRIES}`);

                if (s.periodicRetryCount > MAX_PERIODIC_RETRIES) {
                  console.error(`[${customerId}] Periodic retries exhausted after 24 hours. Giving up.`);
                  clearRetryInterval(s);
                  notifyStatusChange(customerId, 'logged_out', s.webhookUrl);
                  return;
                }

                try {
                  const result = await startSession(customerId, s.webhookUrl);
                  if (result.status === 'connected' || result.status === 'already_connected') {
                    console.log(`[${customerId}] Periodic reconnect succeeded on attempt ${s.periodicRetryCount}`);
                    clearRetryInterval(s);
                  }
                } catch (err) {
                  console.error(`[${customerId}] Periodic reconnect failed:`, err.message);
                }
              }, PERIODIC_RETRY_INTERVAL);
            }
          }
        }

        if (!resolved) {
          resolved = true;
          resolve({ status: 'disconnected', loggedOut });
        }
      }
    });
  });
}

function getConnectedPhoneNumber(socket) {
  const id = socket?.user?.id;
  if (!id) return null;
  return id.split(/[:@]/)[0] || null;
}

function getSession(customerId) {
  return sessions.get(customerId) || null;
}

function getSessionStatus(customerId) {
  const session = sessions.get(customerId);
  if (!session) return { status: 'not_found' };
  const result = { status: session.status, qr: session.qr };
  if (session.status === 'connected') {
    result.phoneNumber = getConnectedPhoneNumber(session.socket);
  }
  return result;
}

async function deleteSession(customerId) {
  const session = sessions.get(customerId);
  if (!session) return { status: 'not_found' };

  clearRetryInterval(session);

  try {
    await session.socket.logout();
  } catch {
    // socket may already be closed
    session.socket.end();
  }

  sessions.delete(customerId);

  const fs = require('fs/promises');
  const authDir = path.join(STORAGE_DIR, customerId);
  await fs.rm(authDir, { recursive: true, force: true }).catch(() => {});

  return { status: 'deleted' };
}

async function restoreSessions() {
  const fs = require('fs');
  if (!fs.existsSync(STORAGE_DIR)) return;

  const customers = fs.readdirSync(STORAGE_DIR).filter((name) => {
    return fs.statSync(path.join(STORAGE_DIR, name)).isDirectory();
  });

  for (const customerId of customers) {
    console.log(`[${customerId}] Restoring session...`);
    startSession(customerId).catch((err) => {
      console.error(`[${customerId}] Restore failed:`, err.message);
    });
  }
}

function getSessionWebhookUrl(customerId) {
  const session = sessions.get(customerId);
  return session?.webhookUrl || null;
}

// Session health monitor — catches orphaned disconnected sessions
function startHealthMonitor() {
  setInterval(() => {
    for (const [customerId, session] of sessions) {
      if (session.status === 'disconnected' && !session.retryIntervalId) {
        console.log(`[${customerId}] Health monitor: found orphaned disconnected session, starting periodic retry`);
        session.periodicRetryCount = 0;
        session.retryIntervalId = setInterval(async () => {
          const s = sessions.get(customerId);
          if (!s || s.status === 'connected') {
            clearRetryInterval(s || session);
            return;
          }

          s.periodicRetryCount = (s.periodicRetryCount || 0) + 1;
          console.log(`[${customerId}] Health monitor periodic reconnect attempt ${s.periodicRetryCount}/${MAX_PERIODIC_RETRIES}`);

          if (s.periodicRetryCount > MAX_PERIODIC_RETRIES) {
            console.error(`[${customerId}] Health monitor: periodic retries exhausted. Giving up.`);
            clearRetryInterval(s);
            notifyStatusChange(customerId, 'logged_out', s.webhookUrl);
            return;
          }

          try {
            const result = await startSession(customerId, s.webhookUrl);
            if (result.status === 'connected' || result.status === 'already_connected') {
              console.log(`[${customerId}] Health monitor: reconnect succeeded`);
              clearRetryInterval(s);
            }
          } catch (err) {
            console.error(`[${customerId}] Health monitor: reconnect failed:`, err.message);
          }
        }, PERIODIC_RETRY_INTERVAL);
      }
    }
  }, HEALTH_CHECK_INTERVAL);
}

async function gracefulShutdown(signal) {
  console.log(`[shutdown] Received ${signal}, closing ${sessions.size} sessions...`);
  for (const [id, session] of sessions) {
    try {
      clearRetryInterval(session);
      session.socket?.end();
    } catch (err) {
      console.error(`[shutdown] Error closing session ${id}:`, err.message);
    }
  }
  process.exit(0);
}

module.exports = {
  sessions,
  startSession,
  getSession,
  getSessionStatus,
  getSessionWebhookUrl,
  deleteSession,
  restoreSessions,
  startHealthMonitor,
  gracefulShutdown,
};
