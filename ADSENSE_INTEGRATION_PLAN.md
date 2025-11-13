# AdSense integracija i NoAds gating – Plan implementacije

Ovaj dokument opisuje kako integrirati Google AdSense u postojeći sustav s mini aplikacijama, uz uvažavanje postojećeg paketa pretplate „NoAds” (i ekvivalentnih statusa: Gold, Partner, Ambasador) koji gasi prikaz oglasa. Plan je podijeljen po fazama, s naglaskom na tehničke detalje relevantne za našu arhitekturu (Next.js web app + mini aplikacije raznih formata/bundle‑ova, SSR/CSR hibrid, više ruta, detalji aplikacija i interaktivni Play view).

## Sažetak odluka
- Uključujemo: AdSense klijentski kod (script) i `ads.txt` u web rootu.
- Meta oznaku koristimo samo ako je potrebna za verifikaciju domene (Search Console/AdSense onboarding). Ako je verifikacija već odrađena drugim kanalom (DNS ili HTML upload), meta nije nužna.
- Prikaz oglasa je isključivo „in‑page” (unutar layouta), ne radimo custom overlay preko sadržaja mini aplikacije (radi politika i UX‑a). Dozvoljen je closable wrapper oko in‑page oglasa (sakriva containter, ne dira creative).
- Format oglasa: ručni responsive Display/In‑article jedinice za predvidljive pozicije u mini aplikacijama i na detail stranicama; Auto Ads moguće kasnije testirati granularno.
- Gating: `showAds = !(isGold || hasNoAds || isPartner || isAmbassador)`; ako je `false`, uopće ne učitavamo AdSense script i ne renderiramo ad markup.
- Privatnost/EU: integrirati CMP (IAB TCF 2.2) ili barem non‑personalized (`npa=1`) kad nema pristanka.

## Artefakti i vrijednosti (iz AdSense sučelja)
- Script (ubaciti samo kad `showAds`):
  ```html
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6033457404467547" crossorigin="anonymous"></script>
  ```
- ads.txt sadržaj (u web root domene):
  ```
  google.com, pub-6033457404467547, DIRECT, f08c47fec0942fa0
  ```
- Meta verifikacija (samo ako je potrebna):
  ```html
  <meta name="google-adsense-account" content="ca-pub-6033457404467547">
  ```
- Napomena: u AdSense onboarding sučelju ponekad su prikazane tri opcije (script, ads.txt, meta) kao „radio”. Operativno, potrebni su script i ads.txt za ispravan prikaz i prihod; meta služi primarno za verifikaciju vlasništva i nije nužna ako je verifikacija već završena.

## Integracijski principi u našoj arhitekturi
- Next.js Web (`apps/web`):
  - Script ubacujemo kondicionalno (SSR ili na klijentu) isključivo kad `showAds === true`.
  - Ad slotovi se renderiraju u React komponentama (client‑only), nakon mounta radimo `;(adsbygoogle = window.adsbygoogle || []).push({})`.
  - Izbjegavamo duplo učitavanje script‑a: centraliziramo uključivanje u `AdProvider` ili layout komponentu.
- Mini aplikacije (različiti bundle‑ovi/kodovi):
  - Oglasi se postavljaju oko/između segmenata UI‑a koje Web shell kontrolira (npr. iznad/ispod iframe‑a, između sekcija detail stranice, između kontrolnih blokova). Ne ubacujemo AdSense direktno u third‑party bundle bez kontrole.
  - Ako mini aplikacija renderira u iframe, oglasni slot je izvan iframe‑a (u parentu) ili u dedicated containerima unutar stranice gdje mi upravljamo markupom.
- NoAds/Gold/Partner/Ambasador:
  - Gating se provjerava prije injectanja bilo kakvih ad resursa. Idealno na SSR, fallback na klijentu odmah nakon auth init.
  - Kada je korisnik isključen iz prikaza, ne postoji ni ad markup ni script na stranici.
- Performanse i stabilnost:
  - Lazy load slotova; guard protiv re‑inicijalizacije ad slotova (jednom per mount).
  - Fallback UI ako ad‑blocker spriječi učitavanje (prazan prostor ili vlastiti promo).

## Politike i UX smjernice
- Ne prekrivati sadržaj mini aplikacije custom overlayem s AdSense creativeom.
- Dozvoljen je closable wrapper koji sakrije cijeli ad container (X gumb), uz uvjet da ne pokušavamo modificirati samu ad iframe kreativu.
- Paziti na razmak i blizinu interaktivnih kontrola; izbjegavati accidental clicks.
- Ograničiti broj slotova po viewu tako da UX ostane čist (AdSense nema fiksno pravilo broja po stranici, ali fokus je na korisničkom iskustvu).

