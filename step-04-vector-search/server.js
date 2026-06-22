// ─────────────────────────────────────────────────────────────────────────────
// server.js — Step 04: Vector Search
//
// This server connects three pieces you learned in earlier steps:
//   Step 03 — chunkText()       splits a document into pieces
//   Step 02 — embedTexts()      turns text into vectors via CIS
//   Step 04 — ChromaDB          stores vectors and finds the nearest matches
//
// Two main operations:
//   POST /api/index  — "ingest" a document (chunk → embed → store)
//   POST /api/query  — "search" for chunks similar to a user question
//
// Run with:  npm start
// Requires:  docker compose up -d  (ChromaDB) + VPN (CIS embeddings)
// ─────────────────────────────────────────────────────────────────────────────

import express from 'express';
import https from 'node:https';
import { ChromaClient } from 'chromadb';
import { userInfo } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// ── Configuration ───────────────────────────────────────────────────────────
// CIS_ROOT: base URL for Workday's inference service (embeddings API).
// Same eng environment as Steps 01–02 — requires VPN + /etc/hosts entry.
const CIS_ROOT = process.env.CIS_ROOT
  ?? 'https://s0010-ml-https.s0010.us-west-2.awswd/ml/inference/cis';

// Which embedding model CIS should use (provider/model format).
const EMBED_PROVIDER = process.env.CIS_EMBED_PROVIDER ?? 'workday';
const EMBED_MODEL = process.env.CIS_EMBED_MODEL ?? 'msmarco_distilbert_multilingual';

// Every indexed document goes into one Chroma "collection" (like a database table).
const COLLECTION_NAME = 'rag-step-04-demo';

// CIS uses internal Workday TLS certs — skip verification on dev laptops only.
// Uses https.request (not fetch) because Node fetch ignores https.Agent.
const insecureTls = process.env.CIS_INSECURE_TLS !== 'false';
const httpsAgent = insecureTls
  ? new https.Agent({ rejectUnauthorized: false })
  : undefined;

// CIS requires this header for request attribution in eng environments.
const featureKey = process.env.CIS_FEATURE_KEY
  ?? `rag-from-scratch, ${userInfo().username}`;

// ChromaClient talks to the ChromaDB Docker container on localhost:8000.
const chroma = new ChromaClient({
  host: process.env.CHROMA_HOST ?? 'localhost',
  port: parseInt(process.env.CHROMA_PORT ?? '8000', 10),
  ssl: false,
});

// Parse JSON request bodies + serve the HTML/JS UI from public/
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// ── CIS helpers ─────────────────────────────────────────────────────────────
// Low-level HTTPS call to CIS. Wraps Node's https.request in a Promise so we
// can use async/await. Same pattern as Step 02's server.js.

function cisFetch(path, options = {}) {
  const url = new URL(`${CIS_ROOT}${path}`);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: options.method ?? 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Wd-PCA-Feature-Key': featureKey,
          ...options.headers,
        },
        agent: httpsAgent,
      },
      (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          let data = {};
          try {
            data = body ? JSON.parse(body) : {};
          } catch {
            reject(new Error(`Invalid JSON from CIS: ${body.slice(0, 200)}`));
            return;
          }
          if (res.statusCode >= 400) {
            const message = data.detail ?? data.message ?? data.error?.message ?? `HTTP ${res.statusCode}`;
            const err = new Error(typeof message === 'string' ? message : JSON.stringify(message));
            err.status = res.statusCode;
            reject(err);
            return;
          }
          resolve(data);
        });
      },
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// Turn an array of strings into an array of embedding vectors via CIS embed-text-v1.
// Pass multiple texts at once — CIS embeds them in a single batch (efficient).
async function embedTexts(texts, provider = EMBED_PROVIDER, model = EMBED_MODEL) {
  const data = await cisFetch('/v1alpha1/predictions?bypass_auth=true', {
    method: 'POST',
    body: JSON.stringify({
      target: { provider, model },
      task: {
        type: 'embed-text-v1',
        input: {
          inputs: texts,
          normalize_embeddings: true,  // unit-length vectors → cosine = dot product
          batch_size: 32,
        },
      },
    }),
  });

  const embeddings = data.prediction?.output?.embeddings;
  if (!embeddings?.length) {
    throw new Error('CIS returned no embeddings');
  }
  return embeddings;
}

// ── Chunking (from Step 03) ─────────────────────────────────────────────────
// Split a long document into smaller pieces before embedding.
// "Smart" = try to break at sentence boundaries instead of mid-word.

function chunkText(text, size = 400, overlap = 50) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + size, text.length);

    // Look backward in this window for a sentence end (. ? ! or newline).
    if (end < text.length) {
      const window = text.slice(start, end);
      const lastBreak = Math.max(
        window.lastIndexOf('. '),
        window.lastIndexOf('? '),
        window.lastIndexOf('! '),
        window.lastIndexOf('\n'),
      );
      // Only break early if the boundary is past halfway — avoid tiny chunks.
      if (lastBreak > size * 0.5) end = start + lastBreak + 1;
    }

    const slice = text.slice(start, end).trim();
    if (slice) {
      chunks.push({ index: chunks.length, text: slice, start, end });
    }
    if (end >= text.length) break;

    // Overlap: next chunk starts a bit before this one ended (shared context).
    start = Math.max(0, end - overlap);
  }

  return chunks;
}

