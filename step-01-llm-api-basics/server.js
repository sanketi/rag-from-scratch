// ─────────────────────────────────────────────────────────────────────────────
// server.js — Dev proxy server
//
// WHY THIS EXISTS:
//   The Anthropic API key must never be exposed in the browser.
//   This tiny Express server receives requests from the frontend,
//   injects the API key from .env, and forwards the call to Anthropic.
//
// Run with:  node server.js   (or: npm start)
// ─────────────────────────────────────────────────────────────────────────────

import express from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// ── /api/chat — proxies to Anthropic /v1/messages ────────────────────────────
app.post('/api/chat', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: { message: 'ANTHROPIC_API_KEY not set. Copy .env.example → .env and add your key.' }
    });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();

    // Forward Anthropic's status code so the frontend can detect errors
    res.status(response.status).json(data);

  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: { message: err.message } });
  }
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`\n  RAG from Scratch — Step 01`);
  console.log(`  Server running at http://localhost:${PORT}\n`);
});
