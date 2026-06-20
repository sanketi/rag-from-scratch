# Step 03 — Chunking

Split documents into bite-sized pieces so AI can search them later. No API keys, no VPN — this step is pure text logic you run locally.

## The big picture (explain it to a friend)

Imagine you have a **500-page employee handbook** and someone asks: *"How many PTO days do I get?"*

The AI cannot read all 500 pages every time someone asks a question. That would be slow and expensive.

So you do what you'd do before a test:

1. **Cut the handbook into flashcards** — one topic per card. Each card is a **chunk**.
2. **Label each card** (Step 02: turn it into an embedding — a list of numbers that captures meaning).
3. **When a question comes in**, pick the flashcards that seem related (Step 04: vector search).
4. **Give only those cards to the AI** so it can answer from your real document (Step 05: RAG).

**Chunking is step 1** — cutting the document. If you cut badly, everything downstream fails.

---

## Learn it in 5 steps

### Step 1 — Why chunk at all?

A language model has a **context window** — a limit on how much text it can read at once. A whole PDF is usually too big.

Chunks are small enough to:
- Embed and store in a database
- Retrieve quickly when someone asks a question
- Fit inside the prompt you send to the AI

### Step 2 — What is a chunk?

A **chunk** is just a string — a slice of your original document.

Example from a PTO policy:

```
Chunk 1: "All full-time employees receive 20 days of paid time off..."
Chunk 2: "Unused PTO rolls over up to a maximum of 5 days..."
Chunk 3: "Sick leave is separate from PTO. Employees receive 10 sick days..."
```

Each chunk becomes one row in your vector database later.

### Step 3 — Chunk size: Goldilocks zone

| Too small | Just right | Too big |
|-----------|------------|---------|
| "days of paid time" (meaningless fragment) | A full paragraph or ~300–500 characters | Entire policy in one chunk |
| AI can't understand context | AI gets one clear idea | AI gets irrelevant info mixed in |

**Rule of thumb:** aim for **300–500 characters** (about 1–2 paragraphs), unless your doc has natural paragraph breaks.

### Step 4 — Overlap: don't cut ideas in half

Bad cut (no overlap):

```
Chunk 1: "...refund policy is 30"
Chunk 2: "days for all returns..."
```

The number **30** and the word **days** got separated. Neither chunk makes sense alone.

**Overlap** repeats the end of chunk 1 at the start of chunk 2:

```
Chunk 1: "...refund policy is 30 days for"
Chunk 2: "30 days for all returns..."
```

Now at least one chunk has the full idea. Typical overlap: **50–100 characters**.

### Step 5 — Pick a strategy

| Strategy | How it works | When to use |
|----------|--------------|-------------|
| **Smart fixed-size** | ~400 chars, break at sentence ends | Default for most RAG apps |
| **Fixed-size** | Cut every N chars exactly | Simple, but can split mid-word |
| **By paragraph** | Split on blank lines | Wiki docs, well-formatted text |
| **By sentence** | One sentence per chunk | Very precise, many tiny chunks |

---

## Run it

```bash
npm install
npm start               # or: npm run dev
```

Open [http://localhost:3002](http://localhost:3002) (port 3002)

No `.env` file needed — chunking runs entirely in your browser.

## Try this (hands-on)

1. Load **Sample: PTO policy** and click **Chunk it** with default settings.
2. Look at the **colored document** — each color is one chunk.
3. Switch to **Fixed-size** (not smart) with chunk size **150** — watch sentences get cut in half.
4. Switch back to **Smart fixed-size** and increase **overlap** to **100** — notice chunks share text at boundaries.
5. Type *"How many PTO days?"* in the question box — see which chunks match (preview of retrieval in Step 04).

## Project structure

```
step-03-chunking/
├── server.js          # Serves the static UI (no AI calls)
├── public/
│   ├── index.html     # Lesson + interactive chunking demo
│   ├── style.css
│   └── app.js         # Chunking algorithms + visualization
└── package.json
```

## The code (what each strategy does)

### Smart fixed-size (recommended)

```js
// Walk through the document in ~400-char windows.
// Before cutting, look backward for ". " or "\n" so you break at a sentence.
let end = start + chunkSize;
const lastBreak = window.lastIndexOf('. ');
if (lastBreak > chunkSize * 0.5) end = start + lastBreak + 1;
```

### Overlap

```js
// After chunk 1 ends at position 400, chunk 2 starts at 400 - overlap (e.g. 350).
start = end - overlap;
```

### Why this matters for RAG

```
Document → Chunk → Embed → Store in DB
                              ↓
User question → Embed question → Find closest chunks → Send to LLM
```

If chunks are bad, the wrong pieces get retrieved, and the AI hallucinates or says "I don't know" even when the answer is in your doc.

## Common mistakes

1. **Chunks too large** — retrieval returns whole sections; the LLM gets noise.
2. **Chunks too small** — "20 days of" doesn't mean anything without context.
3. **No overlap** — facts split across boundaries are invisible to search.
4. **Ignoring structure** — legal docs often chunk better by paragraph than by raw character count.

## Previous step

← **Step 02: Embeddings** — turn each chunk into a vector

## Next step

→ **Step 04: Vector search** — store chunks in ChromaDB and query by similarity
