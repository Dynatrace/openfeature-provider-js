export { VALID_SERVER_KEY } from '../../shared/src/testKeys.js';

export const TEST_FLAG_JSON = JSON.stringify({
  metadata: {
    version: '1741780800',
  },
  flags: {
    'my-bool': {
      state: 'ENABLED',
      variants: { on: true, off: false },
      defaultVariant: 'on',
    },
    'my-string': {
      state: 'ENABLED',
      variants: { hello: 'world' },
      defaultVariant: 'hello',
    },
  },
});
