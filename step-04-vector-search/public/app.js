// ─────────────────────────────────────────────────────────────────────────────
// Step 04 — Vector Search
//
// 1. checkStatus()  — is ChromaDB running? how many chunks indexed?
// 2. buildIndex()   — chunk + embed + store in Chroma
// 3. search()       — embed question + query Chroma for nearest chunks
// ─────────────────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const SAMPLE_DOC = `Company PTO Policy (2025)

All full-time employees receive 20 days of paid time off (PTO) per calendar year. PTO accrues at a rate of 1.67 days per month. New hires begin accruing PTO on their first day but cannot use it until after a 30-day waiting period.

Unused PTO rolls over up to a maximum of 5 days into the next year. Any balance above 5 days is forfeited on December 31. Employees must request PTO at least two weeks in advance through the HR portal, unless the request is for sick leave.

Sick leave is separate from PTO. Employees receive 10 sick days per year. Sick leave does not roll over. If you need more than 3 consecutive sick days, you must provide a doctor's note.

Managers approve or deny PTO requests within 3 business days. During peak season (November–December), no more than 25% of a team may be out at the same time. Emergency time off can be approved by a director without the two-week notice requirement.

Remote employees follow the same PTO rules as office employees. Public holidays are not counted against your PTO balance.`;

$('chunkSize').addEventListener('input', e => { $('chunkSizeVal').textContent = e.target.value; });
$('overlap').addEventListener('input', e => { $('overlapVal').textContent = e.target.value; });

function loadSample() {
  $('document').value = SAMPLE_DOC;
}

function setQuery(text) {
  $('query').value = text;
}

// ── Status check on load ──────────────────────────────────────────────────────
async function checkStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    if (data.chroma?.ok) {
      setBadge('chromaBadge', 'Chroma connected', 'green');
      $('chromaStatus').textContent = 'OK';
      $('indexedChunks').textContent = data.chroma.chunkCount;
    } else {
      setBadge('chromaBadge', 'Chroma offline', 'red');
      $('chromaStatus').textContent = 'down';
      $('indexedChunks').textContent = '—';
    }

    $('embedModel').textContent = data.embedModel?.split('/').pop() ?? '—';

  } catch {
    setBadge('chromaBadge', 'Server error', 'red');
  }
}

// ── Build index: chunk → embed → store ────────────────────────────────────────
async function buildIndex() {
  const btn = $('indexBtn');
  const text = $('document').value.trim();

  if (!text) {
    alert('Load or paste a document first.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Indexing…';

  try {
    const res = await fetch('/api/index', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        chunkSize: parseInt($('chunkSize').value, 10),
        overlap: parseInt($('overlap').value, 10),
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message ?? `HTTP ${res.status}`);

    $('indexedChunks').textContent = data.chunkCount;
    renderIndexPreview(data);
    $('indexResult').hidden = false;

  } catch (err) {
    alert(`Index failed: ${err.message}`);
  }

  btn.disabled = false;
  btn.textContent = 'Build index →';
}

function renderIndexPreview(data) {
  const container = $('indexChunks');
  container.replaceChildren();

  for (const chunk of data.chunks) {
    const el = document.createElement('div');
    el.className = 'chunk-preview';
    el.innerHTML = `
      <span class="chunk-badge">Chunk ${chunk.index + 1}</span>
      <span class="chunk-meta">${chunk.chars} chars · ${data.dimensions} dims</span>
      <p>${escapeHtml(chunk.preview)}…</p>`;
    container.appendChild(el);
  }
}

// ── Vector search ─────────────────────────────────────────────────────────────
async function search() {
  const btn = $('searchBtn');
  const query = $('query').value.trim();

  if (!query) {
    alert('Enter a question first.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Searching…';

  try {
    const res = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, nResults: 3 }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message ?? `HTTP ${res.status}`);

    renderHits(data);
    $('searchResult').hidden = false;

  } catch (err) {
    alert(`Search failed: ${err.message}`);
  }

  btn.disabled = false;
  btn.textContent = 'Search →';
}

function renderHits(data) {
  $('searchLatency').textContent = `${data.latencyMs}ms`;
  const container = $('hits');
  container.replaceChildren();

  if (!data.hits.length) {
    container.innerHTML = '<p class="card-desc">No matches found.</p>';
    return;
  }

  for (const [rank, hit] of data.hits.entries()) {
    const pct = Math.round(hit.similarity * 100);
    const el = document.createElement('div');
    el.className = 'hit-card';
    el.innerHTML = `
      <div class="hit-header">
        <span class="rank">#${rank + 1}</span>
        <span class="hit-id">${hit.id}</span>
        <span class="similarity">${pct}% similar</span>
      </div>
      <div class="sim-bar-wrap"><div class="sim-bar" style="width:${pct}%"></div></div>
      <p class="hit-text">${escapeHtml(hit.document)}</p>`;
    container.appendChild(el);
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function setBadge(id, text, color) {
  const el = $(id);
  el.textContent = text;
  el.className = `badge badge-${color}`;
}

checkStatus();
loadSample();
