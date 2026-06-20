# RAG from Scratch

A step-by-step project series for senior developers learning AI engineering by building a production-grade Retrieval-Augmented Generation (RAG) system.

Each step is a standalone, runnable app that teaches one core concept.

---

## Steps

| Step | Concept | What you build |
|------|---------|----------------|
| **01** | LLM API basics | Fire your first API call, inspect request/response, understand tokens |
| **02** | Embeddings | Convert text to vectors, visualize semantic similarity |
| **03** | Chunking _(coming soon)_ | Split documents intelligently for retrieval |
| **04** | Vector search _(coming soon)_ | Store embeddings in ChromaDB, query by similarity |
| **05** | RAG pipeline _(coming soon)_ | Connect retrieval → LLM synthesis end-to-end |
| **06** | Streaming + Chat UI _(coming soon)_ | Stream tokens, multi-turn conversation |
| **07** | Citations _(coming soon)_ | Surface which chunks grounded each answer |
| **08** | Full app _(coming soon)_ | Upload PDFs, chat with them, deploy |

---

## Prerequisites

- Node.js 18+
- Workday VPN + CIS access (eng environment — no API key approval needed)
  - Docs: [Connecting to CIS](https://docs.ml.inday.io/cis/clients/connecting-to-the-cis/)
  - See `step-01-llm-api-basics/README.md` for `/etc/hosts` setup

---

## Quick start (Step 01)

```bash
cd step-01-llm-api-basics
npm install
cp .env.example .env
npm start
# open http://localhost:3000
```

## Quick start (Step 02)

```bash
cd step-02-embeddings
npm install
cp .env.example .env
npm start
# open http://localhost:3001
```

---

## What is RAG?

RAG (Retrieval-Augmented Generation) is the architecture behind most real AI products:

```
User question
     ↓
Embed question → Find relevant document chunks (semantic search)
     ↓
Send: [system prompt + chunks + question] → LLM
     ↓
Grounded answer with citations
```

By the end of this series you'll have built every layer of this pipeline from scratch.
