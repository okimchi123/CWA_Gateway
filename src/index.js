const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Enhanced health endpoint with session stats
app.get('/health', (req, res) => {
  const { sessions } = require('./sessions/sessionManager');
  const sessionStats = { total: sessions.size, connected: 0, disconnected: 0, connecting: 0 };
  for (const [, s] of sessions) {
    if (s.status === 'connected') sessionStats.connected++;
    else if (s.status === 'disconnected') sessionStats.disconnected++;
    else sessionStats.connecting++;
  }
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    sessions: sessionStats,
    timestamp: new Date().toISOString(),
  });
});

// API key auth for /api routes
app.use('/api', (req, res, next) => {
  const apiKey = process.env.API_KEY;
  if (apiKey && req.headers['x-api-key'] !== apiKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
});

const sessionRoutes = require('./routes/sessions');
const { restoreSessions, startHealthMonitor, gracefulShutdown } = require('./sessions/sessionManager');
app.use('/api', sessionRoutes);

// Graceful shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

app.listen(PORT, () => {
  console.log(`WhatsApp Gateway running on port ${PORT}`);
  restoreSessions();
  startHealthMonitor();
});
