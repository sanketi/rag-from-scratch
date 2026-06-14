// ─────────────────────────────────────────────────────────────────────────────
// Step 01 — LLM API Basics
// RAG from Scratch · github.com/YOUR_USERNAME/rag-from-scratch
//
// This file contains:
//   1. sendRequest()  — builds and fires the Anthropic /v1/messages call
//   2. renderResponse() — displays the response + token stats
//   3. UI helpers
//
// NOTE: The API key is injected by the Express server (server.js) so it never
// touches the browser. The browser calls /api/chat on localhost, not Anthropic
// directly.
// ─────────────────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

// ── Slider live readout ───────────────────────────────────────────────────────
$('max_tokens').addEventListener('input', e => {
  $('max_tokens_val').textContent = e.target.value;
});

// ── Main send function ────────────────────────────────────────────────────────
async function sendRequest() {
  const btn     = $('sendBtn');
  const system  = $('system').value.trim();
  const userMsg = $('userMsg').value.trim();
  const model   = $('model').value;
  const max_tokens = parseInt($('max_tokens').value, 10);

  if (!userMsg) { alert('Enter a user message first.'); return; }

  // ── Build the request body ──────────────────────────────────────────────────
  // This is the exact JSON that travels to Anthropic's API.
  // Key insight: messages is an ARRAY — you own the conversation history.
  // The API is fully stateless; every call must include the full history.
  const requestBody = {
    model,
    max_tokens,
    system,                          // "who Claude is" for this session
    messages: [
      { role: 'user', content: userMsg }
    ]
  };

  // ── Show the raw request ────────────────────────────────────────────────────
  show('requestPanel');
  $('requestBox').textContent = JSON.stringify(requestBody, null, 2);

  // ── UI loading state ────────────────────────────────────────────────────────
  show('responsePanel');
  hide('anatomyPanel');
  hide('rawJsonPanel');
  $('responseText').textContent = 'Calling API…';
  setBadge('statusBadge', '…', 'gray');
  btn.disabled = true;
  btn.textContent = 'Sending…';

  const t0 = performance.now();

  try {
    // ── The actual fetch ──────────────────────────────────────────────────────
    // In dev: proxied through /api/chat on the Express server (keeps key safe).
    // In production: point this at your own backend endpoint.
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const latencyMs = Math.round(performance.now() - t0);
    const data = await res.json();

    if (!res.ok || data.error) {
      throw new Error(data.error?.message ?? `HTTP ${res.status}`);
    }

    renderResponse(data, latencyMs);

  } catch (err) {
    $('responseText').textContent = `Error: ${err.message}`;
    setBadge('statusBadge', 'error', 'red');
  }

  btn.disabled = false;
  btn.textContent = 'Send request →';
}

// ── Render the response ───────────────────────────────────────────────────────
function renderResponse(data, latencyMs) {
  // ── Extract the text ────────────────────────────────────────────────────────
  // content is an array of blocks (text, tool_use, etc.)
  // For a basic completion, block[0].type === 'text'
  const text = data.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  $('responseText').textContent = text;

  // ── Token usage ─────────────────────────────────────────────────────────────
  $('inputTokens').textContent  = data.usage?.input_tokens  ?? '—';
  $('outputTokens').textContent = data.usage?.output_tokens ?? '—';
  $('latency').textContent      = latencyMs;
  $('stopReason').textContent   = data.stop_reason ?? '—';

  // ── Status badge ────────────────────────────────────────────────────────────
  const stopped = data.stop_reason === 'max_tokens';
  setBadge(
    'statusBadge',
    stopped ? '⚠ max_tokens hit' : '200 OK · end_turn',
    stopped ? 'red' : 'green'
  );

  // ── Raw JSON ─────────────────────────────────────────────────────────────────
  $('rawJson').textContent = JSON.stringify(data, null, 2);

  show('anatomyPanel');
  show('rawJsonPanel');
}

// ── Toggle raw JSON ───────────────────────────────────────────────────────────
function toggleRaw() {
  const el = $('rawJson');
  el.hidden = !el.hidden;
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function show(id) { $(id).hidden = false; }
function hide(id) { $(id).hidden = true; }

function setBadge(id, text, color) {
  const el = $(id);
  el.textContent = text;
  el.className = `badge badge-${color}`;
}
