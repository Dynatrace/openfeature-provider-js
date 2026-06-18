import type { EvaluationContext } from '@openfeature/web-sdk';

export const TARGETED_CONTEXT: EvaluationContext = {
  targetingKey: 'targeted-user',
  email: 'test@dynatrace.com',
  plan: 'enterprise',
  region: 'eu',
};

export const NOT_TARGETED_CONTEXT: EvaluationContext = {
  targetingKey: 'not-targeted-user',
  email: 'not-targeted@example.com',
  plan: 'free',
  region: 'unknown',
};
