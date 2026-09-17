// pages/house/survey-view.js - the model, checked against the drawings.
//
// This is the view that makes the rest of it trustworthy. Everything
// else on this page shows what the model says; this shows where the
// model and the documents it was built from DISAGREE, in millimetres,
// and it puts the worst of it at the top rather than at the bottom.
//
// Nothing here is computed in this file. Every figure comes from
// engine/survey.js, which the geometry gate also calls, so what you read
// on the page is what the build checked.

import {
  auditDimensions, auditSummary, auditAreas, auditIntegrity, integritySummary,
  clearanceReport, elevationSvg, SIDES,
} from '../../engine/survey.js';
import { stageDiff } from '../../engine/building.js';
import { escape, titleCase } from '../../core/format.js';
import { emptyState } from '../../core/page.js';

const STATUS = {
  ok: ['prov prov--confirmed', 'Exact'],
  tolerable: ['prov prov--unconfirmed', 'Within tolerance'],
  check: ['prov prov--stale', 'Needs checking'],
  missing: ['prov prov--stale', 'Nothing to compare'],
};

const num = (v) => (Array.isArray(v) ? v.map((x) => Number(x).toFixed(2)).join(' x ') : String(v));

function dimensionsTable(rows) {
  if (!rows.length) return emptyState('No source states a dimension for this stage.');
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th>What</th><th>Measurement</th><th class="num">Stated</th>
      <th class="num">Modelled</th><th class="num">Out by</th><th>Source</th><th>Verdict</th></tr></thead>
    <tbody>${rows.map((r) => {
      const [cls, label] = STATUS[r.status] ?? STATUS.missing;
      return `<tr>
        <td>${escape(r.subject)}</td>
        <td>${escape(r.label)}</td>
        <td class="num">${escape(num(r.stated))}</td>
        <td class="num">${escape(r.modelled == null ? '—' : num(r.modelled))}</td>
        <td class="num">${escape(r.deltaLabel ?? '—')}</td>
        <td>${escape(r.source)}</td>
        <td><span class="${cls}">${escape(label)}</span></td>
      </tr>${r.note ? `<tr class="fp-note-row"><td colspan="7">${escape(r.note)}</td></tr>` : ''}`;
    }).join('')}</tbody>
  </table></div>`;
}

function areasTable(areas) {
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th>Level</th><th>Room</th><th class="num">Clear size</th><th class="num">Area</th></tr></thead>
    <tbody>${areas.levels.flatMap((l) => l.rooms.map((r, i) => `<tr>
      <td>${i === 0 ? escape(l.name) : ''}</td>
      <td>${escape(r.name)}</td>
      <td class="num">${r.clearSize ? escape(`${r.clearSize[0].toFixed(2)} x ${r.clearSize[1].toFixed(2)} m`) : '—'}</td>
      <td class="num">${r.areaM2.toFixed(2)}</td>
    </tr>`)).join('')}
    <tr><td colspan="3"><strong>Rooms you can stand in</strong></td>
      <td class="num"><strong>${areas.roomsM2.toFixed(2)}</strong></td></tr>
    <tr><td colspan="3"><strong>Gross internal, counting partitions</strong></td>
      <td class="num"><strong>${areas.grossInternalM2.toFixed(2)} m2 / ${areas.grossInternalSqFt} sq ft</strong></td></tr>
    </tbody>
  </table></div>`;
}

