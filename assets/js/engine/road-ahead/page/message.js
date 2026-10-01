// message.js - what the page hands to Claude.
//
// The page never writes (RA-02). A what-if worth keeping, or the owner's
// view of a house the maths cannot see, becomes a message the page copies
// for the owner to send; Claude then records it with its reason, and it
// comes back to the page as data. Pure: no DOM.

import { money } from '../../../core/format.js';
import { showValue } from './state.js';

const targetName = (control) => (control.target.startsWith('var:') ? control.target.slice(4) : control.target);

/**
 * Ask Claude to save the page's what-ifs as a scenario.
 * @param {{key:string, name:string}} scenario the scenario the what-ifs sit on
 * @param {Array<{control:object, was:*, now:*}>} changes
 * @param {string} [link] the page's address with this state
 */
export function scenarioMessage(scenario, changes, link) {
  const lines = [
    'Please save these Road Ahead settings as a scenario. Suggest a name, and ask me what it is for.',
    `Start from: ${scenario.name} (${scenario.key})`,
    'Changes:',
    ...changes.map(({ control, was, now }) =>
      `- ${control.label} (${targetName(control)}): ${showValue(control, now)}, was ${showValue(control, was)}`),
    'These are what-ifs from the Road Ahead page; nothing has been saved yet.',
  ];
  if (link) lines.push(`The view: ${link}`);
  return lines.join('\n');
}

/**
 * Ask Claude to record the owner's judgement on a listing beside the maths.
 * @param {{code:string, name:string}} listing
 * @param {{walk_away_opt:number, bid_limit:number}} maths the computed figures now
 */
export function judgementMessage(listing, maths) {
  return [
    `Please record my judgement on ${listing.code}, ${listing.name}, beside the maths.`,
    `The maths says walk away at ${money(maths.walk_away_opt)}, with a bid limit of ${money(maths.bid_limit)}.`,
    'I would pay up to £____ (or £____ above the maths), because ____.',
    'Kind: emotional / personal / strategic / new information.',
    'Keep the computed figures as they are.',
  ].join('\n');
}

/**
 * Ask Claude to assess a listing by the protocol. The listing's text is
 * what the owner pasted: Claude cannot open the portals, and must not.
 * @param {string} pasted
 */
export function assessMessage(pasted) {
  const text = String(pasted ?? '').trim();
  return [
    'Please assess this listing for Road Ahead, following docs/road-ahead/ASSESS_PROPERTY.md.',
    'Search the register for it first; if it is new, give it the next L-code.',
    '',
    'The listing, as I pasted it:',
    text || '[paste the listing\'s text here]',
    '',
    'The floor plan is attached.',
    'My first reaction: ____',
  ].join('\n');
}

/** Ask Claude for a sit-down: the agenda, worked in its order. */
export function sitDownMessage() {
  return [
    'Let\'s sit down with Road Ahead and make it more accurate.',
    'Ground first: road_ahead_context, then road_ahead_agenda for my household.',
    'Work the agenda in its order (docs/road-ahead/CALIBRATION.md): the dated actions, the open questions, '
      + 'where the model and my records disagree, the figures to confirm first, my judgements due a second look, '
      + 'my words not yet taken in, and what has moved.',
    'One question at a time, as choices I can click. Write each answer as I give it and read it back.',
    'Lock nothing without my confirmation.',
  ].join('\n');
}

/**
 * Ask Claude to re-base the model to the owner's own records.
 * @param {{start:number[], model:number, ledger:number, asOf:string|null, thisMonth:number[]}} at
 *   the model's start month and cash, the trusted ledger's cash and its date, and this month
 */
export function rebaseMessage({ start, model, ledger, asOf, thisMonth }) {
  const month = (m) => (Array.isArray(m) ? `${m[0]}-${String(m[1]).padStart(2, '0')}` : '—');
  return [
    'Please re-base Road Ahead to my own records.',
    `The model starts in ${month(start)} with ${money(model)} in cash; my confirmed accounts say ${money(ledger)}`
      + `${asOf ? ` on ${asOf}` : ''}.`,
    'Follow "Re-basing to today" in docs/road-ahead/CALIBRATION.md: '
      + `timeline.start to ${month(thisMonth)} and cash.start_cash to my confirmed balance, each with its reason and source.`,
    'Then re-run the roads and show me every figure that moves by £1k or more. Accept the new runs only when I say so.',
  ].join('\n');
}
