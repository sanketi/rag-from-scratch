// ─────────────────────────────────────────────────────────────────────────────
// Step 02 — Embeddings & Semantic Similarity
// RAG from Scratch · github.com/YOUR_USERNAME/rag-from-scratch
//
// This file contains:
//   1. embedPhrases()   — calls CIS embed-text-v1 via /api/embed on the server
//   2. cosineSimilarity — compares two vectors by angle (not by raw text)
//   3. render*()        — similarity heatmap, top pairs, vector preview
//
// NOTE: The browser never talks to CIS directly. server.js proxies the call
// (CORS, VPN endpoint, TLS). This file only handles UI + math on the response.
// ─────────────────────────────────────────────────────────────────────────────

// Shorthand for document.getElementById — keeps DOM lookups readable.
const $ = id => document.getElementById(id);

// Demo phrase sets. Each includes one unrelated word ("Banana") so you can see
// that semantic similarity drops sharply for unrelated concepts.
const PRESETS = {
  legal: ['Lawyer', 'Attorney', 'Legal counsel', 'Barrister', 'Banana'],
  tech: ['Python programming', 'Software developer', 'Backend engineer', 'JavaScript coding', 'Banana'],
  mixed: ['Lawyer', 'Attorney', 'Doctor', 'Python programming', 'Software developer', 'Banana'],
};

function loadPreset(name) {
  $('phrases').value = PRESETS[name].join('\n');
}

// Read the textarea: one phrase per line, trim whitespace, drop empty lines.
function parsePhrases() {
  return $('phrases').value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
}

// The <select> stores "provider|model" because CIS needs both as separate fields.
// e.g. "workday|msmarco_distilbert_multilingual" → { provider: "workday", model: "..." }
function parseModel() {
  const [provider, model] = $('model').value.split('|');
  return { provider, model };
}

// ── Cosine similarity ─────────────────────────────────────────────────────────
// This is THE metric used in vector search / RAG retrieval.
//
// Two embeddings are arrays of floats (e.g. 768 numbers). Cosine similarity
// measures the *angle* between them, not their absolute size:
//   1.0 = same direction (very similar meaning)
//   0.0 = orthogonal (unrelated)
//
// Formula: dot(a,b) / (|a| × |b|)
// When normalize_embeddings=true (our CIS request), vectors are unit-length,
// so cosine similarity simplifies to a plain dot product.

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];   // how much the vectors point the same way
    magA += a[i] * a[i];   // ||a||²
    magB += b[i] * b[i];   // ||b||²
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// Build an N×N matrix: matrix[i][j] = similarity between phrase i and phrase j.
// Used to render the heatmap — row/column labels are the input phrases.
function cosineMatrix(vectors) {
  const n = vectors.length;
  const matrix = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      matrix[i][j] = cosineSimilarity(vectors[i], vectors[j]);
    }
  }
  return matrix;
}

// Flatten the matrix into unique pairs (skip i===j and avoid duplicates like A↔B and B↔A).
// Sort descending so the most similar pairs appear first in the UI.
function topPairs(phrases, matrix, limit = 5) {
  const pairs = [];
  for (let i = 0; i < phrases.length; i++) {
    for (let j = i + 1; j < phrases.length; j++) {
      pairs.push({ a: phrases[i], b: phrases[j], score: matrix[i][j] });
    }
  }
  return pairs.sort((x, y) => y.score - x.score).slice(0, limit);
}

// ── Color scale for heatmap ───────────────────────────────────────────────────
// Maps similarity 0→1 to a dark→green background so patterns pop visually.
function similarityColor(score) {
  const t = Math.max(0, Math.min(1, score));
  const r = Math.round(26 + (52 - 26) * t);
  const g = Math.round(29 + (211 - 29) * t);
  const b = Math.round(46 + (153 - 46) * t);
  const alpha = 0.15 + 0.55 * t;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── Main embed function ───────────────────────────────────────────────────────
async function embedPhrases() {
  const btn = $('embedBtn');
  const texts = parsePhrases();
  const { provider, model } = parseModel();

  // Need at least 2 phrases — otherwise there's nothing to compare.
  if (texts.length < 2) {
    alert('Enter at least 2 phrases (one per line).');
    return;
  }

  // ── Build the CIS request body ──────────────────────────────────────────────
  // Embeddings use the *predictions* API (not chat/completions).
  // target = which model to run; task = what to do with it.
  const requestBody = {
    target: { provider, model },
    task: {
      type: 'embed-text-v1',
      input: {
        inputs: texts,
        normalize_embeddings: true,  // scale vectors to unit length for cosine search
        batch_size: 32,              // how many texts CIS processes per internal batch
      },
    },
  };

  // Show the exact JSON so learners can correlate UI → wire format → CIS docs.
  show('requestPanel');
  $('requestBox').textContent = JSON.stringify(requestBody, null, 2);

  // ── UI loading state ────────────────────────────────────────────────────────
  btn.disabled = true;
  btn.textContent = 'Embedding…';
  setBadge('statusBadge', '…', 'gray');

  const t0 = performance.now();

  try {
    // POST to our Express proxy — server.js adds CIS headers + TLS handling.
    // We send a simpler body { texts, provider, model }; server wraps it in the
    // full CIS predictions format shown above.
    const res = await fetch('/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts, provider, model }),
    });

    const latencyMs = Math.round(performance.now() - t0);
    const data = await res.json();

    if (!res.ok || data.error) {
      throw new Error(data.error?.message ?? `HTTP ${res.status}`);
    }

    // data.embeddings = array of float arrays, one per input phrase
    renderResults(texts, data.embeddings, data, latencyMs);
    setBadge('statusBadge', '200 OK', 'green');

  } catch (err) {
    setBadge('statusBadge', 'error', 'red');
    alert(`Error: ${err.message}`);
  }

  btn.disabled = false;
  btn.textContent = 'Embed phrases →';
}

