const { Router } = require('express');
const {
  startSession,
  getSession,
  getSessionStatus,
  deleteSession,
} = require('../sessions/sessionManager');

const router = Router();

// POST /session/start/:customerId
router.post('/session/start/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const result = await startSession(customerId);
    res.json(result);
  } catch (err) {
    console.error(`[start] Error for ${req.params.customerId}:`, err.message);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

// GET /session/status/:customerId
router.get('/session/status/:customerId', (req, res) => {
  try {
    const { customerId } = req.params;
    const result = getSessionStatus(customerId);
    res.json(result);
  } catch (err) {
    console.error(`[status] Error for ${req.params.customerId}:`, err.message);
    res.status(500).json({ error: 'Failed to get session status' });
  }
});

// POST /session/send/:customerId
router.post('/session/send/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { to, message } = req.body;

    if (!to || !message) {
      return res.status(400).json({ error: 'Missing "to" or "message" in body' });
    }

    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

    const session = getSession(customerId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (session.status !== 'connected') {
      return res.status(400).json({ error: `Session not connected (status: ${session.status})` });
    }

    await session.socket.sendMessage(jid, { text: message });
    res.json({ status: 'sent' });
  } catch (err) {
    console.error(`[send] Error for ${req.params.customerId}:`, err.message);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// DELETE /session/:customerId
router.delete('/session/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const result = await deleteSession(customerId);

    if (result.status === 'not_found') {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(`[delete] Error for ${req.params.customerId}:`, err.message);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

module.exports = router;
