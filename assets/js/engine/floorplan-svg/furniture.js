// floorplan-svg/furniture.js - what is in the room, at the size it
// really is.
//
// Every symbol is drawn INSIDE the rectangle the item carries, and that
// same rectangle is what the 3D model extrudes and what the clearance
// check measures around. So a sofa is 2.1m long in the drawing because
// it is 2.1m long in the data, not because it looked about right.
//
// A symbol is a hint, not a picture. The rectangle is the truth; the
// marks inside it are there so a bath is not mistaken for a bed.

import { furnitureOn } from '../floorplan.js';
import { n, fitSize } from './geom.js';
import { escape } from '../../core/format.js';

const line = (x1, y1, x2, y2, cls = 'fp-fdetail') =>
  `<line class="${cls}" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"></line>`;
const circle = (cx, cy, r, cls = 'fp-fdetail') =>
  `<circle class="${cls}" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"></circle>`;
const rect = (x, y, w, h, cls = 'fp-fdetail', rx = 0.03) =>
  `<rect class="${cls}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(rx)}"></rect>`;

/**
 * The detail inside one item's rectangle.
 *
 * `f` is the item's facing - the side a person stands at or the item
 * fronts onto - so a bed's pillows go at its head and a worktop's sink
 * is at its front, whichever way round the item has been placed.
 */
function detail(kind, [x1, y1, x2, y2], facing) {
  const w = x2 - x1;
  const h = y2 - y1;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const head = { n: [x1, y1, w, 0.22], s: [x1, y2 - 0.22, w, 0.22], w: [x1, y1, 0.22, h], e: [x2 - 0.22, y1, 0.22, h] };
  switch (kind) {
    case 'bed': {
      const [hx, hy, hw, hh] = head[{ n: 's', s: 'n', e: 'w', w: 'e' }[facing] ?? 'n'];
      // Pillows at the head, and a turned-back cover at the foot.
      return rect(hx, hy, hw, hh, 'fp-fdetail fp-fdetail--fill', 0.02)
        + (facing === 'n' || facing === 's'
          ? line(x1, facing === 'n' ? y1 + h * 0.62 : y2 - h * 0.62, x2, facing === 'n' ? y1 + h * 0.62 : y2 - h * 0.62)
          : line(facing === 'w' ? x1 + w * 0.62 : x2 - w * 0.62, y1, facing === 'w' ? x1 + w * 0.62 : x2 - w * 0.62, y2));
    }
    case 'sofa': {
      const back = head[{ n: 's', s: 'n', e: 'w', w: 'e' }[facing] ?? 'n'];
      return rect(back[0], back[1], back[2], back[3], 'fp-fdetail fp-fdetail--fill', 0.04);
    }
    case 'table':
      return rect(x1 + 0.08, y1 + 0.08, w - 0.16, h - 0.16, 'fp-fdetail', 0.04);
    case 'island':
      return rect(x1 + 0.06, y1 + 0.06, w - 0.12, h - 0.12, 'fp-fdetail', 0.02);
    case 'chair':
    case 'stool':
      return circle(cx, cy, Math.min(w, h) / 2 - 0.03);
    case 'worktop':
      return line(x1, y1 + h / 2, x2, y1 + h / 2);
    case 'hob':
      return [[-1, -1], [1, -1], [-1, 1], [1, 1]]
        .map(([sx, sy]) => circle(cx + sx * w * 0.2, cy + sy * h * 0.2, Math.min(w, h) * 0.13)).join('');
    case 'sink':
      return rect(x1 + 0.05, y1 + 0.05, w - 0.1, h * 0.6, 'fp-fdetail', 0.03)
        + circle(cx, y2 - h * 0.18, 0.04);
    case 'oven':
    case 'dishwasher':
    case 'washer':
    case 'dryer':
    case 'fridge':
      return rect(x1 + 0.05, y1 + 0.05, w - 0.1, h - 0.1, 'fp-fdetail', 0.02)
        + circle(cx, cy, Math.min(w, h) * 0.18);
    case 'wc':
      return rect(x1 + w * 0.2, y1, w * 0.6, h * 0.3, 'fp-fdetail', 0.02)
        + circle(cx, y1 + h * 0.62, Math.min(w, h) * 0.3);
    case 'basin':
      return circle(cx, cy, Math.min(w, h) * 0.38) + circle(cx, y1 + 0.06, 0.035);
    case 'bath':
      return rect(x1 + 0.09, y1 + 0.09, w - 0.18, h - 0.18, 'fp-fdetail', 0.12)
        + circle(w > h ? x1 + 0.22 : cx, w > h ? cy : y1 + 0.22, 0.04);
    case 'shower':
      return line(x1, y1, x2, y2) + line(x1, y2, x2, y1) + circle(cx, cy, 0.05);
    case 'wardrobe':
      return line(x1, y1 + h / 2, x2, y1 + h / 2) + line(cx, y1, cx, y2);
    case 'desk':
      return line(x1 + 0.06, y1 + h * 0.66, x2 - 0.06, y1 + h * 0.66);
    case 'shelf':
    case 'bench':
      return line(x1, y1 + h / 2, x2, y1 + h / 2);
    case 'stove':
      return rect(x1 + 0.06, y1 + 0.06, w - 0.12, h - 0.12, 'fp-fdetail', 0.02);
    default:
      return '';
  }
}

export function furnitureHtml(building, levelId, opts = {}) {
  const items = furnitureOn(building, levelId);
  if (!items.length) return '';
  const body = items.map((f) => {
    const [x1, y1, x2, y2] = f.rect;
    const w = x2 - x1;
    const h = y2 - y1;
    // A name is set along the item, not across it: a bench seat 0.37
    // wide and 1.6 long carries its name down the bench, the way both
    // source drawings do it. Sizing to the long side and then writing
    // across the short one is what produced "ningBench seat".
    const upright = h > w * 1.4;
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const size = fitSize(f.name, upright ? h : w, 0.17);
    const label = opts.labels !== false && size >= 0.11 && Math.min(w, h) > 0.24
      ? `<text class="fp-flabel" x="${n(cx)}" y="${n(cy + (upright ? 0 : size * 0.34))}"
          ${upright ? `transform="rotate(-90 ${n(cx)} ${n(cy)})" dy="${n(size * 0.34)}"` : ''}
          style="--fp-fs:${n(size)}px">${escape(f.name)}</text>` : '';
    return `<g class="fp-furniture fp-furniture--${escape(f.kind || 'other')}${f.fixed ? ' is-fixed' : ''}"
      data-furniture="${escape(f.id)}">
      <rect class="fp-fbox" x="${n(x1)}" y="${n(y1)}" width="${n(w)}" height="${n(h)}" rx="0.03"></rect>
      ${detail(f.kind, f.rect, f.facing ?? 's')}
      ${label}
      <title>${escape(`${f.name}: ${w.toFixed(2)} x ${h.toFixed(2)}m`)}</title>
    </g>`;
  }).join('');
  return `<g class="fp-furnishings">${body}</g>`;
}
