import type { Locale } from '@/i18n/config';
import { defaultLocale } from '@/i18n/config';
import { getServerLocale } from '@/lib/locale';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const heroCopy: Record<
  Locale,
  {
    eyebrow: string;
    title: string;
    body: string;
  }
> = {
  hr: {
    eyebrow: 'Thesara dokumentacija',
    title: 'Centralni priručnik za korisnike i kreatore',
    body:
      'Sve ugovore, upute i postupke čitaš unutar glavnog Thesara sučelja — bez dodatnih prozora i s istom navigacijom koju već koristiš. Promijeni jezik u glavnom izborniku i nastavi gdje si stao.',
  },
  en: {
    eyebrow: 'Thesara documentation',
    title: 'Central handbook for players and creators',
    body:
      'Read every policy, how-to and checklist inside the main Thesara UI — no popups, no external PDFs. Switch the language from the global header and keep the familiar navigation.',
  },
  de: {
    eyebrow: 'Thesara Dokumentation',
    title: 'Zentrales Handbuch für Nutzer und Creator',
    body:
      'Alle Richtlinien, Tutorials und Abläufe direkt im bekannten Thesara-Interface lesen — keine neuen Fenster, keine externen Dateien. Sprache einfach über den Header wechseln und weiter lesen.',
  },
};

export default async function DocsPage() {
  const cookieLocale = await getServerLocale(defaultLocale);
  const activeLocale: Locale = heroCopy[cookieLocale] ? cookieLocale : defaultLocale;
  const hero = heroCopy[activeLocale] ?? heroCopy[defaultLocale];

  return (
    <main className="px-4 py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <div>
            <p className="text-sm uppercase tracking-wide text-emerald-600">{hero.eyebrow}</p>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900">{hero.title}</h1>
            <p className="text-base text-gray-600">{hero.body}</p>
          </div>
        </header>

        <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-xl">
          <iframe
            key={activeLocale}
            src={`/docs/raw?lang=${activeLocale}`}
            title="Thesara Documentation"
            className="h-[calc(100vh-220px)] min-h-[1200px] w-full"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>
    </main>
  );
}
