// ADAPT: map every screen name a scenario (or a navigation call) can use to a lazy require of the real component.
// Use the names the app itself navigates with (react-navigation route names or RNN registerComponent names), so
// pushes from inside the app land on the real screen instead of the grey "Navigated to X" placeholder.
// Keep requires lazy (functions): screens often read themes or i18n at module load, which must be set up first.
// Never use dynamic import(`...${x}`): webpack would bundle the whole app and run out of memory.
export const screens = {
  // 'OrderDetails': () => require('@app/screens/OrderDetails/OrderDetailsScreen'),
  // 'app.CartScreen': () => require('../../src/screens/Cart').CartScreen,
};
