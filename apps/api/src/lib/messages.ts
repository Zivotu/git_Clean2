import { normalizeSupportedLocale } from './locale.js';

type Supported = 'hr' | 'en' | 'de';

const STORAGE_WARNING: Record<Supported, { message: string; docsUrl: string }> = {
  hr: {
    message:
      'Čini se da aplikacija trenutno ne koristi localStorage odnosno Thesara spremište, pa korisnički podaci možda neće biti sačuvani. Dodajte spremanje stanja ili, ako ste svjesni posljedica, potvrdite da želite nastaviti.',
    docsUrl: 'https://docs.thesara.com/hr/storage',
  },
  en: {
    message:
      "It looks like your app does not use localStorage / Thesara storage yet, so user data might not persist. Please add storage support or confirm you still wish to continue.",
    docsUrl: 'https://docs.thesara.com/en/storage',
  },
  de: {
    message:
      'Deine App scheint derzeit kein localStorage bzw. den Thesara-Speicher zu verwenden, daher könnten Nutzerdaten verloren gehen. Ergänze bitte die Speicherung oder bestätige, dass du trotzdem fortfahren möchtest.',
    docsUrl: 'https://docs.thesara.com/de/storage',
  },
};

export function getStorageWarning(locale?: string | null) {
  const key = normalizeSupportedLocale(locale) as Supported;
  return STORAGE_WARNING[key] ?? STORAGE_WARNING.en;
}

