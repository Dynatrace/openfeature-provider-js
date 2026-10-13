export default {
  paths: ['../../fm-provider-test-harness/gherkin/*.feature'],
  import: ['e2e/**/*.ts'],
  // single-flight needs an SSE-triggered re-fetch; SSE is not implemented yet
  tags: 'not @single-flight',
  format: ['pretty'],
};
