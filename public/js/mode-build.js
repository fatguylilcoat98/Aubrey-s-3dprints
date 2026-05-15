/**
 * PrintBuddy — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * For Aubrey, with love
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 *
 * Mode 3 — Build Something Custom. Wires the template picker + parameter
 * form to the live 3D preview and STL download.
 */

import { TEMPLATES } from './templates.js';
import { Viewer, loadFont } from './viewer.js';

export function initBuild({ onModel }) {
  const listEl = document.getElementById('templateList');
  const formEl = document.getElementById('buildForm');
  const dimsEl = document.getElementById('buildDims');
  const dlBtn = document.getElementById('downloadStl');
  const viewer = new Viewer(document.getElementById('buildViewer'));

  let font = null;
  let current = TEMPLATES[0];
  let rebuildTimer = null;
  let lastModel = null;

  loadFont().then((f) => {
    font = f;
    rebuild();
  });

  // ---- template list ------------------------------------------------
  for (const t of TEMPLATES) {
    const b = document.createElement('button');
    b.innerHTML = `${t.name}<span class="t-desc">${t.desc}</span>`;
    b.dataset.id = t.id;
    if (t.id === current.id) b.classList.add('is-active');
    b.addEventListener('click', () => {
      current = t;
      [...listEl.children].forEach((c) =>
        c.classList.toggle('is-active', c.dataset.id === t.id)
      );
      renderForm();
      rebuild();
    });
    listEl.appendChild(b);
  }

  // ---- parameter form ----------------------------------------------
  function renderForm() {
    formEl.innerHTML = `<h3>${current.name}</h3><p class="form-sub">${current.desc}</p>`;
    for (const param of current.params) {
      formEl.appendChild(fieldFor(param));
    }
  }

  function fieldFor(param) {
    const wrap = document.createElement('label');
    wrap.className = 'field';
    const span = document.createElement('span');
    span.textContent = param.label + (param.unit ? ` (${param.unit})` : '');

    let input;
    if (param.type === 'range') {
      wrap.appendChild(span);
      const row = document.createElement('div');
      row.className = 'range-row';
      input = document.createElement('input');
      input.type = 'range';
      input.min = param.min;
      input.max = param.max;
      input.step = param.step;
      input.value = param.default;
      const val = document.createElement('span');
      val.className = 'range-val';
      val.textContent = `${param.default}${param.unit || ''}`;
      input.addEventListener('input', () => {
        val.textContent = `${input.value}${param.unit || ''}`;
        scheduleRebuild();
      });
      row.append(input, val);
      wrap.appendChild(row);
    } else if (param.type === 'select') {
      wrap.appendChild(span);
      input = document.createElement('select');
      for (const o of param.options) {
        const opt = document.createElement('option');
        opt.value = o;
        opt.textContent = o;
        if (o === param.default) opt.selected = true;
        input.appendChild(opt);
      }
      input.addEventListener('change', scheduleRebuild);
      wrap.appendChild(input);
    } else if (param.type === 'checkbox') {
      wrap.classList.add('field-inline');
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!param.default;
      input.addEventListener('change', scheduleRebuild);
      wrap.append(input, span);
    } else {
      wrap.appendChild(span);
      input = document.createElement('input');
      input.type = param.type === 'number' ? 'number' : 'text';
      if (param.type === 'number') {
        input.min = param.min;
        input.max = param.max;
        input.step = param.step;
      }
      input.value = param.default;
      input.addEventListener('input', scheduleRebuild);
      wrap.appendChild(input);
    }
    input.dataset.key = param.key;
    input.dataset.ptype = param.type;
    return wrap;
  }

  function collectParams() {
    const out = {};
    formEl.querySelectorAll('[data-key]').forEach((el) => {
      const k = el.dataset.key;
      if (el.dataset.ptype === 'checkbox') out[k] = el.checked;
      else if (el.dataset.ptype === 'number' || el.dataset.ptype === 'range')
        out[k] = Number(el.value);
      else out[k] = el.value;
    });
    return out;
  }

  function scheduleRebuild() {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(rebuild, 180);
  }

  function rebuild() {
    if (!font) return;
    const params = collectParams();
    dlBtn.disabled = true;
    try {
      const geom = current.build(params, { font });
      const info = viewer.setGeometry(geom);
      const [x, y, z] = info.boundsMm.map((v) => Math.round(v * 10) / 10);
      dimsEl.textContent = `${x} × ${y} × ${z} mm`;
      dlBtn.disabled = false;
      const supports =
        typeof current.supports === 'function'
          ? current.supports(params)
          : 'unknown';
      lastModel = { ...info, supports, name: current.id };
      onModel?.(lastModel);
    } catch (err) {
      console.error(err);
      dimsEl.textContent = '⚠ Could not build with these values';
    }
  }

  // ---- download -----------------------------------------------------
  dlBtn.addEventListener('click', () => {
    const blob = viewer.exportSTLBlob();
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `printbuddy-${current.id}.stl`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });

  renderForm();

  return {
    setColor: (hex) => viewer.setColor(hex),
    getModel: () => lastModel,
    refresh: () => rebuild(),
  };
}