// ── Chroma helpers ──────────────────────────────────────────────────────────

// Create a fresh collection for indexing. We delete the old one first so
// re-indexing replaces data instead of duplicating it.
async function getCollection() {
  try {
    await chroma.deleteCollection({ name: COLLECTION_NAME });
  } catch {
    // First run — collection doesn't exist yet, that's fine.
  }

  return chroma.createCollection({
    name: COLLECTION_NAME,
    embeddingFunction: null,              // we provide our own CIS embeddings
    metadata: { 'hnsw:space': 'cosine' }, // compare vectors by angle, not raw distance
  });
}

// Health check: is Chroma running? How many chunks are already indexed?
async function chromaStatus() {
  try {
    await chroma.heartbeat();
    let count = 0;
    try {
      const col = await chroma.getCollection({ name: COLLECTION_NAME, embeddingFunction: null });
      count = await col.count();
    } catch {
      // Collection not created yet — user hasn't clicked "Build index".
    }
    return { ok: true, chunkCount: count };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── API routes ──────────────────────────────────────────────────────────────

// GET /api/status — called on page load to show Chroma connection + chunk count.
app.get('/api/status', async (_req, res) => {
  const chroma = await chromaStatus();
  res.json({
    chroma,
    embedModel: `${EMBED_PROVIDER}/${EMBED_MODEL}`,
    collection: COLLECTION_NAME,
  });
});

// POST /api/index — the "ingest pipeline":
//   1. chunk the document
//   2. embed all chunks in one CIS call
//   3. store ids + embeddings + text + metadata in Chroma
app.post('/api/index', async (req, res) => {
  const { text, chunkSize = 400, overlap = 50 } = req.body;

  if (!text?.trim()) {
    return res.status(400).json({ error: { message: 'Document text is required.' } });
  }

  try {
    const t0 = Date.now();

    const chunks = chunkText(text.trim(), chunkSize, overlap);
    const chunkTexts = chunks.map(c => c.text);

    const embeddings = await embedTexts(chunkTexts);
    const collection = await getCollection();

    // Chroma stores four parallel arrays — same index = same record.
    await collection.add({
      ids: chunks.map(c => `chunk-${c.index}`),
      embeddings,                          // vectors from CIS
      documents: chunkTexts,               // original text (returned on query)
      metadatas: chunks.map(c => ({        // extra info we can filter on later
        index: c.index,
        start: c.start,
        end: c.end,
      })),
    });

    res.json({
      chunkCount: chunks.length,
      dimensions: embeddings[0]?.length ?? 0,
      latencyMs: Date.now() - t0,
      chunks: chunks.map(c => ({
        index: c.index,
        chars: c.text.length,
        preview: c.text.slice(0, 80),
      })),
    });

  } catch (err) {
    console.error('Index error:', err);
    const hint = err.message?.includes('fetch') || err.message?.includes('ECONNREFUSED')
      ? ' Is Chroma running? Try: docker compose up -d'
      : '';
    res.status(err.status ?? 500).json({ error: { message: err.message + hint } });
  }
});

// POST /api/query — the "search pipeline":
//   1. embed the user's question (single CIS call)
//   2. ask Chroma for the N nearest chunk vectors
//   3. return matching text + similarity scores
app.post('/api/query', async (req, res) => {
  const { query, nResults = 3 } = req.body;

  if (!query?.trim()) {
    return res.status(400).json({ error: { message: 'Query text is required.' } });
  }

  try {
    const t0 = Date.now();

    // Embed the question — same model/dimensions as the indexed chunks.
    const [queryEmbedding] = await embedTexts([query.trim()]);

    const collection = await chroma.getCollection({
      name: COLLECTION_NAME,
      embeddingFunction: null,
    });

    // Chroma compares queryEmbedding against all stored embeddings.
    // Returns the closest nResults by cosine distance.
    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: Math.min(nResults, 10),
      include: ['documents', 'metadatas', 'distances'],
    });

    // results is column-major: results.ids[0] = array of hits for our one query.
    const hits = (results.ids?.[0] ?? []).map((id, i) => {
      const distance = results.distances?.[0]?.[i] ?? 0;
      return {
        id,
        document: results.documents?.[0]?.[i] ?? '',
        metadata: results.metadatas?.[0]?.[i] ?? {},
        distance,
        // Cosine distance 0 = identical. Convert to 0–1 similarity for the UI.
        similarity: Math.max(0, 1 - distance),
      };
    });

    res.json({
      query: query.trim(),
      hits,
      latencyMs: Date.now() - t0,
    });

  } catch (err) {
    console.error('Query error:', err);
    const hint = err.message?.includes('does not exist')
      ? ' Index a document first (click Build index).'
      : '';
    res.status(err.status ?? 500).json({ error: { message: err.message + hint } });
  }
});

const PORT = process.env.PORT ?? 3003;
app.listen(PORT, () => {
  console.log(`\n  RAG from Scratch — Step 04`);
  console.log(`  Chroma:  http://${process.env.CHROMA_HOST ?? 'localhost'}:${process.env.CHROMA_PORT ?? 8000}`);
  console.log(`  Embed:   ${EMBED_PROVIDER}/${EMBED_MODEL}`);
  console.log(`  App:     http://localhost:${PORT}`);
  console.log(`\n  Start Chroma: docker compose up -d\n`);
});
