# PrintBuddy — The Good Neighbor Guard

> Truth · Safety · We Got Your Back
> Built by Christopher Hughes · Sacramento, CA · for Aubrey, with love.

A browser-only 3D-print helper. No installs, no admin rights, no native
software. Open a URL, get useful print-ready models. Built for Aubrey to use
on a work computer.

**Working name:** PrintBuddy (rename freely — it's set in two places, see below).

---

## What it does — three modes in one page

1. **Build Something Custom** *(works with zero backend)*
   Nine parametric templates — name plate, box/tray, cable organizer, wall
   hook, keychain tag, pen holder, business-card holder, phone stand,
   ornament. Adjust the numbers, watch the live 3D preview, download a
   watertight STL. All geometry is generated client-side with
   [`@jscad/modeling`](https://github.com/jscad/OpenJSCAD.org) + three.js.

2. **Find a Design** *(needs the backend proxy)*
   Searches Printables, MakerWorld and Thingiverse and shows a card grid.
   The model sites block direct browser requests, so the lean Express
   server proxies the calls.

3. **Generate with AI** *(needs an API key)*
   Text-to-3D via Tripo (default) or Meshy. The backend holds the key and
   proxies the request; the browser never sees it. Honest warning shown:
   AI models usually need cleanup before they print well.

A **Print Settings** panel (all modes) takes printer / filament / nozzle and
shows recommended layer height, infill, temps, supports, a rough time
estimate, and a build-plate fit check. Choices are saved in `localStorage`.

---

## Quick start (Chris)

```bash
npm install
cp .env.example .env      # optional — only for Modes 1 & 2
npm start                 # http://localhost:3000
```

That's it. **Mode 3 works immediately with no keys.** Modes 1 and 2 come
online as you add keys (below).

### Environment variables (backend only — never sent to the browser)

| Var                  | Mode | Needed?  | Where to get it |
|----------------------|------|----------|-----------------|
| `TRIPO_API_KEY`      | 2    | for AI   | https://platform.tripo3d.ai/ (free tier) |
| `MESHY_API_KEY`      | 2    | optional | https://www.meshy.ai/ |
| `THINGIVERSE_API_KEY`| 1    | optional | https://www.thingiverse.com/developers |
| `NODE_ENV`           | —    | prod     | `production` |

Printables and MakerWorld in Mode 1 need **no key** — they work as soon as
the backend is running. Thingiverse is skipped gracefully until its key is
set (the UI shows "Thingiverse: needs API key").

---

## Deploy

### Option A — Render (full app: all three modes)

`render.yaml` is included. Create a new Render Web Service from this repo;
it runs `npm install` then `npm start`. Add the API keys in the Render
dashboard (they're declared `sync: false` so they aren't committed).

### Option B — Static only (Modes 1\* and 3, free hosts)

Publish just the `public/` folder to GitHub Pages / Netlify / Vercel.
Mode 3 is fully functional. Mode 1 needs the backend — if you run the
Express server somewhere (e.g. Render), set the backend URL in the static
site by adding this before the app script in `public/index.html`:

```html
<script>window.PRINTBUDDY_API_BASE = "https://your-backend.onrender.com";</script>
```

### Option C — Behind a reverse proxy on a subpath

Some networks block `*.onrender.com`. Route PrintBuddy through an
already-trusted domain instead, e.g. `thegoodneighborguard.com/printbuddy`.

**1. PrintBuddy side (this repo) — already wired.** Set `BASE_PATH` on the
PrintBuddy service (it's in `render.yaml` as `/printbuddy`). The server then
emits `<base href="/printbuddy/">` + a matching API base into the HTML and
strips the prefix back off internally, so every asset and `/api/*` call
resolves under the subpath. Unset `BASE_PATH` to serve at root again — no
other change needed.

**2. GNG website side — add a path-preserving rewrite** (NOT a redirect, so
the address bar stays on the GNG domain). The prefix must be kept in the
destination because PrintBuddy serves under `/printbuddy`:

- **Render** (static site or service) `render.yaml`:
  ```yaml
  routes:
    - type: rewrite
      source: /printbuddy
      destination: https://printbuddy.onrender.com/printbuddy
    - type: rewrite
      source: /printbuddy/*
      destination: https://printbuddy.onrender.com/printbuddy/:splat
  ```
- **Netlify** `_redirects`:
  ```
  /printbuddy       https://printbuddy.onrender.com/printbuddy       200
  /printbuddy/*     https://printbuddy.onrender.com/printbuddy/:splat 200
  ```
- **Vercel** `vercel.json`:
  ```json
  { "rewrites": [
    { "source": "/printbuddy", "destination": "https://printbuddy.onrender.com/printbuddy" },
    { "source": "/printbuddy/:path*", "destination": "https://printbuddy.onrender.com/printbuddy/:path*" }
  ] }
  ```
- **Express / Node** GNG app:
  ```js
  import { createProxyMiddleware } from 'http-proxy-middleware';
  app.use('/printbuddy', createProxyMiddleware({
    target: 'https://printbuddy.onrender.com',
    changeOrigin: true, // path kept as /printbuddy/* — do not rewrite it
  }));
  ```
- **Apache** (`.htaccess`, needs `mod_proxy`):
  ```apache
  ProxyPass        /printbuddy https://printbuddy.onrender.com/printbuddy
  ProxyPassReverse /printbuddy https://printbuddy.onrender.com/printbuddy
  ```

No DNS or registrar changes are required — this is pure HTTP routing on an
existing domain. Everything stays HTTPS end to end (no mixed content).

### Option D — Custom subdomain on Render (recommended when `*.onrender.com` is blocked)

If a network filter blocks `onrender.com` (e.g. a school district), the most
reliable fix is to put PrintBuddy on a subdomain of an already-trusted
domain. The filter sees `printbuddy.thegoodneighborguard.com`, not
`onrender.com`. No reverse proxy, no changes to the main website, works
regardless of how that site is hosted (GitHub Pages included), and
PrintBuddy serves at the subdomain **root** (leave `BASE_PATH` unset).

**1. Render dashboard** → the PrintBuddy web service → **Settings →
Custom Domains → Add Custom Domain** → enter
`printbuddy.thegoodneighborguard.com`. Render shows the exact CNAME target
to use (typically `<service>.onrender.com`).

**2. Porkbun** (DNS for `thegoodneighborguard.com`) → Domain → **DNS /
Edit** → add a record:

| Type  | Host        | Answer / Target                | TTL |
|-------|-------------|--------------------------------|-----|
| CNAME | `printbuddy`| *(the target Render showed)*   | 600 |

**3.** Wait for DNS to propagate (minutes to ~an hour). Render then
auto-issues a free Let's Encrypt TLS cert — the subdomain is HTTPS.

**4.** Test: open `https://printbuddy.thegoodneighborguard.com` and have
Aubrey load it from her work computer.

> Honest caveat: most school filters categorize by the requested
> hostname / TLS SNI (here `printbuddy.thegoodneighborguard.com`), so this
> passes. A filter that recursively follows the CNAME and categorizes by
> the final `onrender.com` target could still block it — if that happens,
> the real fix is hosting PrintBuddy off Render entirely (a provider not on
> the blocklist, or alongside the GNG site). Aubrey's work computer is the
> only test that confirms it.

---

## Project structure

```
server.js               Lean Express server: static host + /api/search + /api/generate
render.yaml              Render deployment
.env.example             Env var template
public/
  index.html             SPA shell (importmap loads three.js + JSCAD from CDN)
  css/styles.css         Warm "crafty" theme
  js/
    app.js               Bootstrap: tabs, print settings, persistence
    config.js            APP_VERSION + API_BASE (rename / backend URL here)
    printer-profiles.js  Static printer + filament data and recommendations
    viewer.js            three.js preview, JSCAD→mesh, STL/GLB, volume calc
    templates.js         The nine parametric templates
    mode-build.js        Mode 3 UI
    mode-find.js         Mode 1 UI
    mode-generate.js     Mode 2 UI
```

## Renaming the app

The name "PrintBuddy" appears in `public/index.html` (header) and the
version string lives in `public/js/config.js` (`APP_VERSION`) and
`package.json`. Change those and you're done.

## Honest limitations

- **Mode 1** depends on third-party site endpoints that are undocumented
  and can change without notice. The proxy degrades per-source: if
  Printables changes its API, MakerWorld/Thingiverse still return results
  and the UI shows which source failed.
- **Mode 2** Tripo returns a GLB; PrintBuddy converts it to STL in-browser
  for download. AI meshes frequently need wall-thickness and support
  cleanup before they print — the UI says so.
- No analytics, no tracking, no cookies beyond the preferences blob in
  `localStorage`. No login, no signup.

## Accessibility / work-computer friendliness

No plugins, no Flash, no Java. Works on current Chrome, Edge, Firefox.
Downloads use the normal browser save dialog. STL generation in Mode 3 is
entirely client-side — minimal network traffic.

---

*Created with the help of AI collaborators (Claude · GPT · Gemini · Groq).*
*Version 1.0.0*
