export const environment = {
  production: true,
  // Must be absolute (not '/api/v1'): build-time prerendering has no browser
  // origin to resolve a relative URL against, so relative API calls fail
  // during `ng build`'s route-extraction/prerender pass. An absolute URL
  // works identically in the browser (same-origin request) and at build time.
  apiUrl: 'https://rajhanstea.com/api/v1',
  razorpayKeyId: 'rzp_live_T8byvlnWZiQsH3',
  msg91: {
    widgetId: '366761734467323939313830',
    tokenAuth: '545115THqFCivXp6a456ae2P1',
  },
};
