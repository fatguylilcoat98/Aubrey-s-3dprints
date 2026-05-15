/**
 * PrintBuddy — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * For Aubrey, with love
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 *
 * Parametric templates. Each one builds a watertight, print-ready solid
 * fully in the browser with @jscad/modeling. Text is added with three.js
 * TextGeometry and merged in. All units are millimetres, Z is up.
 */

import {
  primitives,
  booleans,
  transforms,
  extrusions,
} from '@jscad/modeling';
import { jscadToGeometry, makeTextGeometry, mergeGeoms } from './viewer.js';

const { cuboid, roundedCuboid, cylinder, polygon, star } = primitives;
const { subtract, union } = booleans;
const { translate, rotateX, rotateZ } = transforms;
const { extrudeLinear } = extrusions;

const g = (geom) => jscadToGeometry(geom);

/* ---- small shared param helpers ---------------------------------- */
const N = (key, label, def, min, max, step = 1, unit = 'mm') => ({
  key, label, type: 'number', default: def, min, max, step, unit,
});
const R = (key, label, def, min, max, step = 1, unit = '') => ({
  key, label, type: 'range', default: def, min, max, step, unit,
});
const T = (key, label, def) => ({ key, label, type: 'text', default: def });
const C = (key, label, def) => ({ key, label, type: 'checkbox', default: def });
const S = (key, label, def, options) => ({
  key, label, type: 'select', default: def, options,
});