// ── Render all result panels ──────────────────────────────────────────────────
function renderResults(phrases, embeddings, data, latencyMs) {
  // All similarity math runs in the browser — CIS only returns raw vectors.
  console.log("embeddings : " + embeddings);
  const matrix = cosineMatrix(embeddings);

  show('statsPanel');
  $('phraseCount').textContent = phrases.length;
  $('dimensions').textContent = data.dimensions;   // e.g. 768 — length of each vector
  $('latency').textContent = latencyMs;
  $('modelUsed').textContent = data.model.split('/').pop();  // short name for the stat box

  renderMatrix(phrases, matrix);
  renderTopPairs(phrases, matrix);
  renderVectors(phrases, embeddings);

  $('rawJson').textContent = JSON.stringify(data.raw, null, 2);
  show('matrixPanel');
  show('vectorsPanel');
  show('anatomyPanel');
  show('rawJsonPanel');
}

// Build the N×N similarity table dynamically (no template library — plain DOM).
function renderMatrix(phrases, matrix) {
  const wrap = $('matrixWrap');
  const table = document.createElement('table');
  table.className = 'sim-matrix';

  // Header row: empty corner cell + one column label per phrase.
  const headerRow = document.createElement('tr');
  headerRow.appendChild(document.createElement('th'));
  for (const phrase of phrases) {
    const th = document.createElement('th');
    th.textContent = truncate(phrase, 14);
    th.title = phrase;  // full text on hover when truncated
    headerRow.appendChild(th);
  }
  table.appendChild(headerRow);

  // One row per phrase; each cell = similarity to every other phrase.
  for (let i = 0; i < phrases.length; i++) {
    const row = document.createElement('tr');

    const label = document.createElement('th');
    label.textContent = truncate(phrases[i], 14);
    label.title = phrases[i];
    row.appendChild(label);

    for (let j = 0; j < phrases.length; j++) {
      const score = matrix[i][j];
      const td = document.createElement('td');
      td.textContent = score.toFixed(2);
      td.style.background = similarityColor(score);
      td.title = `"${phrases[i]}" ↔ "${phrases[j]}": ${score.toFixed(4)}`;
      if (i === j) td.classList.add('diagonal');  // always 1.0 — phrase vs itself
      row.appendChild(td);
    }

    table.appendChild(row);
  }

  wrap.replaceChildren(table);
}

// Ranked list of the most similar phrase pairs (easier to read than the full matrix).
function renderTopPairs(phrases, matrix) {
  const pairs = topPairs(phrases, matrix);
  const container = $('topPairs');
  container.replaceChildren();

  for (const { a, b, score } of pairs) {
    const el = document.createElement('div');
    el.className = 'pair-row';

    const bar = document.createElement('div');
    bar.className = 'pair-bar';
    bar.style.width = `${Math.round(score * 100)}%`;
    bar.style.background = similarityColor(score);

    const text = document.createElement('span');
    text.className = 'pair-text';
    text.textContent = `"${a}" ↔ "${b}"`;

    const val = document.createElement('span');
    val.className = 'pair-score';
    val.textContent = score.toFixed(3);

    el.append(bar, text, val);
    container.appendChild(el);
  }
}

// Show the first 8 dimensions of each vector — the full array is too long to display.
// In RAG you'll store the complete vector in a vector DB; here we just preview it.
function renderVectors(phrases, embeddings) {
  const container = $('vectorList');
  container.replaceChildren();

  for (let i = 0; i < phrases.length; i++) {
    const row = document.createElement('div');
    row.className = 'vector-row';

    const label = document.createElement('div');
    label.className = 'vector-label';
    label.textContent = phrases[i];

    const preview = document.createElement('code');
    const head = embeddings[i].slice(0, 8).map(n => n.toFixed(4));
    preview.textContent = `[${head.join(', ')}, …] (${embeddings[i].length} dims)`;

    row.append(label, preview);
    container.appendChild(row);
  }
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

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
