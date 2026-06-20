// ─────────────────────────────────────────────────────────────────────────────
// server.js — Static file server for Step 03
//
// Chunking is pure text math — no LLM or CIS call needed.
// Express just serves the HTML/JS so you open http://localhost:3002
// ─────────────────────────────────────────────────────────────────────────────

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.static(join(__dirname, 'public')));

const PORT = process.env.PORT ?? 3002;
app.listen(PORT, () => {
  console.log(`\n  RAG from Scratch — Step 03`);
  console.log(`  Server running at http://localhost:${PORT}\n`);
});
