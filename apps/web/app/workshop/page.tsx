'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n-provider';
import WorkshopPageClient from './WorkshopPageClient';

export default function WorkshopPage() {
    const { messages, locale: contextLocale } = useI18n();
    const [locale, setLocale] = useState(contextLocale);

    // Re-sync locale when context changes
    useEffect(() => {
        setLocale(contextLocale);
        console.log('[Workshop] Context locale changed to:', contextLocale);
    }, [contextLocale]);

    const tWorkshop = (key: string, fallback?: string): string => {
        const fullKey = `BetaHome.Workshop.${key}`;
        const value = messages[fullKey];

        // Debug
        if (key === 'title') {
            console.log(`[Workshop] Lookup '${fullKey}':`, value ? 'FOUND' : 'MISSING', '->', value || fallback);
        }

        return (typeof value === 'string' ? value : fallback) ?? key;
    };


    // Pre-evaluate all translations
    const translations = {
        badge: tWorkshop('badge', 'BESPLATNO'),
        title: tWorkshop('title', 'Kako izgraditi i objaviti svoju aplikaciju u jednom danu'),
        subtitle: tWorkshop('subtitle', 'Besplatna edukacija za početnike'),
        countdownLabel: tWorkshop('countdown.label', 'Preostalo vrijeme:'),
        countdownDays: tWorkshop('countdown.days', '{days} dana'),
        countdownHours: tWorkshop('countdown.hours', '{hours} sati'),
        featuresLive: tWorkshop('features.live', 'Uživo na Zoomu'),
        featuresDuration: tWorkshop('features.duration', '2 sata treninga'),
        featuresFree: tWorkshop('features.free', 'Potpuno besplatno'),
        featuresBeginners: tWorkshop('features.beginners', 'Za početnike'),
        formTitle: tWorkshop('form.title', 'Prijava na besplatni trening'),
        formEmail: tWorkshop('form.email', 'Email adresa'),
        formEmailPlaceholder: tWorkshop('form.emailPlaceholder', 'tvoj@email.com'),
        formSubmit: tWorkshop('form.submit', 'Pošalji prijavu'),
        formSubmitting: tWorkshop('form.submitting', 'Šaljem...'),
        formSuccess: tWorkshop('form.success', 'Uspješno si prijavljen/a! Link za Zoom će ti stići na email.'),
        formError: tWorkshop('form.error', 'Došlo je do greške. Pokušaj ponovo.'),
        formInvalidEmail: tWorkshop('form.invalidEmail', 'Molimo unesi važeću email adresu.'),
        detailsWhen: tWorkshop('details.when', 'Kad?'),
        detailsDate: tWorkshop('details.date', '23. prosinca 2025.'),
        detailsTime: tWorkshop('details.time', '20:00h CET'),
        detailsWhat: tWorkshop('details.what', 'Što ćeš naučiti?'),
        detailsTopics: [
            tWorkshop('details.topics.0', 'Kako koristiti AI (ChatGPT, Google Gemini) za kreiranje aplikacija'),
            tWorkshop('details.topics.1', 'Kako objaviti aplikaciju na Thesari u 3 klika'),
            tWorkshop('details.topics.2', 'Kako monetizirati svoju prvu aplikaciju'),
            tWorkshop('details.topics.3', 'Live Q&A - sva pitanja dobrodošla'),
        ],
        backToHome: tWorkshop('backToHome', 'Povratak na početnu'),
        daysUnit: tWorkshop('daysUnit', 'dana'),
        hoursUnit: tWorkshop('hoursUnit', 'sati'),
        privacyNote: tWorkshop('details.privacyNote', 'Tvoj email koristimo samo za slanje linka. Neće biti prosljeđen trećim stranama.'),
        languageNote: tWorkshop('details.languageNote', 'Napomena: Radionica će se održati na engleskom jeziku.'),
    };

    return <WorkshopPageClient translations={translations} />;
}
