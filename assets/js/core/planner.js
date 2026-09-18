// planner.js - the 3D view.
//
// A thin re-export. The viewer outgrew one file the moment it gained a
// walkthrough, so it is split by what each part does - the scene and the
// two cameras, the input, the palette - behind this shim, so no import
// path anywhere had to change.
//
// three.js is 670KB, and making every visitor to the House page download
// it to look at a floor plan they can already read would be a poor
// trade. The page imports this module dynamically for that reason.

export { Planner, VIEWPOINTS } from './planner/viewer.js';
