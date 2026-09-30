// Road Ahead: the roads side by side. The forever-home budget with where
// the other headline scenarios would put it, every road on one time
// axis, and each road's cash on one shared scale with the floor the
// works stop at. Returns markup.
import { escape } from '../../core/format.js';
import { kilo, seriesOf } from '../../engine/road-ahead/charts/scale.js';
import { budgetBars } from '../../engine/road-ahead/charts/bars.js';
import { roadPhases, timeline } from '../../engine/road-ahead/charts/timeline.js';
import { cashSpark } from '../../engine/road-ahead/charts/spark.js';
import { monthIndex, addMonths, parseYm } from '../../engine/road-ahead/money.js';

/**
 * @param {object} ctx resolve() for the scenario in view
 * @param {Array<object>} runs runAll(ctx)
 * @param {Array<{key:string, name:string, heads:Map}>} cmp compare()
 */
export function compareHtml(ctx, runs, cmp) {
  const series = seriesOf(ctx.roads);
  const others = cmp.filter((c) => c.key !== ctx.key);
  const bars = budgetBars(runs.map(({ road, head }) => ({
    code: road.code, name: road.name, series: series.get(road.code), value: head.forever_today,
    markers: others.map((c) => ({ key: c.key, label: c.name, value: c.heads.get(road.code)?.forever_today ?? null })),
  })), {
    caption: `The forever-home budget in today's money under ${ctx.row.name}, with the what-ifs; beneath each bar, the same road under the other headline scenarios.`,
    target: ctx.P['targets.endgame_today_target'] ?? null, targetLabel: 'The target',
  });

  // The axis runs from the model's start to a year after the last forever home.
  const lastForever = runs.map((r) => r.head.forever_when).filter(Boolean).map(parseYm)
    .reduce((a, b) => (monthIndex(b) > monthIndex(a) ? b : a), ctx.P['timeline.start']);
  const end = addMonths(lastForever, 12);
  const span = { start: ctx.P['timeline.start'], familyUntil: ctx.P['timeline.family_until'], end };
  const lanes = ctx.roads.map((r) => ({ code: r.code, name: r.name, series: series.get(r.code), phases: roadPhases(r, span) }));
  const tl = timeline(lanes, { start: span.start, end, caption: 'Each road over time: the family stay, renting, each house kept and the forever home.' });

  const all = runs.flatMap((r) => r.result.trace.map(([, c]) => c));
  const range = [Math.min(0, ...all), Math.max(...all)];
  const floor = ctx.P['cash.works_buffer'];
  const multiples = `<figure class="rd-multi">
    <figcaption>Cash month by month, on one scale for every road. The dashed line is the ${escape(kilo(floor))} the works never
      dig below; the dot is the lowest month.</figcaption>
    <ul class="rd-multi__grid">${runs.map(({ road, result, head }) => `<li class="rd-multi__cell rd-s${series.get(road.code)}">
      <span class="rd-multi__name"><span class="rd-code">${escape(road.code)}</span> lowest ${escape(kilo(head.min_cash))}</span>
      ${cashSpark(result.trace, { floor, range, label: `${road.code} ${road.name}` })}
    </li>`).join('')}</ul>
  </figure>`;
  return `${bars}${tl}${multiples}`;
}