## Faze implementacije

### Faza 1 – Osnovna infrastruktura (gating + assets)
Status (05.11.2025): dovršeno.

Realizirano:
- `apps/web/public/ads.txt` s Google zapisom za `ca-pub-6033457404467547`.
- `apps/web/components/AdsProvider.tsx` izračunava `showAds` kroz entitlements (NoAds/Gold/Partner/Ambasador) koristeći `useEntitlements`.
- `apps/web/components/AdScriptLoader.tsx` učitava `adsbygoogle.js` tek kada je `showAds === true`.
- `apps/web/app/layout.tsx` omata aplikaciju s `AdsProvider` i `AdScriptLoader` kako korisnici s NoAds ne dobivaju script ni markup.
- `apps/web/lib/ads.ts` centralizira logiku provjere pretplata i dopušta fleksibilne tagove/planove.

Napomene:
- `.env` varijable (`NEXT_PUBLIC_*`) omogućuju gašenje oglasa po okruženju; razvoj ostaje u test modu (`data-adtest="on"`).

### Faza 2 – AdSlot komponenta i osnovne pozicije
Status (05.11.2025): implementirano (Play stranica + detalji aplikacije).

Realizirano:
- `apps/web/config/ads.ts` centralizira ADSENSE_CLIENT_ID i ID-eve slotova preko NEXT_PUBLIC_ADS_SLOT_* varijabli.
- `apps/web/components/AdSlot.tsx` koristi useAds, closable wrapper i fallback kada slot nije konfiguriran te inicijalizira `adsbygoogle` samo jednom po mountu.
- `apps/web/app/play/[appId]/PlayPageClient.tsx` dodaje gornji i donji slot oko iframea bez izmjena u mini aplikacijama.
- `apps/web/app/app/page.tsx` prikazuje header slot (AD_SLOT_IDS.appDetailHeader) iznad sadržaja aplikacije.
- `apps/web/app/HomeClient.tsx` uvodi rail slotove (lijevo/desno), inline grid slot svakih 8 kartica (`NEXT_PUBLIC_ADS_SLOT_HOME_GRID_INLINE`) i footer slot iza feeda – svi se prikazuju samo kada je ID definiran.
- `apps/web/app/apps/page.tsx` (Marketplace) koristi isti inline pattern svakih 8 rezultata koristeći `NEXT_PUBLIC_ADS_SLOT_MARKETPLACE_GRID_INLINE`.
- `.env*.example` datoteke dokumentiraju sve slot env varijable (`*_PLAY_*`, `*_APP_*`, `*_HOME_*`, `MARKETPLACE_*`) kako bi konfiguracija po okruženju bila trivijalna.

Plan daljnjeg širenja:
- Uvesti dodatne inline slotove (npr. unutar opisa, galerije ili preporuka) kada identificiramo sigurne pozicije.
- Testirati alternative formate (in-article, multiplex) i pratiti UX/performanse.
- Nastaviti provjeru da showAds === false preskače sve nove pozicije (trenutna implementacija to pokriva putem AdSlot i useAds).
### Faza 3 – Konfiguracija formata i upravljanje
- Definirati konfiguracijsku mapu „lokacija → ad unit ID, enabled“ (npr. u `apps/web/config/ads.ts`).
- Dodati osnovne formate: Responsive Display, po potrebi In‑article za feed/tekstualne dijelove.
- Omogućiti granularno uključivanje/isključivanje po lokaciji kroz env ili jednostavan admin toggle (bez vlastite revenue statistike).

Status (studeni 2025.): globalni toggle i administrativne kontrole su aktivne.

Realizirano:
- Firestore `settings/ads` dokument + rute (`GET /ads/config`, `POST /admin/ads/config`) omogućuju globalni kill-switch bez redeploya; API zadržava kompatibilnost s `NEXT_PUBLIC_ADS_DISABLED`.
- `AdsProvider` dohvaća konfiguraciju i kombinira je s entitlementsima, pa se script/slot nikad ne učitavaju kad je sustav globalno isključen.
- Admin nadzorna ploča (tab “Admins”) dobila je karticu za upravljanje oglasima s prikazom zadnje izmjene.
- `UserManagement` koristi novu rutu `/admin/users/:uid/no-ads` koja kreira/uklanja stvarni `noAds` entitlement, pa administratori mogu ručno gasiti oglase pojedincima bez intervencije u Stripeu.
- Firestore `settings/adsSlots` + `/ads/slots` rute i UI u adminu omogućuju uključivanje/isključivanje svake pojedine pozicije (Home rail, Play top/bottom, Marketplace inline…) bez izmjene koda; `AdsProvider` čita mapu i ne vraća ID kad je slot ugašen.

