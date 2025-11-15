'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { signOut } from 'firebase/auth';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { acceptTerms, fetchTermsStatus, type TermsStatus, TERMS_POLICY } from '@/lib/terms';
import { auth } from '@/lib/firebase';
import TermsPreviewModal from './TermsPreviewModal';
import TermsEnforcementModal from './TermsEnforcementModal';

type TermsContextValue = {
  status: TermsStatus | null;
  loading: boolean;
  refresh: () => Promise<void>;
  accept: (source?: string) => Promise<void>;
};

const TermsContext = createContext<TermsContextValue>({
  status: null,
  loading: false,
  refresh: async () => {},
  accept: async () => {},
});

export function TermsProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const userId = user?.uid ?? null;
  const [status, setStatus] = useState<TermsStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [enforceError, setEnforceError] = useState<string | null>(null);
  const [enforceBusy, setEnforceBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setStatus(null);
      return;
    }
    setLoading(true);
    try {
      const next = await fetchTermsStatus();
      setStatus(next);
    } catch (err) {
      console.error('terms_status_failed', err);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setStatus(null);
      return;
    }
    void refresh();
  }, [userId, refresh]);

  const accept = useCallback(
    async (source?: string) => {
      if (!userId) {
        throw new Error('auth_required');
      }
      await acceptTerms({ source });
      await refresh();
    },
    [userId, refresh],
  );

  const shouldEnforce =
    Boolean(user) && !authLoading && Boolean(status) && status?.accepted === false;
  const isHomePage = !pathname || pathname === '/';
  const shouldShowGlobalModal = shouldEnforce && !isHomePage;

  const handleModalAccept = useCallback(async () => {
    setEnforceBusy(true);
    setEnforceError(null);
    try {
      await accept('global-modal');
    } catch (err) {
      console.error('terms_accept_failed', err);
      setEnforceError('Nismo mogli spremiti prihvaćanje. Pokušaj ponovno.');
    } finally {
      setEnforceBusy(false);
    }
  }, [accept]);

  const handleModalDecline = useCallback(async () => {
    if (auth) {
      try {
        await signOut(auth);
      } catch (err) {
        console.warn('signout_failed', err);
      }
    }
    setStatus(null);
  }, []);

  const ctxValue = useMemo(
    () => ({
      status,
      loading,
      refresh,
      accept,
    }),
    [status, loading, refresh, accept],
  );

  return (
    <TermsContext.Provider value={ctxValue}>
      {children}
      <TermsEnforcementModal
        open={Boolean(shouldShowGlobalModal)}
        busy={enforceBusy}
        error={enforceError}
        onAccept={handleModalAccept}
        onDecline={handleModalDecline}
        onOpenFull={() => setPreviewOpen(true)}
      />
      <TermsPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={TERMS_POLICY.shortLabel}
      />
    </TermsContext.Provider>
  );
}

export function useTerms() {
  return useContext(TermsContext);
}
