// Roadmap. The same rows as the backlog, banded by horizon - one table,
// many projections, so moving work between bands is a field edit and
// never a copy.
import { requireAuth } from '../core/auth.js';
import { mountShell, render, confidenceBanner } from '../core/shell.js';
import { load, byHorizon, confidenceSummary } from '../core/store.js';
import { itemCard, emptyState } from '../core/page.js';
import { HORIZON_LABEL, escape } from '../core/format.js';

const user = await requireAuth();
if (!user) throw new Error('redirecting to login');

mountShell('roadmap.html', { user });

const d = await load();
const bands = ['now', 'next', 'later', 'someday'];

render('[data-page-root]', `
  ${confidenceBanner(confidenceSummary(d))}
  <div class="bands">
    ${bands.map((h) => {
      const rows = byHorizon(d, h);
      return `<section class="band">
        <div class="band__head">
          <h2 class="band__title">${escape(HORIZON_LABEL[h])}</h2>
          <span class="band__count num">${rows.length}</span>
        </div>
        ${rows.length
          ? rows.map((i) => itemCard(i, { showFunding: h !== 'someday' })).join('')
          : emptyState('Nothing here.')}
      </section>`;
    }).join('')}
  </div>
`);
