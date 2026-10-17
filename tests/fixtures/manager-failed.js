import { state } from './manager.js';

export default ({ ref }) => {
  state.failed.push(ref);
};