Otvoreno:
- Dodati per-slot konfiguracijsku tablicu i UI (enabl/disable) kako bismo mogli testirati pojedine lokacije bez mijenjanja koda.
- Propagirati promjene konfiguracije u realnom vremenu (SSE ili revalidate na fokusu) ako korisnički feedback to zatraži.

### Faza 4 – Privatnost, consent i EU zahtjevi
- Integrirati CMP (IAB TCF 2.2) ili provjeru pristanka.
- Ako nema pristanka, postaviti non‑personalized ads:
  - `google_ad_personalization` ili `npa=1` parametarski pristup (ovisno o strategiji i odabranom CMP‑u).
- Transparentno komunicirati korisnicima u politici privatnosti.

Status (11.11.2025.): osnovni consent banner i ne-personalizirani mod implementirani.

- `AdsConsentBanner` traži pristanak prije nego što se AdSense script uopće učita; korisnik može birati personalizirane ili osnovne oglase.
- Odluka se sprema u `localStorage` i propagira kroz `AdsProvider`; kad je pristanak odbijen, `requestNonPersonalizedAds = 1` se postavlja prije učitavanja skripte.
- Dok je status `unknown`, oglasi se uopće ne renderiraju.
- Politika privatnosti (`/politika-privatnosti`) opisuje AdSense i opcije NoAds/privole na tri jezika pa su korisnici informirani prije prihvaćanja.
- Sljedeći korak: zamjena custom bannera CMP-om kompatibilnim s IAB TCF 2.2 + ažuriranje politike/Terms stranica.

### Faza 5 – A/B testiranje i optimizacija
- Postepeno testirati Auto Ads na nekim stranicama/sekcijama (page‑level), usporediti RPM/UX.
- Logirati interne „render events” (bez klika) da bismo mjerili pokrivenost i utjecaj na performanse.
- Uklopiti minimalnu kontrolnu ploču u admin panel (feature toggles, pregled lokacija, status prikaza), bez dupliciranja AdSense revenue analitike.

## Integracija s postojećim NoAds paketom
- Izvori stanja: postojeći auth/role sustav u `apps/web/lib/auth.tsx` i srodno.
- Funkcija/selector `shouldShowAds(user)` koja vraća `false` ako korisnik ima bilo koju od: `NoAds`, `Gold`, `Partner`, `Ambasador`.
- `AdProvider` izračunava `showAds` server‑side kada je moguće (SSR), a na klijentu čim su poznati user podaci.
- Kada `showAds=false`:
  - Ne uključujemo AdSense script u `<head>`.
  - Ne renderiramo `AdSlot`.
  - Time osiguravamo i bolje performanse i poštivanje korisničkog izbora/pretplate.

## Smjernice za ugradnju u konkretne dijelove koda
- `apps/web/app/HomeClient.tsx`: moguće uključiti 1–2 responsive slota u manje intruzivne sekcije.
- `apps/web/app/play/[appId]/PlayPageClient.tsx`: jedan slot iznad ili ispod canvas/iframe područja (ne overlay), closable wrapper.
- `apps/web/components/AmbassadorSection.tsx`: prikaz promo sadržaja, može imati slot između sekcija teksta (ako je sekcija duga), ili ga preskočiti zbog specifične publike – odlučiti po UX‑u.
- `apps/web/next.config.js|mjs`: nema posebnih izmjena za AdSense osim eventualnog CSP updatea za `*.googlesyndication.com`, `*.googleadsserving.cn` i srodne domene.
- CSP/headers: dodati `script-src` i `frame-src` iznimke za AdSense domene (ovisno o trenutačnom CSP‑u, ako je uključen).

## Primjeri implementacije (skice)

1) Umetanje skripte (u layoutu) – samo kad `showAds`:
```tsx
// Pseudokod u layoutu ili AdProvideru
{showAds && (
  <script
    async
    src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6033457404467547"
    crossOrigin="anonymous"
  />
)}
```

2) AdSlot komponenta (osnova):
```tsx
// apps/web/components/AdSlot.tsx (skica)
"use client";
import { useEffect, useRef, useState } from "react";

type Props = {
  slotId: string; // data-ad-slot
  className?: string;
  style?: React.CSSProperties;
  closable?: boolean;
};

export function AdSlot({ slotId, className, style, closable }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (closed) return;
    try {
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      // swallow
    }
  }, [closed]);

  if (closed) return null;

  return (
    <div className={className} style={style} ref={ref}>
      {closable && (
        <button aria-label="Close ad" onClick={() => setClosed(true)}>×</button>
      )}
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client="ca-pub-6033457404467547"
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
```

