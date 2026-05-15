/**
 * PrintBuddy — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * For Aubrey, with love
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 *
 * Lean Express server. Serves the static SPA and provides two thin proxies:
 *   - /api/search       Mode 1 library search (CORS workaround + Thingiverse key)
 *   - /api/generate     Mode 2 AI text-to-3D (Tripo default, Meshy optional)
 *
 * The core app (shell, print settings, Mode 3 parametric builder) works with
 * NO backend at all. This server only adds Modes 1 & 2. API keys live here in
 * environment variables and are never sent to the browser.
 */

import express from 'express';
import compression from 'compression';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const TRIPO_API_KEY = process.env.TRIPO_API_KEY || '';
const MESHY_API_KEY = process.env.MESHY_API_KEY || '';
const THINGIVERSE_API_KEY = process.env.THINGIVERSE_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

app.use(compression());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

const VERSION = '1.1.0';

/* ------------------------------------------------------------------ */
/*  Health                                                            */
/* ------------------------------------------------------------------ */
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    version: VERSION,
    capabilities: {
      libraryProxy: true,
      thingiverse: Boolean(THINGIVERSE_API_KEY),
      aiGenerate: Boolean(TRIPO_API_KEY || MESHY_API_KEY),
      promptEnhancer: Boolean(ANTHROPIC_API_KEY),
      providers: {
        tripo: Boolean(TRIPO_API_KEY),
        meshy: Boolean(MESHY_API_KEY),
      },
    },
  });
});

/* ------------------------------------------------------------------ */
/*  Mode 1 — Library search                                           */
/* ------------------------------------------------------------------ */

const withTimeout = (ms) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
};

async function searchPrintables(q) {
  // `ordering` and `printType` are GraphQL enums, so they must be inline
  // literals (not string variables) — that was the original 400.
  const body = {
    operationName: 'PrintBuddySearch',
    variables: { query: q, limit: 18, offset: 0 },
    query: `query PrintBuddySearch($query: String!, $limit: Int!, $offset: Int!) {
      result: searchPrints2(query: $query, limit: $limit, offset: $offset, ordering: best_match, printType: print) {
        items {
          id
          name
          ratingAvg
          downloadCount
          likesCount
          slug
          image { filePath }
          user { publicUsername }
        }
      }
    }`,
  };
  const t = withTimeout(8000);
  try {
    const r = await fetch('https://api.printables.com/graphql/', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'PrintBuddy/1.0 (+thegoodneighborguard)',
      },
      body: JSON.stringify(body),
      signal: t.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    const items = json?.data?.result?.items || [];
    return items.map((it) => ({
      id: `printables-${it.id}`,
      title: it.name,
      source: 'Printables',
      url: `https://www.printables.com/model/${it.id}-${it.slug || ''}`,
      thumbnail: it.image?.filePath
        ? `https://media.printables.com/${it.image.filePath}`
        : null,
      rating: it.ratingAvg ? Number(parseFloat(it.ratingAvg).toFixed(1)) : null,
      downloads: it.downloadCount ?? null,
      likes: it.likesCount ?? null,
      designer: it.user?.publicUsername || null,
    }));
  } finally {
    t.done();
  }
}

async function searchMakerWorld(q) {
  const t = withTimeout(8000);
  try {
    const url =
      'https://makerworld.com/api/v1/search/models?keyword=' +
      encodeURIComponent(q) +
      '&limit=18&offset=0';
    const r = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'PrintBuddy/1.0 (+thegoodneighborguard)',
      },
      signal: t.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    const items = json?.hits || json?.list || json?.data || [];
    return (Array.isArray(items) ? items : []).slice(0, 18).map((it) => {
      const id = it.id ?? it.designId ?? it.modelId;
      return {
        id: `makerworld-${id}`,
        title: it.title || it.name || 'Untitled',
        source: 'MakerWorld',
        url: `https://makerworld.com/en/models/${id}`,
        thumbnail: it.cover || it.coverUrl || it.image || null,
        rating: it.rating ? Number(Number(it.rating).toFixed(1)) : null,
        downloads: it.downloadCount ?? it.instanceCount ?? null,
        likes: it.likeCount ?? null,
        designer:
          it.designer?.name || it.author?.name || it.userName || null,
      };
    });
  } finally {
    t.done();
  }
}

