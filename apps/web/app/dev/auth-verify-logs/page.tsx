'use client'

import React, { useEffect, useState } from 'react';

export default function AuthVerifyLogsPage() {
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchLogs() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/debug/auth-verify-log', { credentials: 'include' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error || `HTTP ${res.status}`);
        setLines([]);
      } else {
        const j = await res.json();
        setLines(Array.isArray(j.lines) ? j.lines : []);
      }
    } catch (err: any) {
      setError(err?.message || String(err));
      setLines([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLogs();
    const iv = setInterval(fetchLogs, 5000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h2>Auth verify errors (admin)</h2>
      <div style={{ marginBottom: 8 }}>
        <button onClick={fetchLogs} disabled={loading} style={{ marginRight: 8 }}>Refresh</button>
        {loading && <span>Loading…</span>}
        {error && <span style={{ color: 'crimson', marginLeft: 8 }}>{error}</span>}
      </div>
      <div style={{ border: '1px solid #ddd', background: '#111', color: '#eee', padding: 12, borderRadius: 6, maxHeight: '60vh', overflow: 'auto', fontFamily: 'monospace', fontSize: 12 }}>
        {lines.length === 0 ? (
          <div style={{ opacity: 0.7 }}>No log entries found.</div>
        ) : (
          lines.map((l, i) => (
            <pre key={i} style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{l}</pre>
          ))
        )}
      </div>
    </div>
  );
}
