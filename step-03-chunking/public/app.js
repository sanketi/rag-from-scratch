// ─────────────────────────────────────────────────────────────────────────────
// Step 03 — Chunking
//
// 1. chunkDocument()     — runs the selected splitting strategy
// 2. findMatchingChunks() — simple keyword search (preview of Step 04 retrieval)
// 3. render*()           — colored highlights + chunk cards
// ─────────────────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

// Colors cycle so each chunk is easy to spot in the document view.
const CHUNK_COLORS = [
  '#7c6af7', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#f472b6', '#a3e635',
];

// Sample documents — short enough to read, long enough to need multiple chunks.
const SAMPLE_DOCS = {
  pto: `Company PTO Policy (2025)

All full-time employees receive 20 days of paid time off (PTO) per calendar year. PTO accrues at a rate of 1.67 days per month. New hires begin accruing PTO on their first day but cannot use it until after a 30-day waiting period.

Unused PTO rolls over up to a maximum of 5 days into the next year. Any balance above 5 days is forfeited on December 31. Employees must request PTO at least two weeks in advance through the HR portal, unless the request is for sick leave.

Sick leave is separate from PTO. Employees receive 10 sick days per year. Sick leave does not roll over. If you need more than 3 consecutive sick days, you must provide a doctor's note.

Managers approve or deny PTO requests within 3 business days. During peak season (November–December), no more than 25% of a team may be out at the same time. Emergency time off can be approved by a director without the two-week notice requirement.

Remote employees follow the same PTO rules as office employees. Public holidays are not counted against your PTO balance.`,

  rag: `What is RAG?

Retrieval-Augmented Generation (RAG) is a way to help an AI answer questions using your own documents instead of only what it learned during training.

First, you take a large document — like a product manual, wiki, or policy PDF — and cut it into smaller pieces called chunks. Each chunk is small enough to search through quickly.

Next, you turn each chunk into an embedding (a list of numbers that captures meaning). You store those embeddings in a database. When a user asks a question, you embed the question too and find the chunks whose embeddings are closest.

Finally, you send only those relevant chunks to the language model along with the user's question. The model reads the chunks and writes an answer grounded in your actual content.

Chunking matters because if pieces are too big, the model gets irrelevant noise. If pieces are too small, important context gets split apart. Good chunking is the difference between helpful answers and confused ones.`,
};

const CHUNK_STRATEGIES = {
  fixed: chunkFixedSize,
  smart: chunkSmartFixedSize,
  paragraph: chunkByParagraph,
  sentence: chunkBySentence,
};

// ── Slider live readouts ──────────────────────────────────────────────────────
$('chunkSize').addEventListener('input', e => {
  $('chunkSizeVal').textContent = e.target.value;
});
$('overlap').addEventListener('input', e => {
  $('overlapVal').textContent = e.target.value;
});

function loadSample(name) {
  $('document').value = SAMPLE_DOCS[name];
}

// ── Strategy 1: Fixed-size (character count) ──────────────────────────────────
// Like cutting a ribbon every N inches — simple, but can slice mid-sentence.
function chunkFixedSize(text, size, overlap) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    chunks.push(makeChunk(chunks.length, text.slice(start, end), start, end));
    if (end >= text.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}

// ── Strategy 2: Smart fixed-size ──────────────────────────────────────────────
// Same as fixed-size, but tries to break at the nearest sentence end so you
// don't cut "The refund policy is 30" | " days." across two chunks.
function chunkSmartFixedSize(text, size, overlap) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + size, text.length);

    if (end < text.length) {
      const window = text.slice(start, end);
      const lastBreak = Math.max(
        window.lastIndexOf('. '),
        window.lastIndexOf('? '),
        window.lastIndexOf('! '),
        window.lastIndexOf('\n'),
      );
      if (lastBreak > size * 0.5) {
        end = start + lastBreak + 1;
      }
    }

    chunks.push(makeChunk(chunks.length, text.slice(start, end).trim(), start, end));
    if (end >= text.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}

// ── Strategy 3: One chunk per paragraph ───────────────────────────────────────
function chunkByParagraph(text) {
  return text
    .split(/\n\s*\n/)
    .map(s => s.trim())
    .filter(Boolean)
    .map((chunkText, i, arr) => {
      const start = text.indexOf(chunkText);
      return makeChunk(i, chunkText, start, start + chunkText.length);
    });
}

// ── Strategy 4: One chunk per sentence ────────────────────────────────────────
function chunkBySentence(text) {
  const parts = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  let cursor = 0;
  return parts.map((chunkText, i) => {
    const start = text.indexOf(chunkText, cursor);
    cursor = start + chunkText.length;
    return makeChunk(i, chunkText, start, start + chunkText.length);
  });
}

function makeChunk(index, text, start, end) {
  return { index, text, start, end, chars: text.length };
}

// ── Main chunk action ─────────────────────────────────────────────────────────
function chunkDocument() {
  const text = $('document').value.trim();
  if (!text) {
    alert('Paste or load a document first.');
    return;
  }

  const strategy = $('strategy').value;
  const size = parseInt($('chunkSize').value, 10);
  const overlap = parseInt($('overlap').value, 10);

  const chunkFn = CHUNK_STRATEGIES[strategy];
  const chunks = chunkFn(text, size, overlap);

  renderResults(text, chunks, strategy, size, overlap);
  runQueryPreview(chunks);
}

