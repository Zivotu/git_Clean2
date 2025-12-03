# Analiza Problema: Session Management, Profile i Gold Pretplata

**Datum:** 2025-12-03  
**Prioritet:** 🔴 KRITIČNO

---

## 🎯 Pregled Problema

Korisnik je prijavio 5 glavnih problema nakon registracije novog korisnika:

1. **Session Confusion** - Admin slika se pojavljuje kod novog korisnika
2. **Profile Picture Upload** - CORS greške pri uploadu slike
3. **Public Name** - Ne postavlja se automatski iz korisničkog imena
4. **Gold Pretplata** - Ne prepoznaje se za nove korisnike
5. **404 Greške** - Nekoliko endpointa vraća 404

---

## 🔍 Problem 1: Session Confusion - Admin Slika Kod Novog Korisnika

### Simptomi
- Korisnik je imao otvoren svoj admin profil u jednom pregledniku
- Registrirao se kao novi korisnik u drugom pregledniku
- Admin slika se pojavila kod novog korisnika

### Uzrok
**Lokacija:** `apps/web/lib/auth.tsx` (linija 22-27) i `apps/web/lib/ensureUserDoc.ts` (linija 40-51)

```typescript
// auth.tsx - In-memory persistence za iframes
const inIframe = typeof window !== 'undefined' && window.self !== window.top;
if (inIframe) {
  void setPersistence(auth, inMemoryPersistence).catch(() => { });
}

// ensureUserDoc.ts - Merge mode omogućava miješanje podataka
await setDoc(
  ref,
  {
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
    username: user.email?.split('@')[0] ?? null,
    updatedAt: serverTimestamp(),
  },
  { merge: true }  // ⚠️ PROBLEM: merge omogućava miješanje podataka
);
```

### Analiza
1. **In-memory persistence** u iframe okruženju može uzrokovati da se session ne čuva pravilno
2. **Merge mode** u `ensureUserDoc` omogućava da se podaci iz različitih sessiona miješaju
3. Nema provjere da li je korisnik već prijavljen u drugom pregledniku
4. `photoURL` se preuzima iz Firebase Auth objekta koji može biti "zagađen" prethodnim sessionom

### Rješenje
```typescript
// 1. Dodati session isolation check
// 2. Koristiti merge: false za nove korisnike
// 3. Dodati explicit session cleanup prije login-a
// 4. Provjeriti da li je photoURL validan za trenutnog korisnika

if (!snap.exists()) {
  // Novi korisnik - NE koristiti merge
  await setDoc(ref, {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
    username: user.email?.split('@')[0] ?? null,
    createdAt: serverTimestamp(),
  }, { merge: false }); // ✅ Sprječava miješanje
} else {
  // Postojeći korisnik - koristiti merge samo za specifična polja
  const updates: any = {
    email: user.email ?? null,
    updatedAt: serverTimestamp(),
  };
  
  // NE ažurirati photoURL i displayName automatski
  // Samo ako su eksplicitno promijenjeni
  
  await setDoc(ref, updates, { merge: true });
}
```

### Prioritet
🔴 **KRITIČNO** - Može uzrokovati curenje podataka između korisnika

---

## 🔍 Problem 2: Profile Picture Upload - CORS Greške

### Simptomi
```
Access to XMLHttpRequest at 'https://firebasestorage.googleapis.com/v0/b/createx-e0ccc.appspot.com/o?name=public-avatars%2Fq2ImRTEcOgU9mUNpLDkMqAF97Qe2' 
from origin 'https://thesara.space' has been blocked by CORS policy: 
Response to preflight request doesn't pass access control check: It does not have HTTP ok status.
```

### Uzrok
**Lokacija:** `apps/web/app/profile/page.tsx` (linija 671-674)

```typescript
if (publicPhotoFile && storage) {
  const storageRef = ref(storage, `public-avatars/${user.uid}`);
  await uploadBytes(storageRef, publicPhotoFile);  // ⚠️ CORS blokira
  photoURL = await getDownloadURL(storageRef);
}
```

### Analiza
1. Firebase Storage bucket (`createx-e0ccc.appspot.com`) nema konfigurirane CORS headere za `thesara.space`
2. Upload ide direktno sa klijenta na Firebase Storage
3. Preflight OPTIONS zahtjev ne prolazi

### Rješenje

**Opcija A: Konfigurirati Firebase Storage CORS (Preporučeno)**

Kreirati `cors.json`:
```json
[
  {
    "origin": ["https://thesara.space", "https://www.thesara.space"],
    "method": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type", "Authorization"]
  }
]
```

