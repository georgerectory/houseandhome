// survey.js - the model checked against the documents it came from.
//
// A thin re-export. The work is split by what it checks, because each
// part is a different kind of question and each was over four hundred
// lines' worth of answer:
//
//   dimensions  what a drawing SAID, against what the geometry IS
//   integrity   whether the geometry is a building at all
//   clearance   whether you can move around in it
//   elevation   what it looks like from outside, drawn from the model
//
// Every one of them is pure, and the page and the test gate call the
// same functions, so the browser and CI cannot reach different verdicts
// about the same house.

export { auditDimensions, auditSummary, auditAreas } from './survey/dimensions.js';
export { auditIntegrity, integritySummary, openingProbe } from './survey/integrity.js';
export { clearanceReport, swingRect, WALKING_WIDTH, CELL } from './survey/clearance.js';
export { elevationSvg, SIDES } from './survey/elevation.js';
