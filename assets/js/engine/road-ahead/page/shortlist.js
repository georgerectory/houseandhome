// shortlist.js - the few listings most likely to be the next house: the
// owner's own list, still on the market, likeliest first, each as a name,
// a link, a description and a price. Pure: no DOM.
//
// "Likeliest" is worked out, never typed, in this order:
//   1. how far along the owner is with it: an offer before a viewing;
//   2. what the money says now, under the scenario in view: a verdict in
//      reach before a stretch, over budget last (the register's order);
//   3. the owner's own reaction: a favourite, then one they liked;
//   4. the soonest date: an auction before a private sale;
// then the code, so the order never shuffles.

import { FILTERS, dayName } from './state.js';
import { STATUS_ORDER, verdictRank } from './model.js';

const pursued = FILTERS.find((f) => f.key === 'chasing').test;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** 0 for a favourite, 1 for one the owner liked, 2 otherwise. */
export function reactionRank(reaction) {
  if (/favourite/i.test(reaction ?? '')) return 0;
  return /^liked?\b/i.test(reaction ?? '') ? 1 : 2;
}

/** Where a link goes, as a person reads it: the site, and whether it is a PDF. */
export function linkLabel(href) {
  try {
    const u = new URL(href);
    return `${u.hostname.replace(/^www\./, '')}${/\.pdf$/i.test(u.pathname) ? ' (PDF)' : ''}`;
  } catch {
    return String(href);
  }
}

/** How the listing is being sold, and how far from home: one line. */
function saleText(row, houses, year) {
  const house = houses.find((h) => h.code === row.house_code)?.name ?? null;
  const at = [house, row.lot ? `lot ${row.lot}` : null].filter(Boolean).join(' ');
  const how = row.sale_method === 'auction' || row.auction_on
    ? `Auction${row.auction_on ? ` ${dayName(row.auction_on, year)}` : ''}${at ? `, ${at}` : ''}`
    : row.sale_method === 'mmoa' ? 'Modern method of auction'
      : row.sale_method === 'private' ? 'Private sale' : null;
  const far = row.minutes_from_home != null ? `${row.minutes_from_home} min from home` : null;
  return [how, far].filter(Boolean).join(' · ');
}

/** The listed price: an auction's guide, else the asking price. */
function listedPrice(row) {
  if (row.guide_price != null) return { amount: Number(row.guide_price), kind: 'guide' };
  if (row.asking_price != null) return { amount: Number(row.asking_price), kind: 'asking' };
  return null;
}

/**
 * The shortlist from the register as the page has worked it out.
 * @param {Array<object>} rows registerRows(): each { row, L, now }
 * @param {string} today London's today, YYYY-MM-DD
 * @param {{houses?: Array<{code:string, name:string}>, top?: number}} [opts]
 * @returns {{rows: Array<{code:string, name:string, link:{href:string,label:string}|null, description:string,
 *   sale:string, price:{amount:number, kind:string}|null, likely:number|null, grade:string|null}>, more:number}}
 */
export function shortlist(rows, today, { houses = [], top = 6 } = {}) {
  const going = rows.filter((x) => x.row.purpose !== 'benchmark' && pursued(x.row)
    && (x.row.auction_on == null || x.row.auction_on.slice(0, 10) >= today));
  const date = (x) => x.row.auction_on ?? '9999';
  going.sort((a, b) => cmp(STATUS_ORDER.indexOf(a.row.status), STATUS_ORDER.indexOf(b.row.status))
    || cmp(verdictRank(a.now?.grade), verdictRank(b.now?.grade))
    || cmp(reactionRank(a.row.reaction), reactionRank(b.row.reaction))
    || cmp(date(a), date(b)) || cmp(a.row.code, b.row.code));
  const year = Number(today.slice(0, 4));
  return {
    rows: going.slice(0, top).map((x) => ({
      code: x.row.code,
      name: x.row.name,
      link: x.row.links?.length ? { href: x.row.links[0], label: linkLabel(x.row.links[0]) } : null,
      description: x.row.property_type ?? '',
      sale: saleText(x.row, houses, year),
      price: listedPrice(x.row),
      likely: x.L?.likely_buy ?? null,
      grade: x.now?.grade ?? null,
    })),
    more: Math.max(0, going.length - top),
  };
}