Primijeniti:
```bash
gsutil cors set cors.json gs://createx-e0ccc.appspot.com
```

**Opcija B: Server-side Upload preko API-ja**

Kreirati novi endpoint `/api/me/upload-avatar` koji prima sliku i uploaduje je server-side.

### Prioritet
🔴 **VISOK** - Korisnici ne mogu promijeniti profilnu sliku

---

## 🔍 Problem 3: Public Name Ne Postavlja Se Automatski

### Simptomi
- Korisnik se registrira sa korisničkim imenom
- U profilu public name nije postavljen
- Mora ići u postavke profila i ručno postaviti public name

### Uzrok
**Lokacija:** `apps/api/src/routes/me.ts` (linija 529-551)

```typescript
// Automatski generira handle, ali NE postavlja displayName u creators kolekciji
try {
  if (!data?.handle) {
    const handle = await generateUniqueHandle(displayName ?? data?.displayName)
    
    await upsertCreator({
      id: uid,
      handle,
      // ⚠️ NEDOSTAJE: displayName
    })
    
    await userRef.set({ handle }, { merge: true })
    generatedHandle = handle
  }
} catch (handleErr) {
  req.log.error({ err: handleErr, uid }, 'auto_handle_generation_failed')
}
```

### Analiza
1. `welcome-email` endpoint kreira handle ali ne postavlja `displayName` u `creators` kolekciji
2. `ensureUserDoc` postavlja `displayName` u `users` kolekciji ali ne u `creators`
3. Frontend očekuje `displayName` iz `creators` kolekcije za javni profil

### Rješenje
```typescript
// U welcome-email endpointu (me.ts, linija 537-540)
await upsertCreator({
  id: uid,
  handle,
  displayName: displayName ?? data?.displayName ?? handle, // ✅ Dodati displayName
  photoURL: data?.photoURL ?? null, // ✅ Dodati photoURL
})
```

### Prioritet
🟡 **SREDNJI** - UX problem, ali ne blokira funkcionalnost

---

## 🔍 Problem 4: Gold Pretplata Se Ne Prepoznaje

### Simptomi
- Novi korisnici bi trebali dobiti Gold pretplatu (Early Access promocija)
- Gold se ne prikazuje u profilu

### Uzrok
**Lokacija:** `apps/api/src/lib/earlyAccess.ts` (linija 62-135)

```typescript
export async function ensureEarlyAccessForUser({
  uid,
  entitlements: initialEntitlements,
  now: nowInput,
}: EnsureOptions): Promise<EnsureEarlyAccessResult> {
  const campaign = await readEarlyAccessSettings();
  if (!campaign || !campaign.isActive) {  // ⚠️ Ako campaign nije aktivan, ne dodaje entitlements
    const snapshot = await db.collection('users').doc(uid).get();
    const existing = snapshot.exists ? normalizeState((snapshot.data() as any)?.earlyAccess) : null;
    return { state: existing, entitlementsChanged: false, campaign };
  }
  // ...
}
```

### Analiza
1. Early Access campaign mora biti aktivan u bazi (`earlyAccessSettings` kolekcija)
2. Ako campaign ne postoji ili nije aktivan, novi korisnici ne dobivaju Gold
3. Funkcija se poziva samo u `/me/entitlements` endpointu
4. Nema automatskog poziva pri registraciji

### Provjera
Potrebno je provjeriti:
```javascript
// U Firestore konzoli
db.collection('earlyAccessSettings').get()
// Provjeriti da li postoji dokument sa:
// - isActive: true
// - perUserDurationDays: 30 (ili durationDays)
```

### Rješenje
```typescript
// 1. Osigurati da campaign postoji i aktivan je
// 2. Pozvati ensureEarlyAccessForUser u welcome-email endpointu

// U me.ts, nakon kreiranja handle-a (linija 551)
try {
  await ensureEarlyAccessForUser({ uid });
  req.log.info({ uid }, 'early_access_entitlements_created_for_new_user');
} catch (earlyAccessErr) {
  req.log.error({ err: earlyAccessErr, uid }, 'early_access_creation_failed');
}
```

### Prioritet
🔴 **KRITIČNO** - Obećana promocija ne radi

---

## 🔍 Problem 5: 404 Greške

### 5a. `/api/me/visit` - 404

**Uzrok:** Endpoint je registriran samo kao `/me/visit`, ne i kao `/api/me/visit`

**Lokacija:** `apps/api/src/routes/me.ts` (linija 576-604)

