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
