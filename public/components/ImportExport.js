import { html, render } from '/kempo-ui/lit-all.min.js';
import Toast from '/kempo-ui/components/Toast.js';
import Dialog from '/kempo-ui/components/Dialog.js';
import { exportUrl, importProducts } from '/products/sdk.js';

/*
  The admin's import and export dialogs.

    import { openExportDialog, openImportDialog } from '/products/components/ImportExport.js';
    openExportDialog();
    openImportDialog({ onDone: () => reload() });

  CSV is a spreadsheet of products. JSON holds everything, including the types and fields, so a
  catalog can move between sites. Images are not included. Importing matches rows to products by
  slug, so importing a file twice never duplicates anything.
*/

/* ---------- export ---------- */
export const openExportDialog = () => {
  let kind = 'csv';
  const $body = document.createElement('div');
  $body.className = 'p';
  render(html`
    <p class="mb">Download every product.</p>
    <label class="d-f mb" style="gap: var(--spacer_h); align-items: flex-start; cursor: pointer;">
      <input type="radio" name="exportKind" value="csv" checked @change=${() => { kind = 'csv'; }}>
      <span><strong>Spreadsheet</strong> (.csv)<br><small class="tc-muted">One row per product, with a column for every field. Opens in Excel or Google Sheets.</small></span>
    </label>
    <label class="d-f mb" style="gap: var(--spacer_h); align-items: flex-start; cursor: pointer;">
      <input type="radio" name="exportKind" value="json" @change=${() => { kind = 'json'; }}>
      <span><strong>Everything</strong> (.json)<br><small class="tc-muted">Products plus the types and fields they use, to move a catalog to another site.</small></span>
    </label>`, $body);

  const $dialog = Dialog.create($body, {
    title: 'Export products',
    confirmText: 'Download',
    cancelText: 'Cancel',
    confirmAction: async event => {
      event.keepDialogOpen = true;
      const response = await fetch(exportUrl(kind), { credentials: 'same-origin' }).catch(() => null);
      if(!response?.ok){
        const body = await response?.json().catch(() => ({}));
        Toast.error(body?.error || 'The export failed');
        return;
      }
      const blob = await response.blob();
      const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? `products.${kind}`;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10000);
      $dialog.close();
    },
  });
  return $dialog;
};

/* ---------- import ---------- */
const summary = result => html`
  <p><strong>${result.created}</strong> to add, <strong>${result.updated}</strong> to update, <strong>${result.skipped}</strong> already there and left alone${result.errors.length ? html`, <strong class="tc-danger">${result.errors.length}</strong> that could not be read` : ''}.</p>
  ${result.notes?.length ? html`<ul>${result.notes.map(note => html`<li>${note}</li>`)}</ul>` : ''}
  ${result.errors.length ? html`<div style="max-height: 12rem; overflow-y: auto;"><ul>${result.errors.slice(0, 50).map(error => html`<li>Row ${error.line}${error.name ? ` (${error.name})` : ''}: ${error.message}</li>`)}${result.errors.length > 50 ? html`<li>… and ${result.errors.length - 50} more</li>` : ''}</ul></div>` : ''}`;

export const openImportDialog = ({ onDone = () => {} } = {}) => {
  let content = '';
  let onMatch = 'skip';
  let state = 'choose';
  let preview = null;
  const $body = document.createElement('div');
  $body.className = 'p';

  const draw = () => render(html`
    <p class="mb">Add products from a spreadsheet (.csv) or an export (.json). Products are matched by their address (slug), so nothing is added twice. Empty cells in a spreadsheet leave a product's existing value alone.</p>
    <div class="mb"><input type="file" id="importFile" accept=".csv,.json,text/csv,application/json" class="full" @change=${read}></div>
    <div class="mb">
      <label class="d-b mbq" for="onMatch">When a product is already there</label>
      <select id="onMatch" class="full" @change=${event => { onMatch = event.target.value; preview = null; draw(); }}>
        <option value="skip" ?selected=${onMatch === 'skip'}>Leave it alone</option>
        <option value="update" ?selected=${onMatch === 'update'}>Update it from the file</option>
      </select>
    </div>
    ${state === 'checking' ? html`<p class="tc-muted">Checking the file…</p>` : ''}
    ${preview ? html`<div class="card">${summary(preview)}</div>` : ''}`, $body);

  const send = dryRun => importProducts({ content, onMatch, dryRun });

  const read = async event => {
    const file = event.target.files[0];
    preview = null;
    content = file ? await file.text() : '';
    if(!content){
      draw();
      return;
    }
    state = 'checking';
    draw();
    const [error, result] = await send(true);
    state = 'choose';
    if(error) Toast.error(error.msg); else preview = result;
    draw();
  };
  draw();

  const $dialog = Dialog.create($body, {
    title: 'Import products',
    confirmText: 'Import',
    cancelText: 'Cancel',
    overlayClose: false,
    confirmAction: async event => {
      event.keepDialogOpen = true;
      if(!content){
        Toast.error('Choose a file first');
        return;
      }
      const [error, result] = await send(false);
      if(error){
        Toast.error(error.msg);
        return;
      }
      preview = result;
      draw();
      if(result.errors.length){
        Toast.warning(`${result.created + result.updated} imported, ${result.errors.length} could not be`);
      } else {
        Toast.success(`${result.created} added, ${result.updated} updated`);
        $dialog.close();
      }
      onDone(result);
    },
  });
  return $dialog;
};
