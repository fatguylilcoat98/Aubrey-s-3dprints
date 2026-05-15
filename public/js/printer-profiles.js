/**
 * PrintBuddy — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * For Aubrey, with love
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 *
 * Static printer + filament profile data. No API calls — embedded JSON.
 * Numbers are sensible community-typical starting points, not gospel.
 */

export const PRINTERS = [
  { id: 'bambu-a1', name: 'Bambu Lab A1', volume: [256, 256, 256], speed: 'fast' },
  { id: 'bambu-x1c', name: 'Bambu Lab X1C', volume: [256, 256, 256], speed: 'fast' },
  { id: 'prusa-mk4', name: 'Prusa MK4', volume: [250, 210, 220], speed: 'medium' },
  { id: 'ender-3', name: 'Creality Ender 3', volume: [220, 220, 250], speed: 'slow' },
  { id: 'neptune', name: 'Elegoo Neptune', volume: [220, 220, 280], speed: 'medium' },
  { id: 'other', name: 'Other / Not listed', volume: [220, 220, 250], speed: 'medium' },
];

// Rough volumetric throughput (mm^3/s) used only for a ballpark time estimate.
const SPEED_THROUGHPUT = { fast: 14, medium: 9, slow: 6 };

const FILAMENT = {
  PLA: { temp: '200–210 °C', bed: '55 °C', layer: 0.2, infill: 15, note: 'Easiest. Great for most things.' },
  PETG: { temp: '235–245 °C', bed: '75 °C', layer: 0.2, infill: 20, note: 'Tougher, slightly stringy.' },
  TPU: { temp: '220–235 °C', bed: '45 °C', layer: 0.2, infill: 12, note: 'Flexible. Print slow.' },
  ABS: { temp: '240–255 °C', bed: '100 °C', layer: 0.2, infill: 20, note: 'Strong, needs an enclosure.' },
};

/**
 * Build the recommendation list shown in the Print Settings panel.
 * @param {{printerId:string, filament:string, nozzle:number}} s
 * @param {{volumeMm3?:number, supports?:('yes'|'no'|'maybe'|'unknown'), boundsMm?:number[]}} [model]
 */
export function recommend(s, model = {}) {
  const printer = PRINTERS.find((p) => p.id === s.printerId) || PRINTERS[5];
  const fil = FILAMENT[s.filament] || FILAMENT.PLA;
  const nozzle = Number(s.nozzle) || 0.4;

  // Layer height scales with nozzle (≈ 50% of nozzle is a safe default).
  const layer = Math.round(nozzle * 0.5 * 100) / 100;

  const rec = [];
  rec.push(['Layer height', `${layer.toFixed(2)} mm`]);
  rec.push(['Infill', `${fil.infill}%`]);
  rec.push(['Nozzle temp', fil.temp]);
  rec.push(['Bed temp', fil.bed]);

  let supportsTxt = 'Depends on model';
  if (model.supports === 'yes') supportsTxt = 'Yes — overhangs present';
  else if (model.supports === 'no') supportsTxt = 'Not needed';
  else if (model.supports === 'maybe') supportsTxt = 'Maybe — check overhangs';
  rec.push(['Supports', supportsTxt]);

  if (model.volumeMm3 && model.volumeMm3 > 0) {
    const tp = SPEED_THROUGHPUT[printer.speed] || 9;
    // Effective material laid down ≈ shell + infill fraction of the bounding solid.
    const effective = model.volumeMm3 * (0.28 + (fil.infill / 100) * 0.55);
    const minutes = Math.max(2, Math.round(effective / tp / 60));
    rec.push(['Est. print time', fmtTime(minutes)]);
  } else {
    rec.push(['Est. print time', '—']);
  }

  if (model.boundsMm && printer.id !== 'other') {
    const [bx, by, bz] = model.boundsMm.map((v) => Math.ceil(v));
    const [px, py, pz] = printer.volume;
    const fits = bx <= px && by <= py && bz <= pz;
    rec.push(['Fits build plate', fits ? `Yes (${bx}×${by}×${bz} mm)` : `⚠ Too big (${bx}×${by}×${bz})`]);
  }

  rec.push(['Filament note', fil.note]);
  return rec;
}

function fmtTime(min) {
  if (min < 60) return `~${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `~${h} h ${m} min` : `~${h} h`;
}
