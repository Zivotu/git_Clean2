'use client';

import { useMemo } from 'react';
import { TERMS_POLICY } from '@thesara/policies/terms';
import { useI18n } from '@/lib/i18n-provider';

export function useTermsLabel() {
  const { messages } = useI18n();
  return useMemo(() => {
    return messages['Terms.label'] || TERMS_POLICY.shortLabel;
  }, [messages]);
}
