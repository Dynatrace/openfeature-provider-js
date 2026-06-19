import { useEffect, useState } from 'react';
import { OpenFeature } from '@openfeature/web-sdk';

interface FlushRecord {
  flagKey: string;
  variant: string;
  evaluationReason: string;
  errorCode: string;
  timestampSec: number;
  count: number;
}

interface FlushPayload {
  version: string;
  sdkType: string;
  sdkVersion: string;
  providerName: string;
  configVersion: string;
  evaluations: FlushRecord[];
}

interface FlushEntry {
  id: number;
  timestamp: string;
  method: 'fetch' | 'beacon';
  payload: FlushPayload;
}

let _entryId = 0;

function isMetricsUrl(url: string): boolean {
  try {
    return new URL(url, window.location.href).pathname.endsWith('/v1/metrics');
  } catch {
    return false;
  }
}

export default function MetricsMonitor() {
  const [flushes, setFlushes] = useState<FlushEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    function recordFlush(method: 'fetch' | 'beacon', body: string) {
      try {
        const payload = JSON.parse(body) as FlushPayload;
        setFlushes((prev) => [
          {
            id: ++_entryId,
            timestamp: new Date().toLocaleTimeString(),
            method,
            payload,
          },
          ...prev,
        ]);
      } catch {
        // Ignore non-JSON bodies.
      }
    }

    const originalFetch = globalThis.fetch.bind(globalThis);
    const originalSendBeacon = navigator.sendBeacon.bind(navigator);

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();

      if (method === 'POST' && typeof init?.body === 'string' && isMetricsUrl(url)) {
        recordFlush('fetch', init.body);
      }

      return originalFetch(input, init);
    };

    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
      const urlStr = String(url);

      if (isMetricsUrl(urlStr) && data != null) {
        if (typeof data === 'string') {
          recordFlush('beacon', data);
        } else if (data instanceof Blob) {
          void data.text().then((body) => recordFlush('beacon', body));
        } else if (data instanceof ArrayBuffer) {
          recordFlush('beacon', new TextDecoder().decode(data));
        }
      }

      return originalSendBeacon(url, data);
    };

    return () => {
      globalThis.fetch = originalFetch;
      navigator.sendBeacon = originalSendBeacon;
    };
  }, []);

  function toggleExpanded(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function triggerFlush() {
    OpenFeature.setContext({ ...OpenFeature.getContext() });
  }

  return (
    <section className="metrics-monitor">
      <div className="metrics-header">
        <h2>Evaluation Metrics Monitor</h2>
        <button className="flush-btn" onClick={triggerFlush}>
          ⚡ Force flush (change context)
        </button>
      </div>
      <p className="hint">
        Intercepts payloads sent to <code>/v1/metrics</code>. Flushes automatically every 30 s, on context change, or
        when the tab is hidden.
      </p>

      {flushes.length === 0 ? (
        <div className="metrics-empty">
          <span className="metrics-spinner" />
          Waiting for first flush…
        </div>
      ) : (
        <div className="flush-list">
          {flushes.map((entry) => (
            <div key={entry.id} className="flush-entry">
              <button className="flush-summary" onClick={() => toggleExpanded(entry.id)}>
                <span className="flush-chevron">{expanded.has(entry.id) ? '▾' : '▸'}</span>
                <span className="flush-time">{entry.timestamp}</span>
                <span className={`flush-method flush-method--${entry.method}`}>{entry.method}</span>
                <span className="flush-count">{entry.payload.evaluations.length} record(s)</span>
                {entry.payload.configVersion && (
                  <span className="flush-version">cfg&nbsp;v{entry.payload.configVersion}</span>
                )}
              </button>

              {expanded.has(entry.id) && (
                <div className="flush-detail">
                  <table className="flush-table">
                    <thead>
                      <tr>
                        <th>Flag key</th>
                        <th>Variant</th>
                        <th>Reason</th>
                        <th>Error code</th>
                        <th>Timestamp (s)</th>
                        <th>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.payload.evaluations.map((rec, i) => (
                        <tr key={i}>
                          <td>
                            <code>{rec.flagKey}</code>
                          </td>
                          <td>{rec.variant || '–'}</td>
                          <td>{rec.evaluationReason || '–'}</td>
                          <td>{rec.errorCode || '–'}</td>
                          <td>{rec.timestampSec}</td>
                          <td className="flush-count-cell">{rec.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
