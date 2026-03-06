const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const sessionRoutes = require('./routes/sessions');
app.use('/api', sessionRoutes);

app.listen(PORT, () => {
  console.log(`WhatsApp Gateway running on port ${PORT}`);
});
