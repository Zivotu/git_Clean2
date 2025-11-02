"use client";

import { useAuth } from '@/lib/auth';
import { useEffect, useState } from 'react';

export default function DebugAuthInfo() {
  const { user, loading } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchToken() {
      setTokenError(null);
      if (user) {
        try {
          const t = await user.getIdToken();
          if (!cancelled) setToken(t);
        } catch (err: any) {
          if (!cancelled) setTokenError(err?.message || 'Greška kod dohvaćanja tokena');
        }
      } else {
        setToken(null);
      }
    }
    fetchToken();
    return () => { cancelled = true; };
  }, [user]);

  async function handleRefresh() {
    if (!user) return;
    setRefreshing(true);
    setTokenError(null);
    try {
      const t = await user.getIdToken(true);
      setToken(t);
    } catch (err: any) {
      setTokenError(err?.message || 'Greška kod osvježavanja tokena');
    } finally {
      setRefreshing(false);
    }
  }

  function copyToken() {
    if (token) {
      navigator.clipboard.writeText(token);
    }
  }


  return (
    <div style={{ position: 'fixed', bottom: 0, right: 0, background: '#fff', color: '#222', zIndex: 9999, fontSize: 14, border: '1px solid #ccc', borderRadius: 6, padding: 12, margin: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <div><b>DEBUG AUTH</b></div>
      <div>Status: {loading ? 'Učitavanje...' : user ? 'Prijavljen' : 'Nije prijavljen'}</div>
      {user && (
        <>
          <div>UID: <b>{user.uid}</b></div>
          <div>Email: <b>{user.email}</b></div>
          <div>DisplayName: <b>{user.displayName || '-'}</b></div>
          <div style={{ wordBreak: 'break-all' }}>
            Token: {token ? (
              <>
                <span title={token}>{token.slice(0, 8)}...{token.slice(-8)}</span>
                <button style={{ marginLeft: 8 }} onClick={copyToken}>Kopiraj</button>
                <button style={{ marginLeft: 8 }} onClick={handleRefresh} disabled={refreshing}>{refreshing ? 'Osvježavam...' : 'Osvježi'}</button>
              </>
            ) : tokenError ? (
              <span style={{ color: 'red' }}>{tokenError}</span>
            ) : (
              <span>Učitavam token...</span>
            )}
          </div>
        </>
      )}
      {!user && !loading && <div style={{ color: 'red' }}>Nema korisnika. Prijavite se.</div>}
    </div>
  );
}
