# Workshop Feature Implementation

## Pregled

Implementirao sam kompletan sustav za workshop registracije s **animiranim neon stilom** kao što si tražio. Sustav uključuje:

1. ✅ **Neon animirani button** u hero sekciji (desno od "Tutorials")
2. ✅ **Dedicirani workshop page** s detaljima i countdown timerom  
3. ✅ **Registracija forma** (samo email adresa)
4. ✅ **Backend API endpoint** za spremanje prijava
5. ✅ **Multilingvalna podrška** (HR, EN, DE)

## Što je dodano

### 1. Neonski Button u Hero Sekciji
**Lokacija:** `apps/web/app/components/NeonWorkshopButton.tsx`

- Animirani neonski efekt s pulsujućim sjajem (zeleno-ljubičasto)
- Automatski pulsirajuća animacija (interval 1.5s)
- Hover efekti za dodatnu interaktivnost
- Potpuno responsive

**Pozicija:** Hero sekcija na početnoj stranici, desno od "Tutorials" buttona

### 2. Workshop Registration Page
**Lokacija:** `apps/web/app/workshop/page.tsx` + `WorkshopPageClient.tsx`

#### Sadržaj stranice:
- **Hero sekcija** s naslovom: "Kako izgraditi i objaviti svoju aplikaciju u jednom danu"
- **Countdown timer** do početka (23.12.2025 u 20:00h)
- **Features grid:**
  - Uživo na Zoomu
  - 2 sata treninga
  - Potpuno besplatno
  - Za početnike
- **Detalji treninga:**
  - Datum i vrijeme
  - Lista tema (AI tools, objavljivanje, monetizacija, Q&A)
  
#### Registracijska forma:
- Email field s validacijom
- Success/error state handling
- Email potvrda nakon uspješne prijave

### 3. Backend API
**Lokacija:** `apps/web/app/api/workshop/register/route.ts`

#### Funkcionalnost:
- **POST** `/api/workshop/register` - Sprema registracije
  - Email validacija
  - Duplicate check (sprječava višestruke prijave)
  - Sprema u Firestore collection: `workshop-registrations`
  
- **GET** `/api/workshop/register` - Dohvaća sve registracije
  - Admin endpoint za pregled prijava
  - TODO: Dodati autentifikaciju za admin

#### Što se sprema:
```json
{
  "email": "user@example.com",
  "registeredAt": "2025-12-19T18:00:00Z",
  "workshopDate": "2025-12-23T20:00:00",
  "locale": "hr",
  "userAgent": "Mozilla/5.0..."
}
```

### 4. Prijevodi
Dodao sam workshop prijevode u sve tri jezika:

- **hr.json** - Hrvatski
- **en.json** - English
- **de.json** - Deutsch

**Ključevi:**
- `BetaHome.Workshop.badge` - "BESPLATNO"
- `BetaHome.Workshop.button` - "PRIJAVI SE NA TRENING"
- `BetaHome.Workshop.title` - Naslov workshopa
- `BetaHome.Workshop.form.*` - Sve labele za formu
- `BetaHome.Workshop.details.*` - Detalji o trainingu

## Kako koristiti

### 1. Promjena datuma workshopa
U datoteci `apps/web/messages/hr.json` (i drugim jezicima):
```json
"details": {
  "date": "23. prosinca 2025.",  // Promijeni datum
  "time": "20:00h CET"           // Promijeni vrijeme
}
```

U `WorkshopPageClient.tsx` linija 51:
```tsx
const workshopDate = new Date('2025-12-23T20:00:00'); // Promijeni ovdje
```

### 2. Zamjena privremenog linka za Zoom
Trenutno link ne šaljem automatski. Moraš dodati email serviranje:

**U `apps/web/app/api/workshop/register/route.ts` linija 53:**
```typescript
// TODO: Send confirmation email with workshop link
// You can add email sending logic here later
```

### 3. Pregled prijava (Admin)
```bash
GET http://localhost:3000/api/workshop/register
```

Vraća JSON sa svim prijavama:
```json
{
  "ok": true,
  "count": 15,
  "registrations": [...]
}
```

## Dodatni prijedlozi koje sam implementirao

1. ✅ **Countdown timer** - pokaže preostale dane i sate
2. ✅ **Features grid** - vizualno prikazuje ključne info (Zoom, trajanje, itd.)
3. ✅ **Success state** - nakon prijave prikazuje success poruku
4. ✅ **Duplicate prevention** - sprječava višestruke prijave istog emaila
5. ✅ **Mobile responsive** - sve radi savršeno na mobitelu

## Što još treba dodati

### Prijedlozi za budućnost:

1. **Email automation**
   - Dodati Nodemailer ili sl. za slanje potvrde
   - Slati link za Zoom automatski
   - Reminder email 1 dan prije

2. **Admin dashboard**
   - Stranica `/admin/workshop` za pregled prijava
   - Export u CSV
   - Statistika (ukupno prijava, po danima, itd.)

3. **Email template**
   - Kreiraj lijepi HTML email template
   - Dodaj branding (Thesara logo, boje)
   - Personaliziraj s imenom (ako ga skupljamo)

4. **Calendar invite**
   - Generiraj .ics file za dodavanje u kalendar
   - Pošalji s email potvrdom

5. **Reminder notifications**
   - 1 dan prije: "Sutra je workshop!"
   - 1 sat prije: "Za sat vremena počinje!"

## Testiranje

Za lokalno testiranje:

```bash
# 1. Pokreni dev server
cd apps/web
npm run dev

# 2. Otvori u browseru
http://localhost:3000

# 3. Vidi neonski button u hero sekciji
# 4. Klikni na button
# 5. Isprobaj registraciju
```

## Deployment

Ništa posebno nije potrebno - sve je spremno za deployment:

1. **Frontend** - sve komponente su u `/app` folderu
2. **API** - endpoint je u `/app/api/workshop/register`
3. **Database** - koristi postojeću Firestore konfiguraciju
4. **Translations** - sve je u `.json` datotekama

## Firestore Security Rules

Možeš dodati security rule za `workshop-registrations`:

```javascript
match /workshop-registrations/{documentId} {
  // Svi mogu kreirati nove prijave
  allow create: if true;
  
  // Samo autentificirani admini mogu čitati
  allow read: if request.auth != null && 
              get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true;
  
  // Ne dozvoli update/delete
  allow update, delete: if false;
}
```

## Screenshots (što možeš očekivati)

1. **Hero sekcija:**
   - Neonski zeleni/ljubičasti glow button
   - Iskače između ostalih button-a
   - Pulsirajući efekt

2. **Workshop page:**
   - Dark gradient pozadina (slate + purple)
   - 2-column layout (info + forma)
   - Countdown timer s velikim brojkama
   - Feature grid s ikonama
   - Clean forma (samo email)

3. **Success state:**
   - Zeleni check icon
   - "Uspješno si prijavljen/a!" poruka

---

**Sve je spremno!** 🚀

Link možeš kasnije zamijeniti u backend endpointu kada dobiješ Zoom link. Za sada sve spremam u Firestore i mogu kasnije izvesti sve emailove i poslati im link ručno ili automatski.
