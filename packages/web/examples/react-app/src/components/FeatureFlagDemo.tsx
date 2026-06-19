import { useEffect, useState } from 'react';
import { OpenFeature, ProviderEvents } from '@openfeature/web-sdk';
import { NOT_TARGETED_CONTEXT, TARGETED_CONTEXT } from '../evaluationContexts';

/**
 * Thin hook that evaluates a flag and re-evaluates whenever the provider
 * emits a PROVIDER_CONFIGURATION_CHANGED event (e.g. after a poll tick) or
 * PROVIDER_CONTEXT_CHANGED after OpenFeature.setContext().
 */
function useFlag<T>(evaluate: () => T, defaultValue: T): T {
  const [value, setValue] = useState<T>(() => {
    try {
      return evaluate();
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    const client = OpenFeature.getClient();
    const refresh = () => {
      try {
        setValue(evaluate());
      } catch {
        setValue(defaultValue);
      }
    };
    client.addHandler(ProviderEvents.ConfigurationChanged, refresh);
    client.addHandler(ProviderEvents.ContextChanged, refresh);
    return () => {
      client.removeHandler(ProviderEvents.ConfigurationChanged, refresh);
      client.removeHandler(ProviderEvents.ContextChanged, refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return value;
}

export default function FeatureFlagDemo() {
  const client = OpenFeature.getClient();

  // --- simple-* flags ---
  const simpleBoolean = useFlag(() => client.getBooleanValue('simple-boolean', false), false);
  const simpleBooleanDetails = client.getBooleanDetails('simple-boolean', false);

  const simpleString = useFlag(() => client.getStringValue('simple-string', ''), '');
  const simpleStringDetails = client.getStringDetails('simple-string', '');

  const simpleNumber = useFlag(() => client.getNumberValue('simple-number', 0), 0);
  const simpleNumberDetails = client.getNumberDetails('simple-number', 0);

  const simpleObject = useFlag(() => client.getObjectValue('simple-object', {}), {});
  const simpleObjectDetails = client.getObjectDetails('simple-object', {});

  // --- code-default flags (no server value → falls back to default) ---
  const codeDefault = useFlag(() => client.getBooleanValue('code-default-flag', false), false);
  const codeDefaultDetails = client.getBooleanDetails('code-default-flag', false);

  const codeDefaultOmitted = useFlag(() => client.getBooleanValue('code-default-flag-omitted', false), false);
  const codeDefaultOmittedDetails = client.getBooleanDetails('code-default-flag-omitted', false);

  // --- targeting / context-driven flags ---
  const userTier = useFlag(() => client.getStringValue('user-tier-flag', 'unknown'), 'unknown');
  const userTierDetails = client.getStringDetails('user-tier-flag', 'unknown');

  const emailFeature = useFlag(() => client.getBooleanValue('email-based-feature', false), false);
  const emailFeatureDetails = client.getBooleanDetails('email-based-feature', false);

  const regionConfig = useFlag(() => client.getObjectValue('region-config', {}), {});
  const regionConfigDetails = client.getObjectDetails('region-config', {});

  const regionConfigApiOrigin = useFlag(() => client.getStringValue('region-config-api-origin', ''), '');
  const regionConfigApiOriginDetails = client.getStringDetails('region-config-api-origin', '');
  return (
    <section className="flag-demo">
      <h2>Feature Flag Evaluations</h2>

      <h3 className="group-label">Static flags</h3>
      <table className="flag-table">
        <thead>
          <tr>
            <th>Flag key</th>
            <th>Type</th>
            <th>Value</th>
            <th>Variant</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>simple-boolean</code>
            </td>
            <td>boolean</td>
            <td className={simpleBoolean ? 'value-true' : 'value-false'}>{String(simpleBoolean)}</td>
            <td>{simpleBooleanDetails.variant ?? '–'}</td>
            <td>{simpleBooleanDetails.reason ?? '–'}</td>
          </tr>
          <tr>
            <td>
              <code>simple-string</code>
            </td>
            <td>string</td>
            <td>{simpleString}</td>
            <td>{simpleStringDetails.variant ?? '–'}</td>
            <td>{simpleStringDetails.reason ?? '–'}</td>
          </tr>
          <tr>
            <td>
              <code>simple-number</code>
            </td>
            <td>number</td>
            <td>{simpleNumber}</td>
            <td>{simpleNumberDetails.variant ?? '–'}</td>
            <td>{simpleNumberDetails.reason ?? '–'}</td>
          </tr>
          <tr>
            <td>
              <code>simple-object</code>
            </td>
            <td>object</td>
            <td>
              <pre className="object-value">{JSON.stringify(simpleObject, null, 2)}</pre>
            </td>
            <td>{simpleObjectDetails.variant ?? '–'}</td>
            <td>{simpleObjectDetails.reason ?? '–'}</td>
          </tr>
        </tbody>
      </table>

      <h3 className="group-label">Code-default flags</h3>
      <table className="flag-table">
        <thead>
          <tr>
            <th>Flag key</th>
            <th>Type</th>
            <th>Value</th>
            <th>Variant</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>code-default-flag</code>
            </td>
            <td>boolean</td>
            <td className={codeDefault ? 'value-true' : 'value-false'}>{String(codeDefault)}</td>
            <td>{codeDefaultDetails.variant ?? '–'}</td>
            <td>{codeDefaultDetails.reason ?? '–'}</td>
          </tr>
          <tr>
            <td>
              <code>code-default-flag-omitted</code>
            </td>
            <td>boolean</td>
            <td className={codeDefaultOmitted ? 'value-true' : 'value-false'}>{String(codeDefaultOmitted)}</td>
            <td>{codeDefaultOmittedDetails.variant ?? '–'}</td>
            <td>{codeDefaultOmittedDetails.reason ?? '–'}</td>
          </tr>
        </tbody>
      </table>

      <h3 className="group-label">Context-driven flags</h3>
      <table className="flag-table">
        <thead>
          <tr>
            <th>Flag key</th>
            <th>Type</th>
            <th>Value</th>
            <th>Variant</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>user-tier-flag</code>
            </td>
            <td>string</td>
            <td>{userTier}</td>
            <td>{userTierDetails.variant ?? '–'}</td>
            <td>{userTierDetails.reason ?? '–'}</td>
          </tr>
          <tr>
            <td>
              <code>email-based-feature</code>
            </td>
            <td>boolean</td>
            <td className={emailFeature ? 'value-true' : 'value-false'}>{String(emailFeature)}</td>
            <td>{emailFeatureDetails.variant ?? '–'}</td>
            <td>{emailFeatureDetails.reason ?? '–'}</td>
          </tr>
          <tr>
            <td>
              <code>region-config</code>
            </td>
            <td>object</td>
            <td>
              <pre className="object-value">{JSON.stringify(regionConfig, null, 2)}</pre>
            </td>
            <td>{regionConfigDetails.variant ?? '–'}</td>
            <td>{regionConfigDetails.reason ?? '–'}</td>
          </tr>
          <tr>
            <td>
              <code>region-config-api-origin</code>
            </td>
            <td>string</td>
            <td>{regionConfigApiOrigin}</td>
            <td>{regionConfigApiOriginDetails.variant ?? '–'}</td>
            <td>{regionConfigApiOriginDetails.reason ?? '–'}</td>
          </tr>
        </tbody>
      </table>

      <div className="context-section">
        <h3>Evaluation context</h3>
        <pre>{JSON.stringify(OpenFeature.getContext(), null, 2)}</pre>
        <button
          onClick={() => {
            OpenFeature.setContext(TARGETED_CONTEXT);
          }}
        >
          Use targeted context
        </button>
        <button
          onClick={() => {
            OpenFeature.setContext(NOT_TARGETED_CONTEXT);
          }}
        >
          Use non-targeted context
        </button>
        <button
          onClick={() => {
            OpenFeature.setContext({
              targetingKey: `user-${Math.random().toString(36).slice(2, 8)}`,
            });
          }}
        >
          Randomise targeting key
        </button>
      </div>
    </section>
  );
}
