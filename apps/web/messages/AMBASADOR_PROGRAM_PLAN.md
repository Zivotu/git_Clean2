# Thesara Ambasador Program - Strateška i Tehnička Dokumentacija

**Verzija:** 1.0
**Datum:** 2025-10-18

> **Namjena**: Ovaj dokument je jedinstveni izvor istine ("single source of truth") za planiranje, razvoj i održavanje Thesara Ambasador (affiliate) programa. Služi kao vodič za sve sudionike u projektu.

---

## 1. Strateški Okvir

### 1.1. Primarni Cilj

Glavni cilj programa je **akvizicija novih *plaćenih* korisnika** za Thesara Gold plan. Uspjeh se mjeri brojem korisnika koji su, nakon korištenja ambasadorskog koda, izvršili prvu uplatu.

### 1.2. Sekundarni Ciljevi

*   **Povećanje svijesti o brendu (Brand Awareness):** Povećanje dosega i prepoznatljivosti Thesare unutar ciljanih zajednica (developeri, dizajneri, kreatori).
*   **Stvaranje zajednice (Community Building):** Izgradnja odnosa s kreatorima koji postaju zagovornici platforme.
*   **Generiranje autentičnog sadržaja:** Poticanje kreiranja sadržaja (videa, članaka) koji prikazuje stvarne primjere korištenja Thesare.

### 1.3. Ciljana Skupina Ambasadora

*   **Primarna skupina:** Mikro-influenceri i kreatori sadržaja (1.000 - 20.000 pratitelja) na platformama poput TikToka, YouTubea i Instagrama, čija se publika bavi programiranjem, web dizajnom, "side-hustle" projektima i općenito tehnologijom.
*   **Sekundarna skupina:** Blogeri, autori newslettera i etablirani influenceri u tech niši.

---

## 2. Programska Pravila i Parametri

> **NAPOMENA:** Vrijednosti unutar `[BRACKETS]` su parametri koje je potrebno finalizirati. One su temelj za izračune i pravila programa.

### 2.1. Pogodnost za Korisnika

*   **Tip pogodnosti:** `[USER_BENEFIT_TYPE: 'free_gold_trial']` (Besplatni probni period za Gold plan)
*   **Trajanje pogodnosti:** `[USER_BENEFIT_DURATION_DAYS: 30]` (dana)

### 2.2. Provizija za Ambasadora

*   **Tip provizije:** `[COMMISSION_TYPE: 'first_payment_percentage']` (Postotak od prve uplate korisnika)
*   **Iznos provizije:** `[COMMISSION_RATE_PERCENT: 25]` (%)
*   **Trajanje praćenja (Attribution Window):** `[ATTRIBUTION_WINDOW_DAYS: 60]` (dana)
    *   *Objašnjenje: Ambasador ima pravo na proviziju ako korisnik izvrši prvu uplatu unutar ovog broja dana od trenutka iskorištavanja promotivnog koda.*
*   **Model atribucije:** `[ATTRIBUTION_MODEL: 'last_touch']`
    *   *Objašnjenje: Ako korisnik iskoristi više različitih kodova, proviziju dobiva ambasador čiji je kod zadnji iskorišten prije prve uplate.*

### 2.3. Uvjeti Isplate

*   **Minimalni prag za isplatu:** `[PAYOUT_THRESHOLD_EUR: 50]` (EUR)
*   **Metoda isplate:** `[PAYOUT_METHOD: 'PayPal']` (Za početak. Kasnije se može proširiti na Stripe Connect.)
*   **Period obrade isplata:** `[PAYOUT_PROCESSING_SCHEDULE: 'monthly_net_30']` (Isplate se obrađuju jednom mjesečno, 30 dana nakon završetka mjeseca u kojem je zatražena isplata, kako bi se pokrio period za eventualne povrate novca.)

---

## 3. Put Korisnika (User Journeys)

### 3.1. Put Ambasadora

1.  **Otkriće:** Vidi poziv na akciju na Thesara platformi ili biva direktno kontaktiran.
2.  **Prijava:** U postavkama profila pronalazi sekciju "Ambasador Program" i ispunjava kratku formu (linkovi na društvene mreže, motivacija).
3.  **Čekanje:** Dobiva trenutnu potvrdu da je prijava zaprimljena i da je u obradi.
4.  **Odobrenje:** Prima **automatizirani e-mail dobrodošlice** koji sadrži:
    *   Njegov jedinstveni promotivni kod.
    *   Link na njegov novi **Ambasador Dashboard**.
    *   Link na **Marketing Kit**.
