// Plan. The document, as a page.
//
// This is the page that replaces a PDF. The handbook, the checklists
// and the decisions live in the database and render here in reading
// order, so there is one copy of each and it cannot go stale in
// somebody's downloads folder. It prints: the browser's own Save as PDF
// produces the document, which is the only export worth maintaining.
//
// Today it renders the checklists. The handbook sections join it once
// they are ingested, above the checklists and under the same rules.
import { requireAuth } from '../core/auth.js';
import { mountShell, render } from '../core/shell.js';
import { load } from '../core/store.js';
import { emptyState } from '../core/page.js';
import { escape } from '../core/format.js';
import { checklistFor, totalItems, tierOf, TIER_LABEL } from '../engine/checklist.js';

const user = await requireAuth();
if (!user) throw new Error('redirecting to login');

mountShell('plan.html', { user });

const d = await load();
const sections = checklistFor(d.items ?? [], 'viewing');
const total = totalItems(sections);

/** One parsed block. Headings and notes are text; a list is tickable. */
const blockHtml = (b) => {
  if (b.kind === 'heading') return `<h4 class="ck-head">${escape(b.text)}</h4>`;
  if (b.kind === 'note') return `<p class="ck-note">${escape(b.text)}</p>`;
  return `<ul class="ck-list">${b.items.map((i) =>
    `<li class="ck-item${i.done ? ' is-done' : ''}">${escape(i.text)}</li>`).join('')}</ul>`;
};

const sectionHtml = (s, n) => {
  const tier = tierOf(s);
  return `<section class="ck-section" id="s${n}">
    <h3 class="ck-title">
      <span class="ck-num">${n}</span>
      ${escape(s.title)}
    </h3>
    ${tier ? `<p class="chip chip--accent">${escape(TIER_LABEL[tier] ?? tier)}</p>` : ''}
    ${s.summary ? `<p class="ck-why">${escape(s.summary)}</p>` : ''}
    ${s.blocks.map(blockHtml).join('')}
  </section>`;
};

const contents = sections.length > 1
  ? `<nav class="ck-toc" aria-label="Contents">
      <h3>Contents</h3>
      <ol>${sections.map((s, i) =>
        `<li><a href="#s${i + 1}">${escape(s.title)}</a>
         <span class="ck-count">${s.count}</span></li>`).join('')}</ol>
    </nav>`
  : '';

render('[data-page-root]', sections.length
  ? `<div class="doc">
      <p class="notice">
        <span class="notice__title">${total} things to check</span>
        Print this page, or use the browser's Save as PDF. Every figure
        here is drafted or researched unless it says otherwise, and none
        of it replaces a survey.
      </p>
      ${contents}
      ${sections.map((s, i) => sectionHtml(s, i + 1)).join('')}
    </div>`
  : emptyState('No checklist yet',
    'Checklist sections are work items tagged "viewing". Add some through a conversation with Claude.'));
