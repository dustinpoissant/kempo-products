import { state } from './manager.js';

export default data => {
  state.asked.push({ ref: data.ref, managed: data.products.filter(product => product.managedBy).map(product => product.id) });
  if(state.refuse) throw state.refuse;
};
