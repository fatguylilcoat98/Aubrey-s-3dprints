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

app.use(compression());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

const VERSION = '1.0.0';

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
