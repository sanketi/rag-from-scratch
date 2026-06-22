# Step 04 — Vector Search with ChromaDB

Store chunk embeddings in a vector database and retrieve the best matches for a question — the "search" half of RAG.

## The big picture

You've already learned:
- **Step 02** — text → embedding (numbers that capture meaning)
- **Step 03** — big document → chunks (flashcards)

Now you **store** those embeddings and **search** them:

```
Index time (once per document):
  Document → chunks → embed each chunk → save in ChromaDB

Query time (every user question):
  Question → embed question → find closest chunks in ChromaDB → return top 3
```

Step 03 matched keywords ("PTO" in the question and chunk). Step 04 matches **meaning** — so "paid time off allowance" can match a chunk that says "20 days of PTO."

---

## Learn it in 5 steps

### Step 1 — What's a vector database?

A regular database finds exact matches: `WHERE title = 'PTO Policy'`.

A **vector database** finds **nearest neighbors** in embedding space: "which stored chunks are closest to this question's embedding?"

ChromaDB is a popular open-source vector DB. It stores:
- the chunk text (`documents`)
- the embedding vector (`embeddings`)
- optional metadata (`metadatas` — chunk index, character positions)

### Step 2 — Index vs query

| Phase | When | What happens |
|-------|------|--------------|
| **Index** | Document uploaded / updated | Chunk → embed all → `collection.add()` |
| **Query** | User asks a question | Embed question → `collection.query()` → top N hits |

Indexing is slow (many CIS calls). Querying is fast (one embed + one vector search).

### Step 3 — Cosine similarity in Chroma

We create the collection with `hnsw:space: cosine`. Chroma returns **distance** (lower = closer). The UI converts to **similarity** = `1 - distance`.

### Step 4 — Why ChromaDB?

For learning, Chroma is simple:
- Runs locally via Docker
- JavaScript client works with pre-computed embeddings (our CIS vectors)
- Same pattern as Pinecone, Weaviate, pgvector in production

### Step 5 — What Step 05 adds

Step 04 stops at retrieval — here are your top chunks. Step 05 sends those chunks + the question to an LLM to write a natural-language answer.

---

## Prerequisites

1. **Steps 01–02 setup** — VPN + `/etc/hosts` for CIS embeddings (see Step 02 README)
2. **Docker** — to run ChromaDB locally

## Run it

```bash
# Terminal 1 — start ChromaDB
docker compose up -d

# Terminal 2 — start the app
npm install
cp .env.example .env
npm start
```

Open [http://localhost:3003](http://localhost:3003)

## Try this

1. Confirm **Chroma connected** badge is green
2. Click **Build index** with the PTO sample
3. Search: *"How many sick days do I get?"*
4. Notice the top hit mentions **10 sick days** — even though your question didn't use those exact words together
5. Compare to Step 03's keyword search — vector search handles paraphrasing better

## Project structure

```
step-04-vector-search/
├── docker-compose.yml   # ChromaDB on port 8000
├── server.js            # chunk + CIS embed + Chroma index/query
├── public/
│   ├── index.html
│   ├── app.js
│   └── style.css
└── .env.example
```

## API endpoints

### `POST /api/index`

```js
{ "text": "...", "chunkSize": 400, "overlap": 50 }
// → chunks document, embeds via CIS, stores in Chroma
```

### `POST /api/query`

```js
{ "query": "How many PTO days?", "nResults": 3 }
// → embeds query, returns top matching chunks with similarity scores
```

## Key code

### Storing chunks

```js
await collection.add({
  ids: ['chunk-0', 'chunk-1', ...],
  embeddings: [[0.03, -0.14, ...], ...],  // from CIS
  documents: ['chunk text', ...],
  metadatas: [{ index: 0, start: 0, end: 400 }, ...],
});
```

### Searching

```js
const [queryEmbedding] = await embedTexts([question]);

const results = await collection.query({
  queryEmbeddings: [queryEmbedding],
  nResults: 3,
  include: ['documents', 'distances'],
});
```

## Troubleshooting

| Error | Fix |
|-------|-----|
| Chroma offline | Run `docker compose up -d` and wait a few seconds |
| CIS embed error | Check VPN + `.env` (same as Step 02) |
| Collection does not exist | Click **Build index** first |
| Low similarity scores | Re-index with smaller chunks or check embed model |

## Previous step

← **Step 03: Chunking** — split documents before embedding

## Next step

→ **Step 05: RAG pipeline** — send retrieved chunks to the LLM for a final answer