async function searchThingiverse(q) {
  if (!THINGIVERSE_API_KEY) {
    const e = new Error('THINGIVERSE_API_KEY not set');
    e.skipped = true;
    throw e;
  }
  const t = withTimeout(8000);
  try {
    const url =
      'https://api.thingiverse.com/search/' +
      encodeURIComponent(q) +
      '?type=things&per_page=18&access_token=' +
      encodeURIComponent(THINGIVERSE_API_KEY);
    const r = await fetch(url, { signal: t.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    const items = json?.hits || [];
    return items.map((it) => ({
      id: `thingiverse-${it.id}`,
      title: it.name,
      source: 'Thingiverse',
      url: it.public_url,
      thumbnail: it.thumbnail || it.preview_image || null,
      rating: null,
      downloads: it.download_count ?? null,
      likes: it.like_count ?? null,
      designer: it.creator?.name || null,
    }));
  } finally {
    t.done();
  }
}

app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query ?q=' });

  const requested = String(req.query.sources || 'printables,makerworld,thingiverse')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const jobs = [];
  if (requested.includes('printables'))
    jobs.push(['Printables', searchPrintables(q)]);
  if (requested.includes('makerworld'))
    jobs.push(['MakerWorld', searchMakerWorld(q)]);
  if (requested.includes('thingiverse'))
    jobs.push(['Thingiverse', searchThingiverse(q)]);

  const settled = await Promise.allSettled(jobs.map(([, p]) => p));
  const results = [];
  const sources = {};
  settled.forEach((s, i) => {
    const name = jobs[i][0];
    if (s.status === 'fulfilled') {
      sources[name] = { ok: true, count: s.value.length };
      results.push(...s.value);
    } else {
      const reason = s.reason || {};
      sources[name] = {
        ok: false,
        skipped: Boolean(reason.skipped),
        error: reason.message || 'failed',
      };
    }
  });

  res.json({ query: q, count: results.length, sources, results });
});

/* ------------------------------------------------------------------ */
/*  Mode 2 — Prompt enhancer (Claude turns plain English into a       */
/*  print-ready Tripo prompt). System prompt is large + static, so    */
/*  it is cached with cache_control to cut latency/cost on repeats.    */
/* ------------------------------------------------------------------ */

const ENHANCER_SYSTEM = `You are a 3D model prompt engineer specialized in creating print-ready prompts for AI 3D generators like Tripo and Meshy.

Your job: Take a user's simple description and transform it into a detailed prompt that will produce a model optimized for FDM 3D printing.

CONSTRAINTS that must be in every prompt you generate:
- Solid, watertight geometry — no thin walls under 2mm equivalent, no floating disconnected parts
- Flat base for printing stability — the model should sit flat on a print bed
- Minimal overhangs — features should be supported by geometry beneath them, or at angles under 45 degrees from vertical
- No internal cavities that can't be drained — model must be printable with standard FDM
- Single connected piece — no separate floating elements
- Detail level: moderate — too much fine detail won't print cleanly on consumer printers (0.2mm-0.4mm nozzle resolution)
- Walls thick enough to print — at least 1.5mm equivalent in scale

INPUTS YOU'LL RECEIVE:
- description: what user wants
- purpose: decoration / gift / useful / toy / wearable / planter
- size: small / medium / large
- style: realistic / cartoon / geometric / cute_animals / fantasy / simple

OUTPUT FORMAT:
Return only the enhanced prompt, no preamble, no explanation. The prompt should be a single paragraph, descriptive but focused, written in the style Tripo responds to best.

EXAMPLES:

Input:
  description: "a dragon"
  purpose: "decoration"
  size: "small"
  style: "cute/cartoon"

Output:
A cute chibi-style baby dragon figurine sitting upright with a rounded body, small folded wings tucked against the back, a thick tail curled around its feet for stability, large friendly eyes, and a flat solid base. Smooth surfaces with simplified scales suggested rather than detailed. Solid watertight body, no overhangs greater than 45 degrees, designed as a single connected piece for FDM 3D printing. Approximately 60mm tall.

Input:
  description: "phone stand"
  purpose: "useful"
  size: "medium"
  style: "geometric/modern"

Output:
A minimalist geometric phone stand with clean angular lines, featuring a flat base approximately 100mm wide for stability, a back support angled at 65 degrees from the base to hold a phone in landscape or portrait orientation, a small lip at the bottom front to prevent the phone from sliding off, hollow underside for material efficiency but with solid load-bearing walls at least 3mm thick, single connected piece optimized for FDM 3D printing without supports.

Input:
  description: "name tag for Aubrey"
  purpose: "decoration"
  size: "small"
  style: "cute/cartoon"

Output:
A decorative name plate spelling "Aubrey" in bold rounded sans-serif letters with the text raised approximately 3mm above a flat rectangular base measuring approximately 80mm wide by 25mm tall by 5mm thick, with rounded corners on the base, small heart shapes flanking either side of the name as accents, solid construction throughout, designed as a single connected piece sitting flat for FDM 3D printing without supports.`;