5.  **Promocija:** Kreira sadržaj koristeći svoj kod i materijale iz Marketing Kita.
6.  **Praćenje:** Na svom dashboardu u stvarnom vremenu prati ključne metrike (iskorištenja koda, konverzije, zarada). Dobiva notifikacije unutar aplikacije za ključne događaje.
7.  **Isplata:** Kada dosegne prag, na dashboardu mu se aktivira gumb "Zatraži isplatu". Nakon zahtjeva, prati status isplate (`pending` -> `processing` -> `paid`).

### 3.2. Put Krajnjeg Korisnika (Pratitelja)

1.  **Izloženost:** Vidi promotivni sadržaj ambasadora s pozivom na akciju i promotivnim kodom.
2.  **Akcija:** Dolazi na `thesara.space`.
3.  **Iskorištavanje koda:** Prilikom registracije ili na stranici za pretplatu unosi kod u jasno označeno polje.
4.  **Potvrda:** Dobiva jasnu poruku: "Uspješno aktivirano! Vaš besplatni Gold plan vrijedi do [datum]".
5.  **Podsjetnik:** `[TRIAL_EXPIRING_REMINDER_DAYS: 3]` dana prije isteka probnog perioda, dobiva e-mail podsjetnik za nadogradnju.
6.  **Konverzija:** Odlučuje se za kupovinu Gold plana.

### 3.3. Put Administratora (Thesara Tim)

1.  **Pregled prijava:** U internom admin sučelju vidi listu novih prijava za program.
2.  **Odluka:** Pregledava profil kandidata i donosi odluku.
    *   *Poboljšanje UX-a: Admin sučelje treba imati direktne linkove na socijalne profile kandidata kako bi se odluka donijela brzo i bez napuštanja sučelja.*
3.  **Akcija:** 
    *   **Odobrenje:** Klikom na "Odobri" pokreće se automatizirani proces: generiranje koda, ažuriranje statusa korisnika i slanje e-maila dobrodošlice.
    *   **Odbijanje:** Klikom na "Odbij" korisniku se šalje generički e-mail zahvale.
4.  **Pregled isplata:** Vidi listu zahtjeva za isplatu koji su dosegli prag.
5.  **Obrada isplata:** Jednom mjesečno, obrađuje zahtjeve, vrši ručni transfer putem PayPala i u sustavu označava isplatu kao "Plaćeno".

---

## 4. Tehnička Specifikacija

### 4.1. Model Podataka (Firestore)

> **PREDUVJET:** Provesti migraciju `users` kolekcije da koristi `uid` kao ID dokumenta, umjesto `username`. Ovo je kritično za stabilnost sustava.

*   **Kolekcija: `users`**
    *   **Dokument:** `users/{uid}`
    *   **Polja:**
        *   `ambassador: { status, promoCode, appliedAt, approvedAt, socialLinks, earnings: { currentBalance, totalEarned } }`
        *   `referredBy: { ambassadorUid, promoCode, redeemedAt }` (dodaje se korisniku koji iskoristi kod)

*   **Kolekcija: `promoCodes`**
    *   **Dokument:** `promoCodes/{code}`
    *   **Polja:** `ambassadorUid`, `benefit`, `isActive`, `usageCount`, `paidConversionsCount`, `totalRevenueGenerated`
    *   *Napomena: Format koda treba biti standardiziran, npr. `[USERNAME_PREFIX]24`. Primjer: `AMIR10` ili `TIKTOK24`. Generiranje treba osigurati jedinstvenost.*

*   **Kolekcija: `payouts`**
    *   **Dokument:** `payouts/{payoutId}`
    *   **Polja:** `ambassadorUid`, `amount`, `status`, `requestedAt`, `paidAt`, `method`, `transactionId`

### 4.2. API Rute (Fastify)

*   **Ambasador rute (zaštita: JWT, rola: `ambassador`):**
    *   `POST /api/ambassador/apply`: Prijava za program.
    *   `GET /api/ambassador/dashboard`: Dohvat podataka za dashboard.
    *   `POST /api/ambassador/payout-request`: Slanje zahtjeva za isplatu.
*   **Korisničke rute (zaštita: JWT):**
    *   `POST /api/promo-codes/redeem`: Iskorištavanje promotivnog koda.
*   **Administratorske rute (zaštita: JWT, rola: `admin`):**
    *   `GET /api/admin/ambassadors/applications`: Dohvat svih prijava.
    *   `POST /api/admin/ambassadors/approve`: Odobravanje ambasadora.
    *   `POST /api/admin/ambassadors/reject`: Odbijanje ambasadora.
    *   `GET /api/admin/payouts`: Dohvat svih zahtjeva za isplatu.
    *   `POST /api/admin/payouts/process`: Obrada isplate.

