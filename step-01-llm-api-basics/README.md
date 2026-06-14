# Step 01 — Your First LLM API Call

Fire a real request at the Anthropic API and inspect every part of the request/response cycle.

## What you'll learn

- The 4 parameters you control on every API call (`model`, `system`, `messages`, `max_tokens`)
- Why `messages` is an array — the API is stateless, you own history
- What `stop_reason` tells you (and why `max_tokens` is a warning sign)
- How token counts map to cost and context window limits
- Why API keys must live on the server, never in the browser

## Run it

```bash
npm install
cp .env.example .env    # add your ANTHROPIC_API_KEY
npm start               # or: npm run dev  (auto-restarts on save)
```

Open [http://localhost:3000](http://localhost:3000)

## Project structure

```
step-01-llm-api-basics/
├── server.js          # Express server — proxies /api/chat → Anthropic
├── public/
│   ├── index.html     # UI — request builder + response inspector
│   ├── style.css      # Styles
│   └── app.js         # Frontend logic — builds request, renders response
├── .env.example       # Copy to .env and add your key
└── package.json
```

## Key concepts

### The request body

```js
{
  model: "claude-sonnet-4-6",   // which model
  max_tokens: 200,               // hard ceiling on output length
  system: "You are ...",         // shapes personality & behavior
  messages: [                    // full conversation history (stateless API)
    { role: "user", content: "..." }
  ]
}
```

### Extracting the answer

```js
const text = data.content
  .filter(b => b.type === 'text')
  .map(b => b.text)
  .join('');
```

### Always check stop_reason

| Value | Meaning |
|-------|---------|
| `end_turn` | Natural finish — response is complete |
| `max_tokens` | Hit the ceiling — response was cut off |

## Next step

→ **Step 02: Embeddings** — convert text to vectors and see how machines understand meaning
