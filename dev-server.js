// Local dev server that proxies /api/* to the serverless functions
const express = require('express');
const app = express();
app.use(express.json({ limit: '10mb' }));

// Load .env.local
require('dotenv').config({ path: '.env.local' });

// Mount API routes
const shareHandler = require('./api/share');
const generateHandler = require('./api/generate');

app.all('/api/share', (req, res) => shareHandler(req, res));
app.all('/api/generate', (req, res) => generateHandler(req, res));

const PORT = 3003;
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
  console.log(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'configured' : 'MISSING'}`);
});
