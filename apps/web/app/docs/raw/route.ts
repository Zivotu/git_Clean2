import { NextResponse } from 'next/server';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { defaultLocale, type Locale } from '@/i18n/config';
import { getLocaleFromRequest, isLocale } from '@/lib/locale';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const docDirectories = [
  path.join(process.cwd(), 'assets', 'docs'),
  path.join(process.cwd(), '..', 'assets', 'docs'),
  path.join(process.cwd(), '..', '..', 'assets', 'docs'),
];

async function readDoc(locale: Locale): Promise<string> {
  const filename = `documentation.${locale}.html`;
  for (const dir of docDirectories) {
    const filePath = path.join(dir, filename);
    try {
      const html = await fs.readFile(filePath, 'utf8');
      return html;
    } catch {
      // Try next location
    }
  }

  if (locale !== defaultLocale) {
    return readDoc(defaultLocale);
  }

  throw new Error(`documentation file missing for locale=${locale}`);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const langParam = url.searchParams.get('lang');
  const locale: Locale = isLocale(langParam) ? langParam : getLocaleFromRequest(req, defaultLocale);

  try {
    const html = await readDoc(locale);
    return new NextResponse(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'private, max-age=0, must-revalidate',
        'x-doc-locale': locale,
        vary: 'Cookie, Accept-Language',
      },
    });
  } catch (error) {
    console.error('Unable to serve documentation', error);
    return NextResponse.json({ error: 'Documentation is temporarily unavailable.' }, { status: 500 });
  }
}
