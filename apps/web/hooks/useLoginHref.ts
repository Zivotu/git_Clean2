'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { buildLoginUrl } from '@/lib/loginRedirect';

export function useLoginHref(target?: string | null) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [hash, setHash] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateHash = () => setHash(window.location.hash || '');
    updateHash();
    window.addEventListener('hashchange', updateHash);
    return () => {
      window.removeEventListener('hashchange', updateHash);
    };
  }, []);

  const queryString = searchParams?.toString() ?? '';

  return useMemo(() => {
    if (target) {
      return buildLoginUrl(target);
    }
    const basePath = pathname || '/';
    let composed = basePath;
    if (queryString) {
      composed += `?${queryString}`;
    }
    if (hash) {
      composed += hash;
    }
    return buildLoginUrl(composed);
  }, [target, pathname, queryString, hash]);
}
