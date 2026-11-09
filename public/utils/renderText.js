import { html, unsafeHTML } from '/kempo-ui/lit-all.min.js';
import sanitizeHtml from '/kempo-ui/utils/sanitizeHtml.js';

/*
  A product's short or full description as the page shows it: rich text (sanitized, so scripts, event handlers and
  `javascript:` links never run), or plain text from before there was an editor, which keeps its line breaks. Nothing
  for an empty one.
*/
export default text => {
  if(!text) return '';
  return /<[a-z][\s\S]*>/i.test(text)
    ? html`<div class="mb">${unsafeHTML(sanitizeHtml(text))}</div>`
    : html`<div style="white-space: pre-line;" class="mb">${text}</div>`;
};
