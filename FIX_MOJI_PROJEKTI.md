# Fix: Aplikacije ne prikazuju se u "Moji projekti"

## Problem

Kada Luka Lukić (ili bilo koji ne-admin korisnik) objavi aplikaciju:
- Aplikacija se ne pojavljuje u "Moji projekti" 
- Aplikacija se ne pojavljuje ni nakon što admin odobri
- Kada Amir (admin) objavi aplikaciju, sve radi normalno

## Uzrok

Pronađena je **nekonzistentnost** između kako se podaci spremaju i kako se čitaju:

### Što se spremalo PRIJE popravka:
1. **U KV storage**: `authorUid` (string)
2. **U Firestore**: samo `authorUid` (string) - **NEDOSTAJAO je `author` objekt!**

### Što kod očekuje:
1. **Filter u `/listings`** (linija 135): `a.author?.uid === ownerId`
2. **Fallback**: `(a as any).ownerUid === ownerId` - ali polje se zove `authorUid`, ne `ownerUid`!

### Rezultat:
- Filter ne pronalazi aplikacije jer:
  - `author.uid` ne postoji (samo `authorUid` string)
  - `ownerUid` ne postoji (polje se zove `authorUid`)
- Aplikacije ostaju "nevidljive" za korisnika

## Rješenje

### 1. Popravljen `ensureListingRecord` (publish.ts i publish-bundle.ts)

**PRIJE:**
```typescript
async function ensureListingRecord(opts: {
  listingId: string | number;
  title?: string | null;
  uid?: string | null;  // ❌ Samo UID string
  buildId: string;
})
```

**POSLIJE:**
```typescript
async function ensureListingRecord(opts: {
  listingId: string | number;
  title?: string | null;
  author?: { uid: string; name?: string; photo?: string; handle?: string } | null;  // ✅ Cijeli author objekt
  buildId: string;
})
```

**Što se sada sprema u Firestore:**
```typescript
if (author?.uid) {
  firestorePayload.author = author;  // ✅ Cijeli objekt
  firestorePayload.authorUid = author.uid;  // ✅ Za backward compatibility
}
```

### 2. Poboljšan filter u `listings.ts`

**PRIJE:**
```typescript
items = items.filter(
  (a) => a.author?.uid === ownerId || (a as any).ownerUid === ownerId,
);
```

**POSLIJE:**
```typescript
items = items.filter(
  (a) => a.author?.uid === ownerId || 
         (a as any).ownerUid === ownerId || 
         (a as any).authorUid === ownerId,  // ✅ Dodana podrška za authorUid
);
```

### 3. Migracija postojećih aplikacija

Kreirana je skripta `scripts/migrate-author-objects.ts` koja:
- Pronalazi sve aplikacije koje imaju samo `authorUid`
- Dohvaća podatke o korisniku iz Firestore `users` kolekcije
- Kreira `author` objekt sa `uid`, `name`, `photo`, `handle`
- Sprema ažurirane aplikacije natrag u Firestore

**Pokretanje migracije:**
```bash
cd apps/api
npx tsx ../../scripts/migrate-author-objects.ts
```

## Testiranje

### 1. Testiraj novu objavu (Luka)
1. Luka se prijavi
2. Objavi novu aplikaciju
3. Provjeri "Moji projekti" - aplikacija bi se trebala pojaviti sa statusom "pending_review"

### 2. Testiraj admin odobrenje
1. Admin odobri Lukinu aplikaciju
2. Luka osvježi "Moji projekti"
3. Aplikacija bi se trebala pojaviti sa statusom "published"

### 3. Testiraj migraciju
1. Pokreni migracijsku skriptu
2. Luka osvježi "Moji projekti"
3. Sve stare aplikacije bi se trebale pojaviti

## Dugoročne prednosti

1. **Konzistentnost**: Svi podaci se spremaju na isti način
2. **Bogatiji podaci**: `author` objekt sadrži više informacija (name, photo, handle)
3. **Backward compatibility**: `authorUid` se i dalje sprema za stare dijelove koda
4. **Otpornost**: Filter provjerava sve moguće varijante (`author.uid`, `ownerUid`, `authorUid`)
5. **Lakše debugiranje**: Jasno je tko je vlasnik aplikacije

## Izmijenjene datoteke

- ✅ `apps/api/src/routes/publish.ts`
- ✅ `apps/api/src/routes/publish-bundle.ts`
- ✅ `apps/api/src/routes/listings.ts`
- ✅ `scripts/migrate-author-objects.ts` (nova)

## Napomene

- Rješenje je **backward compatible** - stare aplikacije će i dalje raditi
- Filter sada provjerava **sve moguće varijante** vlasništva
- Migracija je **opciona** ali preporučena za postojeće aplikacije
- Novi kod **automatski** postavlja `author` objekt za sve nove objave
