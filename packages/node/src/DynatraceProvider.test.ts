import { describe, it, expect } from 'vitest';
import { DynatraceProvider } from './DynatraceProvider';

const VALID_SERVER_KEY = 'dt01.server_us_ab3xy9kp2q.03ee0ef7cd4244bfb8b71fea8f783f53_d4f8a9c12a';

describe('DynatraceProvider', () => {
  it('metadata.name is dynatrace', () => {
    expect(new DynatraceProvider(VALID_SERVER_KEY).metadata.name).toBe('dynatrace');
  });

  it('runsOn is server', () => {
    expect(new DynatraceProvider(VALID_SERVER_KEY).runsOn).toBe('server');
  });

  it('returns PROVIDER_NOT_READY before initialize', async () => {
    const provider = new DynatraceProvider(VALID_SERVER_KEY);
    const result = await provider.resolveBooleanEvaluation('flag-a', false, { targetingKey: 'u1' }, {} as any);
    expect(result.errorCode).toBe('PROVIDER_NOT_READY');
  });

  it('initializes and emits ready', async () => {
    const provider = new DynatraceProvider(VALID_SERVER_KEY);
    await provider.initialize();
    expect(provider.initialized).toBe(true);
  });
});
