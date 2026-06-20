// ─────────────────────────────────────────────────────────────────────────────
// server.js — Dev proxy for CIS embed-text-v1
//
// Converts text → vectors via POST /v1alpha1/predictions (embed-text-v1 task).
// Run with:  node server.js   (or: npm start)
// ─────────────────────────────────────────────────────────────────────────────

import express from 'express';
import https from 'node:https';
import { userInfo } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

const CIS_ROOT = process.env.CIS_ROOT
  ?? 'https://s0010-ml-https.s0010.us-west-2.awswd/ml/inference/cis';

// Eng CIS uses internal Workday certs — disable TLS verification on dev laptops only.
// Never do this in CUST/production (see CIS docs).
const insecureTls = process.env.CIS_INSECURE_TLS !== 'false';
const httpsAgent = insecureTls
  ? new https.Agent({ rejectUnauthorized: false })
  : undefined;

const featureKey = process.env.CIS_FEATURE_KEY
  ?? `rag-from-scratch, ${userInfo().username}`;

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

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

// ── /api/embed — CIS embed-text-v1 ──────────────────────────────────────────
app.post('/api/embed', async (req, res) => {
  const { texts, provider, model } = req.body;

  if (!Array.isArray(texts) || texts.length === 0) {
    return res.status(400).json({ error: { message: 'texts must be a non-empty array.' } });
  }

  if (!provider || !model) {
    return res.status(400).json({ error: { message: 'provider and model are required.' } });
  }

  try {
    const data = await cisFetch('/v1alpha1/predictions?bypass_auth=true', {
      method: 'POST',
      body: JSON.stringify({
        target: { provider, model },
        task: {
          type: 'embed-text-v1',
          input: {
            inputs: texts,
            normalize_embeddings: true,
            batch_size: 32,
          },
        },
      }),
    });

    const embeddings = data.prediction?.output?.embeddings;
    if (!embeddings) {
      throw new Error('Unexpected CIS response — no embeddings in prediction.output');
    }

    res.json({
      embeddings,
      dimensions: embeddings[0]?.length ?? 0,
      model: `${provider}/${model}`,
      raw: data,
    });

  } catch (err) {
    console.error('CIS embed error:', err);
    res.status(err.status ?? 500).json({ error: { message: err.message } });
  }
});

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`\n  RAG from Scratch — Step 02`);
  console.log(`  Default embed model: ${process.env.CIS_EMBED_PROVIDER ?? 'workday'}/${process.env.CIS_EMBED_MODEL ?? 'msmarco_distilbert_multilingual'}`);
  console.log(`  Server running at http://localhost:${PORT}\n`);
});