### 4.3. Integracije

*   **Stripe:**
    *   **Webhook Handler:** Proširiti postojeći handler da na `checkout.session.completed` događaj:
        1.  Dohvati korisnika iz baze.
        2.  Provjeri postoji li `referredBy` polje i je li unutar `ATTRIBUTION_WINDOW_DAYS`.
        3.  Ako da, unutar Firestore transakcije izračunaj proviziju i ažuriraj `earnings` ambasadora te statistiku na `promoCodes` dokumentu.
*   **Servis za e-mail (npr. Resend, Postmark):**
    *   **Predlošci:**
        1.  `ambassador-welcome`: E-mail dobrodošlice s kodom.
        2.  `ambassador-application-received`: Potvrda prijave.
        3.  `ambassador-application-rejected`: Odbijenica.
        4.  `user-trial-expiring`: Podsjetnik korisniku o isteku probnog perioda.
        5.  `payout-request-received`: Potvrda ambasadoru o zahtjevu za isplatu.
        6.  `payout-processed`: Obavijest ambasadoru o izvršenoj isplati.

### 4.4. Frontend (Next.js)

*   **Stranica za prijavu:** Forma unutar korisničkog profila.
*   **Ambasador Dashboard:** Nova zaštićena stranica/sekcija u profilu koja prikazuje:
    *   Promotivni kod.
    *   Ključne metrike: Broj klikova (opcionalno, ako se koriste posebni linkovi), broj iskorištenja koda, stopa konverzije, broj plaćenih konverzija.
    *   Zarada: Trenutno stanje, ukupna zarada, prag za isplatu. **Stopa konverzije** (`paidConversionsCount / usageCount * 100`).
    *   Povijest isplata.
    *   Link na Marketing Kit.
*   **Polje za unos koda:** Na stranici za registraciju i/ili na stranici s cijenama.
*   **Admin sučelje (interno):** Jednostavna stranica za pregled prijava i zahtjeva za isplatu.

### 4.5. Sigurnost i Prevencija Prevara

### 4.6. Admin Sučelje (Detaljna Specifikacija)

> Ovo sučelje je zaštićeno i dostupno samo korisnicima s `admin` rolom. Služi za potpuno upravljanje Ambasador programom.

*   **1. Glavna ploča (Dashboard):**
    *   **Pregled ključnih metrika (KPIs):**
        *   Ukupan broj aktivnih ambasadora.
        *   Broj novih prijava na čekanju.
        *   Broj zahtjeva za isplatu na čekanju.
        *   Ukupan prihod generiran kroz program (u zadnjih 30 dana / ukupno).
        *   Ukupno isplaćeno ambasadorima.
    *   **Brze akcije:** Linkovi na sekcije "Nove prijave" i "Zahtjevi za isplatu".

*   **2. Sekcija "Ambasadori":**
    *   **Tablica svih ambasadora** s mogućnošću pretrage i filtriranja (po statusu: `approved`, `pending`, `rejected`).
    *   **Stupci u tablici:** Ime ambasadora, email, status, datum prijave, broj konverzija, ukupna zarada.
    *   **Akcije:** Mogućnost klika na ambasadora za detaljan pregled.

*   **3. Detaljan pregled ambasadora (pojedinačna stranica):**
    *   **Osnovni podaci:** Ime, email, linkovi na društvene mreže (iz prijave).
    *   **Status i kod:** Trenutni status, promotivni kod, mogućnost deaktivacije koda.
    *   **Metrike uspješnosti:** Detaljna statistika (broj iskorištenja koda, broj plaćenih konverzija, stopa konverzije, ukupni prihod, ukupna zarada).
    *   **Povijest isplata:** Lista svih prošlih i trenutnih isplata za tog ambasadora.
    *   **Administrativne bilješke:** Polje za unos internih bilješki o ambasadoru.

*   **4. Sekcija "Prijave" (`pending`):**
    *   Fokusirani pregled samo korisnika sa statusom `pending`.
    *   Za svaku prijavu vidljivi su linkovi na društvene mreže.
    *   Gumbi **"Odobri"** i **"Odbij"** koji pokreću odgovarajuće API pozive.

*   **5. Sekcija "Isplate":**
    *   Tablica svih zahtjeva za isplatu, filtrirana po statusu (`pending`, `processed`, `rejected`).
    *   Za svaki zahtjev vidljivi su: ime ambasadora, zatraženi iznos, datum zahtjeva, metoda isplate (PayPal email).
    *   **Akcija "Obradi isplatu":** Otvara modal gdje administrator može unijeti ID transakcije (npr. iz PayPala) i označiti isplatu kao "Plaćeno".