// Deterministic fallback so Mode 2 still works if the enhancer is down /
// not configured — better a decent prompt than a dead button.
function fallbackPrompt({ description, purpose, size, style }) {
  const mm = { small: '40-60mm', medium: '80-120mm', large: '150-200mm' };
  return (
    `${description}, ${String(style || 'simple').replace('_', ' ')} style, ` +
    `intended as a ${purpose || 'decoration'}. Solid watertight single piece ` +
    `with a flat base for FDM 3D printing, walls at least 2mm thick, no thin ` +
    `parts or overhangs greater than 45 degrees, approximately ${mm[size] || '80-120mm'}.`
  );
}

app.post('/api/enhance', async (req, res) => {
  const description = String(req.body?.description || '').trim();
  const purpose = String(req.body?.purpose || 'decoration').trim();
  const size = String(req.body?.size || 'medium').trim();
  const style = String(req.body?.style || 'simple').trim();
  if (!description) return res.status(400).json({ error: 'Missing description' });

  const userBlock =
    `description: "${description}"\n` +
    `purpose: "${purpose}"\n` +
    `size: "${size}"\n` +
    `style: "${style}"`;

  if (!ANTHROPIC_API_KEY) {
    return res.json({
      enhanced: fallbackPrompt({ description, purpose, size, style }),
      enhanced_by: 'fallback',
    });
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        thinking: { type: 'disabled' },
        // Large static prompt first + cache_control → cheap cache reads on
        // every subsequent enhance. Volatile input goes in messages, after
        // the cached prefix, so it never invalidates the cache.
        system: [
          {
            type: 'text',
            text: ENHANCER_SYSTEM,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: userBlock }],
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || `Anthropic HTTP ${r.status}`);
    const enhanced = (j.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (!enhanced) throw new Error('Empty enhancement');
    res.json({ enhanced, enhanced_by: 'claude-sonnet-4-6' });
  } catch (err) {
    // Never hard-fail the user — degrade to the deterministic prompt.
    res.json({
      enhanced: fallbackPrompt({ description, purpose, size, style }),
      enhanced_by: 'fallback',
      note: err.message,
    });
  }
});

/* ------------------------------------------------------------------ */
/*  Tripo credit balance (so Aubrey never runs out unknowingly)       */
/* ------------------------------------------------------------------ */
app.get('/api/credits', async (_req, res) => {
  if (!TRIPO_API_KEY) return res.json({ available: null, reason: 'no_key' });
  try {
    const r = await fetch('https://api.tripo3d.ai/v2/openapi/user/balance', {
      headers: { authorization: `Bearer ${TRIPO_API_KEY}` },
    });
    const j = await r.json();
    if (!r.ok || j.code !== 0)
      throw new Error(j?.message || `Tripo HTTP ${r.status}`);
    const d = j.data || {};
    const available = typeof d.balance === 'number' ? d.balance : null;
    res.json({ available, raw: d });
  } catch (err) {
    res.json({ available: null, reason: 'error', message: err.message });
  }
});

