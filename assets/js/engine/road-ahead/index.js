// index.js - Road Ahead's engine, one import away.
//
// Pure functions only: no DOM, no fetch, no storage, no owner's figures.
// The page, the tests, the checksum gate and the command line all run
// the same modules, so a number on the page is a number the tests have
// seen.

export * from './money.js';
export { simulate } from './simulate.js';
export { runRoute } from './ladder.js';
export * from './roads.js';
export * from './sweep.js';
export * from './appraise.js';
export * from './fit.js';
export { focusRoad } from './focus.js';
export * from './provenance.js';
export * from './sensitivity.js';
export * from './registry.js';
export * from './params.js';
