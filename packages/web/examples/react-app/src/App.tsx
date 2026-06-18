import { useEffect, useState } from 'react';
import { OpenFeature, ProviderEvents, ProviderStatus } from '@openfeature/web-sdk';
import FeatureFlagDemo from './components/FeatureFlagDemo';
import MetricsMonitor from './components/MetricsMonitor';
import './App.css';

type AppStatus = 'initialising' | 'ready' | 'error';

export default function App() {
  const [status, setStatus] = useState<AppStatus>(() => {
    // If the provider constructor threw, no provider was registered and the
    // status will be NOT_READY with no metadata name — treat that as an error
    // so we show a useful message rather than spinning forever.
    const ps = OpenFeature.getClient().providerStatus;
    if (ps === ProviderStatus.READY) return 'ready';
    if (ps === ProviderStatus.ERROR || ps === ProviderStatus.FATAL) return 'error';
    if (!OpenFeature.providerMetadata.name) return 'error';
    return 'initialising';
  });

  useEffect(() => {
    const client = OpenFeature.getClient();
    client.addHandler(ProviderEvents.Ready, () => setStatus('ready'));
    client.addHandler(ProviderEvents.Error, () => setStatus('error'));
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Dynatrace OpenFeature – React Example</h1>
        <p className="subtitle">
          Using <code>@dynatrace/openfeature-provider-web</code> (local build) with the OpenFeature Web SDK
        </p>
      </header>

      <main>
        {status === 'initialising' && <p className="status">⏳ Waiting for provider to initialise…</p>}
        {status === 'error' && (
          <p className="status error">
            ❌ Provider failed to initialise. Make sure <code>VITE_DT_SDK_KEY</code> in your <code>.env</code> is a
            valid <code>dt01.web_&lt;region&gt;_…</code> key and that the OFREP endpoint is reachable. Check the browser
            console for details.
          </p>
        )}
        {status === 'ready' && <FeatureFlagDemo />}
        <MetricsMonitor />
      </main>
    </div>
  );
}