/* ================================================================== */
/*  TEMPLATES                                                          */
/* ================================================================== */
export const TEMPLATES = [
  /* 1 — Name plate / desk sign ------------------------------------- */
  {
    id: 'nameplate',
    name: 'Name Plate / Desk Sign',
    desc: 'Raised text on a plate, flat or with a stand',
    supports: (p) => (p.withStand ? 'maybe' : 'no'),
    params: [
      T('text', 'Text', 'AUBREY'),
      R('size', 'Text size', 16, 8, 40, 1, 'mm'),
      N('pad', 'Edge padding', 8, 2, 30, 1),
      N('thick', 'Plate thickness', 4, 2, 12, 1),
      C('withStand', 'Add a stand', true),
    ],
    build(p, { font }) {
      const size = +p.size;
      const txt = makeTextGeometry(font, p.text || 'NAME', size, Math.max(1.2, size * 0.18));
      txt.computeBoundingBox();
      const tb = txt.boundingBox;
      const tw = tb.max.x - tb.min.x;
      const th = tb.max.y - tb.min.y;
      const pad = +p.pad;
      const plateW = tw + pad * 2;
      const plateD = th + pad * 2;
      const plateH = +p.thick;

      const plate = roundedCuboid({
        size: [plateW, plateD, plateH],
        roundRadius: Math.min(3, plateH / 2 - 0.5),
        segments: 16,
        center: [0, 0, plateH / 2],
      });
      const parts = [g(plate)];

      // Lay text onto the top face (text was modelled in XY, extruded +Z).
      txt.translate(0, 0, plateH);
      parts.push(txt);

      if (p.withStand) {
        const legT = 4;
        const leg = cuboid({
          size: [plateW * 0.7, legT, plateD * 0.9],
          center: [0, -plateD / 2 + legT / 2, plateD * 0.45],
        });
        const angled = rotateX(-Math.PI / 7, leg);
        parts.push(g(translate([0, -plateD * 0.18, 0], angled)));
      }
      return mergeGeoms(parts);
    },
  },

  /* 2 — Custom box / tray ------------------------------------------ */
  {
    id: 'box',
    name: 'Custom Box / Tray',
    desc: 'Open-top box with adjustable walls',
    supports: () => 'no',
    params: [
      N('w', 'Width', 80, 15, 220, 1),
      N('d', 'Depth', 60, 15, 220, 1),
      N('h', 'Height', 35, 8, 150, 1),
      R('wall', 'Wall thickness', 2, 1, 6, 0.2, 'mm'),
      R('floor', 'Floor thickness', 2, 1, 8, 0.2, 'mm'),
    ],
    build(p) {
      const { w, d, h } = { w: +p.w, d: +p.d, h: +p.h };
      const wall = +p.wall;
      const floor = +p.floor;
      const outer = cuboid({ size: [w, d, h], center: [0, 0, h / 2] });
      const cavity = cuboid({
        size: [w - wall * 2, d - wall * 2, h - floor + 1],
        center: [0, 0, floor + (h - floor + 1) / 2],
      });
      return g(subtract(outer, cavity));
    },
  },

  /* 3 — Cable organizer ------------------------------------------- */
  {
    id: 'cables',
    name: 'Cable Organizer',
    desc: 'Weighted base with U-shaped cable slots',
    supports: () => 'no',
    params: [
      R('slots', 'Number of slots', 4, 1, 10, 1),
      N('slotDia', 'Slot diameter', 6, 3, 16, 0.5),
      N('len', 'Base length', 90, 30, 220, 1),
      N('baseH', 'Base height', 14, 8, 40, 1),
    ],
    build(p) {
      const slots = Math.round(+p.slots);
      const dia = +p.slotDia;
      const len = +p.len;
      const baseH = +p.baseH;
      const depth = dia + 14;
      const base = roundedCuboid({
        size: [len, depth, baseH],
        roundRadius: 3,
        segments: 16,
        center: [0, 0, baseH / 2],
      });
      const cuts = [];
      const span = len - 16;
      for (let i = 0; i < slots; i++) {
        const x = slots === 1 ? 0 : -span / 2 + (span * i) / (slots - 1);
        // round-bottomed slot opening from the top
        const slot = cylinder({
          radius: dia / 2,
          height: depth + 2,
          segments: 28,
          center: [x, 0, baseH],
        });
        cuts.push(rotateX(Math.PI / 2, slot));
        cuts.push(
          cuboid({ size: [dia, depth + 2, dia], center: [x, 0, baseH + dia / 2] })
        );
      }
      return g(subtract(base, union(cuts)));
    },
  },

  /* 4 — Wall hook -------------------------------------------------- */
  {
    id: 'hook',
    name: 'Wall Hook',
    desc: 'J or L hook with screw holes',
    supports: (p) => (p.shape === 'J' ? 'yes' : 'maybe'),
    params: [
      S('shape', 'Shape', 'J', ['J', 'L']),
      N('reach', 'Hook reach', 38, 18, 90, 1),
      N('thick', 'Material thickness', 7, 4, 16, 1),
      N('holeSpacing', 'Screw hole spacing', 32, 16, 80, 1),
      T('label', 'Plate text (optional)', ''),
    ],
    build(p, { font }) {
      const reach = +p.reach;
      const thick = +p.thick;
      const spacing = +p.holeSpacing;
      const plateD = 6; // depth into the wall (Y, thin)
      const plateW = Math.max(thick + 14, 24);
      const plateH = spacing + 26;

      // Plate stands in the X/Z plane; Y is "into the wall".
      const plate = roundedCuboid({
        size: [plateW, plateD, plateH],
        roundRadius: 2,
        segments: 12,
        center: [0, plateD / 2, plateH / 2],
      });
      const holes = [-spacing / 2, spacing / 2].map((dz) =>
        translate(
          [0, plateD / 2, plateH / 2 + dz],
          rotateX(Math.PI / 2, cylinder({
            radius: 2.4, height: plateD + 4, segments: 20, center: [0, 0, 0],
          }))
        )
      );
      let solid = subtract(plate, union(holes));

      // Arm projects away from the wall (+Y) near the top.
      const armZ = plateH - thick / 2 - 4;
      const arm = cuboid({
        size: [thick, reach, thick],
        center: [0, plateD + reach / 2, armZ],
      });
      solid = union(solid, arm);

      if (p.shape === 'J') {
        const curlLen = Math.max(thick * 2, reach * 0.4);
        const curl = cuboid({
          size: [thick, thick, curlLen],
          center: [0, plateD + reach - thick / 2, armZ - curlLen / 2],
        });
        solid = union(solid, curl);
      }

      const parts = [g(solid)];
      if (p.label && p.label.trim()) {
        const ts = Math.min(plateW * 0.6, plateH * 0.16);
        const txt = makeTextGeometry(font, p.label.trim(), ts, 1.5);
        // Stand the lettering up and lift it off the plate front face (+Y).
        txt.rotateX(Math.PI / 2);
        txt.translate(0, plateD + 1.5, plateH * 0.32);
        parts.push(txt);
      }
      return mergeGeoms(parts);
    },
  },

  /* 5 — Keychain text tag ----------------------------------------- */
  {
    id: 'keytag',
    name: 'Keychain Text Tag',
    desc: 'Text tag with optional ring hole',
    supports: () => 'no',
    params: [
      T('text', 'Text', 'AUBREY'),
      R('size', 'Text size', 12, 6, 26, 1, 'mm'),
      N('thick', 'Tag thickness', 4, 2, 8, 0.5),
      C('ring', 'Ring hole', true),
    ],
    build(p, { font }) {
      const size = +p.size;
      const txt = makeTextGeometry(font, p.text || 'TAG', size, +p.thick * 0.55);
      txt.computeBoundingBox();
      const tb = txt.boundingBox;
      const tw = tb.max.x - tb.min.x;
      const th = tb.max.y - tb.min.y;
      const pad = size * 0.45;
      const baseT = +p.thick;
      const ringR = th / 2 + pad;

      let base = roundedCuboid({
        size: [tw + pad * 2, th + pad * 2, baseT],
        roundRadius: Math.min(4, th / 2),
        segments: 16,
        center: [0, 0, baseT / 2],
      });
      if (p.ring) {
        const cx = -(tw / 2 + pad) - ringR * 0.4;
        const knob = cylinder({ radius: ringR, height: baseT, segments: 36, center: [cx, 0, baseT / 2] });
        const hole = cylinder({ radius: ringR * 0.42, height: baseT + 2, segments: 28, center: [cx, 0, baseT / 2] });
        base = subtract(union(base, knob), hole);
      }
      txt.translate(0, 0, baseT);
      return mergeGeoms([g(base), txt]);
    },
  },

  /* 6 — Pen / pencil holder --------------------------------------- */
  {
    id: 'penholder',
    name: 'Pen / Pencil Holder',
    desc: 'Round holder, optional vent pattern',
    supports: () => 'no',
    params: [
      N('dia', 'Inner diameter', 70, 30, 140, 1),
      N('height', 'Height', 95, 40, 200, 1),
      R('wall', 'Wall thickness', 3, 2, 6, 0.5, 'mm'),
      C('vents', 'Honeycomb / vent pattern', true),
    ],
    build(p) {
      const innerR = +p.dia / 2;
      const wall = +p.wall;
      const h = +p.height;
      const outerR = innerR + wall;
      const floor = 3;
      const outer = cylinder({ radius: outerR, height: h, segments: 64, center: [0, 0, h / 2] });
      const bore = cylinder({ radius: innerR, height: h, segments: 64, center: [0, 0, floor + (h - floor) / 2 + 0.5] });
      let solid = subtract(outer, bore);

      if (p.vents) {
        const cuts = [];
        const rows = Math.max(2, Math.floor((h - floor - 18) / 16));
        const cols = Math.max(6, Math.round((2 * Math.PI * outerR) / 16));
        for (let r = 0; r < rows; r++) {
          const z = floor + 12 + r * 16;
          if (z > h - 10) break;
          const offset = r % 2 ? Math.PI / cols : 0;
          for (let c = 0; c < cols; c++) {
            const a = offset + (c / cols) * Math.PI * 2;
            const slot = cylinder({ radius: 4, height: wall * 4, segments: 6, center: [0, 0, 0] });
            const placed = translate(
              [Math.cos(a) * outerR, Math.sin(a) * outerR, z],
              rotateX(Math.PI / 2, rotateZ(-a + Math.PI / 2, slot))
            );
            cuts.push(placed);
          }
        }
        solid = subtract(solid, union(cuts));
      }
      return g(solid);
    },
  },

  /* 7 — Business card holder -------------------------------------- */
  {
    id: 'cardholder',
    name: 'Business Card Holder',
    desc: 'Angled desk stand for a card stack',
    supports: () => 'maybe',
    params: [
      N('cardW', 'Card width', 89, 50, 120, 1),
      N('cardH', 'Card height', 51, 30, 90, 1),
      R('angle', 'Display angle', 20, 5, 45, 1, '°'),
      N('stackT', 'Card stack thickness', 10, 3, 30, 1),
    ],
    build(p) {
      const cw = +p.cardW;
      const ch = +p.cardH;
      const ang = (+p.angle * Math.PI) / 180;
      const stack = +p.stackT;
      const wall = 3;
      const baseDepth = ch * Math.cos(ang) * 0.7 + stack + 14;
      const base = roundedCuboid({
        size: [cw + 16, baseDepth, 8],
        roundRadius: 3, segments: 16,
        center: [0, 0, 4],
      });
      // back rest, tilted back by `angle`
      const backH = ch * 0.92;
      let back = cuboid({ size: [cw + 16, wall, backH], center: [0, 0, backH / 2] });
      back = rotateX(ang, back);
      back = translate([0, -baseDepth / 2 + wall + 2, 6], back);
      // front lip to hold the stack
      const lip = cuboid({
        size: [cw + 16, wall, 16],
        center: [0, baseDepth / 2 - wall - 2, 12],
      });
      return g(union(base, back, lip));
    },
  },

  /* 8 — Phone stand ----------------------------------------------- */
  {
    id: 'phonestand',
    name: 'Phone Stand',
    desc: 'Adjustable-angle phone cradle',
    supports: () => 'maybe',
    params: [
      N('phoneW', 'Phone width', 76, 55, 100, 1),
      N('phoneT', 'Phone thickness', 11, 6, 22, 0.5),
      R('angle', 'Viewing angle', 60, 35, 80, 1, '°'),
      N('depth', 'Base depth', 90, 60, 140, 1),
    ],
    build(p) {
      const pw = +p.phoneW;
      const pt = +p.phoneT;
      const ang = (+p.angle * Math.PI) / 180;
      const depth = +p.depth;
      const wall = 6;
      const W = pw + 10;

      const base = roundedCuboid({
        size: [W, depth, 8], roundRadius: 3, segments: 16, center: [0, 0, 4],
      });
      const backLen = depth * 0.95;
      let back = cuboid({ size: [W, wall, backLen], center: [0, 0, backLen / 2] });
      back = rotateX(Math.PI / 2 - ang, back);
      back = translate([0, depth * 0.12, 6], back);

      // front ledge the phone leans against
      const ledge = cuboid({ size: [W, pt + wall, 22], center: [0, -depth / 2 + (pt + wall) / 2 + 6, 14] });
      const lip = cuboid({ size: [W, wall, 24], center: [0, -depth / 2 + 6, 18] });
      // charging-cable pass-through
      const slot = cylinder({ radius: 7, height: 40, segments: 28, center: [0, -depth / 2 + 12, 6] });
      const cradle = subtract(union(base, back, ledge, lip), rotateX(Math.PI / 2, slot));
      return g(cradle);
    },
  },

  /* 9 — Simple ornament ------------------------------------------- */
  {
    id: 'ornament',
    name: 'Simple Ornament',
    desc: 'Star, heart, or snowflake — flat or 3D',
    supports: () => 'no',
    params: [
      S('shape', 'Shape', 'Star', ['Star', 'Heart', 'Snowflake']),
      N('size', 'Size', 60, 25, 140, 1),
      N('thick', 'Thickness', 6, 2, 20, 1),
      C('hangHole', 'Hanging hole', true),
    ],
    build(p) {
      const size = +p.size;
      const thick = +p.thick;
      let shape2d;
      if (p.shape === 'Star') {
        shape2d = star({ vertices: 5, outerRadius: size / 2, innerRadius: size / 4.6 });
      } else if (p.shape === 'Heart') {
        const pts = [];
        const s = size / 32;
        for (let i = 0; i <= 60; i++) {
          const t = (i / 60) * Math.PI * 2;
          const x = 16 * Math.pow(Math.sin(t), 3);
          const y =
            13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
          pts.push([x * s, y * s]);
        }
        shape2d = polygon({ points: pts });
      } else {
        shape2d = star({ vertices: 6, outerRadius: size / 2, innerRadius: size / 7 });
      }
      let solid = extrudeLinear({ height: thick }, shape2d);
      if (p.hangHole) {
        const hole = cylinder({
          radius: size * 0.045 + 1,
          height: thick + 2,
          segments: 24,
          center: [0, size * 0.46, thick / 2],
        });
        solid = subtract(solid, hole);
      }
      return g(solid);
    },
  },
];

export const getTemplate = (id) => TEMPLATES.find((t) => t.id === id);
