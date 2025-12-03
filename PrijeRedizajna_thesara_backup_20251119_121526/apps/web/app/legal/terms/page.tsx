import fs from 'fs';
import path from 'path';
import { messages as ALL_MESSAGES, defaultLocale, type Locale } from '@/i18n/config';
import { getServerLocale } from '@/lib/locale';
import { getTermsDocFilenames } from '@/lib/termsDocs';

export default async function TermsPage() {
  const docsDir = path.resolve(process.cwd(), 'docs');
  let bodyHtml = '';
  const locale: Locale = await getServerLocale(defaultLocale);
  const translations = ALL_MESSAGES[locale] || ALL_MESSAGES[defaultLocale];
  const t = (key: string) => translations[`Legal.Terms.${key}`] || key;
  const docCandidates = getTermsDocFilenames(locale);
  try {
    let raw = '';
    for (const candidate of docCandidates) {
      const fullPath = path.resolve(docsDir, candidate);
      try {
        raw = await fs.promises.readFile(fullPath, 'utf8');
        break;
      } catch {
        continue;
      }
    }
    if (!raw) {
      throw new Error('terms_doc_missing');
    }
    const m = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    bodyHtml = m ? m[1] : raw;
  } catch (e) {
    // fallback content if file cannot be read
    bodyHtml = `
      <h1 class="text-2xl font-semibold mb-4">${t('fallbackTitle')}</h1>
      <p>${t('fallbackBodyHtml')}</p>
    `;
  }

  return (
    <main className="p-8 prose max-w-none" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
  );
}
