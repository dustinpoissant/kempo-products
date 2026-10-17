/* What the test "manager" extension does when kempo-products asks it, and what it was asked. */
export const state = { refuse: null, asked: [], failed: [] };

export const reset = () => {
  state.refuse = null;
  state.asked = [];
  state.failed = [];
};
