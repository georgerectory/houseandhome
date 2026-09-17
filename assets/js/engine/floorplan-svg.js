// floorplan-svg.js - draw one level as SVG. Data in, string out. No DOM.
//
// A thin re-export. The drawing outgrew one file the moment walls
// acquired thickness and doors acquired swings, so it is split by what
// each part draws - walls, openings, furniture, annotation, clearance -
// behind this shim, so no import path anywhere had to change.
//
// The whole drawing works in METRES: the viewBox is the building's own
// extent, so an x of 3.5 in the model is an x of 3.5 in the picture and
// there is no scale factor to get wrong.

export { levelSvg, GUTTER } from './floorplan-svg/level.js';
export { wallPolygon, openingFrame, fitSize } from './floorplan-svg/geom.js';
