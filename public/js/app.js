/**
 * PrintBuddy — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * For Aubrey, with love
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 *
 * App bootstrap: tab switching, print-settings panel + persistence,
 * and wiring the three modes together.
 */

import { PRINTERS, recommend } from './printer-profiles.js';
import { APP_VERSION } from './config.js';
import { initBuild } from './mode-build.js';
import { initFind } from './mode-find.js';
import { initGenerate } from './mode-generate.js';

const STORE_KEY = 'printbuddy.settings.v1';

document.getElementById('appVersion').textContent = `v${APP_VERSION}`;

/* ---- Tabs + menu navigation --------------------------------------- */
const tabs = [...document.querySelectorAll('.tab')];
const panels = [...document.querySelectorAll('.panel')];
const menuItems = [...document.querySelectorAll('.menu-item[data-go]')];

function activateMode(mode) {
  tabs.forEach((t) => {
    const on = t.dataset.mode === mode;
    t.classList.toggle('is-active', on);
    t.setAttribute('aria-selected', String(on));
  });
  panels.forEach((p) =>
    p.classList.toggle('is-active', p.dataset.mode === mode)
  );
  menuItems.forEach((m) =>
    m.classList.toggle('is-active', m.dataset.go === mode)
  );
}

tabs.forEach((tab) =>
  tab.addEventListener('click', () => activateMode(tab.dataset.mode))
);

/* ---- Print settings panel ---------------------------------------- */
const psPrinter = document.getElementById('psPrinter');
const psFilament = document.getElementById('psFilament');
const psColor = document.getElementById('psColor');
const psNozzle = document.getElementById('psNozzle');
const psRecList = document.getElementById('psRecList');

for (const p of PRINTERS) {
  const o = document.createElement('option');
  o.value = p.id;
  o.textContent = p.name;
  psPrinter.appendChild(o);
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    if (s.printerId) psPrinter.value = s.printerId;
    if (s.filament) psFilament.value = s.filament;
    if (s.color) psColor.value = s.color;
    if (s.nozzle) psNozzle.value = s.nozzle;
  } catch {
    /* localStorage may be blocked; defaults are fine */
  }
}

function getSettings() {
  return {
    printerId: psPrinter.value,
    filament: psFilament.value,
    color: psColor.value,
    nozzle: psNozzle.value,
  };
}

function saveSettings() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(getSettings()));
  } catch {
    /* ignore */
  }
}

let lastModel = null;
function refreshRecommendations() {
  const recs = recommend(getSettings(), lastModel || {});
  psRecList.innerHTML = '';
  for (const [k, v] of recs) {
    const li = document.createElement('li');
    li.innerHTML = `<span>${k}</span><span>${v}</span>`;
    psRecList.appendChild(li);
  }
}

/* ---- Modes -------------------------------------------------------- */
loadSettings();

const build = initBuild({
  onModel: (m) => {
    lastModel = m;
    refreshRecommendations();
  },
});
initFind();
const generate = initGenerate();

build.setColor(psColor.value);

[psPrinter, psFilament, psNozzle].forEach((el) =>
  el.addEventListener('change', () => {
    saveSettings();
    refreshRecommendations();
  })
);
psColor.addEventListener('input', () => {
  saveSettings();
  build.setColor(psColor.value);
  generate.setColor?.(psColor.value);
});

refreshRecommendations();

/* ---- Drawers: main menu + print settings ------------------------- */
const toggle = document.getElementById('settingsToggle');
const drawer = document.getElementById('printSettings');
const backdrop = document.getElementById('settingsBackdrop');
const menuToggle = document.getElementById('menuToggle');
const menu = document.getElementById('mainMenu');
const menuClose = document.getElementById('menuClose');

function setBackdrop(on) {
  backdrop.hidden = !on;
}
function anyDrawerOpen() {
  return (
    menu.classList.contains('is-open') || drawer.classList.contains('is-open')
  );
}

function setSettings(open) {
  drawer.classList.toggle('is-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  setBackdrop(anyDrawerOpen());
}
function setMenu(open) {
  menu.classList.toggle('is-open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
  setBackdrop(anyDrawerOpen());
}
function closeAll() {
  menu.classList.remove('is-open');
  drawer.classList.remove('is-open');
  menuToggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-expanded', 'false');
  setBackdrop(false);
}

menuToggle.addEventListener('click', () =>
  setMenu(!menu.classList.contains('is-open'))
);
menuClose.addEventListener('click', closeAll);
toggle.addEventListener('click', () =>
  setSettings(!drawer.classList.contains('is-open'))
);
backdrop.addEventListener('click', closeAll);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAll();
});

menuItems.forEach((item) =>
  item.addEventListener('click', () => {
    const go = item.dataset.go;
    if (go === 'settings') {
      closeAll();
      // On wide screens the settings panel is always visible; just reveal it.
      if (window.matchMedia('(max-width: 1024px)').matches) setSettings(true);
      else drawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    activateMode(go);
    closeAll();
  })
);
