/**
 * PrintBuddy — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * For Aubrey, with love
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 *
 * Frontend config. By default the API is same-origin (the Express server
 * serves this SPA). If you publish ONLY /public as a static site
 * (GitHub Pages / Netlify) and run the backend separately on Render,
 * set API_BASE to that backend URL, e.g. "https://printbuddy.onrender.com".
 */

export const API_BASE =
  (typeof window !== 'undefined' && window.PRINTBUDDY_API_BASE) || '';

export const APP_VERSION = '1.1.0';