---

*   **Firestore Security Rules:** Implementirati stroga pravila koja sprječavaju neovlaštene izmjene podataka (vidi prethodne prijedloge).
*   **Rate Limiting:** Ograničiti broj pokušaja iskorištavanja koda s jedne IP adrese.
*   **Praćenje:** Uvjeti korištenja moraju jasno definirati da je zabranjeno iskorištavanje vlastitog koda i druge vrste zloupotrebe, uz zadržavanje prava na poništenje provizije.
*   **Pravna usklađenost:** Uvjeti korištenja moraju sadržavati klauzulu koja obvezuje ambasadore da jasno i transparentno označe svoj promotivni sadržaj kao takav (npr. `#ad`, `#thesarapartner`), u skladu s lokalnim zakonima i pravilima platformi.

---

## 5. Hodogram Razvoja (Tehnički Plan)

### Faza 1: Temelji i Backend (MVP)

*   **[ ] Zadatak 1: Migracija podataka.**
    *   Migrirati `users` kolekciju da koristi `uid` kao ID dokumenta.
    *   **[ ] Pod-zadatak 1.1:** Ažurirati sve postojeće upite u kodu (npr. za `/u/[username]`) da koriste `where('username', '==', ...)`.
*   **[ ] Zadatak 2: Proširenje modela podataka.**
    *   Kreirati Firestore sheme za `users` (s `ambassador` i `referredBy`), `promoCodes` i `payouts`.
*   **[ ] Zadatak 3: Implementacija API ruta (Admin & Korisnik).**
    *   Implementirati rute za prijavu (`/apply`), odobrenje (`/approve`) i iskorištavanje koda (`/redeem`).
*   **[ ] Zadatak 4: Integracija sa Stripe Webhookom.**
    *   Proširiti webhook handler za praćenje konverzija i obračun provizije.
*   **[ ] Zadatak 5: Postavljanje sigurnosnih pravila.**
    *   Napisati i testirati Firestore Security Rules za nove kolekcije.

### Faza 2: Frontend i Korisničko Iskustvo

*   **[x] Zadatak 6: Kreiranje sučelja za prijavu.**
    *   Dizajnirati i implementirati formu za prijavu u Ambasador program.
*   **[x] Zadatak 7: Kreiranje Ambasador Dashboarda (v1).**
    *   Implementirati osnovni dashboard koji prikazuje kod, broj iskorištenja i zaradu.
    *   Implementirati funkcionalnost za zahtjev za isplatu.
*   **[x] Zadatak 8: Integracija e-mail servisa.**
    *   Postaviti osnovne e-mail notifikacije (dobrodošlica, potvrda prijave).
*   **[x] Zadatak 9: Kreiranje internog Admin sučelja (v1).**
    *   Jednostavna tablica za pregled prijava i zahtjeva za isplatu s gumbima za akciju.

### Faza 3: Lansiranje i Optimizacija

*   **[ ] Zadatak 10: Priprema za lansiranje.**
    *   Napisati Uvjete korištenja programa.
    *   **[ ] Pod-zadatak 10.1:** Pripremiti osnovne marketinške materijale (Marketing Kit).
*   **[ ] Zadatak 11: "Soft Launch" (Beta faza).**
    *   Pozvati 5-10 odabranih kreatora da testiraju program.
    *   Prikupljanje povratnih informacija i ispravljanje bugova.
*   **[ ] Zadatak 12: Javno lansiranje.**
    *   Objaviti program na platformi i društvenim mrežama.
*   **[ ] Zadatak 13: Iteracija i poboljšanja.**
    *   Na temelju metrika i povratnih informacija, planirati buduća poboljšanja (npr. naprednija analitika na dashboardu, Stripe Connect za automatske isplate).

---

## 6. Dodatni Prijedlozi i Razmatranja

*   **Gamifikacija:** Razmisliti o uvođenju razina (tiers) za ambasadore. Npr., nakon 10 plaćenih konverzija, ambasador prelazi na "Silver" razinu i dobiva veći postotak provizije (`[COMMISSION_RATE_SILVER_PERCENT: 30]`). To potiče dugoročni angažman.
*   **Posebni linkovi:** Uz promotivne kodove, razmisliti o generiranju jedinstvenih affiliate linkova (npr. `thesara.space/?ref=kreator123`). To olakšava praćenje i dijeljenje.
*   **Komunikacijski kanal:** Otvoriti privatni Discord kanal ili Slack grupu isključivo za odobrene ambasadore. To je odlično mjesto za direktnu komunikaciju, podršku i dijeljenje savjeta.

---
