import { fileURLToPath } from 'node:url';
import { autoBindSteps, loadFeatures, setJestCucumberConfiguration } from 'jest-cucumber';
import { afterAll, describe, test } from 'vitest';
import { cdnSteps } from './cdnSteps.js';
import { HARNESS_DIR, MockServer } from './mockServer.js';

/** single-flight needs an SSE-triggered re-fetch; SSE is not implemented yet */
const EXCLUDED_TAG = '@single-flight';

setJestCucumberConfiguration({ runner: { describe, test } });

// excluded scenarios are dropped rather than tag-filtered, since autoBindSteps would still require their steps
const features = loadFeatures(fileURLToPath(new URL('gherkin/*.feature', HARNESS_DIR)), {
  scenarioNameTemplate: (vars) => `${vars.scenarioTitle} (${vars.scenarioTags.join(',')})`,
}).map((feature) => ({
  ...feature,
  scenarios: feature.scenarios.filter((s) => !s.tags.includes(EXCLUDED_TAG)),
  scenarioOutlines: feature.scenarioOutlines.filter((s) => !s.tags.includes(EXCLUDED_TAG)),
}));

describe('cdn', () => {
  afterAll(() => MockServer.stop());

  autoBindSteps(features, [cdnSteps]);
});
