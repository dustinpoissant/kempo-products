import ProductWidget, { SLOTS } from '/products/components/ProductWidget.js';
import { html, nothing } from '/kempo-ui/lit-all.min.js';

/*
  The Product widget as the page builder shows it: the product itself, as the page draws it, with a picture that does not
  open fullscreen. Each slot is drawn as a place to drag a widget into, empty or not (the builder writes each as an
  element of its own). The price slot is the exception: it replaces the price line, so while it is empty the price
  shows and the place to drop into sits under the product, and once a widget is in it the widget stands in for the price.
*/
export default class ProductWidgetEditor extends ProductWidget {
  get editing(){
    return true;
  }

  /* Whether anything is in the slot's place, as opposed to the place itself. */
  filled(name){
    return [...this.children].some(child => child.slot === name && child.children.length > 0);
  }

  get passedOn(){
    return SLOTS.filter(name => name !== 'price' || this.filled('price'));
  }

  renderBelow(){
    return this.filled('price') ? nothing : html`<slot name="price"></slot>`;
  }
}

customElements.define('k-products-product-editor', ProductWidgetEditor);
