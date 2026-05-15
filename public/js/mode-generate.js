/**
 * PrintBuddy — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * For Aubrey, with love
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 *
 * Mode 2 — Generate with AI. Posts a prompt to the /api/generate proxy
 * (Tripo default, Meshy optional), polls for the model, previews the
 * GLB and lets her download a print-ready STL.
 */

import { API_BASE } from './config.js';

export function initGenerate() {
  const form = document.getElementById('genForm');
  const input = document.getElementById('genInput');
  const btn = document.getElementById('genBtn');
  const statusEl = document.getElementById('genStatus');
  const wrap = document.getElementById('genViewerWrap');
  const dlBtn = document.getElementById('genDownload');
  const regenBtn = document.getElementById('genRegen');

  let viewer = null;
  let lastPrompt = '';
  let polling = false;

  async function ensureViewer() {
    if (viewer) return viewer;
    const { Viewer } = await import('./viewer.js');
    viewer = new Viewer(document.getElementById('genViewer'));
    return viewer;
  }

  async function run(prompt) {
    if (polling) return;
    lastPrompt = prompt;
    btn.disabled = true;
    dlBtn.disabled = true;
    statusEl.textContent = 'Sending your idea to the AI…';
    try {
      const r = await fetch(`${API_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await r.json();
      if (r.status === 503) {
        statusEl.innerHTML =
          '🔌 AI generation isn’t switched on yet. Add a free ' +
          '<strong>TRIPO_API_KEY</strong> on the server (see the README) ' +
          'and Mode 2 lights up. Modes 1 &amp; 3 work without it.';
        btn.disabled = false;
        return;
      }
      if (!r.ok) throw new Error(data.message || `HTTP ${r.status}`);
      await poll(data.provider, data.taskId);
    } catch (err) {
      statusEl.textContent = `Couldn’t generate: ${err.message}`;
      btn.disabled = false;
    }
  }

  async function poll(provider, taskId) {
    polling = true;
    let tries = 0;
    const tick = async () => {
      tries++;
      try {
        const r = await fetch(
          `${API_BASE}/api/generate/${provider}/${encodeURIComponent(taskId)}`
        );
        const d = await r.json();
        const status = String(d.status || '').toLowerCase();
        if (['success', 'succeeded'].includes(status)) {
          polling = false;
          await showModel(d);
          return;
        }
        if (['failed', 'error', 'cancelled'].includes(status)) {
          polling = false;
          statusEl.textContent =
            'The AI couldn’t make that one. Try rewording and regenerate.';
          btn.disabled = false;
          regenBtn.disabled = false;
          return;
        }
        const pct = d.progress != null ? ` (${d.progress}%)` : '';
        statusEl.textContent = `Sculpting your model…${pct} this can take a minute.`;
        if (tries > 90) {
          polling = false;
          statusEl.textContent = 'Timed out waiting for the AI. Try again.';
          btn.disabled = false;
          return;
        }
        setTimeout(tick, 4000);
      } catch (err) {
        polling = false;
        statusEl.textContent = `Lost the connection: ${err.message}`;
        btn.disabled = false;
      }
    };
    tick();
  }

  async function showModel(d) {
    const url = d.stlUrl || d.modelUrl;
    if (!url) {
      statusEl.textContent = 'Model finished but no file came back. Try again.';
      btn.disabled = false;
      return;
    }
    statusEl.textContent = 'Loading preview…';
    wrap.hidden = false;
    const v = await ensureViewer();
    try {
      await v.loadGLB(url);
      statusEl.innerHTML =
        '✅ Done. Remember: check for thin walls and add supports before printing.';
      dlBtn.disabled = false;
      regenBtn.disabled = false;
    } catch (err) {
      statusEl.textContent = `Couldn’t load the model: ${err.message}`;
    }
    btn.disabled = false;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q) run(q);
  });

  regenBtn.addEventListener('click', () => {
    if (lastPrompt) run(lastPrompt);
  });

  dlBtn.addEventListener('click', () => {
    const blob = viewer?.exportSTLBlob();
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'printbuddy-ai-model.stl';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });

  return { setColor: (hex) => viewer?.setColor(hex) };
}
