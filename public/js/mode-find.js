/**
 * PrintBuddy — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * For Aubrey, with love
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 *
 * Mode 1 — Find a Design. Talks to the lean /api/search proxy which
 * aggregates Printables, MakerWorld and Thingiverse.
 */

import { API_BASE } from './config.js';

export function initFind() {
  const form = document.getElementById('findForm');
  const input = document.getElementById('findInput');
  const statusEl = document.getElementById('findStatus');
  const grid = document.getElementById('findResults');
  const toggles = document.getElementById('sourceToggles');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;

    const sources = [...toggles.querySelectorAll('input:checked')]
      .map((c) => c.value)
      .join(',');
    if (!sources) {
      statusEl.textContent = 'Pick at least one source.';
      return;
    }

    grid.innerHTML = '';
    statusEl.textContent = 'Searching…';

    try {
      const r = await fetch(
        `${API_BASE}/api/search?q=${encodeURIComponent(q)}&sources=${sources}`
      );
      if (!r.ok) throw new Error(`Search failed (HTTP ${r.status})`);
      const data = await r.json();
      renderStatus(data);
      renderCards(data.results);
    } catch (err) {
      statusEl.innerHTML =
        `<span class="src-pill src-bad">Search unavailable</span> ` +
        `${escapeHtml(err.message)}. Mode 1 needs the PrintBuddy backend ` +
        `running (it can't be done from a pure static deploy because the ` +
        `model sites block direct browser requests).`;
    }
  });

  function renderStatus(data) {
    const pills = Object.entries(data.sources || {}).map(([name, s]) => {
      if (s.ok) return `<span class="src-pill src-ok">${name}: ${s.count}</span>`;
      if (s.skipped)
        return `<span class="src-pill src-bad">${name}: needs API key</span>`;
      return `<span class="src-pill src-bad">${name}: unavailable</span>`;
    });
    statusEl.innerHTML =
      `Found <strong>${data.count}</strong> for “${escapeHtml(data.query)}”. ` +
      pills.join(' ');
  }

  function renderCards(results) {
    if (!results || !results.length) {
      grid.innerHTML =
        '<p class="empty-note">No results. Try simpler words like “planter” or “hook”.</p>';
      return;
    }
    grid.innerHTML = '';
    for (const it of results) {
      const card = document.createElement('article');
      card.className = 'card';

      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      if (it.thumbnail) {
        thumb.style.backgroundImage = `url("${cssUrl(it.thumbnail)}")`;
        thumb.textContent = '';
      } else {
        thumb.textContent = 'No preview';
      }

      const body = document.createElement('div');
      body.className = 'body';

      const src = document.createElement('span');
      src.className = `src src-${it.source}`;
      src.textContent = it.source;

      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = it.title || 'Untitled';

      const meta = document.createElement('div');
      meta.className = 'meta';
      const bits = [];
      if (it.rating) bits.push(`★ ${it.rating}`);
      if (it.downloads != null) bits.push(`⬇ ${fmt(it.downloads)}`);
      if (it.likes != null) bits.push(`♥ ${fmt(it.likes)}`);
      if (it.designer) bits.push(`by ${it.designer}`);
      meta.textContent = bits.join('  ·  ');

      const actions = document.createElement('div');
      actions.className = 'actions';
      const view = document.createElement('a');
      view.className = 'btn btn-primary';
      view.href = it.url;
      view.target = '_blank';
      view.rel = 'noopener noreferrer';
      view.textContent = 'View on site';
      actions.appendChild(view);

      body.append(src, title, meta, actions);
      card.append(thumb, body);
      grid.appendChild(card);
    }
  }
}

const fmt = (n) =>
  n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n);

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );
}
function cssUrl(u) {
  return String(u).replace(/["\\]/g, '');
}
