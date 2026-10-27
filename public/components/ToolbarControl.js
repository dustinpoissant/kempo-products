import ButtonControl from '/kempo-ui/components/controls/ButtonControl.js';
import { html, css } from '/kempo-ui/lit-all.min.js';

/*
  A labelled control for a table's top bar: it looks like the table's own controls (search, filter)
  and takes its icon and label from its slot. With `href` it goes to that page; otherwise the page
  listens for the click on it.

    <k-products-toolbar-control href="/admin/extension/kempo-products/"><k-icon name="..."></k-icon> Export</k-products-toolbar-control>
*/
export default class ToolbarControl extends ButtonControl {
  handleAction(){
    const href = this.getAttribute('href');
    if(href) location.href = href;
  }

  render(){
    return html`<slot></slot>`;
  }

  static styles = [
    ButtonControl.styles,
    css`
      :host {
        gap: var(--spacer_q);
        white-space: nowrap;
      }
    `,
  ];
}

customElements.define('k-products-toolbar-control', ToolbarControl);
