// Road Ahead: the shortlist. The few listings most likely to be the next
// house, as the owner asked for it - a name, a link, a description and a
// price, and nothing else. The order is worked out (page/shortlist.js);
// the Register below has every figure. Returns markup; the page wires
// the clicks.
import { escape, money } from '../../core/format.js';
import { shortlist } from '../../engine/road-ahead/page/shortlist.js';

function priceHtml(s) {
  const listed = s.price ? `${escape(money(s.price.amount))} <span class="rd-quiet">${escape(s.price.kind)}</span>` : '—';
  const likely = s.likely != null && s.likely !== s.price?.amount
    ? `<br><span class="rd-quiet">likely ${escape(money(s.likely))}</span>` : '';
  return `${listed}${likely}`;
}

const rowHtml = (s) => `<tr role="row">
    <th scope="row" role="rowheader" class="rd-short__name"><button type="button" class="rd-open" data-short="${escape(s.code)}">${escape(s.name)}</button></th>
    <td role="cell" class="rd-short__go">${s.link
    ? `<a class="rd-short__link" href="${escape(s.link.href)}" rel="noopener noreferrer" target="_blank">${escape(s.link.label)}</a>` : '—'}</td>
    <td role="cell" class="rd-short__desc">${escape(s.description || '—')}${s.sale ? `<br><span class="rd-quiet">${escape(s.sale)}</span>` : ''}</td>
    <td role="cell" class="num rd-short__price">${priceHtml(s)}</td>
  </tr>`;

/**
 * @param {Array<object>} rows registerRows()
 * @param {object} data loadRoadAhead(): its auction houses name each auction
 * @param {string} today London's today
 */
export function shortlistHtml(rows, data, today) {
  const { rows: list, more } = shortlist(rows, today, { houses: data.houses ?? [] });
  if (!list.length) return '<p class="empty">Nothing on your list is on the market just now.</p>';
  // The roles are stated, not left to the element: on a phone the rows
  // are laid out as blocks, and some browsers then stop calling it a table.
  return `<div class="table-wrap"><table class="table rd-short" role="table">
      <caption class="visually-hidden">Your list, still on the market, likeliest first</caption>
      <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Name</th><th scope="col" role="columnheader">Link</th>
        <th scope="col" role="columnheader">Description</th><th scope="col" role="columnheader" class="num">Price</th></tr></thead>
      <tbody role="rowgroup">${list.map(rowHtml).join('')}</tbody>
    </table></div>
    <p class="rd-quiet">The listings you are chasing that are still on the market, likeliest first: how far along you
      are, then what the money says under the scenario in view (in reach before a stretch, over budget last), then your
      favourites, then the soonest date.${more ? ` ${more} more in the Register.` : ''} A guide is where an auction
      starts, not where it ends; the likely price is the model's estimate.</p>`;
}
