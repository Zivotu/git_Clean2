"use client";

import { Suspense, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouteParam } from '@/hooks/useRouteParam';
import { useRouter } from 'next/navigation';
import { PUBLIC_API_URL } from '@/lib/config';
import { useAuth } from '@/lib/auth';
import { useTerms } from '@/components/terms/TermsProvider';
import TermsPreviewModal from '@/components/terms/TermsPreviewModal';
import { TERMS_POLICY } from '@thesara/policies/terms';
import { useI18n } from '@/lib/i18n-provider';
import { useTermsLabel } from '@/hooks/useTermsLabel';

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutClient />
    </Suspense>
  );
}

function CheckoutClient() {
  const appId = useRouteParam('appId', (segments) => {
    if (segments.length > 1 && segments[0] === 'checkout') {
      return segments[1] ?? '';
    }
    if (segments.length > 1 && segments[0] === 'app') {
      return segments[1] ?? '';
    }
    return undefined;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const router = useRouter();
  const { user } = useAuth();
  const { status: termsStatus, accept: acceptTerms, refresh: refreshTerms } = useTerms();
  const { messages, locale } = useI18n();
  const termsLabel = useTermsLabel();
  const tCheckout = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      let value = messages[`Checkout.${key}`] || key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          value = value.replaceAll(`{${k}}`, String(v));
        }
      }
      return value;
    },
    [messages]
  );
  const [termsChecked, setTermsChecked] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const needsTermsConsent = Boolean(user && termsStatus && termsStatus.accepted === false);
  const numberLocale = useMemo(() => {
    if (locale === 'de') return 'de-DE';
    if (locale === 'en') return 'en-US';
    return 'hr-HR';
  }, [locale]);

  const [customerEmail, setCustomerEmail] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState(appId);
  const [priceAmount, setPriceAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState('USD');

  useEffect(() => {
    if (user?.email) setCustomerEmail(user.email);
  }, [user?.email]);

  useEffect(() => {
    if (!appId) {
      setLoading(false);
      setLoadError(tCheckout('missingAppId'));
      return;
    }
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`${PUBLIC_API_URL}/listing/${appId}`);
        if (!res.ok) throw new Error('bad_response');
        const json = await res.json();
        setTitle(json?.item?.title || appId);
        const p = json?.item?.price;
        if (typeof p === 'number') setPriceAmount(p);
        const cur = json?.item?.currency;
        if (typeof cur === 'string') setCurrency(cur.toUpperCase());
      } catch {
        setLoadError(tCheckout('loadErrorGeneric'));
      } finally {
        setLoading(false);
      }
    })();
  }, [appId, tCheckout]);
  useEffect(() => {
    if (!needsTermsConsent) {
      setTermsChecked(false);
      setTermsError(null);
    }
  }, [needsTermsConsent]);

  const price =
    priceAmount != null
      ? new Intl.NumberFormat(numberLocale, {
          style: 'currency',
          currency,
        }).format(priceAmount)
      : null;

  async function startCheckout() {
    setError(null);
    if (needsTermsConsent) {
      if (!termsChecked) {
        setTermsError(tCheckout('termsMissing'));
        return;
      }
      try {
        await acceptTerms('checkout-flow');
        setTermsError(null);
      } catch (err) {
        console.error('checkout_terms_accept_failed', err);
        setTermsError(tCheckout('termsSaveError'));
        return;
      }
    }
    setBusy(true);
    try {
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = crypto.randomUUID();
      }
      const token = await (user as any)?.getIdToken?.();
      if (!token) {
        router.push('/login');
        return;
      }
      let url = `${PUBLIC_API_URL}/billing/subscriptions/app`;
      let body: any;
        if (appId === 'gold' || appId === 'no-ads') {
          url = `${PUBLIC_API_URL}/billing/subscriptions/${appId}`;
          body = {
            customerEmail: customerEmail || undefined,
          };
        } else {
          body = {
            appId,
            customerEmail: customerEmail || undefined,
            idempotencyKey: idempotencyKeyRef.current,
          };
        }
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        credentials: 'include',
      });
      if (res.status === 428) {
        setTermsError(tCheckout('termsMissing'));
        setShowTermsModal(true);
        void refreshTerms();
        setBusy(false);
        return;
      }
      if (!res.ok) throw new Error('bad_response');
      const json = await res.json();
      if (json?.url) {
        window.location.href = json.url as string;
        return;
      }
      setError(tCheckout('errorInvalidResponse'));
    } catch {
      setError(tCheckout('errorNetwork'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-center">{tCheckout('pageTitle')}</h1>

        {loading ? (
          <p className="text-center">{tCheckout('loading')}</p>
        ) : loadError ? (
          <p className="text-red-500 text-center">{loadError}</p>
        ) : (
          <>
            <section className="bg-white rounded-lg shadow p-4 space-y-2">
              <div className="flex justify-between">
                <span className="font-semibold">{tCheckout('subscriptionLabel')}</span>
                <span>{title}</span>
              </div>
              {price && (
                <div className="flex justify-between">
                  <span className="font-semibold">{tCheckout('priceLabel')}</span>
                  <span>{price}</span>
                </div>
              )}
            </section>

            <section className="bg-white rounded-lg shadow p-4 space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                {tCheckout('emailLabel')}
              </label>
              <input
                id="email"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="w-full border rounded px-3 py-2"
              />
            </section>

            <section className="bg-white rounded-lg shadow p-4 space-y-2">
              <p className="text-sm text-gray-700">
                {tCheckout('promoPrefix')}{' '}
                <Link href="/redeem" className="text-emerald-700 underline">
                  {tCheckout('promoLink')}
                </Link>{' '}
                {tCheckout('promoSuffix')}
              </p>
            </section>
            {needsTermsConsent && (
              <section className="bg-white rounded-lg shadow p-4 space-y-2 text-sm text-gray-800">
                <p className="text-amber-900">

                  {tCheckout('termsPrompt', { termsLabel })}

                </p>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={termsChecked}
                    onChange={(event) => {
                      setTermsChecked(event.target.checked);
                      if (event.target.checked) setTermsError(null);
                    }}
                    className="mt-1 h-4 w-4 rounded border-gray-400 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>
                    {tCheckout('termsCheckbox')}
                  </span>
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowTermsModal(true)}
                    className="text-sm font-semibold text-emerald-700 underline underline-offset-2"
                  >

                    {tCheckout('termsButton')}

                  </button>
                  <span className="text-xs text-amber-700">
                    {tCheckout('termsNote', { version: TERMS_POLICY.version })}
                  </span>
                </div>
                {termsError && <p className="text-xs text-red-600">{termsError}</p>}
              </section>
            )}

            <button
              onClick={startCheckout}
              disabled={busy}
              className="w-full py-3 rounded-lg bg-emerald-600 text-white font-medium disabled:opacity-50"
            >
              {busy ? tCheckout('buttonSubmitting') : tCheckout('buttonSubmit')}
            </button>
            {error && <p className="text-red-500">{error}</p>}
            <Link
              href={{ pathname: '/paywall', query: { slug: appId } }}
              className="block text-center text-emerald-600 underline"
            >
              {tCheckout('backLink')}
            </Link>
          </>
        )}
      </div>
      <TermsPreviewModal
        open={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        title={termsLabel}
      />
    </main>
  );
}












