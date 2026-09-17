// floorplan-svg/clearance.js - the space, shown rather than described.
//
// An optional overlay. It tints each room by whether you can actually
// cross it, and draws the floor each item needs kept in front of it, so
// "will a table and chairs fit" is answered by looking rather than by
// reading a number in a table.

import { roomsOn, roomRects, furnitureOn } from '../floorplan.js';
import { clearanceReport } from '../survey/clearance.js';
import { n } from './geom.js';
import { escape } from '../../core/format.js';

export function clearanceHtml(building, levelId) {
  const report = new Map(clearanceReport(building, levelId).map((r) => [r.room, r]));
  const rooms = roomsOn(building, levelId).map((room) => {
    const r = report.get(room.id);
    if (!r) return '';
    const shapes = roomRects(room).map(([x1, y1, x2, y2]) =>
      `<rect x="${n(x1)}" y="${n(y1)}" width="${n(x2 - x1)}" height="${n(y2 - y1)}"></rect>`).join('');
    const said = r.routeWidthM == null
      ? 'no doorway to measure a route from'
      : `${r.routeWidthM}m route, ${r.requiredWidthM}m wanted; widest circle ${r.widestCircleM}m`;
    return `<g class="fp-clear fp-clear--${escape(r.status)}" data-room="${escape(room.id)}">
      ${shapes}<title>${escape(`${room.name}: ${said}`)}</title></g>`;
  }).join('');

  const zones = furnitureOn(building, levelId).flatMap((f) => {
    const c = f.clearance;
    if (!c) return [];
    const d = c.front ?? c.all;
    if (!d) return [];
    const [x1, y1, x2, y2] = f.rect;
    const face = f.facing ?? 's';
    const box = face === 'n' ? [x1, y1 - d, x2, y1]
      : face === 's' ? [x1, y2, x2, y2 + d]
        : face === 'w' ? [x1 - d, y1, x1, y2] : [x2, y1, x2 + d, y2];
    return [`<rect class="fp-zone" x="${n(box[0])}" y="${n(box[1])}"
      width="${n(box[2] - box[0])}" height="${n(box[3] - box[1])}"><title>${
  escape(`${f.name} needs ${d}m clear in front`)}</title></rect>`];
  }).join('');

  return `<g class="fp-clearance" aria-hidden="true">${rooms}${zones}</g>`;
}
