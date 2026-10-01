// Road Ahead: the marks a figure carries - the kit's evidence label in
// words, and the portal's trust - shared by every section that shows one.
import { escape, provenance } from '../../core/format.js';
import { EVIDENCE_WORDS } from '../../engine/road-ahead/page/figures.js';

/** The evidence label as a tag beside the figure; nothing when there is none. */
export const labelTag = (label) => (label
  ? ` <span class="rd-label rd-label--${escape(String(label).toLowerCase())}">${escape(EVIDENCE_WORDS[label] ?? label)}</span>` : '');

/** How far a figure is trusted, in words, marked as the rest of the site marks it. */
export function trustTag(confidence) {
  const p = provenance(confidence);
  return `<span class="${p.cls}">${escape(p.label)}</span>`;
}
