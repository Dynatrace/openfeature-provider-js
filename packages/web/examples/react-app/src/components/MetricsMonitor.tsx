import { useEffect, useRef, useState } from 'react';
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

export default function MetricsMonitor() {
  const [flushes, setFlushes] = useState<FlushEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const originalFetch = useRef<typeof fetch | null>(null);
  const originalSendBeacon = useRef<typeof navigator.sendBeacon | null>(null);

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
        Intercepts payloads sent to <code>/v1/metrics/feature-flags</code>. Flushes automatically every 30 s, on context
        change, or when the tab is hidden.
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