// ── Simple retrieval preview (keyword match — Step 04 will use embeddings) ───
function findMatchingChunks(chunks, query) {
  const terms = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (!terms.length) return [];

  return chunks
    .map(chunk => {
      const lower = chunk.text.toLowerCase();
      const hits = terms.filter(t => lower.includes(t)).length;
      return { chunk, score: hits / terms.length };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

function runQueryPreview(chunks) {
  const query = $('testQuery').value.trim();
  const panel = $('queryPanel');
  const results = $('queryResults');

  if (!query) {
    panel.hidden = true;
    return;
  }

  const matches = findMatchingChunks(chunks, query);
  panel.hidden = false;
  results.replaceChildren();

  if (!matches.length) {
    results.innerHTML = '<p class="card-desc">No chunks matched those words. Try "PTO", "sick leave", or "roll over".</p>';
    highlightChunks(chunks, []);
    return;
  }

  for (const { chunk, score } of matches.slice(0, 3)) {
    const el = document.createElement('div');
    el.className = 'query-hit';
    el.innerHTML = `
      <span class="chunk-badge" style="background:${CHUNK_COLORS[chunk.index % CHUNK_COLORS.length]}22;color:${CHUNK_COLORS[chunk.index % CHUNK_COLORS.length]}">Chunk ${chunk.index + 1}</span>
      <span class="query-score">${Math.round(score * 100)}% word match</span>
      <p>${escapeHtml(chunk.text.slice(0, 200))}${chunk.text.length > 200 ? '…' : ''}</p>`;
    results.appendChild(el);
  }

  highlightChunks(chunks, matches.map(m => m.chunk.index));
}

function previewQuery() {
  const text = $('document').value.trim();
  if (!text) return;

  const strategy = $('strategy').value;
  const size = parseInt($('chunkSize').value, 10);
  const overlap = parseInt($('overlap').value, 10);
  const chunks = CHUNK_STRATEGIES[strategy](text, size, overlap);
  runQueryPreview(chunks);
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderResults(text, chunks, strategy, size, overlap) {
  show('statsPanel');
  $('chunkCount').textContent = chunks.length;
  $('docChars').textContent = text.length;
  $('avgChunk').textContent = Math.round(text.length / chunks.length);
  $('strategyUsed').textContent = strategy;

  renderHighlightedDoc(text, chunks);
  renderChunkCards(chunks);

  show('docPanel');
  show('chunksPanel');
  show('anatomyPanel');
}

function renderHighlightedDoc(text, chunks) {
  const el = $('highlightedDoc');
  el.replaceChildren();

  let cursor = 0;
  for (const chunk of chunks) {
    if (chunk.start > cursor) {
      el.appendChild(document.createTextNode(text.slice(cursor, chunk.start)));
    }

    const span = document.createElement('span');
    span.className = 'chunk-highlight';
    span.dataset.chunk = chunk.index;
    span.style.background = `${CHUNK_COLORS[chunk.index % CHUNK_COLORS.length]}33`;
    span.style.borderBottom = `2px solid ${CHUNK_COLORS[chunk.index % CHUNK_COLORS.length]}`;
    span.textContent = text.slice(chunk.start, chunk.end);
    el.appendChild(span);

    cursor = chunk.end;
  }

  if (cursor < text.length) {
    el.appendChild(document.createTextNode(text.slice(cursor)));
  }
}

function highlightChunks(chunks, activeIndexes) {
  document.querySelectorAll('.chunk-highlight').forEach(span => {
    const idx = parseInt(span.dataset.chunk, 10);
    span.classList.toggle('active', activeIndexes.includes(idx));
  });

  document.querySelectorAll('.chunk-card').forEach(card => {
    const idx = parseInt(card.dataset.chunk, 10);
    card.classList.toggle('active', activeIndexes.includes(idx));
  });
}

function renderChunkCards(chunks) {
  const container = $('chunkList');
  container.replaceChildren();

  for (const chunk of chunks) {
    const card = document.createElement('div');
    card.className = 'chunk-card';
    card.dataset.chunk = chunk.index;
    const color = CHUNK_COLORS[chunk.index % CHUNK_COLORS.length];

    card.innerHTML = `
      <div class="chunk-card-header">
        <span class="chunk-badge" style="background:${color}22;color:${color}">Chunk ${chunk.index + 1}</span>
        <span class="chunk-meta">${chunk.chars} chars · pos ${chunk.start}–${chunk.end}</span>
      </div>
      <p class="chunk-text">${escapeHtml(chunk.text)}</p>`;

    card.addEventListener('click', () => highlightChunks(chunks, [chunk.index]));
    container.appendChild(card);
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function show(id) { $(id).hidden = false; }

// Show/hide size controls when strategy doesn't use them
$('strategy').addEventListener('change', () => {
  const fixed = ['fixed', 'smart'].includes($('strategy').value);
  $('sizeControls').hidden = !fixed;
});