3) Gating helper:
```ts
// apps/web/lib/ads.ts (skica)
export function shouldShowAds(user?: { roles?: string[]; plan?: string }) {
  const roles = new Set((user?.roles ?? []).map((r) => r.toLowerCase()));
  const plans = new Set([user?.plan?.toLowerCase()].filter(Boolean));
  const exempt = ["noads", "gold", "partner", "ambasador", "ambassador"];
  const hasExempt = exempt.some((x) => roles.has(x) || plans.has(x));
  return !hasExempt;
}
```

## Test plan (kratko)
- Provjeriti da `ads.txt` servira na `https://<domena>/ads.txt`.
- User s NoAds/Gold/Partner/Ambasador: stranica ne sadrži `adsbygoogle.js` ni `ins.adsbygoogle`.
- User bez pretplate: vidljiv script i slot; oglas se renderira nakon mounta; close gumb skriva wrapper.
- Ad‑blocker: stranica ostaje stabilna (nema errora), layout bez degradacije.
- CSP: dopuštene domene za script/frame.

## Što ne radimo
- Ne ubacujemo custom overlay koji prekriva mini aplikaciju AdSense creative‑om.
- Ne gradimo vlastitu revenue analitiku – koristimo AdSense izvještaje; eventualno logiramo interne „render events”.

## Sljedeći koraci
- Faza 1: Mogu odmah dodati `ads.txt`, `AdProvider` skeleton i kondicionalno učitavanje skripte u layoutu. Zatim u Fazi 2 izraditi `AdSlot` i ugraditi u `PlayPageClient.tsx` + odabrane sekcije detaila.

### Faza 6 – Privremeno gašenje i popravci (studeni 2025.)

Zbog nedovršene implementacije AdSense sustava, privremeno su isključeni oglasi na razini cijele aplikacije te su napravljeni popravci na prikazu `Play` stranice.

**1. Globalni prekidač za oglase (kill-switch)**

Kako bi se oglasi mogli jednostavno isključiti bez uklanjanja koda, uveden je globalni prekidač.

- **Datoteka:** `apps/web/lib/ads.ts`
- **Izmjena:** Funkcija `shouldShowAds` je proširena tako da provjerava novu environment varijablu `NEXT_PUBLIC_ADS_DISABLED`. Ako je varijabla postavljena na `'true'`, funkcija odmah vraća `false`, čime se efektivno gase svi oglasi.

```typescript
export function shouldShowAds(entitlements?: Entitlements): boolean {
  if (process.env.NEXT_PUBLIC_ADS_DISABLED === 'true') {
    return false;
  }
  // ... ostatak funkcije
}
```

- **Aktivacija:** Gašenje se vrši dodavanjem `NEXT_PUBLIC_ADS_DISABLED=true` u `.env.local` datoteku u `apps/web` direktoriju. Promjena zahtijeva restart razvojnog servera.
- **Dokumentacija:** Varijabla je dodana u `apps/web/.env.example` radi budućih referenci.

**2. Privremeni popravak prikaza na Play stranici**

Tijekom gašenja oglasa, uočen je problem s prikazom na `Play` stranici (`/play/[appId]`), gdje je ostajao prazan prostor namijenjen za oglase.

- **Datoteka:** `apps/web/app/play/[appId]/PlayPageClient.tsx`
- **Izmjena:** Originalni `flex` layout koji je sadržavao uvjetno prikazivanje oglasa je zamijenjen. U konačnoj verziji popravka, cijeli `div` spremnik je uklonjen i zamijenjen direktno s `iframe` elementom kojem je visina postavljena na `100vh` kako bi zauzeo cijeli ekran.

```jsx
// Originalni kod
return (
  <div className="flex min-h-screen flex-col">
    {showTopAd && (
      <div className="px-4 pt-4">
        <AdSlot slotId={topAdSlot} />
      </div>
    )}
    <div className="flex-1">
      <iframe style={{ width: '100%', height: '100%' }} />
    </div>
    {showBottomAd && (
      <div className="px-4 pb-4">
        <AdSlot slotId={bottomAdSlot} />
      </div>
    )}
  </div>
)

// Privremeni popravak
return (
  <iframe
    style={{ border: 'none', width: '100%', height: '100vh', display: 'block' }}
  />
)
```

- **Status:** Ova izmjena osigurava da se mini-aplikacija prikazuje preko cijelog zaslona dok je sustav oglasa isključen. Kada se oglasi ponovno budu uključivali, ovaj dio koda će trebati vratiti na originalnu verziju s uvjetnim prikazivanjem.