```typescript
app.post(
  '/me/visit',  // ⚠️ Nema /api prefix
  { preHandler: requireRole(['user']) },
  async (req: FastifyRequest, reply: FastifyReply) => {
    // ...
  },
)
```

**Rješenje:**
```typescript
// Dodati registraciju sa /api prefixom kao i drugi endpointi
for (const prefix of ['', '/api']) {
  app.post(
    `${prefix}/me/visit`,
    { preHandler: requireRole('user') },
    visitHandler,
  )
}
```

**Prioritet:** 🟡 SREDNJI

---

### 5b. `/pro/checkout/gold` - 404

**Uzrok:** Ne postoji Next.js stranica na ovoj lokaciji

**Lokacija:** `apps/web/app/pro/checkout/` - samo `page.tsx` postoji, ne i `gold/page.tsx`

**Analiza:**
- `apps/web/app/profile/page.tsx` (linija 189, 1285) linkuje na `/pro/checkout/gold`
- Ali ta ruta ne postoji
- Postoji samo `/pro/checkout/page.tsx` koja prima `tier` query parametar

**Rješenje:**

**Opcija A:** Kreirati `apps/web/app/pro/checkout/gold/page.tsx`
```typescript
'use client';
import { redirect } from 'next/navigation';

export default function GoldCheckoutPage() {
  redirect('/pro/checkout?tier=gold');
}
```

**Opcija B:** Promijeniti linkove u profile page-u
```typescript
// Umjesto:
upgradeHref: '/pro/checkout/gold',

// Koristiti:
upgradeHref: '/pro/checkout?tier=gold',
```

**Prioritet:** 🔴 VISOK

---

### 5c. `/grid.svg` - 404

**Uzrok:** Fajl ne postoji u `apps/web/public/`

**Lokacija:** 
- `apps/web/app/u/[username]/UserProfileClient.tsx` (linija 318)
- `apps/web/app/profile/page.tsx` (linija 865)

```tsx
<div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20" />
```

**Rješenje:** Kreirati `apps/web/public/grid.svg`

```svg
<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" stroke-width="1" opacity="0.1"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#grid)" />
</svg>
```

**Prioritet:** 🟢 NIZAK (samo vizualni element)

---

## 📋 Akcijski Plan

### Faza 1: Kritični Problemi (Odmah)
1. ✅ **Popraviti session confusion** - Promijeniti `ensureUserDoc` merge logiku
2. ✅ **Dodati `/api/me/visit` endpoint**
3. ✅ **Kreirati `/pro/checkout/gold` redirect**
4. ✅ **Provjeriti i aktivirati Early Access campaign**
5. ✅ **Dodati automatsko postavljanje public name**

### Faza 2: Visoki Prioritet (Danas)
6. ✅ **Riješiti CORS problem** - Konfigurirati Firebase Storage ili dodati server-side upload
7. ✅ **Testirati Gold pretplatu** za nove korisnike

### Faza 3: Srednji/Nizak Prioritet (Uskoro)
8. ✅ **Dodati grid.svg**
9. ✅ **Dodati session isolation checks**
10. ✅ **Dodati logging za debugging session problema**

---

## 🧪 Testiranje

### Test Scenario 1: Novi Korisnik
1. Otvoriti incognito prozor
2. Registrirati se kao novi korisnik
3. Provjeriti:
   - ✅ Nema admin slike
   - ✅ Public name je postavljen
   - ✅ Gold pretplata je aktivna
   - ✅ Može uploadati profilnu sliku

### Test Scenario 2: Dva Preglednika
1. Prijaviti se kao admin u Chrome
2. Prijaviti se kao novi korisnik u Firefox
3. Provjeriti:
   - ✅ Sessioni su potpuno odvojeni
   - ✅ Nema miješanja podataka

### Test Scenario 3: Profile Update
1. Prijaviti se kao korisnik
2. Promijeniti profilnu sliku
3. Provjeriti:
   - ✅ Nema CORS greški
   - ✅ Slika se uspješno uploaduje
   - ✅ Slika se prikazuje u profilu

---

## 📊 Zaključak

Identificirano je **5 glavnih problema** koji su uzrokovani:
1. **Session management** - Nedostatak izolacije između sessiona
2. **Firebase Storage CORS** - Neispravna konfiguracija
3. **Automatizacija** - Nedostatak automatskog postavljanja podataka pri registraciji
4. **Early Access** - Možda neaktivan ili neispravno konfiguriran campaign
5. **Routing** - Nedostajuće rute i resursi

Svi problemi su **rješivi** i većina zahtijeva **male izmjene koda**.

**Procjena vremena popravka:** 2-3 sata