/* ------------------------------------------------------------------ */
/*  Mode 2 — AI text-to-3D (Tripo default, Meshy optional)            */
/* ------------------------------------------------------------------ */

function aiAvailable() {
  return Boolean(TRIPO_API_KEY || MESHY_API_KEY);
}

app.post('/api/generate', async (req, res) => {
  const prompt = String(req.body?.prompt || '').trim();
  const provider =
    (req.body?.provider || (TRIPO_API_KEY ? 'tripo' : 'meshy')).toLowerCase();
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });
  if (!aiAvailable()) {
    return res.status(503).json({
      error: 'no_api_key',
      message:
        'AI generation is not configured. Set TRIPO_API_KEY (or MESHY_API_KEY) on the server to enable Mode 2.',
    });
  }

  try {
    if (provider === 'meshy') {
      if (!MESHY_API_KEY)
        return res.status(503).json({ error: 'meshy_not_configured' });
      const r = await fetch('https://api.meshy.ai/openapi/v2/text-to-3d', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${MESHY_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ mode: 'preview', prompt, art_style: 'realistic' }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || `Meshy HTTP ${r.status}`);
      return res.json({ provider: 'meshy', taskId: j.result });
    }

    // Tripo (default)
    if (!TRIPO_API_KEY)
      return res.status(503).json({ error: 'tripo_not_configured' });
    const r = await fetch('https://api.tripo3d.ai/v2/openapi/task', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TRIPO_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ type: 'text_to_model', prompt }),
    });
    const j = await r.json();
    if (!r.ok || j.code !== 0)
      throw new Error(j?.message || `Tripo HTTP ${r.status}`);
    return res.json({ provider: 'tripo', taskId: j.data.task_id });
  } catch (err) {
    res.status(502).json({ error: 'provider_error', message: err.message });
  }
});

app.get('/api/generate/:provider/:taskId', async (req, res) => {
  const { provider, taskId } = req.params;
  try {
    if (provider === 'meshy') {
      const r = await fetch(
        `https://api.meshy.ai/openapi/v2/text-to-3d/${encodeURIComponent(taskId)}`,
        { headers: { authorization: `Bearer ${MESHY_API_KEY}` } }
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message || `Meshy HTTP ${r.status}`);
      return res.json({
        status: j.status, // PENDING / IN_PROGRESS / SUCCEEDED / FAILED
        progress: j.progress ?? null,
        modelUrl: j.model_urls?.glb || j.model_urls?.obj || null,
        stlUrl: j.model_urls?.stl || null,
        thumbnail: j.thumbnail_url || null,
      });
    }
    // Tripo
    const r = await fetch(
      `https://api.tripo3d.ai/v2/openapi/task/${encodeURIComponent(taskId)}`,
      { headers: { authorization: `Bearer ${TRIPO_API_KEY}` } }
    );
    const j = await r.json();
    if (!r.ok || j.code !== 0)
      throw new Error(j?.message || `Tripo HTTP ${r.status}`);
    const d = j.data;
    return res.json({
      status: d.status, // queued / running / success / failed
      progress: d.progress ?? null,
      modelUrl: d.output?.pbr_model || d.output?.model || null,
      stlUrl: null, // Tripo returns glb; client converts for download
      thumbnail: d.output?.rendered_image || null,
    });
  } catch (err) {
    res.status(502).json({ error: 'provider_error', message: err.message });
  }
});

/* ------------------------------------------------------------------ */
/*  SPA fallback                                                      */
/* ------------------------------------------------------------------ */
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`PrintBuddy v${VERSION} listening on :${PORT}`);
  console.log(
    `  AI generation: ${aiAvailable() ? 'enabled' : 'disabled (no API key)'}`
  );
});
