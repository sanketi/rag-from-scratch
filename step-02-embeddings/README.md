# Step 02 — Embeddings & Semantic Similarity

Convert text to vectors with CIS and visualize which phrases are semantically close — the foundation of retrieval in RAG.

## What you'll learn

- What an **embedding** is: text → array of floats that captures meaning
- How CIS **`embed-text-v1`** works via the predictions API
- **Cosine similarity**: how vector search decides "these two phrases are related"
- Why **`normalize_embeddings: true`** is standard for retrieval
- The intuition behind semantic search: synonyms cluster, unrelated words don't

## Prerequisites

Same as Step 01:
- Workday VPN
- `/etc/hosts` entry for s0010 (see Step 01 README)

## Run it

```bash
npm install
cp .env.example .env
npm start               # or: npm run dev
```

Open [http://localhost:3001](http://localhost:3001) (port 3001 — Step 01 uses 3000)

## Try this

1. Click **Embed phrases** with the default list
2. Notice **Lawyer ↔ Attorney** scores ~0.8+ while **Lawyer ↔ Banana** scores much lower
3. Switch to **echo/echo** for a smoke test, then back to the real model
4. Use presets to explore different domains

## Project structure

```
step-02-embeddings/
├── server.js          # Express — proxies /api/embed → CIS embed-text-v1
├── public/
│   ├── index.html     # UI — phrase input + similarity heatmap
│   ├── style.css
│   └── app.js         # Cosine similarity + matrix rendering
├── .env.example
└── package.json
```

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
      normalize_embeddings: true
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

### Why this matters for RAG

In Step 04 you'll store document chunk embeddings in a vector DB. When a user asks a question, you embed the question and find chunks with the highest cosine similarity — that's retrieval.

## Next step

→ **Step 03: Chunking** — split documents intelligently before embedding
