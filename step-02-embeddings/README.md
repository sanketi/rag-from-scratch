# Step 02 — Embeddings & Semantic Similarity

Convert text to vectors with CIS and visualize which phrases are semantically close — the foundation of retrieval in RAG.

Uses the CIS [predictions API](https://docs.ml.inday.io/cis/clients/tasks-and-predictions/) with the **`embed-text-v1`** task — no API key required in eng environments.

## What you'll learn

- What an **embedding** is: text → array of floats that captures meaning
- How CIS **`embed-text-v1`** differs from Step 01's chat API
- **Cosine similarity**: how vector search decides "these two phrases are related"
- Why **`normalize_embeddings: true`** is standard for retrieval
- The intuition behind semantic search: synonyms cluster, unrelated words don't

## Prerequisites

Same as [Step 01](../step-01-llm-api-basics/README.md):

1. **VPN** — Secure GPVPN or ZScaler with `vpn.2fa` AD group
2. **/etc/hosts entry** for s0010:
   ```bash
   sudo -- sh -c 'echo "10.210.98.124   s0010-ml-https.s0010.us-west-2.awswd" >> /etc/hosts'
   ```
3. **Smoke test** (optional):
   ```bash
   curl -H "Wd-PCA-Feature-Key: $(whoami)" --insecure \
     'https://s0010-ml-https.s0010.us-west-2.awswd/ml/inference/cis/v1alpha1/models?bypass_auth=true'
   ```

Available models: [CIS public dashboard](https://grafana.dev.wdpharos.io/d/cis_public/cis-public-dashboard) — filter by the `embed-text-v1` task.

## Run it

```bash
npm install
cp .env.example .env
npm start               # or: npm run dev  (auto-restarts on save)
```

Open [http://localhost:3001](http://localhost:3001) (port 3001 — Step 01 uses 3000)

## Try this

1. Click **Embed phrases** with the default list
2. Notice **Lawyer ↔ Attorney** scores ~0.8+ while **Lawyer ↔ Banana** scores much lower
3. Switch to **echo/echo** for a smoke test, then back to **workday/msmarco_distilbert_multilingual**
4. Use presets (Legal synonyms, Tech roles) to explore different domains
5. Expand **Full raw response JSON** to see the CIS prediction payload

## Project structure

```
step-02-embeddings/
├── server.js          # Express — proxies /api/embed → CIS embed-text-v1
├── public/
│   ├── index.html     # UI — phrase input + similarity heatmap
│   ├── style.css
│   └── app.js         # Cosine similarity + matrix rendering (heavily commented)
├── .env.example
└── package.json
```

## Configuration

Copy `.env.example` → `.env`. All values have sensible defaults.

| Variable | Default | Purpose |
|----------|---------|---------|
| `CIS_ROOT` | `https://s0010-ml-.../ml/inference/cis` | CIS base URL (predictions API) |
| `CIS_FEATURE_KEY` | `rag-from-scratch, <username>` | Request attribution header |
| `CIS_INSECURE_TLS` | `true` | Skip TLS verification for internal Workday certs (dev only) |
| `PORT` | `3001` | Local dev server port |

## Step 01 vs Step 02 — two CIS APIs

| | Step 01 (Chat) | Step 02 (Embeddings) |
|--|----------------|----------------------|
| **Endpoint** | `/v1alpha1/openai/v1/chat/completions` | `/v1alpha1/predictions` |
| **Task type** | `openai-chat-completion-v1` | `embed-text-v1` |
| **Input** | `messages` array | `inputs` string array |
| **Output** | `choices[0].message.content` | `prediction.output.embeddings` |
| **SDK** | OpenAI JS SDK | Raw `https.request` |

## Key concepts

### The CIS request

Unlike chat (OpenAI-compatible), embeddings use the **predictions API**:

```js
POST /v1alpha1/predictions?bypass_auth=true

{
  target: { provider: "workday", model: "msmarco_distilbert_multilingual" },
  task: {
    type: "embed-text-v1",
    input: {
      inputs: ["Lawyer", "Attorney"],
      normalize_embeddings: true,
      batch_size: 32
    }
  }
}
```

### The response

```js
{
  prediction: {
    type: "embed-text-v1",
    output: {
      embeddings: [
        [0.031, -0.142, 0.887, ...],  // 768 floats for "Lawyer"
        [0.028, -0.139, 0.881, ...]   // 768 floats for "Attorney"
      ]
    }
  }
}
```

### Cosine similarity

Computed in the browser after CIS returns the vectors:

```js
function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
```

| Score | Meaning |
|-------|---------|
| ~1.0 | Nearly identical meaning |
| ~0.5 | Somewhat related |
| ~0.0 | Unrelated |

With `normalize_embeddings: true`, vectors are unit-length, so cosine similarity equals a simple dot product.

### Why this matters for RAG

In Step 04 you'll store document chunk embeddings in a vector DB. When a user asks a question, you embed the question and find chunks with the highest cosine similarity — that's retrieval.

## Troubleshooting

| Error | Fix |
|-------|-----|
| `SELF_SIGNED_CERT_IN_CHAIN` | Ensure `CIS_INSECURE_TLS=true` in `.env`. Step 02 uses `https.request` with a custom agent (Node's built-in `fetch` ignores `https.Agent`). |
| `fetch failed` / connection refused | Check VPN and `/etc/hosts` entry |
| `422 Unprocessable Entity` | Model may not support `embed-text-v1` — try `echo/echo` first, then check the [CIS dashboard](https://grafana.dev.wdpharos.io/d/cis_public/cis-public-dashboard) |
| Empty or missing embeddings | Inspect the raw JSON panel — CIS error details are in the response body |

## Previous step

← **Step 01: LLM API Basics** — your first CIS chat completion call

## Next step

→ **Step 03: Chunking** — split documents intelligently before embedding
