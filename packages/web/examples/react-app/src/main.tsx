import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { OpenFeature } from '@openfeature/web-sdk';
import { DynatraceProvider } from '@dynatrace/openfeature-provider-web';
import App from './App';
import { TARGETED_CONTEXT } from './evaluationContexts';
import './index.css';

/**
 * Set an optional `pollInterval` (ms) to keep flags fresh without a page reload:
 *   new DynatraceProvider({ sdkKey, pollInterval: 60_000 })
 */
const sdkKey = import.meta.env.VITE_DT_SDK_KEY;

OpenFeature.setContext(TARGETED_CONTEXT);

try {
  OpenFeature.setProvider(
    new DynatraceProvider(sdkKey, {
      apiOrigin: 'https://ofrep.dev.eu.fm.dynatracelabs.com',
      metricsUrl: 'https://metrics.dev.eu.fm.dynatracelabs.com/v1/metrics',
    }),
  );
} catch (err) {
  console.error('[OpenFeature] Failed to register provider:', err);
}

const container = document.getElementById('root')!;
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
