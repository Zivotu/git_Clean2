const TERMS_DOC_BASE_NAME = 'thesara_terms';
const TERMS_DOC_PUBLIC_BASE = `/docs/${TERMS_DOC_BASE_NAME}`;
const SUPPORTED_DOC_LOCALES = ['hr', 'en', 'de'] as const;

export type TermsDocLocale = typeof SUPPORTED_DOC_LOCALES[number];

function isTermsDocLocale(value?: string | null): value is TermsDocLocale {
  return Boolean(value && SUPPORTED_DOC_LOCALES.includes(value as TermsDocLocale));
}

export function getTermsDocUrl(locale?: string | null) {
  const normalized = isTermsDocLocale(locale) ? locale : SUPPORTED_DOC_LOCALES[0];
  return `${TERMS_DOC_PUBLIC_BASE}.${normalized}.html`;
}

export function getTermsDocFilenames(locale?: string | null) {
  const normalized = isTermsDocLocale(locale) ? locale : null;
  const seen = new Set<string>();
  const add = (name: string) => {
    if (!seen.has(name)) seen.add(name);
  };
  if (normalized) add(`${TERMS_DOC_BASE_NAME}.${normalized}.html`);
  add(`${TERMS_DOC_BASE_NAME}.${SUPPORTED_DOC_LOCALES[0]}.html`);
  add(`${TERMS_DOC_BASE_NAME}.en.html`);
  add(`${TERMS_DOC_BASE_NAME}.html`);
  return Array.from(seen);
}