function clearanceTable(b) {
  const rows = b.levels.flatMap((l) => clearanceReport(b, l.id).map((r) => ({ ...r, levelName: l.name })));
  const label = { ok: ['prov prov--confirmed', 'Room to move'], tight: ['prov prov--unconfirmed', 'Tight'], blocked: ['prov prov--stale', 'You cannot get across it'], 'no-doors': ['prov prov--stale', 'No doorway'] };
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th>Level</th><th>Room</th><th class="num">Free floor</th>
      <th class="num">Widest circle</th><th class="num">Route</th><th class="num">Wanted</th><th>Verdict</th></tr></thead>
    <tbody>${rows.map((r) => {
      const [cls, text] = label[r.status] ?? label.ok;
      return `<tr>
        <td>${escape(r.levelName)}</td><td>${escape(r.name)}</td>
        <td class="num">${r.freeAreaM2.toFixed(2)} m2</td>
        <td class="num">${r.widestCircleM.toFixed(2)} m</td>
        <td class="num">${r.routeWidthM == null ? '—' : `${r.routeWidthM.toFixed(2)} m`}</td>
        <td class="num">${r.requiredWidthM.toFixed(2)} m</td>
        <td><span class="${cls}">${escape(text)}</span></td>
      </tr>${r.clashes.map((c) => `<tr class="fp-note-row"><td colspan="7">${escape(c.message)}</td></tr>`).join('')}`;
    }).join('')}</tbody>
  </table></div>`;
}

function diffSection(b, parentStage) {
  if (!parentStage) return '';
  const d = stageDiff(parentStage, b);
  if (!d) return '';
  return `<section class="section">
    <div class="section__head"><h3>What the extension actually does</h3></div>
    <p class="lede">Measured off the two models, not described. These are the
      quantities behind the work, and because the geometry they come from is only
      researched, every one of them is provisional and may not price anything.</p>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Measure</th><th class="num">Amount</th></tr></thead>
      <tbody>
        <tr><td>Floor added</td><td class="num">${d.areaAddedM2.toFixed(2)} m2</td></tr>
        <tr><td>New outer wall, on plan</td><td class="num">${d.newExternalWallPlanM.toFixed(2)} m</td></tr>
        <tr><td>New outer wall, both storeys</td><td class="num">${d.newExternalWallM.toFixed(2)} m</td></tr>
        <tr><td>Wall coming down</td><td class="num">${d.demolitionWallM.toFixed(2)} m</td></tr>
        <tr><td>New roof</td><td class="num">${d.newRoofAreaM2.toFixed(2)} m2</td></tr>
        <tr><td>Rooms created</td><td class="num">${d.roomsCreated}</td></tr>
      </tbody>
    </table></div>
    ${d.roomsAdded.length ? `<p class="lede">New rooms: ${
  d.roomsAdded.map((r) => escape(r.name)).join(', ')}.</p>` : ''}
    ${d.roomsRenamed.length ? `<p class="lede">Renamed: ${
  d.roomsRenamed.map((r) => `${escape(r.from)} becomes ${escape(r.to)}`).join('; ')}.</p>` : ''}
  </section>`;
}

/**
 * The whole Survey view.
 *
 * `parentStage` is the stage this one derives from, or null. `sources`
 * is whether the original drawings are present locally for the overlay -
 * they are gitignored, because they are someone else's copyright and
 * they identify the property, so in CI and on the published site they
 * are simply absent and the view says so.
 */
export function surveyHtml(b, { parentStage = null } = {}) {
  const dims = auditDimensions(b);
  const summary = auditSummary(dims);
  const findings = auditIntegrity(b);
  const counts = integritySummary(findings);
  const high = (b.assumptions ?? []).filter((a) => a.severity === 'high');

  return `
  ${high.length ? `<div class="notice notice--warn" role="status">
    <span class="notice__title">What is not settled</span>
    <ul class="fp-list">${high.map((a) => `<li>${escape(a.note)}</li>`).join('')}</ul>
  </div>` : ''}

  <section class="section">
    <div class="section__head"><h3>Every figure a drawing states, against the model</h3>
      <span class="band__count num">${summary.ok} exact, ${summary.tolerable} close, ${summary.check} out</span></div>
    <p class="lede">This is the only check here that is not the model marking its own
      homework: each row is something a source printed, next to what the geometry
      computes. A residual is reported, never absorbed — if a drawing and the model
      disagree, both numbers stay on the page.</p>
    ${dimensionsTable(dims)}
  </section>

  <section class="section">
    <div class="section__head"><h3>Floor area, three ways</h3></div>
    <p class="lede">The rooms you can stand in, and the gross internal area measured
      inside the external walls — which counts the partitions, and is the figure an
      agent or a design study prints. Confusing the two is how a house gains ten
      square metres on paper.</p>
    ${areasTable(auditAreas(b))}
  </section>

  <section class="section">
    <div class="section__head"><h3>Is it a building</h3>
      <span class="band__count num">${counts.errors} errors, ${counts.warnings} warnings</span></div>
    <p class="lede">Rooms that do not overlap, a shell that closes, openings inside
      their walls, a floor with something under it, a stair that reaches the landing.
      The same checks the build gate runs.</p>
    ${findings.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Severity</th><th>Check</th><th>What</th></tr></thead>
      <tbody>${findings.map((f) => `<tr>
        <td>${escape(titleCase(f.severity))}</td>
        <td>${escape(f.id.replace(/-/g, ' '))}</td>
        <td>${escape(f.message)}</td>
      </tr>`).join('')}</tbody>
    </table></div>` : emptyState('Nothing to report: every check passes.')}
  </section>

  <section class="section">
    <div class="section__head"><h3>Room to move</h3></div>
    <p class="lede">The widest circle that fits in each room, and the widest route
      between its doorways once the furniture is in. Measured on a 5cm grid off the
      same rectangles the plan draws, so a 0.9m route on this table is a 0.9m route
      on the drawing.</p>
    ${clearanceTable(b)}
  </section>

  ${diffSection(b, parentStage)}

  <section class="section">
    <div class="section__head"><h3>From outside</h3></div>
    <p class="lede">Drawn from the model, not from a picture — so if an elevation
      disagrees with the design study or with the photograph, the model is wrong.
      Compare the chimneys, the window arrangement, the porch, and the height of the
      ridge above the eaves.</p>
    <div class="card-grid">
      ${SIDES.map((s) => `<article class="card">
        <div class="card__head"><h4 class="card__title">${escape(s.label)}</h4></div>
        ${elevationSvg(b, s.id)}
      </article>`).join('')}
    </div>
  </section>

  <section class="section">
    <div class="section__head"><h3>Where every figure came from</h3></div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Document</th><th>Trust</th><th>What it supplies</th></tr></thead>
      <tbody>${(b.sources ?? []).map((s) => `<tr>
        <td>${escape(s.label)}</td>
        <td><span class="prov prov--unconfirmed">${escape(titleCase(s.confidence))}</span></td>
        <td>${escape((s.supplies ?? []).join('; '))}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </section>

  ${b.stage.derivation?.length ? `<section class="section">
    <div class="section__head"><h3>The arithmetic, written down</h3></div>
    <p class="lede">Every derived number, with its working and what it left over, so
      it can be checked rather than believed.</p>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Question</th><th>Working</th><th>Answer</th><th class="num">Left over</th></tr></thead>
      <tbody>${b.stage.derivation.map((d) => `<tr>
        <td>${escape(d.question)}</td>
        <td class="num">${escape(d.working)}</td>
        <td>${escape(d.result)}</td>
        <td class="num">${d.residualMm ? `${d.residualMm} mm` : '0'}</td>
      </tr>${d.note ? `<tr class="fp-note-row"><td colspan="4">${escape(d.note)}</td></tr>` : ''}`).join('')}</tbody>
    </table></div>
  </section>` : ''}`;
}
