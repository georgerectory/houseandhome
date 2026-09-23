// Plan. The document, as a page.
//
// This is the page that replaces a PDF. The handbook, the checklists
// and the decisions live in the database and render here in reading
// order, so there is one copy of each and it cannot go stale in
// somebody's downloads folder. It prints: the browser's own Save as PDF
// produces the document, which is the only export worth maintaining.
//
// It renders the handbook first, in page order, then the checklists.
// Both come from the same database under the same rules: every section
// carries the confidence it was ingested at and the date it was true,
// because a document is a snapshot of what was believed on a day and
// every figure inside it inherits that date.
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
const doc = (d.document_sections ?? []).slice()
  .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

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

// The handbook. Body text arrives as the PDF laid it out - one table
// cell per line - so it is rendered pre-wrapped rather than re-flowed
// into paragraphs, which would run the columns of a cost table into one
// unreadable sentence.
const docSectionHtml = (s) => `<section class="doc-sec" id="p${s.page_from}">
  <header class="doc-sec__head">
    ${s.part ? `<p class="doc-sec__part">${escape(s.part)}</p>` : ''}
    <h3>${escape(s.title)}</h3>
    <p class="doc-sec__meta">
      <span class="chip">Page ${s.page_from}</span>
      <span class="chip">${escape(s.confidence ?? 'researched')}</span>
    </p>
  </header>
  ${s.lede ? `<p class="doc-sec__lede">${escape(s.lede)}</p>` : ''}
  ${s.body ? `<div class="doc-sec__body">${escape(s.body)}</div>` : ''}
</section>`;

const docContents = doc.length
  ? `<nav class="ck-toc" aria-label="Handbook contents">
      <h3>The handbook</h3>
      <ol>${doc.map((s) =>
        `<li><a href="#p${s.page_from}">${escape(s.title)}</a>
         <span class="ck-count">${s.page_from}</span></li>`).join('')}</ol>
    </nav>`
  : '';

const handbook = doc.length
  ? `<div class="doc-part">
      <h2>Home plan and project handbook</h2>
      <p class="notice">
        <span class="notice__title">${doc.length} sections, ${doc[0].page_from} to ${doc[doc.length - 1].page_from}</span>
        The document itself, held as rows rather than as a file. Every
        figure in it was believed on the day it was written and is
        researched, not confirmed: none of it drives an allocation until
        somebody checks it.
      </p>
      ${docContents}
      ${doc.map(docSectionHtml).join('')}
    </div>`
  : '';

const contents = sections.length > 1
  ? `<nav class="ck-toc" aria-label="Contents">
      <h3>Contents</h3>
      <ol>${sections.map((s, i) =>
        `<li><a href="#s${i + 1}">${escape(s.title)}</a>
         <span class="ck-count">${s.count}</span></li>`).join('')}</ol>
    </nav>`
  : '';

render('[data-page-root]', (doc.length || sections.length)
  ? `<div class="doc">
      ${handbook}
      ${sections.length ? `<h2>Viewing day</h2>
      <p class="notice">
        <span class="notice__title">${total} things to check</span>
        Print this page, or use the browser's Save as PDF. Every figure
        here is drafted or researched unless it says otherwise, and none
        of it replaces a survey.
      </p>
      ${contents}
      ${sections.map((s, i) => sectionHtml(s, i + 1)).join('')}` : ''}
    </div>`
  : emptyState('Nothing to read yet',
    'The handbook lives in document_sections and the checklist in work items tagged "viewing". Add either through a conversation with Claude.'));
