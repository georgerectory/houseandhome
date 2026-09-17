// building-data.js - fetch the building, a stage of it, and a variant.
//
// The geometry is REPO CONTENT, not household data: it is drawing data
// read off a public listing, it has to be unit-testable from disk with
// no authentication, and git is a better version history for it than a
// table would be. Nothing private is in it.
//
// Three fetches, not one: the manifest says what exists, a stage carries
// the structure, a variant carries the furniture. A reader who only
// wants the empty shell never downloads the furnished one.

import { composeBuilding } from '../engine/building.js';

const BUILDING = '48-ameysford-road';
const base = (id = BUILDING) =>
  new URL(`../../../data/buildings/${id}/`, import.meta.url);

const json = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);

const cache = new Map();
const once = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};

export const loadManifest = (id = BUILDING) =>
  once(`index:${id}`, () => json(new URL('index.json', base(id))));

export const loadProperty = (id = BUILDING) =>
  once(`building:${id}`, () => json(new URL('building.json', base(id))));

const loadPart = (file, id = BUILDING) =>
  once(`${id}:${file}`, () => json(new URL(file, base(id))));

/** Which stage and variant to open on: what was asked for, then what was
 *  last looked at, then the building's own default. A stored id that no
 *  longer exists is ignored rather than drawing nothing. */
export function resolveSelection(manifest, wantStage, wantVariant) {
  const stages = manifest?.stages ?? [];
  if (!stages.length) return { stage: null, variant: null };
  const stage = stages.find((s) => s.id === wantStage)
    ?? stages.find((s) => s.id === manifest.defaultStage)
    ?? stages[0];
  const variant = stage.variants.find((v) => v.id === wantVariant)
    // Falling back to the empty shell rather than to a furnished one is
    // deliberate: an arrangement nobody chose is a claim about the house.
    ?? stage.variants.find((v) => !v.furnitureCount)
    ?? stage.variants[0]
    ?? null;
  return { stage, variant };
}

/**
 * One building, composed and ready for the renderers.
 *
 * Returns the raw stage and variant alongside the composed object, so a
 * caller that wants to diff two stages can have both without fetching
 * either of them twice.
 */
export async function loadComposed(stageId, variantId, id = BUILDING) {
  const [manifest, property] = await Promise.all([loadManifest(id), loadProperty(id)]);
  if (!manifest || !property) return null;
  const { stage, variant } = resolveSelection(manifest, stageId, variantId);
  if (!stage) return null;
  const [stageData, variantData] = await Promise.all([
    loadPart(stage.file, id),
    variant ? loadPart(variant.file, id) : Promise.resolve(null),
  ]);
  if (!stageData) return null;
  return {
    manifest,
    property,
    entry: stage,
    variantEntry: variant,
    stage: stageData,
    variant: variantData,
    composed: composeBuilding(property, stageData, variantData),
  };
}

/** Another stage's geometry, for drawing underneath or diffing against.
 *  Used by compare mode and by the stage diff on the Survey view. */
export async function loadStageOnly(stageId, id = BUILDING) {
  const manifest = await loadManifest(id);
  const entry = manifest?.stages.find((s) => s.id === stageId);
  return entry ? loadPart(entry.file, id) : null;
}
