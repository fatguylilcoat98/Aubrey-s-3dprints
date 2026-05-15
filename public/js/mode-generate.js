/**
 * PrintBuddy — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * For Aubrey, with love
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 *
 * Mode 2 — Generate with AI. Two stages:
 *   1. Aubrey's plain words + structured choices → /api/enhance (Claude
 *      rewrites them into a print-ready prompt; she sees both).
 *   2. The enhanced (or hand-edited) prompt → /api/generate (Tripo),
 *      poll, preview the GLB, sanity-check the mesh, download STL.
 */

import { API_BASE } from './config.js';

export function initGenerate() {
  const form = document.getElementById('genForm');
  const desc = document.getElementById('genDesc');
  const purpose = document.getElementById('genPurpose');
  const style = document.getElementById('genStyle');
  const btn = document.getElementById('genBtn');
  const statusEl = document.getElementById('genStatus');

  const promptsEl = document.getElementById('genPrompts');
  const yourIdeaEl = document.getElementById('genYourIdea');
  const optBox = document.getElementById('genOptBox');
  const enhancedEl = document.getElementById('genEnhanced');
  const enhByEl = document.getElementById('genEnhBy');
  const editToggle = document.getElementById('genEditToggle');

  const wrap = document.getElementById('genViewerWrap');
  const checkEl = document.getElementById('genPrintCheck');
  const dlBtn = document.getElementById('genDownload');
  const regenBtn = document.getElementById('genRegen');
  const resetBtn = document.getElementById('genReset');
  const creditChip = document.getElementById('creditChip');

  let viewer = null;
  let polling = false;
  let currentPrompt = '';
  let editing = false;

  async function ensureViewer() {
    if (viewer) return viewer;
    const { Viewer } = await import('./viewer.js');
    viewer = new Viewer(document.getElementById('genViewer'));
    return viewer;
  }

  const sizeVal = () =>
    document.querySelector('input[name="genSize"]:checked')?.value || 'medium';

  /* ---- credits ----------------------------------------------------- */
  async function refreshCredits() {
    try {
      const r = await fetch(`${API_BASE}/api/credits`);
      const d = await r.json();
      if (typeof d.available !== 'number') {
        creditChip.hidden = true;
        return;
      }
      creditChip.hidden = false;
      creditChip.classList.toggle('warn', d.available < 100 && d.available >= 25);
      creditChip.classList.toggle('low', d.available < 25);
      const topup =
        d.available < 100
          ? ' · <a href="https://platform.tripo3d.ai/" target="_blank" rel="noopener noreferrer">top up</a>'
          : '';
      creditChip.innerHTML = `🪙 ${d.available} Tripo credits left${topup}`;
    } catch {
      creditChip.hidden = true;
    }
  }

  /* ---- stage 1: enhance ------------------------------------------- */
  async function enhance() {
    const description = desc.value.trim();
    if (!description) return null;
    statusEl.textContent = 'Polishing your idea into a print-ready prompt…';
    const r = await fetch(`${API_BASE}/api/enhance`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        description,
        purpose: purpose.value,
        size: sizeVal(),
        style: style.value,
      }),
    });
    if (!r.ok) throw new Error(`Enhancer failed (HTTP ${r.status})`);
    const d = await r.json();
    yourIdeaEl.textContent = description;
    enhancedEl.value = d.enhanced;
    enhByEl.textContent =
      d.enhanced_by === 'fallback'
        ? '(built-in prompt — add ANTHROPIC_API_KEY for smarter rewrites)'
        : '(rewritten by Claude)';
    promptsEl.hidden = false;
    return d.enhanced;
  }

  /* ---- stage 2: generate ------------------------------------------ */
  async function generate(prompt) {
    if (polling) return;
    currentPrompt = prompt;
    btn.disabled = true;
    dlBtn.disabled = true;
    regenBtn.disabled = true;
    statusEl.textContent = 'Sending the print-ready prompt to the AI…';
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
          '<strong>TRIPO_API_KEY</strong> on the server (see the README). ' +
          'Modes 1 &amp; 3 work without it.';
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
      const { analyzeMesh } = await import('./viewer.js');
      const a = analyzeMesh(v.currentGeometry);
      checkEl.className = `print-check ${a.verdict}`;
      const icon = { ok: '✅', warn: '⚠', bad: '⛔' }[a.verdict];
      checkEl.textContent = `${icon} ${a.message}`;
      statusEl.textContent = 'Done. Always preview in your slicer before printing.';
      dlBtn.disabled = false;
      regenBtn.disabled = false;
      refreshCredits();
    } catch (err) {
      statusEl.textContent = `Couldn’t load the model: ${err.message}`;
    }
    btn.disabled = false;
  }

  /* ---- events ------------------------------------------------------ */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    try {
      const enhanced = await enhance();
      if (enhanced) await generate(enhanced);
    } catch (err) {
      statusEl.textContent = `Couldn’t prep your prompt: ${err.message}`;
      btn.disabled = false;
    }
  });

  regenBtn.addEventListener('click', () => {
    if (currentPrompt) generate(currentPrompt);
  });

  editToggle.addEventListener('click', () => {
    editing = !editing;
    enhancedEl.toggleAttribute('readonly', !editing);
    if (editing) {
      optBox.open = true;
      enhancedEl.focus();
      editToggle.textContent = '↻ Regenerate with my edits';
    } else {
      editToggle.textContent = '✎ Edit & regenerate';
      const edited = enhancedEl.value.trim();
      if (edited) generate(edited);
    }
  });

  resetBtn.addEventListener('click', () => {
    wrap.hidden = true;
    promptsEl.hidden = true;
    checkEl.textContent = '';
    checkEl.className = 'print-check';
    statusEl.textContent = '';
    desc.value = '';
    desc.focus();
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

  refreshCredits();

  return { setColor: (hex) => viewer?.setColor(hex) };
}
