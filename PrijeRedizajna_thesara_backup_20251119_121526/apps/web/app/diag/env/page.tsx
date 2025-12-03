import { readPublicEnv, getMissingFirebaseEnv } from '@/lib/env';
import { messages as ALL_MESSAGES, defaultLocale, type Locale } from '@/i18n/config';
import { getServerLocale } from '@/lib/locale';

function mask(value?: string) {
  if (!value) return value;
  return value.length <= 8 ? value : `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export default async function EnvPage() {
  const locale: Locale = await getServerLocale(defaultLocale);
  const messages = ALL_MESSAGES[locale] ?? ALL_MESSAGES[defaultLocale];
  const t = (key: string) => messages[`DiagEnv.${key}`] || key;

  const env = readPublicEnv();
  const missing = getMissingFirebaseEnv();

  const maskedEnv = Object.fromEntries(Object.entries(env).map(([k, v]) => [k, mask(v)]));

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">{t('title')}</h1>
      <pre className="bg-gray-100 p-4 rounded text-sm">{JSON.stringify(maskedEnv, null, 2)}</pre>
      <h2 className="mt-4 font-semibold">{t('missingHeading')}</h2>
      {missing.length === 0 ? (
        <p>{t('none')}</p>
      ) : (
        <ul className="list-disc list-inside">
          {missing.map((key) => (
            <li key={key}>{key}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
