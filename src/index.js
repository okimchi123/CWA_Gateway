const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
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
const { restoreSessions } = require('./sessions/sessionManager');
app.use('/api', sessionRoutes);

app.listen(PORT, () => {
  console.log(`WhatsApp Gateway running on port ${PORT}`);
  restoreSessions();
});
